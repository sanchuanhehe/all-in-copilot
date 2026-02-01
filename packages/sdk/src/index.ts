/**
 * SDK Main Entry Point
 */

// Core types (for templates)
export { ProviderConfig, ModelConfig } from "./core/types";

// VS Code Provider Helpers (the main export for templates)
export {
	// VS Code types
	VSCODE_ROLE as ROLE,
	type VsCodeMessage,
	type VsCodeTextPart,
	type VsCodeToolCallPart,
	type VsCodeToolResultPart,
	type VsCodeDataPart,
	type VsCodeContentPart,
	// OpenAI types
	type OpenAIMessage,
	type OpenAIContentPart,
	type OpenAIToolCall,
	type OpenAITool,
	// Anthropic types
	type AnthropicMessage,
	type AnthropicContentBlock,
	type AnthropicTool,
	// Type guards
	isTextPart,
	isToolCallPart,
	isToolResultPart,
	isDataPart,
	// Message conversion
	convertToOpenAI,
	convertToAnthropic,
	// Streaming processors
	processOpenAIStream,
	processAnthropicStream,
	// Request builder for templates
	buildRequest,
	// Complete request/response handling
	sendChatRequest,
	sendChatRequestWithProvider,
	type SendChatRequestConfig,
	type ChatResponseCallbacks,
} from "./utils/format";

// Tool conversion
export { sanitizeFunctionName, pruneUnknownSchemaKeywords } from "./utils/toolConverter";

// ACP Protocol (Agent Client Protocol)
export {
	ACPClientManager,
	// Unified Provider (ChatParticipant + LanguageModelChatProvider)
	ACPUnifiedProvider,
	registerACPUnifiedProvider,
	// ACP Terminal Adapter
	ACPTerminalAdapter,
	createACPTerminalAdapter,
	createTerminalCallbacks,
	disposeTerminalAdapter,
	/**
	 * @deprecated Use `createTerminalCallbacks()` instead. Will be removed in v2.0.
	 */
	ACPTerminalProvider,
	/**
	 * @deprecated Use `createTerminalCallbacks()` instead. Will be removed in v2.0.
	 */
	executeInTerminal,
	/**
	 * @deprecated Use `createTerminalCallbacks()` instead. Will be removed in v2.0.
	 */
	executeInNewTerminal,
	type ACPClientConfig,
	type ACPModelInfo,
	type ACPUnifiedProviderOptions,
	type ContentBlock,
	type TerminalCreateResult,
	type TerminalOutputResult,
	type MCPServerConfig,
	type ClientCallbacks,
	type IVsCodeTerminal,
	type IACPTerminalAdapter,
	type ACPTerminalCallbacks,
} from "./acp";

// Utilities
export { estimateTokens, estimateMessagesTokens } from "./utils/tokenCounter";

// Model fetching
export { fetchModelsFromAPI } from "./core/modelFetcher";

// Platform Services (Terminal and Permission management)
export * from "./platform";
