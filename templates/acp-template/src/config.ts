/**
 * ACP Agent Configuration
 * ============================
 * Configure your external ACP-compatible agent server here.
 * Supports Claude Code, Gemini CLI, OpenAI Codex, and custom agents.
 */

import type {
	ACPClientConfig,
	ACPModelInfo,
	ClientCallbacks,
	IVsCodeTerminal,
	TerminalPermissionService,
	TerminalConfirmationDetails,
} from "@all-in-copilot/sdk";
import { createTerminalPermissionService } from "@all-in-copilot/sdk";
import * as vscode from "vscode";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { randomUUID } from "crypto";

// Initialize terminal permission service with custom dangerous command patterns
const terminalPermissionService = createTerminalPermissionService({
	autoApproveSafeCommands: true,
	confirmDangerousCommands: true,
	dangerousPatterns: [
		// File destruction patterns
		{
			pattern: /\brm\s+-rf\b/i,
			reason: 'Recursive force delete - can permanently remove files',
			severity: 'critical'
		},
		{
			pattern: /\brm\s+-[rR]\b/i,
			reason: 'Recursive delete - can remove entire directories',
			severity: 'high'
		},
		{
			pattern: /\bdel\b.*\/[pq]/i,
			reason: 'Pattern matching delete - may delete unexpected files',
			severity: 'high'
		},
		// System modification patterns
		{
			pattern: /\bsudo\b.*(chmod|chown|mkfs|mount|umount)/i,
			reason: 'System-level permission changes',
			severity: 'critical'
		},
		// Git dangerous operations
		{
			pattern: /\bgit\s+push\s+--force\b/i,
			reason: 'Force push - can overwrite remote history',
			severity: 'high'
		},
		{
			pattern: /\bgit\s+push\s+-f\b/i,
			reason: 'Force push - can overwrite remote history',
			severity: 'high'
		},
		{
			pattern: /\bgit\s+reset\s+--hard\b/i,
			reason: 'Hard reset - permanently discards local changes',
			severity: 'high'
		},
		{
			pattern: /\bgit\s+clean\s+-fd\b/i,
			reason: 'Clean - removes untracked files and directories',
			severity: 'high'
		},
		{
			pattern: /\bgit\s+push\s+origin\s+--delete\b/i,
			reason: 'Remote branch deletion',
			severity: 'high'
		},
	]
});

// Common installation paths for OpenCode
const COMMON_OPENCODE_PATHS = [
	"${HOME}/.opencode/bin/opencode",
	"/usr/local/bin/opencode",
	"/opt/opencode/bin/opencode",
	"/usr/bin/opencode",
];

// Expand HOME in path
function expandPath(path: string): string {
	return path.replace("$HOME", process.env.HOME || "");
}

/**
 * Terminal state management for ACP terminal operations
 */
interface TerminalState {
	terminal: vscode.Terminal;
	command: string;
	isBackground: boolean;
	resolveOutput?: (output: string) => void;
	rejectOutput?: (error: Error) => void;
	outputPromise?: Promise<string>;
	output?: string;
	exitCode?: number;
}

const terminalStateMap = new Map<string, TerminalState>();

/**
 * Get or create a terminal for the given session
 */
function getOrCreateTerminal(sessionId: string, shellName?: string): vscode.Terminal {
	const terminalName = `ACP-${shellName || "Agent"}-${sessionId.slice(0, 8)}`;

	// Look for existing terminal with same name
	for (const [, state] of terminalStateMap) {
		if (state.terminal.name === terminalName && !state.terminal.exitStatus) {
			return state.terminal;
		}
	}

	// Create new terminal
	const terminalOptions: vscode.TerminalOptions = {
		name: terminalName,
	};

	const terminal = vscode.window.createTerminal(terminalOptions);

	return terminal;
}

/**
 * Implementation of VS Code Terminal interface for ACP
 */
class ACPVsCodeTerminal implements IVsCodeTerminal {
	constructor(
		public readonly terminalId: string,
		public readonly name: string
	) {}

	async show(): Promise<void> {
		const state = terminalStateMap.get(this.terminalId);
		if (state) {
			state.terminal.show();
		}
	}

