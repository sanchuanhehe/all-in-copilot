/**
 * OpenAI Provider Implementation using Official OpenAI SDK
 */

import OpenAI from "openai";
import type {
	ChatCompletionRequest,
	ChatCompletionResponse,
	StreamingHandler,
	ProviderConfig,
	ModelConfig,
} from "../core/types";

export interface RetryConfig {
	maxRetries: number;
	initialDelay: number;
	maxDelay: number;
	backoffMultiplier: number;
}

export class OpenAIProvider {
	private openai: OpenAI;
	private config: ProviderConfig;
	private models = new Map<string, ModelConfig>();
	private retryConfig: RetryConfig;
	private globalRequestDelay = 0;
	private lastRequestTime = 0;

	constructor(
		config: ProviderConfig,
		options: { apiKey: string; retryConfig?: Partial<RetryConfig>; globalRequestDelay?: number }
	) {
		this.config = config;
		this.retryConfig = {
			maxRetries: options.retryConfig?.maxRetries ?? 3,
			initialDelay: options.retryConfig?.initialDelay ?? 1000,
			maxDelay: options.retryConfig?.maxDelay ?? 10000,
			backoffMultiplier: options.retryConfig?.backoffMultiplier ?? 2,
		};
		this.globalRequestDelay = options.globalRequestDelay ?? 0;

		this.openai = new OpenAI({
			apiKey: options.apiKey,
			baseURL: config.baseUrl,
		});
	}

	getConfig(): ProviderConfig {
		return this.config;
	}
	getId(): string {
		return this.config.id;
	}
	getName(): string {
		return this.config.name;
	}

	registerModel(model: ModelConfig): void {
		this.models.set(model.id, model);
	}
	getModels(): ModelConfig[] {
		return Array.from(this.models.values());
	}
	getModel(modelId: string): ModelConfig | undefined {
		return this.models.get(modelId);
	}

	static withModels(
		config: ProviderConfig,
		models: ModelConfig[],
		options: { apiKey: string; globalRequestDelay?: number }
	): OpenAIProvider {
		const provider = new OpenAIProvider(config, options);
		for (const model of models) {
			provider.registerModel(model);
		}
		return provider;
	}

	async complete(request: ChatCompletionRequest, options?: { signal?: AbortSignal }): Promise<ChatCompletionResponse> {
		await this.applyRateLimit();

		const response = await this.openai.chat.completions.create(
			{
				model: request.model,
				messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
				tools: request.tools as OpenAI.Chat.ChatCompletionTool[] | undefined,
				max_tokens: request.max_tokens,
				temperature: request.temperature,
				stream: false,
			},
			{ signal: options?.signal }
		);

		return {
			id: response.id,
			object: "chat.completion",
			created: response.created,
			model: response.model,
			choices: response.choices.map((choice) => ({
				index: choice.index,
				message: { role: choice.message.role ?? "assistant", content: choice.message.content ?? "" },
				finish_reason: choice.finish_reason ?? null,
			})),
		};
	}

	async completeStream(
		request: ChatCompletionRequest,
		handler: StreamingHandler,
		options?: { signal?: AbortSignal }
	): Promise<void> {
		await this.applyRateLimit();

		const stream = await this.openai.chat.completions.create(
			{
				model: request.model,
				messages: request.messages as OpenAI.Chat.ChatCompletionMessageParam[],
				tools: request.tools as OpenAI.Chat.ChatCompletionTool[] | undefined,
				max_tokens: request.max_tokens,
				temperature: request.temperature,
				stream: true,
			},
			{ signal: options?.signal }
		);

		const toolCallBuffers = new Map<number, { id?: string; name?: string; args: string }>();

		for await (const chunk of stream) {
			for (const choice of chunk.choices) {
				const delta = choice.delta;
				if (delta.content) {
					handler.onText(delta.content, true);
				}

				if (delta.tool_calls && delta.tool_calls.length > 0) {
					for (const tc of delta.tool_calls) {
						const index = (tc as { index?: number }).index ?? 0;
						let buf = toolCallBuffers.get(index);
						if (!buf) {
							buf = { args: "" };
							toolCallBuffers.set(index, buf);
						}
						if (tc.id) {
							buf.id = tc.id;
						}
						if (tc.function?.name) {
							buf.name = tc.function.name;
						}
						if (tc.function?.arguments) {
							buf.args += tc.function.arguments;
							if (buf.id && buf.name && this.isValidJSON(buf.args)) {
								handler.onToolCall({ id: buf.id, type: "function", function: { name: buf.name, arguments: buf.args } });
							}
						}
					}
				}
			}
		}
	}

	private async applyRateLimit(): Promise<void> {
		const now = Date.now();
		const minInterval = Math.max(this.config.requestDelay ?? 0, this.globalRequestDelay);
		if (this.lastRequestTime > 0 && minInterval > 0) {
			const elapsed = now - this.lastRequestTime;
			if (elapsed < minInterval) {
				await new Promise((resolve) => setTimeout(resolve, minInterval - elapsed));
			}
		}
		this.lastRequestTime = Date.now();
	}

	private isValidJSON(str: string): boolean {
		try {
			JSON.parse(str);
			return true;
		} catch {
			return false;
		}
	}
}
