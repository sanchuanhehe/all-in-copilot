import * as vscode from "vscode";
import type { UserApiMode, UserModel, UserProvider, ProvidersState } from "./types";
import {
	DEFAULT_CONTEXT_LENGTH,
	DEFAULT_MAX_OUTPUT_TOKENS,
	DEFAULT_MODELS_CACHE_TTL,
	EXTENSION_ID,
	PROVIDERS_STATE_KEY,
} from "./config";

const EMPTY_STATE: ProvidersState = {
	providers: [],
	activeProviderId: null,
	manualModelsByProvider: {},
};

export class ProviderManager {
	constructor(private readonly context: vscode.ExtensionContext) {}

	getProvidersState(): ProvidersState {
		const state = this.context.globalState.get<ProvidersState>(PROVIDERS_STATE_KEY);
		if (!state) {
			return EMPTY_STATE;
		}

		return {
			providers: state.providers ?? [],
			activeProviderId: state.activeProviderId ?? null,
			manualModelsByProvider: state.manualModelsByProvider ?? {},
		};
	}

	getProviders(): UserProvider[] {
		return this.getProvidersState().providers;
	}

	getProviderById(providerId: string): UserProvider | undefined {
		return this.getProviders().find((provider) => provider.id === providerId);
	}

	getActiveProviderId(): string | null {
		const state = this.getProvidersState();
		if (state.activeProviderId && state.providers.some((provider) => provider.id === state.activeProviderId)) {
			return state.activeProviderId;
		}
		return state.providers[0]?.id ?? null;
	}

	getActiveProvider(): UserProvider | undefined {
		const activeProviderId = this.getActiveProviderId();
		if (!activeProviderId) {
			return undefined;
		}
		return this.getProviderById(activeProviderId);
	}

	async addProvider(input: {
		name: string;
		baseUrl: string;
		apiMode: UserApiMode;
		apiKey: string;
		supportsTools?: boolean;
		supportsVision?: boolean;
		dynamicModels?: boolean;
		defaultMaxOutputTokens?: number;
		defaultContextLength?: number;
		headers?: Record<string, string>;
	}): Promise<UserProvider> {
		const state = this.getProvidersState();
		const providerId = this.createProviderId(input.name);
		const now = Date.now();
		const apiKeySecretKey = `${EXTENSION_ID}.providers.${providerId}.apiKey`;

		const provider: UserProvider = {
			id: providerId,
			name: input.name.trim(),
			baseUrl: this.normalizeBaseUrl(input.baseUrl),
			apiMode: input.apiMode,
			apiKeySecretKey,
			supportsTools: input.supportsTools ?? true,
			supportsVision: input.supportsVision ?? false,
			defaultMaxOutputTokens: input.defaultMaxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
			defaultContextLength: input.defaultContextLength ?? DEFAULT_CONTEXT_LENGTH,
			dynamicModels: input.dynamicModels ?? true,
			modelsCacheTTL: DEFAULT_MODELS_CACHE_TTL,
			headers: input.headers,
			createdAt: now,
			updatedAt: now,
		};

		await this.context.secrets.store(apiKeySecretKey, input.apiKey.trim());

		const nextState: ProvidersState = {
			...state,
			providers: [...state.providers, provider],
			activeProviderId: state.activeProviderId ?? provider.id,
		};
		await this.saveState(nextState);

		return provider;
	}

	async updateProvider(
		providerId: string,
		patch: {
			name?: string;
			baseUrl?: string;
			apiMode?: UserApiMode;
			apiKey?: string;
			supportsTools?: boolean;
			supportsVision?: boolean;
			dynamicModels?: boolean;
			defaultMaxOutputTokens?: number;
			defaultContextLength?: number;
			headers?: Record<string, string>;
		}
	): Promise<UserProvider | undefined> {
		const state = this.getProvidersState();
		const target = state.providers.find((provider) => provider.id === providerId);
		if (!target) {
			return undefined;
		}

		const updated: UserProvider = {
			...target,
			name: patch.name?.trim() ?? target.name,
			baseUrl: patch.baseUrl ? this.normalizeBaseUrl(patch.baseUrl) : target.baseUrl,
			apiMode: patch.apiMode ?? target.apiMode,
			supportsTools: patch.supportsTools ?? target.supportsTools,
			supportsVision: patch.supportsVision ?? target.supportsVision,
			dynamicModels: patch.dynamicModels ?? target.dynamicModels,
			defaultMaxOutputTokens: patch.defaultMaxOutputTokens ?? target.defaultMaxOutputTokens,
			defaultContextLength: patch.defaultContextLength ?? target.defaultContextLength,
			headers: patch.headers ?? target.headers,
			updatedAt: Date.now(),
		};

		if (patch.apiKey !== undefined && patch.apiKey.trim().length > 0) {
			await this.context.secrets.store(target.apiKeySecretKey, patch.apiKey.trim());
		}

		const nextProviders = state.providers.map((provider) => (provider.id === providerId ? updated : provider));
		await this.saveState({ ...state, providers: nextProviders });
		return updated;
	}

