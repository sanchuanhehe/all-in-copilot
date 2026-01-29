/**
 * GLM Provider Configuration
 * ===========================
 * This is the only file you need to edit to create a new provider!
 * All types and functionality are imported from @all-in-copilot/sdk
 */

import type { ProviderConfig, ModelConfig } from '@all-in-copilot/sdk';

/**
 * GLM Provider Configuration
 * Edit these values to customize your provider
 */
export const PROVIDER_CONFIG: ProviderConfig = {
  // Provider identity
  id: 'glm',
  name: 'GLM (智谱AI)',
  family: 'glm',

  // API configuration
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  apiKeySecret: 'glm-copilot.apiKey',
  apiMode: 'openai', // GLM uses OpenAI-compatible API format

  // Capabilities
  supportsTools: true,
  supportsVision: true,

  // Token limits
  defaultMaxOutputTokens: 8192,
  defaultContextLength: 128000,

  // Dynamic model fetching
  dynamicModels: true,
  modelsCacheTTL: 5 * 60 * 1000, // 5 minutes
};

/**
 * Fallback GLM Models (used when dynamic fetch fails)
 */
export const FALLBACK_MODELS: ModelConfig[] = [
  {
    id: 'glm-4-plus',
    name: 'GLM-4 Plus',
    maxInputTokens: 120000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'glm-4',
    name: 'GLM-4',
    maxInputTokens: 128000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: true,
  },
  {
    id: 'glm-4v',
    name: 'GLM-4V (Vision)',
    maxInputTokens: 8000,
    maxOutputTokens: 4096,
    supportsTools: false,
    supportsVision: true,
  },
  {
    id: 'glm-3-turbo',
    name: 'GLM-3 Turbo',
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
  // Show all GLM models
  return models.filter(m => m.id.startsWith('glm'));
}
