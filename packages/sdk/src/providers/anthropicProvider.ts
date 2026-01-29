/**
 * Anthropic Provider Implementation
 * Based on VS Code Copilot Chat BYOK Anthropic Provider
 *
 * This provider handles Anthropic Claude API requests with proper:
 * - Message conversion (user/assistant role handling)
 * - Tool calling support
 * - Streaming response processing
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
	MessageParam,
	Tool
} from "@anthropic-ai/sdk/resources/messages";
import type {
	ChatCompletionRequest,
	ChatCompletionResponse,
	StreamingHandler,
	ProviderConfig,
	ModelConfig,
} from "../core/types";

// ============================================================================
// Anthropic Content Block Types (simplified from SDK types)
// ============================================================================

interface TextBlockParam {
	type: 'text';
	text: string;
	cache_control?: { type: 'ephemeral' };
}

interface ImageBlockParam {
	type: 'image';
	source: {
		type: 'base64';
		data: string;
		media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
	};
}

interface ToolUseBlockParam {
	type: 'tool_use';
	id: string;
	name: string;
	input: Record<string, unknown>;
}

interface ToolResultBlockParam {
	type: 'tool_result';
	tool_use_id: string;
	content: (TextBlockParam | ImageBlockParam)[] | string;
}

type ContentBlockParam = TextBlockParam | ImageBlockParam | ToolUseBlockParam | ToolResultBlockParam;

// ============================================================================
// Message Conversion Types
// ============================================================================

interface VsCodeMessage {
	role: number; // 1 = User, 2 = Assistant, 3 = System
	content?: VsCodeContentPart[];
}

interface VsCodeContentPart {
	value?: string;           // TextPart
	callId?: string;          // ToolCallPart / ToolResultPart
	name?: string;            // ToolCallPart
	input?: Record<string, unknown>; // ToolCallPart
	content?: VsCodeContentPart[];   // ToolResultPart
	data?: Uint8Array;        // DataPart
	mimeType?: string;        // DataPart
}

// VS Code role constants
const ROLE = {
	User: 1,
	Assistant: 2,
	System: 3,
} as const;

// ============================================================================
// Type Guards
// ============================================================================

function isTextPart(part: VsCodeContentPart): boolean {
	return 'value' in part && typeof part.value === 'string' && !('callId' in part);
}

function isToolCallPart(part: VsCodeContentPart): boolean {
	return 'callId' in part && 'name' in part && 'input' in part;
}

function isToolResultPart(part: VsCodeContentPart): boolean {
	return 'callId' in part && 'content' in part && !('name' in part);
}

function isDataPart(part: VsCodeContentPart): boolean {
	return 'data' in part && 'mimeType' in part;
}

// ============================================================================
// Message Conversion Functions (Based on official anthropicMessageConverter.ts)
// ============================================================================

/**
 * Convert VS Code content parts to Anthropic content blocks
 * This is the core conversion function that handles all content types
 */
function apiContentToAnthropicContent(content: VsCodeContentPart[]): ContentBlockParam[] {
	const convertedContent: ContentBlockParam[] = [];

	for (const part of content) {
		if (isToolCallPart(part)) {
			// tool_use blocks go in assistant messages
			convertedContent.push({
				type: 'tool_use',
				id: part.callId!,
				input: part.input || {},
				name: part.name!,
			} as ToolUseBlockParam);
		} else if (isDataPart(part)) {
			// Image data
			convertedContent.push({
				type: 'image',
				source: {
					type: 'base64',
					data: Buffer.from(part.data!).toString('base64'),
					media_type: part.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
				}
			} as ImageBlockParam);
		} else if (isToolResultPart(part)) {
			// tool_result blocks go in user messages
			const resultContent = (part.content || []).map((p): TextBlockParam | ImageBlockParam | undefined => {
				if (isTextPart(p)) {
					return { type: 'text', text: p.value || '' };
				} else if (isDataPart(p)) {
					return {
						type: 'image',
						source: {
							type: 'base64',
							media_type: p.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
							data: Buffer.from(p.data!).toString('base64')
						}
					};
				}
				return undefined;
			}).filter((p): p is TextBlockParam | ImageBlockParam => p !== undefined);

			convertedContent.push({
				type: 'tool_result',
				tool_use_id: part.callId!,
				content: resultContent.length > 0 ? resultContent : [{ type: 'text', text: '' }],
			} as ToolResultBlockParam);
		} else if (isTextPart(part)) {
			// Anthropic errors if we have text parts with empty string text content
			if (part.value === '') {
				continue;
			}
			convertedContent.push({
				type: 'text',
				text: part.value!
			} as TextBlockParam);
		}
	}
	return convertedContent;
}

/**
 * Convert VS Code messages to Anthropic format
 * Based on official apiMessageToAnthropicMessage
 */
