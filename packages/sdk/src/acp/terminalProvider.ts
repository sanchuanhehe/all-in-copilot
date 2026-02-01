/*---------------------------------------------------------------------------------------------
 *  ACP Terminal Provider
 *  Uses VS Code Terminal API for proper terminal integration
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { ITerminalService } from "../platform/terminal/common/terminalService";

/**
 * ACP-specific terminal callbacks using VS Code Terminal API
 * Creates real terminals that appear in VS Code terminal panel
 */
export class ACPTerminalProvider {
	private readonly terminalService: ITerminalService;
	private readonly shellPath?: string;
	private readonly shellArgs?: string[];
	private readonly sessionTerminals = new Map<string, vscode.Terminal>();

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
	 * Execute a command in a terminal (creates new or reuses session terminal)
	 * Command will appear in VS Code terminal panel
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
		// Get or create terminal for this session
		let terminal = this.sessionTerminals.get(sessionId);

		if (!terminal) {
			// Create new terminal with session-specific name
			terminal = this.terminalService.createTerminal({
				name: `ACP Session`,
				shellPath: this.shellPath,
				shellArgs: this.shellArgs,
				isTransient: true,
			});
			this.sessionTerminals.set(sessionId, terminal);
		}

		// Show the terminal if requested
		if (options?.showTerminal ?? true) {
			terminal.show(true);
		}

		// Send command to terminal
		if (options?.cwd) {
			terminal.sendText(`cd "${options.cwd}"`, true);
		}

		terminal.sendText(command, true);

		return {
			exitCode: undefined,
			output: `Command sent to terminal: ${command}`,
		};
	}

	/**
	 * Execute command in existing session terminal
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
		let terminal = this.sessionTerminals.get(sessionId);

		if (!terminal) {
			terminal = this.terminalService.createTerminal({
				name: `ACP Session`,
				shellPath: this.shellPath,
				shellArgs: this.shellArgs,
				isTransient: true,
			});
			this.sessionTerminals.set(sessionId, terminal);
		}

		if (options?.showTerminal ?? true) {
			terminal.show(true);
		}

		if (options?.cwd) {
			terminal.sendText(`cd "${options.cwd}"`, true);
		}

		terminal.sendText(command, true);

		return {
			terminal,
			output: "Command sent to terminal",
		};
	}

	/**
	 * Execute command in a NEW terminal (always creates fresh terminal)
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
		// Always create a new terminal
		const terminal = this.terminalService.createTerminal({
			name: `ACP: ${command.slice(0, 30)}...`,
			shellPath: this.shellPath,
			shellArgs: this.shellArgs,
			isTransient: true,
		});

		if (options?.showTerminal ?? true) {
			terminal.show(true);
		}

		// Build full command with cd if needed
		let fullCommand = command;
		if (options?.cwd) {
			fullCommand = `cd "${options.cwd}" && ${command}`;
		}

		terminal.sendText(fullCommand);

		return {
			terminal,
			output: "Command sent to terminal",
		};
	}

	/**
	 * Clean up terminals for a session
	 */
	async disposeSessionTerminals(sessionId: string): Promise<void> {
		const terminal = this.sessionTerminals.get(sessionId);
		if (terminal) {
			terminal.dispose();
			this.sessionTerminals.delete(sessionId);
		}
	}

	/**
	 * Get the output from a terminal's buffer
	 */
	async getTerminalOutput(terminal: vscode.Terminal): Promise<string> {
		return this.terminalService.getBufferForTerminal(terminal);
	}

	/**
	 * Clean up all resources
	 */
	dispose(): void {
		for (const terminal of this.sessionTerminals.values()) {
			terminal.dispose();
		}
		this.sessionTerminals.clear();
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
