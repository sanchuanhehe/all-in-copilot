/**
 * ACP Agent Extension
 * ============================
 * VS Code extension that integrates with external ACP-compatible agent servers.
 * Uses @all-in-copilot/sdk for full ACP protocol support.
 */

import * as vscode from "vscode";
import { ACPChatParticipant, ACPClientManager, ACPProvider, registerACPChatParticipant } from "@all-in-copilot/sdk";
import {
	AGENT_CONFIG,
	getACPModels,
	getOpenCodeConfig,
	toACPClientConfig,
	initializeTerminalAdapter,
	disposeTerminalAdapterInstance,
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
	const agentName = opencodeConfig.name;
	const agentId = opencodeConfig.id;

	logToChannel(`[${agentName}] Activating ACP extension...`);

	try {
		// Initialize terminal adapter first
		initializeTerminalAdapter();

		// Initialize the ACP client manager
		// The manager will spawn OpenCode using stdio transport for ACP protocol
		clientManager = new ACPClientManager({
			name: agentId,
			version: "1.0.0",
		});

		// Get available models
		const models = getACPModels();

		// Create client config - SDK will spawn OpenCode using stdio transport
		const clientConfig = toACPClientConfig(opencodeConfig, {
			extensionContext: {
				extensionUri: context.extensionUri.toString(),
				secrets: context.secrets,
			},
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

		// Register chat participant for conversational AI with rich tool invocation UI
		// Uses ACPChatParticipant from SDK for proper tool call handling
		const chatParticipant = new ACPChatParticipant({
			id: opencodeConfig.participantId,
			name: agentName,
			description: `A coding assistant powered by ${agentName}`,
			iconPath: new vscode.ThemeIcon("robot"),
			clientConfig: toACPClientConfig(opencodeConfig, {
				extensionContext: {
					extensionUri: context.extensionUri.toString(),
					secrets: context.secrets,
				},
			}),
			clientInfo: {
				name: agentId,
				version: "1.0.0",
			},
			clientManager, // Share the clientManager with the participant
		});

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

	// Clean up client manager - this will also kill the spawned process
	if (clientManager) {
		await clientManager.dispose();
		clientManager = null;
	}

	// Clean up terminal adapter
	disposeTerminalAdapterInstance();

	extensionContext = null;
	logToChannel(`[${agentName}] Extension deactivated`);

	// Dispose output channel
	opencodeOutputChannel?.dispose();
	opencodeOutputChannel = null;
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

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Restarting ${agentConfig.name}...`,
			cancellable: false,
		},
		async (_progress) => {
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
