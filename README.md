# All-In Copilot

🚀 SDK & CLI for building VS Code Chat extensions with custom LLM providers.

## ✨ Features

- **CLI 一键生成**: 交互式创建扩展项目
- **多供应商预设**: 内置 GLM、DeepSeek、Qwen、MiniMax、OpenAI、Anthropic 配置
- **动态模型获取**: 自动从 API 获取可用模型列表
- **即用型模板**: 复制模板即可快速创建自定义 Copilot 扩展
- **轻量 SDK**: 核心 SDK 无 VS Code 依赖，可在任何 Node.js 环境使用

## Architecture

```
all-in-copilot/
├── packages/
│   └── sdk/              # Core SDK
│       └── src/
│           ├── core/     # Types, model fetcher
│           └── vscode/   # VS Code provider helpers
│
├── templates/            # Extension templates
│   ├── base-template/    # Base template for custom providers
│   ├── glm-template/     # GLM (智谱AI) example
│   └── minimax-template/ # MiniMax example
│
└── cli/                  # Project generator CLI
    └── src/
        └── index.ts
```

## Quick Start

### Method 1: Use CLI (Recommended)

```bash
# Install CLI globally
npm install -g @all-in-copilot/cli

# Create a new project interactively
all-in-copilot

# Or with short command
aic create my-copilot
```

### Method 2: Copy Template

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

## CLI Commands

```bash
all-in-copilot              # Interactive mode
all-in-copilot create NAME  # Create project with prompts
all-in-copilot list         # List available presets
all-in-copilot help         # Show help
```

### Available Presets

| Preset    | Provider       | API Format |
|-----------|----------------|------------|
| glm       | GLM (智谱AI)   | OpenAI     |
| minimax   | MiniMax        | Anthropic  |
| kimi      | Kimi (Moonshot)| Anthropic  |
| mimo      | Xiaomi MiMo    | Anthropic  |
| deepseek  | DeepSeek       | OpenAI     |
| qwen      | Qwen (通义千问) | OpenAI     |
| openai    | OpenAI         | OpenAI     |
| anthropic | Anthropic      | Anthropic  |
| custom    | Custom         | OpenAI     |

## Provider Configuration

Edit `src/config.ts` to customize your provider:

```typescript
export const PROVIDER_CONFIG: ProviderConfig = {
  id: 'provider-id',
  name: 'Provider Name',
  baseUrl: 'https://api.example.com/v1/chat/completions',
  apiKeySecret: 'extension-name.apiKey',
  family: 'provider-family',
  apiMode: 'openai',  // 'openai' | 'anthropic' | 'gemini' | 'ollama'
  supportsTools: true,
  supportsVision: false,
  defaultMaxOutputTokens: 4096,
  defaultContextLength: 32768,
  dynamicModels: true,
  modelsCacheTTL: 5 * 60 * 1000,
};

export const FALLBACK_MODELS: ModelConfig[] = [
  {
    id: 'model-1',
    name: 'Model 1',
    maxInputTokens: 30000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
  },
];

// Optional: Filter which models to display
export function filterModels(models: ModelConfig[]): ModelConfig[] {
  return models.filter(m => m.id.includes('chat'));
}
```

## SDK Usage

```typescript
import {
  convertToOpenAI,
  convertToolsToOpenAI,
  processOpenAIStream,
  fetchModelsFromAPI,
  estimateTokens,
} from '@all-in-copilot/sdk';
```

// Dynamic model fetching
const providerConfig: ProviderConfig = {
  id: 'my-provider',
  name: 'My Provider',
  baseUrl: 'https://api.example.com/v1',
  // ... other config
};

const models = await fetchModels(providerConfig, { apiKey: 'your-api-key' });
console.log('Available models:', models);

// Use OpenAI-compatible provider
const provider = new OpenAIProvider(providerConfig, { apiKey: 'your-api-key' });
for (const model of models) {
  provider.registerModel(model);
}

