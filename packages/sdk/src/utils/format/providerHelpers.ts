/**
 * Provider Helpers
 * Type guards, message conversion, and request building for VS Code provider integration
 */

import type { VsCodeMessage } from "./types";
import { OpenAIMessage } from "./types";
import { convertToOpenAI } from "./convert";
import { convertToolsToOpenAI, convertToolsToAnthropic } from "../toolConverter";

// Re-export streaming functions
export { processOpenAIStream, processAnthropicStream } from "./streaming";

// ============================================================================
// Role Constants
// ============================================================================

export const ROLE = {
	User: 1,
	Assistant: 2,
	System: 3,
} as const;

// ============================================================================
// Type Guards
// ============================================================================

export function isTextPart(part: unknown): part is { value: string } {
	if (!part || typeof part !== "object") {
		return false;
	}
	const p = part as { value?: unknown };
	return typeof p.value === "string";
}

export function isToolCallPart(
	part: unknown
): part is { callId: string; name: string; input: Record<string, unknown> } {
	if (!part || typeof part !== "object") {
		return false;
	}
	const p = part as { callId?: unknown; name?: unknown; input?: unknown };
	return typeof p.callId === "string" && typeof p.name === "string" && typeof p.input === "object";
}

export function isToolResultPart(part: unknown): part is { callId: string; content: unknown[] } {
	if (!part || typeof part !== "object") {
		return false;
	}
	const p = part as { callId?: unknown; content?: unknown; name?: unknown };
	return typeof p.callId === "string" && Array.isArray(p.content) && !("name" in p);
}

export function isDataPart(part: unknown): part is { mimeType: string; data: Uint8Array } {
	if (!part || typeof part !== "object") {
		return false;
	}
	const p = part as { mimeType?: unknown; data?: unknown };
	return typeof p.mimeType === "string" && p.data instanceof Uint8Array;
}

export function isCacheControlPart(part: unknown): boolean {
	return isDataPart(part) && (part as { mimeType?: string }).mimeType === "cache_control";
}

export function isImagePart(part: unknown): part is { mimeType: string; data: Uint8Array } {
	return (
		isDataPart(part) &&
		(part as { mimeType?: string }).mimeType !== "cache_control" &&
		(part as { mimeType?: string }).mimeType?.startsWith("image/") === true
	);
}

// ============================================================================
// Message Conversion
// ============================================================================

export function convertToOpenAIMessages(messages: readonly VsCodeMessage[]): OpenAIMessage[] {
	const result: OpenAIMessage[] = [];

	for (const msg of messages) {
		const role = msg.role === ROLE.System ? "system" : msg.role === ROLE.Assistant ? "assistant" : "user";

		if (msg.content === undefined || msg.content.length === 0) {
			result.push({ role, content: "" });
			continue;
		}

		let hasToolCall = false;
		const toolCalls: OpenAIMessage["tool_calls"] = [];
		let toolResultContent = "";

		for (const part of msg.content) {
			if (isToolCallPart(part)) {
				hasToolCall = true;
				toolCalls.push({
					id: part.callId,
					type: "function",
					function: {
						name: part.name,
						arguments: JSON.stringify(part.input),
					},
				});
			} else if (isToolResultPart(part)) {
				toolResultContent = String(part.content[0] ?? "");
			}
		}

		if (hasToolCall) {
			if (role === "assistant") {
				result.push({
					role,
					content: undefined,
					tool_calls: toolCalls,
				});
			} else if (role === "user" && toolResultContent) {
				result.push({
					role: "tool",
					tool_call_id: toolCalls?.[0]?.id ?? "",
					content: toolResultContent,
				});
			}
		} else {
			const text = msg.content
				.filter(isTextPart)
				.map((p) => p.value)
				.join("\n");
			result.push({ role, content: text });
		}
	}

	return result;
}

// Re-export for backwards compatibility
export { convertToOpenAI } from "./convert";
export { convertToAnthropic } from "./convert";

// ============================================================================
// Message Order Validation (Anthropic format)
// ============================================================================

/**
 * Anthropic API has strict requirements for message order:
 * 1. Must start with a user message
 * 2. Must alternate between user and assistant roles
 *
 * This function ensures messages meet these requirements.
 */
export function ensureValidMessageOrder(
	messages: Array<{ role: "user" | "assistant"; content: Array<{ type: "text"; text: string }> }>
): Array<{ role: "user" | "assistant"; content: Array<{ type: "text"; text: string }> }> {
	if (messages.length === 0) {
		return [{ role: "user", content: [{ type: "text", text: "Hello" }] }];
	}

	const result: Array<{ role: "user" | "assistant"; content: Array<{ type: "text"; text: string }> }> = [];

	// Ensure first message is user
	if (messages[0].role !== "user") {
		result.push({ role: "user", content: [{ type: "text", text: "(continue)" }] });
	}

	for (const msg of messages) {
		// If the last message in result has the same role, merge or skip
		if (result.length > 0 && result[result.length - 1].role === msg.role) {
			// Merge content
			const lastMsg = result[result.length - 1];
			lastMsg.content.push(...msg.content);
		} else {
			result.push({ ...msg, content: [...msg.content] });
		}
	}

	return result;
}

// ============================================================================
// Request Building
// ============================================================================

export interface BuildRequestOptions {
	readonly messages: readonly VsCodeMessage[];
	readonly tools?: readonly unknown[];
	readonly maxTokens?: number;
}

export function buildRequest(
	provider: "openai" | "anthropic",
	model: string,
	messages: readonly VsCodeMessage[],
	tools: readonly unknown[] | undefined,
	maxTokens: number
): Record<string, unknown> {
	if (provider === "anthropic") {
		const systemMessage = messages.find((m) => m.role === ROLE.System);
		const nonSystemMessages = messages.filter((m) => m.role !== ROLE.System);

		// Convert to Anthropic intermediate format and validate order
		const anthropicMessages = convertToOpenAI(nonSystemMessages).map((m) => ({
			role: m.role as "user" | "assistant",
			content: typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : [],
		}));

		const orderedMessages = ensureValidMessageOrder(anthropicMessages);

		const request: Record<string, unknown> = {
			model,
			messages: orderedMessages.map((m) => ({
				role: m.role,
				content: m.content.map((c) => ({ type: c.type, [c.type]: c.text })),
			})),
			stream: true,
			max_tokens: maxTokens,
		};

		if (systemMessage) {
			const text =
				systemMessage.content
					?.filter(isTextPart)
					.map((p) => p.value)
					.join("\n") ?? "";
			request.system = text;
		}

		if (tools && tools.length > 0) {
			request.tools = convertToolsToAnthropic(tools);
		}

		return request;
	}

	// OpenAI format
	const request: Record<string, unknown> = {
		model,
		messages: convertToOpenAI(messages),
		stream: true,
		max_tokens: maxTokens,
	};

	if (tools && tools.length > 0) {
		request.tools = convertToolsToOpenAI(tools);
	}

	return request;
}
