import { spawn, ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
	ClientSideConnection,
	type ContentBlock,
	type InitializeResponse,
	type NewSessionResponse,
	type PromptResponse,
	RequestPermissionRequest,
	RequestPermissionResponse,
	ReadTextFileRequest,
	ReadTextFileResponse,
	WriteTextFileRequest,
	WriteTextFileResponse,
	SessionNotification,
	CreateTerminalRequest,
	CreateTerminalResponse,
	TerminalOutputRequest,
	TerminalOutputResponse,
	ReleaseTerminalRequest,
	ReleaseTerminalResponse,
	WaitForTerminalExitRequest,
	WaitForTerminalExitResponse,
	KillTerminalCommandRequest,
	KillTerminalCommandResponse,
} from "@agentclientprotocol/sdk";
import { ndJsonStream } from "@agentclientprotocol/sdk";

// Re-export types from SDK for convenience
export type {
	ClientSideConnection,
	ContentBlock,
	InitializeResponse,
	NewSessionResponse,
	PromptResponse,
	RequestPermissionRequest,
	RequestPermissionResponse,
	ReadTextFileRequest,
	ReadTextFileResponse,
	WriteTextFileRequest,
	WriteTextFileResponse,
	CreateTerminalRequest,
	CreateTerminalResponse,
	TerminalOutputRequest,
	TerminalOutputResponse,
	ReleaseTerminalRequest,
	ReleaseTerminalResponse,
	WaitForTerminalExitRequest,
	WaitForTerminalExitResponse,
	KillTerminalCommandRequest,
	KillTerminalCommandResponse,
};

/**
 * Information about an agent.
 */
export interface AgentInfo {
	name: string;
	version?: string;
}

/**
 * Result of an initialization attempt.
 */
export interface InitResult {
	success: boolean;
	agentInfo?: AgentInfo;
	error?: string;
}

/**
 * Result of a new session attempt.
 */
export interface NewSessionResult {
	success: boolean;
	sessionId?: string;
	error?: string;
}

/**
 * Result of a prompt attempt.
 */
export interface PromptResult {
	success: boolean;
	result?: { stopReason: string };
	error?: string;
}

/**
 * Result of a terminal creation attempt.
 */
export interface TerminalCreateResult {
	success: boolean;
	terminalId?: string;
	error?: string;
}

/**
 * Result of a terminal output request.
 */
export interface TerminalOutputResult {
	success: boolean;
	output?: string;
	error?: string;
}

/**
 * Configuration for creating an ACP client.
 */
export interface ACPClientConfig {
	/** Transport type: "stdio" for spawned processes, "tcp" for TCP connections */
	transport: "stdio" | "tcp";
	/** Path to the agent executable (for stdio transport) */
	agentPath?: string;
	/** Arguments to pass to the agent (for stdio transport) */
	agentArgs?: string[];
	/** Hostname for TCP connection (for tcp transport) */
	hostname?: string;
	/** Port for TCP connection (for tcp transport) */
	port?: number;
	/** Environment variables for the agent process */
	env?: Record<string, string>;
	/** Working directory for the agent */
	cwd?: string;
	/** Callbacks for VS Code API integration */
	callbacks?: ClientCallbacks;
}

/**
 * MCP server configuration for session creation.
 */
export interface MCPServerConfig {
	name: string;
	type: "stdio";
	command: string;
	args?: string[];
	env?: Array<{ name: string; value: string }>;
}

/**
 * VS Code Terminal instance interface (for terminal management).
 * This provides a platform-agnostic interface for terminal operations.
 */
export interface IVsCodeTerminal {
	readonly terminalId: string;
	readonly name: string;
	sendText(text: string, shouldExecute?: boolean): void;
	show(preserveFocus?: boolean): void;
	hide(): void;
	dispose(): void;
}

/**
 * Callbacks for client implementation.
 * These allow the SDK to integrate with VS Code APIs.
 */