const response = await provider.complete({
  model: models[0].id,
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

## Development

### Build SDK

```bash
cd packages/sdk
npm run build
```

### Build VSCode Extension

```bash
cd packages/vscode
npm run compile
```

### Watch Mode

```bash
# Terminal 1
cd packages/sdk && npm run watch

# Terminal 2
cd packages/vscode && npm run watch
```

## CI/CD & Publishing

### GitHub Secrets Required

在仓库设置中添加以下 Secrets：

| Secret | Description |
|--------|-------------|
| `VSCE_PAT` | VS Code Marketplace Personal Access Token |
| `OVSX_PAT` | Open VSX Registry Token (可选) |

### Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| **CI** | Push/PR to `main` | 构建 SDK、CLI 和所有模板，运行测试 |
| **Release** | Tag push (`v*`) / Manual | 发布正式版或预发布版到插件市场 |
| **Pre-release** | Push to `pre-release/*` / Manual | 发布预发布版本 |
| **Publish Single** | Manual only | 手动发布单个插件 |

### Release Process

#### 正式发布 (Stable Release)

```bash
# 1. 更新版本号
cd templates/glm-template
npm version patch  # or minor / major

# 2. 提交并创建 tag
git add .
git commit -m "chore: bump glm-template to v0.2.0"
git tag glm-template-v0.2.0
git push origin main --tags
```

#### 预发布 (Pre-release)

**方法 1: 使用 Tag**
```bash
git tag glm-template-v0.2.0-beta.1
git push origin --tags
```

**方法 2: 使用分支**
```bash
git checkout -b pre-release/glm-template
git push origin pre-release/glm-template
```

**方法 3: 手动触发**
1. 打开 GitHub Actions
2. 选择 "Pre-release" workflow
3. 点击 "Run workflow"
4. 选择模板和选项

#### 全部发布

```bash
# 发布所有模板的正式版
git tag v1.0.0
git push origin --tags

# 或通过 workflow_dispatch 手动触发
```

### Tag 命名规范

| Pattern | 触发 | 示例 |
|---------|------|------|
| `v*` | 发布所有模板 | `v1.0.0` |
| `<template>-v*` | 发布指定模板 | `glm-template-v0.2.0` |
| `*-pre*`, `*-alpha*`, `*-beta*`, `*-rc*` | 预发布 | `v1.0.0-beta.1` |

## Templates

### MiniMax Template
- **Base URL**: `https://api.minimaxi.com/anthropic/v1/messages`
- **API Mode**: Anthropic (使用 Anthropic 兼容接口)
- **Dynamic Models**: ❌ Disabled (使用预定义模型列表)
- **Fallback Models**: MiniMax-M2.1, MiniMax-M2.1-lightning, MiniMax-M2

### Kimi Template (Moonshot)
- **Base URL**: `https://api.moonshot.cn/anthropic`
- **API Mode**: Anthropic (Kimi K2 系列)
- **Dynamic Models**: ❌ Disabled
- **Models**: kimi-k2-thinking-turbo, kimi-k2-thinking, kimi-k2-turbo-preview, kimi-k2-0905-preview

### MiMo Template (Xiaomi)
- **Base URL**: `https://api.xiaomimimo.com/anthropic/v1/messages`
- **API Mode**: Anthropic
- **Dynamic Models**: ❌ Disabled
- **Models**: mimo-v2-flash

### GLM Template (智谱AI)
- **Base URL**: `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- **API Mode**: OpenAI (也支持 Anthropic 模式用于 GLM Coding Plan)
- **Anthropic URL**: `https://open.bigmodel.cn/api/anthropic`
- **Dynamic Models**: ✅ Enabled (OpenAI 模式)
- **Fallback Models**: GLM-4 Plus, GLM-4, GLM-4V, GLM-3 Turbo

### Base Template
- **Purpose**: Blank template for custom providers
- **API Mode**: Supports both OpenAI and Anthropic formats
- **Dynamic Models**: ✅ Enabled (set `dynamicModels: true` in config)
- **Edit**: `src/config.ts` to configure your provider

## How Dynamic Model Fetching Works

1. Extension calls `/models` endpoint on provider's API
2. Response is parsed and converted to `ModelConfig[]`
3. Models are cached for `modelsCacheTTL` milliseconds
4. If fetch fails, fallback to `FALLBACK_MODELS`
5. Optional `filterModels()` function filters displayed models

```
Provider API (/models)
       ↓
   fetch + cache
       ↓
 filterModels()
       ↓
VS Code Model List
```

## License

MIT
