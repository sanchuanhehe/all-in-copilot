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
};

/**
 * MiniMax Models
 */
export const STATIC_MODELS: ModelConfig[] = [
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
