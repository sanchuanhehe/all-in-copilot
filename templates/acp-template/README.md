# ACP Agent Provider Template

This template provides a VS Code extension that integrates with external ACP (Agent Client Protocol) compatible agent servers.

## Features

- **ACP Protocol Support**: Connect to any ACP-compatible agent server via stdio
- **Multiple Agent Support**: Can be configured for Claude Code, Gemini CLI, OpenAI Codex, or custom agents
- **Session Management**: Full support for ACP session modes and configurations
- **Tool Integration**: MCP (Model Context Protocol) server support

## Supported Agents

The template can be configured to work with any ACP-compatible agent:

- **Claude Code**: Anthropic's official CLI agent (`npx @anthropic-ai/claude-agent-sdk`)
- **Gemini CLI**: Google's Gemini CLI agent
- **OpenAI Codex**: OpenAI's Codex CLI
- **Custom Agents**: Any agent implementing the ACP protocol

## Configuration

Edit `src/config.ts` to configure your agent:

```typescript
export const AGENT_CONFIG: AgentConfig = {
        // Agent identification
        id: "my-agent",
        name: "My Agent",
        participantId: "my-agent.agent",

        // Command to run the agent
        command: "npx",
        args: ["-y", "@anthropic-ai/claude-agent-sdk"],

        // Environment variables
        env: {},

        // Default settings
        defaultMode: "Primary",
        defaultModel: "sonnet-4-20250514",
};
```

## Installation

1. Navigate to the template directory:

   ```bash
   cd acp-template
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Compile the extension:

   ```bash
   pnpm run compile
   ```

4. Package the extension:

   ```bash
   pnpm run vsce:package
   ```

## Development

### Running in VS Code

1. Press `F5` to start a new VS Code window with the extension loaded
2. Use the Chat view to interact with your agent

### Watching for Changes

```bash
pnpm run watch
```

This will rebuild the extension on file changes.

## Architecture

```txt
src/
├── extension.ts    # Extension entry point and chat participant
├── config.ts       # Agent configuration
└── vscode/         # VS Code type definitions (generated)
```

### Key Components

- **ACPClientManager**: Manages connections to the external agent server
- **ACPProvider**: VS Code language model chat provider implementation
- **Agent Session**: Handles conversation sessions and tool invocations

## Protocol Details

The ACP (Agent Client Protocol) is a JSON-RPC protocol over stdio:

- **Version**: V1
- **Transport**: stdio (stdin/stdout)
- **Initialization**: Handshake with version and capability negotiation
- **Messages**: JSON-RPC 2.0 format with content blocks

## Requirements

- Node.js 18+
- VS Code 1.104.0+
- pnpm 9.x

## License

MIT
