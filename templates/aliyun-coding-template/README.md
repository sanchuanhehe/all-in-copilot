# Aliyun Model Studio Coding Plan Copilot

[English](#english) | [中文](#中文)

---

## English

### What is Aliyun Model Studio Coding Plan Copilot?

Aliyun Model Studio Coding Plan Copilot is a VS Code extension that integrates Alibaba Cloud's **Aliyun Model Studio Coding Plan** into GitHub Copilot Chat. This version uses the dedicated coding API endpoint (`coding.dashscope.aliyuncs.com`) optimized for programming tasks.

### Features

- 🤖 **Native Chat Integration** - Use Qwen, MiniMax, GLM, and Kimi models in VS Code's built-in Copilot Chat
- 🧠 **Extended Thinking** - Support for thinking models that show reasoning process
- 🔧 **Tool Calling** - Let AI execute actions like reading files, running commands
- 📝 **Code Generation** - Generate, edit, and refactor code with AI assistance
- 🔍 **Workspace Understanding** - AI can understand your project context
- 💬 **Large Context Window** - Handle large codebases and long conversations

### Setup

1. Install this extension in VS Code
2. Get your API key from [Aliyun Model Studio](https://bailian.console.aliyun.com/)
3. Open **GitHub Copilot Chat** panel (`Ctrl+Alt+I` / `Cmd+Alt+I`)
4. Click the **model selector** dropdown at the bottom of the chat panel
5. Select an **Aliyun Model Studio Coding Plan** model from the list
6. Enter your API key when prompted (first time only)

> 📖 See [GitHub Copilot Docs: Adding models](https://docs.github.com/en/copilot/how-tos/use-ai-models/change-the-chat-model?tool=vscode#adding-models) for more details.

### Supported Models

| Model | Description |
| --- | --- |
| Qwen3.5 Plus | Qwen 3.5 Plus model |
| Qwen3 Max 2026-01-23 | Qwen 3 Max model |
| Qwen3 Coder Next | Qwen 3 Coder Next model |
| Qwen3 Coder Plus | Qwen 3 Coder Plus model |
| MiniMax M2.5 | MiniMax M2.5 model |
| GLM-5 | GLM-5 model |
| GLM-4.7 | GLM-4.7 model |
| Kimi K2.5 | Kimi K2.5 model |

---

## 中文

### 什么是 Aliyun Model Studio Coding Plan Copilot？

Aliyun Model Studio Coding Plan Copilot 是一个 VS Code 扩展，将阿里云的 **百炼大模型编程计划**集成到 GitHub Copilot Chat 中。此版本使用专门的编程 API 端点（`coding.dashscope.aliyuncs.com`），针对编程任务进行了优化。

### 功能特性

- 🤖 **原生聊天集成** - 在 VS Code 内置的 Copilot Chat 中使用通义千问、MiniMax、智谱 GLM 和 Kimi 模型
- 🧠 **扩展思考** - 支持展示推理过程的思考模型
- 🔧 **工具调用** - 让 AI 执行操作，如读取文件、运行命令
- 📝 **代码生成** - 通过 AI 辅助生成、编辑和重构代码
- 🔍 **工作区理解** - AI 可以理解你的项目上下文
- 💬 **大上下文窗口** - 处理大型代码库和长对话

### 配置步骤

1. 在 VS Code 中安装此扩展
2. 从[阿里云百炼控制台](https://bailian.console.aliyun.com/)获取 API 密钥
3. 打开 **GitHub Copilot Chat** 面板（`Ctrl+Alt+I` / `Cmd+Alt+I`）
4. 点击聊天面板底部的**模型选择器**下拉菜单
5. 从列表中选择一个 **Aliyun Model Studio Coding Plan** 模型
6. 首次使用时输入你的 API 密钥

> 📖 详见 [GitHub Copilot 文档：添加模型](https://docs.github.com/en/copilot/how-tos/use-ai-models/change-the-chat-model?tool=vscode#adding-models)

### 支持的模型

| 模型 | 描述 |
| --- | --- |
| Qwen3.5 Plus | 通义千问 3.5 Plus 模型 |
| Qwen3 Max 2026-01-23 | 通义千问 3 Max 模型 |
| Qwen3 Coder Next | 通义千问 3 Coder Next 模型 |
| Qwen3 Coder Plus | 通义千问 3 Coder Plus 模型 |
| MiniMax M2.5 | MiniMax M2.5 模型 |
| GLM-5 | 智谱 GLM-5 模型 |
| GLM-4.7 | 智谱 GLM-4.7 模型 |
| Kimi K2.5 | Kimi K2.5 模型 |

---

## License / 许可证

MIT
