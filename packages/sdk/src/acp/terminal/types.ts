/*---------------------------------------------------------------------------------------------
 *  ACP Terminal Types
 *  Types for ACP protocol terminal operations
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from "vscode";

/**
 * Environment variable definition for ACP terminal
 */
export interface ACPEnvVariable {
	name: string;
	value: string;
}

/**
 * ACP Terminal Exit Status
 */
export interface ACPTerminalExitStatus {
	exitCode?: number;
	signal?: string;
}

/**
 * Alias for ACPTerminalExitStatus for convenience
 */
export type ExitStatus = ACPTerminalExitStatus;

/**
 * ACP Create Terminal Request (matches ACP protocol)
 */
export interface ACPCreateTerminalRequest {
	sessionId: string;
	command: string;
	args?: string[];
	env?: Array<{ name: string; value: string }>;
	cwd?: string;
	outputByteLimit?: number;
}

/**
 * ACP Create Terminal Response
 */
export interface ACPCreateTerminalResponse {
	terminalId: string;
}

/**
 * ACP Terminal Output Request
 */
export interface ACPTerminalOutputRequest {
	terminalId: string;
}

/**
 * ACP Terminal Output Response
 */
export interface ACPTerminalOutputResponse {
	output: string;
	truncated: boolean;
	exitStatus?: ACPTerminalExitStatus;
}

/**
 * ACP Wait For Exit Request
 */
export interface ACPWaitForExitRequest {
	terminalId: string;
	timeoutMs?: number;
}

/**
 * ACP Wait For Exit Response
 */
export interface ACPWaitForExitResponse {
	exitCode?: number;
	signal?: string;
}

/**
 * ACP Kill Command Request
 */
export interface ACPKillRequest {
	terminalId: string;
	signal?: string;
}

/**
 * ACP Kill Command Response
 */
export interface ACPKillResponse {
	success: boolean;
}

/**
 * ACP Release Terminal Request
 */
export interface ACPReleaseRequest {
	terminalId: string;
}

/**
 * ACP Release Terminal Response
 */
export interface ACPReleaseResponse {
	success: boolean;
}

/**
 * Terminal execution state
 */
export const enum TerminalState {
	/** Terminal is running */
	Running = "running",
	/** Terminal command completed */
	Completed = "completed",
	/** Terminal command was killed */
	Killed = "killed",
	/** Terminal was released */
	Released = "released",
}

/**
 * Internal terminal handle with tracking info
 */
export interface ITerminalHandle {
	/** Unique terminal ID */
	terminalId: string;
	/** VS Code Terminal instance */
	terminal: Terminal;
	/** Session ID this terminal belongs to */
	sessionId: string;
	/** Command being executed */
	command: string;
	/** Command arguments */
	args?: string[];
	/** Working directory */
	cwd?: string;
	/** Environment variables */
	env?: Array<{ name: string; value: string }>;
	/** Maximum output bytes to capture */
	outputByteLimit: number;
	/** Captured output buffer */
	outputBuffer: string;
	/** Whether output was truncated */
	outputTruncated: boolean;
	/** Terminal state */
	state: TerminalState;
	/** Exit status if completed */
	exitStatus?: ACPTerminalExitStatus;
	/** Creation timestamp */
	createdAt: number;
	/** Completion timestamp */
	completedAt?: number;
	/** Promise resolvers for waitForExit */
	exitWaiters: Array<{
		resolve: (result: ACPWaitForExitResponse) => void;
		reject: (error: Error) => void;
		timeoutId?: NodeJS.Timeout;
	}>;
}

/**
 * ACP Terminal Adapter Interface
 * Provides ACP protocol-compliant terminal operations
 */
export interface IACPTerminalAdapter {
	/**
	 * Create a terminal and execute a command (ACP terminal/create)
	 */
	createTerminal(request: ACPCreateTerminalRequest): Promise<ACPCreateTerminalResponse>;

	/**
	 * Get terminal output (ACP terminal/output)
	 */
	getOutput(request: ACPTerminalOutputRequest): Promise<ACPTerminalOutputResponse>;

	/**
	 * Wait for terminal command to exit (ACP terminal/wait_for_exit)
	 */
	waitForExit(request: ACPWaitForExitRequest): Promise<ACPWaitForExitResponse>;

	/**
	 * Kill a terminal command (ACP terminal/kill)
	 */
	killCommand(request: ACPKillRequest): Promise<ACPKillResponse>;

	/**
	 * Release a terminal and free resources (ACP terminal/release)
	 */
	release(request: ACPReleaseRequest): Promise<ACPReleaseResponse>;

	/**
	 * Get all terminal IDs for a session
	 */
	getSessionTerminalIds(sessionId: string): string[];

	/**
	 * Clean up all terminals for a session
	 */
	disposeSession(sessionId: string): Promise<void>;

	/**
	 * Get terminal handle by ID (for direct VS Code terminal access)
	 */
	getTerminalHandle(terminalId: string): ITerminalHandle | undefined;

	/**
	 * Clean up all resources
	 */
	dispose(): void;
}
