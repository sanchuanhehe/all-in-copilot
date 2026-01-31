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
		// For simple commands, execute directly and capture output
		// This provides better feedback than just sending to terminal
		const execOptions: { encoding: string; cwd?: string; env?: Record<string, string> } = {
			encoding: "utf8",
		};
		if (options?.cwd) {
			execOptions.cwd = options.cwd;
		}
		if (options?.env) {
			const envWithStrings: Record<string, string> = {};
			for (const [key, value] of Object.entries(process.env)) {
				if (value !== undefined) {
					envWithStrings[key] = value;
				}
			}
			execOptions.env = { ...envWithStrings, ...options.env };
		}

		// Execute command using child_process
		const { exec } = await import("child_process");

		return new Promise((resolve) => {
			// Add timeout to prevent hanging
			const timeout = setTimeout(() => {
				resolve({ exitCode: -1, output: "Command timed out" });
			}, 30000);

			exec(command, execOptions, (error, stdout, stderr) => {
				clearTimeout(timeout);
				let output = stdout;
					if (stderr && !error) {
						output += stderr;
					}

					let exitCodeVal: number = 0;
					if (error) {
						const code = (error as NodeJS.ErrnoException).code;
						exitCodeVal = typeof code === "number" ? code : (code ? parseInt(String(code), 10) : 1);
					}

				resolve({
					exitCode: exitCodeVal,
					output: output || "",
				});
			});
		});
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
		// Execute using shell for better output capture
		const execOptions: { encoding: string; cwd?: string; env?: Record<string, string> } = {
			encoding: "utf8",
		};
		if (options?.cwd) {
			execOptions.cwd = options.cwd;
		}
		if (options?.env) {
			const envWithStrings: Record<string, string> = {};
			for (const [key, value] of Object.entries(process.env)) {
				if (value !== undefined) {
					envWithStrings[key] = value;
				}
			}
			execOptions.env = { ...envWithStrings, ...options.env };
		}

		const { exec } = await import("child_process");

		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				resolve({ terminal: null as unknown as vscode.Terminal, output: "Command timed out" });
			}, 30000);

			exec(command, execOptions, (error, stdout, stderr) => {
				clearTimeout(timeout);
				let output = stdout;
				if (stderr && !error) {
					output += stderr;
				}

				resolve({
					terminal: null as unknown as vscode.Terminal,
					output: output || "",
				});
			});
		});
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
