/**
 * ACP Agent Configuration
 * ============================
 * Configure your external ACP-compatible agent server here.
 * Supports Claude Code, Gemini CLI, OpenAI Codex, and custom agents.
 */

import type { ACPClientConfig, ACPModelInfo } from "@all-in-copilot/sdk";
import * as vscode from "vscode";

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

        // Default session mode (agent-specific)
        defaultMode?: string;

        // Default model ID (agent-specific)
        defaultModel?: string;

        // Favorite models for quick selection
        favoriteModels?: string[];
}

/**
 * Convert AgentConfig to ACPClientConfig for SDK usage
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

/**
 * Pre-configured agents - Uncomment and modify as needed
 */

// Claude Code (Anthropic)
// export const AGENT_CONFIG: AgentConfig = {
//         id: "claude-code",
//         name: "Claude Code",
//         participantId: "claude-code.agent",
//         command: "npx",
//         args: ["-y", "@anthropic-ai/claude-agent-sdk"],
//         defaultMode: "Primary",
//         defaultModel: "sonnet-4-20250514",
//         favoriteModels: ["sonnet-4-20250514", "haiku-4-20250514"],
// };

// Gemini CLI (Google)
// export const AGENT_CONFIG: AgentConfig = {
//         id: "gemini-cli",
//         name: "Gemini CLI",
//         participantId: "gemini-cli.agent",
//         command: "npx",
//         args: ["-y", "@google/gemini-cli"],
//         defaultModel: "gemini-2.5-pro",
// };

// OpenAI Codex
// export const AGENT_CONFIG: AgentConfig = {
//         id: "openai-codex",
//         name: "OpenAI Codex",
//         participantId: "openai-codex.agent",
//         command: "npx",
//         args: ["-y", "@openai/codex"],
// };

// Custom agent example
// export const AGENT_CONFIG: AgentConfig = {
//         id: "my-acp-agent",
//         name: "My ACP Agent",
//         participantId: "my-acp-agent.agent",
//         command: "npx",
//         args: ["-y", "@anthropic-ai/claude-agent-sdk"],
//         env: {},
//         cwd: undefined, // Will use workspace folder at runtime
// };

// OpenCode AI - Use system PATH to find "opencode" executable
// Run: which opencode (or add to PATH if not found)
export function getOpenCodeConfig(): AgentConfig | null {
        // Try to find opencode in system PATH
        const { execSync } = require("child_process");
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
 * Uses dynamic detection when possible
 */
export function getACPModels(): ACPModelInfo[] {
        // Try to detect OpenCode version
        const opencodeConfig = getOpenCodeConfig();
        let version = "1.0";
        let maxInputTokens = 200000;
        let maxOutputTokens = 64000;

        if (opencodeConfig) {
                try {
                        const { execSync } = require("child_process");
                        // Try to get OpenCode version
                        const versionOutput = execSync(`"${opencodeConfig.command}" --version`, {
                                encoding: "utf-8",
                                timeout: 5000,
                        }).trim();
                        // Parse version from output (e.g., "OpenCode v1.5.0")
                        const versionMatch = versionOutput.match(/v?(\d+\.\d+\.\d+)/);
                        if (versionMatch) {
                                version = versionMatch[1];
                        }
                } catch {
                        // Version detection failed, use defaults
                }
        }

        return [
                {
                        id: "opencode-default",
                        name: "OpenCode Agent",
                        version: version,
                        maxInputTokens: maxInputTokens,
                        maxOutputTokens: maxOutputTokens,
                        supportsToolCalls: true,
                        supportsImageInput: true,
                },
        ];
}

/**
 * Get the active ACP agent configuration
 * Uses OpenCode if available, otherwise falls back to default
 */
export function getActiveAgentConfig(): AgentConfig {
        const opencodeConfig = getOpenCodeConfig();
        if (opencodeConfig) {
                return opencodeConfig;
        }

        // Fallback: Use npx to run Claude Agent SDK
        return {
                id: "claude-agent",
                name: "Claude Agent (via npx)",
                participantId: "claude-agent.agent",
                command: "npx",
                args: ["-y", "@anthropic-ai/claude-agent-sdk"],
                env: {},
                cwd: undefined,
        };
}

// Default active configuration - Uses OpenCode if available
// Note: If OpenCode is not in PATH, extension will show an error
// To use Claude Agent SDK instead, uncomment below:
// export const AGENT_CONFIG: AgentConfig = {
//         id: "claude-agent",
//         name: "Claude Agent",
//         participantId: "claude-agent.agent",
//         command: "npx",
//         args: ["-y", "@anthropic-ai/claude-agent-sdk"],
//         env: {},
//         cwd: undefined,
// };
export const AGENT_CONFIG = getActiveAgentConfig();
