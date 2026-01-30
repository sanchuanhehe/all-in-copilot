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

- `terminal/create`: Agent 请求创建终端
- `terminal/output`: Agent 请求获取终端输出
- `terminal/kill`: Agent 请求终止终端
- `terminal/release`: Agent 请求释放终端资源

**VS Code API 映射**：

```typescript
// VS Code Terminal API
const terminal = vscode.window.createTerminal("Agent Terminal");
terminal.show();
terminal.sendText("npm test");
```

**SDK 实现方式**：

- 终端方法由 **Agent 调用**，不是客户端调用
- SDK 在 `createClientImplementation` 中实现了这些方法的处理程序
- 实际终端管理由用户/Agent 控制，SDK 仅负责转发消息
- 文件操作（`readTextFile`, `writeTextFile`）也是类似的处理方式

### 2.6 MCP 支持

**ACP 功能**：

- 通过 `newSession` 的 `mcpServers` 参数传递 MCP 服务器配置
- Agent 负责启动和管理 MCP 服务器连接

**VS Code API 映射**：

```typescript
// VS Code MCP API (VS Code 自身管理 MCP)
vscode.lm.registerMcpServerDefinitionProvider(id, provider);
```

**SDK 实现方式**：

- SDK 在 `newSession` 时自动传递 MCP 服务器配置
- Agent 负责实际的 MCP 服务器连接和管理
- 工具调用通过标准的 `session/update` 流程处理

---

## A. 架构设计：融入 VS Code Copilot 面板

> 本章节描述 SDK 的目标架构设计，规划如何让 ACP Agent 无缝融入 VS Code Copilot 面板。

### A.1 设计目标

**核心原则**：复用 VS Code 现有 UI，通过模型切换来切换后端 Agent。

```
┌─────────────────────────────────────────────────────────────────┐
│                    VS Code Copilot 面板                          │
├─────────────────────────────────────────────────────────────────┤
│  模型选择器                                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Anthropic Claude (default)  ▼                           │   │
│  │ OpenAI GPT-4o              ▲                           │   │
│  │ ✨ My ACP Agent             ▲  ← 用户选择此模型          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  聊天内容 (复用现有 UI)                                          │
│  ─────────────────────────────────────────────────────────────  │
│  > Hello, help me write a function                             │
│                                                                 │
│  [Agent 响应]                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### A.2 当前架构状态

| 组件 | 状态 | 说明 |
|------|------|------|
| `ACPProvider` (LanguageModelChatProvider) | ✅ 已完成 | 注册为语言模型提供商 |
| `streamResponse` 流式输出 | ⚠️ 待完善 | 需要正确处理流式文本 |
| 工具调用 (Tool Calls) | ❌ 未实现 | 需要集成 `LanguageModelChatResponse.toolCalls` |
| 工具结果 (Tool Results) | ❌ 未实现 | 需要处理 `LanguageModelChatResponse2` |
| ClientCallbacks | ✅ 已完成 | 终端、文件系统、权限回调 |

### A.3 目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    VS Code Language Model API                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ACPProvider                                              │   │
│  │ implements LanguageModelChatProvider                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                     │
│         │ provideLanguageModelChatResponse()                  │
│         ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ streamResponse() - 核心方法                              │   │
│  │                                                         │   │
│  │ 1. 发送 prompt 到 Agent                                  │   │
│  │ 2. 接收 session/update 流                                │   │
│  │ 3. 转换为 LanguageModelChatResponse                      │   │
│  │    - text → LanguageModelTextPart                        │   │
│  │    - tool_call → LanguageModelToolCallPart               │   │
│  │    - tool_result → LanguageModelToolResultPart           │   │
│  │ 4. 权限请求 → response.confirm()                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                     │
│         ▼                                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ACPClientManager                                         │   │
│  │ - ClientSideConnection (Agent Interface)                 │   │
│  │ - ClientCallbacks (Client Interface)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### A.4 核心方法：`streamResponse` 实现要求

#### A.4.1 方法签名

```typescript
private async streamResponse(
    session: ACPSession,
    prompt: ContentBlock[],
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
): Promise<void>
```

#### A.4.2 处理流程

```
用户消息 → ACPProvider.provideLanguageModelChatResponse()
                                      │
                                      ▼
                          streamResponse() 开始
                                      │
                                      ▼
                      client.prompt() → Agent 处理
                                      │
                                      ▼
                      接收 session/update 流
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
         ▼                            ▼                            ▼
    text 增量                 tool_call 请求               tool_result 完成
         │                            │                            │
         ▼                            ▼                            ▼
  LanguageModelTextPart    LanguageModelToolCallPart    LanguageModelToolResultPart
         │                            │                            │
         └────────────────────────────┴────────────────────────────┘
                                      │
                                      ▼
                         progress.report(part)
                                      │
                                      ▼
                         处理完成或 CancellationToken
