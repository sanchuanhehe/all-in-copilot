/*---------------------------------------------------------------------------------------------
 *  ACP Terminal Adapter Implementation
 *  Provides ACP protocol-compliant terminal operations for VS Code
 *--------------------------------------------------------------------------------------------*/

import * as vscode from "vscode";
import type { ITerminalService } from "../../platform/terminal/common/terminalService";
import type {
	IACPTerminalAdapter,
	ACPCreateTerminalRequest,
	ACPCreateTerminalResponse,
	ACPTerminalOutputRequest,
	ACPTerminalOutputResponse,
	ACPWaitForExitRequest,
	ACPWaitForExitResponse,
	ACPKillRequest,
	ACPKillResponse,
	ACPReleaseRequest,
	ACPReleaseResponse,
	ITerminalHandle,
	TerminalState,
} from "./types";
import {
	generateTerminalId,
	initializeTerminalBuffer,
	getBufferInfo,
	waitForTerminalCompletion,
	isTerminalCompleted,
	getTerminalExitStatus,
	cleanupTerminalById,
	installEnhancedTerminalListeners,
} from "./terminalBufferManager";

/**
 * Default output byte limit (64KB)
 */
const DEFAULT_OUTPUT_BYTE_LIMIT = 64 * 1024;

/**
 * Default wait timeout (30 seconds)
 */
const DEFAULT_WAIT_TIMEOUT_MS = 30 * 1000;

/**
 * Output-based completion detection timeout (5 seconds of no output)
 */
const OUTPUT_IDLE_TIMEOUT_MS = 5 * 1000;

/**
 * ACP Terminal Adapter Implementation
 * Provides full ACP protocol terminal operations
 */
export class ACPTerminalAdapter implements IACPTerminalAdapter {
	private readonly terminalService: ITerminalService;
	private readonly terminals = new Map<string, ITerminalHandle>();
	private readonly sessionTerminals = new Map<string, Set<string>>();
	private readonly disposables: vscode.Disposable[] = [];

	// Shell configuration
	private readonly shellPath?: string;
	private readonly shellArgs?: string[];

	// Output-based completion detection
	private readonly outputIdleTimers = new Map<string, NodeJS.Timeout>();
	private readonly lastOutputTime = new Map<string, number>();

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

		// Install enhanced terminal listeners
		this.disposables.push(...installEnhancedTerminalListeners());

