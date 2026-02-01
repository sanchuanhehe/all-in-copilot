# All-In Copilot SDK 架构

## 模块结构

```
packages/sdk/src/
├── index.ts              # SDK 主入口，导出所有公共 API
├── core/                 # 核心类型和模型获取
│   ├── types.ts          # ProviderConfig, ModelConfig
│   └── modelFetcher.ts   # fetchModelsFromAPI
├── utils/                # 工具函数
│   ├── format.ts         # 消息格式转换 (OpenAI/Anthropic)
│   ├── tokenCounter.ts   # Token 估算
│   └── toolConverter.ts  # 工具定义转换
├── platform/             # 底层平台服务
│   ├── terminal/         # 终端服务 (ITerminalService)
│   └── permission/       # 权限服务 (ITerminalPermissionService)
├── acp/                  # ACP 协议实现
│   ├── clientManager.ts  # ACP 客户端管理
│   ├── acpProvider.ts    # LanguageModelChatProvider 实现
│   ├── acpChatParticipant.ts  # ChatParticipant 实现
│   ├── terminal/         # ★ ACP 终端适配器 (新)
│   └── terminalProvider.ts    # (已废弃)
└── vscode/               # VS Code 类型定义
```

## 层次架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户代码 (Extension)                         │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                        SDK Public API                                │
│  index.ts 导出                                                       │
│  - ACPClientManager, ACPProvider, ACPChatParticipant                │
│  - createTerminalCallbacks, TerminalServiceImpl                      │
│  - createTerminalPermissionService                                   │
│  - convertToOpenAI, convertToAnthropic, sendChatRequest             │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│      acp/       │  │    platform/    │  │     utils/      │
│   ACP 协议层    │  │   底层服务层    │  │   工具函数层    │
└────────┬────────┘  └────────┬────────┘  └─────────────────┘
         │                    │
         │                    │
         ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    VS Code Extension API                             │
│  vscode.lm, vscode.chat, vscode.window.createTerminal, etc.         │
└─────────────────────────────────────────────────────────────────────┘
```

## ACP Terminal Adapter 完整性检查

### 已实现的 ACP 协议方法

| ACP 方法 | 实现位置 | 状态 |
|---------|----------|------|
| `terminal/create` | `ACPTerminalAdapter.createTerminal()` | ✅ |
| `terminal/output` | `ACPTerminalAdapter.getOutput()` | ✅ |
| `terminal/wait_for_exit` | `ACPTerminalAdapter.waitForExit()` | ✅ |
| `terminal/kill` | `ACPTerminalAdapter.killCommand()` | ✅ |
| `terminal/release` | `ACPTerminalAdapter.release()` | ✅ |

### 已实现的功能

| 功能 | 位置 | 说明 |
|------|------|------|
| 输出字节限制 | `terminalBufferManager.ts` | 默认 64KB |
| 截断标记 | `types.ts` / `ACPTerminalOutputResponse.truncated` | ✅ |
| 等待完成 | `terminalBufferManager.ts` | 超时 + 空闲检测 |
| 会话隔离 | `ACPTerminalAdapter.sessionTerminals` | ✅ |
| 退出状态 | `types.ts` / `ExitStatus` | exitCode, signal |
| Shell Integration | `terminalBufferManager.ts` | 可选使用 proposed API |

### 与 ACPClientManager 的集成

```typescript
// callbackIntegration.ts 提供便捷函数
const { callbacks, adapter } = createTerminalCallbacks(terminalService);

// callbacks 结构：
{
  createTerminal: (sessionId, command, args?, cwd?, env?) => Promise<IVsCodeTerminal>,
  getTerminalOutput: (terminalId) => Promise<{ output, exitCode? }>,
  releaseTerminal: (terminalId) => Promise<void>,
  waitForTerminalExit: (terminalId) => Promise<{ exitCode? }>,
  killTerminal: (terminalId) => Promise<void>,
}
```

## 依赖关系

```
acp/terminal/acpTerminalAdapter.ts
    │
    ├── platform/terminal/common/terminalService.ts  (ITerminalService 接口)
    │
    └── acp/terminal/terminalBufferManager.ts        (缓冲管理)

acp/terminal/callbackIntegration.ts
    │
    ├── acp/terminal/acpTerminalAdapter.ts           (适配器)
    │
    └── platform/terminal/common/terminalService.ts  (ITerminalService 接口)

platform/terminal/vscode/terminalServiceImpl.ts
    │
    └── platform/terminal/vscode/terminalBufferListener.ts  (基础缓冲)
```

## 缓冲管理器对比

| 特性 | `terminalBufferListener.ts` | `terminalBufferManager.ts` |
|------|----------------------------|---------------------------|
| 位置 | platform/ | acp/terminal/ |
| 职责 | 基础 VS Code 缓冲 | ACP 协议增强 |
| 结构 | `Map<Terminal, string[]>` | `Map<string, TerminalBuffer>` |
| 字节限制 | ❌ (40 条限制) | ✅ (可配置) |
| 截断标记 | ❌ | ✅ |
| 完成检测 | ❌ | ✅ (waiters) |
| 按 ID 查找 | ❌ | ✅ |

**设计决策**：两者保持分离
- `terminalBufferListener.ts` - 服务于 `TerminalServiceImpl` 的基础需求
- `terminalBufferManager.ts` - 服务于 ACP 协议的增强需求

## 导出清单

### 从 index.ts 导出

```typescript
// ACP Terminal Adapter (新)
export {
  ACPTerminalAdapter,
  createACPTerminalAdapter,
  createTerminalCallbacks,
  disposeTerminalAdapter,
  type IACPTerminalAdapter,
  type ACPTerminalCallbacks,
} from "./acp";

// Platform Services
export {
  ITerminalService,
  TerminalServiceImpl,
  createTerminalPermissionService,
  type ITerminalPermissionService,
  type TerminalConfirmationDetails,
} from "./platform";
```

## 废弃 API

| API | 替代方案 | 移除计划 |
|-----|---------|---------|
| `ACPTerminalProvider` | `createTerminalCallbacks()` | v2.0 |
| `executeInTerminal()` | `createTerminalCallbacks().createTerminal()` | v2.0 |
| `executeInNewTerminal()` | `createTerminalCallbacks().createTerminal()` | v2.0 |
