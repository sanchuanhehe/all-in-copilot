/**
 * Provider Helpers for VS Code Language Model Chat
 * Templates use these functions to implement their providers
 */

import type { ApiMode, ProviderConfig, ModelConfig } from '../core/types';
import { sanitizeFunctionName } from '../utils/toolConverter';

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

/** Text block for Anthropic API */
export interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

/** Image block for Anthropic API */
export interface AnthropicImageBlock {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
}

/** Tool use block for Anthropic API (assistant messages) */
export interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Tool result block for Anthropic API (user messages) */
export interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  /** Content can be a string or array of text/image blocks */
  content: string | (AnthropicTextBlock | AnthropicImageBlock)[];
}

export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

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

/**
 * VS Code LanguageModelChatMessageRole enum values
 * These match the actual vscode.LanguageModelChatMessageRole values:
 * - User = 1 (stable API)
 * - Assistant = 2 (stable API)
 * - System = 3 (proposed API via languageModelSystem proposal)
 */
export const ROLE = {
  User: 1,
  Assistant: 2,
  System: 3,
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

/**
 * Check if part is a cache control marker (VS Code Copilot internal)
 * These are special markers that should be converted to Anthropic cache_control
 */
export function isCacheControlPart(part: unknown): boolean {
  return isDataPart(part) && (part as VsCodeDataPart).mimeType === 'cache_control';
}

/**
 * Check if part is a real image (not a cache control marker)
 */
export function isImagePart(part: unknown): part is VsCodeDataPart {
  return isDataPart(part) && (part as VsCodeDataPart).mimeType !== 'cache_control' &&
    (part as VsCodeDataPart).mimeType.startsWith('image/');
}

// ============================================================================
// Message Conversion Functions
// ============================================================================

/**
 * Convert VS Code messages to OpenAI format
 * VS Code LanguageModelChatMessageRole values:
 * - User = 1, Assistant = 2, System = 3 (proposed API)
 */
export function convertToOpenAI(messages: readonly VsCodeMessage[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  for (const msg of messages) {
    // Map VS Code role to OpenAI role
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
          if (isTextPart(c)) {
            return c.value;
          }
          if (isCacheControlPart(c)) {
            // Skip cache_control markers
            return '';
          }
          return JSON.stringify(c);
        }).filter(s => s).join('\n');
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
      } else if (isCacheControlPart(part)) {
        // Skip cache_control markers in OpenAI format
        continue;
      } else if (isImagePart(part)) {
        // Only process real images
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
 * Convert VS Code content parts to Anthropic content blocks for ASSISTANT messages
 * Only includes: text and tool_use blocks
 */
function apiContentToAnthropicContentForAssistant(content: ReadonlyArray<VsCodeContentPart>): AnthropicContentBlock[] {
  const convertedContent: AnthropicContentBlock[] = [];

  for (const part of content) {
    if (isToolCallPart(part)) {
      // tool_use is valid in assistant messages
      convertedContent.push({
        type: 'tool_use',
        id: part.callId,
        input: part.input,
        name: part.name,
      });
    } else if (isTextPart(part)) {
      // Anthropic errors if we have text parts with empty string text content
      if (part.value === '') {
        continue;
      }
      convertedContent.push({
        type: 'text',
        text: part.value
      });
    }
    // Ignore tool_result and images in assistant messages (shouldn't happen but be safe)
  }
  return convertedContent;
}

/**
 * Convert VS Code content parts to Anthropic content blocks for USER messages
 * Only includes: text, image, and tool_result blocks
 * tool_use blocks are NOT valid in user messages!
 */
function apiContentToAnthropicContentForUser(content: ReadonlyArray<VsCodeContentPart>): AnthropicContentBlock[] {
  const convertedContent: AnthropicContentBlock[] = [];

  for (const part of content) {
    if (isImagePart(part)) {
      // Only process real images, not cache_control markers
      convertedContent.push({
        type: 'image',
        source: {
          type: 'base64',
          data: Buffer.from(part.data).toString('base64'),
          media_type: part.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
        }
      });
    } else if (isCacheControlPart(part)) {
      // Skip cache_control markers - they are VS Code internal and not real content
      // Some providers like MiniMax don't support cache_control
      continue;
    } else if (isToolResultPart(part)) {
      // Convert tool result content to text/image blocks
      const resultBlocks: (AnthropicTextBlock | AnthropicImageBlock)[] = [];
      for (const c of part.content || []) {
        if (isTextPart(c)) {
          // Skip empty text blocks
          if (c.value && c.value.trim() !== '') {
            resultBlocks.push({ type: 'text', text: c.value });
          }
        } else if (isCacheControlPart(c)) {
          // Skip cache_control markers in tool results
          continue;
        } else if (isImagePart(c)) {
          // Only process real images, not cache_control markers
          resultBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: (c as VsCodeDataPart).mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: Buffer.from((c as VsCodeDataPart).data).toString('base64')
            }
          });
        }
      }
      // Use string format for empty or simple text results (more compatible with some providers)
      if (resultBlocks.length === 0) {
        convertedContent.push({
          type: 'tool_result',
          tool_use_id: part.callId,
          content: '',
        });
      } else if (resultBlocks.length === 1 && resultBlocks[0].type === 'text') {
        convertedContent.push({
          type: 'tool_result',
          tool_use_id: part.callId,
          content: resultBlocks[0].text,
        });
      } else {
        convertedContent.push({
          type: 'tool_result',
          tool_use_id: part.callId,
          content: resultBlocks,
        });
      }
    } else if (isTextPart(part)) {
      // Anthropic errors if we have text parts with empty string text content
      if (part.value === '') {
        continue;
      }
      convertedContent.push({
        type: 'text',
        text: part.value
      });
    }
    // IMPORTANT: Ignore tool_use (isToolCallPart) in user messages - they are invalid!
  }
  return convertedContent;
}

