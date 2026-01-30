/**
 * Message Format Conversion
 * Convert between VS Code, OpenAI, and Anthropic message formats
 */

import {
	OpenAIMessage,
	OpenAIContentPart,
	AnthropicMessage,
	AnthropicContentBlock,
	AnthropicTextBlock,
	AnthropicImageBlock,
	VsCodeMessage,
	VsCodeTextPart,
	VsCodeToolCallPart,
	VsCodeToolResultPart,
	VsCodeDataPart,
	VsCodeContentPart,
	VSCODE_ROLE,
} from "./types";

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if part is a text part
 */
export function isTextPart(part: unknown): part is VsCodeTextPart {
	return (
		part !== null && typeof part === "object" && "value" in part && typeof (part as VsCodeTextPart).value === "string"
	);
}

/**
 * Check if part is a tool call part
 */
export function isToolCallPart(part: unknown): part is VsCodeToolCallPart {
	return part !== null && typeof part === "object" && "callId" in part && "name" in part && "input" in part;
}

/**
 * Check if part is a tool result part
 */
export function isToolResultPart(part: unknown): part is VsCodeToolResultPart {
	return part !== null && typeof part === "object" && "callId" in part && "content" in part && !("name" in part);
}

/**
 * Check if part is a data part (image)
 */
export function isDataPart(part: unknown): part is VsCodeDataPart {
	return part !== null && typeof part === "object" && "mimeType" in part && "data" in part;
}

/**
 * Check if part is a cache control marker (VS Code Copilot internal)
 */
export function isCacheControlPart(part: unknown): boolean {
	return isDataPart(part) && (part as VsCodeDataPart).mimeType === "cache_control";
}

/**
 * Check if part is a real image (not a cache control marker)
 */
export function isImagePart(part: unknown): part is VsCodeDataPart {
	return (
		isDataPart(part) &&
		(part as VsCodeDataPart).mimeType !== "cache_control" &&
		(part as VsCodeDataPart).mimeType.startsWith("image/")
	);
}

// ============================================================================
// OpenAI Conversion
// ============================================================================

/**
 * Convert VS Code messages to OpenAI format
 */
export function convertToOpenAI(messages: readonly VsCodeMessage[]): OpenAIMessage[] {
	const result: OpenAIMessage[] = [];

	for (const msg of messages) {
		// Map VS Code role to OpenAI role
		const role = msg.role === VSCODE_ROLE.System ? "system" : msg.role === VSCODE_ROLE.User ? "user" : "assistant";

		if (!msg.content || msg.content.length === 0) {
			result.push({ role, content: "" });
			continue;
		}

		// Check for tool calls (assistant)
		const toolCalls = msg.content.filter(isToolCallPart);
		if (toolCalls.length > 0) {
			result.push({
				role: "assistant",
				content: undefined,
				tool_calls: toolCalls.map((tc) => ({
					id: tc.callId,
					type: "function" as const,
					function: {
						name: tc.name,
						arguments: JSON.stringify(tc.input),
					},
				})),
			});
			continue;
		}

		// Check for tool results
		const toolResults = msg.content.filter(isToolResultPart);
		if (toolResults.length > 0) {
			for (const tr of toolResults) {
				const contentStr = tr.content
					.map((c) => {
						if (isTextPart(c)) {
							return c.value;
						}
						if (isCacheControlPart(c)) {
							return "";
						}
						return JSON.stringify(c);
					})
					.filter((s) => s)
					.join("\n");
				result.push({
					role: "tool",
					tool_call_id: tr.callId,
					content: contentStr,
				});
			}
			continue;
		}

		// Regular content (text and images)
		const parts: OpenAIContentPart[] = [];
		for (const part of msg.content) {
			if (isTextPart(part)) {
				parts.push({ type: "text", text: part.value });
			} else if (isCacheControlPart(part)) {
				continue;
			} else if (isImagePart(part)) {
				const base64 = Buffer.from(part.data).toString("base64");
				const dataUrl = `data:${part.mimeType};base64,${base64}`;
				parts.push({ type: "image_url", image_url: { url: dataUrl } });
			}
		}

		if (parts.length === 1 && parts[0].type === "text") {
			result.push({ role, content: parts[0].text });
		} else if (parts.length > 0) {
			result.push({ role, content: parts });
		}
	}

	return result;
}

// ============================================================================
// Anthropic Conversion
// ============================================================================

/**
 * Convert VS Code content parts to Anthropic content blocks for ASSISTANT messages
 */
