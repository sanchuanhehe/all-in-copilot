# 终端能力架构设计文档

**生成时间**: 2026年2月1日
**目标**: 参考 VS Code Copilot 实现一致的终端能力
**文件**: `packages/sdk/src/platform/`

---

## 1. 架构总览

### 1.1 设计目标

1. **功能一致性**: 与 VS Code Copilot 终端能力保持一致
2. **权限安全**: 对危险命令实施用户确认机制
3. **无缝集成**: 终端操作与 VS Code 终端面板深度集成
4. **ACP 兼容**: 支持 Agent Client Protocol 终端回调

### 1.2 架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         All-In Copilot SDK                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────┐     ┌─────────────────────┐                    │
│  │   ACP Adapter       │     │  Permission Service │                    │
│  │   (acpChatParticipant)   │     │  (TerminalPermission)  │                    │
│  └──────────┬──────────┘     └──────────┬──────────┘                    │
│             │                           │                                 │
│             ▼                           ▼                                 │
│  ┌─────────────────────┐     ┌─────────────────────┐                    │
│  │  Terminal Service   │     │  VS Code API        │                    │
│  │  (ITerminalService) │────▶│  (window.terminals) │                    │
│  └──────────┬──────────┘     └─────────────────────┘                    │
│             │                                                         │
│             ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    VS Code Terminal Panel                       │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │  │
│  │  │ Terminal 1  │ │ Terminal 2  │ │ Terminal 3  │               │  │
│  │  │ (ACP Agent) │ │ (User)      │ │ (System)    │               │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 模块职责

| 模块 | 职责 | 关键接口/类 |
|------|------|-------------|
| `ITerminalService` | 终端生命周期管理 | `TerminalServiceImpl`, `NullTerminalService` |
| `ITerminalPermissionService` | 权限控制与确认 | `TerminalPermissionService`, `NullTerminalPermissionService` |
| `ACPChatParticipant` | ACP 协议集成 | `ACPTerminalProvider`, `executeInTerminal()` |
| `terminalBufferListener` | 终端状态监听 | `onDidExecuteTerminalCommand`, 缓冲区管理 |

---

## 2. 核心组件详解

### 2.1 终端服务 (Terminal Service)

**位置**: `packages/sdk/src/platform/terminal/`

#### 接口定义 (`terminalService.ts`)

```typescript
export interface ITerminalService {
    // 终端状态
    readonly terminalBuffer: string;
    readonly terminalSelection: string;
    readonly terminalShellType: string;
    readonly terminalLastCommand: TerminalExecutedCommand | undefined;

    // 事件
    readonly onDidCloseTerminal: Event<Terminal>;
    readonly onDidWriteTerminalData: Event<TerminalDataWriteEvent>;
    readonly onDidExecuteTerminalCommand: Event<TerminalExecutedCommand>;

    // 终端管理
    createTerminal(name?: string, shellPath?: string, shellArgs?: string[]): Terminal;
    getBufferForTerminal(terminal: Terminal, maxChars?: number): string;
    contributePath(contributor: string, pathLocation: string, description?: string): void;

    // 会话关联
    associateTerminalWithSession(terminal: Terminal, sessionId: string, quality: ShellIntegrationQuality): Promise<void>;
    getCopilotTerminals(sessionId: string): Promise<IKnownTerminal[]>;
}
```

#### 实现类 (`terminalServiceImpl.ts`)

**核心功能**:
1. **终端创建**: 代理到 `vscode.window.createTerminal()`
2. **缓冲区管理**: 使用 proposed API `onDidWriteTerminalData`
3. **命令追踪**: 使用 proposed API `onDidExecuteTerminalCommand`
4. **Shell 集成**: 使用 proposed API `onDidChangeTerminalShellIntegration`

**与 VS Code Copilot 差异**:

| 特性 | Copilot | 当前实现 | 状态 |
|------|---------|----------|------|
| Disposable 基类 | ✅ | ❌ | 已用手动管理替代 |
| Proposed API 版本检查 | ✅ | ❌ | 已用 try-catch 替代 |
| Shell 集成事件 | ✅ | ✅ | 降级实现 |
| 命令追踪 | ✅ | ✅ | 完整实现 |

### 2.2 权限服务 (Terminal Permission)

**位置**: `packages/sdk/src/platform/permission/`

#### 权限级别

```typescript
enum PermissionResult {
    Allow = 'allow',    // 允许执行
    Deny = 'deny',      // 拒绝执行
    Skip = 'skip'       // 跳过（不执行）
}
```

#### 危险命令模式库

