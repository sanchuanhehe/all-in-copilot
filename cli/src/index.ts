#!/usr/bin/env node
/**
 * All-In Copilot CLI
 * Create VS Code Chat extensions with custom LLM providers
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// Types
// ============================================================================

interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeySecret: string;
  family: string;
  apiMode: 'openai' | 'anthropic' | 'gemini' | 'ollama';
  supportsTools: boolean;
  supportsVision: boolean;
  defaultMaxOutputTokens: number;
  defaultContextLength: number;
  dynamicModels: boolean;
  modelsCacheTTL: number;
}

interface ModelConfig {
  id: string;
  name: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
}

interface ProjectConfig {
  name: string;
  displayName: string;
  description: string;
  publisher: string;
  template: string;
  provider: ProviderConfig;
  models: ModelConfig[];
}

// ============================================================================
// Preset Provider Configurations
// ============================================================================

const PRESETS: Record<string, { provider: ProviderConfig; models: ModelConfig[] }> = {
  glm: {
    provider: {
      id: 'glm',
      name: 'GLM (智谱AI)',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      apiKeySecret: '', // Will be set based on project name
      family: 'glm',
      apiMode: 'openai',
      supportsTools: true,
      supportsVision: true,
      defaultMaxOutputTokens: 8192,
      defaultContextLength: 128000,
      dynamicModels: true,
      modelsCacheTTL: 300000,
    },
    models: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus', maxInputTokens: 120000, maxOutputTokens: 8192, supportsTools: true, supportsVision: true },
      { id: 'glm-4', name: 'GLM-4', maxInputTokens: 128000, maxOutputTokens: 8192, supportsTools: true, supportsVision: true },
      { id: 'glm-4v', name: 'GLM-4V (Vision)', maxInputTokens: 8000, maxOutputTokens: 4096, supportsTools: false, supportsVision: true },
      { id: 'glm-3-turbo', name: 'GLM-3 Turbo', maxInputTokens: 16000, maxOutputTokens: 4096, supportsTools: true, supportsVision: false },
    ],
  },
  minimax: {
    provider: {
      id: 'minimax',
      name: 'MiniMax',
      // MiniMax Anthropic-compatible API
      // https://platform.minimaxi.com/docs/api-reference/text-anthropic-api
      baseUrl: 'https://api.minimaxi.com/anthropic/v1/messages',
      apiKeySecret: '',
      family: 'minimax',
      apiMode: 'anthropic',  // Uses Anthropic-compatible API
      supportsTools: true,
      supportsVision: false,
      defaultMaxOutputTokens: 8192,
      defaultContextLength: 100000,
      dynamicModels: false,
      modelsCacheTTL: 300000,
    },
    models: [
      { id: 'MiniMax-M2.1', name: 'MiniMax M2.1', maxInputTokens: 100000, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
      { id: 'MiniMax-M2.1-lightning', name: 'MiniMax M2.1 Lightning', maxInputTokens: 100000, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
      { id: 'MiniMax-M2', name: 'MiniMax M2', maxInputTokens: 100000, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
    ],
  },
  deepseek: {
    provider: {
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1/chat/completions',
      apiKeySecret: '',
      family: 'deepseek',
      apiMode: 'openai',
      supportsTools: true,
      supportsVision: false,
      defaultMaxOutputTokens: 8192,
      defaultContextLength: 128000,
      dynamicModels: true,
      modelsCacheTTL: 300000,
    },
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', maxInputTokens: 64000, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', maxInputTokens: 64000, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', maxInputTokens: 64000, maxOutputTokens: 8192, supportsTools: false, supportsVision: false },
    ],
  },
  qwen: {
    provider: {
      id: 'qwen',
      name: 'Qwen (通义千问)',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      apiKeySecret: '',
      family: 'qwen',
      apiMode: 'openai',
      supportsTools: true,
      supportsVision: true,
      defaultMaxOutputTokens: 8192,
      defaultContextLength: 131072,
      dynamicModels: true,
      modelsCacheTTL: 300000,
    },
    models: [
      { id: 'qwen-max', name: 'Qwen Max', maxInputTokens: 32000, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
      { id: 'qwen-plus', name: 'Qwen Plus', maxInputTokens: 131072, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
      { id: 'qwen-turbo', name: 'Qwen Turbo', maxInputTokens: 131072, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
      { id: 'qwen-vl-max', name: 'Qwen VL Max', maxInputTokens: 32000, maxOutputTokens: 4096, supportsTools: false, supportsVision: true },
    ],
  },
  openai: {
    provider: {
      id: 'openai',
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      apiKeySecret: '',
      family: 'gpt',
      apiMode: 'openai',
      supportsTools: true,
      supportsVision: true,
      defaultMaxOutputTokens: 16384,
      defaultContextLength: 128000,
      dynamicModels: true,
      modelsCacheTTL: 300000,
    },
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', maxInputTokens: 128000, maxOutputTokens: 16384, supportsTools: true, supportsVision: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxInputTokens: 128000, maxOutputTokens: 16384, supportsTools: true, supportsVision: true },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', maxInputTokens: 128000, maxOutputTokens: 4096, supportsTools: true, supportsVision: true },
    ],
  },
  anthropic: {
    provider: {
      id: 'anthropic',
      name: 'Anthropic Claude',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      apiKeySecret: '',
      family: 'claude',
      apiMode: 'anthropic',
      supportsTools: true,
      supportsVision: true,
      defaultMaxOutputTokens: 8192,
      defaultContextLength: 200000,
      dynamicModels: false,
      modelsCacheTTL: 300000,
    },
    models: [
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', maxInputTokens: 200000, maxOutputTokens: 8192, supportsTools: true, supportsVision: true },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku', maxInputTokens: 200000, maxOutputTokens: 8192, supportsTools: true, supportsVision: true },
      { id: 'claude-3-opus-latest', name: 'Claude 3 Opus', maxInputTokens: 200000, maxOutputTokens: 4096, supportsTools: true, supportsVision: true },
    ],
  },
  kimi: {
    provider: {
      id: 'kimi',
      name: 'Kimi (Moonshot)',
      // Kimi K2 Anthropic-compatible API
      // https://platform.moonshot.cn/docs/guide/agent-support
      baseUrl: 'https://api.moonshot.cn/anthropic',
      apiKeySecret: '',
      family: 'kimi',
      apiMode: 'anthropic',
      supportsTools: true,
      supportsVision: false,
      defaultMaxOutputTokens: 32768,
      defaultContextLength: 256000,
      dynamicModels: false,
      modelsCacheTTL: 300000,
    },
    models: [
      { id: 'kimi-k2-thinking-turbo', name: 'Kimi K2 Thinking Turbo', maxInputTokens: 256000, maxOutputTokens: 32768, supportsTools: true, supportsVision: false },
      { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', maxInputTokens: 256000, maxOutputTokens: 32768, supportsTools: true, supportsVision: false },
      { id: 'kimi-k2-turbo-preview', name: 'Kimi K2 Turbo', maxInputTokens: 256000, maxOutputTokens: 32768, supportsTools: true, supportsVision: false },
      { id: 'kimi-k2-0905-preview', name: 'Kimi K2 (0905)', maxInputTokens: 256000, maxOutputTokens: 32768, supportsTools: true, supportsVision: false },
    ],
  },
  mimo: {
    provider: {
      id: 'mimo',
      name: 'Xiaomi MiMo',
      // MiMo Anthropic-compatible API
      // https://platform.xiaomimimo.com/#/docs/api/text-generation/anthropic-api
      baseUrl: 'https://api.xiaomimimo.com/anthropic/v1/messages',
      apiKeySecret: '',
      family: 'mimo',
      apiMode: 'anthropic',
      supportsTools: true,
      supportsVision: false,
      defaultMaxOutputTokens: 65536,
      defaultContextLength: 131072,
      dynamicModels: false,
      modelsCacheTTL: 300000,
    },
    models: [
      { id: 'mimo-v2-flash', name: 'MiMo V2 Flash', maxInputTokens: 131072, maxOutputTokens: 65536, supportsTools: true, supportsVision: false },
    ],
  },
  custom: {
    provider: {
      id: 'custom',
      name: 'Custom Provider',
      baseUrl: 'https://api.example.com/v1/chat/completions',
      apiKeySecret: '',
      family: 'custom',
      apiMode: 'openai',
      supportsTools: true,
      supportsVision: false,
      defaultMaxOutputTokens: 4096,
      defaultContextLength: 32768,
      dynamicModels: true,
      modelsCacheTTL: 300000,
    },
    models: [
      { id: 'model-1', name: 'Model 1', maxInputTokens: 30000, maxOutputTokens: 4096, supportsTools: true, supportsVision: false },
    ],
  },
};

// ============================================================================
// CLI Interface
// ============================================================================

class CLI {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async run(): Promise<void> {
    this.printBanner();

    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case 'create':
        await this.create(args.slice(1));
        break;
      case 'list':
        this.listPresets();
        break;
      case 'help':
      case '--help':
      case '-h':
        this.printHelp();
        break;
      case 'version':
      case '--version':
      case '-v':
        this.printVersion();
        break;
      default:
        if (command) {
          console.log(`Unknown command: ${command}\n`);
        }
        await this.interactiveMode();
    }

    this.rl.close();
  }

  private printBanner(): void {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║              🚀 All-In Copilot CLI                        ║
║     Build VS Code Chat Extensions with Custom LLMs        ║
╚═══════════════════════════════════════════════════════════╝
`);
  }

  private printHelp(): void {
    console.log(`
Usage: all-in-copilot [command] [options]

Commands:
  create [name]     Create a new extension project
  list              List available provider presets
  help              Show this help message
  version           Show version information

Examples:
  all-in-copilot                    # Interactive mode
  all-in-copilot create my-ext      # Create with prompts
  all-in-copilot list               # Show presets

Presets: glm, minimax, deepseek, qwen, openai, anthropic, custom
`);
  }

  private printVersion(): void {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));
    console.log(`all-in-copilot v${pkg.version}`);
  }

  private listPresets(): void {
    console.log('Available Provider Presets:\n');
    for (const [key, preset] of Object.entries(PRESETS)) {
      console.log(`  ${key.padEnd(12)} - ${preset.provider.name}`);
      console.log(`               API: ${preset.provider.baseUrl}`);
      console.log(`               Models: ${preset.models.map(m => m.id).join(', ')}\n`);
    }
  }

  private async interactiveMode(): Promise<void> {
    console.log('Starting interactive project creation...\n');
    await this.create([]);
  }

  private async create(args: string[]): Promise<void> {
    const config = await this.collectConfig(args[0]);
    await this.generateProject(config);

    console.log(`
✅ Project created successfully!

Next steps:
  cd ${config.name}
  npm install
  npm run compile

Then press F5 in VS Code to test your extension.

📖 Documentation: https://github.com/sanchuanhehe/all-in-copilot
`);
  }

  private async collectConfig(projectName?: string): Promise<ProjectConfig> {
    // Project name
    const name = projectName || await this.ask(
      '📛 Project name (e.g., glm-copilot): ',
      'my-copilot',
      (v) => /^[a-z0-9-]+$/.test(v) ? null : 'Use lowercase letters, numbers, and hyphens only'
    );

    // Display name
    const displayName = await this.ask(
      '📝 Display name (shown in VS Code): ',
      this.toDisplayName(name)
    );

    // Description
    const description = await this.ask(
      '📄 Description: ',
      `${displayName} - Custom LLM provider for VS Code Chat`
    );

    // Publisher
    const publisher = await this.ask(
      '👤 Publisher name: ',
      'my-publisher'
    );

    // Select preset
    const presetKeys = Object.keys(PRESETS);
    console.log('\n🤖 Select a provider preset:');
    presetKeys.forEach((key, i) => {
      console.log(`  ${i + 1}. ${key.padEnd(12)} - ${PRESETS[key].provider.name}`);
    });

    const presetIndex = await this.ask(
      `\nEnter number (1-${presetKeys.length}): `,
      '1',
      (v) => {
        const n = parseInt(v);
        return n >= 1 && n <= presetKeys.length ? null : `Enter 1-${presetKeys.length}`;
      }
    );
    const template = presetKeys[parseInt(presetIndex) - 1];
    const preset = PRESETS[template];

    // Clone and customize preset
    const provider: ProviderConfig = {
      ...preset.provider,
      apiKeySecret: `${name}.apiKey`,
    };

    // Ask if user wants to customize
    const customize = await this.askYesNo('🔧 Customize provider settings?', false);

    if (customize) {
      provider.name = await this.ask('  Provider display name: ', provider.name);
      provider.baseUrl = await this.ask('  API base URL: ', provider.baseUrl);

      const apiModes = ['openai', 'anthropic', 'gemini', 'ollama'];
      console.log('  API mode:');
      apiModes.forEach((m, i) => console.log(`    ${i + 1}. ${m}`));
      const modeIndex = await this.ask('  Enter number (1-4): ', String(apiModes.indexOf(provider.apiMode) + 1));
      provider.apiMode = apiModes[parseInt(modeIndex) - 1] as ProviderConfig['apiMode'];

      provider.supportsTools = await this.askYesNo('  Supports tool calling?', provider.supportsTools);
      provider.supportsVision = await this.askYesNo('  Supports vision/images?', provider.supportsVision);
      provider.dynamicModels = await this.askYesNo('  Fetch models from API?', provider.dynamicModels);
    }

    // Models
    let models = [...preset.models];
    const customizeModels = await this.askYesNo('📋 Customize models?', false);

    if (customizeModels) {
      models = await this.collectModels(preset.models);
    }

    return {
      name,
      displayName,
      description,
      publisher,
      template,
      provider,
      models,
    };
  }

  private async collectModels(defaults: ModelConfig[]): Promise<ModelConfig[]> {
    const models: ModelConfig[] = [];

    console.log('\nCurrent models:');
    defaults.forEach((m, i) => console.log(`  ${i + 1}. ${m.id} (${m.name})`));

    const keepDefaults = await this.askYesNo('Keep default models?', true);
    if (keepDefaults) {
      models.push(...defaults);
    }

    let addMore = await this.askYesNo('Add custom models?', !keepDefaults);
    while (addMore) {
      console.log('\n  Add a model:');
      const id = await this.ask('    Model ID: ', '');
      const name = await this.ask('    Display name: ', id);
      const maxInputTokens = parseInt(await this.ask('    Max input tokens: ', '32768'));
      const maxOutputTokens = parseInt(await this.ask('    Max output tokens: ', '4096'));
      const supportsTools = await this.askYesNo('    Supports tools?', true);
      const supportsVision = await this.askYesNo('    Supports vision?', false);

      models.push({ id, name, maxInputTokens, maxOutputTokens, supportsTools, supportsVision });

      addMore = await this.askYesNo('\n  Add another model?', false);
    }

    return models;
  }

  private async generateProject(config: ProjectConfig): Promise<void> {
    const outputDir = path.join(process.cwd(), config.name);

    console.log(`\n📦 Creating project in ${outputDir}...`);

    // Find templates directory
    const templatesDir = this.findTemplatesDir();
    const templateDir = path.join(templatesDir, 'base-template');

    if (!fs.existsSync(templateDir)) {
      throw new Error(`Template not found: ${templateDir}`);
    }

    // Copy template
    this.copyDir(templateDir, outputDir, ['node_modules', 'out', '.git']);

    // Update package.json
    this.updatePackageJson(outputDir, config);

    // Update config.ts
    this.updateConfigTs(outputDir, config);

    // Create .gitignore
    this.createGitignore(outputDir);

    console.log('  ✓ Generated project files');
  }

  private findTemplatesDir(): string {
    // Try multiple locations
    const locations = [
      path.join(__dirname, '../../templates'),
      path.join(__dirname, '../../../templates'),
      path.join(process.cwd(), 'templates'),
    ];

    for (const loc of locations) {
      if (fs.existsSync(loc)) {
        return loc;
      }
    }

    throw new Error('Templates directory not found');
  }

  private copyDir(src: string, dest: string, exclude: string[] = []): void {
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      if (exclude.includes(entry.name)) continue;

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDir(srcPath, destPath, exclude);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private updatePackageJson(outputDir: string, config: ProjectConfig): void {
    const pkgPath = path.join(outputDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const vendorId = config.name.replace(/-/g, '');

    pkg.name = config.name;
    pkg.displayName = config.displayName;
    pkg.description = config.description;
    pkg.publisher = config.publisher;
    pkg.repository.url = `https://github.com/${config.publisher}/${config.name}`;

    // Update VS Code contributions
    pkg.contributes.languageModelChatProviders[0].vendor = vendorId;
    pkg.contributes.languageModelChatProviders[0].displayName = config.provider.name;
    pkg.contributes.languageModelChatProviders[0].managementCommand = `${vendorId}.manage`;

    pkg.contributes.commands[0].command = `${vendorId}.manage`;
    pkg.contributes.commands[0].title = `Manage ${config.provider.name}`;

    // Change workspace dependency to npm package
    pkg.dependencies = {
      '@all-in-copilot/sdk': '^1.0.0',
    };

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  }

  private updateConfigTs(outputDir: string, config: ProjectConfig): void {
    const configPath = path.join(outputDir, 'src', 'config.ts');

    const providerStr = this.objectToTS(config.provider, 2);
    const modelsStr = config.models.map(m => this.objectToTS(m, 2)).join(',\n  ');

    const content = `/**
 * ${config.provider.name} Provider Configuration
 * Generated by All-In Copilot CLI
 */