```

#### A.4.3 输出类型映射

| ACP 类型 | VS Code API | 处理方式 |
|----------|-------------|----------|
| `text` | `LanguageModelTextPart` | 直接 report |
| `tool_call` | `LanguageModelToolCallPart` | report + 等待结果 |
| `tool_result` | `LanguageModelToolResultPart` | report 完成结果 |
| `error` | `LanguageModelTextPart` | report 错误信息 |

> **注意**：`request_permission` 不是 `session/update` 通知类型，而是通过单独的 `session/request_permission` JSON-RPC 请求处理的。SDK 在 `ClientCallbacks.requestPermission` 中处理此权限请求，通过 `response.confirm()` API 等待用户确认。

### A.5 实现任务清单

#### P0 - 核心流式输出 (必须)

- [ ] 实现 `streamResponse()` 正确发送 prompt
- [ ] 接收 `session/update` 流式事件
- [ ] 将 `text` 增量转换为 `LanguageModelTextPart`
- [ ] 支持 `CancellationToken` 取消

#### P1 - 工具调用 (重要)

- [ ] 处理 `tool_call` 事件
- [ ] 报告 `LanguageModelToolCallPart`
- [ ] 等待工具执行结果
- [ ] 报告 `LanguageModelToolResultPart`

#### P2 - 权限确认 (增强)

- [ ] 处理 `request_permission` 事件
- [ ] 使用 `response.confirm()` 显示权限对话框
- [ ] 将用户选择返回给 Agent

#### P3 - 增强功能 (可选)

- [ ] 支持 `truncated` 截断输出
- [ ] 实现更精确的 token 计数
- [ ] 添加详细的错误处理

### A.6 关键类型定义

#### A.6.1 VS Code Language Model Response 类型

```typescript
// 来自 vscode.d.ts
interface LanguageModelChatResponse {
    readonly stream: AsyncIterable<LanguageModelChatResponse2>;
}

interface LanguageModelChatResponse2 {
    // 文本片段
    readonly text?: string;
    // 工具调用
    readonly toolCalls?: Array<{
        name: string;
        input: unknown;
    }>;
    // 工具结果
    readonly toolResults?: Array<{
        callId: string;
        name: string;
        result: unknown;
    }>;
}

// 通过 progress.report() 发送的类型
type LanguageModelResponsePart =
    | LanguageModelTextPart
    | LanguageModelToolCallPart
    | LanguageModelToolResultPart
    | LanguageModelRichTextPart;
```

#### A.6.2 ACP Update 类型

```typescript
type Update =
    | { type: "text"; content: string }
    | { type: "tool_call"; id: string; name: string; input: unknown }
    | { type: "tool_result"; callId: string; result: unknown }
    | { type: "request_permission"; ... }
    | { type: "error"; message: string }
    | { type: "done"; reason: string };
