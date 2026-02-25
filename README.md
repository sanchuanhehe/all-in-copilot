# All-In Copilot

[English](#english) | [中文](#中文)

---

## English

🚀 SDK & CLI for building VS Code Chat extensions with custom LLM providers.

### ✨ Features

- **One-click CLI Generation** - Interactively create extension projects
- **Multi-provider Presets** - Built-in configurations for GLM, DeepSeek, Qwen, MiniMax, OpenAI, Anthropic
- **Dynamic Model Fetching** - Automatically fetch available models from API
- **Ready-to-use Templates** - Copy templates to quickly create custom Copilot extensions
- **Lightweight SDK** - Core SDK has no VS Code dependencies, works in any Node.js environment

### Architecture

```markdown
all-in-copilot/
├── packages/
│ └── sdk/ # Core SDK
│ └── src/
│ ├── core/ # Types, model fetcher
│ └── vscode/ # VS Code provider helpers
│
├── templates/ # Extension templates
│ ├── base-template/ # Base template for custom providers
│ ├── glm-template/ # GLM (智谱AI) example
│ ├── minimax-template/ # MiniMax example
│ ├── kimi-template/ # Kimi K2 (Moonshot) example
│ ├── mimo-template/ # Xiaomi MiMo example
│ └── aliyun-coding-template/ # Aliyun Model Studio Coding Plan example
│
└── cli/ # Project generator CLI
└── src/
└── index.ts
```

### Quick Start

#### Method 1: Use CLI (Recommended)

```bash
# Install CLI globally
npm install -g @all-in-copilot/cli

# Create a new project interactively
all-in-copilot

# Or with short command
aic create my-copilot
```

#### Method 2: Copy Template

```bash
# Copy template
cp -r templates/glm-template my-copilot
cd my-copilot

# Edit configuration
vim src/config.ts

# Install dependencies
npm install

# Compile and test (F5 in VS Code)
npm run compile
```

### CLI Commands

```bash
all-in-copilot              # Interactive mode
all-in-copilot create NAME  # Create project with prompts
all-in-copilot list         # List available presets
all-in-copilot help         # Show help
```

### Available Presets

| Preset    | Provider        | API Format |
| --------- | --------------- | ---------- |
| glm       | GLM (智谱AI)    | OpenAI     |
| minimax   | MiniMax         | Anthropic  |
| kimi      | Kimi (Moonshot) | Anthropic  |
| mimo      | Xiaomi MiMo     | Anthropic  |
| deepseek  | DeepSeek        | OpenAI     |
| qwen      | Qwen            | OpenAI     |
| openai    | OpenAI          | OpenAI     |
| anthropic | Anthropic       | Anthropic  |
| custom    | Custom          | OpenAI     |

### Provider Configuration

Edit `src/config.ts` to customize your provider:

```typescript
export const PROVIDER_CONFIG: ProviderConfig = {
	id: "provider-id",
	name: "Provider Name",
	baseUrl: "https://api.example.com/v1/chat/completions",
	apiKeySecret: "extension-name.apiKey",
	family: "provider-family",
	apiMode: "openai", // 'openai' | 'anthropic' | 'gemini' | 'ollama'
	supportsTools: true,
	supportsVision: false,
	defaultMaxOutputTokens: 4096,
	defaultContextLength: 32768,
	dynamicModels: true,
	modelsCacheTTL: 5 * 60 * 1000,
};

export const FALLBACK_MODELS: ModelConfig[] = [
	{
		id: "model-1",
		name: "Model 1",
		maxInputTokens: 30000,
		maxOutputTokens: 4096,
		supportsTools: true,
		supportsVision: false,
	},
];

// Optional: Filter which models to display
export function filterModels(models: ModelConfig[]): ModelConfig[] {
	return models.filter((m) => m.id.includes("chat"));
}
```

### SDK Usage

```typescript
import {
	convertToOpenAI,
	convertToolsToOpenAI,
	processOpenAIStream,
	fetchModelsFromAPI,
	estimateTokens,
} from "@all-in-copilot/sdk";

// Dynamic model fetching
const providerConfig: ProviderConfig = {
	id: "my-provider",
	name: "My Provider",
	baseUrl: "https://api.example.com/v1",
	// ... other config
};

const models = await fetchModels(providerConfig, { apiKey: "your-api-key" });
console.log("Available models:", models);

// Use OpenAI-compatible provider
const provider = new OpenAIProvider(providerConfig, { apiKey: "your-api-key" });
for (const model of models) {
	provider.registerModel(model);
}

const response = await provider.complete({
	model: models[0].id,
	messages: [{ role: "user", content: "Hello!" }],
});
```

### Development

#### Build SDK

```bash
cd packages/sdk
npm run build
```

#### Build VS Code Extension

```bash
cd templates/minimax-template
npm run compile
```

#### Watch Mode

```bash
# Terminal 1
cd packages/sdk && npm run watch

# Terminal 2
cd templates/minimax-template && npm run watch
```

### CI/CD & Publishing

#### GitHub Secrets Required

Add the following secrets in your repository settings:

| Secret     | Description                               |
| ---------- | ----------------------------------------- |
| `VSCE_PAT` | VS Code Marketplace Personal Access Token |
| `OVSX_PAT` | Open VSX Registry Token (optional)        |

#### Workflows

| Workflow           | Trigger                          | Description                                  |
| ------------------ | -------------------------------- | -------------------------------------------- |
| **CI**             | Push/PR to `main`                | Build SDK, CLI and all templates, run tests  |
| **Release**        | Tag push (`v*`) / Manual         | Publish stable or pre-release to marketplace |
| **Pre-release**    | Push to `pre-release/*` / Manual | Publish pre-release version                  |
| **Publish Single** | Manual only                      | Manually publish a single extension          |

#### Release Process

**Stable Release:**

```bash
# 1. Update version
cd templates/glm-template
npm version patch  # or minor / major

# 2. Commit and create tag
git add .
git commit -m "chore: bump glm-template to v0.2.0"
git tag glm-template-v0.2.0
git push origin main --tags
```

**Pre-release:**

```bash
# Method 1: Use tag
git tag glm-template-v0.2.0-beta.1
git push origin --tags

# Method 2: Use branch
git checkout -b pre-release/glm-template
git push origin pre-release/glm-template

# Method 3: Manual trigger via GitHub Actions
```

#### Tag Naming Convention

| Pattern                                  | Triggers                  | Example               |
| ---------------------------------------- | ------------------------- | --------------------- |
| `v*`                                     | Release all templates     | `v1.0.0`              |
| `<template>-v*`                          | Release specific template | `glm-template-v0.2.0` |
| `*-pre*`, `*-alpha*`, `*-beta*`, `*-rc*` | Pre-release               | `v1.0.0-beta.1`       |

### Templates

| Template    | Base URL                                                | API Mode         | Dynamic Models |
| ----------- | ------------------------------------------------------- | ---------------- | -------------- |
| **GLM**     | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | OpenAI           | ✅             |
| **MiniMax** | `https://api.minimaxi.com/anthropic/v1/messages`        | Anthropic        | ❌             |
| **Kimi**    | `https://api.moonshot.cn/anthropic`                     | Anthropic        | ❌             |
| **MiMo**    | `https://api.xiaomimimo.com/anthropic/v1/messages`      | Anthropic        | ❌             |
| **Aliyun Coding Plan** | `https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages` | Anthropic | ❌ |
| **Base**    | Custom                                                  | OpenAI/Anthropic | ✅             |

### How Dynamic Model Fetching Works

```text
Provider API (/models)
       ↓
   fetch + cache
       ↓
 filterModels()
       ↓
VS Code Model List
```

1. Extension calls `/models` endpoint on provider's API
2. Response is parsed and converted to `ModelConfig[]`
3. Models are cached for `modelsCacheTTL` milliseconds
4. If fetch fails, fallback to `FALLBACK_MODELS`
5. Optional `filterModels()` function filters displayed models

---

## 中文

🚀 用于构建带有自定义 LLM 提供商的 VS Code Chat 扩展的 SDK 和 CLI。

### ✨ 功能特性

- **CLI 一键生成** - 交互式创建扩展项目
- **多供应商预设** - 内置 GLM、DeepSeek、Qwen、MiniMax、OpenAI、Anthropic 配置
- **动态模型获取** - 自动从 API 获取可用模型列表
- **即用型模板** - 复制模板即可快速创建自定义 Copilot 扩展
- **轻量 SDK** - 核心 SDK 无 VS Code 依赖，可在任何 Node.js 环境使用

### 架构

```markdown
all-in-copilot/
├── packages/
│ └── sdk/ # 核心 SDK
│ └── src/
│ ├── core/ # 类型定义、模型获取
│ └── vscode/ # VS Code 提供者助手
│
├── templates/ # 扩展模板
│ ├── base-template/ # 自定义提供者的基础模板
│ ├── glm-template/ # GLM (智谱AI) 示例
│ ├── minimax-template/ # MiniMax 示例
│ ├── kimi-template/ # Kimi K2 (月之暗面) 示例
│ ├── mimo-template/ # 小米 MiMo 示例
│ └── aliyun-coding-template/ # 阿里云百炼编程计划示例
│
└── cli/ # 项目生成 CLI
└── src/
└── index.ts
```

### 快速开始

#### 方法 1：使用 CLI（推荐）

```bash
# 全局安装 CLI
npm install -g @all-in-copilot/cli

# 交互式创建新项目
all-in-copilot

# 或使用简短命令
aic create my-copilot
```

#### 方法 2：复制模板

```bash
# 复制模板
cp -r templates/glm-template my-copilot
cd my-copilot

# 编辑配置
vim src/config.ts

# 安装依赖
npm install

# 编译并测试（在 VS Code 中按 F5）
npm run compile
```

### CLI 命令

```bash
all-in-copilot              # 交互模式
all-in-copilot create NAME  # 使用提示创建项目
all-in-copilot list         # 列出可用预设
all-in-copilot help         # 显示帮助
```

### 可用预设

| 预设      | 提供商          | API 格式  |
| --------- | --------------- | --------- |
| glm       | GLM (智谱AI)    | OpenAI    |
| minimax   | MiniMax         | Anthropic |
| kimi      | Kimi (月之暗面) | Anthropic |
| mimo      | 小米 MiMo       | Anthropic |
| deepseek  | DeepSeek        | OpenAI    |
| qwen      | Qwen (通义千问) | OpenAI    |
| openai    | OpenAI          | OpenAI    |
| anthropic | Anthropic       | Anthropic |
| custom    | 自定义          | OpenAI    |

### 提供者配置

编辑 `src/config.ts` 来自定义你的提供者：

```typescript
export const PROVIDER_CONFIG: ProviderConfig = {
	id: "provider-id", // 提供者 ID
	name: "Provider Name", // 显示名称
	baseUrl: "https://api.example.com/v1/chat/completions", // API 地址
	apiKeySecret: "extension-name.apiKey", // API 密钥存储键
	family: "provider-family", // 模型系列
	apiMode: "openai", // API 模式：'openai' | 'anthropic' | 'gemini' | 'ollama'
	supportsTools: true, // 是否支持工具调用
	supportsVision: false, // 是否支持图像
	defaultMaxOutputTokens: 4096,
	defaultContextLength: 32768,
	dynamicModels: true, // 是否动态获取模型
	modelsCacheTTL: 5 * 60 * 1000, // 模型缓存时间
};

export const FALLBACK_MODELS: ModelConfig[] = [
	{
		id: "model-1",
		name: "Model 1",
		maxInputTokens: 30000,
		maxOutputTokens: 4096,
		supportsTools: true,
		supportsVision: false,
	},
];

// 可选：过滤要显示的模型
export function filterModels(models: ModelConfig[]): ModelConfig[] {
	return models.filter((m) => m.id.includes("chat"));
}
```

### SDK 使用

```typescript
import {
	convertToOpenAI,
	convertToolsToOpenAI,
	processOpenAIStream,
	fetchModelsFromAPI,
	estimateTokens,
} from "@all-in-copilot/sdk";

// 动态模型获取
const providerConfig: ProviderConfig = {
	id: "my-provider",
	name: "My Provider",
	baseUrl: "https://api.example.com/v1",
	// ... 其他配置
};

const models = await fetchModels(providerConfig, { apiKey: "your-api-key" });
console.log("可用模型:", models);

// 使用 OpenAI 兼容的提供者
const provider = new OpenAIProvider(providerConfig, { apiKey: "your-api-key" });
for (const model of models) {
	provider.registerModel(model);
}

const response = await provider.complete({
	model: models[0].id,
	messages: [{ role: "user", content: "Hello!" }],
});
```

### 开发

#### 构建 SDK

```bash
cd packages/sdk
npm run build
```

#### 构建 VS Code 扩展

```bash
cd templates/minimax-template
npm run compile
```

#### 监视模式

```bash
# 终端 1
cd packages/sdk && npm run watch

# 终端 2
cd templates/minimax-template && npm run watch
```

### CI/CD 和发布

#### 需要配置的 GitHub Secrets

在仓库设置中添加以下 Secrets：

| Secret     | 描述                         |
| ---------- | ---------------------------- |
| `VSCE_PAT` | VS Code 插件市场个人访问令牌 |
| `OVSX_PAT` | Open VSX 注册表令牌（可选）  |

#### 工作流

| 工作流             | 触发条件                       | 描述                               |
| ------------------ | ------------------------------ | ---------------------------------- |
| **CI**             | Push/PR 到 `main`              | 构建 SDK、CLI 和所有模板，运行测试 |
| **Release**        | Tag 推送 (`v*`) / 手动         | 发布正式版或预发布版到插件市场     |
| **Pre-release**    | Push 到 `pre-release/*` / 手动 | 发布预发布版本                     |
| **Publish Single** | 仅手动                         | 手动发布单个插件                   |

#### 发布流程

**正式发布：**

```bash
# 1. 更新版本号
cd templates/glm-template
npm version patch  # 或 minor / major

# 2. 提交并创建 tag
git add .
git commit -m "chore: bump glm-template to v0.2.0"
git tag glm-template-v0.2.0
git push origin main --tags
```

**预发布：**

```bash
# 方法 1：使用 Tag
git tag glm-template-v0.2.0-beta.1
git push origin --tags

# 方法 2：使用分支
git checkout -b pre-release/glm-template
git push origin pre-release/glm-template

# 方法 3：通过 GitHub Actions 手动触发
```

#### Tag 命名规范

| 模式                                     | 触发         | 示例                  |
| ---------------------------------------- | ------------ | --------------------- |
| `v*`                                     | 发布所有模板 | `v1.0.0`              |
| `<template>-v*`                          | 发布指定模板 | `glm-template-v0.2.0` |
| `*-pre*`, `*-alpha*`, `*-beta*`, `*-rc*` | 预发布       | `v1.0.0-beta.1`       |

### 模板

| 模板        | Base URL                                                | API 模式         | 动态模型 |
| ----------- | ------------------------------------------------------- | ---------------- | -------- |
| **GLM**     | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | OpenAI           | ✅       |
| **MiniMax** | `https://api.minimaxi.com/anthropic/v1/messages`        | Anthropic        | ❌       |
| **Kimi**    | `https://api.moonshot.cn/anthropic`                     | Anthropic        | ❌       |
| **MiMo**    | `https://api.xiaomimimo.com/anthropic/v1/messages`      | Anthropic        | ❌       |
| **Aliyun Coding Plan** | `https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages` | Anthropic | ❌ |
| **Base**    | 自定义                                                  | OpenAI/Anthropic | ✅       |

### 动态模型获取工作原理

```text
提供者 API (/models)
       ↓
   获取 + 缓存
       ↓
 filterModels()
       ↓
VS Code 模型列表
```

1. 扩展调用提供者 API 的 `/models` 端点
2. 响应被解析并转换为 `ModelConfig[]`
3. 模型被缓存 `modelsCacheTTL` 毫秒
4. 如果获取失败，回退到 `FALLBACK_MODELS`
5. 可选的 `filterModels()` 函数过滤要显示的模型

---

## Acknowledgments / 致谢

This project is inspired by and references the following excellent open source projects:

本项目受到以下优秀开源项目的启发和参考：

### Core References / 核心参考

| Project                                                                 | Description                                                                                                                                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [vscode-copilot-chat](https://github.com/microsoft/vscode-copilot-chat) | Microsoft's official GitHub Copilot Chat extension - the authoritative reference for VS Code Chat API usage / 微软官方 GitHub Copilot Chat 扩展 - VS Code Chat API 使用的权威参考 |
| [vscode](https://github.com/microsoft/vscode)                           | Visual Studio Code source code - for understanding VS Code extension APIs / VS Code 源代码 - 用于理解 VS Code 扩展 API                                                            |

### Community Projects / 社区项目

| Project                                                                           | Description                                                                                                                |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [oai-compatible-copilot](https://github.com/AzurCodin/oai-compatible-copilot)     | OpenAI-compatible Copilot - early exploration of custom model integration / OpenAI 兼容 Copilot - 自定义模型集成的早期探索 |
| [huggingface-vscode-chat](https://github.com/huggingface/huggingface-vscode-chat) | HuggingFace's VS Code Chat extension / HuggingFace 的 VS Code Chat 扩展                                                    |
| [addi](https://github.com/deepwn/addi)                                            | AI-powered development assistant with MCP integration / 带 MCP 集成的 AI 开发助手                                          |
| [ChatGLM-vscode-chat](https://github.com/AzurCodin/ChatGLM-vscode-chat)           | ChatGLM VS Code extension - GLM model integration reference / ChatGLM VS Code 扩展 - GLM 模型集成参考                      |

### AI Providers / AI 服务提供商

Special thanks to the following AI providers for their excellent APIs:

特别感谢以下 AI 服务提供商提供的优秀 API：

- [智谱AI (Zhipu AI)](https://open.bigmodel.cn/) - GLM series models / GLM 系列模型
- [Moonshot AI (月之暗面)](https://platform.moonshot.cn/) - Kimi K2 models / Kimi K2 模型
- [MiniMax](https://www.minimax.chat/) - M2 series models / M2 系列模型
- [Xiaomi MiMo (小米)](https://xiaomimimo.com/) - MiMo models / MiMo 模型
- [OpenAI](https://openai.com/) - GPT models / GPT 模型
- [Anthropic](https://anthropic.com/) - Claude models / Claude 模型
- [Google](https://ai.google.dev/) - Gemini models / Gemini 模型

### Documentation / 文档参考

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Chat Extension Guide](https://code.visualstudio.com/api/extension-guides/chat)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Anthropic API Reference](https://docs.anthropic.com/en/api)

## Contributing / 贡献

Contributions are welcome! Please feel free to submit a Pull Request.

欢迎贡献！请随时提交 Pull Request。

## License / 许可证

MIT
