/**
 * VSCode Extension Entry Point
 * ============================
 * This file uses @all-in-copilot/sdk helper functions for all provider logic.
 * You only need to provide configuration values in config.ts!
 */

import * as vscode from 'vscode';
import type {
  LanguageModelChatInformation,
  LanguageModelChatProvider,
  LanguageModelChatRequestMessage,
  ProvideLanguageModelChatResponseOptions,
  LanguageModelResponsePart,
} from 'vscode';
import {
  type ModelConfig,
  type VsCodeMessage,
  processOpenAIStream,
  processAnthropicStream,
  fetchModelsFromAPI,
  estimateTokens,
  buildRequest,
} from '@all-in-copilot/sdk';
import { PROVIDER_CONFIG, FALLBACK_MODELS, filterModels } from './config';

/**
 * Extension Provider - Uses SDK helpers for all heavy lifting
 */
class ExtensionProvider implements LanguageModelChatProvider {
  private secrets: vscode.SecretStorage;
  private statusBar: vscode.StatusBarItem;
  private modelCache = { models: null as ModelConfig[] | null, lastFetch: 0 };

  constructor(secrets: vscode.SecretStorage) {
    this.secrets = secrets;

    // Create status bar
    this.statusBar = vscode.window.createStatusBarItem(
      PROVIDER_CONFIG.id,
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBar.text = `$(ai) ${PROVIDER_CONFIG.name}`;
    this.statusBar.command = `${PROVIDER_CONFIG.id}.manage`;
    this.statusBar.show();
  }

  /**
   * Provide available models to VS Code
   */
  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    _token: vscode.CancellationToken
  ): Promise<LanguageModelChatInformation[]> {
    const apiKey = await this.ensureApiKey(options.silent);
    if (!apiKey && options.silent) {
      return [];
    }

    let models: ModelConfig[];

    if (PROVIDER_CONFIG.dynamicModels && apiKey) {
      try {
        models = await fetchModelsFromAPI(
          PROVIDER_CONFIG.baseUrl,
          apiKey,
          PROVIDER_CONFIG,
          this.modelCache
        );
      } catch (error) {
        console.warn(`[${PROVIDER_CONFIG.name}] Failed to fetch models:`, error);
        models = FALLBACK_MODELS;
      }
    } else {
      models = FALLBACK_MODELS;
    }

    models = filterModels(models);

    return models.map(model => ({
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

  /**
   * Estimate token count
   */
  async provideTokenCount(
    _model: LanguageModelChatInformation,
    text: string | LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    if (typeof text === 'string') {
      return estimateTokens(text);
    }
    return estimateTokens(JSON.stringify(text));
  }

  /**
   * Handle chat response with streaming
   */
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

    // Build request using SDK helper
    const requestBody = buildRequest(
      PROVIDER_CONFIG.apiMode,
      model.id,
      messages as unknown as readonly VsCodeMessage[],
      options.tools,
      model.maxOutputTokens
    );

    // Make streaming request with error handling
    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort());

    let response: Response;
    try {
      response = await fetch(PROVIDER_CONFIG.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Use appropriate auth header based on API mode
          ...(PROVIDER_CONFIG.apiMode === 'anthropic'
            ? {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              }
            : { 'Authorization': `Bearer ${apiKey}` }),
          ...PROVIDER_CONFIG.headers,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Request was cancelled');
      }
      throw new Error(`Failed to connect to ${PROVIDER_CONFIG.name}: ${errorMessage}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`API request failed: ${response.status} ${response.statusText}${text ? `\n${text}` : ''}`);
    }

    // Process streaming response using SDK helpers with error handling
    const apiMode = PROVIDER_CONFIG.apiMode;
    const processStream = apiMode === 'anthropic' ? processAnthropicStream : processOpenAIStream;

    try {
      await processStream(
        response,
        (text) => {
          progress.report(new vscode.LanguageModelTextPart(text));
        },
        (callId, name, args) => {
          progress.report(new vscode.LanguageModelToolCallPart(callId, name, args));
        },
        controller.signal
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Response stream was cancelled');
      }
      throw new Error(`Failed to process response: ${errorMessage}`);
    }
  }

  /**
   * Ensure API key is configured
   */
  private async ensureApiKey(silent: boolean): Promise<string | undefined> {
    let apiKey = await this.secrets.get(PROVIDER_CONFIG.apiKeySecret);

    if (!apiKey && !silent) {
      apiKey = await vscode.window.showInputBox({
        prompt: `Enter your ${PROVIDER_CONFIG.name} API Key`,
        password: true,
        placeHolder: 'sk-...',
      });
      if (apiKey) {
        await this.secrets.store(PROVIDER_CONFIG.apiKeySecret, apiKey);
      }
    }

    return apiKey;
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Create and register provider
  const provider = new ExtensionProvider(context.secrets);
  const registration = vscode.lm.registerLanguageModelChatProvider(
    PROVIDER_CONFIG.id,
    provider
  );
  context.subscriptions.push(registration);

  // Register management command
  const manageCommand = vscode.commands.registerCommand(
    `${PROVIDER_CONFIG.id}.manage`,
    async () => {
      const action = await vscode.window.showQuickPick(
        ['Configure API Key', 'View Provider Info'],
        { placeHolder: `Manage ${PROVIDER_CONFIG.name}` }
      );

      if (action === 'Configure API Key') {
        const apiKey = await vscode.window.showInputBox({
          prompt: `Enter your ${PROVIDER_CONFIG.name} API Key`,
          password: true,
          placeHolder: 'sk-...',
        });
        if (apiKey) {
          await context.secrets.store(PROVIDER_CONFIG.apiKeySecret, apiKey);
          vscode.window.showInformationMessage(`${PROVIDER_CONFIG.name} API key saved`);
        }
      } else if (action === 'View Provider Info') {
        vscode.window.showInformationMessage(
          `${PROVIDER_CONFIG.name}\n` +
          `API Mode: ${PROVIDER_CONFIG.apiMode}\n` +
          `Base URL: ${PROVIDER_CONFIG.baseUrl}`
        );
      }
    }
  );
  context.subscriptions.push(manageCommand);

  console.log(`[${PROVIDER_CONFIG.name}] Extension activated`);
}

export function deactivate() {
  // Cleanup handled by VS Code
}