**Critical (需明确确认)**:
- `rm -rf` - 递归删除
- `sudo chmod/chown/mkfs` - 系统级修改
- `curl/wget | bash` - 远程脚本执行
- `git push --force` - 强制推送

**High (建议确认)**:
- `git reset --hard` - 硬重置
- `apt-get remove/purge` - 包移除
- `docker rm/rmi` - 容器/镜像删除

**Medium (可配置确认)**:
- `chmod/chown` - 权限/所有者修改
- `npm uninstall -g` - 全局包移除
- `kill -9` - 强制终止

**Low (通常允许)**:
- `echo`, `cat`, `ls`, `pwd` - 读操作
- `git status`, `git diff` - 查看操作

#### 确认流程

```
命令执行请求
    │
    ▼
┌─────────────────┐
│ 是否危险命令?   │────否──▶ 自动允许 (如果配置)
└────────┬────────┘
         │是
         ▼
┌─────────────────┐
│ 显示确认对话框  │ (使用 vscode.window.showQuickPick)
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
  允许      拒绝
    │         │
    ▼         ▼
  执行命令   返回错误
```

### 2.3 终端缓冲区监听 (Buffer Listener)

**位置**: `packages/sdk/src/platform/terminal/vscode/terminalBufferListener.ts`

#### 数据结构

```typescript
// 终端缓冲区 (最近 40 条记录)
const terminalBuffers: Map<Terminal, string[]> = new Map();

// 终端执行的命令历史
const terminalCommands: Map<Terminal, TerminalExecutedCommand[]> = new Map();

// 最后检测的 Shell 类型
let lastDetectedShellType: string | undefined;
```

#### 核心函数

| 函数 | 描述 | 状态 |
|------|------|------|
| `getActiveTerminalBuffer()` | 获取活动终端缓冲区 | ✅ |
| `getBufferForTerminal()` | 获取指定终端缓冲区 | ✅ |
| `getLastCommandForTerminal()` | 获取最后执行的命令 | ✅ |
| `getActiveTerminalLastCommand()` | 获取活动终端最后命令 | ✅ |
| `getActiveTerminalShellType()` | 获取活动终端 Shell 类型 | ✅ |
| `installTerminalBufferListeners()` | 安装所有监听器 | ✅ |

#### Proposed API 降级策略

```typescript
try {
    const onDidExecuteTerminalCommand = window.onDidExecuteTerminalCommand;
    if (onDidExecuteTerminalCommand) {
        disposables.push(
            onDidExecuteTerminalCommand((e) => {
                // 处理命令执行事件
            })
        );
    }
} catch {
    // API 不可用，跳过命令追踪
    // 使用备选方案: 解析终端缓冲区
}
```

---

## 3. ACP 协议集成

### 3.1 终端回调机制

**位置**: `templates/acp-template/src/extension.ts`

#### ACP 终端接口

```typescript
interface IVsCodeTerminal {
    createTerminal(name?: string, options?: TerminalOptions): Terminal;
    getTerminalOutput(terminal: Terminal): string;
    releaseTerminal(terminal: Terminal): void;
    waitForTerminalExit(terminal: Terminal): Promise<number>;
    killTerminal(terminal: Terminal): void;
}
```

#### 终端执行流程

```
ACP Agent 发送工具调用请求
    │
    ▼
┌──────────────────────────────────────────────────────┐
│ ACPChatParticipant.requestHandler()                  │
│ 1. 初始化客户端 (initializeClient)                   │
│ 2. 创建会话 (newSession)                             │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│ streamChatResponse()                                  │
│ 1. 监听 session/update 事件                          │
│ 2. 检测 tool_call 事件                               │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│ TerminalProvider.executeInTerminal()                  │
│ 1. 权限检查 (TerminalPermissionService)              │
│ 2. 创建/获取终端 (getOrCreateTerminal)               │
│ 3. 执行命令 (terminal.sendText)                      │
│ 4. 捕获输出 (onDidWriteTerminalData)                 │
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│ 发送结果回 Agent                                     │
│ 1. 等待工具完成 (tool_call_update)                   │
│ 2. 发送结果 (clientManager.prompt)                   │
└──────────────────────────────────────────────────────┘
```

### 3.2 工具调用 UI

**使用 `ChatToolInvocationPart`**:

```typescript
// 创建工具调用 UI
const toolPart = new vscode.ChatToolInvocationPart(toolName, toolCallId, false);
toolPart.invocationMessage = new vscode.MarkdownString(`Running ${toolName}...`);
toolPart.isComplete = true;
toolPart.pastTenseMessage = new vscode.MarkdownString(`Executed ${toolName}`);

stream.push(toolPart);
```

---

## 4. 与 VS Code Copilot 功能对比

### 4.1 功能映射表

