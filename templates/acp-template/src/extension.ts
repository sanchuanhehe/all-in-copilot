/**
 * ACP Agent Extension
 * ============================
 * VS Code extension that integrates with external ACP-compatible agent servers.
 * Uses @all-in-copilot/sdk for full ACP protocol support.
 */

import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import { ACPClientManager, ACPProvider, type ContentBlock } from "@all-in-copilot/sdk";
import type { ACPModelInfo } from "@all-in-copilot/sdk";
import {
	AGENT_CONFIG,
	getACPModels,
	getOpenCodeConfig,
	getWorkspaceFolder,
	toACPClientConfig,
	setRuntimeConnection,
} from "./config";

/**
 * Get the active agent configuration (throws if not available)
 */
function getAgentConfig(): NonNullable<typeof AGENT_CONFIG> {
	if (!AGENT_CONFIG) {
		throw new Error("Agent not configured. OpenCode may not be in PATH.");
	}
	return AGENT_CONFIG;
}

/**
 * Extension context singleton
 */
let extensionContext: vscode.ExtensionContext | null = null;
let clientManager: ACPClientManager | null = null;
let acpProvider: ACPProvider | null = null;
let opencodeProcess: ChildProcess | null = null;
let opencodeOutputChannel: vscode.OutputChannel | null = null;

/**
 * Get the extension context (lazy initialization)
 */
export function getExtensionContext(): vscode.ExtensionContext {
	if (!extensionContext) {
		throw new Error("Extension not activated");
	}
	return extensionContext;
}

/**
 * Get the ACP client manager
 */
export function getClientManager(): ACPClientManager | null {
	return clientManager;
}

/**
 * Log message to output channel and console
 */
