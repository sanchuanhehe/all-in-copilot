/*---------------------------------------------------------------------------------------------
 *  Platform Module Exports
 *--------------------------------------------------------------------------------------------*/

// Terminal services
export {
	ITerminalService,
	ShellIntegrationQuality,
	IKnownTerminal,
	isTerminalService,
} from "./terminal/common/terminalService";
export { TerminalServiceImpl } from "./terminal/vscode/terminalServiceImpl";

// Permission services
export { PermissionResult, ShellType } from "./permission/common/terminalPermission";
export {
	ITerminalPermissionService,
	TerminalConfirmationDetails,
	DangerousCommandPattern,
	PermissionServiceConfig,
} from "./permission/common/terminalPermission";
export {
	TerminalPermissionService,
	createTerminalPermissionService,
} from "./permission/vscode/terminalPermissionService";
