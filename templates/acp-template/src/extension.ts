/**
 * ACP Agent Extension
 * ============================
 * VS Code extension that integrates with external ACP-compatible agent servers.
 * Based on Zed's ACP implementation pattern.
 */

import * as vscode from "vscode";
import {
        ACPClientManager,
        type ACPModelInfo,
} from "@all-in-copilot/sdk";
import { AGENT_CONFIG, getACPModels } from "./config";

/**
 * Extension context singleton
 */
let extensionContext: vscode.ExtensionContext | null = null;
let clientManager: ACPClientManager | null = null;

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

        console.log(`[${AGENT_CONFIG.name}] Activating ACP extension...`);

        try {
                // Initialize the ACP client manager
                clientManager = new ACPClientManager();

                // Get available models
                const models = getACPModels();

                // Register the ACP provider with VS Code
                const disposable = vscode.lm.registerLanguageModelChatProvider(
                        AGENT_CONFIG.id,
                        createACPProvider(models)
                );

                context.subscriptions.push(disposable);

                // Register chat participant for conversational AI
                const chatParticipant = vscode.chat.createChatParticipant(
                        AGENT_CONFIG.participantId,
                        async (request: vscode.ChatRequest, context: vscode.ChatContext, response: vscode.ChatResponseStream, token: vscode.CancellationToken) => {
                                await handleChatRequest(request, context, response, token);
                        }
                );

                context.subscriptions.push(chatParticipant);

                // Register configuration command
                const configCommand = vscode.commands.registerCommand(
                        `${AGENT_CONFIG.id}.configure`,
                        async () => {
                                await showConfigurationPanel();
                        }
                );
                context.subscriptions.push(configCommand);

                console.log(`[${AGENT_CONFIG.name}] Extension activated successfully`);
        } catch (error) {
                const errorMessage =
                        error instanceof Error ? error.message : "Unknown error";
                console.error(`[${AGENT_CONFIG.name}] Activation failed: ${errorMessage}`);

                // Show error notification
                vscode.window
                        .showErrorMessage(
                                `Failed to initialize ${AGENT_CONFIG.name}: ${errorMessage}`,
                                "View Logs"
                        )
                        .then((selection) => {
                                if (selection === "View Logs") {
                                        vscode.commands.executeCommand(
                                                "workbench.action.openWalkthrough",
                                                { folder: undefined },
                                                "Show Logs"
                                        );
                                }
                        });

                throw error;
        }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
        console.log(`[${AGENT_CONFIG.name}] Deactivating extension...`);

        // Clean up client manager
        if (clientManager) {
                clientManager.dispose();
                clientManager = null;
        }

        extensionContext = null;
        console.log(`[${AGENT_CONFIG.name}] Extension deactivated`);
}

/**
 * Creates an ACP provider instance
 */
function createACPProvider(models: ACPModelInfo[]): vscode.LanguageModelChatProvider {
        return {
                async provideLanguageModelChatInformation(
                        _options: { silent: boolean },
                        _token: vscode.CancellationToken
                ): Promise<vscode.LanguageModelChatInformation[]> {
                        return models.map((model) => ({
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
                },

                async provideLanguageModelChatResponse(
                        model: vscode.LanguageModelChatInformation,
                        messages: readonly vscode.LanguageModelChatRequestMessage[],
                        _options: vscode.ProvideLanguageModelChatResponseOptions,
                        progress: vscode.Progress<vscode.LanguageModelResponsePart>,
                        _token: vscode.CancellationToken
                ): Promise<void> {
                        // Report that we're processing
                        progress.report({
                                kind: "text",
                                value: `Processing request with ${AGENT_CONFIG.name}...`,
                        } as unknown as vscode.LanguageModelTextPart);

                        // TODO: Implement actual ACP connection and message handling
                        // This requires spawning the agent process and communicating via stdio

                        // For now, show a placeholder response
                        progress.report({
                                kind: "text",
                                value: `[ACP Agent: Full implementation required - connect to ${AGENT_CONFIG.command} ${AGENT_CONFIG.args.join(" ")}]`,
                        } as unknown as vscode.LanguageModelTextPart);
                },

                async provideTokenCount(
                        _model: vscode.LanguageModelChatInformation,
                        text: string
                ): Promise<number> {
                        // Simple token estimation (4 characters per token on average)
                        return Math.ceil(text.length / 4);
                },
        };
}

/**
 * Handles chat requests from VS Code Chat
 */
async function handleChatRequest(
        request: vscode.ChatRequest,
        _context: vscode.ChatContext,
        response: vscode.ChatResponseStream,
        _token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
        // Stream a response
        response.markdown(`Hello! I'm connected to ${AGENT_CONFIG.name}.\n\n`);
        response.markdown(`You said: "${request.prompt}"\n\n`);
        response.markdown(`[ACP Agent: Full implementation required]`);

        return {
                metadata: {
                        agent: "ACP Agent",
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
                                // Reinitialize the client manager
                                if (clientManager) {
                                        await clientManager.dispose();
                                }
                                clientManager = new ACPClientManager();
                                vscode.window.showInformationMessage(
                                        `${AGENT_CONFIG.name} restarted successfully`
                                );
                        } catch (error) {
                                const message =
                                        error instanceof Error ? error.message : "Unknown error";
                                vscode.window.showErrorMessage(
                                        `Failed to restart ${AGENT_CONFIG.name}: ${message}`
                                );
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
        outputChannel.appendLine("");

        // TODO: Fetch logs from client manager
        outputChannel.appendLine("Agent logs will appear here...");
}
