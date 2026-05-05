import * as vscode from "vscode";
import type {
	LanguageModelChatInformation,
	LanguageModelChatProvider,
	LanguageModelChatRequestMessage,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart,
} from "vscode";
import {
	type ModelConfig,
	type VsCodeMessage,
	sendChatRequestWithProvider,
	fetchModelsFromAPI,
	estimateUnknownTokens,
} from "@all-in-copilot/sdk";
import {
	LM_PROVIDER_ID,
	MANAGE_COMMAND_ID,
	normalizeApiMode,
	resolveChatUrl,
	toSdkProviderConfig,
} from "./config";
import { ProviderManager } from "./providerManager";
import { runManageFlow } from "./manageFlow";
import {
	composeChatModelId,
	parseChatModelId,
	type RegisterableModel,
	type UserModel,
	type UserProvider,
} from "./types";

class ExtensionProvider implements LanguageModelChatProvider {
	private readonly statusBar: vscode.StatusBarItem;
	private readonly providerManager: ProviderManager;
	private readonly modelLookup = new Map<string, RegisterableModel>();
	private readonly modelCaches = new Map<string, { models: ModelConfig[] | null; lastFetch: number }>();
	private readonly modelInfoChangedEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeLanguageModelChatInformation = this.modelInfoChangedEmitter.event;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.providerManager = new ProviderManager(context);
		this.statusBar = vscode.window.createStatusBarItem(LM_PROVIDER_ID, vscode.StatusBarAlignment.Right, 100);
		this.statusBar.command = MANAGE_COMMAND_ID;
		this.refreshStatusBar();
		this.statusBar.show();
	}

	dispose(): void {
		this.statusBar.dispose();
		this.modelLookup.clear();
		this.modelCaches.clear();
		this.modelInfoChangedEmitter.dispose();
	}

	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: vscode.CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		const providers = this.providerManager.getProviders();
		if (providers.length === 0) {
			if (!options.silent) {
				void vscode.window
					.showInformationMessage("No LLM provider configured. Open manager now?", "Open Manager")
					.then((selection) => {
						if (selection === "Open Manager") {
							void vscode.commands.executeCommand(MANAGE_COMMAND_ID);
						}
					});
			}
			return [];
		}

		this.modelLookup.clear();
		const models: Array<LanguageModelChatInformation & { isUserSelectable: true }> = [];

		for (const provider of providers) {
			const providerModels = await this.getProviderModels(provider, options.silent);
			for (const model of providerModels) {
				const chatModelId = composeChatModelId(provider.id, model.id);
				const registerable: RegisterableModel = {
					chatModelId,
					rawModelId: model.id,
					provider,
					model,
				};
				this.modelLookup.set(chatModelId, registerable);
				models.push({
					id: chatModelId,
					name: model.name,
					family: provider.apiMode,
					version: "1.0.0",
					maxInputTokens: model.maxInputTokens,
					maxOutputTokens: model.maxOutputTokens,
					detail: provider.name,
					tooltip: `${model.name} via ${provider.name}`,
					capabilities: {
						imageInput: model.supportsVision,
						toolCalling: model.supportsTools,
					},
					isUserSelectable: true,
				});
			}
		}

		return models as LanguageModelChatInformation[];
	}

	async provideTokenCount(
		_model: LanguageModelChatInformation,
		text: string | LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken
	): Promise<number> {
		return estimateUnknownTokens(text);
	}

	async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: readonly LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		const resolvedModel = this.resolveRegisterableModel(model.id);
		if (!resolvedModel) {
			throw new Error(`Unknown model id: ${model.id}`);
		}

		const apiKey = await this.ensureProviderApiKey(resolvedModel.provider, false);
		if (!apiKey) {
			throw new Error(`API key not configured for ${resolvedModel.provider.name}`);
		}

		const abortController = new AbortController();
		token.onCancellationRequested(() => abortController.abort());

		await sendChatRequestWithProvider(
			{
				baseUrl: resolveChatUrl(resolvedModel.provider.baseUrl, resolvedModel.provider.apiMode),
				apiKey,
				apiMode: normalizeApiMode(resolvedModel.provider.apiMode),
				headers: resolvedModel.provider.headers,
			},
			resolvedModel.provider.name,
			resolvedModel.rawModelId,
			messages as unknown as readonly VsCodeMessage[],
			options.tools,
			resolvedModel.model.maxOutputTokens,
			{
				onText: (text: string) => {
					progress.report(new vscode.LanguageModelTextPart(text));
				},
				onToolCall: (callId: string, name: string, args: object) => {
					progress.report(new vscode.LanguageModelToolCallPart(callId, name, args));
				},
			},
			abortController.signal
		);
	}

	clearModelCache(): void {
		this.modelCaches.clear();
		this.modelLookup.clear();
		this.refreshStatusBar();
		this.modelInfoChangedEmitter.fire();
	}

	private async getProviderModels(provider: UserProvider, silent: boolean): Promise<UserModel[]> {
		const manualModels = this.providerManager.getManualModels(provider.id);
		const all = new Map<string, UserModel>();

		const apiKey = await this.ensureProviderApiKey(provider, silent);
		if (apiKey) {
			try {
				const sdkProvider = toSdkProviderConfig(provider);
				const cache = this.modelCaches.get(provider.id) ?? { models: null, lastFetch: 0 };
				const fetched = await fetchModelsFromAPI(provider.baseUrl, apiKey, sdkProvider, cache);
				this.modelCaches.set(provider.id, cache);

				for (const model of fetched) {
					all.set(model.id, {
						...model,
						providerId: provider.id,
						source: "fetched",
					});
				}
			} catch (error) {
				console.warn(`[${provider.name}] failed to fetch models:`, error);
			}
		}

		for (const model of manualModels) {
			all.set(model.id, model);
		}

		return [...all.values()];
	}

	private async ensureProviderApiKey(provider: UserProvider, silent: boolean): Promise<string | undefined> {
		let apiKey = await this.providerManager.getProviderApiKey(provider.id);
		if (apiKey || silent) {
			return apiKey;
		}

		apiKey = await vscode.window.showInputBox({
			prompt: `Enter API key for ${provider.name}`,
			password: true,
			ignoreFocusOut: true,
		});

		if (!apiKey) {
			return undefined;
		}

		await this.providerManager.updateProvider(provider.id, { apiKey });
		return apiKey;
	}

	private resolveRegisterableModel(chatModelId: string): RegisterableModel | undefined {
		const known = this.modelLookup.get(chatModelId);
		if (known) {
			return known;
		}

		const parsed = parseChatModelId(chatModelId);
		if (!parsed) {
			return undefined;
		}

		const provider = this.providerManager.getProviderById(parsed.providerId);
		if (!provider) {
			return undefined;
		}

		const manualModel = this.providerManager.getManualModels(provider.id).find((model) => model.id === parsed.rawModelId);
		if (!manualModel) {
			return undefined;
		}

		return {
			chatModelId,
			rawModelId: parsed.rawModelId,
			provider,
			model: manualModel,
		};
	}

	private refreshStatusBar(): void {
		const activeProvider = this.providerManager.getActiveProvider();
		this.statusBar.text = activeProvider ? `$(ai) ${activeProvider.name}` : "$(ai) Add Provider";
	}
}

export function activate(context: vscode.ExtensionContext) {
	const provider = new ExtensionProvider(context);
	const registration = vscode.lm.registerLanguageModelChatProvider(LM_PROVIDER_ID, provider);
	context.subscriptions.push(registration);
	context.subscriptions.push({
		dispose: () => provider.dispose(),
	});

	const manageCommand = vscode.commands.registerCommand(MANAGE_COMMAND_ID, async () => {
		await runManageFlow(new ProviderManager(context), async () => {
			provider.clearModelCache();
		});
	});
	context.subscriptions.push(manageCommand);

	console.log("[dynamic-provider] Extension activated");
}

export function deactivate() {
	console.log("[dynamic-provider] Extension deactivated");
}
