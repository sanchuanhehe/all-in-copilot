# VS Code Chat Provider Template

[English](#english) | [中文](#中文)

---

## English

### What is this template?

This is a base template for creating custom VS Code Chat provider extensions using the All-In Copilot SDK. It allows you to integrate any OpenAI-compatible or Anthropic-compatible LLM API into GitHub Copilot Chat.

### What can you build with this?

- **Custom LLM Integration** - Connect any AI model to VS Code's Copilot Chat
- **Private AI Assistants** - Use your company's internal AI models
- **Alternative Providers** - Use models from providers not officially supported
- **Self-hosted Models** - Connect to locally running models (Ollama, vLLM, etc.)

### Features

- 🤖 **Native Chat Integration** - Your model appears in VS Code's Copilot Chat
- 🔧 **Tool Calling Support** - Enable AI to execute actions
- 📝 **Code Generation** - Full code editing capabilities
- 🔍 **Workspace Context** - AI understands your project
- 🔄 **Multiple API Formats** - OpenAI, Anthropic, Gemini, Ollama compatible

### Quick Start

1. Copy this template to your project
2. Edit `src/config.ts` to configure your provider
3. Update `package.json` with your extension info
4. Run `npm install && npm run compile`
5. Press F5 to test in VS Code

### Configuration

Edit `src/config.ts`:

```typescript
export const PROVIDER_CONFIG: ProviderConfig = {
  id: 'your-provider-id',
  name: 'Your Provider Name',
  baseUrl: 'https://api.example.com/v1/chat/completions',
  apiKeySecret: 'your-extension.apiKey',
  family: 'your-family',
  apiMode: 'openai',  // 'openai' | 'anthropic' | 'gemini' | 'ollama'
  supportsTools: true,
  supportsVision: false,
};
```

### Project Structure

```
├── src/
│   ├── config.ts      # Provider configuration
│   └── extension.ts   # Extension entry point
├── package.json       # Extension manifest
├── esbuild.js         # Build configuration
└── tsconfig.json      # TypeScript config
```

---

## 中文

### 这个模板是什么？

这是一个基础模板，用于使用 All-In Copilot SDK 创建自定义的 VS Code Chat 提供者扩展。它允许你将任何 OpenAI 兼容或 Anthropic 兼容的 LLM API 集成到 GitHub Copilot Chat 中。

### 你可以用它构建什么？

- **自定义 LLM 集成** - 将任何 AI 模型连接到 VS Code 的 Copilot Chat
- **私有 AI 助手** - 使用公司内部的 AI 模型
- **替代提供者** - 使用官方不支持的模型提供者
- **自托管模型** - 连接本地运行的模型（Ollama、vLLM 等）

### 功能特性

- 🤖 **原生聊天集成** - 你的模型出现在 VS Code 的 Copilot Chat 中
- 🔧 **工具调用支持** - 让 AI 执行操作
- 📝 **代码生成** - 完整的代码编辑能力
- 🔍 **工作区上下文** - AI 理解你的项目
- 🔄 **多种 API 格式** - 兼容 OpenAI、Anthropic、Gemini、Ollama

### 快速开始

1. 将此模板复制到你的项目
2. 编辑 `src/config.ts` 配置你的提供者
3. 更新 `package.json` 中的扩展信息
4. 运行 `npm install && npm run compile`
5. 按 F5 在 VS Code 中测试

### 配置说明

编辑 `src/config.ts`：

```typescript
export const PROVIDER_CONFIG: ProviderConfig = {
  id: 'your-provider-id',        // 提供者 ID
  name: 'Your Provider Name',    // 显示名称
  baseUrl: 'https://api.example.com/v1/chat/completions',  // API 地址
  apiKeySecret: 'your-extension.apiKey',  // API 密钥存储键
  family: 'your-family',         // 模型系列
  apiMode: 'openai',             // API 模式：'openai' | 'anthropic' | 'gemini' | 'ollama'
  supportsTools: true,           // 是否支持工具调用
  supportsVision: false,         // 是否支持图像
};
```

### 项目结构

```
├── src/
│   ├── config.ts      # 提供者配置
│   └── extension.ts   # 扩展入口点
├── package.json       # 扩展清单
├── esbuild.js         # 构建配置
└── tsconfig.json      # TypeScript 配置
```

---

## License / 许可证

MIT
