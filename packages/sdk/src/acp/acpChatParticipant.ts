import * as vscode from "vscode";
import type { ClientSideConnection, ContentBlock } from "@agentclientprotocol/sdk";
import { ACPClientManager, type ACPClientConfig, type InitResult } from "./clientManager";
import { ACPTerminalProvider, executeInTerminal } from "./terminalProvider";
import { TerminalServiceImpl } from "../platform/terminal/vscode/terminalServiceImpl";

/**
 * Options for the ACP Chat Participant.
 * Provides rich tool invocation UI using ChatParticipant API.
 */
export interface ACPChatParticipantOptions {
	/** Unique ID for this chat participant */
	id: string;
	/** Human-readable name shown in chat */
	name: string;
	/** Description of what this participant does */
	description?: string;
	/** Command palette shortcut */
	commandPalette?: string;
	/** Whether to show in chat participant list */
	showInChatParticipantList?: boolean;
	/** Icon for the participant */
	iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon;
	/** Default model to use */
	defaultModel?: string;
	/** ACP client configuration */
	clientConfig: ACPClientConfig;
	/** Client info (optional, will use defaults if not provided) */
	clientInfo?: { name?: string; version?: string };
	/** Optional external ACPClientManager for lifecycle management */
	clientManager?: ACPClientManager;
}

/**
 * Session information for an ACP chat conversation.
 */
interface ACPSession {
	connection: ClientSideConnection;
	sessionId: string;
}

/**
 * Check if a tool call is a terminal/shell command based on tool name or input
 */
function isTerminalTool(toolName: string, rawInput?: unknown): boolean {
	const terminalToolNames = ["bash", "shell", "exec", "terminal", "command", "run", "execute"];
	const isTerminalName = terminalToolNames.some((name) => toolName.toLowerCase().includes(name));

	// Also check if input looks like a shell command
	if (rawInput !== undefined && typeof rawInput === "object") {
		const inputObj = rawInput as Record<string, unknown>;
		if ("command" in inputObj || "cmd" in inputObj || "script" in inputObj) {
			return true;
		}
	}

	return isTerminalName;
}

/**
 * Format a tool input for display
 */
function formatToolInput(rawInput: unknown): string {
	if (rawInput === undefined) {
		return "";
	}
	if (typeof rawInput === "string") {
		return rawInput;
	}
	if (typeof rawInput === "object") {
		const inputObj = rawInput as Record<string, unknown>;
		if ("command" in inputObj && typeof inputObj.command === "string") {
			return inputObj.command;
		}
		if ("cmd" in inputObj && typeof inputObj.cmd === "string") {
			return inputObj.cmd;
		}
		if ("script" in inputObj && typeof inputObj.script === "string") {
			return inputObj.script;
		}
		return JSON.stringify(rawInput, null, 2);
	}
	return String(rawInput);
}

/**
 * ACP Chat Participant providing rich tool invocation UI using ChatToolInvocationPart,
 * matching VS Code's official copilot-chat implementation.
 * Note: This class uses proposed API features and may require VS Code insider.
 */
export class ACPChatParticipant {
	readonly id: string;
	readonly name: string;

	private readonly options: ACPChatParticipantOptions;
	private readonly clientManager: ACPClientManager;
	private readonly terminalProvider: ACPTerminalProvider;
	private readonly terminalService: TerminalServiceImpl; // Store service for executeInTerminal calls
	private readonly sessions = new Map<string, ACPSession>();
	private connection: ClientSideConnection | null = null;
	private participant: vscode.ChatParticipant | null = null;
	private participantDisposable: vscode.Disposable;
	private ownsClientManager: boolean = false;

	// Required by ChatParticipant (proposed API) - using EventEmitter for compatibility
	// Note: These may not be available in stable VS Code API
	readonly onDidChangePauseState?: vscode.Event<{ request: vscode.ChatRequest; isPaused: boolean }>;
	readonly onDidReceiveFeedback?: vscode.Event<vscode.ChatResultFeedback>;
	readonly onDidPerformAction?: vscode.Event<vscode.ChatUserActionEvent>;

