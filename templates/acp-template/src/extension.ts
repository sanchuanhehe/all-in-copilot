/**
 * ACP Agent Extension
 * ============================
 * VS Code extension that integrates with external ACP-compatible agent servers.
 * Uses @all-in-copilot/sdk for full ACP protocol support.
 */

import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import {
	ACPClientManager,
	ACPProvider,
	type ACPModelInfo,
	type ContentBlock,
} from "@all-in-copilot/sdk";
import {
	AGENT_CONFIG,
	getACPModels,
	getOpenCodeConfig,
	getWorkspaceFolder,
	toACPClientConfig,
	setRuntimeConnection,
} from "./config";

/**
 * Extension context singleton
 */
let extensionContext: vscode.ExtensionContext | null = null;
let clientManager: ACPClientManager | null = null;
let acpProvider: ACPProvider | null = null;
let opencodeProcess: ChildProcess | null = null;

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
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	extensionContext = context;

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

		console.log("[ACP Agent] OpenCode not found in PATH, extension not activated");
		return;
	}

	console.log(`[${opencodeConfig.name}] Activating ACP extension...`);

	/**
	 * Start OpenCode ACP server and wait for it to be ready.
	 * OpenCode ACP runs as a TCP server.
	 */
	async function startOpenCodeACP(): Promise<{ port: number; hostname: string }> {
		console.log(`[${opencodeConfig.name}] Starting OpenCode ACP server...`);

		// Start OpenCode as a background process
		opencodeProcess = spawn(opencodeConfig.command, ["acp", "--print-logs"], {
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				...opencodeConfig.env,
			},
			cwd: opencodeConfig.cwd ?? getWorkspaceFolder(),
			detached: false,
		});

		// Log stdout/stderr for debugging
		opencodeProcess.stdout?.on("data", (data: Buffer) => {
			const message = data.toString().trim();
			if (message) {
				console.log(`[${opencodeConfig.name}] ${message}`);
			}
		});

		opencodeProcess.stderr?.on("data", (data: Buffer) => {
			const message = data.toString().trim();
			if (message) {
				console.error(`[${opencodeConfig.name}] ${message}`);
			}
		});

		// Handle process exit
		opencodeProcess.on("error", (error) => {
			console.error(`[${opencodeConfig.name}] Process error: ${error.message}`);
		});

		opencodeProcess.on("exit", (code) => {
			if (code !== 0) {
				console.error(`[${opencodeConfig.name}] Process exited with code ${code}`);
			}
		});

		// Wait for the server to be ready and extract port from logs
		// OpenCode will print something like "Listening on 127.0.0.1:8080"
		const port = await new Promise<number>((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error("Timeout waiting for OpenCode ACP server to start"));
			}, 10000);

			const dataHandler = (data: Buffer) => {
				const message = data.toString();
				// Look for port information in the output
				const portMatch = message.match(/Listening on .*:(\d+)/);
				if (portMatch) {
					const port = parseInt(portMatch[1], 10);
					clearTimeout(timeout);
					opencodeProcess?.stdout?.off("data", dataHandler);
					resolve(port);
				}
			};

			opencodeProcess?.stdout?.on("data", dataHandler);
		});

		console.log(`[${opencodeConfig.name}] OpenCode ACP server started on port ${port}`);
		return { port, hostname: "127.0.0.1" };
	}

	try {
		// Start OpenCode ACP server
		const { port, hostname } = await startOpenCodeACP();

		// Store the server connection info for later use by toACPClientConfig
		setRuntimeConnection(hostname, port);

		// Initialize the ACP client manager
		clientManager = new ACPClientManager({
			name: opencodeConfig.id,
			version: "1.0.0",
		});

		// Get available models
		const models = getACPModels();

		// Create client config with TCP connection details
		const clientConfig = toACPClientConfig({
			...opencodeConfig,
			hostname: hostname,
			port: port,
		});

		// Create and register the ACP provider using the SDK
		acpProvider = new ACPProvider({
			models,
			clientConfig,
			clientInfo: {
				name: opencodeConfig.id,
				version: "1.0.0",
			},
		});

		// Register with VS Code's language model system
		// Vendor must be globally unique - use simple ID without dots
		const vendorId = opencodeConfig.id.replace(/[^a-zA-Z0-9]/g, "");
		const providerDisposable = vscode.lm.registerLanguageModelChatProvider(
			vendorId,
			acpProvider
		);
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
		const configCommand = vscode.commands.registerCommand(
			`${opencodeConfig.id}.configure`,
			async () => {
				await showConfigurationPanel();
			}
		);
		context.subscriptions.push(configCommand);

		// Register restart command
		const restartCommand = vscode.commands.registerCommand(
			`${opencodeConfig.id}.restart`,
			async () => {
				await restartAgent();
			}
		);
		context.subscriptions.push(restartCommand);

		console.log(`[${opencodeConfig.name}] Extension activated successfully`);
		console.log(`[${opencodeConfig.name}] Registered models: ${models.map((m) => m.id).join(", ")}`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		console.error(`[${opencodeConfig.name}] Activation failed: ${errorMessage}`);

		// Show error notification
		vscode.window
			.showErrorMessage(`Failed to initialize ${opencodeConfig.name}: ${errorMessage}`, "View Logs")
			.then((selection) => {
				if (selection === "View Logs") {
					vscode.commands.executeCommand("workbench.action.openWalkthrough", { folder: undefined }, "Show Logs");
				}
			});

		throw error;
	}
}

