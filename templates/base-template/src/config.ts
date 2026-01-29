/**
 * Provider Configuration
 * ===========================
 * This is the only file you need to edit to create a new provider!
 * All types and functionality are imported from @all-in-copilot/sdk
 */

import type { ProviderConfig, ModelConfig } from '@all-in-copilot/sdk';

/**
 * Provider configuration - EDIT THIS TO CHANGE PROVIDER
 */
export const PROVIDER_CONFIG: ProviderConfig = {
  // Provider identity
  id: 'provider-id',           // Unique identifier (used in VS Code)
  name: 'Provider Name',       // Display name shown to users
  family: 'provider-family',   // Model family for grouping

  // API configuration
  baseUrl: 'https://api.example.com/v1/chat/completions',  // API endpoint
  apiKeySecret: 'extension-name.provider.apiKey',           // Secret storage key
  apiMode: 'openai',           // API format: 'openai' | 'anthropic' | 'gemini' | 'ollama'

  // Capabilities
  supportsTools: true,         // Tool/function calling support
  supportsVision: false,       // Image/vision input support

  // Token limits
  defaultMaxOutputTokens: 4096,
  defaultContextLength: 32768,

  // Dynamic model fetching
  dynamicModels: true,         // Fetch models from API
  modelsCacheTTL: 5 * 60 * 1000, // Cache for 5 minutes
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
