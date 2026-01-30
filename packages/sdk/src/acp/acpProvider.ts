import * as vscode from "vscode";
import type {
	ClientSideConnection,
	ContentBlock,
} from "@agentclientprotocol/sdk";
import { ACPClientManager, type ACPClientConfig, type InitResult } from "./clientManager";

/**
 * Information about an ACP model that can be used with the provider.
 */
export interface ACPModelInfo {
	/** Unique identifier for the model */
	id: string;
	/** Human-readable name */
	name: string;
	/** Version string */
	version?: string;
	/** Maximum number of input tokens */
	maxInputTokens?: number;
	/** Maximum number of output tokens */
	maxOutputTokens?: number;
	/** Whether the model supports tool calls */
	supportsToolCalls?: boolean;
	/** Whether the model supports image input */
	supportsImageInput?: boolean;
}

/**
 * Options for the ACP provider.
 */
export interface ACPProviderOptions {
	models: ACPModelInfo[];
	clientConfig: ACPClientConfig;
	clientInfo?: { name?: string; version?: string };
}

/**
 * Session information for an ACP conversation.
 */
interface ACPSession {
	connection: ClientSideConnection;
	sessionId: string;
}

/**
 * ACP Provider implementing LanguageModelChatProvider for VS Code.
 * This allows VS Code to use ACP-compliant agents (like Claude Code) as language models.
 */
export class ACPProvider implements vscode.LanguageModelChatProvider {
	private readonly options: ACPProviderOptions;
	private readonly clientManager: ACPClientManager;
	private readonly sessions = new Map<string, ACPSession>();
	private connection: ClientSideConnection | null = null;

	constructor(options: ACPProviderOptions) {
		this.options = options;
		this.clientManager = new ACPClientManager(options.clientInfo);
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
		model: vscode.LanguageModelChatInformation,
		messages: readonly vscode.LanguageModelChatRequestMessage[],
		_options: vscode.ProvideLanguageModelChatResponseOptions,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		// Find the model info
		const modelInfo = this.options.models.find((m) => m.id === model.id);
		if (!modelInfo) {
			throw new Error(`Model ${model.id} not found`);
		}

		// Check for cancellation
		if (token.isCancellationRequested) {
			return;
		}

		try {
			// Get or create connection
			if (!this.connection) {
				progress.report(new vscode.LanguageModelTextPart("Connecting to agent..."));
				this.connection = await this.clientManager.getClient(this.options.clientConfig);

				// Initialize the connection
				progress.report(new vscode.LanguageModelTextPart("Initializing..."));
				const initResult = await this.initializeConnection(this.connection);
				if (!initResult.success) {
					throw new Error(`Failed to initialize: ${initResult.error}`);
				}
			}

			// Check for cancellation
			if (token.isCancellationRequested) {
				return;
			}

			// Get or create session
			let session = this.sessions.get(model.id);
			if (!session) {
				progress.report(new vscode.LanguageModelTextPart("Creating session..."));
				const sessionResult = await this.clientManager.newSession(this.connection, {
					cwd: this.options.clientConfig.cwd ?? process.cwd(),
				});
				if (!sessionResult.success) {
					throw new Error(`Failed to create session: ${sessionResult.error}`);
				}
				session = { connection: this.connection, sessionId: sessionResult.sessionId! };
				this.sessions.set(model.id, session);
			}

			// Check for cancellation
			if (token.isCancellationRequested) {
				return;
			}

			// Convert VS Code messages to ACP format
			const prompt = this.convertMessagesToPrompt(messages);

			// Send the prompt and stream results
			progress.report(new vscode.LanguageModelTextPart("Processing..."));

			await this.streamResponse(session!, prompt, progress, token);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			progress.report(new vscode.LanguageModelTextPart(`Error: ${errorMessage}`));
			throw error;
		}
	}

	async provideTokenCount(_model: vscode.LanguageModelChatInformation, text: string): Promise<number> {
		// Simple token estimation (4 characters per token on average)
		return Math.ceil(text.length / 4);
	}