	async hide(): Promise<void> {
		const state = terminalStateMap.get(this.terminalId);
		if (state) {
			state.terminal.hide();
		}
	}

	sendText(text: string, _shouldExecute?: boolean): void {
		const state = terminalStateMap.get(this.terminalId);
		if (state) {
			state.terminal.sendText(text);
		}
	}

	async dispose(): Promise<void> {
		const state = terminalStateMap.get(this.terminalId);
		if (state) {
			state.terminal.dispose();
			terminalStateMap.delete(this.terminalId);
		}
	}
}

/**
 * Client callbacks for VS Code API integration
 * These callbacks enable the ACP agent to use VS Code's native tools
 */
const clientCallbacks: ClientCallbacks = {
	/**
	 * Creates a new terminal and executes a command.
	 * Uses VS Code's native run_in_terminal tool with permission service for security.
	 * Shows confirmation dialog for potentially dangerous commands.
	 */
	async createTerminal(_sessionId: string, command: string, _args?: string[]): Promise<IVsCodeTerminal> {
		const terminalId = randomUUID();

		// Determine if this should be a background process
		// Check for common background patterns in the command
		const isBackground =
			command.includes("npm run watch") ||
			command.includes("pnpm watch") ||
			command.includes("npm run dev") ||
			command.includes("pnpm dev") ||
			command.includes("dev --watch") ||
			command.includes("vite") ||
			command.includes("--watch") ||
			command.includes("nodemon") ||
			command.includes("ts-node --watch");

		// Request permission for the command using the terminal permission service
		const confirmationDetails: TerminalConfirmationDetails = {
			command,
			description: terminalPermissionService.getCommandDescription(command),
			isBackground,
			isDangerous: terminalPermissionService.isDangerousCommand(command),
		};

		// Request user confirmation for potentially dangerous commands
		const permissionResult = await terminalPermissionService.requestTerminalConfirmation(confirmationDetails);

		if (permissionResult !== 'allow') {
			throw new Error(`Command execution denied by user: ${command}`);
		}

		// Create terminal (cwd and env not supported in current protocol)
		const terminal = getOrCreateTerminal(terminalId, "Agent");
		const terminalState: TerminalState = {
			terminal,
			command,
			isBackground,
		};

		terminalStateMap.set(terminalId, terminalState);

		return new ACPVsCodeTerminal(terminalId, terminal.name);
	},

	/**
	 * Gets terminal output for the specified terminal.
	 * Uses SDK's ITerminalService for consistent buffer access.
	 * For background processes, waits for completion and returns output.
	 */
	async getTerminalOutput(terminalId: string): Promise<{ output: string; exitCode?: number }> {
		const state = terminalStateMap.get(terminalId);
		if (!state) {
			return { output: "", exitCode: 0 };
		}

		try {
			// Use SDK's terminal service for consistent buffer access
			const buffer = state.terminal.buffer;
			if (buffer && buffer.length > 0) {
				// Get the last line or full buffer
				const lines: string[] = [];
				for (let i = 0; i < buffer.length; i++) {
					lines.push(buffer[i].line);
				}
				state.output = lines.join('\n');
			}
		} catch {
			// Fallback: output remains undefined, return empty
		}

		const output = state.output ?? "";
		const exitCode = state.exitCode;

		// Clean up if not a persistent terminal
		if (!state.isBackground) {
			terminalStateMap.delete(terminalId);
		}

		return { output, exitCode };
	},

	/**
	 * Releases a terminal, cleaning up resources.
	 */
	async releaseTerminal(terminalId: string): Promise<void> {
		const state = terminalStateMap.get(terminalId);
		if (state) {
			// Just hide the terminal but keep it for reuse
			state.terminal.hide();
		}
	},

	/**
	 * Waits for a terminal command to exit and returns its exit status.
	 * Uses VS Code's terminal shell execution events.
	 */
	async waitForTerminalExit(terminalId: string): Promise<{ exitCode?: number }> {
		const state = terminalStateMap.get(terminalId);
		if (!state) {
			return { exitCode: undefined };
		}

		// For background processes, we need to wait for the execution to complete
		if (state.isBackground && !state.exitCode) {
			// Show the terminal and wait for execution
			state.terminal.show();

			// If we have a pending output promise, wait for it
			if (state.outputPromise) {
				try {
					await state.outputPromise;
				} catch {
					// Ignore errors from cancelled execution
				}
			}
		}

		return { exitCode: state.exitCode };
	},

	/**
	 * Kills a terminal command.
	 */
	async killTerminal(terminalId: string): Promise<void> {
		const state = terminalStateMap.get(terminalId);
		if (state) {
			state.terminal.dispose();
			terminalStateMap.delete(terminalId);
		}
	},

	/**
	 * Reads a text file using VS Code Copilot tools via lm.invokeTool.
	 * Routes through Copilot's permission confirmation system for unified management.
	 */
	async readTextFile(path: string, line?: number | null, limit?: number | null): Promise<string> {
		const startLine = line ?? 1;
		const endLine = limit !== undefined ? startLine + limit : undefined;

		try {
			// Use Copilot's built-in readFile tool via lm.invokeTool
			const result = await vscode.lm.invokeTool(
				"copilot_readFile",
				{
					filePath: path,
					startLine,
					endLine,
				},
				undefined // No token for global usage
			);

			if (result && result.content) {
				// Extract the text content from the tool result
				const toolContent = result.content.find((c) => c.type === "text");
				if (toolContent && toolContent.text) {
					return toolContent.text;
				}
			}

			// Fallback to VS Code API if tool returns unexpected format
		} catch (error) {
			// Fallback to VS Code API if Copilot tool fails
		}

		// Fallback: Use VS Code API directly
		const uri = vscode.Uri.file(path);
		const document = await vscode.workspace.openTextDocument(uri);
		const fullText = document.getText();

		// Apply line and limit if specified
		if (line !== undefined || limit !== undefined) {
			const lines = fullText.split("\n");
			const endIdx = limit !== undefined ? startLine + limit : undefined;
			const startIdx = startLine - 1; // Convert to 0-indexed
			const slicedLines = lines.slice(startIdx, endIdx);
			const content = slicedLines.join("\n");

			// Return with line number indicator for transparency
			return `// Lines ${startLine}-${startLine + slicedLines.length - 1}\n${content}`;
		}

		return fullText;
	},

	/**
	 * Writes a text file using VS Code Copilot tools via lm.invokeTool.
	 * Uses createFile for new files, applyPatch for existing files.
	 * Routes through Copilot's permission confirmation system for unified management.
	 */
	async writeTextFile(path: string, content: string): Promise<void> {
		try {
			// First try applyPatch (works for both new and existing files)
			const patchContent = `*** Begin Patch
*** Update File: ${path}
${content}
*** End Patch`;

			await vscode.lm.invokeTool(
				"copilot_applyPatch",
				{
					input: patchContent,
					explanation: `Write text file: ${path}`,
				},
				undefined
			);

			return;
		} catch (applyPatchError) {
			// applyPatch might fail if file doesn't exist, try createFile
			try {
				await vscode.lm.invokeTool(
					"copilot_createFile",
					{
						filePath: path,
						content,
					},
					undefined
				);

				return;
			} catch (createFileError) {
				// Fallback to VS Code API if both tools fail
			}
		}

		// Fallback: Use VS Code API directly
		const uri = vscode.Uri.file(path);
		await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf-8"));
	},

	/**
	 * Handles permission requests from the agent.
	 */
	async requestPermission(request: {
		toolCall: { title: string; description?: string };
		options: Array<{ optionId: string; label: string }>;
	}): Promise<string> {
		// Auto-approve safe operations
		const safePatterns = [
			/replace_string_in_file/i,
			/create_file/i,
			/list_dir/i,
			/read_file/i,
			/file_search/i,
			/grep_search/i,
		];

		for (const pattern of safePatterns) {
			if (pattern.test(request.toolCall.title)) {
				return request.options[0]?.optionId ?? "approved";
			}
		}

		// For potentially dangerous operations, show a confirmation
		const selection = await vscode.window.showQuickPick(
			request.options.map((opt) => ({
				label: opt.label,
				description: opt.optionId,
			})),
			{
				placeHolder: request.toolCall.title + (request.toolCall.description ? `\n${request.toolCall.description}` : ""),
				title: "Agent Permission Request",
			}
		);

		if (!selection) {
			throw new Error("Permission denied by user");
		}

		return selection.description;
	},

	/**
	 * Handles extension method requests from the agent.
	 * Supports VS Code Copilot tools via extension methods.
	 */
	async extMethod(method: string, _params: Record<string, unknown>): Promise<Record<string, unknown>> {
		switch (method) {
			// Add custom extension methods here
			// Example:
			// case "customTool":
			//     return { result: "success" };

			default:
				throw new Error(`Unknown extension method: ${method}`);
		}
	},

	/**
	 * Handles extension notifications from the agent.
	 */
	async extNotification(method: string, params: Record<string, unknown>): Promise<void> {
		// Handle extension notifications
		// Log for debugging
		console.log(`[ACP Extension] Notification: ${method}`, params);
	},
};