/**
 * Convert VS Code messages to Anthropic format
 * Based on official VS Code Copilot Chat BYOK implementation.
 *
 * IMPORTANT: Anthropic API has strict rules about content types per role:
 * - assistant messages: can contain text and tool_use
 * - user messages: can contain text, image, and tool_result (but NOT tool_use!)
 *
 * VS Code LanguageModelChatMessageRole values:
 * - User = 1, Assistant = 2, System = 3 (proposed API)
 */
export function convertToAnthropic(messages: readonly VsCodeMessage[]): { system?: string; messages: AnthropicMessage[] } {
  const unmergedMessages: AnthropicMessage[] = [];
  let systemText = '';

  for (const message of messages) {
    if (message.role === ROLE.Assistant) {
      const content = apiContentToAnthropicContentForAssistant(message.content || []);
      // Only add message if it has content
      if (content.length > 0) {
        unmergedMessages.push({
          role: 'assistant',
          content,
        });
      }
    } else if (message.role === ROLE.User) {
      const content = apiContentToAnthropicContentForUser(message.content || []);
      // Only add message if it has content
      if (content.length > 0) {
        unmergedMessages.push({
          role: 'user',
          content,
        });
      }
    } else if (message.role === ROLE.System) {
      // System message (role = 3) - extract text content
      // This is from the proposed languageModelSystem API
      systemText += (message.content || []).map(p => {
        if (isTextPart(p)) {
          return p.value;
        }
        return '';
      }).join('');
    }
  }

  // Merge messages of the same type that are adjacent together, this is what anthropic expects
  const mergedMessages: AnthropicMessage[] = [];
  for (const message of unmergedMessages) {
    if (mergedMessages.length === 0 || mergedMessages[mergedMessages.length - 1].role !== message.role) {
      mergedMessages.push(message);
    } else {
      // Merge with the previous message of the same role
      const prevMessage = mergedMessages[mergedMessages.length - 1];
      // Concat the content arrays if they're both arrays
      if (Array.isArray(prevMessage.content) && Array.isArray(message.content)) {
        (prevMessage.content as AnthropicContentBlock[]).push(...(message.content as AnthropicContentBlock[]));
      }
    }
  }

  // Anthropic API requires messages to start with 'user' role
  if (mergedMessages.length > 0 && mergedMessages[0].role === 'assistant') {
    mergedMessages.unshift({ role: 'user', content: [{ type: 'text', text: '(continue)' }] });
  }

  // Ensure we have at least one message
  if (mergedMessages.length === 0) {
    mergedMessages.push({ role: 'user', content: [{ type: 'text', text: '(start)' }] });
  }

  return { system: systemText || undefined, messages: mergedMessages };
}

// ============================================================================
// Tool Conversion Functions
// ============================================================================

/**
 * Convert VS Code tools to OpenAI format
 */
