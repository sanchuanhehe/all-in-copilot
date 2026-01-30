# Kimi Copilot (Coding Plan)

[English](#english) | [中文](#中文)

> **Note:** This is the **Coding Plan** version of Kimi Copilot. For the standard version, see [kimi-template](../kimi-template/).

---

## English

### What is Kimi Copilot (Coding Plan)?

Kimi Copilot (Coding Plan) is a VS Code extension that integrates Moonshot AI's **Kimi Coding Plan** into GitHub Copilot Chat. This version uses the dedicated coding API endpoint (`api.kimi.com/coding`) optimized for programming tasks, with dynamic model fetching support.

#### Difference from Standard Kimi Copilot

| Feature | Kimi Copilot (Coding Plan) | Standard Kimi Copilot |
|---------|---------------------------|----------------------|
| **API Endpoint** | `https://api.kimi.com/coding/v1/messages` | `https://api.moonshot.cn/anthropic/v1/messages` |
| **Optimized For** | Coding tasks with enhanced capabilities | General-purpose conversations |
| **Dynamic Models** | ✅ Enabled - Auto-fetches available models | ❌ Disabled - Uses static model list |
| **Provider ID** | `kimi-coding` | `kimi` |
| **Extension Name** | `kimi-coding-copilot` | `kimi-copilot` |

### Features

- 🤖 **Native Chat Integration** - Use Kimi K2 models in VS Code's built-in Copilot Chat
- 🧠 **Extended Thinking** - Support for thinking models that show reasoning process
- 🔧 **Tool Calling** - Let AI execute actions like reading files, running commands
- 📝 **Code Generation** - Generate, edit, and refactor code with AI assistance
- 🔍 **Workspace Understanding** - AI can understand your project context
- 💬 **256K Context Window** - Handle large codebases and long conversations

### Setup

1. Install this extension in VS Code
2. Get your API key from [Moonshot Open Platform](https://platform.moonshot.cn/)
3. Open **GitHub Copilot Chat** panel (`Ctrl+Alt+I` / `Cmd+Alt+I`)
4. Click the **model selector** dropdown at the bottom of the chat panel
5. Select a **Kimi** model from the list
6. Enter your API key when prompted (first time only)

> 📖 See [GitHub Copilot Docs: Adding models](https://docs.github.com/en/copilot/how-tos/use-ai-models/change-the-chat-model?tool=vscode#adding-models) for more details.

### Supported Models

| Model                  | Context | Description                      |
| ---------------------- | ------- | -------------------------------- |
| kimi-k2-thinking-turbo | 256K    | Fast thinking model              |
| kimi-k2-thinking       | 256K    | Extended thinking with reasoning |
| kimi-k2-turbo-preview  | 256K    | High-speed inference             |
| kimi-k2-0905-preview   | 256K    | Latest preview version           |

---

## 中文

### 什么是 Kimi Copilot（编程版）？

Kimi Copilot（编程版）是一个 VS Code 扩展，将月之暗面的 **Kimi 编程版**集成到 GitHub Copilot Chat 中。此版本使用专门的编程 API 端点（`api.kimi.com/coding`），针对编程任务进行了优化，并支持动态模型获取。

#### 与标准版 Kimi Copilot 的区别

| 特性 | Kimi Copilot（编程版） | 标准版 Kimi Copilot |
|------|----------------------|-------------------|
| **API 端点** | `https://api.kimi.com/coding/v1/messages` | `https://api.moonshot.cn/anthropic/v1/messages` |
| **优化方向** | 针对编程任务的增强能力 | 通用对话场景 |
| **动态模型** | ✅ 启用 - 自动获取可用模型 | ❌ 禁用 - 使用静态模型列表 |
| **Provider ID** | `kimi-coding` | `kimi` |
| **扩展名称** | `kimi-coding-copilot` | `kimi-copilot` |

### 功能特性

- 🤖 **原生聊天集成** - 在 VS Code 内置的 Copilot Chat 中使用 Kimi K2 模型
- 🧠 **扩展思考** - 支持展示推理过程的思考模型
- 🔧 **工具调用** - 让 AI 执行操作，如读取文件、运行命令
- 📝 **代码生成** - 通过 AI 辅助生成、编辑和重构代码
- 🔍 **工作区理解** - AI 可以理解你的项目上下文
- 💬 **256K 上下文窗口** - 处理大型代码库和长对话

### 配置步骤

1. 在 VS Code 中安装此扩展
2. 从[月之暗面开放平台](https://platform.moonshot.cn/)获取 API 密钥
3. 打开 **GitHub Copilot Chat** 面板（`Ctrl+Alt+I` / `Cmd+Alt+I`）
4. 点击聊天面板底部的**模型选择器**下拉菜单
5. 从列表中选择一个 **Kimi** 模型
6. 首次使用时输入你的 API 密钥

> 📖 详见 [GitHub Copilot 文档：添加模型](https://docs.github.com/en/copilot/how-tos/use-ai-models/change-the-chat-model?tool=vscode#adding-models)

### 支持的模型

| 模型                   | 上下文 | 描述                 |
| ---------------------- | ------ | -------------------- |
| kimi-k2-thinking-turbo | 256K   | 快速思考模型         |
| kimi-k2-thinking       | 256K   | 带推理过程的扩展思考 |
| kimi-k2-turbo-preview  | 256K   | 高速推理             |
| kimi-k2-0905-preview   | 256K   | 最新预览版本         |

---

## License / 许可证

MIT
