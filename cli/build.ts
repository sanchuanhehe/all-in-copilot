#!/usr/bin/env node
/**
 * CLI Build Tool for All-In Copilot
 * Creates a new VSCode extension from a template with custom provider configuration
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const TEMPLATES_DIR = path.join(__dirname, '../templates');
const OUTPUT_DIR = process.cwd();

interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeySecret: string;
  family: string;
  supportsTools: boolean;
  supportsVision: boolean;
  defaultMaxOutputTokens: number;
  defaultContextLength: number;
}

interface ModelConfig {
  id: string;
  name: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
}

interface CLIOptions {
  template: string;
  name: string;
  provider: ProviderConfig;
  models: ModelConfig[];
  publisher: string;
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  console.log('🚀 All-In Copilot - VSCode Extension Builder\n');

  const options = await collectOptions();

  console.log('\n📦 Creating extension...');
  await createExtension(options);

  console.log('\n✅ Extension created successfully!');
  console.log(`\nTo get started:`);
  console.log(`  cd ${options.name}`);
  console.log(`  npm install`);
  console.log(`  npm run compile`);
  console.log(`  # Press F5 in VSCode to test`);
}

/**
 * Collect user options
 */
async function collectOptions(): Promise<CLIOptions> {
  const rl = createInterface();

  // Select template
  const template = await askQuestion(rl, '\n📁 Select a template:\n  1. minimax\n  2. glm\n  3. openai-compatible\n  4. custom\n\nEnter option (1-4): ', (answer) => {
    const options: Record<string, string> = {
      '1': 'minimax-template',
      '2': 'glm-template',
      '3': 'openai-template',
      '4': 'custom',
    };
    return options[answer] || 'minimax-template';
  });

  // Extension name
  const name = await askQuestion(rl, '\n📛 Extension name (e.g., my-minimax-copilot): ', (answer) => {
    return answer.trim() || 'my-copilot';
  });

  // Publisher
  const publisher = await askQuestion(rl, '\n👤 Publisher name (e.g., MyName): ', (answer) => {
    return answer.trim() || 'MyPublisher';
  });

  // Provider configuration
  let provider: ProviderConfig;
  let models: ModelConfig[];

  if (template === 'minimax-template') {
    provider = {
      id: 'minimax',
      name: 'MiniMax',
      baseUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
      apiKeySecret: `${name}.minimax.apiKey`,
      family: 'minimax',
      supportsTools: true,
      supportsVision: false,
      defaultMaxOutputTokens: 8192,
      defaultContextLength: 100000,
    };
    models = [
      { id: 'minimax-abab6.5s-chat', name: 'MiniMax abab6.5s-chat', maxInputTokens: 90000, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
      { id: 'minimax-abab6.5-chat', name: 'MiniMax abab6.5-chat', maxInputTokens: 100000, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
    ];
  } else if (template === 'glm-template') {
    provider = {
      id: 'glm',
      name: 'GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      apiKeySecret: `${name}.glm.apiKey`,
      family: 'glm',
      supportsTools: true,
      supportsVision: true,
      defaultMaxOutputTokens: 8192,
      defaultContextLength: 128000,
    };
    models = [
      { id: 'glm-4-plus', name: 'GLM-4 Plus', maxInputTokens: 120000, maxOutputTokens: 8192, supportsTools: true, supportsVision: true },
      { id: 'glm-4', name: 'GLM-4', maxInputTokens: 128000, maxOutputTokens: 8192, supportsTools: true, supportsVision: true },
    ];
  } else {
    // Custom configuration
    provider = await collectCustomProvider(rl);
    models = await collectModels(rl, provider.id);
  }

  rl.close();

  return { template, name, provider, models, publisher };
}

/**
 * Collect custom provider configuration
 */
async function collectCustomProvider(rl: readline.Interface): Promise<ProviderConfig> {
  const name = await askQuestion(rl, '\n🤖 Provider name (e.g., MyProvider): ', (a) => a.trim() || 'MyProvider');
  const baseUrl = await askQuestion(rl, '🔗 Base API URL (e.g., https://api.example.com/v1): ', (a) => a.trim());
  const family = await askQuestion(rl, '🏷️ Model family (e.g., gpt-4, glm): ', (a) => a.trim() || 'custom');
  const supportsTools = await askQuestion(rl, '🔧 Supports tools? (y/n): ', (a) => a.toLowerCase().startsWith('y'));
  const supportsVision = await askQuestion(rl, '🖼️ Supports vision? (y/n): ', (a) => a.toLowerCase().startsWith('y'));

  return {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    baseUrl,
    apiKeySecret: `allincopilot.${name.toLowerCase().replace(/\s+/g, '-')}.apiKey`,
    family,
    supportsTools,
    supportsVision,
    defaultMaxOutputTokens: 4096,
    defaultContextLength: 32768,
  };
}

/**
 * Collect model configurations
 */
async function collectModels(rl: readline.Interface, providerId: string): Promise<ModelConfig[]> {
  const models: ModelConfig[] = [];
  let addMore = true;

  while (addMore) {
    console.log('\n📋 Add a model:');
    const id = await askQuestion(rl, '  Model ID: ', (a) => a.trim());
    const name = await askQuestion(rl, '  Display name: ', (a) => a.trim() || id);
    const maxInput = parseInt(await askQuestion(rl, '  Max input tokens: ', (a) => a.trim() || '32768'), 10);
    const maxOutput = parseInt(await askQuestion(rl, '  Max output tokens: ', (a) => a.trim() || '4096'), 10);
    const supportsTools = await askQuestion(rl, '  Supports tools? (y/n): ', (a) => a.toLowerCase().startsWith('y'));
    const supportsVision = await askQuestion(rl, '  Supports vision? (y/n): ', (a) => a.toLowerCase().startsWith('n'));

    models.push({
      id,
      name,
      maxInputTokens: maxInput,
      maxOutputTokens: maxOutput,
      supportsTools,
      supportsVision,
    });

    addMore = await askQuestion(rl, '\n  Add another model? (y/n): ', (a) => a.toLowerCase().startsWith('y'));
  }

  return models;
}

/**
 * Create the extension from template
 */
async function createExtension(options: CLIOptions): Promise<void> {
  const templateDir = path.join(TEMPLATES_DIR, 'base-template');

  // If using a provider template, copy from there
  if (options.template !== 'custom' && options.template !== 'openai-template') {
    const providerTemplateDir = path.join(TEMPLATES_DIR, options.template);
    if (fs.existsSync(providerTemplateDir)) {
      await copyDirectory(providerTemplateDir, options.name);
      await updateExtensionConfig(options.name, options);
      return;
    }
  }

  // Create from base template
  await copyDirectory(templateDir, options.name);
  await updateExtensionConfig(options.name, options);
  await updateProviderConfig(options.name, options);
  await updateExtensionCode(options.name, options);
}

/**
 * Update package.json with extension config
 */
async function updateExtensionConfig(name: string, options: CLIOptions): Promise<void> {
  const packageJsonPath = path.join(OUTPUT_DIR, name, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

  packageJson.name = name;
  packageJson.displayName = `${options.provider.name} Copilot`;
  packageJson.description = `${options.provider.name} provider for VS Code Chat`;
  packageJson.publisher = options.publisher;

  // Update contributes
  packageJson.contributes.languageModelChatProviders[0].vendor = name.replace(/-/g, '');
  packageJson.contributes.languageModelChatProviders[0].displayName = options.provider.name;
  packageJson.contributes.commands[0].command = `${name.replace(/-/g, '')}.manage`;
  packageJson.contributes.commands[0].title = `Manage ${options.provider.name}`;

  // Update configuration
  packageJson.contributes.configuration.properties = {
    [`${name}.apiKey`]: {
      type: 'string',
      description: `API key for ${options.provider.name}`,
    },
  };

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

/**
 * Update provider configuration
 */
async function updateProviderConfig(name: string, options: CLIOptions): Promise<void> {
  const configPath = path.join(OUTPUT_DIR, name, 'src', 'config.ts');

  let config = fs.readFileSync(configPath, 'utf-8');

  // Replace provider config
  config = config.replace(
    /const PROVIDER_CONFIG: ProviderConfig = \{[\s\S]*?\};/,
    `const PROVIDER_CONFIG: ProviderConfig = ${JSON.stringify(options.provider, null, 6).replace(/"/g, "'")};`
  );

  // Replace models
  config = config.replace(
    /const STATIC_MODELS: ModelConfig\[\] = \[[\s\S]*?\];/,
    `const STATIC_MODELS: ModelConfig[] = ${JSON.stringify(options.models, null, 6).replace(/"/g, "'")};`
  );

  fs.writeFileSync(configPath, config);
}

/**
 * Update extension.ts with provider name
 */
async function updateExtensionCode(name: string, options: CLIOptions): Promise<void> {
  const extensionPath = path.join(OUTPUT_DIR, name, 'src', 'extension.ts');

  let code = fs.readFileSync(extensionPath, 'utf-8');

  const className = toPascalCase(name.replace(/-/g, ''));
  const vendorId = name.replace(/-/g, '');
  const commandPrefix = name.replace(/-/g, '');

  code = code
    .replace(/AllInCopilotProvider/g, className)
    .replace(/all-in-copilot/g, vendorId)
    .replace(/All-In Copilot/g, `${options.provider.name} Copilot`)
    .replace(/allInCopilot\./g, `${commandPrefix}.`);

  fs.writeFileSync(extensionPath, code);
}

/**
 * Copy directory recursively
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  if (!fs.existsSync(src)) {
    throw new Error(`Template not found: ${src}`);
  }

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Helper to create readline interface
 */
function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Helper to ask a question with validation
 */
function askQuestion<T>(rl: readline.Interface, prompt: string, validate: (answer: string) => T): Promise<T> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(validate(answer));
    });
  });
}

/**
 * Convert string to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

// Run CLI
main().catch(console.error);
