/**
 * Dynamic Model Fetcher
 * Fetches available models from LLM providers automatically
 */

import type { ModelConfig, ProviderConfig } from "./types";

/**
 * Response from /models endpoint (OpenAI compatible)
 */
export interface ModelsResponse {
	object?: string;
	data: RemoteModelItem[];
}

/**
 * Remote model item from API
 */
export interface RemoteModelItem {
	id: string;
	object?: string;
	created?: number;
	owned_by?: string;
	context_length?: number;
	max_tokens?: number;
	max_completion_tokens?: number;
	capabilities?: {
		vision?: boolean;
		function_calling?: boolean;
		tool_use?: boolean;
	};
	// Additional fields for different providers
	[key: string]: unknown;
}

/**
 * Model fetch options
 */
export interface ModelFetchOptions {
	/** API key for authentication */
	apiKey: string;
	/** Custom headers */
	headers?: Record<string, string>;
	/** Timeout in milliseconds */
	timeout?: number;
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
}

/**
 * Default values
 */
const DEFAULT_CONTEXT_LENGTH = 128000;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT = 30000;

/**
 * Model cache interface (used by templates)
 */
export interface ModelCache {
	models: ModelConfig[] | null;
	lastFetch: number;
}

/**
 * Fetch models from API with caching support (for templates)
 */
export async function fetchModelsFromAPI(
	baseUrl: string,
	apiKey: string,
	provider: ProviderConfig,
	cache: ModelCache,
	timeout?: number
): Promise<ModelConfig[]> {
	const now = Date.now();
	const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

	// Return cached if valid
	if (cache.models && now - cache.lastFetch < CACHE_TTL) {
		return cache.models;
	}

	try {
		const models = await fetchModels(provider, {
			apiKey,
			timeout: timeout ?? DEFAULT_TIMEOUT,
		});
		cache.models = models;
		cache.lastFetch = now;
		return models;
	} catch (error) {
		// Return cached on error if available
		if (cache.models) {
			console.warn("Failed to refresh models, using cached:", error);
			return cache.models;
		}
		throw error;
	}
}

/**
 * Fetch models from a provider
 */
export async function fetchModels(provider: ProviderConfig, options: ModelFetchOptions): Promise<ModelConfig[]> {
	const { apiKey, headers = {}, timeout = DEFAULT_TIMEOUT, signal } = options;

	// Build models endpoint URL
	const modelsUrl = buildModelsUrl(provider.baseUrl);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	// Merge signals if provided
	if (signal) {
		signal.addEventListener("abort", () => controller.abort());
	}

	try {
		const response = await fetch(modelsUrl, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				...headers,
			},
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}${text ? `\n${text}` : ""}`);
		}

		const data = (await response.json()) as ModelsResponse;
		const models = data.data || [];

		return models.map((m) => convertRemoteModel(m, provider));
	} catch (error) {
		clearTimeout(timeoutId);
		if (error instanceof Error && error.name === "AbortError") {
			throw new Error("Request timed out while fetching models");
		}
		throw error;
	}
}

/**
 * Build models endpoint URL from base URL
 */
function buildModelsUrl(baseUrl: string): string {
	// Remove trailing slashes
	const cleanUrl = baseUrl.replace(/\/+$/, "");

	// If URL ends with /chat/completions, replace with /models
	if (cleanUrl.endsWith("/chat/completions")) {
		return cleanUrl.replace("/chat/completions", "/models");
	}

	// If URL ends with /v1, append /models
	if (cleanUrl.endsWith("/v1")) {
		return `${cleanUrl}/models`;
	}

	// Otherwise just append /models
	return `${cleanUrl}/models`;
}

/**
 * Convert remote model to ModelConfig
 */
function convertRemoteModel(remote: RemoteModelItem, provider: ProviderConfig): ModelConfig {
	const contextLength = remote.context_length ?? DEFAULT_CONTEXT_LENGTH;
	const maxOutput = remote.max_completion_tokens ?? remote.max_tokens ?? DEFAULT_MAX_TOKENS;
	const maxInput = Math.max(1, contextLength - maxOutput);

	// Detect capabilities
	const supportsVision = remote.capabilities?.vision ?? false;
	const supportsTools =
		remote.capabilities?.function_calling ?? remote.capabilities?.tool_use ?? provider.supportsTools;

	return {
		id: remote.id,
		name: remote.id,
		providerId: provider.id,
		maxInputTokens: maxInput,
		maxOutputTokens: maxOutput,
		supportsTools,
		supportsVision,
		metadata: {
			ownedBy: remote.owned_by,
			created: remote.created,
			contextLength,
		},
	};
}

/**
 * Create a model fetcher with caching
 */
export function createCachedModelFetcher(
	provider: ProviderConfig,
	options: Omit<ModelFetchOptions, "signal">
): CachedModelFetcher {
	return new CachedModelFetcher(provider, options);
}

/**
 * Cached model fetcher class
 */
export class CachedModelFetcher {
	private cache: ModelConfig[] | null = null;
	private lastFetchTime = 0;
	private fetchPromise: Promise<ModelConfig[]> | null = null;

	constructor(
		private provider: ProviderConfig,
		private options: Omit<ModelFetchOptions, "signal">,
		private cacheTTL: number = 5 * 60 * 1000 // 5 minutes
	) {}

	/**
	 * Get models (from cache or fetch)
	 */
	async getModels(forceRefresh = false): Promise<ModelConfig[]> {
		const now = Date.now();

		// Return cached if valid
		if (!forceRefresh && this.cache && now - this.lastFetchTime < this.cacheTTL) {
			return this.cache;
		}

		// If already fetching, wait for that promise
		if (this.fetchPromise) {
			return this.fetchPromise;
		}

		// Start new fetch
		this.fetchPromise = fetchModels(this.provider, this.options)
			.then((models) => {
				this.cache = models;
				this.lastFetchTime = Date.now();
				this.fetchPromise = null;
				return models;
			})
			.catch((error) => {
				this.fetchPromise = null;
				// Return cached on error if available
				if (this.cache) {
					console.warn("Failed to refresh models, using cached:", error);
					return this.cache;
				}
				throw error;
			});

		return this.fetchPromise;
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache = null;
		this.lastFetchTime = 0;
	}
}
