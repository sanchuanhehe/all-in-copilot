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

// VS Code Terminal Provider for real integrated terminals
export { ACPTerminalProvider, executeInTerminal, executeInNewTerminal } from "./terminalProvider";
