/**
 * Provider Format Types
 * Type definitions for OpenAI, Anthropic, and VS Code message formats
 */

// ============================================================================
// OpenAI Format Types
// ============================================================================

export interface OpenAIMessage {
	role: "system" | "user" | "assistant" | "tool";
	content?: string | OpenAIContentPart[];
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
	name?: string;
}

export interface OpenAIContentPart {
	type: "text" | "image_url";
	text?: string;
	image_url?: { url: string };
}

export interface OpenAIToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface OpenAITool {
	type: "function";
	function: {
		name: string;
		description?: string;
		parameters?: Record<string, unknown>;
		strict?: boolean;
	};
}

// ============================================================================
// Anthropic Format Types
// ============================================================================

export interface AnthropicMessage {
	role: "user" | "assistant";
	content: AnthropicContentBlock[];
}

/** Text block for Anthropic API */
export interface AnthropicTextBlock {
	type: "text";
	text: string;
}

/** Image block for Anthropic API */
export interface AnthropicImageBlock {
	type: "image";
	source: { type: "base64"; media_type: string; data: string };
}

/** Tool use block for Anthropic API (assistant messages) */
export interface AnthropicToolUseBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: Record<string, unknown>;
}

/** Tool result block for Anthropic API (user messages) */
export interface AnthropicToolResultBlock {
	type: "tool_result";
	tool_use_id: string;
	/** Content can be a string or array of text/image blocks */
	content: string | (AnthropicTextBlock | AnthropicImageBlock)[];
}

export type AnthropicContentBlock =
	| AnthropicTextBlock
	| AnthropicImageBlock
	| AnthropicToolUseBlock
	| AnthropicToolResultBlock;

export interface AnthropicTool {
	name: string;
	description?: string;
	input_schema: Record<string, unknown>;
}

// ============================================================================
// VS Code Message Part Types
// ============================================================================

/**
 * VS Code LanguageModelChatMessageRole enum values:
 * - User = 1 (stable API)
 * - Assistant = 2 (stable API)
 * - System = 3 (proposed API via languageModelSystem proposal)
 */
export const VSCODE_ROLE = {
	User: 1,
	Assistant: 2,
	System: 3,
} as const;

export interface VsCodeTextPart {
	value: string;
}

export interface VsCodeToolCallPart {
	callId: string;
	name: string;
	input: Record<string, unknown>;
}

export interface VsCodeToolResultPart {
	callId: string;
	content: unknown[];
}

export interface VsCodeDataPart {
	mimeType: string;
	data: Uint8Array;
}

export type VsCodeContentPart = VsCodeTextPart | VsCodeToolCallPart | VsCodeToolResultPart | VsCodeDataPart;

export interface VsCodeMessage {
	role: number;
	content?: ReadonlyArray<VsCodeContentPart>;
}
