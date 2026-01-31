/*---------------------------------------------------------------------------------------------
 *  Terminal Permission Service Interface
 *  Provides terminal command confirmation UI for AI agent operations
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';

/**
 * Permission result types
 */
export enum PermissionResult {
	Allow = 'allow',
	Deny = 'deny',
	Skip = 'skip'
}

/**
 * Terminal command to be confirmed
 */
export interface TerminalCommand {
	/** The command to execute */
	command: string;
	/** Description of what the command does */
	description?: string;
	/** Whether the command runs in the background */
	isBackground?: boolean;
	/** Working directory for the command */
	cwd?: string;
}

/**
 * Confirmation details for display
 */
export interface TerminalConfirmationDetails {
	/** The command being confirmed */
	command: string;
	/** Description of the command */
	description?: string;
	/** Working directory */
	cwd?: string;
	/** Shell type being used */
	shellType?: string;
	/** Whether this is a potentially dangerous command */
	isDangerous?: boolean;
}

/**
 * Service interface for handling terminal command permissions
 */
export interface ITerminalPermissionService {
	/**
	 * Request user confirmation for a terminal command
	 * @param details Details about the command to confirm
	 * @returns PermissionResult indicating user's choice
	 */
	requestTerminalConfirmation(details: TerminalConfirmationDetails): Promise<PermissionResult>;

	/**
	 * Check if a command is considered dangerous and requires explicit confirmation
	 * @param command The command to check
	 * @returns true if the command is dangerous
	 */
	isDangerousCommand(command: string): boolean;

	/**
	 * Get a sanitized description of a command for display
	 * @param command The command to describe
	 * @returns A user-friendly description
	 */
	getCommandDescription(command: string): string;
}

/**
 * Configuration for the permission service
 */
export interface PermissionServiceConfig {
	/** Whether to auto-approve safe commands */
	autoApproveSafeCommands?: boolean;
	/** Whether to show confirmation for potentially dangerous commands */
	confirmDangerousCommands?: boolean;
	/** Custom patterns for dangerous commands */
	dangerousPatterns?: DangerousCommandPattern[];
}

/**
 * Pattern for matching dangerous commands
 */
export interface DangerousCommandPattern {
	/** Regex pattern to match the command */
	pattern: RegExp;
	/** Description of why this pattern is dangerous */
	reason: string;
	/** Severity level of danger */
	severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Terminal shell type
 */
export const enum ShellType {
	Bash = 'bash',
	PowerShell = 'powershell',
	Cmd = 'cmd',
	Zsh = 'zsh',
	Fish = 'fish',
	GitBash = 'gitbash',
	Unknown = 'unknown'
}
