/*---------------------------------------------------------------------------------------------
 *  Terminal Service Implementation for All-In Copilot SDK
 *  Adapted from VS Code Copilot - terminalServiceImpl.ts
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionTerminalOptions, Terminal, TerminalExecutedCommand, TerminalOptions, Event, window, Uri } from 'vscode';
import * as path from 'path';
import { ITerminalService, ShellIntegrationQuality, IKnownTerminal } from '../common/terminalService';
import {
	getActiveTerminalBuffer,
	getActiveTerminalLastCommand,
	getActiveTerminalSelection,
	getActiveTerminalShellType,
	getBufferForTerminal,
	getLastCommandForTerminal,
	installTerminalBufferListeners
} from './terminalBufferListener';

// Import proposed API types
// @ts-expect-error - TerminalShellIntegrationChangeEvent is a proposed API
import type { TerminalShellIntegrationChangeEvent } from '../../../vscode/vscode.proposed';
// @ts-expect-error - TerminalShellExecutionEndEvent is a proposed API
import type { TerminalShellExecutionEndEvent } from '../../../vscode/vscode.proposed';
// @ts-expect-error - TerminalDataWriteEvent is a proposed API
import type { TerminalDataWriteEvent } from '../../../vscode/vscode.proposed';

/**
 * Terminal service implementation for VS Code
 */
