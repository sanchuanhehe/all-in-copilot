/*---------------------------------------------------------------------------------------------
 *  Terminal Buffer Listener for All-In Copilot SDK
 *  Adapted from VS Code Copilot terminalBufferListener.ts
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Terminal, window } from 'vscode';
import { basename } from 'path';

// Import proposed API types (these are defined in vscode.proposed.d.ts)
// @ts-ignore - TerminalExecutedCommand is a proposed API
import type { TerminalExecutedCommand } from '../../../vscode/vscode.proposed';

/**
 * Maps terminals to their output buffers
 */
const terminalBuffers: Map<Terminal, string[]> = new Map();

/**
 * Maps terminals to their executed commands
 * Uses proposed API TerminalExecutedCommand
 */
const terminalCommands: Map<Terminal, TerminalExecutedCommand[]> = new Map();

/**
 * Last detected shell type (for fallback)
 */
let lastDetectedShellType: string | undefined;

/**
 * Remove ANSI escape codes from string
 */
function removeAnsiEscapeCodes(data: string): string {
	return data.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Append data to a limited window buffer (max 40 entries)
 */
function appendLimitedWindow<T>(target: T[], data: T): void {
	target.push(data);
	if (target.length > 40) {
		target.shift();
	}
}

/**
 * Get the buffer content of the active terminal
 */
export function getActiveTerminalBuffer(): string {
	// Use window.terminals.find() to avoid deprecated window.activeTerminal
	const activeTerminal = window.terminals.find(t => t === window.activeTerminal);
	if (activeTerminal === undefined) {
		return '';
	}
	return terminalBuffers.get(activeTerminal)?.join('') || '';
}

/**
 * Get the buffer content for a specific terminal
 * @param terminal The terminal to get the buffer for
 * @param maxChars Maximum number of characters to return (default: 16000)
 */
export function getBufferForTerminal(terminal?: Terminal, maxChars: number = 16000): string {
	if (!terminal) {
		return '';
	}

	const buffer = terminalBuffers.get(terminal);
	if (!buffer) {
		return '';
	}
	const joined = buffer.join('');
	const start = Math.max(0, joined.length - maxChars);
	return joined.slice(start);
}

/**
 * Get the selection in the active terminal
 */
export function getActiveTerminalSelection(): string {
	// Use window.terminals.find() to avoid deprecated window.activeTerminal
	const activeTerminal = window.terminals.find(t => t === window.activeTerminal);
	try {
		// Note: terminal selection is a proposed API and may not be available
		// @ts-ignore - selection property may not exist in all VS Code versions
		return activeTerminal?.selection ?? '';
	} catch {
		// In case the API isn't available
		return '';
	}
}

/**
 * Get the last executed command for a specific terminal
 * @param terminal The terminal to get the last command for
 */
export function getLastCommandForTerminal(terminal: Terminal): TerminalExecutedCommand | undefined {
	return terminalCommands.get(terminal)?.at(-1);
}

/**
 * Get the last executed command in the active terminal
 */
export function getActiveTerminalLastCommand(): TerminalExecutedCommand | undefined {
	// Use window.terminals.find() to avoid deprecated window.activeTerminal
	const activeTerminal = window.terminals.find(t => t === window.activeTerminal);
	if (activeTerminal === undefined) {
		return undefined;
	}
	return terminalCommands.get(activeTerminal)?.at(-1);
}

/**
 * Get the shell type of the active terminal
 */
export function getActiveTerminalShellType(): string {
	// Use window.terminals.find() to avoid deprecated window.activeTerminal
	const activeTerminal = window.terminals.find(t => t === window.activeTerminal);

	// Prefer the state object as it's the most reliable
	if (activeTerminal?.state.shell) {
		return activeTerminal.state.shell;
	}

	if (activeTerminal && 'shellPath' in activeTerminal.creationOptions) {
		const shellPath = (activeTerminal.creationOptions as { shellPath?: string }).shellPath;
		if (shellPath) {
			let candidateShellType: string | undefined;
			const shellFile = basename(shellPath);

			// Detect git bash specially as it depends on the .exe
			if (shellFile === 'bash.exe') {
				candidateShellType = 'Git Bash';
			} else {
				const shellFileWithoutExtension = shellFile.replace(/\..+/, '');
				switch (shellFileWithoutExtension) {
					case 'pwsh':
					case 'powershell':
						candidateShellType = 'powershell';
						break;
					case '':
						break;
					default:
						candidateShellType = shellFileWithoutExtension;
				}
			}
			if (candidateShellType) {
				lastDetectedShellType = candidateShellType;
				return candidateShellType;
			}
		}
	}

	// Fall back to the last detected shell type if it exists
	if (lastDetectedShellType) {
		return lastDetectedShellType;
	}

	// Fall back to bash or PowerShell based on platform
	return process.platform === 'win32' ? 'powershell' : 'bash';
}

/**
 * Install listeners for terminal events
 * @returns Array of disposables for cleanup
 */
export function installTerminalBufferListeners(): { dispose(): void }[] {
	const disposables: { dispose(): void }[] = [];

	// Listen for terminal state changes to track shell type
	disposables.push(
		window.onDidChangeTerminalState(t => {
			const activeTerminal = window.terminals.find(term => term === window.activeTerminal);
			if (activeTerminal && t.processId === activeTerminal.processId) {
				const newShellType = t.state.shell;
				if (newShellType && newShellType !== lastDetectedShellType) {
					lastDetectedShellType = newShellType;
				}
			}
		})
	);

	// Note: onDidWriteTerminalData and onDidExecuteTerminalCommand are proposed APIs
	// and may not be available in all VS Code versions
	// We use a fallback approach that doesn't rely on these APIs

	// Try to use onDidExecuteTerminalCommand if available (proposed API in VS Code 1.90+)
	try {
		// @ts-ignore - onDidExecuteTerminalCommand may not exist in all VS Code versions
		const onDidExecuteTerminalCommand = window.onDidExecuteTerminalCommand;
		if (onDidExecuteTerminalCommand) {
			disposables.push(
				onDidExecuteTerminalCommand((e: TerminalExecutedCommand) => {
					const terminal = e.terminal;
					if (!terminalCommands.has(terminal)) {
						terminalCommands.set(terminal, []);
					}
					appendLimitedWindow(terminalCommands.get(terminal)!, e);
				})
			);
		}
	} catch {
		// onDidExecuteTerminalCommand is not available, skip command tracking
	}

	// Listen for terminal close to clean up buffers and commands
	disposables.push(
		window.onDidCloseTerminal(e => {
			terminalBuffers.delete(e);
			terminalCommands.delete(e);
		})
	);

	return disposables;
}
