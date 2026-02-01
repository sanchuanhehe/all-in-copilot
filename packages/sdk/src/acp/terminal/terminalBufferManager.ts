/*---------------------------------------------------------------------------------------------
 *  Enhanced Terminal Buffer Listener for ACP
 *  Provides per-terminal output buffering with byte limits and truncation tracking
 *--------------------------------------------------------------------------------------------*/

import { Terminal, window, Disposable } from "vscode";
import { basename } from "path";

// Import proposed API types
// @ts-expect-error - TerminalExecutedCommand is a proposed API
import type { TerminalExecutedCommand, TerminalShellExecutionEndEvent } from "../../../vscode/vscode.proposed";

/**
 * Per-terminal buffer data with byte limit tracking
 */
interface TerminalBufferData {
	/** Raw output chunks */
	chunks: string[];
	/** Total bytes captured */
	totalBytes: number;
	/** Maximum bytes to capture (0 = unlimited) */
	maxBytes: number;
	/** Whether output was truncated due to byte limit */
	truncated: boolean;
	/** Executed commands history */
	commands: TerminalExecutedCommand[];
	/** Exit status if available */
	exitStatus?: { exitCode?: number; signal?: string };
	/** Whether the command has completed */
	completed: boolean;
	/** Completion waiters */
	completionWaiters: Array<{
		resolve: (exitStatus?: { exitCode?: number; signal?: string }) => void;
		timeoutId?: NodeJS.Timeout;
	}>;
}

/**
 * Maps terminals to their buffer data
 */
const terminalBuffers = new Map<Terminal, TerminalBufferData>();

/**
 * Maps terminal IDs to terminals for lookup
 */
const terminalIdMap = new Map<string, Terminal>();

/**
 * Last detected shell type (for fallback)
 */
let lastDetectedShellType: string | undefined;

/**
 * Default max buffer size (64KB)
 */
const DEFAULT_MAX_BYTES = 64 * 1024;

/**
 * Max command history entries per terminal
 */
const MAX_COMMAND_HISTORY = 40;

/**
 * Generate a unique terminal ID
 */
