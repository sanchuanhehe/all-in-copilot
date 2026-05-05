import type { ModelConfig } from "@all-in-copilot/sdk";

export type UserApiMode = "openai" | "anthropic" | "gemini" | "ollama";

export interface UserProvider {
	id: string;
	name: string;
	baseUrl: string;
	apiMode: UserApiMode;
	apiKeySecretKey: string;
	supportsTools: boolean;
	supportsVision: boolean;
	defaultMaxOutputTokens: number;
	defaultContextLength: number;
	dynamicModels: boolean;
	modelsCacheTTL: number;
	headers?: Record<string, string>;
	createdAt: number;
	updatedAt: number;
}

export interface UserModel extends ModelConfig {
	providerId: string;
	source: "fetched" | "manual";
}

export interface ProvidersState {
	providers: UserProvider[];
	activeProviderId: string | null;
	manualModelsByProvider: Record<string, UserModel[]>;
}

export interface RegisterableModel {
	chatModelId: string;
	rawModelId: string;
	provider: UserProvider;
	model: UserModel;
}

export function composeChatModelId(providerId: string, rawModelId: string): string {
	return `${providerId}::${rawModelId}`;
}

export function parseChatModelId(chatModelId: string): { providerId: string; rawModelId: string } | undefined {
	const delimiterIndex = chatModelId.indexOf("::");
	if (delimiterIndex <= 0 || delimiterIndex >= chatModelId.length - 2) {
		return undefined;
	}

	return {
		providerId: chatModelId.slice(0, delimiterIndex),
		rawModelId: chatModelId.slice(delimiterIndex + 2),
	};
}
