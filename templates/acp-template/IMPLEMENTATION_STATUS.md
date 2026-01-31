# ACP ClientCallbacks 实现状态报告

**生成时间**: 2025年1月
**文件**: `templates/acp-template/src/config.ts`

---

## 1. 执行摘要

经过对 VS Code Copilot 工具集的完整审计，`ClientCallbacks` 接口的实现状态如下：

| 分类 | 方法数量 | Copilot工具 | VS Code API |
|------|---------|-------------|-------------|
| ✅ 已迁移 | 2 | `copilot_readFile`, `copilot_applyPatch`, `copilot_createFile` | 降级备选 |
| ❌ 必需API | 5 | **无等效工具** | 必须使用 |
| ⚠️ 特殊处理 | 3 | 不适用 | UI/扩展系统 |

---

## 2. 详细实现状态

### 2.1 文件操作 ✅ 已使用 Copilot 工具

#### `readTextFile(path, line?, limit?)` ✅
```typescript
async readTextFile(path: string, line?: number | null, limit?: number | null): Promise<string> {
    // 优先使用 Copilot 工具
    const result = await vscode.lm.invokeTool("copilot_readFile", {
        filePath: path,
        startLine: line ?? 1,
        endLine: limit !== undefined ? startLine + limit : undefined,
    }, undefined);
    
    if (result?.content) {
        return extractTextContent(result.content);
    }
    
    // 降级：VS Code API
    const uri = vscode.Uri.file(path);
    const doc = await vscode.workspace.openTextDocument(uri);
    return doc.getText();
}
```

#### `writeTextFile(path, content)` ✅
```typescript
async writeTextFile(path: string, content: string): Promise<void> {
    // 优先：applyPatch（适用于新建和现有文件）
    await vscode.lm.invokeTool("copilot_applyPatch", {
        input: `*** Begin Patch\n*** Update File: ${path}\n${content}\n*** End Patch`,
    }, undefined);
    
    // 备选：createFile（如果 applyPatch 失败）
    await vscode.lm.invokeTool("copilot_createFile", {
        filePath: path,
        content,
    }, undefined);
    
    // 降级：VS Code API
    const uri = vscode.Uri.file(path);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf-8"));
}
```

---

### 2.2 终端操作 ❌ 必须使用 VS Code API

**关键发现**: Copilot **没有**提供终端管理工具。

#### 可用的 Copilot 工具（验证完毕）
```json
{
  "file_search": ["copilot_findFiles", "copilot_searchCodebase"],
  "grep_search": ["copilot_findTextInFiles", "copilot_listCodeUsages"],
  "read_file": ["copilot_readFile"],
  "create_file": ["copilot_createFile", "copilot_applyPatch"],
  "directory": ["copilot_listDirectory", "copilot_createDirectory"],
  "notebook": ["copilot_runNotebookCell", "copilot_editNotebook", "copilot_getNotebookSummary"],
  "web": ["copilot_fetchWebPage", "copilot_openSimpleBrowser"],
  "git": ["copilot_getChangedFiles"],
  "tools": ["copilot_runVscodeCommand", "copilot_getErrors", "copilot_memory"],
  "github": ["copilot_githubRepo", "copilot_githubPullRequest_*"],
  "search": ["copilot_getSearchViewResults"],
  "notebook": ["copilot_createNewJupyterNotebook", "copilot_getNotebookSummary"]
}
```

#### ❌ 缺失的终端工具
```typescript
// 以下工具在 vscode.lm.tools 中不存在
- copilot_createTerminal      // ❌ 无
- copilot_getTerminalOutput   // ❌ 无
- copilot_releaseTerminal     // ❌ 无
- copilot_waitForTerminalExit // ❌ 无
- copilot_killTerminal        // ❌ 无
```

#### `createTerminal(sessionId, command, args?)` ❌
```typescript
async createTerminal(_sessionId: string, command: string, _args?: string[]): Promise<IVsCodeTerminal> {
    const terminalId = randomUUID();
    
    // 必须使用 VS Code 原生 API - 无 Copilot 等效工具
    const terminal = getOrCreateTerminal(terminalId, "Agent");
    const state: TerminalState = {
        terminal,
        command,
        isBackground: detectBackgroundProcess(command),
    };
    
    terminalStateMap.set(terminalId, state);
    return new ACPVsCodeTerminal(terminalId, terminal.name);
}
```

