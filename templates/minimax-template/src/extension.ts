/**
 * MiniMax VSCode Extension Entry Point
 */

import * as vscode from 'vscode';
import type {
  LanguageModelChatInformation,
  LanguageModelChatProvider,
  LanguageModelChatRequestMessage,
  ProvideLanguageModelChatResponseOptions,
  LanguageModelResponsePart,
} from 'vscode';
import { PROVIDER_CONFIG, STATIC_MODELS } from './config';

export class MiniMaxProvider implements LanguageModelChatProvider {
  private secrets: vscode.SecretStorage;
  private statusBar: vscode.StatusBarItem;

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;

    // Create status bar
    this.statusBar = vscode.window.createStatusBarItem('minimax', vscode.StatusBarAlignment.Right, 100);
    this.statusBar.text = `$(ai) ${PROVIDER_CONFIG.name}`;
    this.statusBar.command = 'minimax.manage';
    this.statusBar.show();
  }

  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    _token: vscode.CancellationToken
  ): Promise<LanguageModelChatInformation[]> {
    const apiKey = await this.ensureApiKey(options.silent);
    if (!apiKey && options.silent) {
      return [];
    }

    return STATIC_MODELS.map(model => ({
      id: model.id,
      name: model.name,
      family: PROVIDER_CONFIG.family,
      version: '1.0.0',
      maxInputTokens: model.maxInputTokens,
      maxOutputTokens: model.maxOutputTokens,
      capabilities: {
        imageInput: model.supportsVision,
        toolCalling: model.supportsTools,
      },
    }));
  }

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

  async provideLanguageModelChatResponse(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatRequestMessage[],
    options: ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const apiKey = await this.ensureApiKey(false);
    if (!apiKey) {
      throw new Error('API key not configured');
    }

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

    const response = await fetch(PROVIDER_CONFIG.baseUrl, {
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

  private async ensureApiKey(silent: boolean): Promise<string | undefined> {
    let apiKey = await this.secrets.get(PROVIDER_CONFIG.apiKeySecret);

    if (!apiKey && !silent) {
      apiKey = await vscode.window.showInputBox({
        prompt: `Enter ${PROVIDER_CONFIG.name} API Key`,
        password: true,
      });

      if (apiKey) {
        await this.secrets.store(PROVIDER_CONFIG.apiKeySecret, apiKey);
      }
    }

    return apiKey;
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

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MiniMaxProvider(context.secrets);

  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider('minimax', provider),
    vscode.commands.registerCommand('minimax.manage', async () => {
      await vscode.window.showInformationMessage(`${PROVIDER_CONFIG.name} Copilot configured`);
    })
  );
}

export function deactivate(): void {}
