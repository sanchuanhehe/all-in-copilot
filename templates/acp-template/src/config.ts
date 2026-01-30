/**
 * ACP Agent Configuration
 * ============================
 * Configure your external ACP-compatible agent server here.
 * Supports Claude Code, Gemini CLI, OpenAI Codex, and custom agents.
 */

/**
 * Information about an ACP model.
 */
export interface ACPModelInfo {
        id: string;
        name: string;
        version: string;
        maxInputTokens?: number;
        maxOutputTokens?: number;
        supportsToolCalls?: boolean;
        supportsImageInput?: boolean;
}

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

        // Default session mode (agent-specific)
        defaultMode?: string;

        // Default model ID (agent-specific)
        defaultModel?: string;

        // Favorite models for quick selection
        favoriteModels?: string[];
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
export const AGENT_CONFIG: AgentConfig = {
        id: "my-acp-agent",
        name: "My ACP Agent",
        participantId: "my-acp-agent.agent",
        command: "npx",
        args: ["-y", "@anthropic-ai/claude-agent-sdk"],
        env: {},
        defaultMode: "Primary",
        defaultModel: "sonnet-4-20250514",
        favoriteModels: ["sonnet-4-20250514"],
};

/**
 * Get available models for this agent
 */
export function getACPModels(): ACPModelInfo[] {
        return [
                {
                        id: "sonnet-4-20250514",
                        name: "Claude Sonnet 4",
                        version: "4.0",
                        maxInputTokens: 200000,
                        maxOutputTokens: 64000,
                        supportsToolCalls: true,
                        supportsImageInput: true,
                },
                {
                        id: "haiku-4-20250514",
                        name: "Claude Haiku 4",
                        version: "4.0",
                        maxInputTokens: 200000,
                        maxOutputTokens: 64000,
                        supportsToolCalls: true,
                        supportsImageInput: true,
                },
        ];
}
