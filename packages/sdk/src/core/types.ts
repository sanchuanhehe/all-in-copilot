/**
 * Core type definitions for LLM SDK
 * These types are platform-agnostic and can be used in any JavaScript/TypeScript environment
 */

/**
 * API mode types - determines message format and request structure
 * - openai: OpenAI Chat Completions API format
 * - anthropic: Anthropic Messages API format
 * - gemini: Google Gemini API format
 * - ollama: Ollama native API format
 */
export type ApiMode = 'openai' | 'anthropic' | 'gemini' | 'ollama';

/**
 * Provider configuration for a specific LLM service
 */
export interface ProviderConfig {
  /** Unique identifier for the provider */
  id: string;
  /** Human-readable name displayed to users */
  name: string;
  /** Base URL for API requests */
  baseUrl: string;
  /** Secret storage key for API key */
  apiKeySecret: string;
  /** Model family for capability detection */
  family: string;
  /**
   * API mode - determines message format and request structure
   * @default 'openai'
   */
  apiMode: ApiMode;
  /** Whether this provider supports tool calling */
  supportsTools: boolean;
  /** Whether this provider supports vision/image input */
  supportsVision: boolean;
  /** Default maximum output tokens */
  defaultMaxOutputTokens: number;
  /** Default context length */
  defaultContextLength: number;
  /** Whether to fetch models dynamically from API */
  dynamicModels?: boolean;
  /** Cache TTL for dynamic models in milliseconds */
  modelsCacheTTL?: number;
  /** Request delay in milliseconds (rate limiting) */
  requestDelay?: number;
  /** Custom headers to include in requests */
  headers?: Record<string, string>;
}

/**
 * Model configuration for a specific model
 */
export interface ModelConfig {
  /** Unique model identifier */
  id: string;
  /** Human-readable model name */
  name: string;
  /** Maximum input tokens */
  maxInputTokens: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Whether model supports tool calling */
  supportsTools: boolean;
  /** Whether model supports vision */
  supportsVision: boolean;
  /** Provider ID this model belongs to (optional) */
  providerId?: string;
  /** Additional model metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Message role types
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Message content types
 */
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

export type MessageContent = TextContent | ImageContent;

/**
 * Chat message structure
 */
export interface ChatMessage {
  role: MessageRole;
  content: string | MessageContent[];
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * Tool call structure (OpenAI compatible)
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Tool definition for advertising available tools
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: object;
  };
}

/**
 * Request body for chat completions (OpenAI compatible)
 */
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  include_reasoning?: boolean;
}

/**
 * Response choice from chat completion
 */
export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
}

/**
 * Chat completion response
 */
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Streaming chunk from chat completion
 */
export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: string | null;
  }>;
}

/**
 * Provider capability information
 */
export interface ProviderCapabilities {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
  structuredOutput: boolean;
}

/**
 * SDK initialization options
 */
export interface SDKOptions {
  /** Provider configurations */
  providers: ProviderConfig[];
  /** Default provider ID */
  defaultProvider?: string;
  /** Global request delay in milliseconds */
  globalRequestDelay?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Streaming response handler
 */
export interface StreamingHandler {
  onText: (text: string, delta: boolean) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onToolCallStart: (name: string, args: string) => void;
  onToolCallChunk: (chunk: string) => void;
  onToolCallEnd: () => void;
  onThinking: (thinking: string) => void;
  onComplete: (response: ChatCompletionResponse) => void;
  onError: (error: Error) => void;
}
