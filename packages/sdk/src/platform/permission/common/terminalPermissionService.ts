/*---------------------------------------------------------------------------------------------
 *  Null Terminal Permission Service Implementation
 *  Provides a no-op implementation for non-VS Code environments
 *--------------------------------------------------------------------------------------------*/

import {
	PermissionResult,
	TerminalConfirmationDetails,
	ITerminalPermissionService,
	DangerousCommandPattern,
} from "./terminalPermission";

/**
 * Null implementation of ITerminalPermissionService
 * Used for non-VS Code environments or testing
 */
export class NullTerminalPermissionService implements ITerminalPermissionService {
	private readonly dangerousPatterns: DangerousCommandPattern[] = [];

	/**
	 * Request user confirmation for a terminal command
	 * Returns Allow by default for null implementation
	 */
	async requestTerminalConfirmation(_details: TerminalConfirmationDetails): Promise<PermissionResult> {
		return PermissionResult.Allow;
	}

	/**
	 * Check if a command is considered dangerous
	 * Returns false by default for null implementation
	 */
	isDangerousCommand(_command: string): boolean {
		return false;
	}

	/**
	 * Get a sanitized description of a command for display
	 * Returns the base command by default
	 */
	getCommandDescription(command: string): string {
		const baseCommand = command.trim().split(/\s+/)[0] || "";
		return `Running command: ${baseCommand}`;
	}

	/**
	 * Add a custom dangerous command pattern
	 * Stores pattern internally but has no effect on null implementation
	 */
	addDangerousPattern(pattern: DangerousCommandPattern): void {
		this.dangerousPatterns.push(pattern);
	}

	/**
	 * Get all registered dangerous patterns
	 * Returns empty array by default for null implementation
	 */
	getDangerousPatterns(): DangerousCommandPattern[] {
		return [];
	}
}

/**
 * Create a null terminal permission service
 */
export function createNullTerminalPermissionService(): ITerminalPermissionService {
	return new NullTerminalPermissionService();
}
