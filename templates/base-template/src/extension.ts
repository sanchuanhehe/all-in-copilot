/**
 * VSCode Extension Entry Point
 * Supports dynamic model fetching and multiple API formats (OpenAI, Anthropic, etc.)
 */

import * as vscode from 'vscode';
import type {
  LanguageModelChatInformation,
  LanguageModelChatProvider,
  LanguageModelChatRequestMessage,
  ProvideLanguageModelChatResponseOptions,
  LanguageModelResponsePart,
} from 'vscode';
import { PROVIDER_CONFIG, FALLBACK_MODELS, filterModels, type ModelConfig, type ApiMode } from './config';

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

// ============================================================================
// OpenAI Format Types
// ============================================================================
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | OpenAIContentPart[];
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// ============================================================================
// Anthropic Format Types
// ============================================================================
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface AnthropicRequestBody {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  stream: boolean;
  tools?: AnthropicTool[];
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
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
   * Supports multiple API formats: OpenAI, Anthropic, etc.
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

    const apiMode = PROVIDER_CONFIG.apiMode || 'openai';

    // Build request based on API mode
    const { url, headers, body } = this.buildRequest(
      model,
      messages,
      options,
      apiKey,
      apiMode
    );

    // Make streaming request
    const controller = new AbortController();
    token.onCancellationRequested(() => controller.abort());

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`API request failed: ${response.status} ${response.statusText}${text ? `\n${text}` : ''}`);
    }

    // Process response based on API mode
    if (apiMode === 'anthropic') {
      await this.processAnthropicStreamingResponse(response, progress);
    } else {
      await this.processOpenAIStreamingResponse(response, progress);
    }
  }

  /**
   * Build request based on API mode
   */
  private buildRequest(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatRequestMessage[],
    options: ProvideLanguageModelChatResponseOptions,
    apiKey: string,
    apiMode: ApiMode
  ): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
    const baseHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...PROVIDER_CONFIG.headers,
    };

    if (apiMode === 'anthropic') {
      // Anthropic format
      const { messages: anthropicMessages, systemPrompt } = this.convertMessagesForAnthropic(messages);
      const tools = this.convertToolsForAnthropic(options.tools);

      return {
        url: PROVIDER_CONFIG.baseUrl,
        headers: {
          ...baseHeaders,
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: {
          model: model.id,
          messages: anthropicMessages,
          system: systemPrompt || undefined,
          max_tokens: model.maxOutputTokens,
          stream: true,
          tools: tools?.length ? tools : undefined,
        },
      };
    } else {
      // OpenAI format (default)
      const convertedMessages = this.convertMessagesForOpenAI(messages);
      const tools = this.convertToolsForOpenAI(options.tools);

      return {
        url: PROVIDER_CONFIG.baseUrl,
        headers: {
          ...baseHeaders,
          'Authorization': `Bearer ${apiKey}`,
        },
        body: {
          model: model.id,
          messages: convertedMessages,
          tools: tools?.length ? tools : undefined,
          max_tokens: model.maxOutputTokens,
          stream: true,
        },
      };
    }
  }

  // ============================================================================
  // OpenAI Format Conversion
  // ============================================================================

  /**
   * Convert VS Code messages to OpenAI format
   */
  private convertMessagesForOpenAI(messages: readonly LanguageModelChatRequestMessage[]): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    for (const msg of messages) {
      const role = this.mapRole(msg.role);
      const { textParts, imageParts, toolCalls, toolResults } = this.extractMessageParts(msg);
      const joinedText = textParts.join('').trim();

      // Process based on role
      if (role === 'assistant') {
        const assistantMessage: OpenAIMessage = { role: 'assistant' };
        if (joinedText) {
          assistantMessage.content = joinedText;
        }
        if (toolCalls.length > 0) {
          assistantMessage.tool_calls = toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          }));
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
          const contentArray: OpenAIContentPart[] = [];
          if (joinedText) {
            contentArray.push({ type: 'text', text: joinedText });
          }
          for (const img of imageParts) {
            const dataUrl = this.createDataUrl(img.mimeType, img.data);
            contentArray.push({ type: 'image_url', image_url: { url: dataUrl } });
          }
          result.push({ role: 'user', content: contentArray });
        } else if (joinedText) {
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
   * Convert tools to OpenAI format
   */
  private convertToolsForOpenAI(tools: readonly unknown[] | undefined): Array<Record<string, unknown>> | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map(tool => {
      const t = tool as Record<string, unknown>;
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

  // ============================================================================
  // Anthropic Format Conversion
  // ============================================================================

  /**
   * Convert VS Code messages to Anthropic format
   * Note: Anthropic uses a different structure - system message is separate
   */
  private convertMessagesForAnthropic(
    messages: readonly LanguageModelChatRequestMessage[]
  ): { messages: AnthropicMessage[]; systemPrompt: string | null } {
    const result: AnthropicMessage[] = [];
    let systemPrompt: string | null = null;

    for (const msg of messages) {
      const role = this.mapRole(msg.role);
      const { textParts, imageParts, toolCalls, toolResults } = this.extractMessageParts(msg);
      const joinedText = textParts.join('').trim();

      // System messages are handled separately in Anthropic
      if (role === 'system') {
        if (joinedText) {
          systemPrompt = joinedText;
        }
        continue;
      }

      // Build content blocks
      const contentBlocks: AnthropicContentBlock[] = [];

      // Add text content
      if (joinedText) {
        contentBlocks.push({ type: 'text', text: joinedText });
      }

      // Add images
      for (const img of imageParts) {
        const base64Data = this.uint8ArrayToBase64(img.data);
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: base64Data },
        });
      }

      // Add tool calls (assistant only)
      if (role === 'assistant') {
        for (const tc of toolCalls) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.arguments);
          } catch {
            input = {};
          }
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input,
          });
        }
      }

      // Add tool results (user messages in Anthropic)
      if (role === 'user') {
        for (const tr of toolResults) {
          contentBlocks.push({
            type: 'tool_result',
            tool_use_id: tr.callId,
            content: tr.content,
          });
        }
      }

      // Only add message if we have content
      if (contentBlocks.length > 0) {
        // Anthropic only supports 'user' and 'assistant' roles
        const anthropicRole = role === 'assistant' ? 'assistant' : 'user';
        result.push({ role: anthropicRole, content: contentBlocks });
      }
    }

    return { messages: result, systemPrompt };
  }

  /**
   * Convert tools to Anthropic format
   */
  private convertToolsForAnthropic(tools: readonly unknown[] | undefined): AnthropicTool[] | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map(tool => {
      const t = tool as Record<string, unknown>;
      if ('name' in t && 'description' in t) {
        return {
          name: this.sanitizeFunctionName(t.name as string),
          description: t.description as string | undefined,
          input_schema: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
        };
      }
      if (t.type === 'function' && t.function) {
        const func = t.function as Record<string, unknown>;
        return {
          name: this.sanitizeFunctionName(func.name as string),
          description: func.description as string | undefined,
          input_schema: (func.parameters as Record<string, unknown>) ?? { type: 'object', properties: {} },
        };
      }
      return {
        name: 'unknown_tool',
        input_schema: { type: 'object', properties: {} },
      };
    });
  }

  // ============================================================================
  // Common Message Part Extraction
  // ============================================================================

  /**
   * Extract different part types from a message
   */
  private extractMessageParts(msg: LanguageModelChatRequestMessage): {
    textParts: string[];
    imageParts: Array<{ mimeType: string; data: Uint8Array }>;
    toolCalls: Array<{ id: string; name: string; arguments: string }>;
    toolResults: Array<{ callId: string; content: string }>;
  } {
    const textParts: string[] = [];
    const imageParts: Array<{ mimeType: string; data: Uint8Array }> = [];
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
    const toolResults: Array<{ callId: string; content: string }> = [];

    for (const part of msg.content ?? []) {
      if (part instanceof vscode.LanguageModelTextPart) {
        textParts.push(part.value);
      } else if (part instanceof vscode.LanguageModelDataPart) {
        if (this.isImageMimeType(part.mimeType)) {
          imageParts.push({ mimeType: part.mimeType, data: part.data });
        }
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        const id = part.callId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        let args = '{}';
        try {
          args = typeof part.input === 'string' ? part.input : JSON.stringify(part.input ?? {});
        } catch {
          args = '{}';
        }
        toolCalls.push({ id, name: part.name, arguments: args });
      } else if (this.isToolResultPart(part)) {
        const toolResult = part as { callId?: string; content?: readonly unknown[] };
        const callId = toolResult.callId ?? '';
        const content = this.collectToolResultText(toolResult.content);
        toolResults.push({ callId, content });
      }
    }

    return { textParts, imageParts, toolCalls, toolResults };
  }

  // ============================================================================
  // Streaming Response Processing
  // ============================================================================

  /**
   * Process OpenAI format streaming response (SSE)
   */
  private async processOpenAIStreamingResponse(
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

    try {
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
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Process Anthropic format streaming response (SSE)
   * @see https://docs.anthropic.com/en/api/messages-streaming
   */
  private async processAnthropicStreamingResponse(
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

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim() === '') {
            continue;
          }

          if (!line.startsWith('data: ')) {
            continue;
          }

          const data = line.slice(6);

          try {
            const chunk = JSON.parse(data);

            // Handle different Anthropic event types
            switch (chunk.type) {
              case 'content_block_start':
                if (chunk.content_block?.type === 'tool_use') {
                  const idx = chunk.index ?? 0;
                  toolCallBuffers.set(idx, {
                    id: chunk.content_block.id || '',
                    name: chunk.content_block.name || '',
                    arguments: '',
                  });
                }
                break;

              case 'content_block_delta':
                if (chunk.delta?.type === 'text_delta' && chunk.delta?.text) {
                  progress.report(new vscode.LanguageModelTextPart(chunk.delta.text));
                } else if (chunk.delta?.type === 'input_json_delta' && chunk.delta?.partial_json) {
                  const idx = chunk.index ?? 0;
                  const existing = toolCallBuffers.get(idx);
                  if (existing) {
                    existing.arguments += chunk.delta.partial_json;
                  }
                }
                break;

              case 'content_block_stop':
              case 'message_stop':
                // Flush tool calls on message end
                this.flushToolCalls(toolCallBuffers, progress);
                break;

              case 'error':
                const errorType = chunk.error?.type || 'unknown_error';
                const errorMessage = chunk.error?.message || 'Anthropic API streaming error';
                console.error(`[Anthropic] Streaming error: ${errorType} - ${errorMessage}`);
                break;

              // Ignore: message_start, message_delta, ping
              default:
                break;
            }
          } catch (e) {
            console.error('[Anthropic] Failed to parse SSE chunk:', e, 'data:', data);
          }
        }
      }
    } finally {
      reader.releaseLock();
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
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.arguments) as Record<string, unknown>;
        } catch {
          // Keep empty object if not valid JSON
        }
        progress.report(new vscode.LanguageModelToolCallPart(tc.id, tc.name, parsedArgs));
      }
    }
    buffers.clear();
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

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