	constructor(options: ACPChatParticipantOptions) {
		this.id = options.id;
		this.name = options.name;
		this.options = options;

		// Use external clientManager or create a new one
		if (options.clientManager) {
			this.clientManager = options.clientManager;
			this.ownsClientManager = false;
		} else {
			this.clientManager = new ACPClientManager(options.clientInfo);
			this.ownsClientManager = true;
		}

		// Create terminal service for real VS Code terminal integration
		const terminalService = new TerminalServiceImpl({
			environmentVariableCollection: {} as { append: (v: string, val: string) => void; prepend: (v: string, val: string) => void; delete: (v: string) => void; description?: string },
		});
		this.terminalService = terminalService;

		// Create terminal provider using ITerminalService
		this.terminalProvider = new ACPTerminalProvider(terminalService, {
			shellPath: options.clientConfig.shellPath,
			shellArgs: options.clientConfig.shellArgs,
		});

		// Create the chat request handler
		const boundHandler = this.requestHandler.bind(this);

		// Register this participant with VS Code using proposed API
		this.participant = vscode.chat.createChatParticipant(
			this.id,
			boundHandler
		);

		// Configure participant properties if supported
		if (options.description) {
			this.participant.helpTextPrefix = options.description;
		}
		if (options.iconPath) {
			this.participant.iconPath = options.iconPath;
		}

		// The participant itself is disposable
		this.participantDisposable = this.participant as unknown as vscode.Disposable;
	}

