/**
 * VSCode Extension Entry Point
 * Supports dynamic model fetching from provider API
 */

import * as vscode from 'vscode';
import type {
  LanguageModelChatInformation,
  LanguageModelChatProvider,
  LanguageModelChatRequestMessage,
  ProvideLanguageModelChatResponseOptions,
  LanguageModelResponsePart,
} from 'vscode';
import { PROVIDER_CONFIG, FALLBACK_MODELS, filterModels, type ModelConfig } from './config';

/**
 * Response from /models endpoint
 */
interface ModelsResponse {
  object?: string;
  data: RemoteModel[];
}

/**
 * Remote model from API
 */
interface RemoteModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  context_length?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  capabilities?: {
    vision?: boolean;
    function_calling?: boolean;
    tool_use?: boolean;
  };
  [key: string]: unknown;
}

/**
 * OpenAI-compatible message format
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Extension Provider with Dynamic Model Fetching
 */
export class ExtensionProvider implements LanguageModelChatProvider {
  private secrets: vscode.SecretStorage;
  private statusBar: vscode.StatusBarItem;

  // Model cache
  private modelCache: ModelConfig[] | null = null;
  private lastFetchTime = 0;

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

    // Get models (dynamic or fallback)
    let models: ModelConfig[];

    if (PROVIDER_CONFIG.dynamicModels && apiKey) {
      try {
        models = await this.fetchModels(apiKey);
      } catch (error) {
        console.warn(`[${PROVIDER_CONFIG.name}] Failed to fetch models:`, error);
        models = FALLBACK_MODELS;
      }
    } else {
      models = FALLBACK_MODELS;
    }

