export {
	ACPClientManager,
	type ACPClientConfig,
	type AgentInfo,
	type InitResult,
	type NewSessionResult,
	type NewSessionResponse,
	type PromptResult,
	type PromptResponse,
	type TerminalCreateResult,
	type TerminalOutputResult,
	type MCPServerConfig,
	type ClientCallbacks,
	type IVsCodeTerminal,
	// New v2 API types
	type TerminalOutputResultFull,
	type TerminalExitResult,
	type PermissionOptionKind,
} from "./clientManager";
export type {
	ClientSideConnection,
	ContentBlock,
	RequestPermissionRequest,
	RequestPermissionResponse,
	ReadTextFileRequest,
	ReadTextFileResponse,
	WriteTextFileRequest,
	WriteTextFileResponse,
	CreateTerminalRequest,
	CreateTerminalResponse,
	TerminalOutputRequest,
	TerminalOutputResponse,
	ReleaseTerminalRequest,
	ReleaseTerminalResponse,
	WaitForTerminalExitRequest,
	WaitForTerminalExitResponse,
	KillTerminalCommandRequest,
	KillTerminalCommandResponse,
} from "@agentclientprotocol/sdk";

// VS Code ACP Integration - LanguageModelChatProvider (stable API)
export { ACPProvider, registerACPProvider, type ACPModelInfo, type ACPProviderOptions } from "./acpProvider";

// VS Code ACP Integration - ChatParticipant (rich UI with ChatToolInvocationPart)
export { ACPChatParticipant, registerACPChatParticipant, type ACPChatParticipantOptions } from "./acpChatParticipant";

/**
 * @deprecated Use `createTerminalCallbacks()` from "./terminal" instead.
 * These exports will be removed in v2.0.
 *
 * Migration example:
 * ```typescript
 * // Before (deprecated):
 * import { ACPTerminalProvider } from "@all-in-copilot/sdk/acp";
 * const provider = new ACPTerminalProvider(terminalService);
 * await provider.executeCommand(command);
 *
 * // After (recommended):
 * import { createTerminalCallbacks } from "@all-in-copilot/sdk/acp";
 * const { callbacks, adapter } = createTerminalCallbacks(terminalService);
 * const terminal = await callbacks.createTerminal(sessionId, command);
 * const output = await callbacks.getTerminalOutput(terminal.terminalId);
 * ```
 */
export { ACPTerminalProvider, executeInTerminal, executeInNewTerminal } from "./terminalProvider";

// ACP Terminal Adapter - Full ACP protocol terminal operations
export {
	// Types
	type ACPCreateTerminalRequest,
	type ACPCreateTerminalResponse,
	type ACPTerminalOutputRequest,
	type ACPTerminalOutputResponse,
	type ACPWaitForExitRequest,
	type ACPWaitForExitResponse,
	type ACPKillRequest,
	type ACPKillResponse,
	type ACPReleaseRequest,
	type ACPReleaseResponse,
	type ITerminalHandle,
	type IACPTerminalAdapter,
	type TerminalState,
	type ACPEnvVariable,
	type ExitStatus,
	// Buffer Manager
	generateTerminalId,
	initializeTerminalBuffer,
	appendToTerminalBuffer,
	getBufferInfo,
	getTerminalById,
	waitForTerminalCompletion,
	isTerminalCompleted,
	getTerminalExitStatus,
	cleanupTerminalById,
	installEnhancedTerminalListeners,
	// Adapter
	ACPTerminalAdapter,
	createACPTerminalAdapter,
	// Callback Integration
	type ACPTerminalCallbacks,
	createTerminalCallbacks,
	disposeTerminalAdapter,
} from "./terminal";