/**
 * Find OpenCode executable path with multiple fallback strategies
 */
function findOpenCodePath(): string | null {
	// First try which command with extended PATH
	try {
		const extendedEnv = {
			...process.env,
			PATH: (process.env.PATH || "") + ":/usr/local/bin:/usr/bin",
		};
		const path = execSync("which opencode 2>/dev/null || echo ''", {
			encoding: "utf-8",
			env: extendedEnv,
		}).trim();
		if (path && existsSync(path)) {
			return path;
		}
	} catch {
		// continue with common paths
	}

	// Try common installation paths
	for (const rawPath of COMMON_OPENCODE_PATHS) {
		const expandedPath = expandPath(rawPath);
		if (existsSync(expandedPath)) {
			return expandedPath;
		}
	}

	return null;
}

/**
 * Agent configuration - EDIT THIS TO CHANGE YOUR AGENT
 */
export interface AgentConfig {
	// Provider identification
	id: string; // Unique identifier for the provider (used in VS Code)
	name: string; // Display name shown to users
	participantId: string; // Chat participant ID

	// Command to launch the agent
	command: string; // Executable name (e.g., "npx", "/path/to/cli")
	args: string[]; // Arguments to pass (e.g., ["-y", "@anthropic-ai/claude-agent-sdk"])

