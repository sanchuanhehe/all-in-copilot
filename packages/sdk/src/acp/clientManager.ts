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
};

/**
 * Configuration for creating an ACP client.
 */
export interface ACPClientConfig {
	/** Transport type (currently only "stdio" supported) */
	transport: "stdio";
	/** Path to the agent executable */
	agentPath: string;
	/** Arguments to pass to the agent */
	agentArgs?: string[];
	/** Environment variables for the agent process */
	env?: Record<string, string>;
	/** Working directory for the agent */
	cwd?: string;
}

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

	constructor(clientInfo?: { name?: string; version?: string }) {
		this.clientInfo = {
			name: clientInfo?.name ?? "ACP-Client",
			version: clientInfo?.version ?? "1.0.0",
		};
	}

	/**
	 * Creates a new client connection to an agent via stdio.
	 */
	async getClient(config: ACPClientConfig): Promise<ClientSideConnection> {
		if (config.transport !== "stdio") {
			throw new Error(`Unsupported transport type: ${config.transport}`);
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
		params: { cwd: string; mcpServers?: Array<{ name: string; command: string; args?: string[]; env?: Record<string, string> }> }
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
			const mcpServers = (params.mcpServers ?? []).map(server => ({
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
		const agentProcess = spawn(config.agentPath, config.agentArgs ?? [], {
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
		});

		// Log stderr for debugging
		agentProcess.stderr?.on("data", (data: Buffer) => {
			console.error(`[ACPClientManager] Agent stderr: ${data.toString().trim()}`);
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
	 */
	private createClientImplementation(_config: ACPClientConfig): {
		requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse>;
		sessionUpdate(params: SessionNotification): Promise<void>;
		readTextFile?(params: ReadTextFileRequest): Promise<ReadTextFileResponse>;
		writeTextFile?(params: WriteTextFileRequest): Promise<WriteTextFileResponse>;
	} {
		return {
			async requestPermission(params) {
				console.log(`[ACP Client] Permission requested: ${params.toolCall.title}`);

				// Auto-approve for now - in a real implementation, this would show a UI
				return {
					outcome: {
						outcome: "selected",
						optionId: params.options[0]?.optionId ?? "default",
					},
				};
			},

			async sessionUpdate(params) {
				const update = params.update;
				if (update.sessionUpdate === "agent_message_chunk" && update.content && "text" in update.content) {
					process.stdout.write(String(update.content.text));
				}
			},

			async readTextFile(params) {
				const { readFileSync } = await import("node:fs");
				try {
					const content = readFileSync(params.path, "utf-8");
					return { content };
				} catch {
					// Return empty content if file doesn't exist
					return { content: "" };
				}
			},

			async writeTextFile(params) {
				const { writeFileSync } = await import("node:fs");
				writeFileSync(params.path, params.content);
				return {};
			},
		};
	}
}
