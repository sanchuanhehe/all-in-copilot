# Platform Module

底层平台服务封装，提供 VS Code API 的抽象层。

## 模块结构

```
platform/
├── index.ts                    # 模块导出
├── terminal/                   # 终端服务
│   ├── common/
│   │   └── terminalService.ts  # ITerminalService 接口定义
│   └── vscode/
│       ├── terminalServiceImpl.ts    # VS Code 实现
│       └── terminalBufferListener.ts # 基础缓冲监听器
└── permission/                 # 权限服务
    ├── common/
    │   ├── terminalPermission.ts     # 类型定义
    │   └── terminalPermissionService.ts # 空实现
    └── vscode/
        └── terminalPermissionService.ts # VS Code 实现
```

## 与 ACP Terminal 的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                    ACP Protocol Layer                            │
│                   (acp/terminal/)                                │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ACPTerminalAdapter                                       │  │
│  │  - ACP 协议兼容的终端操作                                  │  │
│  │  - 字节限制、截断标记、等待完成                             │  │
│  │  - 会话隔离                                               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │ 依赖                              │
│                              ▼                                   │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                   Platform Layer                                 │
│                 (platform/terminal/)                             │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ITerminalService                                         │  │
│  │  - 底层 VS Code Terminal API 封装                         │  │
│  │  - 创建终端、获取缓冲、管理会话                            │  │
│  │  - Shell Integration 事件监听                             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │ 使用                              │
│                              ▼                                   │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│                   VS Code Terminal API                           │
│  window.createTerminal()  Terminal.sendText()                   │
│  onDidWriteTerminalData  onDidEndTerminalShellExecution         │
└─────────────────────────────────────────────────────────────────┘
```

## 使用指南

### 底层终端操作（使用 Platform）

```typescript
import { TerminalServiceImpl, ITerminalService } from "@all-in-copilot/sdk";

const terminalService: ITerminalService = new TerminalServiceImpl(context);

// 创建终端
const terminal = terminalService.createTerminal({
    name: "My Terminal",
    isTransient: true,
});

// 获取缓冲
const buffer = terminalService.getBufferForTerminal(terminal, 16000);
```

### ACP 协议终端操作（使用 ACP Terminal Adapter）

```typescript
import { createTerminalCallbacks, TerminalServiceImpl } from "@all-in-copilot/sdk";

const terminalService = new TerminalServiceImpl(context);
const { callbacks, adapter } = createTerminalCallbacks(terminalService);

// 创建终端并执行命令（ACP 协议）
const terminal = await callbacks.createTerminal(sessionId, "npm install");

// 获取输出（带字节限制和截断标记）
const output = await callbacks.getTerminalOutput(terminal.terminalId);
console.log(output.output, output.truncated);

// 等待完成
const exit = await callbacks.waitForTerminalExit(terminal.terminalId);
console.log(exit.exitCode);
```

## 权限服务

```typescript
import { createTerminalPermissionService } from "@all-in-copilot/sdk";

const permissionService = createTerminalPermissionService({
    autoApproveSafeCommands: true,
    confirmDangerousCommands: true,
    dangerousPatterns: [
        { pattern: /rm\s+-rf/i, reason: "Dangerous delete", severity: "critical" }
    ]
});

// 检查命令是否危险
const isDangerous = permissionService.isDangerousCommand("rm -rf /");

// 请求用户确认
const result = await permissionService.requestTerminalConfirmation({
    command: "rm -rf .",
    description: "Delete all files",
    isDangerous: true,
});
```

## 为什么保留 Platform 模块？

1. **层次分离**：Platform 提供底层抽象，ACP 提供协议层
2. **可测试性**：`ITerminalService` 接口便于 mock
3. **可扩展性**：未来可以支持非 VS Code 环境
4. **职责单一**：权限服务独立于终端服务
