/**
 * Provider Helpers for VS Code Language Model Chat
 * Templates use these functions to implement their providers
 */

import type { ApiMode, ProviderConfig, ModelConfig } from '../core/types';

// ============================================================================
// OpenAI Format Types
// ============================================================================

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | OpenAIContentPart[];
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    strict?: boolean;
  };
}

// ============================================================================
// Anthropic Format Types
// ============================================================================

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

// ============================================================================
// Remote Model Types
// ============================================================================

export interface ModelsResponse {
  object?: string;
  data: RemoteModel[];
}

export interface RemoteModel {
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
// VS Code Message Part Types (simplified for SDK)
// ============================================================================

export const ROLE = {
  System: 1,
  User: 2,
  Assistant: 3,
} as const;

export interface VsCodeTextPart {
  value: string;
}

export interface VsCodeToolCallPart {
  callId: string;
  name: string;
  input: Record<string, unknown>;
}

export interface VsCodeToolResultPart {
  callId: string;
  content: unknown[];
}

export interface VsCodeDataPart {
  mimeType: string;
  data: Uint8Array;
}

export type VsCodeContentPart = VsCodeTextPart | VsCodeToolCallPart | VsCodeToolResultPart | VsCodeDataPart;

export interface VsCodeMessage {
  role: number;
  content?: ReadonlyArray<VsCodeContentPart>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if part is a text part
 */
export function isTextPart(part: unknown): part is VsCodeTextPart {
  return part !== null && typeof part === 'object' && 'value' in part && typeof (part as VsCodeTextPart).value === 'string';
}

/**
 * Check if part is a tool call part
 */
export function isToolCallPart(part: unknown): part is VsCodeToolCallPart {
  return part !== null && typeof part === 'object' && 'callId' in part && 'name' in part && 'input' in part;
}

/**
 * Check if part is a tool result part
 */
export function isToolResultPart(part: unknown): part is VsCodeToolResultPart {
  return part !== null && typeof part === 'object' && 'callId' in part && 'content' in part && !('name' in part);
}

/**
 * Check if part is a data part (image)
 */
export function isDataPart(part: unknown): part is VsCodeDataPart {
  return part !== null && typeof part === 'object' && 'mimeType' in part && 'data' in part;
}

// ============================================================================
// Message Conversion Functions
// ============================================================================

/**
 * Convert VS Code messages to OpenAI format
 */
export function convertToOpenAI(messages: readonly VsCodeMessage[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  for (const msg of messages) {
    const role = msg.role === ROLE.System ? 'system' :
                 msg.role === ROLE.User ? 'user' : 'assistant';

    if (!msg.content || msg.content.length === 0) {
      result.push({ role, content: '' });
      continue;
    }

    // Check for tool calls (assistant)
    const toolCalls = msg.content.filter(isToolCallPart);
    if (toolCalls.length > 0) {
      result.push({
        role: 'assistant',
        content: undefined,
        tool_calls: toolCalls.map(tc => ({
          id: tc.callId,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.input),
          },
        })),
      });
      continue;
    }

    // Check for tool results
    const toolResults = msg.content.filter(isToolResultPart);
    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        const contentStr = tr.content.map(c => {
          if (isTextPart(c)) return c.value;
          return JSON.stringify(c);
        }).join('\n');
        result.push({
          role: 'tool',
          tool_call_id: tr.callId,
          content: contentStr,
        });
      }
      continue;
    }

    // Regular content (text and images)
    const parts: OpenAIContentPart[] = [];
    for (const part of msg.content) {
      if (isTextPart(part)) {
        parts.push({ type: 'text', text: part.value });
      } else if (isDataPart(part)) {
        const base64 = Buffer.from(part.data).toString('base64');
        const dataUrl = `data:${part.mimeType};base64,${base64}`;
        parts.push({ type: 'image_url', image_url: { url: dataUrl } });
      }
    }

    if (parts.length === 1 && parts[0].type === 'text') {
      result.push({ role, content: parts[0].text });
    } else if (parts.length > 0) {
      result.push({ role, content: parts });
    }
  }

  return result;
}

