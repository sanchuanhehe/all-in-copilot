import * as vscode from "vscode";
import type { ClientSideConnection, ContentBlock } from "@agentclientprotocol/sdk";
import { ACPClientManager, type ACPClientConfig, type InitResult } from "./clientManager";
import { TerminalServiceImpl } from "../platform/terminal/vscode/terminalServiceImpl";
import { createTerminalCallbacks, type ACPTerminalCallbacks, type IACPTerminalAdapter } from "./terminal";
import { isTerminalTool } from "./terminalExecution";

/**
 * Type definition for ChatTerminalToolInvocationData (proposed API)
 * Matches VS Code's official implementation for terminal tool UI.
 *
 * IMPORTANT: VS Code checks `toolSpecificData?.kind === 'terminal'` to decide
 * whether to render the terminal UI. While the converter should add this automatically,
 * we include it explicitly for reliability.
 */
interface ChatTerminalToolInvocationData {
	kind?: 'terminal';  // VS Code uses this to identify terminal tools
	commandLine: {
		original: string;
		userEdited?: string;
		toolEdited?: string;
	};
	language: string;
	output?: {
		text: string;
	};
	state?: {
		exitCode?: number;
		duration?: number;
	};
}

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
 * Options for the ACP Unified Provider.
 * Combines ChatParticipant (rich UI) with LanguageModelChatProvider (model API).
 */
export interface ACPUnifiedProviderOptions {
	/** Unique ID for this provider */
	id: string;
	/** Human-readable name shown in chat */
	name: string;
	/** Description of what this provider does */
	description?: string;
	/** Icon for the participant */
	iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon;
	/** Model information for LanguageModelChatProvider */
	models: ACPModelInfo[];
	/** ACP client configuration */
	clientConfig: ACPClientConfig;
	/** Client info (optional, will use defaults if not provided) */
	clientInfo?: { name?: string; version?: string };
	/** Optional external ACPClientManager for lifecycle management */
	clientManager?: ACPClientManager;
	/** Vendor ID for LanguageModelChatProvider registration (defaults to id) */
	vendorId?: string;
}

/**
 * Session information for an ACP conversation.
 */
interface ACPSession {
	connection: ClientSideConnection;
	sessionId: string;
}

// Check if LanguageModelThinkingPart is available (proposed API)
const hasThinkingPart = "LanguageModelThinkingPart" in vscode;

/**
 * ACP Unified Provider - Combines ChatParticipant with LanguageModelChatProvider
 *
 * This class provides:
 * 1. **ChatParticipant** (proposed API) - Rich UI with tool invocations, thinking progress
 * 2. **LanguageModelChatProvider** (stable API) - Allows other extensions to use this as a language model
 *
 * Usage:
 * ```typescript
 * const provider = new ACPUnifiedProvider({
 *     id: "my-agent",
 *     name: "My Agent",
 *     models: [{ id: "model-1", name: "Model 1" }],
 *     clientConfig: { ... },
 * });
 *
 * // Register both ChatParticipant and LanguageModelChatProvider
 * const disposable = provider.register(context);
 * context.subscriptions.push(disposable);
 * ```
 */
export class ACPUnifiedProvider implements vscode.LanguageModelChatProvider {
	readonly id: string;
	readonly name: string;

	private readonly options: ACPUnifiedProviderOptions;
	private readonly clientManager: ACPClientManager;
	private readonly terminalCallbacks: ACPTerminalCallbacks;
	private readonly terminalAdapter: IACPTerminalAdapter;
	private readonly terminalService: TerminalServiceImpl;
	private readonly sessions = new Map<string, ACPSession>();
	private connection: ClientSideConnection | null = null;
	private participant: vscode.ChatParticipant | null = null;
	private ownsClientManager = false;
	private disposables: vscode.Disposable[] = [];

