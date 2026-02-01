/*---------------------------------------------------------------------------------------------
 *  ACP Terminal Execution Module
 *  Standard terminal execution for ACP protocol
 *--------------------------------------------------------------------------------------------*/

/**
 * Check if a tool call is a terminal/shell command based on tool name
 * Terminal tool names: bash, shell, exec, terminal, command, run, execute
 */
export function isTerminalTool(toolName: string): boolean {
	const terminalToolNames = ["bash", "shell", "exec", "terminal", "command", "run", "execute"];
	return terminalToolNames.some((name) => toolName.toLowerCase().includes(name));
}

/**
 * Extract command from tool title (format: "bash pwd" or "bash")
 * Some agents follow ACP protocol: title contains "toolName command"
 * Note: This is a fallback for non-standard agents that don't use terminal/create
 */
export function extractCommandFromTitle(title: string): string {
	const parts = title.trim().split(/\s+/);
	// Skip the first part (tool name) and join the rest as command
	if (parts.length > 1) {
		return parts.slice(1).join(" ");
	}
	return "";
}

/**
 * Format a tool input for display
 * Note: For standard ACP, command comes from terminal/create request
 */
export function formatToolInput(rawInput: unknown): string {
	if (rawInput === undefined) {
		return "";
	}
	if (typeof rawInput === "string") {
		return rawInput;
	}
	if (typeof rawInput === "object") {
		const inputObj = rawInput as Record<string, unknown>;
		if ("command" in inputObj && typeof inputObj.command === "string") {
			return inputObj.command;
		}
		if ("cmd" in inputObj && typeof inputObj.cmd === "string") {
			return inputObj.cmd;
		}
		if ("script" in inputObj && typeof inputObj.script === "string") {
			return inputObj.script;
		}
		return JSON.stringify(rawInput, null, 2);
	}
	return String(rawInput);
}

/**
 * Extract command from tool call.
 * Note: Standard ACP agents use terminal/create request for commands.
 * This function is a fallback for non-standard agents that embed
 * command information in tool_call's title or rawInput.
 */
export function extractToolCommand(title: string, rawInput?: unknown): string {
	// Try to extract from title (format: "bash pwd")
	const commandFromTitle = extractCommandFromTitle(title);
	if (commandFromTitle) {
		return commandFromTitle;
	}

	// Fallback to rawInput
	return formatToolInput(rawInput);
}

/**
 * Extract terminal command from tool call.
 * Note: Standard ACP agents use terminal/create request with proper fields.
 * This function handles non-standard agents that send tool_call with
 * empty rawInput and embed command in title or collected text.
 */
export function extractTerminalCommand(
	title: string,
	rawInput: unknown,
	_collectedText: string, // Kept for compatibility but not used (non-standard fallback removed)
	toolName: string
): string {
	// Try extractToolCommand first (standard: title or rawInput)
	const command = extractToolCommand(title, rawInput);
	if (command) {
		return command;
	}

	// If no command found, this is a non-standard agent
	// Return empty string - the agent should use terminal/create
	return "";
}