/**
 * Convert VS Code messages to Anthropic format
 */
export function convertToAnthropic(messages: readonly VsCodeMessage[]): { system?: string; messages: AnthropicMessage[] } {
  const result: AnthropicMessage[] = [];
  let systemPrompt: string | undefined;

  for (const msg of messages) {
    // Extract system message
    if (msg.role === ROLE.System) {
      const textParts = (msg.content || []).filter(isTextPart);
      if (textParts.length > 0) {
        systemPrompt = textParts.map(p => p.value).join('\n');
      }
      continue;
    }

    const role = msg.role === ROLE.User ? 'user' : 'assistant';

    if (!msg.content || msg.content.length === 0) {
      continue;
    }

    const content: AnthropicContentBlock[] = [];

    for (const part of msg.content) {
      if (isTextPart(part)) {
        content.push({ type: 'text', text: part.value });
      } else if (isDataPart(part)) {
        const base64 = Buffer.from(part.data).toString('base64');
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: part.mimeType,
            data: base64,
          },
        });
      } else if (isToolCallPart(part)) {
        content.push({
          type: 'tool_use',
          id: part.callId,
          name: part.name,
          input: part.input,
        });
      } else if (isToolResultPart(part)) {
        const resultText = part.content.map(c => {
          if (isTextPart(c)) return c.value;
          return JSON.stringify(c);
        }).join('\n');
        content.push({
          type: 'tool_result',
          tool_use_id: part.callId,
          content: resultText,
        });
      }
    }

    if (content.length > 0) {
      result.push({ role, content });
    }
  }

  return { system: systemPrompt, messages: result };
}

// ============================================================================
// Tool Conversion Functions
// ============================================================================

/**
 * Sanitize function name for API compatibility
 */
function sanitizeFunctionName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64);
}

/**
 * Convert VS Code tools to OpenAI format
 */
export function convertToolsToOpenAI(tools: readonly unknown[] | undefined): OpenAITool[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map((tool: unknown) => {
    const t = tool as { name: string; description?: string; inputSchema?: Record<string, unknown> };
    return {
      type: 'function' as const,
      function: {
        name: sanitizeFunctionName(t.name),
        description: t.description,
        parameters: t.inputSchema,
      },
    };
  });
}

/**
 * Convert VS Code tools to Anthropic format
 */
export function convertToolsToAnthropic(tools: readonly unknown[] | undefined): AnthropicTool[] | undefined {
  if (!tools || tools.length === 0) return undefined;

  return tools.map((tool: unknown) => {
    const t = tool as { name: string; description?: string; inputSchema?: Record<string, unknown> };
    return {
      name: sanitizeFunctionName(t.name),
      description: t.description,
      input_schema: t.inputSchema || { type: 'object', properties: {} },
    };
  });
}

// ============================================================================
// Model Fetching
// ============================================================================

/**
 * Fetch models from API with caching
 */
