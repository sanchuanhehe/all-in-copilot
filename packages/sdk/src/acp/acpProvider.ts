import * as vscode from "vscode";
import type { ClientSideConnection, ContentBlock } from "@agentclientprotocol/sdk";
import { ACPClientManager, type ACPClientConfig, type InitResult } from "./clientManager";
import { TerminalServiceImpl } from "../platform/terminal/vscode/terminalServiceImpl";
import { executeInTerminal } from "./terminalProvider";
import { isTerminalTool, extractTerminalCommand } from "./terminalExecution";

// Note: For enhanced tool invocation UI (ChatToolInvocationPart), VS Code's official
// implementation uses the ChatParticipant API with ChatResponseStream, not the
// LanguageModelChatProvider API that we're implementing here.
//
// LanguageModelChatProvider uses Progress<LanguageModelResponsePart> which only accepts:
// - LanguageModelTextPart
// - LanguageModelToolCallPart
// - LanguageModelToolResultPart
// - LanguageModelDataPart
//
// ChatParticipant uses ChatResponseStream which accepts ExtendedChatResponsePart
// including ChatToolInvocationPart for richer UI.

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
	private readonly terminalService: TerminalServiceImpl;
	private readonly sessions = new Map<string, ACPSession>();
	private connection: ClientSideConnection | null = null;

	constructor(options: ACPProviderOptions) {
		this.options = options;
		this.clientManager = new ACPClientManager(options.clientInfo);
		this.terminalService = new TerminalServiceImpl({
			environmentVariableCollection: {} as { append: (v: string, val: string) => void; prepend: (v: string, val: string) => void; delete: (v: string) => void; description?: string },
		});
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
	 * Handles tool calls by executing them and sending results back to the Agent.
	 *
	 * KEY INSIGHT: In ACP protocol, when Agent sends tool_call notification,
	 * the Client MUST immediately execute the tool AND send the result back
	 * via another prompt() call - NOT wait for the initial prompt() to return.
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

		// Track pending tool calls and their results
		const pendingTools = new Map<string, {
			name: string;
			result: string;
			listener?: () => void;
		}>();

		// Flag to track if we're in a tool execution phase
		let isInToolExecution = false;

		// Track if we've sent the initial prompt
		let initialPromptSent = false;

		// Main listener for session updates (tracks overall progress)
		const mainUnsubscribe = this.clientManager.onSessionUpdate(session.sessionId, async (update) => {
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
					// Mark that we're entering tool execution phase
					isInToolExecution = true;

					const toolCallId = (updateData as { toolCallId?: string }).toolCallId ?? String(Date.now());
					const title = (updateData as { title?: string }).title ?? "Unknown Tool";
					const rawInput = (updateData as { rawInput?: unknown }).rawInput;
					const toolName = title.split(" ")[0] || "tool";

					console.log(`[ACPProvider] Tool call received: ${toolName} (${toolCallId})`);
					if (rawInput !== undefined) {
						console.log(`[ACPProvider] Tool input: ${JSON.stringify(rawInput)}`);
					}

					// Extract command using comprehensive strategy (ACP protocol + OpenCode compatibility)
					const commandText = extractTerminalCommand(title, rawInput, collectedText, toolName);
					console.log(`[ACPProvider] Extracted command: "${commandText}"`);

					// For terminal tools, execute in real VS Code terminal
					const isTerminal = isTerminalTool(toolName);
					let terminalOutput = "";
					if (isTerminal && commandText) {
						try {
							console.log('[ACPProvider] Executing terminal command:', commandText.substring(0, 100) + '...');
							const result = await executeInTerminal(
								this.terminalService,
								session.sessionId,
								commandText,
								{ showTerminal: true }
							);
							terminalOutput = result.output;
							console.log('[ACPProvider] Terminal command completed, output length:', terminalOutput.length);
						} catch (err) {
							terminalOutput = `Terminal error: ${err instanceof Error ? err.message : String(err)}`;
							console.error(`[ACPProvider] Terminal error:`, err);
						}
					}

					// Report tool call using the stable LanguageModelChatProvider API
					// For terminal tools, we report the command in the input for better visibility
					const inputObject = rawInput !== undefined ? (rawInput as object) : {};
					const toolCallPart = new vscode.LanguageModelToolCallPart(toolCallId, toolName, inputObject);
					progress.report(toolCallPart);

					// Initialize pending tool call with terminal output
					pendingTools.set(toolCallId, { name: toolName, result: terminalOutput });

					// CRITICAL: Register a dedicated listener for this tool's updates
					// This listener will send the tool result back to Agent immediately
					const toolListenerUnsubscribe = this.clientManager.onSessionUpdate(session.sessionId, async (toolUpdate) => {
						const toolUpdateData = toolUpdate.update;

						if (toolUpdateData.sessionUpdate !== "tool_call_update") {
							return;
						}

						const status = (toolUpdateData as { status?: string }).status;
						const updateToolCallId = (toolUpdateData as { toolCallId?: string }).toolCallId;

						// Only process updates for this specific tool
						if (updateToolCallId !== toolCallId) {
							return;
						}

						const content = (toolUpdateData as { content?: Array<{ text?: string }> }).content;
						const rawOutput = (toolUpdateData as { rawOutput?: unknown }).rawOutput;

						// Collect tool result content
						let toolResultText = "";
						if (content && Array.isArray(content)) {
							for (const item of content) {
								if (item && "text" in item) {
									toolResultText += String(item.text);
								}
							}
						}
						if (rawOutput && typeof rawOutput === "object") {
							const rawOutputStr = JSON.stringify(rawOutput);
							if (rawOutputStr && rawOutputStr !== "{}") {
								toolResultText += `\nRaw output: ${rawOutputStr}`;
							}
						}

						// When tool completes, send result back to Agent IMMEDIATELY
						if ((status === "completed" || status === "success") && updateToolCallId) {
							console.log(`[ACPProvider] Tool completed: ${updateToolCallId}, sending result to Agent`);

							// Get stored tool info (includes terminalOutput)
							const toolInfo = pendingTools.get(updateToolCallId);
							const terminalOutput = toolInfo?.result || "";

							// Collect tool result content
							let combinedResult = "";
							if (terminalOutput) {
								combinedResult = terminalOutput;
								console.log(`[ACPProvider] Including terminal output (${terminalOutput.length} chars)`);
							}
							if (toolResultText) {
								combinedResult += (combinedResult ? "\n" : "") + toolResultText;
							}

							// Update pending tools map
							if (toolInfo) {
								toolInfo.result = combinedResult;
							}

							// Send LanguageModelToolResultPart to progress
							const toolResultContent: vscode.LanguageModelTextPart[] = [];
							if (combinedResult) {
								toolResultContent.push(new vscode.LanguageModelTextPart(combinedResult));
							}
							const toolResultPart = new vscode.LanguageModelToolResultPart(updateToolCallId, toolResultContent);
							progress.report(toolResultPart);

							// CRITICAL: Send tool result back to Agent IMMEDIATELY
							// This is the key fix - send result while prompt() is still pending
							const toolResultContentBlock: ContentBlock = {
								type: "text",
								text: `[Tool Result for ${updateToolCallId}]: ${combinedResult || "(no output)"}`
							};

							try {
								const followUpResult = await session.connection.prompt({
									sessionId: session.sessionId,
									prompt: [toolResultContentBlock],
								});
								console.log(`[ACPProvider] Tool result sent, stopReason: ${followUpResult.stopReason}`);

								// Collect any text from the follow-up
								// Note: This is a simplified approach; in a full implementation,
								// we might want to stream this response too
							} catch (followUpError) {
								console.error(`[ACPProvider] Error sending tool result: ${followUpError}`);
							}

							// Remove this tool from pending and clean up listener
							pendingTools.delete(updateToolCallId);
							toolListenerUnsubscribe();

							// If no more pending tools, we're done with tool execution
							if (pendingTools.size === 0) {
								isInToolExecution = false;
							}
						}
					});

					// Store listener reference for cleanup
					if (pendingTools.has(toolCallId)) {
						pendingTools.get(toolCallId)!.listener = toolListenerUnsubscribe;
					}
					break;
				}

				case "user_message_chunk": {
					// Agent is waiting for user input - tool execution complete
					isInToolExecution = false;
					break;
				}

				default:
					break;
			}
		});

		try {
			// Send the initial prompt - this will trigger sessionUpdate notifications
			// including tool_call and tool_call_update
			console.log("[ACPProvider] Sending initial prompt...");
			initialPromptSent = true;
			const result = await session.connection.prompt({
				sessionId: session.sessionId,
				prompt,
			});

			console.log(`[ACPProvider] Initial prompt completed, stopReason: ${result.stopReason}`);

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

			// Turn is complete
			return;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			progress.report(new vscode.LanguageModelTextPart(`\nError: ${errorMessage}`));
			throw error;
		} finally {
			// Clean up all pending tool listeners and main listener
			for (const [, tool] of pendingTools) {
				if (tool.listener) {
					tool.listener();
				}
			}
			pendingTools.clear();
			mainUnsubscribe();
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
