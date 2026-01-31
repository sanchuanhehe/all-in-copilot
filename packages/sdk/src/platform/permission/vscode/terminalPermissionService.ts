/*---------------------------------------------------------------------------------------------
 *  VS Code Terminal Permission Service Implementation
 *  Provides terminal command confirmation UI for AI agent operations
 *--------------------------------------------------------------------------------------------*/

import { window } from 'vscode';
import {
	PermissionResult,
	TerminalConfirmationDetails,
	ITerminalPermissionService,
	DangerousCommandPattern
} from '../common/terminalPermission';

/**
 * Default dangerous command patterns
 */
const DEFAULT_DANGEROUS_PATTERNS: DangerousCommandPattern[] = [
	// File destruction patterns
	{
		pattern: /\brm\s+-rf\b/i,
		reason: 'Recursive force delete - can permanently remove files',
		severity: 'critical'
	},
	{
		pattern: /\brm\s+-[rR]\b/i,
		reason: 'Recursive delete - can remove entire directories',
		severity: 'high'
	},
	{
		pattern: /\bdel\b.*\/[pq]/i,
		reason: 'Pattern matching delete - may delete unexpected files',
		severity: 'high'
	},
	{
		pattern: /\brm\b.*(-[fi]|--force|--interactive)/i,
		reason: 'Force delete without confirmation',
		severity: 'medium'
	},

	// System modification patterns
	{
		pattern: /\bsudo\b.*(chmod|chown|mkfs|mount|umount)/i,
		reason: 'System-level permission changes',
		severity: 'critical'
	},
	{
		pattern: /\bchmod\s+[0-7]{3,4}\b/i,
		reason: 'File permission changes',
		severity: 'medium'
	},
	{
		pattern: /\bchown\b/i,
		reason: 'File ownership changes',
		severity: 'medium'
	},

	// Network and security patterns
	{
		pattern: /\bcurl\b.*\|\s*(bash|sh)/i,
		reason: 'Piping curl to shell - potential security risk',
		severity: 'critical'
	},
	{
		pattern: /\bwget\b.*\|\s*(bash|sh)/i,
		reason: 'Piping wget to shell - potential security risk',
		severity: 'critical'
	},
	{
		pattern: /\bbash\b.*\$\(/i,
		reason: 'Command substitution in shell - potential injection risk',
		severity: 'medium'
	},
	{
		pattern: /\bsh\b.*\$\(/i,
		reason: 'Command substitution in shell - potential injection risk',
		severity: 'medium'
	},

	// Environment and configuration patterns
	{
		pattern: /\bexport\s+PATH\b/i,
		reason: 'Modifying PATH environment variable',
		severity: 'medium'
	},
	{
		pattern: /\bexport\s+.*=.*\$\(/i,
		reason: 'Dynamic environment variable assignment',
		severity: 'low'
	},

	// Package management patterns (destructive)
	{
		pattern: /\bapt-get\s+remove\b/i,
		reason: 'Package removal - may affect system stability',
		severity: 'high'
	},
	{
		pattern: /\bapt-get\s+purge\b/i,
		reason: 'Package purge - removes configuration files',
		severity: 'high'
	},
	{
		pattern: /\bapt-get\s+autoremove\b/i,
		reason: 'Automatic package removal',
		severity: 'medium'
	},
	{
		pattern: /\byum\s+remove\b/i,
		reason: 'Package removal - may affect system stability',
		severity: 'high'
	},
	{
		pattern: /\bdnf\s+remove\b/i,
		reason: 'Package removal - may affect system stability',
		severity: 'high'
	},
	{
		pattern: /\bnpm\s+uninstall\b.*(-g|--global)/i,
		reason: 'Global npm package removal',
		severity: 'medium'
	},
	{
		pattern: /\bpip\s+uninstall\b.*(-y|--yes)/i,
		reason: 'Pip package removal without confirmation',
		severity: 'medium'
	},

	// Git dangerous operations
	{
		pattern: /\bgit\s+push\s+--force\b/i,
		reason: 'Force push - can overwrite remote history',
		severity: 'high'
	},
	{
		pattern: /\bgit\s+push\s+-f\b/i,
		reason: 'Force push - can overwrite remote history',
		severity: 'high'
	},
	{
		pattern: /\bgit\s+reset\s+--hard\b/i,
		reason: 'Hard reset - permanently discards local changes',
		severity: 'high'
	},
	{
		pattern: /\bgit\s+clean\s+-fd\b/i,
		reason: 'Clean - removes untracked files and directories',
		severity: 'high'
	},
	{
		pattern: /\bgit\s+push\s+origin\s+--delete\b/i,
		reason: 'Remote branch deletion',
		severity: 'high'
	},

	// Docker dangerous operations
	{
		pattern: /\bdocker\s+rm\b.*(-f|--force)/i,
		reason: 'Force container removal',
		severity: 'medium'
	},
	{
		pattern: /\bdocker\s+rmi\b.*(-f|--force)/i,
		reason: 'Force image removal',
		severity: 'medium'
	},
	{
		pattern: /\bdocker\s+system\s+prune\b/i,
		reason: 'System prune - removes stopped containers, unused networks',
		severity: 'medium'
	},
	{
		pattern: /\bdocker\s+volume\s+prune\b/i,
		reason: 'Volume prune - removes unused volumes',
		severity: 'high'
	},

	// Process termination
	{
		pattern: /\bkill\s+-9\b/i,
		reason: 'Force kill - terminates process immediately',
		severity: 'medium'
	},
	{
		pattern: /\bpkill\s+-9\b/i,
		reason: 'Force kill by name - terminates processes immediately',
		severity: 'medium'
	},
	{
		pattern: /\bkillall\b.*(-9|-SIGKILL)/i,
		reason: 'Force kill all matching processes',
		severity: 'medium'
	}
];

/**
 * Safe command prefixes that don't require confirmation
 */
const SAFE_COMMAND_PREFIXES = [
	'echo',
	'cat',
	'head',
	'tail',
	'less',
	'more',
	'wc',
	'ls',
	'pwd',
	'cd',
	'history',
	'date',
	'time',
	'uname',
	'whoami',
	'id',
	'which',
	'whereis',
	'type',
	'help',
	'man',
	'whatis',
	'alias',
	'unalias',
	'source',
	'.',  // source alias in bash
	'printenv',
	'env',
	'set',
	'true',
	'false',
	'test',
	'[',
	']',
	'git status',
	'git diff',
	'git log',
	'git show',
	'git branch',
	'git remote -v',
	'git remote get-url'
];

/**
 * VS Code implementation of terminal permission service
 */
export class TerminalPermissionService implements ITerminalPermissionService {
	private readonly dangerousPatterns: DangerousCommandPattern[];
	private readonly autoApproveSafeCommands: boolean;
	private readonly confirmDangerousCommands: boolean;

	constructor(config?: {
		dangerousPatterns?: DangerousCommandPattern[];
		autoApproveSafeCommands?: boolean;
		confirmDangerousCommands?: boolean;
	}) {
		this.dangerousPatterns = config?.dangerousPatterns ?? DEFAULT_DANGEROUS_PATTERNS;
		this.autoApproveSafeCommands = config?.autoApproveSafeCommands ?? true;
		this.confirmDangerousCommands = config?.confirmDangerousCommands ?? true;
	}

	/**
	 * Request user confirmation for a terminal command
	 */
	async requestTerminalConfirmation(details: TerminalConfirmationDetails): Promise<PermissionResult> {
		// Check if command is dangerous and requires confirmation
		const isDangerous = this.isDangerousCommand(details.command);

		// Auto-approve safe commands if configured
		if (!isDangerous && this.autoApproveSafeCommands) {
			return PermissionResult.Allow;
		}

		// Skip confirmation for non-dangerous commands if not confirming
		if (!isDangerous && !this.confirmDangerousCommands) {
			return PermissionResult.Allow;
		}

		// Show confirmation dialog
		return this.showConfirmationDialog(details);
	}

	/**
	 * Check if a command is considered dangerous
	 */
	isDangerousCommand(command: string): boolean {
		const trimmedCommand = command.trim();

		// Check against dangerous patterns
		for (const pattern of this.dangerousPatterns) {
			if (pattern.pattern.test(trimmedCommand)) {
				return true;
			}
		}

		// Check if it's a known safe command
		const baseCommand = this.getBaseCommand(trimmedCommand);
		return !SAFE_COMMAND_PREFIXES.some(safe =>
			baseCommand.toLowerCase().startsWith(safe.toLowerCase())
		);
	}

	/**
	 * Get a sanitized description of a command for display
	 */
	getCommandDescription(command: string): string {
		const trimmedCommand = command.trim();
		const baseCommand = this.getBaseCommand(trimmedCommand);

		// Try to identify the operation type
		if (/^(npm|yarn|pnpm|bun)\s+(install|add)/i.test(trimmedCommand)) {
			return `Installing dependencies with ${baseCommand}`;
		}

		if (/^(npm|yarn|pnpm|bun)\s+(remove|uninstall)/i.test(trimmedCommand)) {
			return `Uninstalling packages with ${baseCommand}`;
		}

		if (/^pip\s+(install|download)/i.test(trimmedCommand)) {
			return 'Installing Python packages';
		}

		if (/^pip\s+(uninstall|remove)/i.test(trimmedCommand)) {
			return 'Uninstalling Python packages';
		}

		if (/^cargo\s+(add|remove|update)/i.test(trimmedCommand)) {
			return 'Managing Rust dependencies';
		}

		if (/^go\s+(get|install)/i.test(trimmedCommand)) {
			return 'Installing Go packages';
		}

		if (/^docker\s+(build|run)/i.test(trimmedCommand)) {
			return 'Building or running Docker container';
		}

		if (/^git\s+(clone|fetch|pull|checkout|switch)/i.test(trimmedCommand)) {
			return `Git ${this.getGitOperation(trimmedCommand)}`;
		}

		if (/^git\s+commit/i.test(trimmedCommand)) {
			return 'Creating a git commit';
		}

		if (/^git\s+push/i.test(trimmedCommand)) {
			return 'Pushing to remote repository';
		}

		if (/^mkdir\s+-p/i.test(trimmedCommand)) {
			return 'Creating directory hierarchy';
		}

		if (/^(touch|printf|tee)/i.test(trimmedCommand)) {
			return 'Creating or modifying file';
		}

		if (/^cat\s+>/i.test(trimmedCommand)) {
			return 'Writing to file';
		}

		if (/^cat\s+>>/i.test(trimmedCommand)) {
			return 'Appending to file';
		}

		// Default: show the base command
		return `Running command: ${baseCommand}`;
	}

	/**
	 * Add a custom dangerous command pattern
	 */
	addDangerousPattern(pattern: DangerousCommandPattern): void {
		this.dangerousPatterns.push(pattern);
	}

	/**
	 * Get all registered dangerous patterns
	 */
	getDangerousPatterns(): DangerousCommandPattern[] {
		return [...this.dangerousPatterns];
	}

	/**
	 * Get the base command (first word) from a command string
	 */
	private getBaseCommand(command: string): string {
		const parts = command.trim().split(/\s+/);
		return parts[0] || '';
	}

	/**
	 * Get the git operation from a command
	 */
	private getGitOperation(command: string): string {
		const match = command.match(/^git\s+(\w+)/i);
		return match ? match[1].toLowerCase() : 'operation';
	}

	/**
	 * Show a confirmation dialog for the command
	 */
	private async showConfirmationDialog(details: TerminalConfirmationDetails): Promise<PermissionResult> {
		const command = details.command;
		// const description = details.description || this.getCommandDescription(command); // unused
		const isDangerous = this.isDangerousCommand(command);

		// Build the message
		let message = `AI agent wants to run this command in ${details.shellType || 'terminal'}:\n\n`;
		message += `\`${this.truncateCommand(command, 100)}\``;

		if (isDangerous) {
			message = `⚠️ **Potentially Dangerous Command**\n\n${message}`;
		}

		if (details.cwd) {
			message += `\n\nWorking directory: \`${details.cwd}\``;
		}

		if (isDangerous) {
			message += '\n\nAre you sure you want to allow this?';
		}

		// Show the confirmation dialog
		if (isDangerous) {
			const choice = await window.showWarningMessage(
				message,
				{ modal: true },
				{ title: 'Allow', action: 'allow' },
				{ title: 'Deny', action: 'deny' }
			);

			return choice?.action === 'allow' ? PermissionResult.Allow : PermissionResult.Deny;
		} else {
			const choice = await window.showInformationMessage(
				message,
				{ modal: true },
				{ title: 'Allow', action: 'allow' },
				{ title: 'Skip', action: 'skip' }
			);

			return choice?.action === 'allow' ? PermissionResult.Allow : PermissionResult.Skip;
		}
	}

	/**
	 * Truncate a command for display
	 */
	private truncateCommand(command: string, maxLength: number): string {
		if (command.length <= maxLength) {
			return command;
		}
		return command.substring(0, maxLength - 3) + '...';
	}
}

/**
 * Create a terminal permission service with default configuration
 */
export function createTerminalPermissionService(config?: {
	dangerousPatterns?: DangerousCommandPattern[];
	autoApproveSafeCommands?: boolean;
	confirmDangerousCommands?: boolean;
}): ITerminalPermissionService {
	return new TerminalPermissionService(config);
}