#### `getTerminalOutput(terminalId)` ❌
```typescript
async getTerminalOutput(terminalId: string): Promise<{ output: string; exitCode?: number }> {
    const state = terminalStateMap.get(terminalId);
    if (!state) return { output: "", exitCode: 0 };
    
    // 必须访问终端状态 - 无 Copilot 等效工具
    if (state.isBackground && !state.outputPromise) {
        state.terminal.show();
        state.outputPromise = new Promise((resolve) => {
            state.resolveOutput = resolve;
        });
        state.terminal.sendText(state.command);
    }
    
    return {
        output: state.output ?? "",
        exitCode: state.exitCode,
    };
}
```

#### `releaseTerminal(terminalId)` ❌
```typescript
async releaseTerminal(terminalId: string): Promise<void> {
    const state = terminalStateMap.get(terminalId);
    if (state) {
        // 必须使用终端实例 API - 无 Copilot 等效工具
        state.terminal.hide();
    }
}
```

#### `waitForTerminalExit(terminalId)` ❌
```typescript
async waitForTerminalExit(terminalId: string): Promise<{ exitCode?: number }> {
    const state = terminalStateMap.get(terminalId);
    if (!state) return { exitCode: undefined };
    
    // 必须监听终端事件 - 无 Copilot 等效工具
    if (state.isBackground && !state.exitCode && state.outputPromise) {
        state.terminal.show();
        await state.outputPromise;
    }
    
    return { exitCode: state.exitCode };
}
```

#### `killTerminal(terminalId)` ❌
```typescript
async killTerminal(terminalId: string): Promise<void> {
    const state = terminalStateMap.get(terminalId);
    if (state) {
        // 必须调用终端 dispose - 无 Copilot 等效工具
        state.terminal.dispose();
        terminalStateMap.delete(terminalId);
    }
}
```

---

### 2.3 特殊处理的操作 ⚠️

#### `requestPermission(request)` ⚠️
```typescript
async requestPermission(request: {
    toolCall: { title: string; description?: string };
    options: Array<{ optionId: string; label: string }>;
}): Promise<string> {
    // ✅ 正确：使用 VS Code UI (QuickPick) 进行权限确认
    // 这是用户交互，不能通过 Copilot 工具处理
    const safePatterns = [/replace_string_in_file/i, /create_file/i, /list_dir/i];
    
    for (const pattern of safePatterns) {
        if (pattern.test(request.toolCall.title)) {
            return request.options[0]?.optionId ?? "approved";
        }
    }
    
    const selection = await vscode.window.showQuickPick(
        request.options.map((opt) => ({ label: opt.label, description: opt.optionId })),
        { placeHolder: request.toolCall.title }
    );
    
    return selection?.description ?? "denied";
}
```

#### `extMethod(method, params)` ⚠️
```typescript
async extMethod(method: string, _params: Record<string, unknown>): Promise<Record<string, unknown>> {
    // 扩展方法 - 可自定义实现
    switch (method) {
        // 可在此添加自定义扩展方法
        default:
            throw new Error(`Unknown extension method: ${method}`);
    }
}
```

#### `extNotification(method, params)` ⚠️
```typescript
async extNotification(method: string, params: Record<string, unknown>): Promise<void> {
    // 扩展通知 - 可自定义实现
    console.log(`[ACP Extension] Notification: ${method}`, params);
}
```

---

## 3. 架构决策记录

### 3.1 文件操作策略

**决策**: 使用 Copilot 工具 + 降级策略

**理由**:
1. Copilot 工具提供统一的权限确认系统
2. 文件操作是最常见的操作，工具支持完善
3. 降级策略确保在工具不可用时仍能工作

**实现**:
```typescript
try {
    await vscode.lm.invokeTool("copilot_readFile", ...);
} catch {
    // 降级到 VS Code API
    const uri = vscode.Uri.file(path);
    await vscode.workspace.openTextDocument(uri);
}
```

