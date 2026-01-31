/*---------------------------------------------------------------------------------------------
 *  VS Code Proposed API Types for Terminal
 *  These are proposed APIs that may not be available in all VS Code versions
 *  See: https://code.visualstudio.com/api/advanced-topics/proposed-api
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	//#region Terminal Execute Command Event
	// https://github.com/microsoft/vscode/issues/145234

	export interface TerminalExecutedCommand {
		/**
		 * The {@link Terminal} the command was executed in.
		 */
		terminal: Terminal;
		/**
		 * The full command line that was executed, including both the command and the arguments.
		 */
		commandLine: string | undefined;
		/**
		 * The current working directory that was reported by the shell. This will be a {@link Uri}
		 * if the string reported by the shell can reliably be mapped to the connected machine.
		 */
		cwd: Uri | string | undefined;
		/**
		 * The exit code reported by the shell.
		 */
		exitCode: number | undefined;
		/**
		 * The output of the command when it has finished executing. This is the plain text shown in
		 * the terminal buffer and does not include raw escape sequences. Depending on the shell
		 * setup, this may include the command line as part of the output.
		 */
		output: string | undefined;
	}

	export interface TerminalShellIntegrationChangeEvent {
		/**
		 * The {@link Terminal} for which the shell integration changed.
		 */
		readonly terminal: Terminal;
		/**
		 * The shell integration instance.
		 */
		readonly shellIntegration: TerminalShellIntegration | undefined;
	}

	export interface TerminalShellExecutionEndEvent {
		/**
		 * The shell execution that ended.
		 */
		readonly execution: TerminalShellExecution;
		/**
		 * The exit code reported by the shell.
		 */
		readonly exitCode: number | undefined;
	}

	//#endregion

	//#region Terminal Data Write Event
	// https://github.com/microsoft/vscode/issues/78502
	// Note: This API is still proposed but not intended for stabilization due to performance issues

	export interface TerminalDataWriteEvent {
		/**
		 * The {@link Terminal} for which the data was written.
		 */
		readonly terminal: Terminal;
		/**
		 * The data being written.
		 */
		readonly data: string;
	}

	//#endregion
}