export function convertToolsToOpenAI(tools: readonly unknown[] | undefined): OpenAITool[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

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
  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool: unknown) => {
    const t = tool as { name: string; description?: string; inputSchema?: Record<string, unknown> };
    const result: AnthropicTool = {
      name: sanitizeFunctionName(t.name),
      input_schema: t.inputSchema || { type: 'object', properties: {} },
    };
    // Only add description if it exists and is non-empty
    if (t.description && t.description.trim()) {
      result.description = t.description;
    }
    return result;
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
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  const toolCallBuffers = new Map<number, ToolCallBuffer>();

  const flushToolCalls = () => {
    for (const [, tc] of toolCallBuffers) {
      try {
        const args = tc.arguments ? JSON.parse(tc.arguments) : {};
        onToolCall(tc.id, tc.name, args);
      } catch {
        console.warn('Failed to parse tool arguments');
        onToolCall(tc.id, tc.name, {});
      }
    }
    toolCallBuffers.clear();
  };

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }

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
        if (!trimmed || !trimmed.startsWith('data:')) {
          continue;
        }

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
              if (tc.id) {
                buf.id = tc.id;
              }
              if (tc.function?.name) {
                buf.name = tc.function.name;
              }
              if (tc.function?.arguments) {
                buf.arguments += tc.function.arguments;
              }
            }
          }
        } catch {
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
  if (!reader) {
    throw new Error('No response body');
  }

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
      } catch {
        console.warn('Failed to parse tool arguments');
        onToolCall(currentToolId, currentToolName, {});
      }
      currentToolId = '';
      currentToolName = '';
      currentToolArgs = '';
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }

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
        if (!trimmed) {
          continue;
        }

        if (trimmed.startsWith('event:')) {
          const event = trimmed.slice(6).trim();
          if (event === 'content_block_stop') {
            flushToolCall();
          }
          continue;
        }

        if (!trimmed.startsWith('data:')) {
          continue;
        }
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
        } catch {
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

// ============================================================================
// Message Order Validation
// ============================================================================

/**
 * Anthropic API has strict requirements for message order:
 * 1. Must start with a user message
 * 2. Must alternate between user and assistant roles
 *
 * This function ensures messages meet these requirements.
 */
export function ensureValidMessageOrder(
  messages: AnthropicMessage[]
): AnthropicMessage[] {
  if (messages.length === 0) {
    return [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }];
  }

  const result: AnthropicMessage[] = [];

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
      result.push({ ...msg, content: [...msg.content] });
    }
  }

  return result;
}

// ============================================================================
// Request Building for Templates
// ============================================================================

/**
 * Build request body for templates - simplifies provider implementation
 * This is a template-friendly wrapper around buildRequestBody that handles
 * Anthropic-specific requirements like message ordering.
 */
export function buildRequest(
  apiMode: ApiMode,
  modelId: string,
  messages: readonly VsCodeMessage[],
  tools: readonly unknown[] | undefined,
  maxTokens: number
): Record<string, unknown> {
  if (apiMode === 'anthropic') {
    const { system, messages: anthropicMessages } = convertToAnthropic(messages);
    const toolsAnthropic = convertToolsToAnthropic(tools);

    // Filter out messages with empty content (some providers don't accept them)
    const validMessages = anthropicMessages.filter(msg => {
      if (Array.isArray(msg.content)) {
        return msg.content.length > 0;
      }
      return true;
    });

    // Ensure alternating user/assistant pattern and starts with user
    const finalMessages = ensureValidMessageOrder(validMessages);

    // Build base request - only include fields that have values
    const request: Record<string, unknown> = {
      model: modelId,
      messages: finalMessages,
      max_tokens: maxTokens,
      stream: true,
    };

    // Only add system if not empty
    if (system) {
      request.system = system;
    }

    // Only add tools if there are any
    if (toolsAnthropic && toolsAnthropic.length > 0) {
      request.tools = toolsAnthropic;
    }

    return request;
  } else {
    // OpenAI format
    const toolsOpenAI = convertToolsToOpenAI(tools);
    const request: Record<string, unknown> = {
      model: modelId,
      messages: convertToOpenAI(messages),
      max_tokens: maxTokens,
      stream: true,
    };

    if (toolsOpenAI && toolsOpenAI.length > 0) {
      request.tools = toolsOpenAI;
    }

    return request;
  }
}
