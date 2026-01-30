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

// VS Code ACP Integration
export {
	ACPProvider,
	registerACPProvider,
	type ACPModelInfo,
	type ACPProviderOptions,
} from "./acpProvider";