	async deleteProvider(providerId: string): Promise<boolean> {
		const state = this.getProvidersState();
		const target = state.providers.find((provider) => provider.id === providerId);
		if (!target) {
			return false;
		}

		await this.context.secrets.delete(target.apiKeySecretKey);

		const nextProviders = state.providers.filter((provider) => provider.id !== providerId);
		const nextManualModels = { ...state.manualModelsByProvider };
		delete nextManualModels[providerId];

		const nextActiveProviderId =
			state.activeProviderId === providerId ? (nextProviders[0]?.id ?? null) : state.activeProviderId;

		await this.saveState({
			providers: nextProviders,
			activeProviderId: nextActiveProviderId,
			manualModelsByProvider: nextManualModels,
		});
		return true;
	}

	async setActiveProvider(providerId: string): Promise<boolean> {
		const state = this.getProvidersState();
		if (!state.providers.some((provider) => provider.id === providerId)) {
			return false;
		}
		await this.saveState({ ...state, activeProviderId: providerId });
		return true;
	}

	async getProviderApiKey(providerId: string): Promise<string | undefined> {
		const provider = this.getProviderById(providerId);
		if (!provider) {
			return undefined;
		}
		return this.context.secrets.get(provider.apiKeySecretKey);
	}

	getManualModels(providerId: string): UserModel[] {
		const state = this.getProvidersState();
		return state.manualModelsByProvider[providerId] ?? [];
	}

	async addManualModel(
		providerId: string,
		input: {
			id: string;
			name?: string;
			maxInputTokens?: number;
			maxOutputTokens?: number;
			supportsTools?: boolean;
			supportsVision?: boolean;
		}
	): Promise<UserModel | undefined> {
		const provider = this.getProviderById(providerId);
		if (!provider) {
			return undefined;
		}

		const state = this.getProvidersState();
		const existing = state.manualModelsByProvider[providerId] ?? [];
		const modelId = input.id.trim();
		const modelName = input.name?.trim() || modelId;

		if (!modelId) {
			return undefined;
		}

		const model: UserModel = {
			id: modelId,
			name: modelName,
			providerId,
			source: "manual",
			maxInputTokens: input.maxInputTokens ?? provider.defaultContextLength,
			maxOutputTokens: input.maxOutputTokens ?? provider.defaultMaxOutputTokens,
			supportsTools: input.supportsTools ?? provider.supportsTools,
			supportsVision: input.supportsVision ?? provider.supportsVision,
		};

		const merged = [...existing.filter((item) => item.id !== model.id), model];
		await this.saveState({
			...state,
			manualModelsByProvider: {
				...state.manualModelsByProvider,
				[providerId]: merged,
			},
		});

		return model;
	}

	async removeManualModel(providerId: string, modelId: string): Promise<boolean> {
		const state = this.getProvidersState();
		const existing = state.manualModelsByProvider[providerId] ?? [];
		if (!existing.some((model) => model.id === modelId)) {
			return false;
		}

		await this.saveState({
			...state,
			manualModelsByProvider: {
				...state.manualModelsByProvider,
				[providerId]: existing.filter((model) => model.id !== modelId),
			},
		});
		return true;
	}

	private async saveState(state: ProvidersState): Promise<void> {
		await this.context.globalState.update(PROVIDERS_STATE_KEY, state);
	}

	private normalizeBaseUrl(baseUrl: string): string {
		return baseUrl.trim().replace(/\/+$/, "");
	}

	private createProviderId(name: string): string {
		const normalized = name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 32);
		const suffix = Math.random().toString(36).slice(2, 8);
		return `${normalized || "provider"}-${suffix}`;
	}
}
