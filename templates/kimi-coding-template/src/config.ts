/**
 * Kimi (Moonshot) Provider Configuration
 * =======================================
 * This is the only file you need to edit to create a new provider!
 * All types and functionality are imported from @all-in-copilot/sdk
 */

import type { ProviderConfig, ModelConfig } from "@all-in-copilot/sdk";

/**
 * Kimi Provider Configuration
 * https://platform.moonshot.cn/docs/guide/agent-support
 * Uses Anthropic-compatible API
 */
export const PROVIDER_CONFIG: ProviderConfig = {
	// Provider identity
	id: "kimi-coding",
	name: "Kimi (Moonshot) Coding Plan",
	family: "kimi-coding-plan",

	// API configuration - Anthropic compatible endpoint
	// https://platform.moonshot.cn/docs/guide/agent-support
	baseUrl: "https://api.kimi.com/coding/",
	apiKeySecret: "kimi-coding-copilot.apiKey",
	apiMode: "anthropic", // Kimi Anthropic-compatible API

	// Capabilities
	supportsTools: true,
	supportsVision: false, // Kimi K2 系列暂不支持视觉

	// Token limits
	defaultMaxOutputTokens: 32768,
	defaultContextLength: 256000,

	// Dynamic model fetching - DISABLED (Kimi doesn't have /models endpoint for Anthropic API)
	dynamicModels: true,
};

/**
 * Kimi K2 Models (Anthropic API compatible)
 * https://platform.moonshot.cn/docs/guide/agent-support
 *
 * Supported models:
 * - kimi-k2-thinking-turbo: 思考版高速模型，支持多步工具调用与思考
 * - kimi-k2-thinking: 思考版模型，支持多步工具调用与思考
 * - kimi-k2-turbo-preview: 高速版本，60-100 tokens/s 输出速度
 * - kimi-k2-0905-preview: 256K 上下文，代码能力更强
 * - kimi-k2-0711-preview: 原始版本
 * - kimi-k2.5: 最新版本，提升了代码理解和生成能力
 */
export const FALLBACK_MODELS: ModelConfig[] = [
	{
		id: "kimi-k2-thinking-turbo",
		name: "Kimi K2 Thinking Turbo",
		maxInputTokens: 256000,
		maxOutputTokens: 32768,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "kimi-k2-thinking",
		name: "Kimi K2 Thinking",
		maxInputTokens: 256000,
		maxOutputTokens: 32768,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "kimi-k2-turbo-preview",
		name: "Kimi K2 Turbo",
		maxInputTokens: 256000,
		maxOutputTokens: 32768,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "kimi-k2-0905-preview",
		name: "Kimi K2 (0905)",
		maxInputTokens: 256000,
		maxOutputTokens: 32768,
		supportsTools: true,
		supportsVision: false,
	},
	{
		id: "kimi-k2.5",
		name: "Kimi K2.5",
		maxInputTokens: 246144,
		maxOutputTokens: 16000,
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
