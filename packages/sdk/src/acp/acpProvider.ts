import * as vscode from "vscode";
import type { ClientSideConnection, ContentBlock } from "@agentclientprotocol/sdk";
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

		// DEBUG: Log incoming messages to diagnose input issues
		console.log("[ACPProvider] ===== INCOMING MESSAGES =====");
		for (let i = 0; i < messages.length; i++) {
			const msg = messages[i];
			const role =
				msg.role === vscode.LanguageModelChatMessageRole.User
					? "USER"
					: msg.role === vscode.LanguageModelChatMessageRole.Assistant
						? "ASSISTANT"
						: "OTHER";
			let contentPreview = "EMPTY";
			const content = msg.content as string | vscode.LanguageModelInputPart[] | null;
			if (content) {
				if (typeof content === "string") {
					contentPreview = content.slice(0, 100);
				} else {
					contentPreview = JSON.stringify(content).slice(0, 100);
				}
			}
			console.log(`[ACPProvider] Message[${i}] Role=${role}, Content=${contentPreview}...`);
		}
		console.log("[ACPProvider] ===== END MESSAGES =====");

		try {
			this.connection = await this.clientManager.getClient(this.options.clientConfig);

			// Initialize the connection
			console.log("[ACPProvider] Initializing...");
			const initResult = await this.initializeConnection(this.connection);
			if (!initResult.success) {
				throw new Error(`Failed to initialize: ${initResult.error}`);
			}

			// Check for cancellation
			if (token.isCancellationRequested) {
				return;
			}

			// Get or create session
			let session = this.sessions.get(model.id);
			if (!session) {
				console.log("[ACPProvider] Creating session...");
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

			// DEBUG: Log the converted prompt
			console.log("[ACPProvider] ===== CONVERTED PROMPT =====");
			console.log("[ACPProvider] Prompt has", prompt.length, "content blocks:");
			for (let i = 0; i < prompt.length; i++) {
				const block = prompt[i];
				if ("text" in block) {
					console.log(`[ACPProvider] Block[${i}] type=${block.type}, text="${String(block.text).slice(0, 100)}..."`);
				} else {
					console.log(`[ACPProvider] Block[${i}] type=${block.type}`);
				}
			}
			console.log("[ACPProvider] ===== END PROMPT =====");

			// Send the prompt and stream results
			await this.streamResponse(session!, prompt, progress, token);
		} catch (error) {
			// Log the error but don't report it to the chat response
			const errorMessage =
				error instanceof Error
					? typeof error.message === "string"
						? error.message
						: JSON.stringify(error.message)
					: String(error);
			console.error(`[ACPProvider] Error: ${errorMessage}`);
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
			console.log("[ACPProvider] Initializing connection with agent...");
			const result = await client.initialize({
				protocolVersion: 1, // Protocol version (must be <= 65535)
				clientCapabilities: {
					fs: {
						readTextFile: true,
						writeTextFile: true,
					},
				},
			});

			console.log("[ACPProvider] Agent initialized successfully:", result.agentInfo);

			return {
				success: true,
				agentInfo: {
					name: result.agentInfo?.name ?? "Unknown Agent",
					version: result.agentInfo?.version,
				},
			};
		} catch (error) {
			// Safely extract error message from any type of error
			const errorMessage =
				error instanceof Error
					? typeof error.message === "string"
						? error.message
						: JSON.stringify(error.message)
					: String(error);
			const errorStack = error instanceof Error ? error.stack : "";

			console.error(`[ACPProvider] Initialization error: ${errorMessage}`);
			if (errorStack) {
				console.error(`[ACPProvider] Stack: ${errorStack}`);
			}

			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Streams the response from the agent to the progress reporter.
	 * Uses typewriter effect for smooth text display.
	 */
	private async streamResponse(
		session: ACPSession,
		prompt: ContentBlock[],
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		// Typewriter configuration
		const CHUNK_SIZE = 3;
		const CHUNK_DELAY = 8;

		// Collect all text first, then stream with typewriter effect
		let collectedText = "";

		// Track tool calls and their results for sending LanguageModelToolResultPart
		const pendingTools = new Map<string, { name: string; result: string }>();

		// Register listener for session updates BEFORE calling prompt
		const unsubscribe = this.clientManager.onSessionUpdate(session.sessionId, (update) => {
			const updateData = update.update;

			switch (updateData.sessionUpdate) {
				case "agent_message_chunk": {
					const content = updateData.content;
					if (content && "text" in content) {
						collectedText += String(content.text);
					}
					break;
				}

				case "tool_call": {
					const toolCallId = (updateData as { toolCallId?: string }).toolCallId ?? String(Date.now());
					const title = (updateData as { title?: string }).title ?? "Unknown Tool";
					const toolName = title.split(" ")[0] || "tool";
					const toolCallPart = new vscode.LanguageModelToolCallPart(toolCallId, toolName, {});
					progress.report(toolCallPart);

					// Initialize pending tool call
					pendingTools.set(toolCallId, { name: toolName, result: "" });
					break;
				}

				case "tool_call_update": {
					const status = (updateData as { status?: string }).status;
					const toolCallId = (updateData as { toolCallId?: string }).toolCallId;
					const content = (updateData as { content?: Array<{ text?: string }> }).content;

					if ((status === "completed" || status === "success") && toolCallId) {
						// Collect tool result content
						let toolResultText = "";
						if (content && Array.isArray(content)) {
							for (const item of content) {
								if (item && "text" in item) {
									toolResultText += String(item.text);
								}
							}
						}

						// Update pending tools map
						if (pendingTools.has(toolCallId)) {
							const toolInfo = pendingTools.get(toolCallId)!;
							toolInfo.result = toolResultText;
						}

						// Send LanguageModelToolResultPart to progress
						// This tells the AI that a tool has completed and provides the result
						const toolResultContent: vscode.LanguageModelTextPart[] = [];
						if (toolResultText) {
							toolResultContent.push(new vscode.LanguageModelTextPart(toolResultText));
						}
						const toolResultPart = new vscode.LanguageModelToolResultPart(toolCallId, toolResultContent);
						progress.report(toolResultPart);

						// Clean up pending tool
						pendingTools.delete(toolCallId);
					}
					break;
				}

				default:
					break;
			}
		});

		try {
			// Send the prompt - this will trigger sessionUpdate notifications
			const result = await session.connection.prompt({
				sessionId: session.sessionId,
				prompt,
			});

			// Check for cancellation
			if (token.isCancellationRequested) {
				return;
			}

			// Stream the collected text with typewriter effect
			for (let i = 0; i < collectedText.length; i += CHUNK_SIZE) {
				if (token.isCancellationRequested) {
					return;
				}
				const chunk = collectedText.slice(i, i + CHUNK_SIZE);
				progress.report(new vscode.LanguageModelTextPart(chunk));
				await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY));
			}

			// Report completion with stop reason
			const stopReasonText = this.formatStopReason(result.stopReason);
			if (stopReasonText) {
				progress.report(new vscode.LanguageModelTextPart(`\n${stopReasonText}`));
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			progress.report(new vscode.LanguageModelTextPart(`\nError: ${errorMessage}`));
			throw error;
		} finally {
			// Clean up the listener
			unsubscribe();
		}
	}

	/**
	 * Formats the stop reason for display.
	 */
	private formatStopReason(reason: string): string {
		switch (reason) {
			case "end_turn":
				return "";
			case "max_tokens":
				return "[Response truncated - max tokens reached]";
			case "max_turn_requests":
				return "[Response truncated - max turn requests exceeded]";
			case "refusal":
				return "[Response refused]";
			case "cancelled":
				return "[Response cancelled]";
			case "unknown":
			default:
				return "";
		}
	}

	/**
	 * Converts VS Code messages to ACP ContentBlocks.
	 * Note: Tool calls and results are handled through sessionUpdate notifications,
	 * not through ContentBlocks in the prompt.
	 */
	private convertMessagesToPrompt(messages: readonly vscode.LanguageModelChatRequestMessage[]): ContentBlock[] {
		const prompt: ContentBlock[] = [];

		for (const message of messages) {
			if (message.role === vscode.LanguageModelChatMessageRole.User) {
				const content = this.extractUserContent(message);
				if (content) {
					prompt.push({ type: "text", text: content });
				}
			}
			// Note: Assistant messages with tool calls are handled through sessionUpdate notifications,
			// not through ContentBlocks. Tool calls should be sent separately via the session API.
		}

		return prompt;
	}

	/**
	 * Decodes UTF-8 bytes to string using TextDecoder.
	 */
	private decodeUtf8(bytes: number[]): string {
		const decoder = new TextDecoder("utf-8");
		const uint8Array = new Uint8Array(bytes);
		return decoder.decode(uint8Array);
	}

	/**
	 * Extracts text content from a user message.
	 */
	private extractUserContent(message: vscode.LanguageModelChatRequestMessage): string | null {
		if (message.role !== vscode.LanguageModelChatMessageRole.User) {
			return null;
		}

		if (!message.content) {
			console.log("[ACPProvider] extractUserContent: message.content is null/undefined");
			return null;
		}

		if (typeof message.content === "string") {
			console.log("[ACPProvider] extractUserContent: string content =", message.content);
			return message.content;
		}

		if (Array.isArray(message.content)) {
			console.log("[ACPProvider] extractUserContent: array content with", message.content.length, "parts");

			// Join all parts together, handling different formats
			const allPartsText: string[] = [];

			for (const part of message.content) {
				if (part && typeof part === "object") {
					// VS Code MarkdownString format: {"$mid":21,"value":"..."}
					// Or cache_control format: {"$mid":24,"mimeType":"cache_control","data":{"type":"Buffer","data":[...]}}
					const partAny = part as { value?: string; data?: { type: string; data: number[] } };

					// Try different ways to extract text
					if (partAny.value) {
						allPartsText.push(String(partAny.value));
					} else if (partAny.data && partAny.data.type === "Buffer" && Array.isArray(partAny.data.data)) {
						// Decode Buffer data using pure JS UTF-8 decoder
						const decoded = this.decodeUtf8(partAny.data.data);
						if (decoded) {
							allPartsText.push(decoded);
						}
					} else {
						// Try to get any string property
						const jsonStr = JSON.stringify(part);
						// Extract value field from the JSON
						const valueMatch = jsonStr.match(/"value":"([^"]*)"/);
						if (valueMatch) {
							allPartsText.push(valueMatch[1]);
						}
					}
				}
			}

			// Join all parts
			const fullText = allPartsText.join("");
			console.log("[ACPProvider] extractUserContent: full text length =", fullText.length);
			console.log("[ACPProvider] extractUserContent: full text preview =", fullText.slice(0, 100));

			return fullText || null;
		}

		console.log("[ACPProvider] extractUserContent: unknown content type");
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

	return vscode.lm.registerLanguageModelChatProvider(id.replace(/[^a-zA-Z0-9]/g, ""), provider);
}
