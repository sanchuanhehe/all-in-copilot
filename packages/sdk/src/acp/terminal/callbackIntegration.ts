/*---------------------------------------------------------------------------------------------
 *  ACP Terminal Adapter Callbacks Integration
 *  Provides easy integration between ACPTerminalAdapter and ACPClientManager callbacks
 *--------------------------------------------------------------------------------------------*/

import type { ITerminalService } from "../../platform/terminal/common/terminalService";
import type { IACPTerminalAdapter, ACPEnvVariable } from "./types";
import { ACPTerminalAdapter } from "./acpTerminalAdapter";

/**
 * Terminal callbacks compatible with ACPClientManager.ClientCallbacks
 */
export interface ACPTerminalCallbacks {
	createTerminal: (
		sessionId: string,
		command: string,
		args?: string[],
		cwd?: string,
		env?: Array<{ name: string; value: string }>
	) => Promise<{ terminalId: string; name: string; sendText: (text: string, shouldExecute?: boolean) => void; show: (preserveFocus?: boolean) => void; hide: () => void; dispose: () => void }>;
	getTerminalOutput: (terminalId: string) => Promise<{ output: string; exitCode?: number }>;
	releaseTerminal: (terminalId: string) => Promise<void>;
	waitForTerminalExit: (terminalId: string) => Promise<{ exitCode?: number }>;
	killTerminal: (terminalId: string) => Promise<void>;
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
	}
): { callbacks: ACPTerminalCallbacks; adapter: IACPTerminalAdapter } {
	const adapter = new ACPTerminalAdapter(terminalService, options);

	const callbacks: ACPTerminalCallbacks = {
		async createTerminal(
			sessionId: string,
			command: string,
			args?: string[],
			cwd?: string,
			env?: Array<{ name: string; value: string }>
		) {
			const response = await adapter.createTerminal({
				sessionId,
				command,
				args,
				cwd,
				env: env as ACPEnvVariable[],
			});

			// Return a mock terminal handle that the client manager expects
			return {
				terminalId: response.terminalId,
				name: `ACP: ${command.slice(0, 30)}...`,
				sendText: () => { /* no-op - command already sent */ },
				show: () => { /* no-op - terminal shown by adapter */ },
				hide: () => { /* no-op */ },
				dispose: () => adapter.release({ terminalId: response.terminalId }),
			};
		},

		async getTerminalOutput(terminalId: string) {
			const response = await adapter.getOutput({ terminalId });
			return {
				output: response.output,
				exitCode: response.exitStatus?.exitCode,
			};
		},

		async releaseTerminal(terminalId: string) {
			await adapter.release({ terminalId });
		},

		async waitForTerminalExit(terminalId: string) {
			const response = await adapter.waitForExit({ terminalId });
			return {
				exitCode: response.exitCode,
			};
		},

		async killTerminal(terminalId: string) {
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