import type { ProviderConfig, ModelConfig } from '@all-in-copilot/sdk';

/**
 * Provider configuration
 */
export const PROVIDER_CONFIG: ProviderConfig = ${providerStr};

/**
 * Fallback models (used when dynamic fetch fails or is disabled)
 */
export const FALLBACK_MODELS: ModelConfig[] = [
  ${modelsStr},
];

/**
 * Filter models - customize which models to show
 */
export function filterModels(models: ModelConfig[]): ModelConfig[] {
  // Return all models by default
  // Customize: return models.filter(m => m.id.includes('chat'));
  return models;
}
`;

    fs.writeFileSync(configPath, content);
  }

  private createGitignore(outputDir: string): void {
    const content = `node_modules/
out/
*.vsix
.vscode-test/
`;
    fs.writeFileSync(path.join(outputDir, '.gitignore'), content);
  }

  private objectToTS(obj: object, indent: number): string {
    const spaces = ' '.repeat(indent);
    const lines: string[] = ['{'];

    for (const [key, value] of Object.entries(obj)) {
      let valueStr: string;
      if (typeof value === 'string') {
        valueStr = `'${value}'`;
      } else if (typeof value === 'boolean' || typeof value === 'number') {
        valueStr = String(value);
      } else {
        valueStr = JSON.stringify(value);
      }
      lines.push(`${spaces}  ${key}: ${valueStr},`);
    }

    lines.push(`${spaces}}`);
    return lines.join('\n');
  }

  private toDisplayName(name: string): string {
    return name
      .split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private ask(prompt: string, defaultValue: string, validate?: (v: string) => string | null): Promise<string> {
    return new Promise((resolve) => {
      const fullPrompt = defaultValue ? `${prompt}(${defaultValue}) ` : prompt;
      this.rl.question(fullPrompt, (answer) => {
        const value = answer.trim() || defaultValue;
        if (validate) {
          const error = validate(value);
          if (error) {
            console.log(`  ⚠️  ${error}`);
            resolve(this.ask(prompt, defaultValue, validate));
            return;
          }
        }
        resolve(value);
      });
    });
  }

  private askYesNo(prompt: string, defaultValue: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      const hint = defaultValue ? '(Y/n)' : '(y/N)';
      this.rl.question(`${prompt} ${hint} `, (answer) => {
        const a = answer.trim().toLowerCase();
        if (a === '') {
          resolve(defaultValue);
        } else {
          resolve(a === 'y' || a === 'yes');
        }
      });
    });
  }
}

// Run CLI
new CLI().run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