	constructor(options: ACPUnifiedProviderOptions) {
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

		// Create terminal callbacks using new ACP Terminal Adapter
		const { callbacks, adapter } = createTerminalCallbacks(terminalService, {
			shellPath: options.clientConfig.shellPath,
			shellArgs: options.clientConfig.shellArgs,
		});
		this.terminalCallbacks = callbacks;
		this.terminalAdapter = adapter;
	}

	/**
	 * Register both ChatParticipant and LanguageModelChatProvider with VS Code.
	 *
	 * @returns A disposable that unregisters both
	 */
	register(): vscode.Disposable {
		// 1. Register ChatParticipant for rich UI
		const boundHandler = this.chatRequestHandler.bind(this);
		this.participant = vscode.chat.createChatParticipant(this.id, boundHandler);

		// Configure participant properties
		if (this.options.description) {
			this.participant.helpTextPrefix = this.options.description;
		}
		if (this.options.iconPath) {
			this.participant.iconPath = this.options.iconPath;
		}

		this.disposables.push(this.participant as unknown as vscode.Disposable);

		// 2. Register LanguageModelChatProvider for model API
		const vendorId = (this.options.vendorId || this.id).replace(/[^a-zA-Z0-9]/g, "");
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(vendorId, this);
		this.disposables.push(providerDisposable);

		console.log(`[ACPUnifiedProvider] Registered ChatParticipant: ${this.id}`);
		console.log(`[ACPUnifiedProvider] Registered LanguageModelChatProvider: ${vendorId}`);

		return {
			dispose: () => this.dispose(),
		};
	}

	// =========================================================================
	// LanguageModelChatProvider Interface Implementation
	// =========================================================================

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

		if (token.isCancellationRequested) {
			return;
		}

		console.log("[ACPUnifiedProvider] ===== LM REQUEST =====");
		console.log(`[ACPUnifiedProvider] Model: ${model.id}, Messages: ${messages.length}`);

