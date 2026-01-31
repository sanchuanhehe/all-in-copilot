# ACP Template Terminal Callbacks 实现总结

## 概述

本次更新为 `acp-template` 添加了完整的 `ClientCallbacks` 接口实现，使 ACP 代理能够使用 VS Code 的原生终端功能。

## 主要更改

### 1. 新增终端状态管理 (`config.ts`)

```typescript
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
```

### 2. 实现了完整的 ClientCallbacks 接口

| 方法 | 功能 |
|------|------|
| `createTerminal` | 创建 VS Code 终端，自动检测后台进程 |
| `getTerminalOutput` | 获取终端输出，支持同步/异步模式 |
| `waitForTerminalExit` | 等待终端命令退出 |
| `releaseTerminal` | 释放终端资源 |
| `killTerminal` | 终止终端进程 |
| `readTextFile` | 读取文本文件 |
| `writeTextFile` | 写入文本文件 |
| `requestPermission` | 权限确认（自动批准安全操作） |
| `extMethod` | 处理扩展方法请求（支持自定义工具） |
| `extNotification` | 处理扩展通知 |

### 3. 自动后台进程检测

`createTerminal` 方法会自动检测以下模式为后台进程：
- `npm run watch` / `pnpm watch`
- `npm run dev` / `pnpm dev`
- `vite`
- `--watch`
- `nodemon`
- `ts-node --watch`

### 4. 更新的配置函数

```typescript
export function toACPClientConfig(config: AgentConfig): ACPClientConfig {
    return {
        transport: "stdio",
        agentPath: config.command,
        agentArgs: config.args,
        env: config.env,
        cwd: config.cwd,
        callbacks: clientCallbacks,  // 新增
    };
}

export function getClientCallbacks(): ClientCallbacks {
    return clientCallbacks;
}
```

## 技术架构

```
ACP Agent (外部进程)
    │
    │ ACP Protocol (stdio)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  acp-template (VS Code Extension)                   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  ACPClientManager                           │   │
│  │  - 接收终端请求 (createTerminal, etc.)       │   │
│  │  - 调用 callbacks                           │   │
│  └─────────────────────────────────────────────┘   │
│                         │                          │
│                         ▼                          │
│  ┌─────────────────────────────────────────────┐   │
│  │  ClientCallbacks                            │   │
│  │  - createTerminal() → vscode.window.create  │   │
│  │  - getTerminalOutput() → vscode.lm.invoke   │   │
│  │  - readTextFile() → vscode.workspace        │   │
│  │  - writeTextFile() → vscode.WorkspaceEdit   │   │
│  └─────────────────────────────────────────────┘   │
│                         │                          │
│                         ▼                          │
│  ┌─────────────────────────────────────────────┐   │
│  │  VS Code Native APIs                        │   │
│  │  - vscode.window.createTerminal()           │   │
│  │  - vscode.lm.invokeTool("run_in_terminal")  │   │
│  │  - vscode.workspace.openTextDocument()      │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## 使用方法

无需额外配置。`toACPClientConfig()` 会自动传递 `callbacks`：

```typescript
// extension.ts 中
const clientConfig = toACPClientConfig(agentConfig);
// clientConfig.callbacks 已自动设置
```

## 测试结果

- ✅ 编译成功 (`pnpm compile`)
- ✅ ESLint 检查通过
- ✅ SDK 测试全部通过 (147 tests)

## 文件更改

| 文件 | 更改类型 |
|------|----------|
| `templates/acp-template/src/config.ts` | 新增终端回调实现 (~200 行) |
| `templates/acp-template/src/extension.ts` | 更新导入和 lint 修复 |

## 扩展功能

### 添加新的终端工具

SDK 现在支持通过 `extMethod` 和 `extNotification` 扩展方法来支持更多的 VS Code Copilot 工具。

#### 方式 1: 实现 extMethod

要支持更多 VS Code Copilot 工具（如 `get_terminal_output`、`terminal_selection`），可以在 `extMethod` 中处理：

```typescript
const clientCallbacks: ClientCallbacks = {
    // ... 现有方法

    async extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
        switch (method) {
            case "get_terminal_output":
                // 获取活动终端的输出
                const terminal = vscode.window.activeTerminal;
                if (terminal) {
                    // 使用 vscode.lm.invokeTool 获取终端输出
                    return vscode.lm.invokeTool("get_terminal_output", params);
                }
                return { output: "", truncated: false };

            case "terminal_selection":
                // 获取当前终端选择
                return vscode.lm.invokeTool("terminal_selection", params);

            case "terminal_last_command":
                // 获取上一个执行的命令
                return vscode.lm.invokeTool("terminal_last_command", params);

            default:
                throw new Error(`Unknown extension method: ${method}`);
        }
    },
};
```

#### 方式 2: 使用 VS Code LM API 直接调用工具

如果 Agent 需要直接调用 VS Code Copilot 的工具，可以通过 `vscode.lm.invokeTool()`：

```typescript
async function invokeCopilotTool(toolName: string, params: Record<string, unknown>) {
    // 调用 VS Code Copilot 内置工具
    const messages = [
        {
            role: "user",
            content: {
                type: "tool-use",
                tool: toolName,
                input: params,
            },
        },
    ];

    const response = await vscode.lm.invokeLanguageModelChat(
        { family: "copilot", version: "1" },
        messages,
        { tokenLimits: [1000] }
    );

    return response;
}
```

#### 方式 3: 注册自定义语言模型提供商

如果需要更复杂的工具调用，可以注册自定义的 LM 提供商：

```typescript
import { registerACPProvider } from "@all-in-copilot/sdk/vscode";

export function activate(context: vscode.ExtensionContext) {
    // 注册 ACP 提供商
    const disposable = registerACPProvider("acp-agent", {
        models: [
            { id: "agent/minimax-m2.1", name: "MiniMax M2.1" },
        ],
    });

    context.subscriptions.push(disposable);
}
```

## 架构说明

```
┌─────────────────────────────────────────────────────────────────┐
│                      VS Code Copilot                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  内置工具 (Built-in Tools)                                │ │
│  │  - run_in_terminal      - get_terminal_output            │ │
│  │  - terminal_selection   - terminal_last_command           │ │
│  │  - read_file            - replace_string_in_file          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                    │
│                            ▼                                    │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  vscode.lm.invokeTool() API                               │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                    │
│                            ▼                                    │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  acp-template (ACP Agent Provider)                        │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  ClientCallbacks                                    │ │ │
│  │  │  - createTerminal()  → vscode.window.createTerminal │ │ │
│  │  │  - getTerminalOutput() → vscode.lm.invokeTool       │ │ │
│  │  │  - extMethod() → 自定义工具处理                     │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                            │                              │ │
│  │                            ▼                              │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  ACPClientManager                                   │ │ │
│  │  │  - 协议消息处理                                      │ │ │
│  │  │  - 请求路由                                          │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                    │
│                            ▼                                    │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  ACP Agent (外部进程)                                     │ │
│  │  - OpenCode CLI                                          │ │
│  │  - Claude Code SDK                                       │ │
│  │  - 其他 ACP 兼容代理                                      │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```
