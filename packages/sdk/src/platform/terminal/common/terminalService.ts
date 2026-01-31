/*---------------------------------------------------------------------------------------------
 *  Terminal Service Interface for All-In Copilot SDK
 *  Adapted from VS Code Copilot - terminalService.ts
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal, TerminalExecutedCommand, TerminalShellIntegrationChangeEvent, TerminalShellExecutionEndEvent, TerminalDataWriteEvent, TerminalOptions, ExtensionTerminalOptions, Event, Uri } from 'vscode';

/**
 * Service identifier for ITerminalService
 */
export const ITerminalService = Symbol('ITerminalService');

/**
 * Interface for terminal management service
 */
export interface ITerminalService {
	readonly _serviceBrand: undefined;

	/**
	 * Buffer content of the active terminal
	 */
	readonly terminalBuffer: string;

	/**
	 * Last executed command in the active terminal
	 * Uses proposed API - may be undefined in some VS Code versions
	 */
	readonly terminalLastCommand: TerminalExecutedCommand | undefined;

	/**
	 * Selection in the active terminal
	 */
	readonly terminalSelection: string;

	/**
	 * Shell type of the active terminal
	 */
	readonly terminalShellType: string;

	/**
	 * Event fired when terminal shell integration changes
	 * Uses proposed API - may not be available in all VS Code versions
	 */
	readonly onDidChangeTerminalShellIntegration: Event<TerminalShellIntegrationChangeEvent>;

	/**
	 * Event fired when terminal shell execution ends
	 * Uses proposed API - may not be available in all VS Code versions
	 */
	readonly onDidEndTerminalShellExecution: Event<TerminalShellExecutionEndEvent>;

	/**
	 * Event fired when a terminal is closed
	 */
	readonly onDidCloseTerminal: Event<Terminal>;

	/**
	 * Event fired when data is written to a terminal
	 * Uses proposed API - may not be available in all VS Code versions
	 */
	readonly onDidWriteTerminalData: Event<TerminalDataWriteEvent>;

	/**
	 * Get all terminals
	 */
	readonly terminals: readonly Terminal[];

	/**
	 * Create a terminal with the given name, shell path, and shell args
	 */
	createTerminal(name?: string, shellPath?: string, shellArgs?: readonly string[] | string): Terminal;

	/**
	 * Create a terminal with the given options
	 */
	createTerminal(options: TerminalOptions): Terminal;

	/**
	 * Create an extension terminal with the given options
	 */
	createTerminal(options: ExtensionTerminalOptions): Terminal;

	/**
	 * Get the buffer content for a terminal
	 * @param terminal The terminal to get the buffer for
	 * @param maxChars Maximum number of characters to return (default: 16000)
	 */
	getBufferForTerminal(terminal: Terminal, maxChars?: number): string;

	/**
	 * Get the buffer content for a terminal by process ID
	 * @param pid The process ID of the terminal
	 * @param maxChars Maximum number of characters to return (default: 16000)
	 */
	getBufferWithPid(pid: number, maxChars?: number): Promise<string>;

	/**
	 * Get the last command executed in a terminal
	 * @param terminal The terminal to get the last command for
	 */
	getLastCommandForTerminal(terminal: Terminal): TerminalExecutedCommand | undefined;

	/**
	 * Contribute a path to the terminal PATH environment variable
	 * @param contributor Unique identifier for the contributor
	 * @param pathLocation The path to add to PATH
	 * @param description Optional description for the PATH contribution
	 * @param prepend Whether to prepend (true) or append (false) the path (default: false)
	 */
	contributePath(contributor: string, pathLocation: string, description?: string, prepend?: boolean): void;

	/**
	 * Contribute a path to the terminal PATH environment variable
	 * @param contributor Unique identifier for the contributor
	 * @param pathLocation The path to add to PATH
	 * @param description Optional command description for the PATH contribution
	 * @param prepend Whether to prepend (true) or append (false) the path (default: false)
	 */
	contributePath(contributor: string, pathLocation: string, description?: { command: string }, prepend?: boolean): void;

