/**
 * GLM Provider Configuration
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
 * GLM Provider Configuration
 * Edit this file to customize your provider
 */
export const PROVIDER_CONFIG: ProviderConfig = {
  id: 'glm',
  name: 'GLM (智谱AI)',
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  apiKeySecret: 'glm-copilot.apiKey',
  family: 'glm',
  supportsTools: true,
  supportsVision: true,
  defaultMaxOutputTokens: 8192,
  defaultContextLength: 128000,
  // GLM API supports dynamic model listing
  dynamicModels: true,
  modelsCacheTTL: 5 * 60 * 1000,
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
 */
export function filterModels(models: ModelConfig[]): ModelConfig[] {
  // Show all GLM models
  return models.filter(m => m.id.startsWith('glm'));
}
