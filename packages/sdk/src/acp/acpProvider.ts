import * as vscode from "vscode";
import type { ClientSideConnection, ContentBlock } from "@agentclientprotocol/sdk";

/**
 * Information about an ACP model.
 */
export interface ACPModelInfo {
	id: string;
	name: string;
	version: string;
	maxInputTokens?: number;
	maxOutputTokens?: number;
	supportsToolCalls?: boolean;
	supportsImageInput?: boolean;
}

/**
 * Options for the ACP provider.
 */
export interface ACPProviderOptions {
	models: ACPModelInfo[];
	agentPath: string;
	agentArgs?: string[];
}

/**
 * ACP Provider implementing LanguageModelChatProvider for VS Code.
 * This allows VS Code to use ACP-compliant agents (like Claude Code) as language models.
 */
export class ACPProvider implements vscode.LanguageModelChatProvider {
	private readonly options: ACPProviderOptions;
	private clients: Map<string, { connection: ClientSideConnection; sessionId: string }> = new Map();

	constructor(options: ACPProviderOptions) {
		this.options = options;
	}

	async provideLanguageModelChatInformation(
		_options: { silent: boolean },
		_token: vscode.CancellationToken
	): Promise<vscode.LanguageModelChatInformation[]> {
		return this.options.models.map((model) => ({
			id: model.id,
			name: model.name,
			family: "acp",
			version: model.version || "1.0.0",
			maxInputTokens: model.maxInputTokens ?? 100000,
			maxOutputTokens: model.maxOutputTokens ?? 8192,
			capabilities: {
				toolCalling: model.supportsToolCalls ?? true,
				imageInput: model.supportsImageInput ?? false,
			},
		}));
	}

	async provideLanguageModelChatResponse(
		_model: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		_options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		_token: vscode.CancellationToken
	): Promise<void> {
		// Find the model info
		const modelInfo = this.options.models.find((m) => m.id === _model.id);
		if (!modelInfo) {
			throw new Error(`Model ${_model.id} not found`);
		}

		// Get or create client and session
		let connection = this.clients.get(modelInfo.id);
		if (!connection) {
			// Note: Actual implementation would create a ClientSideConnection here
			// For now, we just show the API structure
			progress.report({
				kind: "text",
				value: "[ACP Provider requires full implementation]",
			} as unknown as vscode.LanguageModelTextPart);
			return;
		}

		// Convert VS Code messages to ACP format
		const prompt = await this.convertMessagesToPrompt(messages);

		// Report progress
		progress.report({
			kind: "text",
			value: `[Processing request with ${prompt.length} content blocks...]`,
		} as unknown as vscode.LanguageModelTextPart);
	}

	async provideTokenCount(_model: vscode.LanguageModelChatInformation, text: string): Promise<number> {
		// Simple token estimation (4 characters per token on average)
		return Math.ceil(text.length / 4);
	}

	/**
	 * Converts VS Code messages to ACP ContentBlocks.
	 */
	private async convertMessagesToPrompt(
		messages: readonly vscode.LanguageModelChatRequestMessage[]
	): Promise<ContentBlock[]> {
		const prompt: ContentBlock[] = [];

		for (const message of messages) {
			if (message.role === vscode.LanguageModelChatMessageRole.User) {
				if (message.content) {
					if (typeof message.content === "string") {
						prompt.push({ type: "text", text: message.content });
					} else if (Array.isArray(message.content)) {
						const textParts: string[] = [];
						for (const part of message.content) {
							if (part && typeof part === "object") {
								const partAny = part as { kind?: string; text?: string };
								if (partAny.kind === "text" && partAny.text) {
									textParts.push(partAny.text);
								}
							}
						}
						if (textParts.length > 0) {
							prompt.push({ type: "text", text: textParts.join("\n") });
						}
					}
				}
			}
		}

		return prompt;
	}
}

/**
 * Registers an ACP provider with VS Code's language model chat system.
 */
export function registerACPProvider(
	id: string,
	_models: ACPModelInfo[],
	_agentPath: string,
	_agentArgs?: string[]
): vscode.Disposable {
	const provider = new ACPProvider({
		models: _models,
		agentPath: _agentPath,
		agentArgs: _agentArgs,
	});

	return vscode.lm.registerLanguageModelChatProvider(id, provider);
}