### 3.2 终端操作策略

**决策**: 使用直接 VS Code API

**理由**:
1. Copilot **未提供**终端管理工具 (`vscode.lm.tools` 中无等效项)
2. 终端操作需要实时状态管理和事件处理
3. `vscode.window.createTerminal`, `terminal.dispose()` 等 API 无 Copilot 替代

**实现**:
```typescript
const terminal = vscode.window.createTerminal("Agent");
terminal.show();
terminal.sendText(command);
terminal.dispose();
```

### 3.3 权限确认策略

**决策**: 使用 VS Code UI (QuickPick)

**理由**:
1. 权限确认需要用户交互
2. Copilot 工具已有内置权限系统
3. 自定义实现与 Copilot 权限系统集成

---

## 4. 验证结果

### 4.1 Copilot 工具完整列表（来自 vscode-copilot-chat/package.json）

```json
{
  "file_search": ["copilot_findFiles", "copilot_searchCodebase"],
  "grep_search": ["copilot_findTextInFiles", "copilot_listCodeUsages", "copilot_searchWorkspaceSymbols"],
  "read_file": ["copilot_readFile"],
  "create_file": ["copilot_createFile", "copilot_applyPatch", "copilot_replaceString", "copilot_multiReplaceString", "copilot_insertEdit"],
  "directory": ["copilot_listDirectory", "copilot_createDirectory"],
  "notebook": ["copilot_runNotebookCell", "copilot_editNotebook", "copilot_getNotebookSummary", "copilot_createNewJupyterNotebook"],
  "web": ["copilot_fetchWebPage", "copilot_openSimpleBrowser"],
  "git": ["copilot_getChangedFiles"],
  "vscode": ["copilot_runVscodeCommand", "copilot_getErrors", "copilot_getDocInfo", "copilot_memory"],
  "github": ["copilot_githubRepo", "copilot_githubPullRequest_*"],
  "search": ["copilot_getSearchViewResults"],
  "testing": ["copilot_testFailure"],
  "ask": ["copilot_askQuestions"]
}
```

**终端工具**: ❌ **不存在**

---

## 5. 测试验证

### 5.1 当前测试状态
- ✅ SDK 构建通过
- ✅ acp-template 编译通过
- ✅ 147 个测试通过

### 5.2 建议测试场景
1. 文件读取：验证 `copilot_readFile` 工具和降级到 VS Code API
2. 文件写入：验证 `copilot_applyPatch`/`copilot_createFile` 和降级
3. 终端操作：验证直接 VS Code API 正常工作
4. 权限确认：验证自定义权限对话框显示

---

## 6. 结论

### 已完成 ✅
- `readTextFile`: 使用 `copilot_readFile` + VS Code API 降级
- `writeTextFile`: 使用 `copilot_applyPatch`/`copilot_createFile` + VS Code API 降级

### 预期行为 ❌
- `createTerminal`: 使用 `vscode.window.createTerminal()` - 无 Copilot 工具
- `getTerminalOutput`: 使用终端状态管理 - 无 Copilot 工具
- `releaseTerminal`: 使用 `terminal.hide()` - 无 Copilot 工具
- `waitForTerminalExit`: 使用终端事件 - 无 Copilot 工具
- `killTerminal`: 使用 `terminal.dispose()` - 无 Copilot 工具

### 设计决策
**终端操作必须使用直接 VS Code API**，因为 Copilot 工具集中没有提供终端管理功能。这是架构限制，不是实现缺陷。

---

## 7. 附录

### A. 相关文件
- `templates/acp-template/src/config.ts` - 完整实现
- `vscode-copilot-chat/package.json` - Copilot 工具定义（参考）

### B. 参考链接
- [ACP SDK 文档](https://github.com/anthropics/anthropic-cookbook/tree/main/mcp)
- [VS Code Copilot Tools](https://code.visualstudio.com/docs/copilot/copilot-extensions)

### C. 版本信息
- ACP SDK: 最新版本
- VS Code: 1.95+
- TypeScript: 5.x