		try {
			// Initialize connection if needed
			if (!this.connection) {
				const initResult = await this.initializeClient();
				if (!initResult.success) {
					throw new Error(`Failed to initialize: ${initResult.error}`);
				}
			}

			if (token.isCancellationRequested) {
				return;
			}

			// Get or create session for this model
			let session = this.sessions.get(model.id);
			if (!session) {
				const sessionResult = await this.clientManager.newSession(this.connection!, {
					cwd: this.options.clientConfig.cwd ?? process.cwd(),
				});
				if (!sessionResult.success) {
					throw new Error(`Failed to create session: ${sessionResult.error}`);
				}
				session = { connection: this.connection!, sessionId: sessionResult.sessionId! };
				this.sessions.set(model.id, session);
			}

			if (token.isCancellationRequested) {
				return;
			}

			// Convert VS Code messages to ACP format
			const prompt = this.convertMessagesToPrompt(messages);

			// Stream response using LanguageModelChatProvider format
			await this.streamLMResponse(session, prompt, progress, token);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[ACPUnifiedProvider] LM Error: ${errorMessage}`);
			throw error;
		}
	}

	async provideTokenCount(_model: vscode.LanguageModelChatInformation, text: string): Promise<number> {
		// Simple token estimation (4 characters per token on average)
		return Math.ceil(text.length / 4);
	}

	// =========================================================================
	// ChatParticipant Request Handler - Rich UI
	// =========================================================================

	/**
	 * Chat request handler for ChatParticipant.
	 * Provides rich UI with tool invocations, thinking progress, etc.
	 */
	private async chatRequestHandler(
		request: vscode.ChatRequest,
		_context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<vscode.ChatResult> {
		console.log('[ACPUnifiedProvider] ChatParticipant request received', {
			promptLength: request.prompt?.length,
		});

		// Initialize connection if not already done
		if (!this.connection) {
			console.log('[ACPUnifiedProvider] Initializing client connection...');
			const initResult = await this.initializeClient();
			if (!initResult.success) {
				stream.markdown(`Failed to initialize: ${initResult.error ?? "Unknown error"}`);
				return { errorDetails: { message: initResult.error ?? "Initialization failed" } };
			}
			console.log('[ACPUnifiedProvider] Client initialized successfully');
		}

		try {
			// Create a new session
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

			// Send the user's message and stream the response with rich UI
			await this.streamChatResponse(session, request.prompt, stream, token);

			return {};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[ACPUnifiedProvider] Error: ${errorMessage}`);
			stream.markdown(`Error: ${errorMessage}`);
			return { errorDetails: { message: errorMessage } };
		}
	}

	// =========================================================================
	// Private Methods
	// =========================================================================

	/**
	 * Initialize the ACP client with terminal callbacks.
	 */
	private async initializeClient(): Promise<InitResult> {
		try {
			// Merge terminal callbacks into config.callbacks for proper ACP terminal support
			const configWithCallbacks: ACPClientConfig = {
				...this.options.clientConfig,
				callbacks: {
					...this.options.clientConfig.callbacks,
					createTerminal: this.terminalCallbacks.createTerminal.bind(this.terminalCallbacks),
					getTerminalOutput: this.terminalCallbacks.getTerminalOutput.bind(this.terminalCallbacks),
					releaseTerminal: this.terminalCallbacks.releaseTerminal.bind(this.terminalCallbacks),
					waitForTerminalExit: this.terminalCallbacks.waitForTerminalExit.bind(this.terminalCallbacks),
					killTerminal: this.terminalCallbacks.killTerminal.bind(this.terminalCallbacks),
				},
			};

			console.log("[ACPUnifiedProvider] Initializing client with terminal callbacks...");
			const connection = await this.clientManager.getClient(configWithCallbacks);
			const result = await this.clientManager.initialize(connection);

			if (result.success && connection) {
				this.connection = connection;
				console.log("[ACPUnifiedProvider] Client initialized successfully with terminal support");
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
	 * Stream response for ChatParticipant with rich UI (tool invocations, thinking, etc.)
	 */
	private async streamChatResponse(
		session: ACPSession,
		prompt: string,
		stream: vscode.ChatResponseStream,
		_token: vscode.CancellationToken
	): Promise<void> {
		const content: ContentBlock[] = [{ type: "text", text: prompt }];

		// Track pending tool calls
		const pendingTools = new Map<string, {
			name: string;
			rawInput?: unknown;
			command?: string;
			isTerminal: boolean;
			startTime: number;
			listenerUnsubscribe: () => void;
		}>();

		// Main listener for session updates
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

				case "agent_thought_chunk": {
					const contentObj = (updateData as { content?: { text?: string } }).content;
					const thoughtText = contentObj?.text || "";
					if (thoughtText) {
						if (stream.thinkingProgress) {
							stream.thinkingProgress({
								text: thoughtText,
								id: session.sessionId,
							});
						} else {
							stream.markdown(`💭 ${thoughtText}`);
						}
					}
					break;
				}

				case "tool_call": {
					const toolCallId = (updateData as { toolCallId?: string }).toolCallId ?? String(Date.now());
					const title = (updateData as { title?: string }).title ?? "Unknown Tool";
					const rawInput = (updateData as { rawInput?: unknown }).rawInput;
					const toolKind = (updateData as { kind?: string }).kind ?? "other";
					const toolName = title.split(" ")[0] || "tool";
					const startTime = Date.now();

					console.log(`[ACPUnifiedProvider] Tool call: ${toolName} (${toolCallId}), kind: ${toolKind}`);

					const inputObj = rawInput as { command?: string } | undefined;
					const command = inputObj?.command || "";

					// Check if this is a terminal tool by:
					// 1. ACP protocol kind = "execute" (running commands or code)
					// 2. Tool name contains terminal-related words
					const isTerminal = toolKind.toLowerCase() === "execute" || isTerminalTool(toolName);

					// Use beginToolInvocation for streaming progress (proposed API)
					if (stream.beginToolInvocation) {
						stream.beginToolInvocation(toolCallId, toolName, { partialInput: rawInput });
					}

					// Create ChatToolInvocationPart (reuse same object for updates)
					const toolPart = new vscode.ChatToolInvocationPart(toolName, toolCallId, false);
					toolPart.isConfirmed = false;
					toolPart.isComplete = false;

					const invocationMd = new vscode.MarkdownString();
					invocationMd.appendText(`🔄 Running ${toolName}`);
					if (command) {
						invocationMd.appendText(": ");
						invocationMd.appendCodeblock(command, "bash");
					}
					toolPart.invocationMessage = invocationMd;

					// Set terminal-specific data for initial progress display
					// CRITICAL: Must set toolSpecificData with correct structure for VS Code to render terminal UI
					console.log(`[ACPUnifiedProvider] isTerminal: ${isTerminal}, command: "${command}"`);
					if (isTerminal && command) {
						const terminalData: ChatTerminalToolInvocationData = {
							kind: 'terminal',  // Required for VS Code to render terminal UI
							commandLine: { original: command },
							language: "bash",
						};
						toolPart.toolSpecificData = terminalData;
						console.log(`[ACPUnifiedProvider] Set toolSpecificData:`, JSON.stringify(terminalData));
					}

					stream.push(toolPart);
					console.log(`[ACPUnifiedProvider] Pushed initial toolPart, hasToolSpecificData: ${!!toolPart.toolSpecificData}`);

					// Execute terminal command - creates a VISIBLE terminal in VS Code panel
					let terminalOutput = "";
					let exitCode: number | undefined;
					let commandDuration: number | undefined;
					let terminalId = "";

					if (isTerminal && command) {
						try {
							// Create terminal and show it in VS Code terminal panel
							const terminalResult = await this.terminalCallbacks.createTerminal(session.sessionId, command);
							terminalId = terminalResult.terminalId;

							// Show terminal explicitly to ensure it's visible
							terminalResult.show(false); // false = don't preserve focus, bring terminal to front

							// Wait for command to complete and get output
							const [outputResult, exitResult] = await Promise.all([
								this.terminalCallbacks.getTerminalOutput(session.sessionId, terminalId),
								this.terminalCallbacks.waitForTerminalExit(session.sessionId, terminalId),
							]);
							terminalOutput = outputResult.output;
							exitCode = exitResult.exitCode;
							commandDuration = Date.now() - startTime;

							console.log(`[ACPUnifiedProvider] Terminal completed: exitCode=${exitCode}, duration=${commandDuration}ms, output length=${terminalOutput.length}`);

							// Update toolPart with output and state immediately after terminal completes
							toolPart.isComplete = true;
							toolPart.isConfirmed = true;
							toolPart.isError = exitCode !== 0 && exitCode !== undefined;

							const pastTenseMd = new vscode.MarkdownString();
							pastTenseMd.appendText(exitCode === 0 ? `✅ ${toolName} completed` : `⚠️ ${toolName} exited with code ${exitCode}`);
							toolPart.pastTenseMessage = pastTenseMd;

							// Update toolSpecificData with output and state
							const terminalDataComplete: ChatTerminalToolInvocationData = {
								kind: 'terminal',  // Required for VS Code to render terminal UI
								commandLine: { original: command },
								language: "bash",
								output: { text: terminalOutput.replace(/\n/g, '\r\n') },
								state: { exitCode: exitCode ?? 0, duration: commandDuration },
							};
							toolPart.toolSpecificData = terminalDataComplete;
							console.log(`[ACPUnifiedProvider] Updated toolSpecificData:`, JSON.stringify(terminalDataComplete));

							// Push updated toolPart to reflect changes
							stream.push(toolPart);
							console.log(`[ACPUnifiedProvider] Pushed completed toolPart for terminal`);
						} catch (error) {
							terminalOutput = `Error: ${error instanceof Error ? error.message : String(error)}`;
							toolPart.isComplete = true;
							toolPart.isError = true;
							stream.push(toolPart);
						}
					}

					// Tool update listener for ACP protocol updates
					const toolListenerUnsubscribe = this.clientManager.onSessionUpdate(session.sessionId, async (toolUpdate) => {
						if (toolUpdate.update.sessionUpdate !== "tool_call_update") {
							return;
						}

						const status = (toolUpdate.update as { status?: string }).status;
						const updateToolCallId = (toolUpdate.update as { toolCallId?: string }).toolCallId;

						if (updateToolCallId !== toolCallId) {
							return;
						}

						// Extract rawInput from update (in_progress status includes actual input data)
						const updateRawInput = (toolUpdate.update as { rawInput?: unknown }).rawInput;
						const updateKind = (toolUpdate.update as { kind?: string }).kind;
						const contentData = (toolUpdate.update as { content?: Array<{ text?: string }> }).content;
						const rawOutput = (toolUpdate.update as { rawOutput?: unknown }).rawOutput;

						// Check if this is a terminal tool (may have more info in update than initial call)
						const updateInputObj = updateRawInput as { command?: string } | undefined;
						const updateCommand = updateInputObj?.command || command;
						const updateIsTerminal = (updateKind?.toLowerCase() === "execute") || isTerminal || isTerminalTool(toolName);

						console.log(`[ACPUnifiedProvider] tool_call_update: status=${status}, kind=${updateKind}, command="${updateCommand}", isTerminal=${updateIsTerminal}`);

						// If we now have command info and it's a terminal tool, update toolSpecificData
						if (status === "in_progress" && updateIsTerminal && updateCommand && !toolPart.toolSpecificData) {
							const terminalData: ChatTerminalToolInvocationData = {
								kind: 'terminal',
								commandLine: { original: updateCommand },
								language: "bash",
							};
							toolPart.toolSpecificData = terminalData;
							console.log(`[ACPUnifiedProvider] Updated toolSpecificData on in_progress:`, JSON.stringify(terminalData));
							stream.push(toolPart);
						}

						let toolResultText = terminalOutput || "";
						if (contentData && Array.isArray(contentData)) {
							for (const item of contentData) {
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

						if ((status === "completed" || status === "success") && updateToolCallId) {
							// For non-terminal tools, update and push the part
							if (!isTerminal) {
								toolPart.isComplete = true;
								toolPart.isConfirmed = true;

								const pastTenseMarkdown = new vscode.MarkdownString();
								pastTenseMarkdown.appendText(`✅ ${toolName} completed`);
								toolPart.pastTenseMessage = pastTenseMarkdown;

								stream.push(toolPart);
							}

							// Send result back to Agent
							const resultMessage: ContentBlock[] = [{ type: "text", text: toolResultText || "(no output)" }];
							await this.clientManager.prompt(session.connection, {
								sessionId: session.sessionId,
								prompt: resultMessage,
							});

							toolListenerUnsubscribe();
							pendingTools.delete(updateToolCallId);
						}
					});

					pendingTools.set(toolCallId, {
						name: toolName,
						rawInput,
						command,
						isTerminal,
						startTime,
						listenerUnsubscribe: toolListenerUnsubscribe,
					});
					break;
				}
			}
		});

		try {
			const promptResult = await this.clientManager.prompt(session.connection, {
				sessionId: session.sessionId,
				prompt: content,
			});
			console.log('[ACPUnifiedProvider] Prompt completed', { stopReason: promptResult.result?.stopReason });
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[ACPUnifiedProvider] Error: ${errorMessage}`);
			stream.markdown(`Error: ${errorMessage}`);
		} finally {
			for (const [, tool] of pendingTools) {
				tool.listenerUnsubscribe?.();
			}
			pendingTools.clear();
			mainUnsubscribe();
		}
	}

	/**
	 * Stream response for LanguageModelChatProvider (simpler API without rich UI)
	 */
	private async streamLMResponse(
		session: ACPSession,
		prompt: ContentBlock[],
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		token: vscode.CancellationToken
	): Promise<void> {
		const pendingTools = new Map<string, { name: string; result: string; listener?: () => void }>();
		let isThinking = false;

		const mainUnsubscribe = this.clientManager.onSessionUpdate(session.sessionId, async (updateData) => {
			const sessionUpdate = updateData.update.sessionUpdate;

			if (sessionUpdate === "agent_message_chunk") {
				const contentObj = (updateData.update as { content?: { text?: string } }).content;
				const text = contentObj?.text || "";
				if (text) {
					progress.report(new vscode.LanguageModelTextPart(text));
				}
				return;
			}

			if (sessionUpdate === "agent_thought_chunk") {
				const contentObj = (updateData.update as { content?: { text?: string } }).content;
				const thoughtText = contentObj?.text || "";
				const isLastChunk = (updateData.update as { isLastChunk?: boolean }).isLastChunk ?? false;

				if (hasThinkingPart && thoughtText) {
					// Use proposed LanguageModelThinkingPart API
					const vscodeMod = vscode as unknown as { LanguageModelThinkingPart: new (text: string, id?: string, metadata?: object) => vscode.LanguageModelResponsePart };
					progress.report(new vscodeMod.LanguageModelThinkingPart(thoughtText));
					isThinking = true;
				} else if (thoughtText) {
					progress.report(new vscode.LanguageModelTextPart(thoughtText));
				}

				if (isLastChunk && isThinking && hasThinkingPart) {
					const vscodeMod = vscode as unknown as { LanguageModelThinkingPart: new (text: string, id?: string, metadata?: object) => vscode.LanguageModelResponsePart };
					progress.report(new vscodeMod.LanguageModelThinkingPart("", "", { vscode_reasoning_done: true }));
					isThinking = false;
				}
				return;
			}

			if (sessionUpdate !== "tool_call") {
				return;
			}

			const toolCallId = (updateData.update as { toolCallId?: string }).toolCallId ?? String(Date.now());
			const title = (updateData.update as { title?: string }).title ?? "Unknown Tool";
			const rawInput = (updateData.update as { rawInput?: unknown }).rawInput;
			const toolName = title.split(" ")[0] || "tool";

			// Report tool call
			const inputObject = rawInput !== undefined ? (rawInput as object) : {};
			progress.report(new vscode.LanguageModelToolCallPart(toolCallId, toolName, inputObject));

			// Execute terminal if needed
			let terminalOutput = "";
			const isTerminal = isTerminalTool(toolName);
			if (isTerminal) {
				const inputObj = rawInput as { command?: string } | undefined;
				const command = inputObj?.command || "";
				if (command) {
					try {
						const terminal = await this.terminalCallbacks.createTerminal(session.sessionId, command);
						const outputResult = await this.terminalCallbacks.getTerminalOutput(session.sessionId, terminal.terminalId);
						terminalOutput = outputResult.output;
					} catch (error) {
						terminalOutput = `Error: ${error instanceof Error ? error.message : String(error)}`;
					}
				}
			}

			pendingTools.set(toolCallId, { name: toolName, result: terminalOutput });

			// Tool update listener
			this.clientManager.onSessionUpdate(session.sessionId, async (toolUpdate) => {
				if (toolUpdate.update.sessionUpdate !== "tool_call_update") {
					return;
				}

				const status = (toolUpdate.update as { status?: string }).status;
				const updateToolCallId = (toolUpdate.update as { toolCallId?: string }).toolCallId;

				if (updateToolCallId !== toolCallId) {
					return;
				}

				if ((status === "completed" || status === "success") && updateToolCallId) {
					const toolInfo = pendingTools.get(updateToolCallId);
					const combinedResult = toolInfo?.result || "";

					// Report tool result
					const toolResultContent: vscode.LanguageModelTextPart[] = [];
					if (combinedResult) {
						toolResultContent.push(new vscode.LanguageModelTextPart(combinedResult));
					}
					progress.report(new vscode.LanguageModelToolResultPart(updateToolCallId, toolResultContent));

					// Send result back to Agent
					const toolResultContentBlock: ContentBlock = {
						type: "text",
						text: `[Tool Result for ${updateToolCallId}]: ${combinedResult || "(no output)"}`
					};

					await session.connection.prompt({
						sessionId: session.sessionId,
						prompt: [toolResultContentBlock],
					});

					pendingTools.delete(updateToolCallId);
				}
			});
		});

		try {
			const result = await session.connection.prompt({
				sessionId: session.sessionId,
				prompt,
			});

			if (token.isCancellationRequested) {
				return;
			}

			const stopReasonText = this.formatStopReason(result.stopReason);
			if (stopReasonText) {
				progress.report(new vscode.LanguageModelTextPart(`\n${stopReasonText}`));
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			progress.report(new vscode.LanguageModelTextPart(`\nError: ${errorMessage}`));
			throw error;
		} finally {
			for (const [, tool] of pendingTools) {
				tool.listener?.();
			}
			pendingTools.clear();
			mainUnsubscribe();
		}
	}

	/**
	 * Convert VS Code messages to ACP ContentBlocks.
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
		}

		return prompt;
	}

	/**
	 * Extract text content from a user message.
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
			const allPartsText: string[] = [];

			for (const part of message.content) {
				if (part && typeof part === "object") {
					const partAny = part as { value?: string; data?: { type: string; data: number[] } };

					if (partAny.value) {
						allPartsText.push(String(partAny.value));
					} else if (partAny.data && partAny.data.type === "Buffer" && Array.isArray(partAny.data.data)) {
						const decoded = this.decodeUtf8(partAny.data.data);
						if (decoded) {
							allPartsText.push(decoded);
						}
					} else {
						const jsonStr = JSON.stringify(part);
						const valueMatch = jsonStr.match(/"value":"([^"]*)"/);
						if (valueMatch) {
							allPartsText.push(valueMatch[1]);
						}
					}
				}
			}

			return allPartsText.join("") || null;
		}

		return null;
	}

	/**
	 * Decode UTF-8 bytes to string.
	 */
	private decodeUtf8(bytes: number[]): string {
		const decoder = new TextDecoder("utf-8");
		const uint8Array = new Uint8Array(bytes);
		return decoder.decode(uint8Array);
	}

	/**
	 * Format stop reason for display.
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
			default:
				return "";
		}
	}

	/**
	 * Dispose of the provider and clean up resources.
	 */
	dispose(): void {
		console.log("[ACPUnifiedProvider] Disposing provider");

		// Dispose all registered components
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];

		// Dispose client manager if we own it
		if (this.ownsClientManager && this.clientManager) {
			this.clientManager.dispose();
		}

		// Clear sessions
		this.sessions.clear();
		this.connection = null;
		this.participant = null;

		// Dispose terminal adapter
		if (this.terminalAdapter && 'dispose' in this.terminalAdapter) {
			(this.terminalAdapter as { dispose: () => void }).dispose();
		}

		// Dispose terminal service
		if (this.terminalService) {
			this.terminalService.dispose();
		}
	}
}

/**
 * Register an ACP Unified Provider with VS Code.
 * Provides both ChatParticipant (rich UI) and LanguageModelChatProvider (model API).
 *
 * @param options Configuration options
 * @returns Disposable to unregister both providers
 *
 * @example
 * ```typescript
 * const disposable = registerACPUnifiedProvider({
 *     id: "my-agent",
 *     name: "My Agent",
 *     description: "An AI coding assistant",
 *     models: [{ id: "model-1", name: "Model 1" }],
 *     clientConfig: {
 *         agentMode: "stdio",
 *         agentPath: "/path/to/agent",
 *     },
 * });
 * context.subscriptions.push(disposable);
 * ```
 */
export function registerACPUnifiedProvider(options: ACPUnifiedProviderOptions): vscode.Disposable {
	const provider = new ACPUnifiedProvider(options);
	return provider.register();
}
