/**
 * VSCode Extension Entry Point
 * ============================
 * This file uses @all-in-copilot/sdk helper functions for all provider logic.
 * You only need to provide configuration values in config.ts!
 */

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
	estimateTokens,
} from "@all-in-copilot/sdk";
import { PROVIDER_CONFIG, FALLBACK_MODELS, filterModels } from "./config";

/**
 * Extension Provider - Uses SDK helpers for all heavy lifting
 */
class ExtensionProvider implements LanguageModelChatProvider {
	private secrets: vscode.SecretStorage;
	private statusBar: vscode.StatusBarItem;
	private modelCache = { models: null as ModelConfig[] | null, lastFetch: 0 };
	private disposables: vscode.Disposable[] = [];

	constructor(secrets: vscode.SecretStorage) {
		this.secrets = secrets;

		// Create status bar
		this.statusBar = vscode.window.createStatusBarItem(PROVIDER_CONFIG.id, vscode.StatusBarAlignment.Right, 100);
		this.statusBar.text = `$(ai) ${PROVIDER_CONFIG.name}`;
		this.statusBar.command = `${PROVIDER_CONFIG.id}.manage`;
		this.statusBar.show();
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		this.statusBar.dispose();
		this.disposables.forEach((d) => d.dispose());
		this.disposables = [];
	}

	/**
	 * Provide available models to VS Code
	 */
	async provideLanguageModelChatInformation(
		options: { silent: boolean },
		_token: vscode.CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		const apiKey = await this.ensureApiKey(options.silent);
		if (!apiKey && options.silent) {
			return [];
		}

		let models: ModelConfig[];

		if (PROVIDER_CONFIG.dynamicModels && apiKey) {
			try {
				models = await fetchModelsFromAPI(PROVIDER_CONFIG.baseUrl, apiKey, PROVIDER_CONFIG, this.modelCache);
			} catch (error) {
				console.warn(`[${PROVIDER_CONFIG.name}] Failed to fetch models:`, error);
				models = FALLBACK_MODELS;
			}
		} else {
			models = FALLBACK_MODELS;
		}

		models = filterModels(models);

		return models.map((model) => ({
			id: model.id,
			name: model.name,
			family: PROVIDER_CONFIG.family,
			version: "1.0.0",
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			capabilities: {
				imageInput: model.supportsVision,
				toolCalling: model.supportsTools,
			},
		}));
	}

	/**
	 * Estimate token count
	 */
	async provideTokenCount(
		_model: LanguageModelChatInformation,
		text: string | LanguageModelChatRequestMessage,
		_token: vscode.CancellationToken
	): Promise<number> {
		if (typeof text === "string") {
			return estimateTokens(text);
		}
		return estimateTokens(JSON.stringify(text));
	}

	/**
	 * Handle chat response with streaming
	 */
	async provideLanguageModelChatResponse(
		model: LanguageModelChatInformation,
		messages: readonly LanguageModelChatRequestMessage[],
		options: ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		const apiKey = await this.ensureApiKey(false);
		if (!apiKey) {
			throw new Error("API key not configured");
		}

		// Determine which API format to use
		const apiMode =
			PROVIDER_CONFIG.apiMode === "gemini" || PROVIDER_CONFIG.apiMode === "ollama" ? "openai" : PROVIDER_CONFIG.apiMode;

		// Use SDK's sendChatRequestWithProvider for complete request/response handling
		await sendChatRequestWithProvider(
			{
				baseUrl: PROVIDER_CONFIG.baseUrl,
				apiKey,
				apiMode,
				headers: PROVIDER_CONFIG.headers,
			},
			PROVIDER_CONFIG.name,
			model.id,
			messages as unknown as readonly VsCodeMessage[],
			options.tools,
			model.maxOutputTokens,
			{
				onText: (text: string) => {
					progress.report(new vscode.LanguageModelTextPart(text));
				},
				onToolCall: (callId: string, name: string, args: object) => {
					progress.report(new vscode.LanguageModelToolCallPart(callId, name, args));
				},
			},
			token
		);
	}

