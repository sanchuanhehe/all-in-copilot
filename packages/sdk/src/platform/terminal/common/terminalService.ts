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
	 * Selection in the active terminal
	 */
	readonly terminalSelection: string;

	/**
	 * Shell type of the active terminal
	 */
	readonly terminalShellType: string;

	/**
	 * Event fired when a terminal is closed
	 */
	readonly onDidCloseTerminal: vscode.Event<vscode.Terminal>;

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
