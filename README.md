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
| minimax   | MiniMax        | OpenAI     |
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
