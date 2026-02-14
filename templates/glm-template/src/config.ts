/**
 * GLM Provider Configuration
 * ===========================
 * This is the only file you need to edit to create a new provider!
 * All types and functionality are imported from @all-in-copilot/sdk
 */

import type { ProviderConfig, ModelConfig } from "@all-in-copilot/sdk";

/**
 * GLM Provider Configuration
 * Edit these values to customize your provider
 *
 * GLM supports two API modes:
 * 1. OpenAI-compatible: https://open.bigmodel.cn/api/paas/v4/chat/completions
 * 2. Anthropic-compatible (GLM Coding Plan): https://open.bigmodel.cn/api/anthropic
 *
 * For GLM Coding Plan users, change apiMode to 'anthropic' and baseUrl accordingly
 */
export const PROVIDER_CONFIG: ProviderConfig = {
	// Provider identity
	id: "glm",
	name: "GLM (智谱AI)",
	family: "glm",
	apiKeySecret: "glm-copilot.apiKey",
	// API configuration
	// Option 1: OpenAI-compatible API (default)
	// baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
	// apiMode: "openai", // Use 'anthropic' for GLM Coding Plan

	// Option 2: Anthropic-compatible API (GLM Coding Plan)
	// Uncomment below and comment above to use GLM Coding Plan
	baseUrl: "https://open.bigmodel.cn/api/anthropic/v1/messages",
	apiMode: "anthropic",

	// Capabilities
	supportsTools: true,
	supportsVision: false,

	// Token limits
	defaultMaxOutputTokens: 16000,
	defaultContextLength: 186752,

	// Dynamic model fetching (only works with OpenAI mode)
	dynamicModels: true,
	modelsCacheTTL: 5 * 60 * 1000, // 5 minutes
};

/**
 * Fallback GLM Models (used when dynamic fetch fails)
 */
export const FALLBACK_MODELS: ModelConfig[] = [
	{
		id: "glm-4.7-flash",
		name: "GLM-4.7 Flash",
		maxInputTokens: 186752,
		maxOutputTokens: 16000,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "glm-4.7",
		name: "GLM-4.7",
		maxInputTokens: 186752,
		maxOutputTokens: 16000,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "glm-5",
		name: "GLM-5",
		maxInputTokens: 186752,
		maxOutputTokens: 16000,
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
	return models.filter((m) => m.id.startsWith("glm"));
}