| VS Code Copilot 功能 | 当前实现 | 实现文件 |
|---------------------|----------|----------|
| `TerminalService` | ✅ | `terminalServiceImpl.ts` |
| `TerminalPermissionService` | ✅ | `terminalPermissionService.ts` |
| `TerminalBufferListener` | ✅ | `terminalBufferListener.ts` |
| Proposed API 类型定义 | ✅ | `vscode.proposed.d.ts` |
| 会话关联终端 | ⚠️ 部分 | `associateTerminalWithSession()` |
| Shell 集成事件 | ✅ | `onDidChangeTerminalShellIntegration` |
| 命令执行追踪 | ✅ | `onDidExecuteTerminalCommand` |
| 危险命令检测 | ✅ | `isDangerousCommand()` |
| 用户确认对话框 | ✅ | `showConfirmationDialog()` |

### 4.2 差异说明

| 差异点 | Copilot 实现 | 当前实现 | 影响 |
|--------|-------------|----------|------|
| Disposable 管理 | 使用 `_register()` | 手动 `dispose()` | 无功能差异 |
| API 版本检查 | 显式版本比较 | try-catch 降级 | 相同行为 |
| 终端与会话关联 | 完整实现 | 部分实现 | 缺少 `getCwdForSession()` |
| 终端输出捕获 | proposed API | 缓冲区解析 | 功能等价 |

---

## 5. 使用指南

### 5.1 基础使用

```typescript
import { TerminalServiceImpl } from '@all-in-copilot/sdk';

// 创建终端服务
const terminalService = new TerminalServiceImpl(extensionContext);

// 创建终端
const terminal = terminalService.createTerminal('My Agent', 'bash');

// 获取终端缓冲区
const buffer = terminalService.getBufferForTerminal(terminal);

// 获取最后命令
const lastCommand = terminalService.terminalLastCommand;
```

### 5.2 权限控制

```typescript
import { TerminalPermissionService, PermissionResult } from '@all-in-copilot/sdk';

// 创建权限服务
const permissionService = new TerminalPermissionService({
    autoApproveSafeCommands: true,
    confirmDangerousCommands: true
});

// 检查命令是否危险
const isDangerous = permissionService.isDangerousCommand('rm -rf /tmp/test');

// 请求确认
const result = await permissionService.requestTerminalConfirmation({
    command: 'rm -rf /tmp/test',
    description: 'Recursive delete in /tmp/test',
    cwd: '/tmp',
    isDangerous: true
});

if (result === PermissionResult.Allow) {
    // 执行命令
}
```

### 5.3 ACP 集成

```typescript
import { registerACPChatParticipant } from '@all-in-copilot/sdk';

const disposable = registerACPChatParticipant('myAgent', 'My Agent', {
    clientConfig: {
        agentMode: 'stdio',
        agentPath: '/path/to/agent',
    },
    extensionContext: {
        extensionUri: context.extensionUri.toString(),
        secrets: context.secrets
    }
});
```

---

## 6. 下一步工作

### 6.1 高优先级

- [ ] 完善 `getCwdForSession()` 实现
- [ ] 完善 `getCopilotTerminals()` 实现
- [ ] 添加终端输出实时监听
- [ ] 实现终端状态持久化

### 6.2 中优先级

- [ ] 添加 "Always allow" 记住选择功能
- [ ] 添加命令历史记录
- [ ] 实现 VS Code 设置页面配置
- [ ] 添加单元测试覆盖

### 6.3 低优先级

- [ ] 优化缓冲区大小管理
- [ ] 添加多终端标签页支持
- [ ] 完善文档和使用示例

---

## 7. 附录

### 7.1 危险命令完整列表

| 模式 | 危险级别 | 原因 |
|------|----------|------|
| `rm -rf` | Critical | 递归强制删除 |
| `sudo chmod/chown` | Critical | 系统权限修改 |
| `curl | bash` | Critical | 远程脚本执行 |
| `git push --force` | High | 强制覆盖远程历史 |
| `git reset --hard` | High | 丢弃本地更改 |
| `apt-get remove` | High | 包移除 |
| `docker system prune` | Medium | 清理系统资源 |
| `kill -9` | Medium | 强制终止进程 |

### 7.2 安全命令白名单

| 命令类别 | 示例命令 |
|----------|----------|
| 文件查看 | `cat`, `head`, `tail`, `less`, `more` |
| 信息查询 | `echo`, `pwd`, `ls`, `date`, `whoami` |
| Git 查看 | `git status`, `git diff`, `git log` |
| 环境相关 | `printenv`, `env`, `set` |
| 导航相关 | `cd`, `source`, `.` |