/**
 * Extension deactivation
 */
export async function deactivate(): Promise<void> {
	const agentName = AGENT_CONFIG?.name ?? "ACP Agent";
	console.log(`[${agentName}] Deactivating extension...`);

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
		console.log(`[${agentName}] Stopping OpenCode ACP server...`);
		opencodeProcess.kill("SIGTERM");
		opencodeProcess = null;
	}

	extensionContext = null;
	console.log(`[${agentName}] Extension deactivated`);
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

	// Stream a response
	response.markdown(`*Connected to ${AGENT_CONFIG.name}*\n\n`);
	response.markdown(`Processing: "${userPrompt}"\n\n`);

	if (!clientManager) {
		response.markdown("Error: ACP client not initialized");
		return { metadata: { agent: AGENT_CONFIG.name } };
	}

	try {
		// Check for cancellation
		if (token.isCancellationRequested) {
			return { metadata: { agent: AGENT_CONFIG.name } };
		}

		// Create client connection
		const clientConfig = toACPClientConfig(AGENT_CONFIG);
		const connection = await clientManager.getClient(clientConfig);

		// Check for cancellation
		if (token.isCancellationRequested) {
			return { metadata: { agent: AGENT_CONFIG.name } };
		}

		// Initialize connection
		const initResult = await clientManager.initialize(connection);
		if (!initResult.success) {
			response.markdown(`Failed to initialize agent: ${initResult.error}`);
			return { metadata: { agent: AGENT_CONFIG.name } };
		}

		// Create session
		const sessionResult = await clientManager.newSession(connection, {
			cwd: AGENT_CONFIG.cwd ?? getWorkspaceFolder(),
		});

		if (!sessionResult.success) {
			response.markdown(`Failed to create session: ${sessionResult.error}`);
			return { metadata: { agent: AGENT_CONFIG.name } };
		}

		// Get session ID
		const sessionId = sessionResult.sessionId;
		if (!sessionId) {
			response.markdown("Failed to create session: No session ID returned");
			return { metadata: { agent: AGENT_CONFIG.name } };
		}

		// Store session
		clientManager.addSession("chat", connection, { sessionId });

		// Convert user message to ACP format
		const prompt: ContentBlock[] = [
			{ type: "text", text: userPrompt },
		];

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
			agent: AGENT_CONFIG.name,
		},
	};
}

/**
 * Show configuration panel for the agent
 */
async function showConfigurationPanel(): Promise<void> {
	interface ConfigItem {
		label: string;
		detail?: string;
		action?: string;
	}

	const items: vscode.QuickPickItem[] = [
		{
			label: "$(info) Agent Information",
			detail: `Name: ${AGENT_CONFIG.name}\nID: ${AGENT_CONFIG.id}\nCommand: ${AGENT_CONFIG.command} ${AGENT_CONFIG.args.join(" ")}`,
		},
		{ label: "$(refresh) Restart Agent", description: "restart" },
		{ label: "$(debug-alt) View Logs", description: "logs" },
	];

	const selection = await vscode.window.showQuickPick(items, {
		placeHolder: `Configure ${AGENT_CONFIG.name}`,
	});

	if (!selection) return;

	switch (selection.label) {
		case "$(refresh) Restart Agent":
			await restartAgent();
			break;
		case "$(debug-alt) View Logs":
			await showLogs();
			break;
	}
}

/**
 * Restart the agent connection
 */
async function restartAgent(): Promise<void> {
	const progress = await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Restarting ${AGENT_CONFIG.name}...`,
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
					name: AGENT_CONFIG.id,
					version: "1.0.0",
				});

				acpProvider = new ACPProvider({
					models: getACPModels(),
					clientConfig: toACPClientConfig(AGENT_CONFIG),
					clientInfo: {
						name: AGENT_CONFIG.id,
						version: "1.0.0",
					},
				});

				vscode.window.showInformationMessage(`${AGENT_CONFIG.name} restarted successfully`);
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error";
				vscode.window.showErrorMessage(`Failed to restart ${AGENT_CONFIG.name}: ${message}`);
			}
		}
	);
}

/**
 * Show agent logs
 */
async function showLogs(): Promise<void> {
	// Create output channel for logs
	const outputChannel = vscode.window.createOutputChannel(AGENT_CONFIG.name);
	outputChannel.show();

	// Add header
	outputChannel.appendLine(`=== ${AGENT_CONFIG.name} Logs ===`);
	outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);
	outputChannel.appendLine(`Agent: ${AGENT_CONFIG.name}`);
	outputChannel.appendLine(`Command: ${AGENT_CONFIG.command} ${AGENT_CONFIG.args.join(" ")}`);
	outputChannel.appendLine("");

	if (clientManager) {
		outputChannel.appendLine("Client manager is active");
	} else {
		outputChannel.appendLine("Client manager is not initialized");
	}

	outputChannel.appendLine("");
	outputChannel.appendLine("Agent logs will appear here...");
}
