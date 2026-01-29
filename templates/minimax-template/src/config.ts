/**
 * MiniMax Provider Configuration
 */

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeySecret: string;
  family: string;
  supportsTools: boolean;
  supportsVision: boolean;
  defaultMaxOutputTokens: number;
  defaultContextLength: number;
  /** Whether to fetch models dynamically from API */
  dynamicModels: boolean;
  /** Cache TTL for dynamic models in milliseconds */
  modelsCacheTTL?: number;
}

export interface ModelConfig {
  id: string;
  name: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
}

/**
 * MiniMax Provider Configuration
 * Edit this file to customize your provider
 */
export const PROVIDER_CONFIG: ProviderConfig = {
  id: 'minimax',
  name: 'MiniMax',
  baseUrl: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
  apiKeySecret: 'minimax-copilot.apiKey',
  family: 'minimax',
  supportsTools: true,
  supportsVision: false,
  defaultMaxOutputTokens: 8192,
  defaultContextLength: 100000,
  // MiniMax API supports dynamic model listing
  dynamicModels: true,
  modelsCacheTTL: 5 * 60 * 1000,
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
 */
export function filterModels(models: ModelConfig[]): ModelConfig[] {
  // Show all MiniMax chat models
  return models.filter(m => m.id.includes('chat') || m.id.includes('abab'));
}