	/**
	 * Remove a path contribution from the terminal PATH environment variable
	 * @param contributor Unique identifier for the contributor
	 */
	removePathContribution(contributor: string): void;

	/**
	 * Get the working directory for a specific session
	 * @param sessionId The session identifier
	 */
	getCwdForSession(sessionId: string): Promise<Uri | undefined>;

	/**
	 * Get all terminals associated with a specific session
	 * @param sessionId The session identifier
	 */
	getCopilotTerminals(sessionId: string): Promise<IKnownTerminal[]>;

	/**
	 * Associate a terminal with a session
	 * @param terminal The terminal to associate
	 * @param sessionId The session identifier
	 * @param shellIntegrationQuality The quality of shell integration
	 */
	associateTerminalWithSession(terminal: Terminal, sessionId: string, shellIntegrationQuality: ShellIntegrationQuality): Promise<void>;

	/**
	 * Clean up resources
	 */
	dispose(): void;
}

/**
 * Terminal shell integration quality levels
 */
export const enum ShellIntegrationQuality {
	None = 'none',
	Basic = 'basic',
	Rich = 'rich',
}

/**
 * Extended terminal interface with session ID
 */
export interface IKnownTerminal extends Terminal {
	id: string;
}

/**
 * Check if a thing is an ITerminalService
 */
export function isTerminalService(thing: unknown): thing is ITerminalService {
	return thing !== null && typeof thing === 'object' && 'createTerminal' in thing && typeof thing.createTerminal === 'function';
}

/**
 * Null implementation of ITerminalService for testing and fallback
 */
export class NullTerminalService implements ITerminalService {
	declare readonly _serviceBrand: undefined;

	private readonly _disposables: { dispose(): void }[] = [];

	readonly terminalBuffer = '';

	readonly terminalLastCommand: TerminalExecutedCommand | undefined = undefined;

	readonly terminalSelection = '';

	readonly terminalShellType = '';

	get onDidChangeTerminalShellIntegration(): Event<TerminalShellIntegrationChangeEvent> {
		return (_listener: (e: TerminalShellIntegrationChangeEvent) => void) => {
			return { dispose: () => this._disposables.splice(0) };
		};
	}

	get onDidEndTerminalShellExecution(): Event<TerminalShellExecutionEndEvent> {
		return (_listener: (e: TerminalShellExecutionEndEvent) => void) => {
			return { dispose: () => this._disposables.splice(0) };
		};
	}

	get onDidCloseTerminal(): Event<Terminal> {
		return (_listener: (e: Terminal) => void) => {
			return { dispose: () => this._disposables.splice(0) };
		};
	}

	get onDidWriteTerminalData(): Event<TerminalDataWriteEvent> {
		return (_listener: (e: TerminalDataWriteEvent) => void) => {
			return { dispose: () => this._disposables.splice(0) };
		};
	}

	get terminals(): readonly Terminal[] {
		return [];
	}

	createTerminal(name?: string, shellPath?: string, shellArgs?: readonly string[] | string): Terminal;
	createTerminal(options: TerminalOptions): Terminal;
	createTerminal(options: ExtensionTerminalOptions): Terminal;
	createTerminal(): Terminal {
		return {} as Terminal;
	}

	getBufferForTerminal(): string {
		return '';
	}

	async getBufferWithPid(): Promise<string> {
		return '';
	}

	getLastCommandForTerminal(): TerminalExecutedCommand | undefined {
		return undefined;
	}

	contributePath(): void {
		// No-op for null service
	}

	removePathContribution(): void {
		// No-op for null service
	}

	async getCwdForSession(): Promise<Uri | undefined> {
		return undefined;
	}

	async getCopilotTerminals(): Promise<IKnownTerminal[]> {
		return [];
	}

	async associateTerminalWithSession(): Promise<void> {
		// No-op for null service
	}

	dispose(): void {
		// No-op for null service
	}
}