    // Apply filter
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
      return Math.ceil(text.length / 4);
    }
    return Math.ceil(JSON.stringify(text).length / 4);
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

    // Convert messages to OpenAI format
    const convertedMessages = this.convertMessages(messages);

    // Convert tools to OpenAI format
    const tools = this.convertTools(options.tools);

    // Build request
    const requestBody = {
      model: model.id,
      messages: convertedMessages,
      tools: tools?.length ? tools : undefined,
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
      const text = await response.text().catch(() => '');
      throw new Error(`API request failed: ${response.status} ${response.statusText}${text ? `\n${text}` : ''}`);
    }

    await this.processStreamingResponse(response, progress);
  }

  /**
   * Convert VS Code messages to OpenAI-compatible format
   * Handles: TextPart, DataPart (images), ToolCallPart, ToolResultPart
   */
  private convertMessages(messages: readonly LanguageModelChatRequestMessage[]): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    for (const msg of messages) {
      const role = this.mapRole(msg.role);

      // Collect different part types
      const textParts: string[] = [];
      const imageParts: Array<{ mimeType: string; data: Uint8Array }> = [];
      const toolCalls: ToolCall[] = [];
      const toolResults: Array<{ callId: string; content: string }> = [];

      for (const part of msg.content ?? []) {
        if (part instanceof vscode.LanguageModelTextPart) {
          // Text content
          textParts.push(part.value);
        } else if (part instanceof vscode.LanguageModelDataPart) {
          // Image content
          if (this.isImageMimeType(part.mimeType)) {
            imageParts.push({ mimeType: part.mimeType, data: part.data });
          }
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          // Tool call from assistant
          const id = part.callId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          let args = '{}';
          try {
            args = typeof part.input === 'string' ? part.input : JSON.stringify(part.input ?? {});
          } catch {
            args = '{}';
          }
          toolCalls.push({
            id,
            type: 'function',
            function: { name: part.name, arguments: args },
          });
        } else if (this.isToolResultPart(part)) {
          // Tool result
          const toolResult = part as { callId?: string; content?: readonly unknown[] };
          const callId = toolResult.callId ?? '';
          const content = this.collectToolResultText(toolResult.content);
          toolResults.push({ callId, content });
        }
      }

      const joinedText = textParts.join('').trim();

      // Process based on role
      if (role === 'assistant') {
        const assistantMessage: OpenAIMessage = { role: 'assistant' };

        if (joinedText) {
          assistantMessage.content = joinedText;
        }

        if (toolCalls.length > 0) {
          assistantMessage.tool_calls = toolCalls;
        }

        if (assistantMessage.content || assistantMessage.tool_calls) {
          result.push(assistantMessage);
        }
      }

      // Tool results become separate tool messages
      for (const tr of toolResults) {
        result.push({
          role: 'tool',
          tool_call_id: tr.callId,
          content: tr.content || '',
        });
      }

      // User messages (with optional images)
      if (role === 'user') {
        if (imageParts.length > 0) {
          // Multi-modal message with images
          const contentArray: ContentPart[] = [];

          if (joinedText) {
            contentArray.push({ type: 'text', text: joinedText });
          }

          for (const img of imageParts) {
            const dataUrl = this.createDataUrl(img.mimeType, img.data);
            contentArray.push({
              type: 'image_url',
              image_url: { url: dataUrl },
            });
          }

          result.push({ role: 'user', content: contentArray });
        } else if (joinedText) {
          // Text-only user message
          result.push({ role: 'user', content: joinedText });
        }
      }

      // System messages
      if (role === 'system' && joinedText) {
        result.push({ role: 'system', content: joinedText });
      }
    }

    return result;
  }

  /**
   * Convert VS Code tools to OpenAI format
   */
  private convertTools(tools: readonly unknown[] | undefined): Array<Record<string, unknown>> | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map(tool => {
      const t = tool as Record<string, unknown>;

      // Handle LanguageModelChatTool format
      if ('name' in t && 'description' in t) {
        return {
          type: 'function',
          function: {
            name: this.sanitizeFunctionName(t.name as string),
            description: t.description,
            parameters: t.inputSchema ?? { type: 'object', properties: {} },
          },
        };
      }

      // Handle already OpenAI format
      if (t.type === 'function' && t.function) {
        const func = t.function as Record<string, unknown>;
        return {
          type: 'function',
          function: {
            name: this.sanitizeFunctionName(func.name as string),
            description: func.description,
            parameters: func.parameters ?? { type: 'object', properties: {} },
          },
        };
      }

      return tool as Record<string, unknown>;
    });
  }

  /**
   * Sanitize function name to be valid identifier
   */
  private sanitizeFunctionName(name: string): string {
    if (!name) {
      return 'tool';
    }
    // Replace invalid chars, ensure starts with letter
    let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!/^[a-zA-Z]/.test(sanitized)) {
      sanitized = `fn_${sanitized}`;
    }
    return sanitized.slice(0, 64);
  }

  /**
   * Check if mime type is an image
   */
  private isImageMimeType(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Check if part is a tool result
   */
  private isToolResultPart(part: unknown): boolean {
    return part instanceof vscode.LanguageModelToolResultPart;
  }

  /**
   * Collect text from tool result content
   */
  private collectToolResultText(content: readonly unknown[] | undefined): string {
    if (!content) {
      return '';
    }

    const texts: string[] = [];
    for (const item of content) {
      if (item instanceof vscode.LanguageModelTextPart) {
        texts.push(item.value);
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        if (typeof obj.value === 'string') {
          texts.push(obj.value);
        } else if (typeof obj.text === 'string') {
          texts.push(obj.text);
        }
      }
    }
    return texts.join('\n');
  }

  /**
   * Create data URL from binary data
   */
  private createDataUrl(mimeType: string, data: Uint8Array): string {
    const base64 = this.uint8ArrayToBase64(data);
    return `data:${mimeType};base64,${base64}`;
  }

  /**
   * Convert Uint8Array to base64 string
   */
  private uint8ArrayToBase64(data: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    return btoa(binary);
  }

  /**
   * Process SSE streaming response
   */
  private async processStreamingResponse(
    response: Response,
    progress: vscode.Progress<LanguageModelResponsePart>
  ): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to read response stream');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const toolCallBuffers = new Map<number, { id: string; name: string; arguments: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          continue;
        }

        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          // Flush any remaining tool calls
          this.flushToolCalls(toolCallBuffers, progress);
          return;
        }

        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta;

          // Handle text content
          if (delta?.content) {
            progress.report(new vscode.LanguageModelTextPart(delta.content));
          }

          // Handle tool calls (with buffering for streaming)
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;

              if (!toolCallBuffers.has(index)) {
                toolCallBuffers.set(index, {
                  id: tc.id ?? '',
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                });
              } else {
                const existing = toolCallBuffers.get(index)!;
                if (tc.id) {
                  existing.id = tc.id;
                }
                if (tc.function?.name) {
                  existing.name = tc.function.name;
                }
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments;
                }
              }
            }
          }

          // Check finish reason for tool call completion
          const finishReason = chunk.choices?.[0]?.finish_reason;
          if (finishReason === 'tool_calls' || finishReason === 'stop') {
            this.flushToolCalls(toolCallBuffers, progress);
          }
        } catch {
          // Skip invalid JSON chunks
        }
      }
    }
  }

  /**
   * Flush buffered tool calls to progress
   */
  private flushToolCalls(
    buffers: Map<number, { id: string; name: string; arguments: string }>,
    progress: vscode.Progress<LanguageModelResponsePart>
  ): void {
    for (const [, tc] of buffers) {
      if (tc.id && tc.name) {
        progress.report(
          new vscode.LanguageModelToolCallPart(tc.id, tc.name, tc.arguments)
        );
      }
    }
    buffers.clear();
  }

  /**
   * Fetch models from provider API
   */
  private async fetchModels(apiKey: string): Promise<ModelConfig[]> {
    const now = Date.now();
    const cacheTTL = PROVIDER_CONFIG.modelsCacheTTL ?? 5 * 60 * 1000;

    // Return cached if valid
    if (this.modelCache && (now - this.lastFetchTime) < cacheTTL) {
      return this.modelCache;
    }

    // Build models URL
    const modelsUrl = this.buildModelsUrl(PROVIDER_CONFIG.baseUrl);

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json() as ModelsResponse;
    const remoteModels = data.data || [];

    // Convert to ModelConfig
    const models = remoteModels.map(m => this.convertRemoteModel(m));

    // Update cache
    this.modelCache = models;
    this.lastFetchTime = now;

    return models;
  }

  /**
   * Build models endpoint URL from base URL
   */
  private buildModelsUrl(baseUrl: string): string {
    const cleanUrl = baseUrl.replace(/\/+$/, '');

    if (cleanUrl.endsWith('/chat/completions')) {
      return cleanUrl.replace('/chat/completions', '/models');
    }

    if (cleanUrl.endsWith('/v1')) {
      return `${cleanUrl}/models`;
    }

    // Try to find /v1 or similar and append /models
    const v1Match = cleanUrl.match(/(.+\/v\d+)/);
    if (v1Match) {
      return `${v1Match[1]}/models`;
    }

    return `${cleanUrl}/models`;
  }

  /**
   * Convert remote model to ModelConfig
   */
  private convertRemoteModel(remote: RemoteModel): ModelConfig {
    const contextLength = remote.context_length ?? PROVIDER_CONFIG.defaultContextLength;
    const maxOutput = remote.max_completion_tokens ?? remote.max_tokens ?? PROVIDER_CONFIG.defaultMaxOutputTokens;
    const maxInput = Math.max(1, contextLength - maxOutput);

    const supportsVision = remote.capabilities?.vision ?? PROVIDER_CONFIG.supportsVision;
    const supportsTools =
      remote.capabilities?.function_calling ??
      remote.capabilities?.tool_use ??
      PROVIDER_CONFIG.supportsTools;

    return {
      id: remote.id,
      name: remote.id,
      maxInputTokens: maxInput,
      maxOutputTokens: maxOutput,
      supportsTools,
      supportsVision,
    };
  }

  /**
   * Ensure API key exists
   */
  private async ensureApiKey(silent: boolean): Promise<string | undefined> {
    let apiKey = await this.secrets.get(PROVIDER_CONFIG.apiKeySecret);

    if (!apiKey && !silent) {
      apiKey = await vscode.window.showInputBox({
        title: `${PROVIDER_CONFIG.name} API Key`,
        prompt: `Enter your ${PROVIDER_CONFIG.name} API key`,
        password: true,
        ignoreFocusOut: true,
      });

      if (apiKey) {
        await this.secrets.store(PROVIDER_CONFIG.apiKeySecret, apiKey);
      }
    }

    return apiKey;
  }

  /**
   * Map VS Code role to API role
   */
  private mapRole(role: number): 'system' | 'user' | 'assistant' | 'tool' {
    // LanguageModelChatMessageRole: System = 1, User = 2, Assistant = 3
    switch (role) {
      case 1:
        return 'system';
      case 3:
        return 'assistant';
      default:
        return 'user';
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.statusBar.dispose();
  }
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext): void {
  const provider = new ExtensionProvider(context.secrets);

  context.subscriptions.push(
    // Register language model provider
    vscode.lm.registerLanguageModelChatProvider(PROVIDER_CONFIG.id, provider),

    // Register management command
    vscode.commands.registerCommand(`${PROVIDER_CONFIG.id}.manage`, async () => {
      const options = ['Set API Key', 'Refresh Models', 'View Status'];
      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: `${PROVIDER_CONFIG.name} Options`,
      });

      if (selected === 'Set API Key') {
        const apiKey = await vscode.window.showInputBox({
          title: `${PROVIDER_CONFIG.name} API Key`,
          prompt: 'Enter your API key',
          password: true,
          ignoreFocusOut: true,
        });
        if (apiKey) {
          await context.secrets.store(PROVIDER_CONFIG.apiKeySecret, apiKey);
          vscode.window.showInformationMessage(`${PROVIDER_CONFIG.name} API key saved`);
        }
      } else if (selected === 'Refresh Models') {
        vscode.window.showInformationMessage(`${PROVIDER_CONFIG.name}: Models will be refreshed on next use`);
      } else if (selected === 'View Status') {
        const apiKey = await context.secrets.get(PROVIDER_CONFIG.apiKeySecret);
        vscode.window.showInformationMessage(
          `${PROVIDER_CONFIG.name}: ${apiKey ? 'API key configured' : 'No API key set'}`
        );
      }
    }),

    // Dispose provider
    { dispose: () => provider.dispose() }
  );

  console.log(`[${PROVIDER_CONFIG.name}] Extension activated`);
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  console.log(`[${PROVIDER_CONFIG.name}] Extension deactivated`);
}
