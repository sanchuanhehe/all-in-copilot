/**
 * ACP Agent Configuration
 * ============================
 * Configure your external ACP-compatible agent server here.
 * Supports Claude Code, Gemini CLI, OpenAI Codex, and custom agents.
 */

import type { ACPClientConfig, ACPModelInfo } from "@all-in-copilot/sdk";
import * as vscode from "vscode";
import { execSync } from "child_process";
import { existsSync } from "fs";

// Common installation paths for OpenCode
const COMMON_OPENCODE_PATHS = [
	"/home/sanchuanhehe/.opencode/bin/opencode",
	"/usr/local/bin/opencode",
	"/opt/opencode/bin/opencode",
];

// Expand HOME in path
function expandPath(path: string): string {
	return path.replace("$HOME", process.env.HOME || "/home/sanchuanhehe");
}

/**
 * Find OpenCode executable path with multiple fallback strategies
 */
function findOpenCodePath(): string | null {
	// First try which command with extended PATH
	try {
		const extendedEnv = { 
			...process.env, 
			PATH: (process.env.PATH || "") + ":/usr/local/bin:/home/sanchuanhehe/.opencode/bin"
		};
		const path = execSync("which opencode 2>/dev/null || echo ''", { 
			encoding: "utf-8",
			env: extendedEnv
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
	};
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
				if (char === "{") braceDepth++;
				if (char === "}") braceDepth--;
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
