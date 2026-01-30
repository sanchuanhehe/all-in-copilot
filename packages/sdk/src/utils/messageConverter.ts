/**
 * Message conversion utilities
 * Convert between different message formats
 */

import type { ChatMessage } from "../core/types";

/**
 * Role string constants
 */
export const ROLE = {
	SYSTEM: "system",
	USER: "user",
	ASSISTANT: "assistant",
	TOOL: "tool",
} as const;

/**
 * Map VS Code message role to internal role
 */
export function mapVsCodeRole(role: number): "system" | "user" | "assistant" | "tool" {
	// VSCodeLanguageModelChatMessageRole is an enum
	// System = 1, User = 2, Assistant = 3
	switch (role) {
		case 1:
			return "system";
		case 3:
			return "assistant";
		default:
			return "user";
	}
}

/**
 * Convert VS Code content parts to internal message format
 */
export function convertVsCodeContent(
	content: readonly unknown[]
): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
	const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

	for (const part of content) {
		if (part && typeof part === "object") {
			const p = part as Record<string, unknown>;

			if (p.type === "text" && typeof p.text === "string") {
				parts.push({ type: "text", text: p.text });
			} else if (p.type === "image_url" && typeof p.image_url === "object") {
				const imageUrl = p.image_url as Record<string, string>;
				if (typeof imageUrl.url === "string") {
					parts.push({ type: "image_url", image_url: { url: imageUrl.url } });
				}
			} else if ("value" in p && typeof p.value === "string") {
				// VSCodeLanguageModelTextPart
				parts.push({ type: "text", text: p.value });
			}
		}
	}

	return parts.length > 0 && parts.some((p) => p.type !== "text")
		? (parts as Array<{ type: string; text?: string; image_url?: { url: string } }>)
		: parts.map((p) => (p as { text?: string }).text ?? "").join("");
}

/**
 * Convert internal messages to provider format (e.g., OpenAI)
 */
export function convertToProviderFormat(
	messages: ChatMessage[],
	provider: "openai" | "anthropic" | "gemini" = "openai"
): unknown[] {
	return messages.map((msg) => {
		const converted: Record<string, unknown> = {
			role: msg.role,
		};

		if (typeof msg.content === "string") {
			converted.content = msg.content;
		} else if (Array.isArray(msg.content)) {
			const textParts: string[] = [];
			const imageUrls: Array<{ type: string; image_url: { url: string } }> = [];

			for (const part of msg.content) {
				if (part.type === "text" && part.text) {
					textParts.push(part.text);
				} else if (part.type === "image_url" && part.image_url) {
					imageUrls.push(part);
				}
			}

			if (provider === "openai") {
				converted.content = textParts.join("") || (imageUrls.length > 0 ? imageUrls : undefined);
				if (imageUrls.length > 0 && textParts.length === 0) {
					converted.content = imageUrls;
				}
			} else {
				// Other providers may handle content differently
				converted.content = textParts.join("\n");
			}
		}

		if (msg.name) {
			converted.name = msg.name;
		}

		if (msg.tool_calls && msg.tool_calls.length > 0) {
			converted.tool_calls = msg.tool_calls;
		}

		if (msg.tool_call_id) {
			converted.tool_call_id = msg.tool_call_id;
		}

		return converted;
	});
}

/**
 * Extract text content from a message
 */
export function extractTextContent(message: ChatMessage): string {
	if (typeof message.content === "string") {
		return message.content;
	}

	if (Array.isArray(message.content)) {
		return message.content
			.filter((p) => p.type === "text" && p.text)
			.map((p) => (p as { text: string }).text)
			.join("");
	}

	return "";
}

/**
 * Check if content contains images
 */
export function hasImages(message: ChatMessage): boolean {
	if (typeof message.content === "string") {
		return false;
	}

	if (Array.isArray(message.content)) {
		return message.content.some((p) => p.type === "image_url");
	}

	return false;
}
