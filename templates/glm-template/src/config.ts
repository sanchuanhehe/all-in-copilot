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
	supportsVision: true,

	// Token limits
	defaultMaxOutputTokens: 8192,
	defaultContextLength: 128000,

	// Dynamic model fetching (only works with OpenAI mode)
	dynamicModels: true,
	modelsCacheTTL: 5 * 60 * 1000, // 5 minutes
};

/**
 * Fallback GLM Models (used when dynamic fetch fails)
 */
export const FALLBACK_MODELS: ModelConfig[] = [
	{
		id: "glm-4-plus",
		name: "GLM-4 Plus",
		maxInputTokens: 120000,
		maxOutputTokens: 8192,
		supportsTools: true,
		supportsVision: true,
	},
	{
		id: "glm-4",
		name: "GLM-4",
		maxInputTokens: 128000,
		maxOutputTokens: 8192,
		supportsTools: true,
		supportsVision: true,
	},
	{
		id: "glm-4v",
		name: "GLM-4V (Vision)",
		maxInputTokens: 8000,
		maxOutputTokens: 4096,
		supportsTools: false,
		supportsVision: true,
	},
	{
		id: "glm-3-turbo",
		name: "GLM-3 Turbo",
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
	return models.filter((m) => m.id.startsWith("glm"));
}