export class TerminalServiceImpl implements ITerminalService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Path contributions for terminal environment
	 */
	private readonly pathContributions: {
		contributor: string;
		path: string;
		description?: string | { command: string };
		prepend: boolean;
	}[] = [];

	/**
	 * Environment variable collection for PATH modifications
	 */
	private readonly environmentVariableCollection: { append(variable: string, value: string): void; prepend(variable: string, value: string): void; delete(variable: string): void; description?: string };

	/**
	 * Disposables for cleanup
	 */
	private readonly disposables: { dispose(): void }[] = [];

	/**
	 * Session to terminal associations
	 */
	private readonly sessionTerminals: Map<string, Set<Terminal>> = new Map<string, Set<Terminal>>();

	/**
	 * Session to working directory mapping
	 */
	private readonly sessionCwds: Map<string, Uri> = new Map<string, Uri>();

	/**
	 * Terminal to session association
	 */
	private readonly terminalSessions: Map<Terminal, string> = new Map<Terminal, string>();

	/**
	 * Shell integration quality tracking
	 */
	private readonly terminalShellQuality: Map<Terminal, ShellIntegrationQuality> = new Map<Terminal, ShellIntegrationQuality>();

	constructor(
		private readonly extensionContext: {
			readonly environmentVariableCollection: { append(variable: string, value: string): void; prepend(variable: string, value: string): void; delete(variable: string): void; description?: string };
		}
	) {
		// Get the environment variable collection from extension context
		this.environmentVariableCollection = extensionContext?.environmentVariableCollection ?? {
			append: () => {},
			prepend: () => {},
			delete: () => {}
		};

		// Install terminal buffer listeners
		for (const l of installTerminalBufferListeners()) {
			this.disposables.push(l);
		}
	}

	/**
	 * Get all terminals
	 */
	get terminals(): readonly Terminal[] {
		return window.terminals;
	}

	/**
	 * Event fired when terminal shell integration changes
	 * Uses proposed API - may not be available in all VS Code versions
	 */
	get onDidChangeTerminalShellIntegration(): Event<TerminalShellIntegrationChangeEvent> {
		return window.onDidChangeTerminalShellIntegration ?? (() => { /* no-op */ });
	}

	/**
	 * Event fired when terminal shell execution ends
	 * Uses proposed API - may not be available in all VS Code versions
	 */
	get onDidEndTerminalShellExecution(): Event<TerminalShellExecutionEndEvent> {
		return window.onDidEndTerminalShellExecution ?? (() => { /* no-op */ });
	}

	/**
	 * Event fired when a terminal is closed
	 */
	get onDidCloseTerminal(): Event<Terminal> {
		return window.onDidCloseTerminal;
	}

	/**
	 * Event fired when data is written to a terminal
	 * Uses proposed API - may not be available in all VS Code versions
	 */
	get onDidWriteTerminalData(): Event<TerminalDataWriteEvent> {
		return window.onDidWriteTerminalData ?? (() => { /* no-op */ });
	}

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
	createTerminal(name?: unknown, shellPath?: unknown, shellArgs?: unknown): Terminal {
		return window.createTerminal(
			name as string | undefined,
			shellPath as string | undefined,
			shellArgs as readonly string[] | string | undefined
		);
	}

	/**
	 * Get the buffer content for a terminal
	 */
	getBufferForTerminal(terminal: Terminal, maxChars?: number): string {
		return getBufferForTerminal(terminal, maxChars);
	}

	/**
	 * Get the buffer content for a terminal by process ID
	 */
	async getBufferWithPid(pid: number, maxChars?: number): Promise<string> {
		let terminal: Terminal | undefined;
		for (const t of this.terminals) {
			const tPid = await t.processId;
			if (tPid === pid) {
				terminal = t;
				break;
			}
		}
		if (terminal) {
			return this.getBufferForTerminal(terminal, maxChars);
		}
		return '';
	}

	/**
	 * Get the last command executed in a terminal
	 * @param terminal The terminal to get the last command for
	 */
	getLastCommandForTerminal(terminal: Terminal): TerminalExecutedCommand | undefined {
		return getLastCommandForTerminal(terminal);
	}

	/**
	 * Get the buffer content of the active terminal
	 */
	get terminalBuffer(): string {
		return getActiveTerminalBuffer();
	}

	/**
	 * Get the last executed command in the active terminal
	 * Uses proposed API - may be undefined in some VS Code versions
	 */
	get terminalLastCommand(): TerminalExecutedCommand | undefined {
		try {
			return getActiveTerminalLastCommand();
		} catch {
			return undefined;
		}
	}

	/**
	 * Get the selection in the active terminal
	 */
	get terminalSelection(): string {
		return getActiveTerminalSelection();
	}

	/**
	 * Get the shell type of the active terminal
	 */
	get terminalShellType(): string {
		return getActiveTerminalShellType();
	}

	/**
	 * Contribute a path to the terminal PATH environment variable
	 */
	contributePath(contributor: string, pathLocation: string, description?: string | { command: string }, prepend = false): void {
		const entry = this.pathContributions.find(c => c.contributor === contributor);
		if (entry) {
			entry.path = pathLocation;
			entry.description = description;
			entry.prepend = prepend;
		} else {
			this.pathContributions.push({ contributor, path: pathLocation, description, prepend });
		}
		this.updateEnvironmentPath();
	}

	/**
	 * Remove a path contribution from the terminal PATH environment variable
	 */
	removePathContribution(contributor: string): void {
		const index = this.pathContributions.findIndex(c => c.contributor === contributor);
		if (index !== -1) {
			this.pathContributions.splice(index, 1);
		}
		this.updateEnvironmentPath();
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}

	/**
	 * Update the PATH environment variable with all contributions
	 */
	private updateEnvironmentPath(): void {
		const pathVariable = 'PATH';

		// Clear existing PATH modification
		this.environmentVariableCollection.delete(pathVariable);

		if (this.pathContributions.length === 0) {
			return;
		}

		// Build combined description
		const allDescriptions = this.pathContributions
			.map(c => (c.description && typeof c.description === 'string') ? c.description : undefined)
			.filter((d): d is string => d !== undefined);

		let descriptions = '';
		if (allDescriptions.length === 1) {
			descriptions = allDescriptions[0];
		} else if (allDescriptions.length > 1) {
			descriptions = `${allDescriptions.slice(0, -1).join(', ')} and ${allDescriptions[allDescriptions.length - 1]}`;
		}

		const allCommands = this.pathContributions
			.map(c => (c.description && typeof c.description !== 'string') ? `\`${c.description.command}\`` : undefined)
			.filter((d): d is string => d !== undefined);

		let commandsDescription = '';
		if (allCommands.length === 1) {
			commandsDescription = `Enables use of ${allCommands[0]} command in the terminal`;
		} else if (allCommands.length > 1) {
			const commands = `${allCommands.slice(0, -1).join(', ')} and ${allCommands[allCommands.length - 1]}`;
			commandsDescription = `Enables use of ${commands} commands in the terminal`;
		}

		const description = [descriptions, commandsDescription].filter(d => d).join(' and ');
		this.environmentVariableCollection.description = description || 'Enables additional commands in the terminal.';

		// Build combined path from all contributions
		const allPaths = this.pathContributions.map(c => c.path);
		void description;
		if (this.pathContributions.some(c => c.prepend)) {
			const pathVariableChange = allPaths.join(path.delimiter) + path.delimiter;
			this.environmentVariableCollection.prepend(pathVariable, pathVariableChange);
		} else {
			const pathVariableChange = path.delimiter + allPaths.join(path.delimiter);
			this.environmentVariableCollection.append(pathVariable, pathVariableChange);
		}
	}

	/**
	 * Get the working directory for a specific session
	 * @param sessionId The session identifier
	 */
	async getCwdForSession(sessionId: string): Promise<Uri | undefined> {
		return this.sessionCwds.get(sessionId);
	}

	/**
	 * Get all terminals associated with a specific session
	 * @param sessionId The session identifier
	 */
	async getCopilotTerminals(sessionId: string): Promise<IKnownTerminal[]> {
		const terminals = this.sessionTerminals.get(sessionId);
		if (!terminals) {
			return [];
		}

		return Array.from(terminals).filter(t => {
			// Filter out closed terminals
			return !t.exitStatus;
		}).map(t => t as unknown as IKnownTerminal);
	}

	/**
	 * Associate a terminal with a session
	 * @param terminal The terminal to associate
	 * @param sessionId The session identifier
	 * @param shellIntegrationQuality The quality of shell integration
	 */
	async associateTerminalWithSession(terminal: Terminal, sessionId: string, shellIntegrationQuality: ShellIntegrationQuality): Promise<void> {
		// Store the association
		if (!this.sessionTerminals.has(sessionId)) {
			this.sessionTerminals.set(sessionId, new Set());
		}
		this.sessionTerminals.get(sessionId)!.add(terminal);
		this.terminalSessions.set(terminal, sessionId);
		this.terminalShellQuality.set(terminal, shellIntegrationQuality);

		// Listen for terminal close to clean up association
		const dispose = window.onDidCloseTerminal((e) => {
			if (e === terminal) {
				this.sessionTerminals.get(sessionId)?.delete(terminal);
				this.terminalSessions.delete(terminal);
				this.terminalShellQuality.delete(terminal);
				dispose.dispose();
			}
		});
		this.disposables.push(dispose);
	}
}

/**
 * Check if a thing is an ITerminalService
 */
export function isTerminalService(thing: unknown): thing is ITerminalService {
	return thing !== null && typeof thing === 'object' && typeof (thing as ITerminalService).createTerminal === 'function';
}