export function generateTerminalId(): string {
	return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Initialize buffer tracking for a terminal
 */
export function initializeTerminalBuffer(
	terminal: Terminal,
	terminalId: string,
	maxBytes: number = DEFAULT_MAX_BYTES
): void {
	terminalBuffers.set(terminal, {
		chunks: [],
		totalBytes: 0,
		maxBytes,
		truncated: false,
		commands: [],
		completed: false,
		completionWaiters: [],
	});
	terminalIdMap.set(terminalId, terminal);
}

/**
 * Append data to a terminal's buffer with byte limit enforcement
 */
export function appendToTerminalBuffer(terminal: Terminal, data: string): void {
	const buffer = terminalBuffers.get(terminal);
	if (!buffer) {
		return;
	}

	const dataBytes = Buffer.byteLength(data, "utf-8");

	// Check if we would exceed the limit
	if (buffer.maxBytes > 0 && buffer.totalBytes + dataBytes > buffer.maxBytes) {
		// Truncate from the beginning to make room
		buffer.truncated = true;

		// Keep adding new data, removing old chunks as needed
		buffer.chunks.push(data);
		buffer.totalBytes += dataBytes;

		// Remove oldest chunks until we're under the limit
		while (buffer.totalBytes > buffer.maxBytes && buffer.chunks.length > 1) {
			const removed = buffer.chunks.shift();
			if (removed) {
				buffer.totalBytes -= Buffer.byteLength(removed, "utf-8");
			}
		}
	} else {
		buffer.chunks.push(data);
		buffer.totalBytes += dataBytes;
	}
}

/**
 * Get the buffer content for a specific terminal
 * @param terminal The terminal to get the buffer for
 * @param maxChars Maximum number of characters to return (default: all)
 */
export function getBufferForTerminal(terminal?: Terminal, maxChars?: number): string {
	if (!terminal) {
		return "";
	}

	const buffer = terminalBuffers.get(terminal);
	if (!buffer) {
		return "";
	}

	const joined = buffer.chunks.join("");
	if (maxChars === undefined || maxChars <= 0) {
		return joined;
	}

	// Truncate from the beginning, keeping the most recent output
	const start = Math.max(0, joined.length - maxChars);
	return joined.slice(start);
}

/**
 * Get buffer info including truncation status
 */
export function getBufferInfo(terminal: Terminal): {
	output: string;
	truncated: boolean;
	totalBytes: number;
} {
	const buffer = terminalBuffers.get(terminal);
	if (!buffer) {
		return { output: "", truncated: false, totalBytes: 0 };
	}

	return {
		output: buffer.chunks.join(""),
		truncated: buffer.truncated,
		totalBytes: buffer.totalBytes,
	};
}

/**
 * Get terminal by ID
 */
export function getTerminalById(terminalId: string): Terminal | undefined {
	return terminalIdMap.get(terminalId);
}

/**
 * Mark terminal as completed with exit status
 */
export function markTerminalCompleted(
	terminal: Terminal,
	exitStatus?: { exitCode?: number; signal?: string }
): void {
	const buffer = terminalBuffers.get(terminal);
	if (!buffer) {
		return;
	}

	buffer.completed = true;
	buffer.exitStatus = exitStatus;

	// Notify all waiters
	for (const waiter of buffer.completionWaiters) {
		if (waiter.timeoutId) {
			clearTimeout(waiter.timeoutId);
		}
		waiter.resolve(exitStatus);
	}
	buffer.completionWaiters = [];
}

/**
 * Wait for a terminal command to complete
 * @param terminal The terminal to wait for
 * @param timeoutMs Timeout in milliseconds (0 = no timeout)
 */
export function waitForTerminalCompletion(
	terminal: Terminal,
	timeoutMs: number = 0
): Promise<{ exitCode?: number; signal?: string } | undefined> {
	const buffer = terminalBuffers.get(terminal);
	if (!buffer) {
		return Promise.resolve(undefined);
	}

	// If already completed, return immediately
	if (buffer.completed) {
		return Promise.resolve(buffer.exitStatus);
	}

	return new Promise((resolve) => {
		const waiter: (typeof buffer.completionWaiters)[0] = { resolve };

		// Set timeout if specified
		if (timeoutMs > 0) {
			waiter.timeoutId = setTimeout(() => {
				// Remove this waiter and resolve with undefined
				const index = buffer.completionWaiters.indexOf(waiter);
				if (index !== -1) {
					buffer.completionWaiters.splice(index, 1);
				}
				resolve(undefined);
			}, timeoutMs);
		}

		buffer.completionWaiters.push(waiter);
	});
}

/**
 * Check if terminal has completed
 */
export function isTerminalCompleted(terminal: Terminal): boolean {
	const buffer = terminalBuffers.get(terminal);
	return buffer?.completed ?? false;
}

/**
 * Get terminal exit status
 */
export function getTerminalExitStatus(
	terminal: Terminal
): { exitCode?: number; signal?: string } | undefined {
	const buffer = terminalBuffers.get(terminal);
	return buffer?.exitStatus;
}

/**
 * Clean up buffer for a terminal
 */
export function cleanupTerminalBuffer(terminal: Terminal): void {
	const buffer = terminalBuffers.get(terminal);
	if (buffer) {
		// Reject any pending waiters
		for (const waiter of buffer.completionWaiters) {
			if (waiter.timeoutId) {
				clearTimeout(waiter.timeoutId);
			}
			waiter.resolve(undefined);
		}
	}
	terminalBuffers.delete(terminal);

	// Remove from ID map
	for (const [id, t] of terminalIdMap.entries()) {
		if (t === terminal) {
			terminalIdMap.delete(id);
			break;
		}
	}
}

/**
 * Clean up terminal by ID
 */
export function cleanupTerminalById(terminalId: string): void {
	const terminal = terminalIdMap.get(terminalId);
	if (terminal) {
		cleanupTerminalBuffer(terminal);
	}
}

/**
 * Get the last command executed in a terminal
 */
export function getLastCommandForTerminal(terminal: Terminal): TerminalExecutedCommand | undefined {
	const buffer = terminalBuffers.get(terminal);
	return buffer?.commands.at(-1);
}

/**
 * Add a command to terminal history
 */
function addCommandToHistory(terminal: Terminal, command: TerminalExecutedCommand): void {
	const buffer = terminalBuffers.get(terminal);
	if (!buffer) {
		return;
	}

	buffer.commands.push(command);
	if (buffer.commands.length > MAX_COMMAND_HISTORY) {
		buffer.commands.shift();
	}
}

/**
 * Get the buffer content of the active terminal
 */
export function getActiveTerminalBuffer(): string {
	const activeTerminal = window.activeTerminal;
	if (activeTerminal === undefined) {
		return "";
	}
	return getBufferForTerminal(activeTerminal);
}

/**
 * Get the selection in the active terminal
 */
export function getActiveTerminalSelection(): string {
	const activeTerminal = window.activeTerminal;
	try {
		// @ts-expect-error - selection property may not exist in all VS Code versions
		return activeTerminal?.selection ?? "";
	} catch {
		return "";
	}
}

/**
 * Get the last executed command in the active terminal
 */
export function getActiveTerminalLastCommand(): TerminalExecutedCommand | undefined {
	const activeTerminal = window.activeTerminal;
	if (activeTerminal === undefined) {
		return undefined;
	}
	return getLastCommandForTerminal(activeTerminal);
}

/**
 * Get the shell type of the active terminal
 */
export function getActiveTerminalShellType(): string {
	const activeTerminal = window.activeTerminal;

	// Prefer the state object as it's the most reliable
	if (activeTerminal?.state.shell) {
		return activeTerminal.state.shell;
	}

	if (activeTerminal && "shellPath" in activeTerminal.creationOptions) {
		const shellPath = (activeTerminal.creationOptions as { shellPath?: string }).shellPath;
		if (shellPath) {
			let candidateShellType: string | undefined;
			const shellFile = basename(shellPath);

			if (shellFile === "bash.exe") {
				candidateShellType = "Git Bash";
			} else {
				const shellFileWithoutExtension = shellFile.replace(/\..+/, "");
				switch (shellFileWithoutExtension) {
					case "pwsh":
					case "powershell":
						candidateShellType = "powershell";
						break;
					case "":
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

	if (lastDetectedShellType) {
		return lastDetectedShellType;
	}

	return process.platform === "win32" ? "powershell" : "bash";
}

/**
 * Install listeners for terminal events
 * @returns Array of disposables for cleanup
 */
export function installEnhancedTerminalListeners(): Disposable[] {
	const disposables: Disposable[] = [];

	// Listen for terminal state changes
	disposables.push(
		window.onDidChangeTerminalState((t) => {
			const activeTerminal = window.activeTerminal;
			if (activeTerminal && t.processId === activeTerminal.processId) {
				const newShellType = t.state.shell;
				if (newShellType && newShellType !== lastDetectedShellType) {
					lastDetectedShellType = newShellType;
				}
			}
		})
	);

	// Try to use onDidWriteTerminalData if available (proposed API)
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const onDidWriteTerminalData = (window as any).onDidWriteTerminalData;
		if (onDidWriteTerminalData) {
			disposables.push(
				onDidWriteTerminalData((e: { terminal: Terminal; data: string }) => {
					appendToTerminalBuffer(e.terminal, e.data);
				})
			);
		}
	} catch {
		// onDidWriteTerminalData is not available
		console.log("[ACP-Terminal] onDidWriteTerminalData not available, output capture limited");
	}

	// Try to use onDidEndTerminalShellExecution if available (proposed API)
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const onDidEndTerminalShellExecution = (window as any).onDidEndTerminalShellExecution;
		if (onDidEndTerminalShellExecution) {
			disposables.push(
				onDidEndTerminalShellExecution((e: TerminalShellExecutionEndEvent) => {
					markTerminalCompleted(e.terminal, {
						exitCode: e.exitCode,
					});
				})
			);
		}
	} catch {
		// onDidEndTerminalShellExecution is not available
		console.log("[ACP-Terminal] onDidEndTerminalShellExecution not available, using fallback");
	}

	// Try to use onDidExecuteTerminalCommand if available (proposed API)
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const onDidExecuteTerminalCommand = (window as any).onDidExecuteTerminalCommand;
		if (onDidExecuteTerminalCommand) {
			disposables.push(
				onDidExecuteTerminalCommand((e: TerminalExecutedCommand) => {
					addCommandToHistory(e.terminal, e);
				})
			);
		}
	} catch {
		// onDidExecuteTerminalCommand is not available
	}

	// Listen for terminal close to clean up
	disposables.push(
		window.onDidCloseTerminal((terminal) => {
			// Mark as completed with no exit code (terminal closed)
			markTerminalCompleted(terminal, { exitCode: undefined });
			cleanupTerminalBuffer(terminal);
		})
	);

	return disposables;
}
