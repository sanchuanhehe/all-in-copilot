# All-In Copilot 贡献者指南

[English](#english) | [中文](#中文)

---

## English

This document describes how to contribute to All-In Copilot by adding new LLM providers, templates, and extensions.

### Overview

All-In Copilot is a VS Code extension framework that supports multiple LLM providers. The architecture consists of:

```
all-in-copilot/
├── packages/
│   └── sdk/              # Core SDK with provider abstractions
│       └── src/
│           ├── core/     # Types, interfaces, model fetchers
│           └── vscode/   # VS Code extension helpers
├── templates/            # Ready-to-use extension templates
│   ├── base-template/    # Generic template for custom providers
│   ├── glm-template/     # GLM (智谱AI) example
│   ├── minimax-template/ # MiniMax example
│   ├── kimi-template/    # Kimi (Moonshot) example
│   └── mimo-template/    # Xiaomi MiMo example
└── cli/                  # Project generator CLI
```

### Adding a New LLM Provider

#### Step 1: Create a Model Fetcher

Create a new file in `packages/sdk/src/core/fetchers/`:

```typescript
// packages/sdk/src/core/fetchers/myprovider.ts
import type { ModelInfo } from "../types.js";

export async function fetchMyProviderModels(apiKey: string): Promise<ModelInfo[]> {
	const response = await fetch("https://api.myprovider.com/models", {
		headers: { Authorization: `Bearer ${apiKey}` },
	});

	const data = await response.json();
	return data.models.map((model: any) => ({
		id: model.id,
		name: model.name,
		maxInputTokens: model.context_length,
		maxOutputTokens: model.max_tokens,
		supportsToolCalls: model.supports_tools,
	}));
}
```

#### Step 2: Add Provider Configuration

Update `packages/sdk/src/core/config.ts`:

```typescript
export interface ProviderConfig {
	name: string;
	baseUrl: string;
	apiFormat: "openai" | "anthropic";
	modelFetcher: (apiKey: string) => Promise<ModelInfo[]>;
	defaultModels: string[];
}

export const PROVIDERS: Record<string, ProviderConfig> = {
	myprovider: {
		name: "MyProvider",
		baseUrl: "https://api.myprovider.com/v1",
		apiFormat: "openai",
		modelFetcher: fetchMyProviderModels,
		defaultModels: ["model-1", "model-2"],
	},
	// ... existing providers
};
```

#### Step 3: Create a Template

Copy `templates/base-template/` to `templates/myprovider-template/` and update:

1. `src/config.ts` - Provider configuration
2. `package.json` - Extension metadata
3. `README.md` - Documentation

#### Step 4: Update CLI

Update `cli/src/presets.ts` to include your new provider:

```typescript
export const PRESETS = [
	{ id: "myprovider", name: "MyProvider", config: "myprovider" },
	// ... existing presets
];
```

### SDK Usage

#### Basic Setup

```typescript
import { AllInCopilot } from "@all-in-copilot/sdk";

const copilot = new AllInCopilot({
	provider: "openai",
	apiKey: process.env.OPENAI_API_KEY,
	model: "gpt-4",
});

// Stream responses
for await (const chunk of copilot.stream("Hello, world!")) {
	process.stdout.write(chunk);
}
```

#### VS Code Extension Integration

```typescript
import { registerChatProvider } from "@all-in-copilot/sdk/vscode";

export function activate(context: vscode.ExtensionContext) {
	const disposable = registerChatProvider("my-extension", {
		provider: "openai",
		apiKey: context.secrets.get("openai-api-key"),
		defaultModel: "gpt-4",
	});

	context.subscriptions.push(disposable);
}
```

### Template Customization

Each template supports the following customizations in `src/config.ts`:

```typescript
export interface ExtensionConfig {
	// Provider settings
	provider: {
		id: string;
		name: string;
		apiFormat: "openai" | "anthropic";
		baseUrl: string;
	};

	// Model settings
	model: {
		id: string;
		maxInputTokens: number;
		maxOutputTokens: number;
	};

	// UI settings
	ui: {
		chatTitle: string;
		welcomeMessage: string;
	};
}
```

### Testing

#### Unit Tests

```bash
# Run SDK tests
pnpm test

# Run with coverage
pnpm test -- --coverage
```

#### Manual Testing

1. Open the template in VS Code: `code templates/my-template`
2. Press F5 to launch Extension Development Host
3. Test the extension in the new window

#### Integration Tests

Create test files in `packages/sdk/src/__tests__/`:

```typescript
import { describe, it, expect } from "vitest";
import { fetchModels } from "../core/fetchers/myprovider";

describe("MyProvider Fetcher", () => {
	it("should fetch models", async () => {
		const models = await fetchModels("test-api-key");
		expect(models).toBeInstanceOf(Array);
		expect(models[0]).toHaveProperty("id");
	});
});
```

### CI/CD Pipeline

The project uses GitHub Actions for CI/CD. Key workflows:

- **CI** (`ci.yml`) - Runs on every PR: lint, type check, test
- **Pre-release** (`pre-release.yml`) - Creates pre-release builds
- **Release** (`release.yml`) - Publishes to VS Code Marketplace

#### Adding New Workflow Steps

Edit `.github/workflows/ci.yml`:

```yaml
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Run linter
        run: pnpm lint

      - name: Run type check
        run: pnpm build:sdk

      - name: Run tests
        run: pnpm test
```

### Code Style

- TypeScript strict mode enabled
- Prettier for formatting
- ESLint for linting

```bash
# Format code
pnpm format

# Lint code
pnpm lint
```

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes and add tests
4. Run `pnpm lint` and `pnpm test`
5. Commit changes: `git commit -m "Add my provider support"`
6. Push and create a PR

---

## 中文

本指南描述如何通过添加新的 LLM 提供者、模板和扩展来为 All-In Copilot 做贡献。

### 项目概述

All-In Copilot 是一个支持多种 LLM 提供者的 VS Code 扩展框架。架构如下：

```
all-in-copilot/
├── packages/
│   └── sdk/              # 包含提供者抽象的核心 SDK
│       └── src/
│           ├── core/     # 类型、接口、模型获取器
│           └── vscode/   # VS Code 扩展助手
├── templates/            # 可立即使用的扩展模板
│   ├── base-template/    # 自定义提供者的通用模板
│   ├── glm-template/     # GLM (智谱AI) 示例
│   ├── minimax-template/ # MiniMax 示例
│   ├── kimi-template/    # Kimi (Moonshot) 示例
│   └── mimo-template/    # 小米 MiMo 示例
└── cli/                  # 项目生成 CLI
```

### 添加新的 LLM 提供者

#### 第 1 步：创建模型获取器

在 `packages/sdk/src/core/fetchers/` 中创建新文件：

```typescript
// packages/sdk/src/core/fetchers/myprovider.ts
import type { ModelInfo } from "../types.js";

export async function fetchMyProviderModels(apiKey: string): Promise<ModelInfo[]> {
	const response = await fetch("https://api.myprovider.com/models", {
		headers: { Authorization: `Bearer ${apiKey}` },
	});

	const data = await response.json();
	return data.models.map((model: any) => ({
		id: model.id,
		name: model.name,
		maxInputTokens: model.context_length,
		maxOutputTokens: model.max_tokens,
		supportsToolCalls: model.supports_tools,
	}));
}
```

#### 第 2 步：添加提供者配置

更新 `packages/sdk/src/core/config.ts`：

```typescript
export interface ProviderConfig {
	name: string;
	baseUrl: string;
	apiFormat: "openai" | "anthropic";
	modelFetcher: (apiKey: string) => Promise<ModelInfo[]>;
	defaultModels: string[];
}

export const PROVIDERS: Record<string, ProviderConfig> = {
	myprovider: {
		name: "MyProvider",
		baseUrl: "https://api.myprovider.com/v1",
		apiFormat: "openai",
		modelFetcher: fetchMyProviderModels,
		defaultModels: ["model-1", "model-2"],
	},
	// ... 现有提供者
};
```

#### 第 3 步：创建模板

复制 `templates/base-template/` 到 `templates/myprovider-template/` 并更新：

1. `src/config.ts` - 提供者配置
2. `package.json` - 扩展元数据
3. `README.md` - 文档

#### 第 4 步：更新 CLI

更新 `cli/src/presets.ts` 以包含新提供者：

```typescript
export const PRESETS = [
	{ id: "myprovider", name: "MyProvider", config: "myprovider" },
	// ... 现有预设
];
```

### SDK 使用

#### 基础设置

```typescript
import { AllInCopilot } from "@all-in-copilot/sdk";

const copilot = new AllInCopilot({
	provider: "openai",
	apiKey: process.env.OPENAI_API_KEY,
	model: "gpt-4",
});

// 流式响应
for await (const chunk of copilot.stream("你好，世界！")) {
	process.stdout.write(chunk);
}
```

#### VS Code 扩展集成

```typescript
import { registerChatProvider } from "@all-in-copilot/sdk/vscode";

export function activate(context: vscode.ExtensionContext) {
	const disposable = registerChatProvider("my-extension", {
		provider: "openai",
		apiKey: context.secrets.get("openai-api-key"),
		defaultModel: "gpt-4",
	});

	context.subscriptions.push(disposable);
}
```

### 模板定制

每个模板支持在 `src/config.ts` 中进行以下定制：

```typescript
export interface ExtensionConfig {
	// 提供者设置
	provider: {
		id: string;
		name: string;
		apiFormat: "openai" | "anthropic";
		baseUrl: string;
	};

	// 模型设置
	model: {
		id: string;
		maxInputTokens: number;
		maxOutputTokens: number;
	};

	// UI 设置
	ui: {
		chatTitle: string;
		welcomeMessage: string;
	};
}
```

### 测试

#### 单元测试

```bash
# 运行 SDK 测试
pnpm test

# 运行覆盖率测试
pnpm test -- --coverage
```

#### 手动测试

1. 在 VS Code 中打开模板: `code templates/my-template`
2. 按 F5 启动扩展开发主机
3. 在新窗口中测试扩展

#### 集成测试

在 `packages/sdk/src/__tests__/` 中创建测试文件：

```typescript
import { describe, it, expect } from "vitest";
import { fetchModels } from "../core/fetchers/myprovider";

describe("MyProvider Fetcher", () => {
	it("应该获取模型列表", async () => {
		const models = await fetchModels("test-api-key");
		expect(models).toBeInstanceOf(Array);
		expect(models[0]).toHaveProperty("id");
	});
});
```

### CI/CD 流程

项目使用 GitHub Actions 进行 CI/CD。主要工作流程：

- **CI** (`ci.yml`) - 每次 PR 时运行：lint、类型检查、测试
- **Pre-release** (`pre-release.yml`) - 创建预发布版本
- **Release** (`release.yml`) - 发布到 VS Code 市场

#### 添加新的工作流程步骤

编辑 `.github/workflows/ci.yml`：

```yaml
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: 安装依赖
        run: pnpm install

      - name: 运行 linter
        run: pnpm lint

      - name: 运行类型检查
        run: pnpm build:sdk

      - name: 运行测试
        run: pnpm test
```

### 代码风格

- 启用 TypeScript 严格模式
- 使用 Prettier 格式化
- 使用 ESLint 检查

```bash
# 格式化代码
pnpm format

# 检查代码
pnpm lint
```

### Pull Request 流程

1. Fork 本仓库
2. 创建功能分支: `git checkout -b feature/my-feature`
3. 做出更改并添加测试
4. 运行 `pnpm lint` 和 `pnpm test`
5. 提交更改: `git commit -m "添加我的提供者支持"`
6. 推送并创建 PR

---

## 常见问题

### Q: 如何添加对自定义 API 的支持？

A: 使用 `base-template` 并在 `src/config.ts` 中配置您的 API 设置。只需提供正确的 baseUrl 和 API 格式。

### Q: 支持流式响应吗？

A: 是的，所有模板都支持流式响应。SDK 提供 `stream()` 方法进行流式输出。

### Q: 如何测试我的扩展？

A: 在 VS Code 中打开模板目录，按 F5 启动扩展开发主机进行测试。

### Q: 可以贡献多语言支持吗？

A: 当然可以！请在 `package.json` 中添加本地化文件，并在 README.md 中添加语言选项。

---

## 相关资源

- [VS Code Extension API](https://code.visualstudio.com/api)
- [All-In Copilot GitHub](https://github.com/sanchuanhehe/all-in-copilot)
- [VS Code Marketplace](https://marketplace.visualstudio.com/)

---

_最后更新: 2026年1月_
