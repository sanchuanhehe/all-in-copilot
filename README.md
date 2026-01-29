# All-In Copilot

Multi-API LLM VSCode extension framework with SDK and CLI build tools.

## Architecture

```
all-in-copilot/
├── packages/
│   ├── sdk/              # Core SDK (no VSCode dependencies)
│   │   └── src/
│   │       ├── core/     # Abstract interfaces and types
│   │       ├── providers/ # Provider implementations
│   │       └── utils/    # Utility functions
│   │
│   └── vscode/           # VSCode plugin wrapper
│       └── src/
│
├── templates/            # Extension templates
│   ├── minimax-template/
│   ├── glm-template/
│   └── base-template/
│
└── cli/                  # Build CLI tool
    └── build.js          # One-click extension builder
```

## Usage

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

### 2. Use CLI Build Tool

```bash
# Run interactive builder
npm run create

# Or directly
node cli/build.js
```

### 3. Use SDK in Your Project

```typescript
import { OpenAICompatibleProvider, type ModelConfig } from '@all-in-copilot/sdk';

const provider = OpenAICompatibleProvider.withModels(
  {
    id: 'my-provider',
    name: 'My Provider',
    baseUrl: 'https://api.example.com/v1/chat/completions',
    apiKeySecret: 'my-extension.apiKey',
    family: 'custom',
    supportsTools: true,
    supportsVision: false,
    defaultMaxOutputTokens: 4096,
    defaultContextLength: 32768,
  },
  [
    {
      id: 'my-model',
      name: 'My Model',
      maxInputTokens: 30000,
      maxOutputTokens: 4096,
      supportsTools: true,
      supportsVision: false,
    },
  ]
);

// Use the provider
const response = await provider.complete({
  model: 'my-model',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

## Provider Configuration

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
};

export const STATIC_MODELS: ModelConfig[] = [
  {
    id: 'model-1',
    name: 'Model 1',
    maxInputTokens: 30000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
  },
];
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

### Minimax Template
- Base URL: `https://api.minimax.chat/v1/text/chatcompletion_v2`
- Models: abab6.5s-chat, abab6.5-chat, abab5.5-chat

### GLM Template
- Base URL: `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- Models: GLM-4 Plus, GLM-4, GLM-4V, GLM-3 Turbo

### Base Template
- Blank template for custom providers
- Edit `src/config.ts` to configure your provider

## License

MIT
* Inference Providers documentation: https://huggingface.co/docs/inference-providers/index
* VS Code Chat Provider API: https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider

---

## Support & License
* Open issues: https://github.com/huggingface/huggingface-vscode-chat/issues
* License: MIT License Copyright (c) 2025 Hugging Face