function logToChannel(message: string): void {
	const timestamp = new Date().toLocaleTimeString();
	const logMessage = `[${timestamp}] ${message}`;
	console.log(logMessage);
	opencodeOutputChannel?.appendLine(logMessage);
}

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	extensionContext = context;

	// Create output channel for OpenCode logs
	opencodeOutputChannel = vscode.window.createOutputChannel("OpenCode Agent");
	context.subscriptions.push(opencodeOutputChannel);

	// Check if OpenCode is available
	const opencodeConfig = getOpenCodeConfig();
	if (!opencodeConfig) {
		// Show info message and don't activate
		const installCmd = "OpenCode Agent: Install OpenCode";
		const selected = await vscode.window.showInformationMessage(
			"ACP Agent Provider requires OpenCode to be installed and in PATH.",
			{ modal: true },
			installCmd
		);

		if (selected === installCmd) {
			vscode.env.openExternal(vscode.Uri.parse("https://opencode.ai/download"));
		}

		logToChannel("[ACP Agent] OpenCode not found in PATH, extension not activated");
		return;
	}

	// From here on, opencodeConfig is guaranteed to be non-null
	// Copy values for use in async functions where TypeScript can't track nullability
	const agentName = opencodeConfig.name;
	const agentCommand = opencodeConfig.command;
	const agentEnv = opencodeConfig.env;
	const agentCwd = opencodeConfig.cwd;
	const agentId = opencodeConfig.id;

	logToChannel(`[${agentName}] Activating ACP extension...`);

	/**
	 * Start OpenCode ACP server and wait for it to be ready.
	 * OpenCode ACP runs as a TCP server and uses CLAUDE_CODE_SSE_PORT env var.
	 */
	async function startOpenCodeACP(): Promise<{ port: number; hostname: string }> {
		logToChannel(`[${agentName}] Starting OpenCode ACP server...`);

		// Prepare environment with a unique port for this session
		const envWithPort = {
			...process.env,
			...agentEnv,
		};

		// Start OpenCode as a background process
		opencodeProcess = spawn(agentCommand, ["acp", "--print-logs"], {
			stdio: ["ignore", "pipe", "pipe"],
			env: envWithPort,
			cwd: agentCwd ?? getWorkspaceFolder(),
			detached: false,
		});

		// Log stdout/stderr to output channel
		opencodeProcess.stdout?.on("data", (data: Buffer) => {
			const message = data.toString().trim();
			if (message) {
				logToChannel(message);
			}
		});

		opencodeProcess.stderr?.on("data", (data: Buffer) => {
			const message = data.toString().trim();
			if (message) {
				logToChannel(`[STDERR] ${message}`);
			}
		});

		// Handle process exit
		opencodeProcess.on("error", (error) => {
			logToChannel(`[ERROR] Process error: ${error.message}`);
		});

		opencodeProcess.on("exit", (code) => {
			if (code !== 0) {
				logToChannel(`[WARN] Process exited with code ${code}`);
			} else {
				logToChannel(`[INFO] Process exited normally`);
			}
		});

		// Wait for the server to be ready
		// OpenCode outputs "Set CLAUDE_CODE_SSE_PORT=XXXXX" when it starts listening
		const port = await new Promise<number>((resolve, reject) => {
			const timeout = setTimeout(() => {
				logToChannel(`[ERROR] Timeout waiting for OpenCode ACP server to start`);
				reject(new Error("Timeout waiting for OpenCode ACP server to start"));
			}, 30000);

			const dataHandler = (data: Buffer) => {
				const message = data.toString();
				
				// Look for "Set CLAUDE_CODE_SSE_PORT=XXXXX" - this is the actual port being used
				const portMatch = message.match(/Set CLAUDE_CODE_SSE_PORT=(\d+)/);
				if (portMatch) {
					const port = parseInt(portMatch[1], 10);
					logToChannel(`[INFO] Detected SSE port: ${port}`);
					clearTimeout(timeout);
					opencodeProcess?.stdout?.off("data", dataHandler);
					opencodeProcess?.stderr?.off("data", dataHandler);
					resolve(port);
					return;
				}
				
				// Check for "acp-command setup connection" - server is initializing
				if (message.includes("acp-command") && message.includes("setup connection")) {
					logToChannel(`[INFO] ACP server connection setup started`);
				}
				
				// Check for "status=started" - server is ready
				if (message.includes("status=started")) {
					logToChannel(`[INFO] Server status: started`);
				}

				// Check for "global event connected" - client can connect
				if (message.includes("global event connected")) {
					logToChannel(`[INFO] Global event connection established`);
				}
			};

			opencodeProcess?.stdout?.on("data", dataHandler);

			// Also check stderr for port information
			const stderrHandler = (data: Buffer) => {
				const message = data.toString();
				const portMatch = message.match(/Set CLAUDE_CODE_SSE_PORT=(\d+)/);
				if (portMatch) {
					const port = parseInt(portMatch[1], 10);
					logToChannel(`[INFO] Detected SSE port from stderr: ${port}`);
					clearTimeout(timeout);
					opencodeProcess?.stderr?.off("data", stderrHandler);
					resolve(port);
				}
			};
			opencodeProcess?.stderr?.on("data", stderrHandler);
		});

		logToChannel(`[${agentName}] OpenCode ACP server started on port ${port}`);
		return { port, hostname: "127.0.0.1" };
	}

	try {
		// Start OpenCode ACP server
		const { port, hostname } = await startOpenCodeACP();

		// Store the server connection info for later use by toACPClientConfig
		setRuntimeConnection(hostname, port);

		// Initialize the ACP client manager
		clientManager = new ACPClientManager({
			name: agentId,
			version: "1.0.0",
		});

		// Get available models
		const models = getACPModels();

		// Create client config with TCP connection details
		const clientConfig = toACPClientConfig({
			id: agentId,
			name: agentName,
			participantId: opencodeConfig.participantId,
			command: agentCommand,
			args: ["acp"],
			env: agentEnv,
			cwd: agentCwd,
			hostname: hostname,
			port: port,
		});

		// Create and register the ACP provider using the SDK
		acpProvider = new ACPProvider({
			models,
			clientConfig,
			clientInfo: {
				name: agentId,
				version: "1.0.0",
			},
		});

		// Register with VS Code's language model system
		// Vendor must be globally unique - use simple ID without dots
		const vendorId = agentId.replace(/[^a-zA-Z0-9]/g, "");
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(vendorId, acpProvider);
		context.subscriptions.push(providerDisposable);

		// Register chat participant for conversational AI
		const chatParticipant = vscode.chat.createChatParticipant(
			opencodeConfig.participantId,
			async (
				request: vscode.ChatRequest,
				context: vscode.ChatContext,
				response: vscode.ChatResponseStream,
				token: vscode.CancellationToken
			) => {
				await handleChatRequest(request, context, response, token);
			}
		);

		context.subscriptions.push(chatParticipant);

		// Register configuration command
		const configCommand = vscode.commands.registerCommand(`${agentId}.configure`, async () => {
			await showConfigurationPanel();
		});
		context.subscriptions.push(configCommand);

		// Register restart command
		const restartCommand = vscode.commands.registerCommand(`${agentId}.restart`, async () => {
			await restartAgent();
		});
		context.subscriptions.push(restartCommand);

		logToChannel(`[${agentName}] Extension activated successfully`);
		logToChannel(`[${agentName}] Registered models: ${models.map((m) => m.id).join(", ")}`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		logToChannel(`[${agentName}] Activation failed: ${errorMessage}`);

		// Show error notification
		vscode.window.showErrorMessage(`Failed to initialize ${agentName}: ${errorMessage}`, "View Logs");

		throw error;
	}
}

