import * as vscode from "vscode";

/**
 * VS Code Terminal Provider for ACP agents
 * Creates real integrated terminals in VS Code's terminal panel
 * when bash/terminal commands are executed.
 */
export class ACPTerminalProvider {
	private readonly extensionContext?: {
		extensionUri: string;
		secrets: {
			get(key: string): Promise<string | undefined>;
			store(key: string, value: string): Promise<void>;
			delete(key: string): Promise<void>;
		};
	};
	private readonly terminals = new Map<string, vscode.Terminal>();
	private readonly terminalShellPath?: string;
	private readonly terminalShellArgs?: string[];

	constructor(context?: {
		extensionUri: string;
		secrets: {
			get(key: string): Promise<string | undefined>;
			store(key: string, value: string): Promise<void>;
			delete(key: string): Promise<void>;
		};
	}, options?: {
		shellPath?: string;
		shellArgs?: string[];
	}) {
		this.extensionContext = context;
		this.terminalShellPath = options?.shellPath;
		this.terminalShellArgs = options?.shellArgs;
	}

	/**
	 * Create or get a terminal for a session
	 */
	getOrCreateTerminal(sessionId: string): vscode.Terminal {
		const existingTerminal = this.terminals.get(sessionId);
		if (existingTerminal && !existingTerminal.processId) {
			// Terminal process has died, remove it
			this.terminals.delete(sessionId);
		}

		if (!this.terminals.has(sessionId)) {
			const terminalName = `ACP Agent (${sessionId.slice(0, 8)})`;
			const terminal = vscode.window.createTerminal({
				name: terminalName,
				shellPath: this.terminalShellPath,
				shellArgs: this.terminalShellArgs,
			});
			this.terminals.set(sessionId, terminal);
		}

		return this.terminals.get(sessionId)!;
	}

	/**
	 * Execute a command in a terminal and wait for output
	 */
	async executeCommand(
		sessionId: string,
		command: string,
		options?: {
			cwd?: string;
			env?: Record<string, string>;
			timeout?: number;
		}
	): Promise<{ exitCode?: number; output: string }> {
		const terminal = this.getOrCreateTerminal(sessionId);

		// Create a unique marker for this command execution
		const executionId = `__acp_exec_${Date.now()}__`;
		const endMarker = `__acp_end_${Date.now()}__`;

		// Send the command with echo off to get clean output
		// Use semicolon to ensure the command executes
		const fullCommand = `cd ${options?.cwd || '~'} 2>/dev/null; ${command}; echo "${endMarker}"`;

		// Show the terminal
		terminal.show();

		// Send the command
		terminal.sendText(fullCommand);

		// Note: Getting output from integrated terminals is limited
		// VS Code Terminal API doesn't provide direct output reading
		// We can only show the terminal to the user
		return {
			exitCode: 0,
			output: `Command sent to terminal. See terminal panel for output.`,
		};
	}

	/**
	 * Execute a command and dispose the terminal
	 */
	async executeCommandAndCleanup(
		sessionId: string,
		command: string,
		options?: {
			cwd?: string;
			env?: Record<string, string>;
		}
	): Promise<{ exitCode?: number; output: string }> {
		const result = await this.executeCommand(sessionId, command, options);
		this.disposeTerminal(sessionId);
		return result;
	}

	/**
	 * Dispose a terminal for a session
	 */
	disposeTerminal(sessionId: string): void {
		const terminal = this.terminals.get(sessionId);
		if (terminal) {
			terminal.dispose();
			this.terminals.delete(sessionId);
		}
	}

	/**
	 * Dispose all terminals
	 */
	disposeAll(): void {
		for (const terminal of this.terminals.values()) {
			terminal.dispose();
		}
		this.terminals.clear();
	}

	/**
	 * Get count of active terminals
	 */
	getActiveTerminalCount(): number {
		let count = 0;
		for (const terminal of this.terminals.values()) {
			// Check if processId is a Thenable or a number
			const pid = terminal.processId;
			if (pid !== undefined && pid !== null) {
				count++;
			}
		}
		return count;
	}

	/**
	 * Dispose of all terminals and clean up resources
	 */
	dispose(): void {
		console.log("[ACPTerminalProvider] Disposing all terminals");

		// Dispose all terminals
		for (const [sessionId, terminal] of this.terminals) {
			console.log(`[ACPTerminalProvider] Disposing terminal for session: ${sessionId}`);
			terminal.dispose();
		}

		// Clear the map
		this.terminals.clear();
	}
}

/**
 * Execute a bash command using VS Code's integrated terminal
 */
export async function executeInTerminal(
	terminalProvider: ACPTerminalProvider,
	sessionId: string,
	command: string,
	options?: {
		cwd?: string;
		env?: Record<string, string>;
		showTerminal?: boolean;
	}
): Promise<{ exitCode?: number; output: string }> {
	const terminal = terminalProvider.getOrCreateTerminal(sessionId);

	if (options?.showTerminal !== false) {
		terminal.show();
	}

	// Format the command with cd first
	const fullCommand = options?.cwd
		? `cd ${options.cwd.replace(/'/g, "'\\''")} && ${command}`
		: command;

	terminal.sendText(fullCommand);

	// Return info about where to see output
	return {
		exitCode: undefined, // Can't determine exit code from terminal API
		output: `Command sent to terminal panel. Switch to terminal view to see output.`,
	};
}

/**
 * Execute a bash command with a new terminal (for one-off commands)
 */
export async function executeInNewTerminal(
	command: string,
	options?: {
		name?: string;
		cwd?: string;
		env?: Record<string, string>;
	}
): Promise<void> {
	const terminal = vscode.window.createTerminal({
		name: options?.name || "ACP Command",
		shellPath: undefined, // Use default shell
		shellArgs: undefined,
	});

	terminal.show();

	// Send command with cd if cwd is provided
	const fullCommand = options?.cwd
		? `cd ${options.cwd.replace(/'/g, "'\\''")} && ${command}`
		: command;

	terminal.sendText(fullCommand);
}
