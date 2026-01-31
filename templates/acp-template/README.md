# OpenCode Agent Provider

This VS Code extension integrates with the **OpenCode** CLI agent via the Agent Client Protocol (ACP). It provides a native chat experience in VS Code's AI Chat view, powered by OpenCode's AI coding capabilities.

## About OpenCode

**OpenCode** is an AI-powered coding assistant CLI tool built with the Agent Client Protocol (ACP). It provides intelligent code completion, refactoring, debugging, and general programming assistance.

## Features

- **Native Chat Integration**: Use VS Code's AI Chat view to interact with OpenCode
- **ACP Protocol**: Built on the standardized Agent Client Protocol for reliable agent communication
- **Session Management**: Persistent conversations with full context awareness
- **MCP Tool Support**: Access to Model Context Protocol tools when configured
- **Real-time Streaming**: Stream responses as they're generated

## Requirements

- **OpenCode CLI**: [Installation Guide](https://github.com/sanchuanhehe/opencode-cli)
- **Node.js**: 18.0 or higher
- **VS Code**: 1.104.0 or higher
- **pnpm**: 9.0 or higher

## Installation

### 1. Install OpenCode CLI

```bash
# Install OpenCode from npm
npm install -g @opencode/cli

# Or build from source
git clone https://github.com/sanchuanhehe/opencode-cli.git
cd opencode-cli
npm install
npm run build
```

### 2. Install the VS Code Extension

#### Option A: Install from VSIX (Recommended)

Download the latest `.vsix` package from our [releases page](https://github.com/sanchuanhehe/all-in-copilot/releases) and install:

```bash
# Install via VS Code CLI
code --install-extension acp-agent-provider-*.vsix
```

#### Option B: Build from Source

```bash
cd templates/acp-template
pnpm install
pnpm run compile
pnpm run vsce:package
code --install-extension acp-agent-provider-*.vsix
```

### 3. Configure OpenCode

Edit `src/config.ts` to point to your OpenCode installation:

```typescript
export const AGENT_CONFIG: AgentConfig = {
	id: "opencode",
	name: "OpenCode",
	participantId: "opencode.participant",

	// OpenCode installation paths (auto-detected)
	command: "opencode",
	args: [],

	// Working directory
	cwd: "${workspaceFolder}",

	// Environment variables (add your API keys here)
	env: {
		// "ANTHROPIC_API_KEY": process.env.ANTHROPIC_API_KEY ?? "",
	},

	// Transport type
	transport: "stdio",

	// Default session settings
	defaultMode: "Primary",
	defaultModel: "sonnet-4-20250514",
};
```

## Usage

### Starting a Conversation

1. Open VS Code's Chat view (`Ctrl+Alt+M` / `Cmd+Alt+M`)
2. Select "OpenCode Agent" from the chat participant dropdown
3. Start asking coding questions!

### Commands

| Command | Description |
|---------|-------------|
| `opencode.manage` | Open configuration settings |
| `opencode.restart` | Restart the OpenCode agent |
| `opencode.configure` | Configure agent settings |

### Configuration

The extension supports the following settings (VS Code Settings):

- `opencode.command`: Command to run OpenCode (default: `opencode`)
- `opencode.args`: Arguments passed to OpenCode
- `opencode.transport`: Transport type (`stdio`, `tcp`, `http`)
- `opencode.cwd`: Working directory for the agent

## Supported Agents

While this template is configured for **OpenCode** by default, it can be used with any ACP-compatible agent:

| Agent | Installation | Command |
|-------|--------------|---------|
| **OpenCode** | `npm install -g @opencode/cli` | `opencode` |
| **Claude Code** | `npm install -g @anthropic-ai/claude-code` | `claude` |
| **Gemini CLI** | `npm install -g @google/gemini-cli` | `gemini` |
| **Custom Agents** | Any ACP-compatible implementation | Custom |

## Architecture

```
src/
├── extension.ts    # Extension activation, chat participant, commands
├── config.ts       # Agent configuration and detection logic
└── vscode/         # VS Code API type definitions (auto-generated)
```

### Key Components

- **ACPClientManager**: Manages connections to the external agent server via ACP
- **ACPProvider**: VS Code LanguageModelChatParticipant implementation
- **ChatParticipant**: Handles user conversations in VS Code Chat view
- **Agent Session**: Manages session state, prompts, and continuations

## Troubleshooting

### Agent Not Found

If OpenCode isn't detected, ensure:

1. OpenCode is in your PATH:
   ```bash
   which opencode
   ```

2. Or configure the full path in `src/config.ts`:
   ```typescript
   command: "/full/path/to/opencode",
   ```

### Connection Failed

Check the output channel (`View > Output > "ACP Agent"`):

- Verify OpenCode can run standalone
- Check for port conflicts (TCP/HTTP mode)
- Review agent logs for initialization errors

### API Keys Missing

If using cloud LLM providers, ensure your API keys are set:

```typescript
env: {
	"ANTHROPIC_API_KEY": process.env.ANTHROPIC_API_KEY ?? "",
}
```

## Development

### Running in VS Code

1. Press `F5` to start a new VS Code window with the extension loaded
2. Use the Chat view to interact with OpenCode

### Watching for Changes

```bash
pnpm run watch
```

This will rebuild the extension on file changes.

### Building

```bash
pnpm run compile    # Compile TypeScript
pnpm run vsce:package  # Create VSIX package
```

## License

MIT

## Related Projects

- [OpenCode CLI](https://github.com/sanchuanhehe/opencode-cli) - The OpenCode CLI agent
- [All-In Copilot](https://github.com/sanchuanhehe/all-in-copilot) - Core SDK and framework
- [Agent Client Protocol](https://github.com/agentclientprotocol/agent-client-protocol) - Protocol specification
- [Claude Code SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) - Claude Code agent SDK

### Key Components

| Component | Description |
|-----------|-------------|
| `ACPClientManager` | Manages connections to external agent servers |
| `ACPProvider` | VS Code LanguageModelChatParticipant implementation |
| `ChatParticipant` | Handles user conversations in VS Code Chat view |
| `Agent Session` | Manages session state, prompts, and continuations |

## Commands

The extension registers the following VS Code commands:

| Command | Description |
|---------|-------------|
| `acp.startAgent` | Start or connect to the agent server |
| `acp.stopAgent` | Stop the agent server |
| `acp.restartAgent` | Restart the agent server |
| `acp.sendToAgent` | Send text to the current session |

## Environment Variables

The following environment variables are automatically passed to the agent:

- `HOME`: User's home directory
- `PATH`: System PATH with common locations added
- `WORKSPACE_FOLDER`: Current VS Code workspace (if available)

Custom environment variables can be added in `src/config.ts`:

```typescript
env: {
	"ANTHROPIC_API_KEY": process.env.ANTHROPIC_API_KEY ?? "",
	"MY_CUSTOM_VAR": "custom-value",
}
```

## Troubleshooting

### Agent Not Found

If your agent isn't detected, ensure:

1. The executable is in your PATH, or
2. Configure the full path in `src/config.ts`:
   ```typescript
   command: "/full/path/to/agent",
   ```

### Connection Failed

Check the output channel (`View > Output > "ACP Agent"`):

- Verify the agent process can spawn
- Check for port conflicts (TCP/HTTP mode)
- Review agent logs for initialization errors

### MCP Servers Not Loading

MCP servers require proper configuration:

```typescript
mcpServers: [
	{
		name: "filesystem",
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
	},
],
```

## Development

### Watching for Changes

```bash
pnpm run watch
```

This rebuilds the extension automatically when source files change.

### Running Tests

```bash
pnpm test
```

### Adding Custom Features

1. **Add new commands**: Register in `extension.ts` using `vscode.commands.registerCommand`
2. **Custom UI**: Add webviews or tree views in `extension.ts`
3. **Configuration**: Use VS Code's workspace configuration API

## Requirements

- **Node.js**: 18.0 or higher
- **VS Code**: 1.104.0 or higher
- **pnpm**: 9.0 or higher

## License

MIT

## Related Projects

- [All-In Copilot](https://github.com/sanchuanhehe/all-in-copilot) - Core SDK and framework
- [OpenCode CLI](https://github.com/sanchuanhehe/opencode-cli) - Reference ACP agent implementation
- [Agent Client Protocol](https://github.com/agentclientprotocol/agent-client-protocol) - Protocol specification