/**
 * Extension deactivation
 */
export async function deactivate(): Promise<void> {
	const agentName = getAgentConfig().name;
	logToChannel(`[${agentName}] Deactivating extension...`);

	// Clean up provider first
	if (acpProvider) {
		await acpProvider.dispose();
		acpProvider = null;
	}

	// Clean up client manager
	if (clientManager) {
		await clientManager.dispose();
		clientManager = null;
	}

	// Kill OpenCode ACP process
	if (opencodeProcess) {
		logToChannel(`[${agentName}] Stopping OpenCode ACP server...`);
		opencodeProcess.kill("SIGTERM");
		opencodeProcess = null;
	}

	extensionContext = null;
	logToChannel(`[${agentName}] Extension deactivated`);
	
	// Dispose output channel
	opencodeOutputChannel?.dispose();
	opencodeOutputChannel = null;
}

/**
 * Handles chat requests from VS Code Chat
 */
async function handleChatRequest(
	request: vscode.ChatRequest,
	_context: vscode.ChatContext,
	response: vscode.ChatResponseStream,
	token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
	const userPrompt = request.prompt;
	const agentConfig = getAgentConfig();

	// Stream a response
	response.markdown(`*Connected to ${agentConfig.name}*\n\n`);
	response.markdown(`Processing: "${userPrompt}"\n\n`);

	if (!clientManager) {
		response.markdown("Error: ACP client not initialized");
		return { metadata: { agent: agentConfig.name } };
	}

	try {
		// Check for cancellation
		if (token.isCancellationRequested) {
			return { metadata: { agent: agentConfig.name } };
		}

		// Create client connection
		const clientConfig = toACPClientConfig(agentConfig);
		const connection = await clientManager.getClient(clientConfig);

		// Check for cancellation
		if (token.isCancellationRequested) {
			return { metadata: { agent: agentConfig.name } };
		}

		// Initialize connection
		const initResult = await clientManager.initialize(connection);
		if (!initResult.success) {
			response.markdown(`Failed to initialize agent: ${initResult.error}`);
			return { metadata: { agent: agentConfig.name } };
		}

		// Create session
		const sessionResult = await clientManager.newSession(connection, {
			cwd: agentConfig.cwd ?? getWorkspaceFolder(),
		});

		if (!sessionResult.success) {
			response.markdown(`Failed to create session: ${sessionResult.error}`);
			return { metadata: { agent: agentConfig.name } };
		}

		// Get session ID
		const sessionId = sessionResult.sessionId;
		if (!sessionId) {
			response.markdown("Failed to create session: No session ID returned");
			return { metadata: { agent: agentConfig.name } };
		}

		// Store session
		clientManager.addSession("chat", connection, { sessionId });

		// Convert user message to ACP format
		const prompt: ContentBlock[] = [{ type: "text", text: userPrompt }];

		// Send prompt and stream response
		response.markdown("*Agent response:*\n\n");

		for await (const update of clientManager.streamPrompt(connection, {
			sessionId,
			prompt,
		})) {
			if (token.isCancellationRequested) {
				break;
			}

			if (update.type === "complete") {
				response.markdown(`\n\n*(Stopped: ${update.stopReason})*`);
			}
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		response.markdown(`\n\n*Error:* ${errorMessage}`);
	}

	return {
		metadata: {
			agent: agentConfig.name,
		},
	};
}

/**
 * Show configuration panel for the agent
 */
async function showConfigurationPanel(): Promise<void> {
	const agentConfig = getAgentConfig();

	const items: vscode.QuickPickItem[] = [
		{
			label: "$(info) Agent Information",
			detail: `Name: ${agentConfig.name}\nID: ${agentConfig.id}\nCommand: ${agentConfig.command} ${agentConfig.args.join(" ")}`,
		},
		{ label: "$(refresh) Restart Agent", description: "restart" },
		{ label: "$(debug-alt) View Logs", description: "logs" },
	];

	const selection = await vscode.window.showQuickPick(items, {
		placeHolder: `Configure ${agentConfig.name}`,
	});

	if (!selection) {
		return;
	}

	if (selection.label === "$(refresh) Restart Agent") {
		await restartAgent();
	} else if (selection.label === "$(debug-alt) View Logs") {
		await showLogs();
	}
}

/**
 * Restart the agent connection
 */
async function restartAgent(): Promise<void> {
	const agentConfig = getAgentConfig();

	const _progress = await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Restarting ${agentConfig.name}...`,
			cancellable: false,
		},
		async () => {
			try {
				// Dispose of existing connections
				if (acpProvider) {
					await acpProvider.dispose();
				}

				if (clientManager) {
					await clientManager.dispose();
				}

				// Reinitialize
				clientManager = new ACPClientManager({
					name: agentConfig.id,
					version: "1.0.0",
				});

				acpProvider = new ACPProvider({
					models: getACPModels(),
					clientConfig: toACPClientConfig(agentConfig),
					clientInfo: {
						name: agentConfig.id,
						version: "1.0.0",
					},
				});

				vscode.window.showInformationMessage(`${agentConfig.name} restarted successfully`);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				vscode.window.showErrorMessage(`Failed to restart ${agentConfig.name}: ${message}`);
			}
		}
	);
}

/**
 * Show agent logs
 */
async function showLogs(): Promise<void> {
	const agentConfig = getAgentConfig();

	// Create output channel for logs
	const outputChannel = vscode.window.createOutputChannel(agentConfig.name);
	outputChannel.show();

	// Add header
	outputChannel.appendLine(`=== ${agentConfig.name} Logs ===`);
	outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);
	outputChannel.appendLine(`Agent: ${agentConfig.name}`);
	outputChannel.appendLine(`Command: ${agentConfig.command} ${agentConfig.args.join(" ")}`);
	outputChannel.appendLine("");

	if (clientManager) {
		outputChannel.appendLine("Client manager is active");
	} else {
		outputChannel.appendLine("Client manager is not initialized");
	}

	outputChannel.appendLine("");
	outputChannel.appendLine("Agent logs will appear here...");
}