export interface ClientCallbacks {
	/**
	 * Creates a new terminal.
	 * @param sessionId The session ID for context
	 * @param command The command to execute
	 * @param args Command arguments
	 * @param cwd Working directory
	 */
	createTerminal?: (sessionId: string, command: string, args?: string[], cwd?: string) => Promise<IVsCodeTerminal>;
	/**
	 * Gets terminal output.
	 */
	getTerminalOutput?: (terminalId: string) => Promise<{ output: string; exitCode?: number }>;
	/**
	 * Releases a terminal.
	 */
	releaseTerminal?: (terminalId: string) => Promise<void>;
	/**
	 * Waits for terminal to exit.
	 */
	waitForTerminalExit?: (terminalId: string) => Promise<{ exitCode?: number }>;
	/**
	 * Kills a terminal command.
	 */
	killTerminal?: (terminalId: string) => Promise<void>;
	/**
	 * Reads a text file.
	 */
	readTextFile?: (path: string) => Promise<string>;
	/**
	 * Writes a text file.
	 */
	writeTextFile?: (path: string, content: string) => Promise<void>;
	/**
	 * Handles permission requests from the agent.
	 * Should return the approved option or throw to deny.
	 */
	requestPermission?: (request: {
		toolCall: { title: string; description?: string };
		options: Array<{ optionId: string; label: string }>;
	}) => Promise<string>;
}

/**
 * Complete ACP client manager that provides a high-level API over the SDK.
 * This class manages the full lifecycle of ACP connections including:
 * - Process spawning and management
 * - Connection initialization
 * - Session creation and management
 * - Message streaming
 */
export class ACPClientManager {
	private readonly clientInfo: { name: string; version: string };
	private readonly clients = new Map<string, ClientSideConnection>();
	private readonly sessions = new Map<string, { connection: ClientSideConnection; sessionId: string }>();
	private readonly processes = new Map<string, ChildProcess>();
	private readonly sessionUpdateListeners = new Map<string, Set<(update: SessionNotification) => void>>();

	constructor(clientInfo?: { name?: string; version?: string }) {
		this.clientInfo = {
			name: clientInfo?.name ?? "ACP-Client",
			version: clientInfo?.version ?? "1.0.0",
		};
	}

	/**
	 * Creates a new client connection to an agent.
	 * Supports both stdio (spawned process) and tcp (direct connection) transports.
	 */
	async getClient(config: ACPClientConfig): Promise<ClientSideConnection> {
		if (config.transport === "stdio") {
			return this.getClientStdio(config);
		} else if (config.transport === "tcp") {
			return this.getClientTcp(config);
		} else {
			throw new Error(`Unsupported transport type: ${config.transport}`);
		}
	}

	/**
	 * Creates a new client connection via stdio (spawned process).
	 */
	private async getClientStdio(config: ACPClientConfig): Promise<ClientSideConnection> {
		if (!config.agentPath) {
			throw new Error("agentPath is required for stdio transport");
		}

		const clientKey = this.getClientKey(config);

		// Check if we already have a connection for this config
		const existingClient = this.clients.get(clientKey);
		if (existingClient) {
			return existingClient;
		}

		// Spawn the agent process
		const agentProcess = this.spawnAgent(config);

		// Create streams for communication
		const writable = Writable.toWeb(agentProcess.stdin!);
		const readable = Readable.toWeb(agentProcess.stdout!) as ReadableStream<Uint8Array>;

		// Create the ACP stream using the SDK's ndJsonStream
		const stream = ndJsonStream(writable, readable);

		// Create a simple client implementation for the connection
		const client = this.createClientImplementation(config);

		// Create the ClientSideConnection
		const connection = new ClientSideConnection(() => client, stream);

		// Store the connection and process
		this.clients.set(clientKey, connection);
		this.processes.set(clientKey, agentProcess);

		return connection;
	}

	/**
	 * Creates a new client connection via TCP.
	 */
	private async getClientTcp(config: ACPClientConfig): Promise<ClientSideConnection> {
		const hostname = config.hostname ?? "127.0.0.1";
		const port = config.port ?? 8080;
		const clientKey = `tcp:${hostname}:${port}`;

		// Check if we already have a connection for this config
		const existingClient = this.clients.get(clientKey);
		if (existingClient) {
			return existingClient;
		}

		console.log(`[ACPClientManager] Connecting to TCP server: ${hostname}:${port}`);

		// Connect to TCP socket
		const socket = await new Promise<import("net").Socket>((resolve, reject) => {
			const net = require("net");
			const client = net.connect(port, hostname, () => {
				resolve(client);
			});
			client.on("error", reject);
		});

		// Create streams for communication
		const writable = Writable.toWeb(socket);
		const readable = Readable.toWeb(socket) as ReadableStream<Uint8Array>;

		// Create the ACP stream using the SDK's ndJsonStream
		const stream = ndJsonStream(writable, readable);

		// Create a simple client implementation for the connection
		const client = this.createClientImplementation(config);

		// Create the ClientSideConnection
		const connection = new ClientSideConnection(() => client, stream);

		// Store the connection (no process for TCP)
		this.clients.set(clientKey, connection);

		return connection;
	}