	/**
	 * The request handler for chat requests.
	 * This is called when a user sends a message to this chat participant.
	 */
	private async requestHandler(
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<vscode.ChatResult> {
		console.log('[ACP-Chat] requestHandler called', {
			promptLength: request.prompt?.length,
			hasContext: context?.history?.length > 0
		});

		// Initialize connection if not already done
		if (!this.connection) {
			console.log('[ACP-Chat] Initializing client connection...');
			const initResult = await this.initializeClient();
			if (!initResult.success) {
				stream.markdown(`Failed to initialize: ${initResult.error ?? "Unknown error"}`);
				return { errorDetails: { message: initResult.error ?? "Initialization failed" } };
			}
			console.log('[ACP-Chat] Client initialized successfully');
		}

		try {
			// Create a new session
			console.log('[ACP-Chat] Creating new session...');
			const sessionResult = await this.clientManager.newSession(this.connection!, {
				cwd: this.options.clientConfig.cwd ?? process.cwd(),
			});
			if (!sessionResult.success || !sessionResult.sessionId) {
				stream.markdown(`Failed to create session: ${sessionResult.error ?? "Unknown error"}`);
				return { errorDetails: { message: sessionResult.error ?? "Failed to create session" } };
			}

			const session: ACPSession = {
				connection: this.connection!,
				sessionId: sessionResult.sessionId,
			};
			this.sessions.set(sessionResult.sessionId, session);
			console.log('[ACP-Chat] Session created:', sessionResult.sessionId);

			// Send the user's message and stream the response
			await this.streamChatResponse(session, request.prompt, stream, token);

			return {};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[ACPChatParticipant] Error: ${errorMessage}`);
			stream.markdown(`Error: ${errorMessage}`);
			return { errorDetails: { message: errorMessage } };
		}
	}

	/**
	 * Initialize the ACP client
	 */
	private async initializeClient(): Promise<InitResult> {
		try {
			const connection = await this.clientManager.getClient(this.options.clientConfig);
			const result = await this.clientManager.initialize(connection);

			if (result.success && connection) {
				this.connection = connection;
				console.log("[ACPChatParticipant] Client initialized successfully");
				return { success: true, agentInfo: result.agentInfo };
			} else {
				return { success: false, error: result.error };
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return { success: false, error: errorMessage };
		}
	}

	/**
	 * Stream chat response from the agent, handling tool calls with rich UI
	 */
	private async streamChatResponse(
		session: ACPSession,
		prompt: string,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<void> {
		// Convert chat message to ACP content blocks with proper type
		const content: ContentBlock[] = [{ type: "text", text: prompt }];

		// Track pending tool calls with their listeners
		const pendingTools = new Map<string, {
			name: string;
			rawInput?: unknown;
			listenerUnsubscribe: () => void;
		}>();

		// Main listener for session updates - single listener for all updates
		const mainUnsubscribe = this.clientManager.onSessionUpdate(session.sessionId, async (update) => {
			const updateData = update.update;

			switch (updateData.sessionUpdate) {
				case "agent_message_chunk": {
					const contentBlock = updateData.content;
					if (contentBlock && "text" in contentBlock) {
						stream.markdown(String(contentBlock.text));
					}
					break;
				}

				case "tool_call": {
					const toolCallId = (updateData as { toolCallId?: string }).toolCallId ?? String(Date.now());
					const title = (updateData as { title?: string }).title ?? "Unknown Tool";
					const rawInput = (updateData as { rawInput?: unknown }).rawInput;
					const toolName = title.split(" ")[0] || "tool";

					console.log(`[ACPChatParticipant] Tool call: ${toolName} (${toolCallId})`);

					// Format the command for display
					const commandText = formatToolInput(rawInput);

					// Create ChatToolInvocationPart with proper API
					// Constructor: toolName, toolCallId, isError?
					const toolPart = new vscode.ChatToolInvocationPart(toolName, toolCallId, false);

					// Set invocation message
					if (commandText) {
						const markdown = new vscode.MarkdownString();
						markdown.appendText(`🔄 Running ${toolName}:\n`);
						markdown.appendCodeblock(commandText, "bash");
						toolPart.invocationMessage = markdown;
					} else {
						const markdown = new vscode.MarkdownString();
						markdown.appendText(`🔄 Running ${toolName}...`);
						toolPart.invocationMessage = markdown;
					}

					// Push the tool part to stream
					stream.push(toolPart);

					// For terminal tools, execute in real VS Code terminal
					const isTerminal = isTerminalTool(toolName, rawInput);
					let terminalOutput = "";
					if (isTerminal && commandText) {
						try {
							console.log('[ACP-Chat] Executing terminal command:', commandText.substring(0, 100) + '...');
							const result = await executeInTerminal(
								this.terminalService,  // Use terminalService directly
								session.sessionId,
								commandText,
								{ showTerminal: true }
							);
							terminalOutput = result.output;
							console.log('[ACP-Chat] Terminal command completed, output length:', terminalOutput.length);
						} catch (err) {
							terminalOutput = `Terminal error: ${err instanceof Error ? err.message : String(err)}`;
							console.error(`[ACPChatParticipant] Terminal error:`, err);
						}
					}

					// CRITICAL: Register tool update listener IMMEDIATELY after receiving tool_call
					// This listener will handle tool completion and send results back
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

						const contentData = (toolUpdateData as { content?: Array<{ text?: string }> }).content;
						const rawOutput = (toolUpdateData as { rawOutput?: unknown }).rawOutput;

						// Collect tool result
						let toolResultText = "";
						if (contentData && Array.isArray(contentData)) {
							for (const item of contentData) {
								if (item && "text" in item) {
									toolResultText += String(item.text);
								}
							}
						}
						// Add terminal output if available
						if (terminalOutput) {
							toolResultText = terminalOutput + (toolResultText ? `\n${toolResultText}` : "");
						}
						if (rawOutput && typeof rawOutput === "object") {
							const rawOutputStr = JSON.stringify(rawOutput);
							if (rawOutputStr && rawOutputStr !== "{}") {
								toolResultText += `\nRaw output: ${rawOutputStr}`;
							}
						}

						// When tool completes, send result back to Agent IMMEDIATELY
						if ((status === "completed" || status === "success") && updateToolCallId) {
							console.log(`[ACPChatParticipant] Tool completed: ${updateToolCallId}, result length: ${toolResultText.length}`);

							// Track in pending tools map
							if (!pendingTools.has(updateToolCallId)) {
								pendingTools.set(updateToolCallId, {
									name: toolName,
									rawInput,
									listenerUnsubscribe: toolListenerUnsubscribe,
								});
							}

							// Create completed tool invocation
							// Constructor: toolName, toolCallId, isError?
							const completedToolPart = new vscode.ChatToolInvocationPart(toolName, updateToolCallId, false);
							completedToolPart.isComplete = true;

							// Set past tense message
							const pastTenseMarkdown = new vscode.MarkdownString();
							pastTenseMarkdown.appendText(`✅ ${toolName} completed`);
							completedToolPart.pastTenseMessage = pastTenseMarkdown;

							// Push completed tool part
							stream.push(completedToolPart);

							// Show result in markdown with clear formatting
							if ((terminalOutput || toolResultText) && stream.markdown) {
								const resultMarkdown = new vscode.MarkdownString();
								resultMarkdown.isTrusted = true;

								// Add header for terminal output
								if (isTerminalTool(toolName, rawInput)) {
									resultMarkdown.appendText("### 📟 终端输出\n\n");
								}

								const outputText = terminalOutput || toolResultText;
								resultMarkdown.appendCodeblock(outputText, "bash");

								if (outputText.length > 500) {
									resultMarkdown.appendText("\n_(output truncated)_");
								}
								stream.markdown(resultMarkdown);
							}

							// Send result back to Agent
							const resultMessage: ContentBlock[] = [{ type: "text", text: toolResultText }];
							await this.clientManager.prompt(session.connection, {
								sessionId: session.sessionId,
								prompt: resultMessage,
							});

							// Clean up
							toolListenerUnsubscribe();
							pendingTools.delete(updateToolCallId);
						}
					});

					// Track this tool with its listener
					pendingTools.set(toolCallId, { name: toolName, rawInput, listenerUnsubscribe: toolListenerUnsubscribe });

					break;
				}
			}
		});

			try {
			// Send the prompt and wait for the result
			console.log('[ACP-Chat] Sending prompt to agent...');
			const promptResult = await this.clientManager.prompt(session.connection, {
				sessionId: session.sessionId,
				prompt: content,
			});

			const stopReason = promptResult.result?.stopReason ?? "unknown";
			console.log('[ACP-Chat] Prompt completed', {
				stopReason,
				hasResult: !!promptResult.result,
				success: promptResult.success
			});

			// Log final result for debugging
			if (stopReason !== 'unknown') {
				console.log('[ACP-Chat] Turn completed with stopReason:', stopReason);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[ACPChatParticipant] Error in streamChatResponse: ${errorMessage}`);
			stream.markdown(`Error: ${errorMessage}`);
		} finally {
			// Clean up all pending tool listeners
			for (const [, tool] of pendingTools) {
				if (tool.listenerUnsubscribe) {
					tool.listenerUnsubscribe();
				}
			}
			pendingTools.clear();
			mainUnsubscribe();

			// Only dispose clientManager if we own it
			if (this.ownsClientManager) {
				this.clientManager.dispose();
			}
			this.sessions.clear();
			this.connection = null;
			this.participant = null;
		}
	}

