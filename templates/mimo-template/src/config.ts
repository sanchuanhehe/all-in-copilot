/**
 * Xiaomi MiMo Provider Configuration
 * ===================================
 * This is the only file you need to edit to create a new provider!
 * All types and functionality are imported from @all-in-copilot/sdk
 */

import type { ProviderConfig, ModelConfig } from "@all-in-copilot/sdk";

/**
 * MiMo Provider Configuration
 * https://platform.xiaomimimo.com/#/docs/api/text-generation/anthropic-api
 * Uses Anthropic-compatible API
 */
export const PROVIDER_CONFIG: ProviderConfig = {
	// Provider identity
	id: "mimo",
	name: "Xiaomi MiMo",
	family: "mimo",

	// API configuration - Anthropic compatible endpoint
	// https://platform.xiaomimimo.com/#/docs/api/text-generation/anthropic-api
	baseUrl: "https://api.xiaomimimo.com/anthropic/v1/messages",
	apiKeySecret: "mimo-copilot.apiKey",
	apiMode: "anthropic", // MiMo Anthropic-compatible API

	// Capabilities
	supportsTools: true,
	supportsVision: false, // MiMo Anthropic API 暂不支持图像

	// Token limits
	defaultMaxOutputTokens: 65536,
	defaultContextLength: 131072,

	// Dynamic model fetching - DISABLED
	dynamicModels: false,

	// Custom headers - MiMo supports both api-key and Authorization Bearer
	// Using api-key header as primary method
	headers: {
		// Note: The extension uses x-api-key for Anthropic mode by default
		// MiMo also supports: api-key: $KEY
	},
};

/**
 * MiMo Models (Anthropic API compatible)
 * https://platform.xiaomimimo.com/#/docs/api/text-generation/anthropic-api
 *
 * Supported models:
 * - mimo-v2-flash: 最新 Flash 模型，高性价比
 */
export const FALLBACK_MODELS: ModelConfig[] = [
	{
		id: "mimo-v2-flash",
		name: "MiMo V2 Flash",
		maxInputTokens: 131072,
		maxOutputTokens: 65536,
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
