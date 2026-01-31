/*---------------------------------------------------------------------------------------------
 *  Terminal Service Interface for All-In Copilot SDK
 *  Adapted from VS Code Copilot - terminalService.ts
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

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
	readonly terminalLastCommand: vscode.TerminalExecutedCommand | undefined;

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
	readonly onDidChangeTerminalShellIntegration: vscode.Event<vscode.TerminalShellIntegrationChangeEvent>;

	/**
	 * Event fired when terminal shell execution ends
	 * Uses proposed API - may not be available in all VS Code versions
	 */
	readonly onDidEndTerminalShellExecution: vscode.Event<vscode.TerminalShellExecutionEndEvent>;

	/**
	 * Event fired when a terminal is closed
	 */
	readonly onDidCloseTerminal: vscode.Event<vscode.Terminal>;

	/**
	 * Event fired when data is written to a terminal
	 * Uses proposed API - may not be available in all VS Code versions
	 */
	readonly onDidWriteTerminalData: vscode.Event<vscode.TerminalDataWriteEvent>;

	/**
	 * Get all terminals
	 */
	readonly terminals: readonly vscode.Terminal[];

	/**
	 * Create a terminal with the given name, shell path, and shell args
	 */
	createTerminal(name?: string, shellPath?: string, shellArgs?: readonly string[] | string): vscode.Terminal;

	/**
	 * Create a terminal with the given options
	 */
	createTerminal(options: vscode.TerminalOptions): vscode.Terminal;

	/**
	 * Create an extension terminal with the given options
	 */
	createTerminal(options: vscode.ExtensionTerminalOptions): vscode.Terminal;

	/**
	 * Get the buffer content for a terminal
	 * @param terminal The terminal to get the buffer for
	 * @param maxChars Maximum number of characters to return (default: 16000)
	 */
	getBufferForTerminal(terminal: vscode.Terminal, maxChars?: number): string;

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
	getLastCommandForTerminal(terminal: vscode.Terminal): vscode.TerminalExecutedCommand | undefined;

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
export interface IKnownTerminal extends vscode.Terminal {
	id: string;
}

/**
 * Check if a thing is an ITerminalService
 */
export function isTerminalService(thing: any): thing is ITerminalService {
	return thing && typeof thing.createTerminal === 'function';
}

/**
 * Null implementation of ITerminalService for testing and fallback
 */
export class NullTerminalService implements ITerminalService {
	declare readonly _serviceBrand: undefined;

	private readonly _disposables: { dispose(): void }[] = [];

	get terminalBuffer(): string {
		return '';
	}

	get terminalLastCommand(): vscode.TerminalExecutedCommand | undefined {
		return undefined;
	}

	get terminalSelection(): string {
		return '';
	}

	get terminalShellType(): string {
		return '';
	}

	get onDidChangeTerminalShellIntegration(): vscode.Event<vscode.TerminalShellIntegrationChangeEvent> {
		return (listener: (e: vscode.TerminalShellIntegrationChangeEvent) => any) => {
			return { dispose: () => this._disposables.splice(0) };
		};
	}

	get onDidEndTerminalShellExecution(): vscode.Event<vscode.TerminalShellExecutionEndEvent> {
		return (listener: (e: vscode.TerminalShellExecutionEndEvent) => any) => {
			return { dispose: () => this._disposables.splice(0) };
		};
	}

	get onDidCloseTerminal(): vscode.Event<vscode.Terminal> {
		return (listener: (e: vscode.Terminal) => any) => {
			return { dispose: () => this._disposables.splice(0) };
		};
	}

	get onDidWriteTerminalData(): vscode.Event<vscode.TerminalDataWriteEvent> {
		return (listener: (e: vscode.TerminalDataWriteEvent) => any) => {
			return { dispose: () => this._disposables.splice(0) };
		};
	}

	get terminals(): readonly vscode.Terminal[] {
		return [];
	}

	createTerminal(name?: string, shellPath?: string, shellArgs?: readonly string[] | string): vscode.Terminal;
	createTerminal(options: vscode.TerminalOptions): vscode.Terminal;
	createTerminal(options: vscode.ExtensionTerminalOptions): vscode.Terminal;
	createTerminal(): vscode.Terminal {
		return {} as vscode.Terminal;
	}

	getBufferForTerminal(): string {
		return '';
	}

	async getBufferWithPid(): Promise<string> {
		return '';
	}

	getLastCommandForTerminal(): vscode.TerminalExecutedCommand | undefined {
		return undefined;
	}

	contributePath(): void {
		// No-op for null service
	}

	removePathContribution(): void {
		// No-op for null service
	}

	dispose(): void {
		// No-op for null service
	}
}