	/**
	 * Initializes the connection with an agent.
	 */
	async initialize(client: ClientSideConnection): Promise<InitResult> {
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
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Creates a new session with an agent.
	 */
	async newSession(
		client: ClientSideConnection,
		params: {
			cwd: string;
			mcpServers?: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }>;
		}
	): Promise<NewSessionResult> {
		try {
			// Check if newSession is available
			if (typeof client.newSession !== "function") {
				return {
					success: false,
					error: "Client does not support newSession",
				};
			}

			// Convert mcpServers to proper format with empty array as fallback
			const mcpServers = (params.mcpServers ?? []).map((server) => ({
				type: "stdio" as const,
				name: server.name,
				command: server.command,
				args: server.args ?? [],
				env: server.env ? Object.entries(server.env).map(([name, value]) => ({ name, value })) : [],
			}));

			const result = await client.newSession({
				cwd: params.cwd,
				mcpServers,
			});

			return {
				success: true,
				sessionId: result.sessionId,
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Stores a session for later use.
	 */
	addSession(sessionId: string, connection: ClientSideConnection, sessionResult: NewSessionResponse): void {
		this.sessions.set(sessionId, { connection, sessionId: sessionResult.sessionId });
	}

	/**
	 * Gets a stored session.
	 */
	getSession(sessionId: string): { connection: ClientSideConnection; sessionId: string } | undefined {
		return this.sessions.get(sessionId);
	}

	/**
	 * Registers a listener for session update notifications.
	 * @param sessionId The session ID to listen to
	 * @param listener Callback function to invoke on each update
	 * @returns A disposable to remove the listener
	 */
	onSessionUpdate(sessionId: string, listener: (update: SessionNotification) => void): () => void {
		let listeners = this.sessionUpdateListeners.get(sessionId);
		if (!listeners) {
			listeners = new Set();
			this.sessionUpdateListeners.set(sessionId, listeners);
		}
		listeners.add(listener);

		// Return unsubscribe function
		return () => {
			listeners?.delete(listener);
			if (listeners?.size === 0) {
				this.sessionUpdateListeners.delete(sessionId);
			}
		};
	}

	/**
	 * Sends a prompt to an agent and returns the result.
	 */
	async prompt(
		client: ClientSideConnection,
		params: { sessionId: string; prompt: ContentBlock[] }
	): Promise<PromptResult> {
		try {
			// Check if prompt is available
			if (typeof client.prompt !== "function") {
				return {
					success: false,
					error: "Client does not support prompt",
				};
			}

			const result = await client.prompt({
				sessionId: params.sessionId,
				prompt: params.prompt,
			});

			return {
				success: true,
				result: { stopReason: result.stopReason },
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Sets the model for a session.
	 * Uses the unstable session/set_model method (ACP spec).
	 * @param client The ACP client connection
	 * @param sessionId The session ID to set the model for
	 * @param modelId The model ID to set
	 * @returns Success status or error message
	 */
	async setSessionModel(
		client: ClientSideConnection,
		sessionId: string,
		modelId: string
	): Promise<{ success: boolean; error?: string }> {
		try {
			// Check if setSessionModel is available
			if (typeof (client as any).unstable_setSessionModel !== "function") {
				return {
					success: false,
					error: "Client does not support setSessionModel (unstable feature)",
				};
			}

			const result = await (client as any).unstable_setSessionModel({
				sessionId,
				modelId,
			});

			return { success: true };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * Sends a message and streams the response.
	 * Returns an async iterator for processing streaming updates.
	 */
	async *streamPrompt(
		client: ClientSideConnection,
		params: { sessionId: string; prompt: ContentBlock[] }
	): AsyncGenerator<{ type: string; [key: string]: unknown }> {
		const session = this.sessions.get(params.sessionId);
		if (!session) {
			throw new Error(`Session not found: ${params.sessionId}`);
		}

		// Start the prompt
		const resultPromise = client.prompt({
			sessionId: params.sessionId,
			prompt: params.prompt,
		});

		// Note: For full streaming support, we'd need to implement a custom
		// streaming connection that yields session updates as they arrive.
		// For now, we await the full result.
		const result = await resultPromise;

		yield { type: "complete", stopReason: result.stopReason };
	}

	/**
	 * Cleans up a specific client connection.
	 */
	async disposeClient(clientKey: string): Promise<void> {
		const clientProcess = this.processes.get(clientKey);
		if (clientProcess && !clientProcess.killed) {
			clientProcess.kill("SIGTERM");
		}

		this.processes.delete(clientKey);
		this.clients.delete(clientKey);

		// Clean up any sessions for this client
		for (const [sessionId, session] of this.sessions.entries()) {
			const clientKeyForSession = Array.from(this.clients.entries()).find(
				([, conn]) => conn === session.connection
			)?.[0];
			if (clientKeyForSession === clientKey) {
				this.sessions.delete(sessionId);
			}
		}
	}

	/**
	 * Cleans up all client connections.
	 */
	async dispose(): Promise<void> {
		for (const clientKey of this.clients.keys()) {
			await this.disposeClient(clientKey);
		}
	}

	/**
	 * Spawns an agent process with stdio communication.
	 */
	private spawnAgent(config: ACPClientConfig): ChildProcess {
		const agentPath = config.agentPath!; // Safe: only called for stdio transport
		const args = config.agentArgs ?? [];

		console.log(`[ACPClientManager] Spawning agent: ${agentPath} ${args.join(" ")}`);
		console.log(`[ACPClientManager] Working directory: ${config.cwd ?? process.cwd()}`);

		const agentProcess = spawn(agentPath, args, {
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...process.env,
				...config.env,
			},
			cwd: config.cwd,
		});

		// Handle process errors
		agentProcess.on("error", (error: Error) => {
			console.error(`[ACPClientManager] Process error: ${error.message}`);
			console.error(`[ACPClientManager] Could not spawn agent at path: ${agentPath}`);
		});

		// Log stderr for debugging
		agentProcess.stderr?.on("data", (data: Buffer) => {
			const message = data.toString().trim();
			console.error(`[ACPClientManager] Agent stderr: ${message}`);
		});

		// Log stdout for debugging (ACP uses stdout for JSON-RPC)
		agentProcess.stdout?.on("data", (data: Buffer) => {
			const message = data.toString().trim();
			if (message) {
				console.log(`[ACPClientManager] Agent stdout: ${message.substring(0, 200)}...`);
			}
		});

		return agentProcess;
	}

	/**
	 * Creates a unique key for a client configuration.
	 */
	private getClientKey(config: ACPClientConfig): string {
		return `${config.agentPath}:${(config.agentArgs ?? []).join(" ")}`;
	}

	/**
	 * Creates a client implementation for the SDK connection.
	 * This implements the full Client interface for the ACP protocol.
	 */
	private createClientImplementation(config: ACPClientConfig) {
		const callbacks = config.callbacks ?? {};
		const terminalIdToHandle = new Map<string, { name: string; command: string; args?: string[]; cwd?: string }>();
		const sessionIdToConnection = new Map<string, ClientSideConnection>();

		// Capture reference to sessionUpdateListeners for use in callbacks
		const listenersMap = this.sessionUpdateListeners;

		return {
			/**
			 * Handles permission requests from the agent.
			 * Uses callback if provided, otherwise auto-approves.
			 */
			async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
				const toolCall = params.toolCall;
				const options = params.options.map((opt) => ({
					optionId: opt.optionId,
					label: opt.name,
				}));

				if (callbacks.requestPermission) {
					const optionId = await callbacks.requestPermission({
						toolCall: {
							title: toolCall.title ?? "Unknown",
							// description is not available in ToolCallUpdate, use content as fallback
						},
						options,
					});
					return {
						outcome: { outcome: "selected", optionId },
					};
				}

				// Default: auto-approve first option
				console.log(`[ACP Client] Permission requested: ${toolCall.title ?? "Unknown"}`);
				return {
					outcome: {
						outcome: "selected",
						optionId: options[0]?.optionId ?? "default",
					},
				};
			},

			/**
			 * Handles session update notifications from the agent.
			 * Forwards updates to registered listeners via onSessionUpdate().
			 */
			async sessionUpdate(params: SessionNotification): Promise<void> {
				// Find the session ID from the update context if available
				// The SessionNotification structure contains session info
				const sessionId = (params as any).sessionId ?? (params.update as any).sessionId ?? "";

				// Forward to all registered listeners for this session
				const listeners = listenersMap.get(sessionId);
				if (listeners) {
					for (const listener of listeners) {
						try {
							listener(params);
						} catch (error) {
							console.error(`[ACPClientManager] Error in sessionUpdate listener: ${error}`);
						}
					}
				}

				// Also log message chunks for debugging
				const update = params.update;
				if (update.sessionUpdate === "agent_message_chunk" && update.content && "text" in update.content) {
					process.stdout.write(String(update.content.text));
				}
			},

			/**
			 * Reads a text file.
			 * Uses callback if provided, otherwise falls back to node:fs.
			 */
			async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
				if (callbacks.readTextFile) {
					const content = await callbacks.readTextFile(params.path);
					return { content };
				}

				// Default: use node:fs
				const { readFileSync } = await import("node:fs");
				try {
					const content = readFileSync(params.path, "utf-8");
					return { content };
				} catch {
					// Return empty content if file doesn't exist
					return { content: "" };
				}
			},

			/**
			 * Writes a text file.
			 * Uses callback if provided, otherwise falls back to node:fs.
			 */
			async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
				if (callbacks.writeTextFile) {
					await callbacks.writeTextFile(params.path, params.content);
					return {};
				}

				// Default: use node:fs
				const { writeFileSync } = await import("node:fs");
				writeFileSync(params.path, params.content);
				return {};
			},

			/**
			 * Creates a new terminal for executing commands.
			 * Uses callback if provided, otherwise stores terminal info for later use.
			 */
			async createTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
				const terminalId = `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
				const cwd = params.cwd ?? undefined;

				if (callbacks.createTerminal) {
					const terminal = await callbacks.createTerminal(params.sessionId, params.command, params.args, cwd);
					terminalIdToHandle.set(terminal.terminalId, {
						name: terminal.name,
						command: params.command,
						args: params.args,
						cwd,
					});
					return { terminalId: terminal.terminalId };
				}

				// Store terminal info for potential use with terminalOutput
				terminalIdToHandle.set(terminalId, {
					name: params.sessionId,
					command: params.command,
					args: params.args,
					cwd,
				});

				console.log(`[ACP Client] Terminal created: ${params.command} ${(params.args ?? []).join(" ")}`);
				return { terminalId };
			},

			/**
			 * Gets the current output and exit status of a terminal.
			 */
			async terminalOutput(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
				if (callbacks.getTerminalOutput) {
					const result = await callbacks.getTerminalOutput(params.terminalId);
					return {
						output: result.output,
						truncated: false,
						exitStatus: result.exitCode !== undefined ? { exitCode: result.exitCode } : undefined,
					};
				}

				// Default: return empty output
				return { output: "", truncated: true };
			},

			/**
			 * Releases a terminal and frees all associated resources.
			 */
			async releaseTerminal(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse | void> {
				if (callbacks.releaseTerminal) {
					await callbacks.releaseTerminal(params.terminalId);
				}
				terminalIdToHandle.delete(params.terminalId);
			},

			/**
			 * Waits for a terminal command to exit and returns its exit status.
			 */
			async waitForTerminalExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
				if (callbacks.waitForTerminalExit) {
					const result = await callbacks.waitForTerminalExit(params.terminalId);
					return { exitCode: result.exitCode };
				}

				// Default: return undefined exit status
				return { exitCode: undefined };
			},

			/**
			 * Kills a terminal command without releasing the terminal.
			 */
			async killTerminal(params: KillTerminalCommandRequest): Promise<KillTerminalCommandResponse | void> {
				if (callbacks.killTerminal) {
					await callbacks.killTerminal(params.terminalId);
				}
			},
		};
	}
}
