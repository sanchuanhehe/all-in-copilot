import type { ProviderConfig } from "@all-in-copilot/sdk";
import type { UserProvider } from "./types";

export const EXTENSION_ID = "dynamic-provider-template";
export const LM_PROVIDER_ID = `${EXTENSION_ID}.dynamic`;
export const MANAGE_COMMAND_ID = `${EXTENSION_ID}.manageProviders`;
export const PROVIDERS_STATE_KEY = `${EXTENSION_ID}.providers.state`;

export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_CONTEXT_LENGTH = 200000;
export const DEFAULT_MODELS_CACHE_TTL = 5 * 60 * 1000;

export function toSdkProviderConfig(provider: UserProvider): ProviderConfig {
	return {
		id: provider.id,
		name: provider.name,
		family: provider.apiMode,
		baseUrl: provider.baseUrl,
		apiKeySecret: provider.apiKeySecretKey,
		apiMode: provider.apiMode,
		supportsTools: provider.supportsTools,
		supportsVision: provider.supportsVision,
		defaultMaxOutputTokens: provider.defaultMaxOutputTokens,
		defaultContextLength: provider.defaultContextLength,
		dynamicModels: provider.dynamicModels,
		modelsCacheTTL: provider.modelsCacheTTL,
		headers: provider.headers,
	};
}

export function normalizeApiMode(apiMode: UserProvider["apiMode"]): "openai" | "anthropic" {
	return apiMode === "anthropic" ? "anthropic" : "openai";
}

/**
 * 将用户填写的 baseUrl 解析为可直接 POST 的聊天端点。
 * - openai / gemini / ollama：补全为 .../chat/completions
 * - anthropic：补全为 .../v1/messages
 * 若 URL 已包含对应路径后缀则原样返回。
 */
export function resolveChatUrl(baseUrl: string, apiMode: UserProvider["apiMode"]): string {
	const url = baseUrl.replace(/\/+$/, "");
	if (apiMode === "anthropic") {
		if (url.endsWith("/v1/messages")) {
			return url;
		}
		if (url.endsWith("/v1")) {
			return `${url}/messages`;
		}
		return `${url}/v1/messages`;
	}
	// openai / gemini / ollama
	if (url.endsWith("/chat/completions")) {
		return url;
	}
	if (url.endsWith("/v1")) {
		return `${url}/chat/completions`;
	}
	return `${url}/chat/completions`;
}