function apiContentToAnthropicContentForAssistant(content: ReadonlyArray<VsCodeContentPart>): AnthropicContentBlock[] {
	const convertedContent: AnthropicContentBlock[] = [];

	for (const part of content) {
		if (isToolCallPart(part)) {
			convertedContent.push({
				type: "tool_use",
				id: part.callId,
				input: part.input,
				name: part.name,
			});
		} else if (isTextPart(part)) {
			if (part.value === "") {
				continue;
			}
			convertedContent.push({
				type: "text",
				text: part.value,
			});
		}
	}
	return convertedContent;
}

/**
 * Convert VS Code content parts to Anthropic content blocks for USER messages
 */
function apiContentToAnthropicContentForUser(content: ReadonlyArray<VsCodeContentPart>): AnthropicContentBlock[] {
	const convertedContent: AnthropicContentBlock[] = [];

	for (const part of content) {
		if (isImagePart(part)) {
			convertedContent.push({
				type: "image",
				source: {
					type: "base64",
					data: Buffer.from(part.data).toString("base64"),
					media_type: part.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
				},
			});
		} else if (isCacheControlPart(part)) {
			continue;
		} else if (isToolResultPart(part)) {
			const resultBlocks: (AnthropicTextBlock | AnthropicImageBlock)[] = [];
			for (const c of part.content || []) {
				if (isTextPart(c)) {
					if (c.value && c.value.trim() !== "") {
						resultBlocks.push({ type: "text", text: c.value });
					}
				} else if (isCacheControlPart(c)) {
					continue;
				} else if (isImagePart(c)) {
					resultBlocks.push({
						type: "image",
						source: {
							type: "base64",
							media_type: (c as VsCodeDataPart).mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
							data: Buffer.from((c as VsCodeDataPart).data).toString("base64"),
						},
					});
				}
			}
			if (resultBlocks.length === 0) {
				convertedContent.push({
					type: "tool_result",
					tool_use_id: part.callId,
					content: "",
				});
			} else if (resultBlocks.length === 1 && resultBlocks[0].type === "text") {
				convertedContent.push({
					type: "tool_result",
					tool_use_id: part.callId,
					content: resultBlocks[0].text,
				});
			} else {
				convertedContent.push({
					type: "tool_result",
					tool_use_id: part.callId,
					content: resultBlocks,
				});
			}
		} else if (isTextPart(part)) {
			if (part.value === "") {
				continue;
			}
			convertedContent.push({
				type: "text",
				text: part.value,
			});
		}
	}
	return convertedContent;
}

/**
 * Convert VS Code messages to Anthropic format
 */
export function convertToAnthropic(messages: readonly VsCodeMessage[]): {
	system?: string;
	messages: AnthropicMessage[];
} {
	const unmergedMessages: AnthropicMessage[] = [];
	let systemText = "";

	for (const message of messages) {
		if (message.role === VSCODE_ROLE.Assistant) {
			const content = apiContentToAnthropicContentForAssistant(message.content || []);
			if (content.length > 0) {
				unmergedMessages.push({
					role: "assistant",
					content,
				});
			}
		} else if (message.role === VSCODE_ROLE.User) {
			const content = apiContentToAnthropicContentForUser(message.content || []);
			if (content.length > 0) {
				unmergedMessages.push({
					role: "user",
					content,
				});
			}
		} else if (message.role === VSCODE_ROLE.System) {
			systemText += (message.content || [])
				.map((p) => {
					if (isTextPart(p)) {
						return p.value;
					}
					return "";
				})
				.join("");
		}
	}

	// Merge messages of the same type that are adjacent
	const mergedMessages: AnthropicMessage[] = [];
	for (const message of unmergedMessages) {
		if (mergedMessages.length === 0 || mergedMessages[mergedMessages.length - 1].role !== message.role) {
			mergedMessages.push(message);
		} else {
			const prevMessage = mergedMessages[mergedMessages.length - 1];
			if (Array.isArray(prevMessage.content) && Array.isArray(message.content)) {
				(prevMessage.content as AnthropicContentBlock[]).push(...(message.content as AnthropicContentBlock[]));
			}
		}
	}

	// Anthropic API requires messages to start with 'user' role
	if (mergedMessages.length > 0 && mergedMessages[0].role === "assistant") {
		mergedMessages.unshift({ role: "user", content: [{ type: "text", text: "(continue)" }] });
	}

	// Ensure we have at least one message
	if (mergedMessages.length === 0) {
		mergedMessages.push({ role: "user", content: [{ type: "text", text: "(start)" }] });
	}

	return { system: systemText || undefined, messages: mergedMessages };
}
