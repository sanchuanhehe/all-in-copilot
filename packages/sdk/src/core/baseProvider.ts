/**
 * Base provider interface for LLM implementations
 * All provider implementations should extend this class
 */

import type {
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  StreamingHandler,
  ProviderConfig,
  ModelConfig,
  ToolDefinition,
} from './types';

/**
 * Abstract base class for LLM providers
 * Provides common functionality for all providers
 */
export abstract class BaseLLMProvider {
  protected config: ProviderConfig;
  protected modelConfigs = new Map<string, ModelConfig>();

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * Get the provider configuration
   */
  getConfig(): ProviderConfig {
    return this.config;
  }

  /**
   * Get provider ID
   */
  getId(): string {
    return this.config.id;
  }

  /**
   * Get provider name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Register a model configuration
   */
  registerModel(model: ModelConfig): void {
    this.modelConfigs.set(model.id, model);
  }

  /**
   * Get all registered models
   */
  getModels(): ModelConfig[] {
    return Array.from(this.modelConfigs.values());
  }

  /**
   * Get a specific model configuration
   */
  getModel(modelId: string): ModelConfig | undefined {
    return this.modelConfigs.get(modelId);
  }

  /**
   * Get available model IDs for this provider
   */
  getModelIds(): string[] {
    return Array.from(this.modelConfigs.keys());
  }

  /**
   * Abstract method to fetch available models
   * Override this to implement provider-specific model discovery
   */
  abstract fetchModels(): Promise<ModelConfig[]>;

  /**
   * Abstract method to send chat completion request
   * Override this to implement provider-specific API calls
   */
  abstract complete(
    request: ChatCompletionRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ChatCompletionResponse>;

  /**
   * Abstract method to send streaming chat completion request
   * Override this to implement provider-specific streaming
   */
  abstract completeStream(
    request: ChatCompletionRequest,
    handler: StreamingHandler,
    options?: { signal?: AbortSignal }
  ): Promise<void>;

  /**
   * Convert messages to provider-specific format
   * Override this if the provider requires special message format
   */
  convertMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages;
  }

  /**
   * Build request body for API call
   * Override this to customize request body construction
   */
  buildRequestBody(
    model: string,
    messages: ChatMessage[],
    options?: {
      tools?: ToolDefinition[];
      maxTokens?: number;
      temperature?: number;
      includeReasoning?: boolean;
    }
  ): ChatCompletionRequest {
    return {
      model,
      messages,
      tools: options?.tools,
      max_tokens: options?.maxTokens,
      temperature: options?.temperature,
      include_reasoning: options?.includeReasoning,
    };
  }

  /**
   * Estimate token count for a message
   * Simple approximation: 1 token ≈ 4 characters
   */
  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate token count for messages
   */
  estimateMessagesTokenCount(messages: ChatMessage[]): number {
    let total = 0;
    for (const message of messages) {
      const content = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);
      total += this.estimateTokenCount(content);
      // Add overhead for role and name
      total += this.estimateTokenCount(message.role);
      if (message.name) {
        total += this.estimateTokenCount(message.name);
      }
    }
    return total;
  }

  /**
   * Get default request headers
   */
  protected getDefaultHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    // Add custom headers from config
    if (this.config.headers) {
      Object.assign(headers, this.config.headers);
    }

    return headers;
  }

  /**
   * Apply rate limiting delay if configured
   */
  protected async applyDelay(): Promise<void> {
    const delay = this.config.requestDelay;
    if (delay && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Parse JSON from string, handling common errors
   */
  protected tryParseJSON<T>(str: string, fallback: T): T {
    try {
      return JSON.parse(str) as T;
    } catch {
      return fallback;
    }
  }

  /**
   * Validate API response
   */
  protected validateResponse(response: unknown): response is ChatCompletionResponse {
    if (!response || typeof response !== 'object') {
      return false;
    }
    const resp = response as Record<string, unknown>;
    return (
      resp.id !== undefined &&
      resp.choices !== undefined &&
      Array.isArray(resp.choices)
    );
  }
}
