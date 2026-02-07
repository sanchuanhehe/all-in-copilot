/*---------------------------------------------------------------------------------------------
 *  Terminal Permission Service Unit Tests - Common Module
 *  Tests for types and null implementation that don't require VS Code
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from "vitest";
import {
	PermissionResult,
	DangerousCommandPattern,
	TerminalConfirmationDetails,
} from "../../src/platform/permission/common/terminalPermission";
import { NullTerminalPermissionService } from "../../src/platform/permission/common/terminalPermissionService";

describe("PermissionResult Enum", () => {
	it("should have correct Allow value", () => {
		expect(PermissionResult.Allow).toBe("allow");
	});

	it("should have correct Deny value", () => {
		expect(PermissionResult.Deny).toBe("deny");
	});

	it("should have correct Skip value", () => {
		expect(PermissionResult.Skip).toBe("skip");
	});
});

describe("DangerousCommandPattern Interface", () => {
	it("should accept valid pattern object", () => {
		const pattern: DangerousCommandPattern = {
			pattern: /rm\s+-rf/i,
			reason: "Recursive delete is dangerous",
			severity: "critical",
		};

		expect(pattern.pattern).toBeInstanceOf(RegExp);
		expect(pattern.reason).toBe("Recursive delete is dangerous");
		expect(pattern.severity).toBe("critical");
	});

	it("should accept all severity levels", () => {
		const severities: DangerousCommandPattern["severity"][] = ["low", "medium", "high", "critical"];

		severities.forEach((severity) => {
			const pattern: DangerousCommandPattern = {
				pattern: /test/i,
				reason: "Test pattern",
				severity,
			};
			expect(pattern.severity).toBe(severity);
		});
	});
});

describe("NullTerminalPermissionService", () => {
	let service: NullTerminalPermissionService;

	beforeEach(() => {
		service = new NullTerminalPermissionService();
	});

	describe("requestTerminalConfirmation", () => {
		it("should always return Allow", async () => {
			const details: TerminalConfirmationDetails = {
				command: "rm -rf /",
				description: "Delete everything",
			};

			const result = await service.requestTerminalConfirmation(details);
			expect(result).toBe(PermissionResult.Allow);
		});

		it("should return Allow for safe command", async () => {
			const details: TerminalConfirmationDetails = {
				command: 'echo "Hello"',
			};

			const result = await service.requestTerminalConfirmation(details);
			expect(result).toBe(PermissionResult.Allow);
		});

		it("should handle empty details", async () => {
			const details: TerminalConfirmationDetails = {
				command: "",
			};

			const result = await service.requestTerminalConfirmation(details);
			expect(result).toBe(PermissionResult.Allow);
		});
	});

	describe("isDangerousCommand", () => {
		it("should return false for dangerous command", () => {
			const result = service.isDangerousCommand("rm -rf /");
			expect(result).toBe(false);
		});

		it("should return false for any command", () => {
			const result = service.isDangerousCommand("ls -la");
			expect(result).toBe(false);
		});
	});

	describe("getCommandDescription", () => {
		it("should return base command description", () => {
			const description = service.getCommandDescription("npm install");
			expect(description).toBe("Running command: npm");
		});

		it("should handle empty command", () => {
			const description = service.getCommandDescription("");
			expect(description).toBe("Running command: ");
		});

		it("should handle complex command", () => {
			const description = service.getCommandDescription('git commit -m "test"');
			expect(description).toBe("Running command: git");
		});
	});

	describe("addDangerousPattern", () => {
		it("should add pattern without error", () => {
			const pattern: DangerousCommandPattern = {
				pattern: /custom/i,
				reason: "Custom pattern",
				severity: "medium",
			};

			expect(() => service.addDangerousPattern(pattern)).not.toThrow();
		});

		it("should store pattern internally", () => {
			const pattern: DangerousCommandPattern = {
				pattern: /custom/i,
				reason: "Custom pattern",
				severity: "medium",
			};

			service.addDangerousPattern(pattern);
			// Pattern is stored but doesn't affect isDangerousCommand in null implementation
			expect(service.isDangerousCommand("custom test")).toBe(false);
		});
	});

	describe("getDangerousPatterns", () => {
		it("should return empty array", () => {
			const patterns = service.getDangerousPatterns();
			expect(patterns).toBeInstanceOf(Array);
			expect(patterns.length).toBe(0);
		});

		it("should return new array instance", () => {
			const patterns1 = service.getDangerousPatterns();
			const patterns2 = service.getDangerousPatterns();
			expect(patterns1).not.toBe(patterns2);
		});
	});
});

describe("TerminalConfirmationDetails Interface", () => {
	it("should accept valid confirmation details", () => {
		const details: TerminalConfirmationDetails = {
			command: "npm install",
			description: "Install dependencies",
			shellType: "bash",
			cwd: "/project",
		};

		expect(details.command).toBe("npm install");
		expect(details.description).toBe("Install dependencies");
		expect(details.shellType).toBe("bash");
		expect(details.cwd).toBe("/project");
	});

	it("should work with minimal details", () => {
		const details: TerminalConfirmationDetails = {
			command: "echo test",
		};

		expect(details.command).toBe("echo test");
		expect(details.description).toBeUndefined();
		expect(details.shellType).toBeUndefined();
		expect(details.cwd).toBeUndefined();
	});
});
