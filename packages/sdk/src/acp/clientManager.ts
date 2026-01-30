import { ClientSideConnection, ContentBlock } from "@agentclientprotocol/sdk";

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
 * Simple ACP client manager that provides a higher-level API over the SDK.
 * This is a placeholder that demonstrates the API design.
 * For full functionality, use the SDK directly.
 */
export class ACPClientManager {
	private readonly clientInfo: { name: string; version: string };

	constructor(clientInfo?: { name?: string; version?: string }) {
		this.clientInfo = {
			name: clientInfo?.name ?? "ACP-Client",
			version: clientInfo?.version ?? "1.0.0",
		};
	}

	/**
	 * Creates a new client connection to an agent.
	 */
	async getClient(_config: ACPClientConfig): Promise<ClientSideConnection> {
		throw new Error("Use the SDK directly for client connections. See @agentclientprotocol/sdk");
	}

	/**
	 * Initializes the connection with an agent.
	 */
	async initialize(_client: ClientSideConnection): Promise<InitResult> {
		throw new Error("Use the SDK directly for initialization. See @agentclientprotocol/sdk");
	}

	/**
	 * Creates a new session with an agent.
	 */
	async newSession(_client: ClientSideConnection, _params: { cwd: string }): Promise<string> {
		throw new Error("Use the SDK directly for sessions. See @agentclientprotocol/sdk");
	}

	/**
	 * Sends a prompt to an agent and returns the stop reason.
	 */
	async prompt(_client: ClientSideConnection, _params: { sessionId: string; prompt: ContentBlock[] }): Promise<string> {
		throw new Error("Use the SDK directly for prompting. See @agentclientprotocol/sdk");
	}

	/**
	 * Cleans up all client connections.
	 */
	async dispose(): Promise<void> {
		// No-op in this simple implementation
	}
}