	// Environment variables for the agent process
	env?: Record<string, string>;

	// Working directory
	cwd?: string;

	// TCP connection settings (for ACP over TCP)
	hostname?: string;
	port?: number;

	// Default session mode (agent-specific)
	defaultMode?: string;

	// Default model ID (agent-specific)
	defaultModel?: string;

	// Favorite models for quick selection
	favoriteModels?: string[];
}

/**
 * Runtime connection configuration (updated when server starts)
 */
let runtimeHostname: string | undefined;
let runtimePort: number | undefined;

/**
 * Set runtime connection info (called by extension.ts when server starts)
 */
export function setRuntimeConnection(hostname: string, port: number): void {
	runtimeHostname = hostname;
	runtimePort = port;
}

/**
 * Get runtime connection info
 */
export function getRuntimeConnection(): { hostname: string; port: number } {
	return {
		hostname: runtimeHostname ?? "127.0.0.1",
		port: runtimePort ?? 8080,
	};
}

/**
 * Convert AgentConfig to ACPClientConfig for SDK usage
 * For OpenCode, we use stdio transport - the process stdin/stdout is used for ACP protocol
 */
export function toACPClientConfig(config: AgentConfig): ACPClientConfig {
	return {
		transport: "stdio",
		agentPath: config.command,
		agentArgs: config.args,
		env: config.env,
		cwd: config.cwd,
		callbacks: clientCallbacks,
	};
}

/**
 * Get the client callbacks for VS Code API integration
 */
export function getClientCallbacks(): ClientCallbacks {
	return clientCallbacks;
}

