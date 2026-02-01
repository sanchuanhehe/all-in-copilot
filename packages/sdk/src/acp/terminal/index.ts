/*---------------------------------------------------------------------------------------------
 *  ACP Terminal Module Exports
 *--------------------------------------------------------------------------------------------*/

// Types
export type {
	ACPCreateTerminalRequest,
	ACPCreateTerminalResponse,
	ACPTerminalOutputRequest,
	ACPTerminalOutputResponse,
	ACPWaitForExitRequest,
	ACPWaitForExitResponse,
	ACPKillRequest,
	ACPKillResponse,
	ACPReleaseRequest,
	ACPReleaseResponse,
	ITerminalHandle,
	IACPTerminalAdapter,
	TerminalState,
	ACPEnvVariable,
	ExitStatus,
} from "./types";

// Buffer Manager
export {
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
} from "./terminalBufferManager";

// Adapter
export { ACPTerminalAdapter, createACPTerminalAdapter } from "./acpTerminalAdapter";

// Callback Integration
export type { ACPTerminalCallbacks } from "./callbackIntegration";
export { createTerminalCallbacks, disposeTerminalAdapter } from "./callbackIntegration";
