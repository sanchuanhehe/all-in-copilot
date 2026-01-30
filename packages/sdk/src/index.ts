/**
 * SDK Main Entry Point
 */

// Core types
export {
	ApiMode,
	ProviderConfig,
	ModelConfig,
	MessageRole,
	TextContent,
	ImageContent,
	MessageContent,
	ChatMessage,
	ToolCall,
} from "./core/types";

// Model fetcher
export {
	fetchModels,
	createCachedModelFetcher,
	CachedModelFetcher,
	type ModelsResponse,
	type RemoteModelItem,
	type ModelFetchOptions,
} from "./core/modelFetcher";

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
} from "./utils/format";

// Tool conversion (re-exported for templates)
export { convertToolsToOpenAI, convertToolsToAnthropic } from "./utils/toolConverter";

// Providers (using official SDKs - for advanced use cases)
export { OpenAIProvider } from "./providers/openaiProvider";
export { AnthropicProvider } from "./providers/anthropicProvider";

// ACP Protocol (Agent Client Protocol)
export {
	ACPClientManager,
	ACPProvider,
	registerACPProvider,
	type ACPClientConfig,
	type ACPModelInfo,
	type ACPProviderOptions,
	type ContentBlock,
	type TerminalCreateResult,
	type TerminalOutputResult,
	type MCPServerConfig,
} from "./acp";

// Utilities
export { mapVsCodeRole, convertVsCodeContent } from "./utils/messageConverter";
export { estimateTokens, estimateMessagesTokens } from "./utils/tokenCounter";
export { sanitizeFunctionName, pruneUnknownSchemaKeywords } from "./utils/toolConverter";

// Model fetching
export { fetchModelsFromAPI } from "./core/modelFetcher";