	/**
	 * Ensure API key is configured
	 */
	private async ensureApiKey(silent: boolean): Promise<string | undefined> {
		let apiKey = await this.secrets.get(PROVIDER_CONFIG.apiKeySecret);

		if (!apiKey && !silent) {
			apiKey = await vscode.window.showInputBox({
				prompt: `Enter your ${PROVIDER_CONFIG.name} API Key`,
				password: true,
				placeHolder: "sk-...",
				ignoreFocusOut: true,
			});

			if (!apiKey) {
				// User cancelled - show helpful message
				vscode.window
					.showWarningMessage(
						`${PROVIDER_CONFIG.name} API key is required. Run "Manage ${PROVIDER_CONFIG.name}" command to configure.`,
						"Configure Now"
					)
					.then((selection) => {
						if (selection === "Configure Now") {
							vscode.commands.executeCommand(`${PROVIDER_CONFIG.id}.manage`);
						}
					});
				return undefined;
			}

			await this.secrets.store(PROVIDER_CONFIG.apiKeySecret, apiKey);
			vscode.window.showInformationMessage(`${PROVIDER_CONFIG.name} API key saved securely`);
		}

		return apiKey;
	}
}

export function activate(context: vscode.ExtensionContext) {
	// Create and register provider
	const provider = new ExtensionProvider(context.secrets);
	const registration = vscode.lm.registerLanguageModelChatProvider(PROVIDER_CONFIG.id, provider);
	context.subscriptions.push(registration);

	// Register provider disposal on deactivation
	context.subscriptions.push({
		dispose: () => provider.dispose(),
	});

	// Register management command
	const manageCommand = vscode.commands.registerCommand(`${PROVIDER_CONFIG.id}.manage`, async () => {
		const action = await vscode.window.showQuickPick(["Configure API Key", "Delete API Key", "View Provider Info"], {
			placeHolder: `Manage ${PROVIDER_CONFIG.name}`,
		});

		if (action === "Configure API Key") {
			const apiKey = await vscode.window.showInputBox({
				prompt: `Enter your ${PROVIDER_CONFIG.name} API Key`,
				password: true,
				placeHolder: "sk-...",
			});
			if (apiKey) {
				await context.secrets.store(PROVIDER_CONFIG.apiKeySecret, apiKey);
				vscode.window.showInformationMessage(`${PROVIDER_CONFIG.name} API key saved`);
			}
		} else if (action === "Delete API Key") {
			const apiKey = await context.secrets.get(PROVIDER_CONFIG.apiKeySecret);
			if (!apiKey) {
				vscode.window.showInformationMessage(`${PROVIDER_CONFIG.name} API key is not configured`);
				return;
			}
			const confirm = await vscode.window.showWarningMessage(
				`Are you sure you want to delete the ${PROVIDER_CONFIG.name} API key?`,
				{ modal: true },
				"Delete"
			);
			if (confirm === "Delete") {
				await context.secrets.delete(PROVIDER_CONFIG.apiKeySecret);
				vscode.window.showInformationMessage(`${PROVIDER_CONFIG.name} API key deleted`);
			}
		} else if (action === "View Provider Info") {
			const apiKey = await context.secrets.get(PROVIDER_CONFIG.apiKeySecret);
			vscode.window.showInformationMessage(
				`${PROVIDER_CONFIG.name}\n` +
					`API Mode: ${PROVIDER_CONFIG.apiMode}\n` +
					`Base URL: ${PROVIDER_CONFIG.baseUrl}\n` +
					`API Key: ${apiKey ? "Configured ✓" : "Not configured ✗"}`
			);
		}
	});
	context.subscriptions.push(manageCommand);

	console.log(`[${PROVIDER_CONFIG.name}] Extension activated`);
}

export function deactivate() {
	// Cleanup is handled by context.subscriptions
	console.log(`[${PROVIDER_CONFIG.name}] Extension deactivated`);
}
