/*---------------------------------------------------------------------------------------------
 *  ACP Terminal Execution Module
 *  Standard terminal execution for ACP protocol
 *--------------------------------------------------------------------------------------------*/

/**
 * Check if a tool call is a terminal/shell command based on tool name
 * Terminal tool names: bash, shell, exec, terminal, command, run, execute
 * Note: In standard ACP protocol, terminal commands come from terminal/create request,
 * not from tool_call's title or rawInput. This function is only used to identify
 * when an agent MIGHT be requesting terminal execution (non-standard behavior).
 */
export function isTerminalTool(toolName: string): boolean {
	const terminalToolNames = ["bash", "shell", "exec", "terminal", "command", "run", "execute"];
	return terminalToolNames.some((name) => toolName.toLowerCase().includes(name));
}
