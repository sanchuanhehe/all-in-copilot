/*---------------------------------------------------------------------------------------------
 *  ACP Terminal Adapter Callbacks Integration
 *  Provides easy integration between ACPTerminalAdapter and ACPClientManager callbacks
 *--------------------------------------------------------------------------------------------*/

import type { ITerminalService } from "../../platform/terminal/common/terminalService";
import type { IACPTerminalAdapter, ACPEnvVariable, ACPTerminalExitStatus } from "./types";
import { ACPTerminalAdapter } from "./acpTerminalAdapter";

/**
 * Terminal output result with full ACP protocol fields
 */
export interface TerminalOutputResult {
	output: string;
	truncated: boolean;
	exitStatus?: ACPTerminalExitStatus;
}

/**
 * Terminal exit result with full ACP protocol fields
 */
export interface TerminalExitResult {
	exitCode?: number;
	signal?: string;
}

/**
 * Terminal callbacks compatible with ACPClientManager.ClientCallbacks (v2 API)
 * All callbacks now include sessionId as the first parameter for full ACP protocol compliance.
 */
export interface ACPTerminalCallbacks {
	createTerminal: (
		sessionId: string,
		command: string,
		args?: string[],
		cwd?: string,
		env?: Array<{ name: string; value: string }>,
		outputByteLimit?: number
	) => Promise<{ terminalId: string; name: string; sendText: (text: string, shouldExecute?: boolean) => void; show: (preserveFocus?: boolean) => void; hide: () => void; dispose: () => void }>;
	getTerminalOutput: (sessionId: string, terminalId: string) => Promise<TerminalOutputResult>;
	releaseTerminal: (sessionId: string, terminalId: string) => Promise<void>;
	waitForTerminalExit: (sessionId: string, terminalId: string) => Promise<TerminalExitResult>;
	killTerminal: (sessionId: string, terminalId: string) => Promise<void>;
}

/**
 * Create terminal callbacks that integrate with ACPClientManager
 *
 * @param terminalService The VS Code terminal service
 * @param options Optional configuration (shellPath, shellArgs)
 * @returns Terminal callbacks for ACPClientManager and a reference to the adapter
 *
 * @example
 * ```typescript
 * const terminalService = new TerminalServiceImpl();
 * const { callbacks, adapter } = createTerminalCallbacks(terminalService);
 *
 * const clientManager = new ACPClientManager();
 * const client = await clientManager.getClient({
 *   transport: 'stdio',
 *   agentPath: '/path/to/agent',
 *   callbacks: {
 *     ...callbacks,
 *     // other callbacks...
 *   }
 * });
 * ```
 */
export function createTerminalCallbacks(
	terminalService: ITerminalService,
	options?: {
		shellPath?: string;
		shellArgs?: string[];
		defaultOutputByteLimit?: number;
	}
): { callbacks: ACPTerminalCallbacks; adapter: IACPTerminalAdapter } {
	const adapter = new ACPTerminalAdapter(terminalService, options);

	const callbacks: ACPTerminalCallbacks = {
		async createTerminal(
			sessionId: string,
			command: string,
			args?: string[],
			cwd?: string,
			env?: Array<{ name: string; value: string }>,
			outputByteLimit?: number
		) {
			const response = await adapter.createTerminal({
				sessionId,
				command,
				args,
				cwd,
				env: env as ACPEnvVariable[],
				outputByteLimit: outputByteLimit ?? options?.defaultOutputByteLimit,
			});

			// Get the actual terminal handle for show/hide operations
			const handle = adapter.getTerminalHandle(response.terminalId);

			// Return terminal interface with actual show/hide functionality
			return {
				terminalId: response.terminalId,
				name: `ACP: ${command.slice(0, 30)}...`,
				sendText: (text: string, shouldExecute?: boolean) => {
					handle?.terminal.sendText(text, shouldExecute ?? true);
				},
				show: (preserveFocus?: boolean) => {
					// Show terminal in VS Code terminal panel
					handle?.terminal.show(preserveFocus ?? false);
				},
				hide: () => {
					handle?.terminal.hide();
				},
				dispose: () => adapter.release({ terminalId: response.terminalId }),
			};
		},

		async getTerminalOutput(_sessionId: string, terminalId: string): Promise<TerminalOutputResult> {
			const response = await adapter.getOutput({ terminalId });
			return {
				output: response.output,
				truncated: response.truncated,
				exitStatus: response.exitStatus,
			};
		},

		async releaseTerminal(_sessionId: string, terminalId: string) {
			await adapter.release({ terminalId });
		},

		async waitForTerminalExit(_sessionId: string, terminalId: string): Promise<TerminalExitResult> {
			const response = await adapter.waitForExit({ terminalId });
			return {
				exitCode: response.exitCode,
				signal: response.signal,
			};
		},

		async killTerminal(_sessionId: string, terminalId: string) {
			await adapter.killCommand({ terminalId });
		},
	};

	return { callbacks, adapter };
}

/**
 * Dispose helper - cleans up the terminal adapter when done
 *
 * @example
 * ```typescript
 * const { callbacks, adapter } = createTerminalCallbacks(terminalService);
 * // ... use callbacks with client manager
 *
 * // When done:
 * disposeTerminalAdapter(adapter);
 * ```
 */
export function disposeTerminalAdapter(adapter: IACPTerminalAdapter): void {
	if ('dispose' in adapter && typeof adapter.dispose === 'function') {
		adapter.dispose();
	}
}
