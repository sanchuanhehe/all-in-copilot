export {
	ACPClientManager,
	type ACPClientConfig,
	type AgentInfo,
	type InitResult,
	type NewSessionResult,
	type NewSessionResponse,
	type PromptResult,
	type PromptResponse,
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
} from "@agentclientprotocol/sdk";

// VS Code ACP Integration
export {
	ACPProvider,
	registerACPProvider,
	type ACPModelInfo,
	type ACPProviderOptions,
} from "./acpProvider";
