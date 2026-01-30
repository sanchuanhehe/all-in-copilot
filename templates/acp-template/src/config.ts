/**
 * ACP Agent Configuration
 * ============================
 * Configure your external ACP-compatible agent server here.
 * Supports Claude Code, Gemini CLI, OpenAI Codex, and custom agents.
 */

import type { ACPClientConfig, ACPModelInfo } from "@all-in-copilot/sdk";
import * as vscode from "vscode";
import { execSync } from "child_process";

/**
 * Agent configuration - EDIT THIS TO CHANGE YOUR AGENT
 */
export interface AgentConfig {
        // Provider identification
        id: string;                  // Unique identifier for the provider (used in VS Code)
        name: string;                // Display name shown to users
        participantId: string;       // Chat participant ID

        // Command to launch the agent
        command: string;             // Executable name (e.g., "npx", "/path/to/cli")
        args: string[];              // Arguments to pass (e.g., ["-y", "@anthropic-ai/claude-agent-sdk"])

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
 */
export function toACPClientConfig(config: AgentConfig): ACPClientConfig {
        // Use runtime values if available (set when ACP server starts)
        const { hostname, port } = runtimeHostname !== undefined
                ? { hostname: runtimeHostname, port: runtimePort ?? 8080 }
                : { hostname: config.hostname ?? "127.0.0.1", port: config.port ?? 8080 };

        return {
		transport: "tcp",
		hostname,
		port,
	};
}

// OpenCode AI - Use system PATH to find "opencode" executable
// Run: which opencode (or add to PATH if not found)
export function getOpenCodeConfig(): AgentConfig | null {
        // Try to find opencode in system PATH
        try {
                const opencodePath = execSync("which opencode", { encoding: "utf-8" }).trim();
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
        } catch {
                // opencode not found in PATH
                return null;
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
        return "/workspace";
}

/**
 * Get list of available ACP models
 * Note: OpenCode currently reports a single default model.
 * Dynamic model detection would require additional SDK support.
 */
export function getACPModels(): ACPModelInfo[] {
        return [
                {
                        id: "opencode-default",
                        name: "OpenCode Agent",
                        version: "1.0",
                        maxInputTokens: 200000,
                        maxOutputTokens: 64000,
                        supportsToolCalls: true,
                        supportsImageInput: true,
                },
                // OpenCode may support different model tiers in the future
                // Uncomment and modify as needed when OpenCode adds model selection:
                // {
                //         id: "opencode-fast",
                //         name: "OpenCode Fast (Lightweight)",
                //         version: "1.0",
                //         maxInputTokens: 100000,
                //         maxOutputTokens: 32000,
                //         supportsToolCalls: true,
                //         supportsImageInput: false,
                // },
        ];
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
