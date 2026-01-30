/**
 * SDK Main Entry Point
 */

// Core types
export {
  ApiMode,
  ProviderConfig,
  ModelConfig,
  MessageRole,
  TextContent,
  ImageContent,
  MessageContent,
  ChatMessage,
  ToolCall,
} from './core/types';

// Model fetcher
export {
  fetchModels,
  createCachedModelFetcher,
  CachedModelFetcher,
  type ModelsResponse,
  type RemoteModelItem,
  type ModelFetchOptions,
} from './core/modelFetcher';

// VS Code Provider Helpers (the main export for templates)
export {
  // Message types
  ROLE,
  type VsCodeMessage,
  type VsCodeTextPart,
  type VsCodeToolCallPart,
  type VsCodeToolResultPart,
  type VsCodeDataPart,
  type VsCodeContentPart,
  // OpenAI types
  type OpenAIMessage,
  type OpenAIContentPart,
  type OpenAIToolCall,
  type OpenAITool,
  // Anthropic types
  type AnthropicMessage,
  type AnthropicContentBlock,
  type AnthropicTool,
  // Type guards
  isTextPart,
  isToolCallPart,
  isToolResultPart,
  isDataPart,
  // Message conversion
  convertToOpenAI,
  convertToAnthropic,
  // Tool conversion
  convertToolsToOpenAI,
  convertToolsToAnthropic,
  // Model fetching
  fetchModelsFromAPI,
  // Streaming processors
  processOpenAIStream,
  processAnthropicStream,
  // Request building
  buildRequestBody,
  buildRequest,
  ensureValidMessageOrder,
  // Token estimation
  estimateTokens,
  estimateMessageTokens,
} from './vscode/providerHelpers';

// Providers (using official SDKs - for advanced use cases)
export { OpenAIProvider } from './providers/openaiProvider';
export { AnthropicProvider } from './providers/anthropicProvider';

// Utilities
export {
  mapVsCodeRole,
  convertVsCodeContent,
} from './utils/messageConverter';
export { estimateTokens as estimateTokensUtil, estimateMessagesTokens } from './utils/tokenCounter';
export { sanitizeFunctionName, pruneUnknownSchemaKeywords } from './utils/toolConverter';