function apiMessageToAnthropicMessage(messages: VsCodeMessage[]): { messages: MessageParam[]; system: TextBlockParam } {
	const unmergedMessages: MessageParam[] = [];
	const systemMessage: TextBlockParam = {
		type: 'text',
		text: ''
	};

	for (const message of messages) {
		if (message.role === ROLE.Assistant) {
			const content = apiContentToAnthropicContent(message.content || []);
			if (content.length > 0) {
				unmergedMessages.push({
					role: 'assistant',
					content,
				});
			}
		} else if (message.role === ROLE.User) {
			const content = apiContentToAnthropicContent(message.content || []);
			if (content.length > 0) {
				unmergedMessages.push({
					role: 'user',
					content,
				});
			}
		} else {
			// System message - extract text content
			systemMessage.text += (message.content || []).map(p => {
				if (isTextPart(p)) {
					return p.value || '';
				}
				return '';
			}).join('');
		}
	}

	// Merge messages of the same type that are adjacent together
	// This is required by Anthropic API
	const mergedMessages: MessageParam[] = [];
	for (const message of unmergedMessages) {
		if (mergedMessages.length === 0 || mergedMessages[mergedMessages.length - 1].role !== message.role) {
			mergedMessages.push(message);
		} else {
			// Merge with the previous message of the same role
			const prevMessage = mergedMessages[mergedMessages.length - 1];
			if (Array.isArray(prevMessage.content) && Array.isArray(message.content)) {
				(prevMessage.content as ContentBlockParam[]).push(...(message.content as ContentBlockParam[]));
			}
		}
	}

	return { messages: mergedMessages, system: systemMessage };
}

/**
 * Convert tools to Anthropic format
 */
function convertToolsToAnthropic(tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>): Tool[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}

	return tools.map((tool): Tool => ({
		name: tool.name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64),
		description: tool.description,
		input_schema: {
			type: 'object',
			properties: (tool.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {},
			required: (tool.inputSchema as { required?: string[] })?.required ?? [],
		},
	}));
}

// ============================================================================
// Anthropic Provider Class
// ============================================================================

export class AnthropicProvider {
	private anthropic: Anthropic;
	private config: ProviderConfig;
	private models = new Map<string, ModelConfig>();

	constructor(config: ProviderConfig, options: { apiKey: string }) {
		this.config = config;
		this.anthropic = new Anthropic({
			apiKey: options.apiKey,
			baseURL: config.baseUrl
		});
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

	/**
	 * Convert VS Code messages to Anthropic API format
	 * This is exposed for use by templates that need direct API access
	 */
	static convertMessages(messages: unknown[]): { system?: string; messages: MessageParam[] } {
		const vsMessages = messages as VsCodeMessage[];
		const { system, messages: convertedMessages } = apiMessageToAnthropicMessage(vsMessages);
		return {
			system: system.text || undefined,
			messages: convertedMessages
		};
	}

	/**
	 * Convert tools to Anthropic API format
	 */
	static convertTools(tools?: unknown[]): Tool[] | undefined {
		return convertToolsToAnthropic(tools as Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>);
	}

	async complete(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
		const { system, messages: convertedMessages } = AnthropicProvider.convertMessages(request.messages);
		const tools = AnthropicProvider.convertTools(request.tools);

		const response = await this.anthropic.messages.create({
			model: request.model,
			messages: convertedMessages,
			max_tokens: request.max_tokens ?? 4096,
			stream: false,
			...(system ? { system } : {}),
			...(tools && tools.length > 0 ? { tools } : {}),
		});

		return {
			id: response.id,
			object: "chat.completion",
			created: Date.now(),
			model: response.model,
			choices: [
				{
					index: 0,
					message: {
						role: "assistant",
						content: response.content[0]?.type === "text" ? response.content[0].text : ""
					},
					finish_reason: response.stop_reason ?? "complete",
				},
			],
		};
	}

	async completeStream(request: ChatCompletionRequest, handler: StreamingHandler): Promise<void> {
		const { system, messages: convertedMessages } = AnthropicProvider.convertMessages(request.messages);
		const tools = AnthropicProvider.convertTools(request.tools);

		const stream = await this.anthropic.messages.create({
			model: request.model,
			messages: convertedMessages,
			max_tokens: request.max_tokens ?? 4096,
			stream: true,
			...(system ? { system } : {}),
			...(tools && tools.length > 0 ? { tools } : {}),
		});

		// Tool call state for streaming
		let pendingToolCall: {
			toolId?: string;
			name?: string;
			jsonInput?: string;
		} | undefined;

		for await (const chunk of stream) {
			if (chunk.type === 'content_block_start') {
				if ('content_block' in chunk && chunk.content_block.type === 'tool_use') {
					pendingToolCall = {
						toolId: chunk.content_block.id,
						name: chunk.content_block.name,
						jsonInput: ''
					};
				}
			} else if (chunk.type === 'content_block_delta') {
				if (chunk.delta.type === 'text_delta') {
					handler.onText(chunk.delta.text || '', true);
				} else if (chunk.delta.type === 'input_json_delta' && pendingToolCall) {
					pendingToolCall.jsonInput = (pendingToolCall.jsonInput || '') + (chunk.delta.partial_json || '');
				}
			} else if (chunk.type === 'content_block_stop') {
				if (pendingToolCall) {
					try {
						const parsedJson = JSON.parse(pendingToolCall.jsonInput || '{}');
						handler.onToolCall({
							id: pendingToolCall.toolId!,
							type: 'function',
							function: {
								name: pendingToolCall.name!,
								arguments: JSON.stringify(parsedJson)
							}
						});
					} catch (e) {
						console.error('Failed to parse tool call JSON:', e);
					}
					pendingToolCall = undefined;
				}
			}
		}
	}
}