// OpenCode AI - Use system PATH to find "opencode" executable
// Run: which opencode (or add to PATH if not found)
export function getOpenCodeConfig(): AgentConfig | null {
	// Try to find opencode using multiple strategies
	const opencodePath = findOpenCodePath();

	if (opencodePath) {
		return {
			id: "opencode",
			name: "OpenCode Agent",
			participantId: "opencode.agent",
			command: opencodePath,
			args: ["acp"],
			env: {},
			cwd: undefined, // Will use workspace folder at runtime
		};
	}

	return null;
}

/**
 * Get workspace folder path for the agent
 */
export function getWorkspaceFolder(): string {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders && workspaceFolders.length > 0) {
		return workspaceFolders[0].uri.fsPath;
	}
	// Use home directory as fallback - /workspace might not exist
	return process.env.HOME || "/tmp";
}

/**
 * Execute a command and return the output
 */
function execCommand(command: string, cwd?: string): string | null {
	try {
		const result = execSync(command, {
			encoding: "utf-8",
			timeout: 10000,
			cwd: cwd ?? process.cwd(),
		});
		return result.trim();
	} catch {
		return null;
	}
}

/**
 * Get model ID from OpenCode model string (e.g., "opencode/minimax-m2.1-free" -> "opencode-minimax-m2.1-free")
 */
function sanitizeModelId(modelId: string): string {
	return modelId.replace(/[^a-zA-Z0-9\-/_]/g, "-");
}

/**
 * Get human-readable name from model ID
 */
