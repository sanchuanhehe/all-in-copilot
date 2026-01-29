/**
 * VSCode Extension Entry Point
 * Simple LLM Provider for VS Code Chat
 */

import * as vscode from 'vscode';
import type {
  LanguageModelChatInformation,
  LanguageModelChatProvider,
  LanguageModelChatRequestMessage,
  ProvideLanguageModelChatResponseOptions,
  LanguageModelResponsePart,
} from 'vscode';

// Provider configuration
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

// Model configuration
interface ModelConfig {
  id: string;
  name: string;
  providerId: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
}

// Default provider configurations
const DEFAULT_PROVIDERS: Record<string, ProviderConfig> = {
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    apiKeySecret: 'allInCopilot.minimax.apiKey',
    family: 'minimax',
    supportsTools: true,
    supportsVision: false,
    defaultMaxOutputTokens: 8192,
    defaultContextLength: 100000,
  },
  glm: {
    id: 'glm',
    name: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    apiKeySecret: 'allInCopilot.glm.apiKey',
    family: 'glm',
    supportsTools: true,
    supportsVision: true,
    defaultMaxOutputTokens: 8192,
    defaultContextLength: 128000,
  },
};

// Static model configurations
const STATIC_MODELS: Record<string, ModelConfig[]> = {
  minimax: [
    {
      id: 'minimax-abab6.5s-chat',
      name: 'MiniMax abab6.5s-chat',
      providerId: 'minimax',
      maxInputTokens: 90000,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: false,
    },
  ],
  glm: [
    {
      id: 'glm-4-plus',
      name: 'GLM-4 Plus',
      providerId: 'glm',
      maxInputTokens: 120000,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: true,
    },
  ],
};

/**
 * VSCode Provider implementation
 */
export class AllInCopilotProvider implements LanguageModelChatProvider {
  private secrets: vscode.SecretStorage;
  private selectedProvider: string;
  private statusBar: vscode.StatusBarItem;

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;
    this.selectedProvider = 'minimax';

    // Create status bar
    this.statusBar = vscode.window.createStatusBarItem('allInCopilot', vscode.StatusBarAlignment.Right, 100);
    this.statusBar.command = 'allInCopilot.manage';
    this.statusBar.text = `$(ai) ${DEFAULT_PROVIDERS[this.selectedProvider].name}`;
    this.statusBar.show();
  }

  /**
   * Switch to a different provider
   */
  async switchProvider(providerId: string): Promise<void> {
    if (!DEFAULT_PROVIDERS[providerId]) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    this.selectedProvider = providerId;
    this.statusBar.text = `$(ai) ${DEFAULT_PROVIDERS[providerId].name}`;
  }

  /**
   * Get API key from secret storage
   */
  private async getApiKey(silent: boolean): Promise<string | undefined> {
    const config = DEFAULT_PROVIDERS[this.selectedProvider];
    let apiKey = await this.secrets.get(config.apiKeySecret);

    if (!apiKey && !silent) {
      apiKey = await vscode.window.showInputBox({
        prompt: `Enter ${config.name} API Key`,
        password: true,
        ignoreFocusOut: true,
      });

      if (apiKey) {
        await this.secrets.store(config.apiKeySecret, apiKey);
      }
    }

    return apiKey;
  }

  /**
   * Get available models
   */
  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    _token: vscode.CancellationToken
  ): Promise<LanguageModelChatInformation[]> {
    const apiKey = await this.getApiKey(options.silent);
    if (!apiKey && options.silent) {
      return [];
    }

    const models = STATIC_MODELS[this.selectedProvider] ?? [];
    const config = DEFAULT_PROVIDERS[this.selectedProvider];

    return models.map((model: ModelConfig) => ({
      id: model.id,
      name: model.name,
      family: config.family,
      version: '1.0.0',
      maxInputTokens: model.maxInputTokens,
      maxOutputTokens: model.maxOutputTokens,
      capabilities: {
        imageInput: model.supportsVision,
        toolCalling: model.supportsTools,
      },
    }));
  }

  /**
   * Estimate token count
   */
  async provideTokenCount(
    _model: LanguageModelChatInformation,
    text: string | LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    if (typeof text === 'string') {
      return Math.ceil(text.length / 4);
    }
    return Math.ceil(JSON.stringify(text).length / 4);
  }

  /**
   * Send chat request
   */
  async provideLanguageModelChatResponse(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatRequestMessage[],
    options: ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const apiKey = await this.getApiKey(false);
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    const config = DEFAULT_PROVIDERS[this.selectedProvider];

    // Convert messages
    const convertedMessages = messages.map(msg => ({
      role: this.mapRole(msg.role),
      content: this.extractContent(msg.content),
    }));

    // Convert tools
    const tools = options.tools?.map((tool: unknown) => this.convertTool(tool));

    // Build request
    const requestBody = {
      model: model.id,
      messages: convertedMessages,
      tools,
      max_tokens: model.maxOutputTokens,
      stream: true,
    };

    // Make streaming request
    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort());

    const response = await fetch(config.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to read response');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta;

            if (delta?.content) {
              progress.report(new vscode.LanguageModelTextPart(delta.content));
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.id && tc.function?.name) {
                  progress.report(
                    new vscode.LanguageModelToolCallPart(
                      tc.id,
                      tc.function.name,
                      tc.function.arguments ?? ''
                    )
                  );
                }
              }
            }
          } catch {
            // Skip invalid chunks
          }
        }
      }
    }
  }

  private mapRole(role: number): 'system' | 'user' | 'assistant' | 'tool' {
    if (role === 1) {
      return 'system';
    }
    if (role === 3) {
      return 'assistant';
    }
    return 'user';
  }

  private extractContent(content: readonly unknown[]): string {
    const parts: string[] = [];
    for (const part of content) {
      if (part && typeof part === 'object') {
        const p = part as Record<string, unknown>;
        if (p.value && typeof p.value === 'string') {
          parts.push(p.value);
        } else if (p.text && typeof p.text === 'string') {
          parts.push(p.text);
        }
      }
    }
    return parts.join('');
  }

  private convertTool(tool: unknown): Record<string, unknown> {
    const t = tool as Record<string, unknown>;
    if (t.type === 'function') {
      const func = t.function as Record<string, unknown>;
      return {
        type: 'function',
        function: {
          name: func.name,
          description: func.description,
          parameters: func.parameters,
        },
      };
    }
    return tool as Record<string, unknown>;
  }
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
  const provider = new AllInCopilotProvider(context.secrets);

  // Register the provider
  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider('all-in-copilot', provider)
  );

  // Register management command
  context.subscriptions.push(
    vscode.commands.registerCommand('allInCopilot.manage', async () => {
      const providerId = await vscode.window.showQuickPick(
        Object.keys(DEFAULT_PROVIDERS).map(id => ({
          label: DEFAULT_PROVIDERS[id].name,
          description: `Switch to ${DEFAULT_PROVIDERS[id].name}`,
          id,
        })),
        {
          placeHolder: 'Select LLM provider',
        }
      );

      if (providerId) {
        await provider.switchProvider(providerId.id);
        vscode.window.showInformationMessage(`Switched to ${providerId.label}`);
      }
    })
  );
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  // Cleanup handled by VSCode
}
