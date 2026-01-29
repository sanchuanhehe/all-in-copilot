# All-In Copilot

Multi-API LLM VSCode extension framework with SDK and CLI build tools.

## ✨ Features

- **动态模型获取**: 自动从 LLM 提供商 API 获取可用模型列表
- **多提供商支持**: 内置 MiniMax、GLM（智谱）、OpenAI、Anthropic 支持
- **即用型模板**: 复制模板即可快速创建自定义 Copilot 扩展
- **SDK 分离**: 核心 SDK 无 VSCode 依赖，可在任何 Node.js 环境使用

## Architecture

```
all-in-copilot/
├── packages/
│   ├── sdk/              # Core SDK (no VSCode dependencies)
│   │   └── src/
│   │       ├── core/     # Types, model fetcher
│   │       ├── providers/ # OpenAI, Anthropic providers
│   │       └── utils/    # Token counter, message converter
│   │
│   └── vscode/           # VSCode plugin wrapper
│       └── src/
│
├── templates/            # Extension templates (dynamic models)
│   ├── minimax-template/ # MiniMax API
│   ├── glm-template/     # GLM (智谱AI) API
│   └── base-template/    # Custom provider base
│
└── cli/                  # Build CLI tool
    └── build.ts          # One-click extension builder
```

## Quick Start

### 1. Use Pre-built Templates

Copy a template and modify `src/config.ts`:

```bash
# Copy template
cp -r templates/minimax-template my-copilot
cd my-copilot

# Edit configuration
vim src/config.ts

# Install dependencies
npm install

# Compile
npm run compile

# Test in VSCode (F5)
```

### 2. Provider Configuration

Edit `src/config.ts` to customize your provider:

```typescript
export const PROVIDER_CONFIG: ProviderConfig = {
  id: 'provider-id',
  name: 'Provider Name',
  baseUrl: 'https://api.example.com/v1/chat/completions',
  apiKeySecret: 'extension-name.apiKey',
  family: 'provider-family',
  supportsTools: true,
  supportsVision: false,
  defaultMaxOutputTokens: 4096,
  defaultContextLength: 32768,
  // 🆕 Enable dynamic model fetching
  dynamicModels: true,
  modelsCacheTTL: 5 * 60 * 1000, // Cache for 5 minutes
};

// Fallback models (used when dynamic fetch fails)
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

### 3. Use SDK Directly

```typescript
import { OpenAIProvider, fetchModels, type ProviderConfig } from '@all-in-copilot/sdk';

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

## Templates

### MiniMax Template
- **Base URL**: `https://api.minimax.chat/v1/text/chatcompletion_v2`
- **Dynamic Models**: ✅ Enabled
- **Fallback Models**: abab6.5s-chat, abab6.5-chat, abab5.5-chat

### GLM Template (智谱AI)
- **Base URL**: `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- **Dynamic Models**: ✅ Enabled
- **Fallback Models**: GLM-4 Plus, GLM-4, GLM-4V, GLM-3 Turbo

### Base Template
- **Purpose**: Blank template for custom providers
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
