/*---------------------------------------------------------------------------------------------
 *  ACP Terminal Provider
 *  Uses ITerminalService for terminal management, avoiding duplication
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { ITerminalService, ShellIntegrationQuality } from "../platform/terminal/common/terminalService";

/**
 * ACP-specific terminal callbacks using ITerminalService
 * This provider delegates terminal creation to ITerminalService,
 * focusing on ACP protocol integration only.
 */
export class ACPTerminalProvider {
	private readonly terminalService: ITerminalService;
	private readonly shellPath?: string;
	private readonly shellArgs?: string[];

	constructor(
		terminalService: ITerminalService,
		options?: {
			shellPath?: string;
			shellArgs?: string[];
		}
	) {
		this.terminalService = terminalService;
		this.shellPath = options?.shellPath;
		this.shellArgs = options?.shellArgs;
	}

	/**
	 * Execute a command in a terminal
	 */
	async executeCommand(
		sessionId: string,
		command: string,
		options?: {
			cwd?: string;
			env?: Record<string, string>;
			showTerminal?: boolean;
		}
	): Promise<{ exitCode?: number; output: string }> {
		// Create terminal with ACP naming convention
		const terminalName = `ACP (${sessionId.slice(0, 6)})`;
		const terminal = this.terminalService.createTerminal(
			terminalName,
			this.shellPath,
			this.shellArgs
		);

		// Show terminal if configured
		if (options?.showTerminal !== false) {
			terminal.show();
		}

		// Format command with cwd
		const fullCommand = options?.cwd
			? `cd "${options.cwd.replace(/"/g, '\\"')}" && ${command}`
			: command;

		// Send command
		terminal.sendText(fullCommand);

		return {
			exitCode: undefined, // VS Code Terminal API doesn't provide exit codes
			output: "Command sent to terminal",
		};
	}

	/**
	 * Execute command in existing terminal, create if doesn't exist
	 */
	async executeInSessionTerminal(
		sessionId: string,
		command: string,
		options?: {
			cwd?: string;
			env?: Record<string, string>;
			showTerminal?: boolean;
		}
	): Promise<{ terminal: vscode.Terminal; output: string }> {
		const terminalName = `ACP (${sessionId.slice(0, 6)})`;

		// Find existing terminal for this session
		const existingTerminals = await this.terminalService.getCopilotTerminals(sessionId);
		const knownTerminal = existingTerminals.find(t => t.name === terminalName);
		let terminal = knownTerminal as vscode.Terminal | undefined;

		// Create if not found
		if (!terminal) {
			terminal = this.terminalService.createTerminal(
				terminalName,
				this.shellPath,
				this.shellArgs
			);
			await this.terminalService.associateTerminalWithSession(
				terminal,
				sessionId,
				"rich" as ShellIntegrationQuality
			);
		}

		// Show terminal
		if (options?.showTerminal !== false) {
			terminal.show();
		}

		// Format command with cwd
		const fullCommand = options?.cwd
			? `cd "${options.cwd.replace(/"/g, '\\"')}" && ${command}`
			: command;

		// Send command
		terminal.sendText(fullCommand);

		return {
			terminal,
			output: "Command sent to terminal",
		};
	}

	/**
	 * Execute command in a new terminal
	 */
	async executeInNewTerminal(
		sessionId: string,
		command: string,
		options?: {
			cwd?: string;
			env?: Record<string, string>;
			showTerminal?: boolean;
		}
	): Promise<{ terminal: vscode.Terminal; output: string }> {
		// Always create a new terminal with unique name
		const terminalName = `ACP (${sessionId.slice(0, 6)})-${Date.now()}`;
		const terminal = this.terminalService.createTerminal(
			terminalName,
			this.shellPath,
			this.shellArgs
		);

		// Associate with session
		await this.terminalService.associateTerminalWithSession(
			terminal,
			sessionId,
			"rich" as ShellIntegrationQuality
		);

		// Show terminal
		if (options?.showTerminal !== false) {
			terminal.show();
		}

		// Format command with cwd
		const fullCommand = options?.cwd
			? `cd "${options.cwd.replace(/"/g, '\\"')}" && ${command}`
			: command;

		// Send command
		terminal.sendText(fullCommand);

		return {
			terminal,
			output: "Command sent to terminal",
		};
	}

	/**
	 * Get the output from a terminal's buffer
	 */
	async getTerminalOutput(terminal: vscode.Terminal): Promise<string> {
		return this.terminalService.getBufferForTerminal(terminal);
	}

	/**
	 * Clean up resources
	 */
	dispose(): void {
		// TerminalService handles its own cleanup
	}
}

/**
 * Execute a command in a terminal (convenience function)
 */
export async function executeInTerminal(
	terminalService: ITerminalService,
	sessionId: string,
	command: string,
	options?: {
		cwd?: string;
		env?: Record<string, string>;
		showTerminal?: boolean;
		shellPath?: string;
		shellArgs?: string[];
	}
): Promise<{ exitCode?: number; output: string }> {
	const provider = new ACPTerminalProvider(terminalService, {
		shellPath: options?.shellPath,
		shellArgs: options?.shellArgs,
	});
	return provider.executeCommand(sessionId, command, options);
}

/**
 * Execute a command in a new terminal (convenience function)
 */
export async function executeInNewTerminal(
	terminalService: ITerminalService,
	sessionId: string,
	command: string,
	options?: {
		cwd?: string;
		env?: Record<string, string>;
		showTerminal?: boolean;
		shellPath?: string;
		shellArgs?: string[];
	}
): Promise<{ terminal: vscode.Terminal; output: string }> {
	const provider = new ACPTerminalProvider(terminalService, {
		shellPath: options?.shellPath,
		shellArgs: options?.shellArgs,
	});
	return provider.executeInNewTerminal(sessionId, command, options);
}
