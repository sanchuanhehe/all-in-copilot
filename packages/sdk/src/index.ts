/**
 * SDK Main Entry Point
 */

// Core types and model fetcher
export * from './core/types';
export {
  fetchModels,
  createCachedModelFetcher,
  CachedModelFetcher,
  type ModelsResponse,
  type RemoteModelItem,
  type ModelFetchOptions,
} from './core/modelFetcher';

// Providers (using official SDKs)
export { OpenAIProvider } from './providers/openaiProvider';
export { AnthropicProvider } from './providers/anthropicProvider';

// Utilities
export {
  mapVsCodeRole,
  convertVsCodeContent,
} from './utils/messageConverter';
export { estimateTokens, estimateMessagesTokens } from './utils/tokenCounter';
export { sanitizeFunctionName, pruneUnknownSchemaKeywords } from './utils/toolConverter';
