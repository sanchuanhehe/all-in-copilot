# ACP Terminal Adapter

ACP 终端适配器为 VS Code 扩展提供与 VS Code Copilot 一致的终端能力。

## 特性

### 已实现的 ACP 协议方法

| ACP 方法 | 功能 | 状态 |
|---------|------|-----|
| `terminal/create` | 创建终端并执行命令 | ✅ 完整支持 |
| `terminal/output` | 获取终端输出（带字节限制和截断标记） | ✅ 完整支持 |
| `terminal/wait_for_exit` | 等待命令执行完成 | ✅ 超时+空闲检测 |
| `terminal/kill` | 终止命令（发送 Ctrl+C） | ✅ 支持 |
| `terminal/release` | 释放终端资源 | ✅ 支持 |

### 默认行为

1. **输出字节限制**: 64KB (`DEFAULT_OUTPUT_BYTE_LIMIT`)
2. **等待超时**: 30秒 (`DEFAULT_WAIT_TIMEOUT_MS`)
3. **空闲检测**: 5秒无输出时认为命令完成（作为 shell integration 的后备）
4. **截断策略**: 保留尾部（最新输出），并设置 `truncated: true`
5. **会话隔离**: 同一会话复用终端，不同会话相互隔离

## 使用方法

### 方式 1: 使用便捷集成函数

```typescript
import { createTerminalCallbacks, disposeTerminalAdapter } from "@all-in-copilot/sdk/acp";
import { TerminalServiceImpl } from "@all-in-copilot/sdk/platform/terminal/vscode";

// 创建终端服务
const terminalService = new TerminalServiceImpl();

// 创建终端回调
const { callbacks, adapter } = createTerminalCallbacks(terminalService, {
    shellPath: "/bin/bash",  // 可选
    shellArgs: ["-l"],       // 可选
});

// 在 ACPClientManager 中使用
const clientManager = new ACPClientManager();
const client = await clientManager.getClient({
    transport: "stdio",
    agentPath: "/path/to/agent",
    callbacks: {
        ...callbacks,
        // 其他回调...
        requestPermission: async (request) => {
            // 处理权限请求
        },
    },
});

// 清理
disposeTerminalAdapter(adapter);
terminalService.dispose();
```

### 方式 2: 直接使用 ACPTerminalAdapter

```typescript
import { ACPTerminalAdapter, createACPTerminalAdapter } from "@all-in-copilot/sdk/acp";
import { TerminalServiceImpl } from "@all-in-copilot/sdk/platform/terminal/vscode";

const terminalService = new TerminalServiceImpl();
const adapter = createACPTerminalAdapter(terminalService);

// 创建终端并执行命令
const { terminalId } = await adapter.createTerminal({
    sessionId: "my-session",
    command: "npm",
    args: ["install"],
    cwd: "/path/to/project",
    outputByteLimit: 128 * 1024,  // 128KB
});

// 获取输出
const output = await adapter.getOutput({ terminalId });
console.log("Output:", output.output);
console.log("Truncated:", output.truncated);

// 等待完成
const exitResult = await adapter.waitForExit({
    terminalId,
    timeoutMs: 60000,  // 60秒
});
console.log("Exit code:", exitResult.exitCode);

// 释放终端
await adapter.release({ terminalId });

// 清理
adapter.dispose();
```

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACP Protocol (Agent)                          │
│  terminal/create  terminal/output  terminal/wait_for_exit  ...   │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ACPClientManager                              │
│  (ClientCallbacks: createTerminal, getTerminalOutput, ...)       │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              callbackIntegration.ts                              │
│  createTerminalCallbacks() - 桥接层                               │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ACPTerminalAdapter                             │
│  - 管理终端生命周期                                                │
│  - 跟踪会话关联                                                    │
│  - 处理输出截断                                                    │
│  - 实现等待完成逻辑                                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              TerminalBufferManager                               │
│  - 每终端输出缓冲                                                   │
│  - 字节限制（尾部截断）                                              │
│  - 完成检测（shell integration / 空闲超时）                          │
│  - 退出状态追踪                                                     │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ITerminalService                              │
│  - VS Code Terminal API 抽象                                      │
│  - Shell Integration 事件（如可用）                                 │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                 VS Code Terminal API                             │
│  window.createTerminal()  Terminal.sendText()                    │
│  onDidWriteTerminalData  onDidEndTerminalShellExecution          │
└─────────────────────────────────────────────────────────────────┘
```

## 文件结构

```
packages/sdk/src/acp/terminal/
├── index.ts                    # 模块导出
├── types.ts                    # ACP 终端类型定义
├── terminalBufferManager.ts    # 增强型缓冲管理器
├── acpTerminalAdapter.ts       # 主要适配器实现
├── callbackIntegration.ts      # 与 ACPClientManager 的集成
└── README.md                   # 本文档
```

## 类型定义

### 请求/响应类型

```typescript
interface ACPCreateTerminalRequest {
    sessionId: string;
    command: string;
    args?: string[];
    env?: Array<{ name: string; value: string }>;
    cwd?: string;
    outputByteLimit?: number;  // 默认 64KB
}

interface ACPCreateTerminalResponse {
    terminalId: string;
}

interface ACPTerminalOutputResponse {
    output: string;
    truncated: boolean;  // 输出是否被截断
    exitStatus?: { exitCode?: number; signal?: string };
}

interface ACPWaitForExitRequest {
    terminalId: string;
    timeoutMs?: number;  // 默认 30秒
}

interface ACPWaitForExitResponse {
    exitCode?: number;
    signal?: string;
}
```

### 适配器接口

```typescript
interface IACPTerminalAdapter {
    createTerminal(request: ACPCreateTerminalRequest): Promise<ACPCreateTerminalResponse>;
    getOutput(request: ACPTerminalOutputRequest): Promise<ACPTerminalOutputResponse>;
    waitForExit(request: ACPWaitForExitRequest): Promise<ACPWaitForExitResponse>;
    killCommand(request: ACPKillRequest): Promise<ACPKillResponse>;
    release(request: ACPReleaseRequest): Promise<ACPReleaseResponse>;
    getSessionTerminalIds(sessionId: string): string[];
    disposeSession(sessionId: string): Promise<void>;
    dispose(): void;
}
```

## 与 VS Code Copilot 的对比

| 功能 | VS Code Copilot | ACP Terminal Adapter |
|------|-----------------|---------------------|
| 终端创建 | ITerminalService | ✅ ACPTerminalAdapter.createTerminal |
| 输出捕获 | terminalBufferListener | ✅ TerminalBufferManager |
| 字节限制 | outputByteLimit | ✅ 支持，默认 64KB |
| 截断标记 | truncated flag | ✅ 支持 |
| 等待完成 | Shell Integration | ✅ 支持 + 空闲检测后备 |
| 终止命令 | - | ✅ killCommand (Ctrl+C) |
| 会话隔离 | Session terminals | ✅ 支持 |
| Proposed API | ✅ | ✅ 可选使用 |

## 注意事项

1. **Shell Integration**: 如果 VS Code 启用了 Shell Integration，将使用 `onDidEndTerminalShellExecution` 来精确检测命令完成。否则使用空闲超时检测。

2. **Proposed API**: 本模块尝试使用 `onDidWriteTerminalData`（proposed API）来捕获实时输出。如果不可用，输出捕获能力会受限。

3. **信号发送**: `killCommand` 发送 Ctrl+C (SIGINT) 来终止命令。VS Code 没有直接的进程信号 API，这是最接近的实现。

4. **内存管理**: 每个终端的输出缓冲在终端释放时会被清理。建议在不需要时及时调用 `release()`。