		// Listen for terminal close events
		this.disposables.push(
			vscode.window.onDidCloseTerminal((terminal) => {
				this.handleTerminalClosed(terminal);
			})
		);
	}

	/**
	 * Create a terminal and execute a command (ACP terminal/create)
	 */
	async createTerminal(request: ACPCreateTerminalRequest): Promise<ACPCreateTerminalResponse> {
		const terminalId = generateTerminalId();
		const outputByteLimit = request.outputByteLimit ?? DEFAULT_OUTPUT_BYTE_LIMIT;

		// Build environment
		const env: Record<string, string> = {};
		if (request.env) {
			for (const { name, value } of request.env) {
				env[name] = value;
			}
		}

		// Create VS Code terminal
		const terminal = this.terminalService.createTerminal({
			name: `ACP: ${request.command.slice(0, 30)}...`,
			shellPath: this.shellPath,
			shellArgs: this.shellArgs,
			cwd: request.cwd,
			env,
			isTransient: true,
		});

		// Initialize buffer tracking
		initializeTerminalBuffer(terminal, terminalId, outputByteLimit);

		// Create terminal handle
		const handle: ITerminalHandle = {
			terminalId,
			terminal,
			sessionId: request.sessionId,
			command: request.command,
			args: request.args,
			cwd: request.cwd,
			env: request.env,
			outputByteLimit,
			outputBuffer: "",
			outputTruncated: false,
			state: "running" as TerminalState,
			createdAt: Date.now(),
			exitWaiters: [],
		};

		// Store handle
		this.terminals.set(terminalId, handle);

		// Track session association
		let sessionTerminalIds = this.sessionTerminals.get(request.sessionId);
		if (!sessionTerminalIds) {
			sessionTerminalIds = new Set();
			this.sessionTerminals.set(request.sessionId, sessionTerminalIds);
		}
		sessionTerminalIds.add(terminalId);

		// Show terminal
		terminal.show(true);

		// Build and execute command
		let fullCommand = request.command;
		if (request.args && request.args.length > 0) {
			// Escape arguments for shell
			const escapedArgs = request.args.map((arg) => {
				if (arg.includes(" ") || arg.includes('"') || arg.includes("'")) {
					return `"${arg.replace(/"/g, '\\"')}"`;
				}
				return arg;
			});
			fullCommand = `${request.command} ${escapedArgs.join(" ")}`;
		}

		// Send command to terminal
		terminal.sendText(fullCommand, true);

		// Start output-based completion detection (fallback for when shell integration is unavailable)
		this.startOutputIdleDetection(terminalId);

		console.log(`[ACP-Terminal] Created terminal ${terminalId}: ${fullCommand}`);

		return { terminalId };
	}

	/**
	 * Get terminal output (ACP terminal/output)
	 */
	async getOutput(request: ACPTerminalOutputRequest): Promise<ACPTerminalOutputResponse> {
		const handle = this.terminals.get(request.terminalId);
		if (!handle) {
			return {
				output: "",
				truncated: false,
				exitStatus: undefined,
			};
		}

		// Get buffer info
		const bufferInfo = getBufferInfo(handle.terminal);

		// Check completion status
		const completed = isTerminalCompleted(handle.terminal);
		const exitStatus = completed ? getTerminalExitStatus(handle.terminal) : undefined;

		return {
			output: bufferInfo.output,
			truncated: bufferInfo.truncated,
			exitStatus,
		};
	}

	/**
	 * Wait for terminal command to exit (ACP terminal/wait_for_exit)
	 */
	async waitForExit(request: ACPWaitForExitRequest): Promise<ACPWaitForExitResponse> {
		const handle = this.terminals.get(request.terminalId);
		if (!handle) {
			return { exitCode: undefined, signal: undefined };
		}

		// Check if already completed
		if (isTerminalCompleted(handle.terminal)) {
			const exitStatus = getTerminalExitStatus(handle.terminal);
			return {
				exitCode: exitStatus?.exitCode,
				signal: exitStatus?.signal,
			};
		}

		// Wait for completion with timeout
		const timeoutMs = request.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
		const result = await waitForTerminalCompletion(handle.terminal, timeoutMs);

		return {
			exitCode: result?.exitCode,
			signal: result?.signal,
		};
	}

	/**
	 * Kill a terminal command (ACP terminal/kill)
	 */
	async killCommand(request: ACPKillRequest): Promise<ACPKillResponse> {
		const handle = this.terminals.get(request.terminalId);
		if (!handle) {
			return { success: false };
		}

		try {
			// VS Code doesn't have a direct "kill command" API
			// We can only dispose the terminal which kills the process
			// For a "soft" kill, we send Ctrl+C

			// Send Ctrl+C to the terminal
			handle.terminal.sendText("\x03", false); // Ctrl+C

			// Update state
			handle.state = "killed" as TerminalState;
			handle.exitStatus = { signal: request.signal ?? "SIGINT" };

			// Resolve any waiters
			for (const waiter of handle.exitWaiters) {
				if (waiter.timeoutId) {
					clearTimeout(waiter.timeoutId);
				}
				waiter.resolve({ signal: request.signal ?? "SIGINT" });
			}
			handle.exitWaiters = [];

			console.log(`[ACP-Terminal] Killed terminal ${request.terminalId}`);
			return { success: true };
		} catch (error) {
			console.error(`[ACP-Terminal] Failed to kill terminal: ${error}`);
			return { success: false };
		}
	}

	/**
	 * Release a terminal and free resources (ACP terminal/release)
	 */
	async release(request: ACPReleaseRequest): Promise<ACPReleaseResponse> {
		const handle = this.terminals.get(request.terminalId);
		if (!handle) {
			return { success: false };
		}

		try {
			// Stop idle detection
			this.stopOutputIdleDetection(request.terminalId);

			// Dispose the terminal
			handle.terminal.dispose();

			// Clean up buffer
			cleanupTerminalById(request.terminalId);

			// Remove from tracking
			this.terminals.delete(request.terminalId);

			// Remove from session tracking
			const sessionTerminalIds = this.sessionTerminals.get(handle.sessionId);
			if (sessionTerminalIds) {
				sessionTerminalIds.delete(request.terminalId);
				if (sessionTerminalIds.size === 0) {
					this.sessionTerminals.delete(handle.sessionId);
				}
			}

			console.log(`[ACP-Terminal] Released terminal ${request.terminalId}`);
			return { success: true };
		} catch (error) {
			console.error(`[ACP-Terminal] Failed to release terminal: ${error}`);
			return { success: false };
		}
	}

	/**
	 * Get all terminal IDs for a session
	 */
	getSessionTerminalIds(sessionId: string): string[] {
		const terminalIds = this.sessionTerminals.get(sessionId);
		return terminalIds ? Array.from(terminalIds) : [];
	}

	/**
	 * Clean up all terminals for a session
	 */
	async disposeSession(sessionId: string): Promise<void> {
		const terminalIds = this.getSessionTerminalIds(sessionId);
		for (const terminalId of terminalIds) {
			await this.release({ terminalId });
		}
	}

	/**
	 * Clean up all resources
	 */
	dispose(): void {
		// Dispose all terminals
		for (const handle of this.terminals.values()) {
			try {
				handle.terminal.dispose();
			} catch {
				// Ignore errors during cleanup
			}
		}
		this.terminals.clear();
		this.sessionTerminals.clear();

		// Clear all idle timers
		for (const timer of this.outputIdleTimers.values()) {
			clearTimeout(timer);
		}
		this.outputIdleTimers.clear();
		this.lastOutputTime.clear();

		// Dispose listeners
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables.length = 0;
	}

	/**
	 * Handle terminal closed event
	 */
	private handleTerminalClosed(terminal: vscode.Terminal): void {
		// Find the handle for this terminal
		for (const [terminalId, handle] of this.terminals.entries()) {
			if (handle.terminal === terminal) {
				// Stop idle detection
				this.stopOutputIdleDetection(terminalId);

				// Update state
				handle.state = "completed" as TerminalState;
				handle.completedAt = Date.now();

				// Note: exitStatus may already be set by shell integration
				// If not, it remains undefined

				// Resolve any waiters
				for (const waiter of handle.exitWaiters) {
					if (waiter.timeoutId) {
						clearTimeout(waiter.timeoutId);
					}
					waiter.resolve(handle.exitStatus ?? { exitCode: undefined });
				}
				handle.exitWaiters = [];

				console.log(`[ACP-Terminal] Terminal ${terminalId} closed`);
				break;
			}
		}
	}

	/**
	 * Start output-based idle detection for completion
	 * This is a fallback for when shell integration is not available
	 */
	private startOutputIdleDetection(terminalId: string): void {
		// Record initial time
		this.lastOutputTime.set(terminalId, Date.now());

		// Start checking for idle
		const checkIdle = () => {
			const handle = this.terminals.get(terminalId);
			if (!handle || isTerminalCompleted(handle.terminal)) {
				this.stopOutputIdleDetection(terminalId);
				return;
			}

			const lastTime = this.lastOutputTime.get(terminalId) ?? Date.now();
			const idleTime = Date.now() - lastTime;

			if (idleTime >= OUTPUT_IDLE_TIMEOUT_MS) {
				// No output for a while, consider command complete
				// Note: This is a heuristic and may not be accurate
				// Shell integration (if available) will provide more accurate completion
				console.log(`[ACP-Terminal] Terminal ${terminalId} idle for ${idleTime}ms, assuming complete`);

				// Don't automatically mark as completed - let shell integration or terminal close handle it
				// This is just for logging/debugging
			}

			// Schedule next check
			const timer = setTimeout(checkIdle, OUTPUT_IDLE_TIMEOUT_MS / 2);
			this.outputIdleTimers.set(terminalId, timer);
		};

		// Start checking
		const timer = setTimeout(checkIdle, OUTPUT_IDLE_TIMEOUT_MS);
		this.outputIdleTimers.set(terminalId, timer);
	}

	/**
	 * Stop output idle detection
	 */
	private stopOutputIdleDetection(terminalId: string): void {
		const timer = this.outputIdleTimers.get(terminalId);
		if (timer) {
			clearTimeout(timer);
			this.outputIdleTimers.delete(terminalId);
		}
		this.lastOutputTime.delete(terminalId);
	}
}

/**
 * Create an ACP Terminal Adapter
 */
export function createACPTerminalAdapter(
	terminalService: ITerminalService,
	options?: {
		shellPath?: string;
		shellArgs?: string[];
	}
): IACPTerminalAdapter {
	return new ACPTerminalAdapter(terminalService, options);
}
