/**
 * Provider Configuration
 * Edit this file to customize your LLM provider
 */

/**
 * Provider configuration interface
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
  /** Whether this provider supports tool calling */
  supportsTools: boolean;
  /** Whether this provider supports vision/image input */
  supportsVision: boolean;
  /** Default maximum output tokens */
  defaultMaxOutputTokens: number;
  /** Default context length */
  defaultContextLength: number;
  /** Whether to fetch models dynamically from API */
  dynamicModels: boolean;
  /** Cache TTL for dynamic models in milliseconds */
  modelsCacheTTL?: number;
}

/**
 * Model configuration interface
 */
export interface ModelConfig {
  /** Model ID */
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
}

/**
 * Provider configuration - EDIT THIS TO CHANGE PROVIDER
 */
export const PROVIDER_CONFIG: ProviderConfig = {
  id: 'provider-id',
  name: 'Provider Name',
  baseUrl: 'https://api.example.com/v1/chat/completions',
  apiKeySecret: 'extension-name.provider.apiKey',
  family: 'provider-family',
  supportsTools: true,
  supportsVision: false,
  defaultMaxOutputTokens: 4096,
  defaultContextLength: 32768,
  // Enable dynamic model fetching from API
  dynamicModels: true,
  // Cache models for 5 minutes
  modelsCacheTTL: 5 * 60 * 1000,
};

/**
 * Fallback static model configurations
 * Used when dynamic fetching fails or is disabled
 */
export const FALLBACK_MODELS: ModelConfig[] = [
  {
    id: 'model-1',
    name: 'Model 1',
    maxInputTokens: 30000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
  },
  {
    id: 'model-2',
    name: 'Model 2',
    maxInputTokens: 16000,
    maxOutputTokens: 4096,
    supportsTools: true,
    supportsVision: false,
  },
];

/**
 * Model filter function
 * Override this to filter which models to show
 */
export function filterModels(models: ModelConfig[]): ModelConfig[] {
  // By default, return all models
  // You can filter by name, capabilities, etc.
  // Example: return models.filter(m => m.id.includes('chat'));
  return models;
}