export async function fetchModelsFromAPI(
  baseUrl: string,
  apiKey: string,
  config: ProviderConfig,
  cache: { models: ModelConfig[] | null; lastFetch: number }
): Promise<ModelConfig[]> {
  // Check cache
  const cacheTTL = config.modelsCacheTTL || 5 * 60 * 1000;
  if (cache.models && Date.now() - cache.lastFetch < cacheTTL) {
    return cache.models;
  }

  // Build models endpoint URL
  const modelsUrl = baseUrl.replace(/\/chat\/completions\/?$/, '/models');

  const response = await fetch(modelsUrl, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...config.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  const data = await response.json() as ModelsResponse;

  const models = data.data.map((m: RemoteModel) => ({
    id: m.id,
    name: m.id,
    maxInputTokens: m.context_length || config.defaultContextLength,
    maxOutputTokens: m.max_tokens || m.max_completion_tokens || config.defaultMaxOutputTokens,
    supportsTools: m.capabilities?.function_calling ?? m.capabilities?.tool_use ?? config.supportsTools,
    supportsVision: m.capabilities?.vision ?? config.supportsVision,
  }));

  // Update cache
  cache.models = models;
  cache.lastFetch = Date.now();

  return models;
}

// ============================================================================
// Streaming Response Processing
// ============================================================================

/**
 * Buffered tool call for accumulating streaming chunks
 */
interface ToolCallBuffer {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Process OpenAI streaming response
 */
export async function processOpenAIStream(
  response: Response,
  onText: (text: string) => void,
  onToolCall: (callId: string, name: string, args: Record<string, unknown>) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  const toolCallBuffers: Map<number, ToolCallBuffer> = new Map();

  const flushToolCalls = () => {
    for (const [, tc] of toolCallBuffers) {
      try {
        const args = tc.arguments ? JSON.parse(tc.arguments) : {};
        onToolCall(tc.id, tc.name, args);
      } catch (e) {
        console.warn('Failed to parse tool arguments:', e);
        onToolCall(tc.id, tc.name, {});
      }
    }
    toolCallBuffers.clear();
  };

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) {
        flushToolCalls();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          flushToolCalls();
          continue;
        }

        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta;

          if (delta?.content) {
            onText(delta.content);
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              if (!toolCallBuffers.has(index)) {
                toolCallBuffers.set(index, {
                  id: tc.id || '',
                  name: tc.function?.name || '',
                  arguments: '',
                });
              }
              const buf = toolCallBuffers.get(index)!;
              if (tc.id) buf.id = tc.id;
              if (tc.function?.name) buf.name = tc.function.name;
              if (tc.function?.arguments) buf.arguments += tc.function.arguments;
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Process Anthropic streaming response
 */
export async function processAnthropicStream(
  response: Response,
  onText: (text: string) => void,
  onToolCall: (callId: string, name: string, args: Record<string, unknown>) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let currentToolId = '';
  let currentToolName = '';
  let currentToolArgs = '';

  const flushToolCall = () => {
    if (currentToolId && currentToolName) {
      try {
        const args = currentToolArgs ? JSON.parse(currentToolArgs) : {};
        onToolCall(currentToolId, currentToolName, args);
      } catch (e) {
        console.warn('Failed to parse tool arguments:', e);
        onToolCall(currentToolId, currentToolName, {});
      }
      currentToolId = '';
      currentToolName = '';
      currentToolArgs = '';
    }
  };

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) {
        flushToolCall();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('event:')) {
          const event = trimmed.slice(6).trim();
          if (event === 'content_block_stop') {
            flushToolCall();
          }
          continue;
        }

        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();

        try {
          const chunk = JSON.parse(data);

          if (chunk.type === 'content_block_start') {
            if (chunk.content_block?.type === 'tool_use') {
              currentToolId = chunk.content_block.id;
              currentToolName = chunk.content_block.name;
              currentToolArgs = '';
            }
          } else if (chunk.type === 'content_block_delta') {
            const delta = chunk.delta;
            if (delta?.type === 'text_delta' && delta.text) {
              onText(delta.text);
            } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
              currentToolArgs += delta.partial_json;
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// Request Building
// ============================================================================

/**
 * Build request body based on API mode
 */
export function buildRequestBody(
  apiMode: ApiMode,
  modelId: string,
  messages: readonly VsCodeMessage[],
  tools: readonly unknown[] | undefined,
  maxTokens: number
): { url?: string; headers?: Record<string, string>; body: object } {
  if (apiMode === 'anthropic') {
    const { system, messages: anthropicMessages } = convertToAnthropic(messages);
    return {
      body: {
        model: modelId,
        system,
        messages: anthropicMessages,
        tools: convertToolsToAnthropic(tools),
        max_tokens: maxTokens,
        stream: true,
      },
    };
  } else {
    // OpenAI format (also used by Gemini, Ollama compatible endpoints)
    return {
      body: {
        model: modelId,
        messages: convertToOpenAI(messages),
        tools: convertToolsToOpenAI(tools),
        max_tokens: maxTokens,
        stream: true,
      },
    };
  }
}

/**
 * Token estimation
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(message: VsCodeMessage): number {
  return Math.ceil(JSON.stringify(message).length / 4);
}
