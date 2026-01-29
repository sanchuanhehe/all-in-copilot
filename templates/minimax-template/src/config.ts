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
	id: "minimax",
	name: "MiniMax",
	family: "minimax",

	// API configuration - Anthropic compatible endpoint
	// https://platform.minimaxi.com/docs/api-reference/text-anthropic-api
	// Full URL to messages endpoint (SDK will NOT append any path)
	baseUrl: "https://api.minimaxi.com/anthropic/v1/messages",
	apiKeySecret: "minimax-copilot.apiKey",
	apiMode: "anthropic", // MiniMax Anthropic-compatible API

	// Capabilities
	supportsTools: true,
	supportsVision: false, // MiniMax Anthropic API 不支持图像

	// Token limits
	defaultMaxOutputTokens: 8192,
	defaultContextLength: 100000,

	// Dynamic model fetching - DISABLED (MiniMax doesn't have /models endpoint)
	dynamicModels: false,
};

/**
 * MiniMax Models (Anthropic API compatible)
 * https://platform.minimaxi.com/docs/api-reference/text-anthropic-api
 *
 * Supported models:
 * - MiniMax-M2.1: 旗舰模型，支持复杂推理和创意任务
 * - MiniMax-M2.1-lightning: 高速版本，100 tokens/s 输出速度
 * - MiniMax-M2: 上一代模型，性价比高
 */
export const FALLBACK_MODELS: ModelConfig[] = [
  {
    id: 'MiniMax-M2.1',
    name: 'MiniMax M2.1',
    maxInputTokens: 100000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: false,
  },
  {
    id: 'MiniMax-M2.1-lightning',
    name: 'MiniMax M2.1 Lightning',
    maxInputTokens: 100000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: false,
  },
  {
    id: 'MiniMax-M2',
    name: 'MiniMax M2',
    maxInputTokens: 100000,
    maxOutputTokens: 8192,
    supportsTools: true,
    supportsVision: false,
  },
];

/**
 * Filter models (customize which models to show)
 */
export function filterModels(models: ModelConfig[]): ModelConfig[] {
  return models;
}