```

### A.7 进度追踪

| 任务 | 状态 | 完成日期 | 备注 |
|------|------|----------|------|
| streamResponse 事件系统 | ✅ 已完成 | 2025-01-22 | ACPClientManager.onSessionUpdate() |
| sessionUpdate 监听器注册/注销 | ✅ 已完成 | 2025-01-22 | 返回 unsubscribe 函数 |
| 文本流式输出 (agent_message_chunk) | ✅ 已完成 | 2025-01-22 | 通过 progress.report() |
| 思考块输出 (agent_thought_chunk) | ✅ 已完成 | 2025-01-22 | 显示 "[Reasoning]" |
| 工具调用支持 (tool_call, tool_call_update) | ✅ 已完成 | 2025-01-22 | LanguageModelToolCallPart |
| 用户消息回显 (user_message_chunk) | ✅ 已完成 | 2025-01-22 | 实时显示用户输入 |
| available_commands_update 处理 | ✅ 已完成 | 2025-01-23 | 显示可用命令列表 |
| current_mode_update 处理 | ✅ 已完成 | 2025-01-23 | 显示模式变化 |
| PromptResponse stopReason 处理 | ✅ 已完成 | 2025-01-22 | formatStopReason() |
| streamResponse 单元测试 | ✅ 已完成 | 2025-01-23 | 117 tests passing |

### A.7.1 待办事项

所有任务已完成！ ✅

**注意**：`request_permission` 是通过 `session/request_permission` 单独请求处理的，不是 `session/update` 通知类型。SDK 在 `ClientCallbacks.requestPermission` 中处理权限请求。

- [x] 实现 `available_commands_update` 处理
- [x] 实现 `current_mode_update` 处理
- [x] 添加单元测试覆盖 streamResponse (117 tests passing)

### A.8 常见问题

**Q: 是否需要创建 ChatParticipant？**

A: 不需要。`LanguageModelChatProvider` 已经足够。用户选择模型后，VS Code 会自动使用对应的 provider 进行聊天。

**Q: 工具调用是如何工作的？**

A: 当 Agent 需要调用工具时：
1. Agent 发送 `session/update` (tool_call)
2. SDK 转换为 `LanguageModelToolCallPart` 通过 progress.report()
3. VS Code 显示工具调用 UI
4. 工具执行完成后，结果通过 `tool_result` 发送回 Agent

**Q: ClientCallbacks 和 LanguageModelChatProvider 是什么关系？**

A:
- `ClientCallbacks`: 处理 Agent 主动发起的操作（终端、文件系统）
- `LanguageModelChatProvider`: 处理用户发起的聊天请求
- 两者独立工作，通过 `ACPClientManager` 共享连接

---

## A.9 streamResponse 实现细节

> 本节详细描述 `streamResponse()` 方法的实现步骤和代码结构。

### A.9.1 当前实现状态

```typescript
// 当前 acpProvider.ts 中的实现 (简化)
private async streamResponse(
    session: ACPSession,
    prompt: ContentBlock[],
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
): Promise<void> {
    // 问题：直接调用 prompt() 获取结果，没有处理流式更新
    const result = await session.connection.prompt({
        sessionId: session.sessionId,
        prompt,
    });
    // 问题：只输出简单消息，没有正确处理各种事件类型
    progress.report(new vscode.LanguageModelTextPart(`[Response: ${result.stopReason}]`));
}
```

### A.9.2 目标实现

```typescript
private async streamResponse(
    session: ACPSession,
    prompt: ContentBlock[],
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
): Promise<void> {
    // 1. 创建工具调用映射
    const pendingToolCalls = new Map<string, { name: string; input: unknown }>();

    // 2. 发送 prompt，获取异步结果
    const promptResult = await session.connection.prompt({
        sessionId: session.sessionId,
        prompt,
    });

    // 3. 注意：当前 SDK 的 prompt() 返回最终结果
    // 需要使用 streamPrompt() 或监听 session/update 事件来获取增量更新

    // 4. 处理流式更新（需要 SDK 支持 sessionUpdate 回调）
    // 这是当前实现缺失的关键部分

    // 5. 对于工具调用，需要：
    // - 报告 toolCallPart
    // - 等待工具执行结果
    // - 报告 toolResultPart

    // 6. 将结果转换为 LanguageModelChatResponse2
    const response2: vscode.LanguageModelChatResponse2 = {
        // ... 根据结果填充
    };

    // 7. 通过 stream 返回
    return {
        stream: (async function*() {
            yield response2;
        })()
    };
}
```

### A.9.3 SDK 架构分析

**重要发现**：SDK v0.13.1 的 `ClientSideConnection` 没有 `streamPrompt()` 方法！

```typescript
// 当前 SDK 的 ClientSideConnection 接口
interface ClientSideConnection {
    initialize(params): Promise<InitializeResponse>;
    newSession(params): Promise<NewSessionResponse>;
    prompt(params): Promise<PromptResponse>;  // 阻塞，返回最终结果
    cancel(params): Promise<void>;
    // 注意：没有 streamPrompt() 方法！
}
```

**正确的实现方式**：
1. `ClientSideConnection` 通过 `toClient` 函数接收一个 `Client` 接口实现
2. `Client` 接口包含 `sessionUpdate()` 方法，用于接收 Agent 的流式更新通知
3. 我们需要：
   - 实现一个 `Client` 对象，包含 `sessionUpdate` 方法
   - 将流式更新转发给 `ACPProvider`
   - 在 `streamResponse()` 中监听这些更新并报告给 `progress`

### A.9.4 实现步骤

**Step 1: 理解通知机制**

```typescript
// SDK 架构
new ClientSideConnection(
    toClient: (agent: Agent) => Client,  // 提供 Client 实现
    stream: Stream                       // 通信流
);

