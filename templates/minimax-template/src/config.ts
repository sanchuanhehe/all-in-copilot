/**
 * MiniMax Provider Configuration
 * ===========================
 * This is the only file you need to edit to create a new provider!
 * All types and functionality are imported from @all-in-copilot/sdk
 */

import type { ProviderConfig, ModelConfig } from '@all-in-copilot/sdk';

/**
 * MiniMax Provider Configuration
 * Edit these values to customize your provider
 */
export const PROVIDER_CONFIG: ProviderConfig = {
  // Provider identity
  id: 'minimax',
  name: 'MiniMax',
  family: 'minimax',

  // API configuration
  baseUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
  apiKeySecret: 'minimax-copilot.apiKey',
  apiMode: 'openai', // MiniMax uses OpenAI-compatible API format

  // Capabilities
  supportsTools: true,
  supportsVision: false,

  // Token limits
  defaultMaxOutputTokens: 8192,
  defaultContextLength: 100000,

  // Dynamic model fetching
  dynamicModels: true,
  modelsCacheTTL: 5 * 60 * 1000, // 5 minutes
};

/**
 * Fallback MiniMax Models (used when dynamic fetch fails)
 */
export const FALLBACK_MODELS: ModelConfig[] = [
  {
    id: 'minimax-abab6.5s-chat',
    name: 'MiniMax abab6.5s-chat',
    maxInputTokens: 90000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: false,
  },
  {
    id: 'minimax-abab6.5-chat',
    name: 'MiniMax abab6.5-chat',
    maxInputTokens: 100000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: false,
  },
  {
    id: 'minimax-abab5.5-chat',
    name: 'MiniMax abab5.5-chat',
    maxInputTokens: 16000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
  },
];

/**
 * Filter models (customize which models to show)
 * This allows you to filter the dynamic model list
 */
export function filterModels(models: ModelConfig[]): ModelConfig[] {
  // Show all MiniMax chat models
  return models.filter(m => m.id.includes('chat') || m.id.includes('abab'));
}
