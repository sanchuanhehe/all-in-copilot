# VS Code Proposed API 使用指南

本指南说明如何正确使用 VS Code Proposed API 进行扩展开发。

## 什么是 Proposed API？

Proposed API 是 VS Code 中尚未稳定的 API 实现。它们可能会有变化，只在 Insiders 版本中可用，不能用于公开发布的扩展。但扩展开发者可以在本地开发中测试这些新 API，并为 VS Code 团队提供反馈。

## 使用步骤

### 1. 使用 VS Code Insiders

Proposed API 只在 VS Code Insiders 版本中可用。下载地址：https://code.visualstudio.com/insiders/

### 2. 在 package.json 中声明要使用的 API

```json
{
  "enabledApiProposals": [
    "chatParticipantAdditions",
    "chatParticipantPrivate",
    "languageModelChatProvider"
  ]
}
```

### 3. 下载对应的 d.ts 声明文件

使用 `@vscode/dts` CLI 工具下载最新的声明文件：

```bash
# 安装 @vscode/dts
npm install -D @vscode/dts

# 下载 proposed API 声明（从主分支）
npx @vscode/dts dev

# 下载 vscode.d.ts 主声明文件
npx @vscode/dts main
```

或者在 package.json 中添加脚本：

```json
{
  "scripts": {
    "download-api": "npx @vscode/dts dev && npx @vscode/dts main && mv vscode.d.ts src/vscode/vscode.d.ts"
  },
  "postinstall": "npm run download-api"
}
```

### 4. 将声明文件放入项目

下载的 `vscode.proposed.<proposalName>.d.ts` 文件需要复制到项目的源码目录中。

推荐的项目结构：

```
src/
├── vscode/
│   ├── vscode.d.ts          # 主 VS Code 声明文件
│   └── proposed.chatParticipantAdditions.d.ts  # Proposed API 声明
├── extension.ts
└── ...
```

### 5. 在代码中使用

```typescript
import * as vscode from 'vscode';

// 使用 Proposed API
export function activate(context: vscode.ExtensionContext) {
    // chatParticipantAdditions 提供了 ChatToolInvocationPart
    const chatParticipant = vscode.chat.createChatParticipant('my.extension', handler);

    // 使用 chatParticipantPrivate 的 API
    // ...
}
```

## API 兼容性

### 主分支兼容性

在 `microsoft/vscode` 主分支上，`vscode.proposed.<proposalName>.d.ts` 总是与 `vscode.d.ts` 兼容。

### @types/vscode 兼容性

如果使用 `@types/vscode` 包，最新的 `vscode.proposed.<proposalName>.d.ts` 可能与 `@types/vscode` 版本不兼容。

解决方法：

**方法 1：移除 @types/vscode，使用 dts 下载**
```bash
npm uninstall @types/vscode
npx @vscode/dts main  # 下载 vscode.d.ts
```

**方法 2：指定版本**
```bash
npm install -D @types/vscode@1.104.0
npx @vscode/dts dev 1.104.0  # 下载对应版本的声明文件
```

## 分享使用 Proposed API 的扩展

### 打包扩展

```bash
vsce package
```

这会创建一个 VSIX 文件，可以分享给他人安装。

### 安装扩展

1. 打开 Extensions 视图
2. 点击 `...` 按钮
3. 选择 "Install from VSIX"

### 启用 Proposed API

安装 VSIX 后，需要在 VS Code Insiders 中启用扩展的 Proposed API：

```bash
# 启动 VS Code Insiders 并启用指定扩展的 Proposed API
code-insiders --enable-proposed-api=<YOUR-EXTENSION-ID> .
```

或者永久配置，在 `.vscode-insiders/argv.json` 中添加：

```json
{
    "enable-proposed-api": ["YOUR-EXTENSION-ID"]
}
```

## 本模板的 Proposed API 配置

ACP 模板使用了以下 Proposed API：

| API | 用途 |
|-----|------|
| `chatParticipantAdditions` | ChatToolInvocationPart, ChatTerminalToolInvocationData 等 UI 增强 |
| `chatParticipantPrivate` | 私有聊天参与者功能 |
| `languageModelChatProvider` | 语言模型聊天提供者接口 |

### 更新声明文件

```bash
cd templates/acp-template
npm run download-api
```

这会从 VS Code 主分支下载最新的声明文件，并覆盖 `src/vscode/vscode.d.ts`。

## 相关资源

- [VS Code Proposed API 官方文档](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)
- [vscode-dts 工具](https://github.com/microsoft/vscode-dts)
- [Proposed API 示例](https://github.com/microsoft/vscode-extension-samples/tree/main/proposed-api-sample)
- [VS Code 声明文件](https://github.com/microsoft/vscode/tree/main/src/vscode-dts)
