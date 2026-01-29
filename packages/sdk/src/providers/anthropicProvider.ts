/**
 * Anthropic Provider Implementation using Official Anthropic SDK
 */

import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type {
	ChatCompletionRequest,
	ChatCompletionResponse,
	StreamingHandler,
	ProviderConfig,
	ModelConfig,
} from "../core/types";

export class AnthropicProvider {
	private anthropic: Anthropic;
	private config: ProviderConfig;
	private models = new Map<string, ModelConfig>();

	constructor(config: ProviderConfig, options: { apiKey: string }) {
		this.config = config;
		this.anthropic = new Anthropic({ apiKey: options.apiKey, baseURL: config.baseUrl });
	}

	getConfig(): ProviderConfig {
		return this.config;
	}
	registerModel(model: ModelConfig): void {
		this.models.set(model.id, model);
	}
	getModels(): ModelConfig[] {
		return Array.from(this.models.values());
	}

	static withModels(config: ProviderConfig, models: ModelConfig[], options: { apiKey: string }): AnthropicProvider {
		const provider = new AnthropicProvider(config, options);
		for (const model of models) {
			provider.registerModel(model);
		}
		return provider;
	}

	async complete(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
		const response = await this.anthropic.messages.create({
			model: request.model,
			messages: request.messages as MessageParam[],
			max_tokens: request.max_tokens ?? 4096,
			stream: false,
		});

		return {
			id: response.id,
			object: "chat.completion",
			created: Date.now(),
			model: response.model,
			choices: [
				{
					index: 0,
					message: { role: "assistant", content: response.content[0]?.type === "text" ? response.content[0].text : "" },
					finish_reason: response.stop_reason ?? "complete",
				},
			],
		};
	}

	async completeStream(request: ChatCompletionRequest, handler: StreamingHandler): Promise<void> {
		const stream = await this.anthropic.messages.create({
			model: request.model,
			messages: request.messages as MessageParam[],
			max_tokens: request.max_tokens ?? 4096,
			stream: true,
		});

		for await (const chunk of stream) {
			if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
				handler.onText(chunk.delta.text, true);
			}
		}
	}
}
