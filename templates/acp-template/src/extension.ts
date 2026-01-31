/**
 * ACP Agent Extension
 * ============================
 * VS Code extension that integrates with external ACP-compatible agent servers.
 * Uses @all-in-copilot/sdk for full ACP protocol support.
 */

import * as vscode from "vscode";
import { ACPClientManager, ACPProvider, type ContentBlock } from "@all-in-copilot/sdk";
import { AGENT_CONFIG, getACPModels, getOpenCodeConfig, getWorkspaceFolder, toACPClientConfig } from "./config";
import type { ChatToolInvocationPart, ChatTerminalToolInvocationData } from "./vscode/proposed.chatParticipantAdditions";

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
		// Initialize the ACP client manager
		// The manager will spawn OpenCode using stdio transport for ACP protocol
		clientManager = new ACPClientManager({
			name: agentId,
			version: "1.0.0",
		});

		// Get available models
		const models = getACPModels();

		// Create client config - SDK will spawn OpenCode using stdio transport
		const clientConfig = toACPClientConfig(opencodeConfig);

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

	// Clean up client manager - this will also kill the spawned process
	if (clientManager) {
		await clientManager.dispose();
		clientManager = null;
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

	// Track tool invocations for UI display
	const toolInvocations: Map<string, ChatToolInvocationPart> = new Map();
	const toolOutputs: Map<string, string> = new Map();
	const pendingToolCalls: Map<string, { toolName: string; command?: string }> = new Map();

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

		// Send prompt and stream response with tool invocation UI
		response.markdown("*Agent response:*\n\n");

		// Set up listener for session updates to show tool invocations
		const updateUnsubscribe = clientManager.onSessionUpdate(sessionId, (update) => {
			const updateData = update.update;

			switch (updateData.sessionUpdate) {
				case "tool_call": {
					// Extract tool call information
					const toolCallData = updateData as {
						toolCallId?: string;
						title?: string;
						command?: string;
					};
					const toolCallId = toolCallData.toolCallId || String(Date.now());
					const title = toolCallData.title || "Unknown Tool";
					const command = toolCallData.command || "";

					// Parse tool name from title (e.g., "bash: Execute shell command")
					const toolName = title.split(":")[0].trim() || "tool";

					// Store pending tool call
					pendingToolCalls.set(toolCallId, { toolName, command });

					// Create ChatToolInvocationPart for UI
					const toolPart = new ChatToolInvocationPart(toolName, toolCallId);

					// Set invocation message - show the command being executed
					const markdown = new vscode.MarkdownString();
					markdown.isTrusted = true;
					if (command) {
						markdown.appendCodeblock(command, "bash");
					} else {
						markdown.appendText(title);
					}
					toolPart.invocationMessage = markdown;
					toolPart.isComplete = false;
					toolPart.isConfirmed = true;

					// Add terminal-specific data if it's a bash command
					if (toolName.toLowerCase() === "bash" || command) {
						const terminalData: ChatTerminalToolInvocationData = {
							commandLine: {
								original: command,
							},
							language: "bash",
						};
						toolPart.toolSpecificData = terminalData;
					}

					// Store and push to response
					toolInvocations.set(toolCallId, toolPart);
					response.push(toolPart);
					break;
				}

				case "tool_call_update": {
					const updateDataTyped = updateData as {
						toolCallId?: string;
						status?: string;
						content?: Array<{ text?: string }>;
						output?: string;
						error?: string;
					};
					const toolCallId = updateDataTyped.toolCallId || "";
					const status = updateDataTyped.status || "";

					if (status === "completed" || status === "success") {
						const toolPart = toolInvocations.get(toolCallId);
						if (toolPart) {
							// Mark as complete
							toolPart.isComplete = true;

							// Collect output
							let outputText = "";
							if (updateDataTyped.content && Array.isArray(updateDataTyped.content)) {
								outputText = updateDataTyped.content
									.map((item) => item.text || "")
									.join("\n");
							}
							if (updateDataTyped.output) {
								outputText += updateDataTyped.output;
							}

							// Store output for terminal data
							if (outputText) {
								toolOutputs.set(toolCallId, outputText);

								// Update terminal data with output
								if (toolPart.toolSpecificData) {
									const terminalData = toolPart.toolSpecificData as ChatTerminalToolInvocationData;
									terminalData.output = { text: outputText };
									terminalData.state = { exitCode: 0 };
								}
							}

							// Set past tense message
							const pendingTool = pendingToolCalls.get(toolCallId);
							if (pendingTool) {
								const pastTense = new vscode.MarkdownString();
								pastTense.isTrusted = true;
								if (pendingTool.command) {
									pastTense.appendText(`Executed `);
									pastTense.appendCodeblock(pendingTool.command, "bash");
								} else {
									pastTense.appendText("Tool completed successfully");
								}
								toolPart.pastTenseMessage = pastTense;
							}
						}
					} else if (status === "error" || status === "failed") {
						const toolPart = toolInvocations.get(toolCallId);
						if (toolPart) {
							toolPart.isError = true;
							toolPart.isComplete = true;

							// Set error message
							const errorText = updateDataTyped.error || "Tool execution failed";
							const errorMsg = new vscode.MarkdownString();
							errorMsg.isTrusted = true;
							errorMsg.appendText(`Error: ${errorText}`);
							toolPart.pastTenseMessage = errorMsg;

							// Update terminal data with error
							if (toolPart.toolSpecificData) {
								const terminalData = toolPart.toolSpecificData as ChatTerminalToolInvocationData;
								terminalData.state = { exitCode: 1 };
								terminalData.output = { text: errorText };
							}
						}
					}
					break;
				}
			}
		});

		try {
			for await (const update of clientManager.streamPrompt(connection, {
				sessionId,
				prompt,
			})) {
				if (token.isCancellationRequested) {
					break;
				}

				if (update.type === "content" && update.content) {
					response.markdown(update.content);
				} else if (update.type === "complete") {
					response.markdown(`\n\n*(Stopped: ${update.stopReason})*`);
				}
			}
		} finally {
			// Clean up the listener
			updateUnsubscribe();
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
