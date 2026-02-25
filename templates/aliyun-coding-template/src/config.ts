/**
 * Aliyun Model Studio Coding Plan Provider Configuration
 * =======================================
 * This is the only file you need to edit to create a new provider!
 * All types and functionality are imported from @all-in-copilot/sdk
 */

import type { ProviderConfig, ModelConfig } from "@all-in-copilot/sdk";

/**
 * Aliyun Model Studio Coding Plan Provider Configuration
 * https://help.aliyun.com/zh/model-studio/coding-plan
 * Uses Anthropic-compatible API
 */
export const PROVIDER_CONFIG: ProviderConfig = {
	// Provider identity
	id: "aliyun-coding-plan",
	name: "Aliyun Model Studio Coding Plan",
	family: "aliyun-coding-plan",

	// API configuration - Anthropic compatible endpoint
	baseUrl: "https://coding.dashscope.aliyuncs.com/apps/anthropic/v1/messages",
	apiKeySecret: "aliyun-coding-copilot.apiKey",
	apiMode: "anthropic", // Anthropic-compatible API

	// Capabilities
	supportsTools: true,
	supportsVision: true,

	// Token limits
	defaultMaxOutputTokens: 32768,
	defaultContextLength: 262144,

	// Dynamic model fetching
	dynamicModels: false,
};

/**
 * Supported models
 */
export const FALLBACK_MODELS: ModelConfig[] = [
	{
		id: "qwen3.5-plus",
		name: "Qwen3.5 Plus",
		maxInputTokens: 1000000,
		maxOutputTokens: 65536,
		supportsTools: true,
		supportsVision: true,
	},
	{
		id: "qwen3-max-2026-01-23",
		name: "Qwen3 Max 2026-01-23",
		maxInputTokens: 262144,
		maxOutputTokens: 32768,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "qwen3-coder-next",
		name: "Qwen3 Coder Next",
		maxInputTokens: 262144,
		maxOutputTokens: 65536,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "qwen3-coder-plus",
		name: "Qwen3 Coder Plus",
		maxInputTokens: 1000000,
		maxOutputTokens: 65536,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "minimax-m2.5",
		name: "MiniMax M2.5",
		maxInputTokens: 196608,
		maxOutputTokens: 65536,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "glm-5",
		name: "GLM-5",
		maxInputTokens: 204800,
		maxOutputTokens: 131072,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "glm-4.7",
		name: "GLM-4.7",
		maxInputTokens: 202752,
		maxOutputTokens: 16000,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "kimi-k2.5",
		name: "Kimi K2.5",
		maxInputTokens: 262144,
		maxOutputTokens: 65535,
		supportsTools: true,
		supportsVision: true,
	},
];

/**
 * Filter models (customize which models to show)
 */
export function filterModels(models: ModelConfig[]): ModelConfig[] {
	return models;
}
