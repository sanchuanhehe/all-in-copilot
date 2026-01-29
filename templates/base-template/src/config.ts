/**
 * Provider Configuration
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
};

/**
 * Static model configurations
 */
export const STATIC_MODELS: ModelConfig[] = [
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