// Client 接口（SDK 定义）
interface Client {
    sessionUpdate(params: SessionNotification): Promise<void>;  // ← 接收通知
    requestPermission(params): Promise<RequestPermissionResponse>;
    // ...
}
```

**Step 2: 实现事件转发系统**

```typescript
// ACPClientManager 需要：
// 1. 维护一个 update 监听器映射
// 2. 在 Client.sessionUpdate() 中调用对应的监听器
// 3. 提供 registerUpdateListener() 方法供 ACPProvider 使用
```

**Step 3: 在 streamResponse() 中使用**

```typescript
private async streamResponse(
    session: ACPSession,
    prompt: ContentBlock[],
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
): Promise<void> {
    // 1. 注册更新监听器
    const updateHandler = (update: SessionNotification) => {
        // 将 update 转换为 LanguageModelResponsePart
        // 通过 progress.report() 发送
    };
    this.clientManager.onSessionUpdate(session.sessionId, updateHandler);

    // 2. 发送 prompt（阻塞，等待整个 turn 完成）
    const result = await session.connection.prompt({
        sessionId: session.sessionId,
        prompt,
    });

    // 3. 注销监听器
    this.clientManager.offSessionUpdate(session.sessionId, updateHandler);
}
```

### A.9.5 完整事件流

```
用户发送消息
        │
        ▼
ACPProvider.provideLanguageModelChatResponse()
        │
        ▼
streamResponse() 注册监听器
        │
        ▼
connection.prompt() ────────→ Agent 处理
        │                            │
        │                            ▼
        │                     Agent 发送 session/update 通知
        │                            │
        │                            ▼
        │                     Client.sessionUpdate() 接收
        │                            │
        │                            ▼
        │                     调用监听器
        │                            │
        ▼                            ▼
监听器处理更新 ◀────────────────────┘
        │
        ▼
progress.report(LanguageModelResponsePart)
        │
        ▼