	/**
	 * Dispose of the participant and clean up resources
	 */
	public dispose(): void {
		console.log("[ACPChatParticipant] Disposing participant");

		// Dispose participant
		if (this.participantDisposable) {
			this.participantDisposable.dispose();
		}

		// Dispose client manager if we own it
		if (this.ownsClientManager && this.clientManager) {
			this.clientManager.dispose();
		}

		// Clear sessions
		this.sessions.clear();

		// Dispose terminal provider
		if (this.terminalProvider) {
			this.terminalProvider.dispose();
		}
	}
}

/**
 * Register an ACP Chat Participant with VS Code.
 *
 * @param id Unique ID for the participant
 * @param name Human-readable name
 * @param options Configuration options
 * @returns Disposable to unregister the participant
 *
 * @example
 * ```typescript
 * const disposable = registerACPChatParticipant("myAgent", "My Agent", {
 *     description: "An AI coding assistant",
 *     clientConfig: {
 *         agentMode: "stdio",
 *         agentPath: "/path/to/agent",
 *     },
 * });
 * ```
 */
export function registerACPChatParticipant(
	id: string,
	name: string,
	options: Omit<ACPChatParticipantOptions, "id" | "name">
): vscode.Disposable {
	const participant = new ACPChatParticipant({
		...options,
		id,
		name,
	});

	return {
		dispose: () => participant.dispose(),
	};
}
