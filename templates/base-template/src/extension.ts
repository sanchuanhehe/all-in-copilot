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
  convertToOpenAI,
  convertToAnthropic,
  convertToolsToOpenAI,
  convertToolsToAnthropic,
  processOpenAIStream,
  processAnthropicStream,
  fetchModelsFromAPI,
  estimateTokens,
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

    // Build request based on API mode
    const requestBody = this.buildRequest(model, messages, options);

    // Make streaming request with error handling
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
   * Build request body based on API mode
   */
  private buildRequest(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatRequestMessage[],
    options: ProvideLanguageModelChatResponseOptions
  ): object {
    const vsMessages = messages as unknown as readonly VsCodeMessage[];

    if (PROVIDER_CONFIG.apiMode === 'anthropic') {
      const { system, messages: anthropicMessages } = convertToAnthropic(vsMessages);
      const tools = convertToolsToAnthropic(options.tools);

      // Filter out messages with empty content (some providers don't accept them)
      const validMessages = anthropicMessages.filter(msg => {
        if (Array.isArray(msg.content)) {
          return msg.content.length > 0;
        }
        return true;
      });

      // Ensure alternating user/assistant pattern and starts with user
      // This is required by Anthropic API
      const finalMessages = this.ensureValidMessageOrder(validMessages);

      // Build base request - only include fields that have values
      const request: Record<string, unknown> = {
        model: model.id,
        messages: finalMessages,
        max_tokens: model.maxOutputTokens,
        stream: true,
      };

      // Only add system if not empty
      if (system) {
        request.system = system;
      }

      // Only add tools if there are any
      if (tools && tools.length > 0) {
        request.tools = tools;
      }

      return request;
    } else {
      // OpenAI format
      const tools = convertToolsToOpenAI(options.tools);
      const request: Record<string, unknown> = {
        model: model.id,
        messages: convertToOpenAI(vsMessages),
        max_tokens: model.maxOutputTokens,
        stream: true,
      };

      if (tools && tools.length > 0) {
        request.tools = tools;
      }

      return request;
    }
  }

  /**
   * Ensure message order is valid for Anthropic API:
   * 1. Must start with user message
   * 2. Must alternate between user and assistant
   */
  private ensureValidMessageOrder(messages: Array<{role: string; content: unknown[]}>): Array<{role: string; content: unknown[]}> {
    if (messages.length === 0) {
      return [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }];
    }

    const result: Array<{role: string; content: unknown[]}> = [];

    // Ensure first message is user
    if (messages[0].role !== 'user') {
      result.push({ role: 'user', content: [{ type: 'text', text: '(continue)' }] });
    }

    for (const msg of messages) {
      // If the last message in result has the same role, merge or skip
      if (result.length > 0 && result[result.length - 1].role === msg.role) {
        // Merge content
        const lastMsg = result[result.length - 1];
        if (Array.isArray(lastMsg.content) && Array.isArray(msg.content)) {
          lastMsg.content.push(...msg.content);
        }
      } else {
        result.push({ ...msg, content: [...(msg.content as unknown[])] });
      }
    }

    return result;
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
        ignoreFocusOut: true,
      });

      if (!apiKey) {
        // User cancelled - show helpful message
        vscode.window.showWarningMessage(
          `${PROVIDER_CONFIG.name} API key is required. Run "Manage ${PROVIDER_CONFIG.name}" command to configure.`,
          'Configure Now'
        ).then(selection => {
          if (selection === 'Configure Now') {
            vscode.commands.executeCommand(`${PROVIDER_CONFIG.id}.manage`);
          }
        });
        return undefined;
      }

      await this.secrets.store(PROVIDER_CONFIG.apiKeySecret, apiKey);
      vscode.window.showInformationMessage(`${PROVIDER_CONFIG.name} API key saved securely`);
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