function getModelName(modelId: string): string {
	// Extract the model name part after the last slash
	const parts = modelId.split("/");
	const namePart = parts[parts.length - 1];

	// Convert to readable format
	return namePart
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/**
 * Get provider name from model ID
 */
function getProviderName(modelId: string): string {
	const parts = modelId.split("/");
	if (parts.length >= 2) {
		return parts[0];
	}
	return "opencode";
}

/**
 * Model capability details from OpenCode verbose output
 */
interface OpenCodeModelCapabilities {
	temperature: boolean;
	reasoning: boolean;
	attachment: boolean;
	toolcall: boolean;
	input: {
		text: boolean;
		audio: boolean;
		image: boolean;
		video: boolean;
		pdf: boolean;
	};
	output: {
		text: boolean;
		audio: boolean;
		image: boolean;
		video: boolean;
		pdf: boolean;
	};
	interleaved: boolean;
}

/**
 * OpenCode model details from verbose output
 */
interface OpenCodeModelDetail {
	id: string;
	providerID: string;
	name: string;
	family: string;
	status: string;
	limit: {
		context: number;
		output: number;
	};
	capabilities: OpenCodeModelCapabilities;
}

/**
 * Parse verbose model output from OpenCode
 * Format: modelId\n{\n  "id": "...\n  ...\n}\nmodelId\n{...}
 */
function parseVerboseModelOutput(output: string): Map<string, OpenCodeModelDetail> {
	const models = new Map<string, OpenCodeModelDetail>();
	const lines = output.split("\n");
	let currentModelId: string | null = null;
	let currentJsonBuffer: string[] = [];
	let inJsonBlock = false;
	let braceDepth = 0;

	for (const line of lines) {
		const trimmedLine = line.trim();

		// Skip log messages
		if (trimmedLine.startsWith("INFO") || trimmedLine.includes("refreshing")) {
			continue;
		}

		// Skip empty lines
		if (!trimmedLine) {
			continue;
		}

		// Check if this is a model ID line (not starting with { or ")
		if (!inJsonBlock && trimmedLine && !trimmedLine.startsWith("{") && !trimmedLine.startsWith('"')) {
			// Save previous model if exists
			if (currentModelId && currentJsonBuffer.length > 0) {
				try {
					const jsonStr = currentJsonBuffer.join("\n");
					const detail = JSON.parse(jsonStr) as OpenCodeModelDetail;
					models.set(currentModelId, detail);
				} catch {
					// Skip invalid JSON
				}
			}

			// Start new model
			currentModelId = trimmedLine;
			currentJsonBuffer = [];
			inJsonBlock = false;
			continue;
		}

		// Track JSON block
		if (trimmedLine === "{") {
			inJsonBlock = true;
			braceDepth = 1;
			currentJsonBuffer = [trimmedLine];
		} else if (inJsonBlock) {
			currentJsonBuffer.push(trimmedLine);

			// Track brace depth
			for (const char of trimmedLine) {
				if (char === "{") {
					braceDepth++;
				}
				if (char === "}") {
					braceDepth--;
				}
			}

			// End of JSON block
			if (braceDepth === 0) {
				inJsonBlock = false;
			}
		}
	}

	// Save last model
	if (currentModelId && currentJsonBuffer.length > 0) {
		try {
			const jsonStr = currentJsonBuffer.join("\n");
			const detail = JSON.parse(jsonStr) as OpenCodeModelDetail;
			models.set(currentModelId, detail);
		} catch {
			// Skip invalid JSON
		}
	}

	return models;
}

/**
 * Fetch available models from OpenCode CLI with verbose output
 */
export function fetchOpenCodeModels(): ACPModelInfo[] {
	const opencodePath = findOpenCodePath();
	if (!opencodePath) {
		return getDefaultModels();
	}

	const verboseOutput = execCommand(`"${opencodePath}" models --verbose 2>/dev/null`);
	if (!verboseOutput) {
		return getDefaultModels();
	}

	// Parse verbose output to get model capabilities
	const modelDetails = parseVerboseModelOutput(verboseOutput);

	// Also get the simple list for any models not in verbose output
	const simpleOutput = execCommand(`"${opencodePath}" models 2>/dev/null`);
	const simpleLines = simpleOutput?.split("\n") ?? [];

	const models: ACPModelInfo[] = [];

	// Process models from verbose output
	for (const [modelId, detail] of modelDetails.entries()) {
		const provider = getProviderName(modelId);
		const capabilities = detail.capabilities;

		models.push({
			id: sanitizeModelId(modelId),
			name: `${detail.name} (${provider})`,
			version: "1.0.0",
			maxInputTokens: detail.limit?.context ?? 200000,
			maxOutputTokens: detail.limit?.output ?? 64000,
			supportsToolCalls: capabilities?.toolcall ?? true,
			supportsImageInput: capabilities?.input?.image ?? false,
		});
	}

	// Process any models that only appear in simple output
	for (const line of simpleLines) {
		const modelId = line.trim();
		if (!modelId || modelId.startsWith("INFO") || modelId.includes("refreshing")) {
			continue;
		}
		if (modelId.length < 3 || modelId.includes("service=")) {
			continue;
		}

		// Skip if already processed from verbose output
		if (modelDetails.has(modelId)) {
			continue;
		}

		const provider = getProviderName(modelId);
		const name = getModelName(modelId);

		models.push({
			id: sanitizeModelId(modelId),
			name: `${name} (${provider})`,
			version: "1.0.0",
			maxInputTokens: 200000,
			maxOutputTokens: 64000,
			supportsToolCalls: true,
			supportsImageInput: false,
		});
	}

	if (models.length === 0) {
		return getDefaultModels();
	}

	return models;
}

/**
 * Get default models when OpenCode is not available
 */
function getDefaultModels(): ACPModelInfo[] {
	return [
		{
			id: "opencode-default",
			name: "OpenCode Agent (Default)",
			version: "1.0",
			maxInputTokens: 200000,
			maxOutputTokens: 64000,
			supportsToolCalls: true,
			supportsImageInput: true,
		},
	];
}

/**
 * Get list of available ACP models
 * Dynamically fetches models from OpenCode CLI
 */
export function getACPModels(): ACPModelInfo[] {
	// Try to get models from OpenCode CLI
	const models = fetchOpenCodeModels();

	// If we got models from OpenCode, return them
	if (models.length > 1 || (models.length === 1 && models[0].id !== "opencode-default")) {
		return models;
	}

	// Fallback to default model if no models found
	return getDefaultModels();
}

/**
 * Get the active ACP agent configuration
 * Returns OpenCode config if available, null otherwise
 */
export function getActiveAgentConfig(): AgentConfig | null {
	return getOpenCodeConfig();
}

// Default active configuration - Uses OpenCode if available
// Note: If OpenCode is not in PATH, extension will show an error and not activate
export const AGENT_CONFIG = getActiveAgentConfig();
