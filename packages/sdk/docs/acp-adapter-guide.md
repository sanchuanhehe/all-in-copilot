# @all-in-copilot/sdk ACP 协议适配指南

本文档描述了 `@all-in-copilot/sdk` 对 [Agent Client Protocol (ACP)](https://agentclientprotocol.com) 的适配实现，涵盖 SDK 职责范围、ACP 功能映射以及与 VS Code API 的对应关系。

## 1. SDK 职责概述

`@all-in-copilot/sdk` 作为一个轻量级适配层，主要负责以下职责：

### 1.1 连接管理

| 职责 | 描述 | 核心类 |
|------|------|--------|
| 进程生命周期 | 启动、监控、终止外部 Agent 进程 | `ACPClientManager` |
| 传输层抽象 | 处理 stdio 传输的输入输出流 | `ACPClientManager` |
| 连接缓存 | 复用已建立的连接，避免重复启动进程 | `ACPClientManager.clients` |

### 1.2 协议消息处理

| 职责 | 描述 | 核心类 |
|------|------|--------|
| 请求构建 | 将高层 API 调用转换为 ACP JSON-RPC 消息 | SDK 自动处理 |
| 响应解析 | 将 ACP 响应转换为易用的 TypeScript 类型 | SDK 自动处理 |
| 流式处理 | 支持 `ndJsonStream` 格式的增量响应 | SDK 自动处理 |
| 错误标准化 | 将 ACP 错误转换为统一的错误格式 | `ACPClientManager` |

### 1.3 VS Code 集成

| 职责 | 描述 | 核心类 |
|------|------|--------|
| LanguageModelChatProvider | 实现 VS Code 语言模型聊天 API | `ACPProvider` |
| 会话管理 | 在 VS Code 会话中跟踪 Agent 对话 | `ACPProvider` |
| 进度报告 | 通过 `vscode.Progress` 显示操作状态 | `ACPProvider` |

---

## 2. ACP 功能与 VS Code API 映射

### 2.1 初始化阶段

**ACP 功能**：
- `initialize`: 协商协议版本，交换客户端/Agent 能力
- `authenticate`: 可选的认证流程

**VS Code API 映射**：
```typescript
// ACPClientManager.initialize() -> 无直接对应 API
// 在内部完成协议握手，外部通过 InitResult 获取结果
const initResult = await clientManager.initialize(connection);
// initResult: { success, agentInfo, error? }
```

**SDK 提供**：
- `InitResult` 接口：标准化初始化结果
- 自动协议版本协商
- 客户端能力自动设置（fs, terminal）

### 2.2 会话管理

**ACP 功能**：
- `session/new`: 创建新会话
- `session/load`: 加载已有会话（可选）
- `session/set_mode`: 设置会话模式（可选）
- `session/list`: 列出所有会话（可选）

**VS Code API 映射**：
```typescript
// VS Code 没有直接的会话管理 API
// SDK 在内部管理会话状态
const sessionResult = await clientManager.newSession(connection, {
    cwd: workspacePath,
    mcpServers: [...]
});
// sessionResult: { success, sessionId?, error? }
```

**SDK 提供**：
- `ACPProvider` 自动管理会话生命周期
- `NewSessionResult` 接口
- `getSession()`, `addSession()`, `listSessions()` 方法

### 2.3 对话交互

**ACP 功能**：
- `session/prompt`: 发送用户消息
- `session/update`: 流式更新通知（内容、工具调用、进度）
- `session/cancel`: 中断处理

**VS Code API 映射**：
```typescript
// VS Code Chat API
vscode.chat.createChatParticipant(participantId, handler);

// VS Code Language Model API (ACPProvider)
const response = await provider.provideLanguageModelChatResponse(
    model,
    messages,
    { stream: true }
);
```

**SDK 提供**：
- `ACPProvider.provideLanguageModelChatResponse()` 实现
- `ACPClientManager.streamPrompt()` 异步迭代器
- 自动消息格式转换

### 2.4 工具调用

**ACP 功能**：
- `session/update` (tool_call): 工具调用请求
- `session/request_permission`: 权限请求
- `fs/read_text_file`: 读取文件
- `fs/write_text_file`: 写入文件

**VS Code API 映射**：
```typescript
// VS Code 没有直接的工具调用 API
// 工具执行由 Agent 负责，SDK 仅负责传输

// 权限请求通过 ChatResponseStream 处理
response.confirm({ title: "Allow", command: "allow" });
```

**SDK 提供**：
- `ClientSideConnection` 方法自动处理工具调用
- 权限请求的 `confirm()` API 集成
- 文件操作自动转发给 VS Code 环境

### 2.5 终端管理

**ACP 功能**：
- `terminal/create`: 创建终端
- `terminal/output`: 获取终端输出
- `terminal/input`: 发送输入
- `terminal/kill`: 终止终端

**VS Code API 映射**：
```typescript
// VS Code Terminal API
const terminal = vscode.window.createTerminal("Agent Terminal");
terminal.show();
terminal.sendText("npm test");
```

**SDK 提供**：
- `ClientSideConnection.terminalCreate()` 方法
- 终端输出通过 `streamPrompt` 的 `terminal` 类型更新传递
- 自动终端生命周期管理

---

## 3. SDK 暴露接口

### 3.1 核心类

#### `ACPClientManager`

```typescript
class ACPClientManager {
    constructor(clientInfo?: { name?: string; version?: string });

    // 连接管理
    getClient(config: ACPClientConfig): Promise<ClientSideConnection>;

    // 协议方法
    initialize(client: ClientSideConnection): Promise<InitResult>;
    newSession(client: ClientSideConnection, params: SessionParams): Promise<NewSessionResult>;
    prompt(client: ClientSideConnection, params: PromptParams): Promise<PromptResult>;
    streamPrompt(client: ClientSideConnection, params: PromptParams): AsyncGenerator<Update>;

    // 会话管理
    addSession(sessionId: string, connection: ClientSideConnection, result: NewSessionResult): void;
    getSession(sessionId: string): { connection: ClientSideConnection; sessionId: string } | undefined;

    // 资源清理
    dispose(): Promise<void>;
}
```

#### `ACPProvider`

```typescript
class ACPProvider implements vscode.LanguageModelChatProvider {
    constructor(options: ACPProviderOptions);

    // VS Code LanguageModelChatProvider 接口
    provideLanguageModelChatInformation(options: { silent: boolean }, token: CancellationToken): Promise<LanguageModelChatInformation[]>;
    provideLanguageModelChatResponse(model: LanguageModelChatInformation, messages: readonly LanguageModelChatRequestMessage[], options: { stream: boolean }, token: CancellationToken): AsyncIterable<LanguageModelChatResponse>;
    provideLanguageModelChatTokenLimits(model: LanguageModelChatInformation): Promise<LanguageModelChatTokenLimits>;
}
```

### 3.2 配置接口

```typescript
interface ACPClientConfig {
    transport: "stdio";
    agentPath: string;           // Agent 可执行文件路径
    agentArgs?: string[];        // 启动参数
    env?: Record<string, string>; // 环境变量
    cwd?: string;                // 工作目录
}

interface ACPModelInfo {
    id: string;                  // 模型标识符
    name: string;                // 显示名称
    version?: string;            // 版本
    maxInputTokens?: number;     // 最大输入 token
    maxOutputTokens?: number;    // 最大输出 token
    supportsToolCalls?: boolean; // 是否支持工具调用
    supportsImageInput?: boolean; // 是否支持图片输入
}

interface ACPProviderOptions {
    models: ACPModelInfo[];      // 可用模型列表
    clientConfig: ACPClientConfig; // 客户端配置
    clientInfo?: { name?: string; version?: string }; // 客户端信息
}
```

### 3.3 结果接口

```typescript
interface InitResult {
    success: boolean;
    agentInfo?: { name: string; version?: string };
    error?: string;
}

interface NewSessionResult {
    success: boolean;
    sessionId?: string;
    error?: string;
}

interface PromptResult {
    success: boolean;
    result?: { stopReason: string };
    error?: string;
}
```

### 3.4 从 SDK 导出的类型

```typescript
// 核心类
export { ACPClientManager, ACPProvider, registerACPProvider };

// 配置类型
export type {
    ACPClientConfig,
    ACPModelInfo,
    ACPProviderOptions,
};

// ACP 协议类型
export type {
    ClientSideConnection,
    ContentBlock,
    RequestPermissionRequest,
    RequestPermissionResponse,
    ReadTextFileRequest,
    ReadTextFileResponse,
    WriteTextFileRequest,
    WriteTextFileResponse,
};
```

---

## 4. 使用示例

### 4.1 基本使用

```typescript
import {
    ACPProvider,
    registerACPProvider,
    type ACPClientConfig,
    type ACPModelInfo,
} from "@all-in-copilot/sdk";
import * as vscode from "vscode";

// 配置
const clientConfig: ACPClientConfig = {
    transport: "stdio",
    agentPath: "npx",
    agentArgs: ["-y", "@anthropic-ai/claude-agent-sdk"],
    cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath,
};

const models: ACPModelInfo[] = [
    { id: "sonnet-4", name: "Claude Sonnet 4", maxInputTokens: 200000 },
];

// 创建 Provider
const provider = new ACPProvider({
    models,
    clientConfig,
    clientInfo: { name: "my-extension", version: "1.0.0" },
});

// 注册到 VS Code
const disposable = vscode.lm.registerLanguageModelChatProvider(
    `acp.my-agent`,
    provider
);
context.subscriptions.push(disposable);
```

### 4.2 高级用法

```typescript
import { ACPClientManager } from "@all-in-copilot/sdk";

// 自定义客户端管理
const manager = new ACPClientManager({ name: "custom", version: "2.0.0" });

// 获取连接
const connection = await manager.getClient({
    transport: "stdio",
    agentPath: "/path/to/agent",
    agentArgs: ["--verbose"],
});

// 初始化
const initResult = await manager.initialize(connection);
if (!initResult.success) {
    console.error("初始化失败:", initResult.error);
    return;
}

// 创建会话
const sessionResult = await manager.newSession(connection, {
    cwd: "/workspace",
    mcpServers: [
        { name: "filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"] },
    ],
});

// 流式对话
for await (const update of manager.streamPrompt(connection, {
    sessionId: sessionResult.sessionId!,
    prompt: [{ type: "text", text: "Hello, help me write a function." }],
})) {
    if (update.type === "text") {
        process.stdout.write(update.text);
    } else if (update.type === "tool_call") {
        console.log("Tool call:", update.title);
    }
}

// 清理
await manager.dispose();
```

---

## 5. 协议支持状态

### 5.1 已支持功能

| 功能 | 方法 | 状态 | 备注 |
|------|------|------|------|
| 初始化 | `initialize` | ✅ 已完成 | 完整支持 |
| 会话创建 | `session/new` | ✅ 已完成 | 完整支持 |
| 提示发送 | `session/prompt` | ✅ 已完成 | 流式支持 |
| 流式更新 | `session/update` | ✅ 已完成 | 基础类型 |
| 会话取消 | `session/cancel` | ✅ 已完成 | 通过 CancellationToken |
| 文件读取 | `fs/read_text_file` | ✅ 已完成 | SDK 自动处理 |
| 文件写入 | `fs/write_text_file` | ✅ 已完成 | SDK 自动处理 |
| 权限请求 | `session/request_permission` | ✅ 已完成 | 集成 confirm API |
| 终端创建 | `terminal/create` | ✅ 已完成 | 完整支持 |
| 终端输出 | `terminal/output` | ✅ 已完成 | 完整支持 |
| 终端输入 | `terminal/input` | ✅ 已完成 | 完整支持 |
| 终端终止 | `terminal/kill` | ✅ 已完成 | 完整支持 |
| MCP 服务器列表 | `mcp/list_servers` | ✅ 已完成 | 完整支持 |
| MCP 工具列表 | `mcp/list_tools` | ✅ 已完成 | 完整支持 |
| MCP 工具调用 | `mcp/call_tool` | ✅ 已完成 | 完整支持 |

### 5.2 待支持功能

| 功能 | 方法 | 状态 | 优先级 |
|------|------|------|--------|
| 会话加载 | `session/load` | 🔄 计划中 | 高 |
| 会话分叉 | `session/fork` | 🔄 计划中 | 中 |
| 会话模式 | `session/set_mode` | 🔄 计划中 | 低 |
| 会话恢复 | `session/resume` | 📋 待定 | 低 |

### 5.3 已知限制

1. **传输层限制**: 当前仅支持 stdio 传输，WebSocket 和其他传输待实现
2. **认证**: 暂不支持自定义认证方法
3. **自定义能力**: 暂不支持动态注册自定义协议能力
4. **二进制流**: 暂不支持 `outputByteLimit` 截断

---

## 6. 错误处理

### 6.1 错误类型

```typescript
interface ACPError {
    code: number;      // 错误代码
    message: string;   // 错误信息
    data?: unknown;    // 附加数据
}
```

### 6.2 常见错误代码

| 代码 | 含义 | 处理建议 |
|------|------|----------|
| -32600 | 无效请求 | 检查请求格式 |
| -32601 | 方法不存在 | 检查协议版本 |
| -32602 | 参数无效 | 验证输入参数 |
| -32000 | 服务器错误 | 查看 Agent 日志 |
| -32001 | 会话不存在 | 重新创建会话 |
| -32002 | 权限被拒 | 用户拒绝操作 |

### 6.3 错误处理示例

```typescript
try {
    const result = await clientManager.newSession(connection, params);
    if (!result.success) {
        // SDK 级别的错误
        console.error("操作失败:", result.error);
    }
} catch (error) {
    if (error instanceof Error) {
        console.error("异常:", error.message);
    }
}
```

---

## 7. 性能考虑

### 7.1 连接池

SDK 自动管理连接，避免重复启动进程：

```typescript
// 相同配置的请求会复用现有连接
const conn1 = await manager.getClient(config);
const conn2 = await manager.getClient(config);
// conn1 === conn2 (同一个连接)
```

### 7.2 流式处理

使用 `AsyncIterable` 实现低内存流式处理：

```typescript
for await (const update of streamPrompt(connection, params)) {
    // 增量处理，无需等待完整响应
    processUpdate(update);
}
```

### 7.3 取消支持

所有异步方法支持 `CancellationToken`：

```typescript
const controller = new AbortController();
// 在另一个任务中
controller.abort();

// 在方法调用中
for await (const update of streamPrompt(connection, params, controller.signal)) {
    // 检测到取消时自动退出循环
}
```

---

## 8. 调试与日志

### 8.1 启用调试日志

```typescript
// 设置环境变量
process.env.DEBUG = "acp:*";

// 或在 VS Code 输出通道查看
// "[ACP-Client] Process started"
// "[ACP-Client] Message sent: { ... }"
```

### 8.2 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 进程启动失败 | agentPath 错误 | 检查路径配置 |
| 会话创建超时 | Agent 无响应 | 检查 Agent 健康状态 |
| 权限请求无响应 | confirm 未实现 | 实现确认处理器 |
| 内存使用过高 | 未正确清理 | 调用 `dispose()` |

---

## 9. 版本兼容性

| SDK 版本 | ACP 协议版本 | VS Code 版本 |
|----------|--------------|--------------|
| 1.0.x | 20250101 | 1.85+ |
| 后续版本 | 后续版本 | 后续版本 |

---

## 10. 相关资源

- [ACP 官方文档](https://agentclientprotocol.com)
- [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk)
- [VS Code Language Model API](https://code.visualstudio.com/api/language-extensions/language-model-extension)
- [项目仓库](https://github.com/sanchuanhehe/all-in-copilot)