VS Code UI 显示增量更新
```

**Step 2: 实现文本流式输出**

```typescript
if (update.type === "text" || update.type === "text_delta") {
    const textPart = new vscode.LanguageModelTextPart(update.content);
    progress.report(textPart);
}
```

**Step 3: 实现工具调用处理**

```typescript
if (update.type === "tool_call") {
    // 报告工具调用
    const toolCallPart = new vscode.LanguageModelToolCallPart(
        update.id,
        update.name,
        update.input
    );
    progress.report(toolCallPart);

    // 等待工具执行结果
    // 注意：工具执行由 ClientCallbacks 处理
    // 结果会通过另一个 update 事件返回
}

if (update.type === "tool_result") {
    // 报告工具结果
    const toolResultPart = new vscode.LanguageModelToolResultPart([
        {
            callId: update.callId,
            name: update.toolName,
            result: update.result
        }
    ]);
    progress.report(toolResultPart);
}
```

**Step 4: 权限请求**

> **重要**：权限请求不是通过 `session/update` 通知处理的，而是通过单独的 `session/request_permission` JSON-RPC 请求处理。SDK 在 `ClientCallbacks.requestPermission` 实现中处理此逻辑。

### A.9.5 完整实现示例（已更新）

以下是基于 SDK 实际实现的代码示例：

```typescript
private async streamResponse(
    session: ACPSession,
    prompt: ContentBlock[],
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
): Promise<void> {
    // 跟踪已流式传输的文本块，避免重复
    const textBuffer: string[] = [];

    // 注册 sessionUpdate 监听器（在调用 prompt 之前）
    const unsubscribe = this.clientManager.onSessionUpdate(
        session.sessionId,
        (update: SessionNotification) => {
            const updateData = update.update;

            switch (updateData.sessionUpdate) {
                case "agent_message_chunk": {
                    // 流式文本输出
                    const content = updateData.content;
                    if (content && "text" in content) {
                        const text = String(content.text);
                        textBuffer.push(text);
                        progress.report(new vscode.LanguageModelTextPart(text));
                    }
                    break;
                }

                case "agent_thought_chunk": {
                    // 思考块输出
                    progress.report(new vscode.LanguageModelTextPart("[Reasoning]"));
                    break;
                }

                case "tool_call": {
                    // 工具调用通知
                    const toolCallId = (updateData as any).toolCallId ?? String(Date.now());
                    const title = (updateData as any).title ?? "Unknown Tool";
                    const toolName = title.split(" ")[0] || "tool";
                    progress.report(new vscode.LanguageModelToolCallPart(toolCallId, toolName, {}));
                    break;
                }

                case "tool_call_update": {
                    // 工具调用状态更新
                    const status = (updateData as any).status;
                    if (status === "completed" || status === "success") {
                        const content = (updateData as any).content;
                        if (content && Array.isArray(content)) {
                            for (const item of content) {
                                if (item && "text" in item) {
                                    progress.report(new vscode.LanguageModelTextPart(String(item.text)));
                                }
                            }
                        }
                    }
                    break;
                }

                case "user_message_chunk": {
                    // 用户消息回显
                    const content = updateData.content;
                    if (content && "text" in content) {
                        progress.report(new vscode.LanguageModelTextPart(String(content.text)));
                    }
                    break;
                }

                case "plan": {
                    // 执行计划通知
                    progress.report(new vscode.LanguageModelTextPart("[Plan available]\n"));
                    break;
                }

                default:
                    // 未知更新类型，忽略
                    break;
            }
        }
    );

    try {
        // 调用 prompt（阻塞，等待整个 turn 完成）
        // 流式更新通过 sessionUpdate 监听器实时传递
        const result = await session.connection.prompt({
            sessionId: session.sessionId,
            prompt,
        });

        if (token.isCancellationRequested) {
            return;
        }

        // 报告完成原因
        const stopReasonText = this.formatStopReason(result.stopReason);
        if (stopReasonText) {
            progress.report(new vscode.LanguageModelTextPart(`\n${stopReasonText}`));
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        progress.report(new vscode.LanguageModelTextPart(`\nError: ${errorMessage}`));
        throw error;
    } finally {
        // 清理监听器
        unsubscribe();
    }
}

private formatStopReason(reason: string): string {
    switch (reason) {
        case "end_turn":
            return "";
        case "max_tokens":
            return "[Response truncated - max tokens reached]";
        case "max_turn_requests":
            return "[Response truncated - max turn requests exceeded]";
        case "refusal":
            return "[Response refused]";
        case "cancelled":
            return "[Response cancelled]";
        default:
            return "";
    }
}
```

### A.9.6 事件流时序图

```
用户发送消息
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ ACPProvider.provideLanguageModelChatResponse()                │
│   1. 获取/创建连接                                              │
│   2. 获取/创建会话                                              │
│   3. 调用 streamResponse()                                     │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────┐
│ streamResponse()                                              │
│   1. 调用 clientManager.onSessionUpdate() 注册监听器          │
│   2. 调用 connection.prompt() 发送消息                         │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────────┐
│ Agent 处理    │   │ Agent 发送    │   │ Client 接收       │
│ 用户消息      │   │ session/update│   │ sessionUpdate()   │
└───────────────┘   └───────┬───────┘   └─────────┬─────────┘
                            │                     │
                            │                     ▼
                            │           ┌───────────────────┐
                            │           │ 遍历 listeners    │
                            │           │ 调用每个监听器    │
                            │           └─────────┬─────────┘
                            │                     │
                            └─────────────────────┤
                                                  │
                                                  ▼
                                ┌───────────────────────────────┐
                                │ updateHandler()               │
                                │ - 解析 update 类型            │
                                │ - 转换为 LanguageModelResponsePart │
                                │ - progress.report()           │
                                └───────────────────────────────┘
                                                  │
                                                  ▼
                                ┌───────────────────────────────┐
                                │ VS Code UI 显示增量更新       │
                                └───────────────────────────────┘

        ┌───────────────────────────────────────────────────────┐
        │ connection.prompt() 返回 (turn 结束)                 │
        │   - result.stopReason                                │
        │   - 无 content (内容已通过 sessionUpdate 传输)       │
        └────────────────────────────┬──────────────────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │ 报告 stopReason               │
                     │ 注销监听器 (unsubscribe)      │
                     └───────────────────────────────┘
```

### A.9.7 关键实现点

1. **事件监听模式**：SDK 不提供 `streamPrompt()` 方法，而是通过 `Client.sessionUpdate()` 回调接收流式更新

2. **ACPClientManager 事件系统**：
   - `sessionUpdateListeners: Map<string, Set<Listener>>` - 按 sessionId 存储监听器
   - `onSessionUpdate(sessionId, listener)` - 注册监听器，返回注销函数
   - 在 `Client.sessionUpdate()` 中调用所有注册的监听器

3. **PromptResponse 不包含 content**：ACP 协议中 `PromptResponse` 只有 `stopReason`，所有内容通过 `sessionUpdate` 传输

4. **类型转换**：需要将 ACP 的 `SessionNotification.update` 转换为 VS Code 的 `LanguageModelResponsePart`

### A.9.8 注意事项

- **监听器注册时机**：必须在调用 `prompt()` 之前注册监听器，否则会丢失初始更新
- **监听器注销**：使用 `finally` 块确保监听器被正确注销，避免内存泄漏
- **取消处理**：检查 `CancellationToken`，如果已取消则不再处理更新
- **重复内容检测**：使用 `textBuffer` 避免重复输出已流式传输的内容

```
                    progress.report(new vscode.LanguageModelToolResultPart([{
                        callId: update.callId,
                        name: update.toolName,
                        result: update.result
                    }]));
                    break;

                case "error":
                    const errorPart = new vscode.LanguageModelTextPart(
                        `Error: ${update.message}`
                    );
                    progress.report(errorPart);
                    break;

                case "done":
                    // 处理完成，可以记录 stopReason
                    console.log(`Agent finished with: ${update.reason}`);
                    return;

                default:
                    // 忽略未知类型
                    break;
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        progress.report(new vscode.LanguageModelTextPart(`Error: ${errorMessage}`));
        throw error;
    }
}
```

### A.9.6 测试验证

实现完成后，需要验证以下场景：

| 测试场景 | 预期行为 |
|----------|----------|
| 简单文本回复 | 文本逐字显示，无延迟 |
| 工具调用 | 显示工具调用卡片，用户可以看到工具名称和参数 |
| 工具结果 | 显示工具执行结果 |
| 权限请求 | 显示确认对话框 |
| 取消操作 | Agent 停止处理，不再产生输出 |
| 长响应 | 文本正确分块显示，无丢失 |

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
    callbacks?: ClientCallbacks; // VS Code API 回调（可选）
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

/**
 * VS Code API 回调接口
 * 用于将 ACP 协议事件映射到 VS Code API
 */
interface ClientCallbacks {
    /**
     * 创建终端
     * 当 Agent 调用 terminal/create 时触发
     */
    createTerminal?: (
        sessionId: string,
        command: string,
        args?: string[],
        cwd?: string
    ) => Promise<IVsCodeTerminal>;

    /**
     * 获取终端输出
     * 当 Agent 调用 terminal/output 时触发
     */
    getTerminalOutput?: (terminalId: string) => Promise<{
        output: string;
        exitCode?: number;
    }>;

    /**
     * 释放终端
     * 当 Agent 调用 terminal/release 时触发
     */
    releaseTerminal?: (terminalId: string) => Promise<void>;

    /**
     * 等待终端退出
     * 当 Agent 调用 terminal/wait_for_exit 时触发
     */
    waitForTerminalExit?: (terminalId: string) => Promise<{
        exitCode?: number;
    }>;

    /**
     * 终止终端命令
     * 当 Agent 调用 terminal/kill 时触发
     */
    killTerminal?: (terminalId: string) => Promise<void>;

    /**
     * 读取文件
     * 当 Agent 调用 fs/read_text_file 时触发
     */
    readTextFile?: (path: string) => Promise<string>;

    /**
     * 写入文件
     * 当 Agent 调用 fs/write_text_file 时触发
     */
    writeTextFile?: (path: string, content: string) => Promise<void>;

    /**
     * 请求权限
     * 当 Agent 调用 session/request_permission 时触发
     */
    requestPermission?: (request: {
        toolCall: { title: string; description?: string };
        options: Array<{ optionId: string; label: string }>;
    }) => Promise<string>;
}

/**
 * VS Code 终端接口
 */
interface IVsCodeTerminal {
    readonly terminalId: string;
    readonly name: string;
    sendText(text: string, shouldExecute?: boolean): void;
    show(preserveFocus?: boolean): void;
    hide(): void;
    dispose(): void;
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
    ClientCallbacks,
    IVsCodeTerminal,
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
    CreateTerminalRequest,
    CreateTerminalResponse,
    TerminalOutputRequest,
    TerminalOutputResponse,
    ReleaseTerminalRequest,
    ReleaseTerminalResponse,
    WaitForTerminalExitRequest,
    WaitForTerminalExitResponse,
    KillTerminalCommandRequest,
    KillTerminalCommandResponse,
};
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
import { ACPClientManager, ClientCallbacks } from "@all-in-copilot/sdk";

// 定义 VS Code API 回调
const callbacks: ClientCallbacks = {
    // 创建终端时调用
    createTerminal: async (sessionId, command, args, cwd) => {
        const terminal = vscode.window.createTerminal(
            `Agent - ${sessionId.slice(0, 8)}`
        );
        terminal.show();
        // 发送命令到终端
        if (command) {
            terminal.sendText([command, ...(args ?? [])].join(" "));
        }
        return {
            terminalId: terminal.name,
            name: terminal.name,
            sendText: (text, shouldExecute) => terminal.sendText(text, shouldExecute),
            show: (preserveFocus) => terminal.show(preserveFocus),
            hide: () => terminal.hide(),
            dispose: () => terminal.dispose(),
        };
    },

    // 获取终端输出时调用
    getTerminalOutput: async (terminalId) => {
        const terminal = vscode.window.terminals.find(t => t.name === terminalId);
        if (terminal && terminal.shellIntegration) {
            // 使用 shell integration 获取输出
            const output = await getTerminalBuffer(terminal);
            return { output };
        }
        return { output: "" };
    },

    // 读取文件时调用
    readTextFile: async (path) => {
        const uri = vscode.Uri.file(path);
        const bytes = await vscode.workspace.fs.readFile(uri);
        return new TextDecoder().decode(bytes);
    },

    // 写入文件时调用
    writeTextFile: async (path, content) => {
        const uri = vscode.Uri.file(path);
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
    },

    // 请求权限时调用
    requestPermission: async ({ toolCall, options }) => {
        const selected = await vscode.window.showQuickPick(
            options.map(opt => ({ label: opt.label, id: opt.optionId })),
            { title: toolCall.title, placeHolder: "Select permission" }
        );
        return selected?.id ?? "reject";
    },
};

// 使用回调配置客户端
const connection = await manager.getClient({
    transport: "stdio",
    agentPath: "/path/to/agent",
    agentArgs: ["--verbose"],
    callbacks,  // 传入回调
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

### 4.3 终端管理示例

当 Agent 需要执行终端命令时（如运行测试、构建项目等），SDK 会调用终端相关的回调：

```typescript
const callbacks: ClientCallbacks = {
    createTerminal: async (sessionId, command, args, cwd) => {
        const terminal = vscode.window.createTerminal(
            `Agent - ${sessionId.slice(0, 8)}`
        );
        terminal.show();

        // 执行命令
        const fullCommand = [command, ...(args ?? [])].join(" ");
        terminal.sendText(`cd ${cwd ?? "~"} && ${fullCommand}`);

        return {
            terminalId: terminal.name,
            name: terminal.name,
            sendText: (text) => terminal.sendText(text),
            show: (preserveFocus) => terminal.show(preserveFocus),
            hide: () => terminal.hide(),
            dispose: () => terminal.dispose(),
        };
    },

    getTerminalOutput: async (terminalId) => {
        const terminal = vscode.window.terminals.find(t => t.name === terminalId);
        if (!terminal) {
            return { output: "Terminal not found" };
        }
        // 获取终端缓冲区内容
        const output = getTerminalBuffer(terminal);
        return { output };
    },

    releaseTerminal: async (terminalId) => {
        const terminal = vscode.window.terminals.find(t => t.name === terminalId);
        terminal?.dispose();
    },
};
```

### 4.4 文件系统操作示例

当 Agent 需要读写文件时，SDK 会调用文件系统回调：

```typescript
const callbacks: ClientCallbacks = {
    readTextFile: async (path) => {
        try {
            const uri = vscode.Uri.file(path);
            const bytes = await vscode.workspace.fs.readFile(uri);
            return new TextDecoder().decode(bytes);
        } catch (error) {
            console.error(`Failed to read ${path}:`, error);
            return "";  // 返回空内容表示文件不存在
        }
    },

    writeTextFile: async (path, content) => {
        const uri = vscode.Uri.file(path);
        // 确保目录存在
        const dir = vscode.Uri.file(path.substring(0, path.lastIndexOf("/")));
        try {
            await vscode.workspace.fs.stat(dir);
        } catch {
            await vscode.workspace.fs.createDirectory(dir);
        }
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
    },
};
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
| 终端创建 | `terminal/create` | ✅ 已完成 | Agent 调用，客户端实现处理 |
| 终端输出 | `terminal/output` | ✅ 已完成 | Agent 调用，客户端实现处理 |
| 终端终止 | `terminal/kill` | ✅ 已完成 | Agent 调用，客户端实现处理 |
| MCP 服务器 | `mcp/*` | ✅ 已完成 | 通过 `newSession` 的 mcpServers 参数 |

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