	/**
	 * Initializes the connection with an agent.
	 */
	private async initializeConnection(client: ClientSideConnection): Promise<InitResult> {
		try {
			const result = await client.initialize({
				protocolVersion: 20250101 as any, // Protocol version as number
				clientCapabilities: {
					fs: {
						readTextFile: true,
						writeTextFile: true,
					},
				},
			});

			return {
				success: true,
				agentInfo: {
					name: result.agentInfo?.name ?? "Unknown Agent",
					version: result.agentInfo?.version,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Streams the response from the agent to the progress reporter.
	 */
	private async streamResponse(
		session: ACPSession,
		prompt: ContentBlock[],
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		// For streaming, we use a custom approach that captures output as it comes
		let fullText = "";
		let currentToolCall: { id: string; name: string; input: string } | null = null;
		let toolCallId = 0;

		// Send the prompt
		const result = await session.connection.prompt({
			sessionId: session.sessionId,
			prompt,
		});

		// Note: The SDK doesn't expose streaming directly, so we get the final result.
		// For true streaming, we'd need to implement a custom streaming connection.
		// For now, we report the complete response.

		// In a full implementation, we would:
		// 1. Start the prompt asynchronously
		// 2. Listen for session updates via sessionUpdate callback
		// 3. Report text chunks as they arrive
		// 4. Report tool calls when they're made
		// 5. Report tool results when they're received
		// 6. Report completion when done

		// For now, we'll construct a simple response from the result
		progress.report(new vscode.LanguageModelTextPart(`[Response: ${result.stopReason}]`));
	}

	/**
	 * Converts VS Code messages to ACP ContentBlocks.
	 */
	private convertMessagesToPrompt(messages: readonly vscode.LanguageModelChatRequestMessage[]): ContentBlock[] {
		const prompt: ContentBlock[] = [];

		for (const message of messages) {
			if (message.role === vscode.LanguageModelChatMessageRole.User) {
				const content = this.extractUserContent(message);
				if (content) {
					prompt.push({ type: "text", text: content });
				}
			} else if (message.role === vscode.LanguageModelChatMessageRole.Assistant) {
				// Assistant messages can include tool calls - check for toolCalls property
				const messageAny = message as { toolCalls?: Array<{ id: string; name: string; input: unknown }>; content?: unknown };
				if (messageAny.toolCalls) {
					for (const toolCall of messageAny.toolCalls) {
						prompt.push({
							type: "tool_call",
							id: toolCall.id,
							name: toolCall.name,
							input: typeof toolCall.input === "string" ? toolCall.input : JSON.stringify(toolCall.input),
						} as ContentBlock & { type: "tool_call" });
					}
				}
				if (messageAny.content) {
					const content = this.extractTextContent(messageAny.content as string | Array<{ kind: string; text: string }>);
					if (content) {
						prompt.push({ type: "text", text: content });
					}
				}
			}
		}

		return prompt;
	}

	/**
	 * Extracts text content from a user message.
	 */
	private extractUserContent(message: vscode.LanguageModelChatRequestMessage): string | null {
		if (message.role !== vscode.LanguageModelChatMessageRole.User) {
			return null;
		}

		if (!message.content) {
			return null;
		}

		if (typeof message.content === "string") {
			return message.content;
		}

		if (Array.isArray(message.content)) {
			const textParts: string[] = [];
			for (const part of message.content) {
				if (part && typeof part === "object") {
					const partAny = part as { kind?: string; text?: string };
					if (partAny.kind === "text" && partAny.text) {
						textParts.push(partAny.text);
					}
				}
			}
			return textParts.join("\n") || null;
		}

		return null;
	}

	/**
	 * Extracts text content from any message content.
	 */
	private extractTextContent(content: string | Array<{ kind: string; text: string }>): string | null {
		if (typeof content === "string") {
			return content;
		}

		if (Array.isArray(content)) {
			const textParts: string[] = [];
			for (const part of content) {
				if (part && typeof part === "object") {
					const partAny = part as { kind?: string; text?: string };
					if (partAny.kind === "text" && partAny.text) {
						textParts.push(partAny.text);
					}
				}
			}
			return textParts.join("\n") || null;
		}

		return null;
	}

	/**
	 * Disposes of the provider and all resources.
	 */
	async dispose(): Promise<void> {
		await this.clientManager.dispose();
		this.sessions.clear();
		this.connection = null;
	}
}

/**
 * Registers an ACP provider with VS Code's language model chat system.
 */
export function registerACPProvider(
	id: string,
	models: ACPModelInfo[],
	clientConfig: ACPClientConfig,
	clientInfo?: { name?: string; version?: string }
): vscode.Disposable {
	const provider = new ACPProvider({
		models,
		clientConfig,
		clientInfo,
	});

	return vscode.lm.registerLanguageModelChatProvider(`acp.${id}`, provider);
}
