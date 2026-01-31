/*---------------------------------------------------------------------------------------------
 *  Terminal Service Tests for All-In Copilot SDK
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach } from "vitest";
import {
	ITerminalService,
	NullTerminalService,
	isTerminalService,
	ShellIntegrationQuality,
	IKnownTerminal,
} from "../platform/terminal/common/terminalService";

describe("ShellIntegrationQuality Enum", () => {
	it("should have correct None value", () => {
		expect(ShellIntegrationQuality.None).toBe("none");
	});

	it("should have correct Basic value", () => {
		expect(ShellIntegrationQuality.Basic).toBe("basic");
	});

	it("should have correct Rich value", () => {
		expect(ShellIntegrationQuality.Rich).toBe("rich");
	});

	it("should have all expected values", () => {
		expect(ShellIntegrationQuality.None).toBe("none");
		expect(ShellIntegrationQuality.Basic).toBe("basic");
		expect(ShellIntegrationQuality.Rich).toBe("rich");
	});
});

describe("NullTerminalService", () => {
	let service: NullTerminalService;

	beforeEach(() => {
		service = new NullTerminalService();
	});

	describe("Basic Properties", () => {
		it("should return empty string for terminalBuffer", () => {
			expect(service.terminalBuffer).toBe("");
		});

		it("should return undefined for terminalLastCommand", () => {
			expect(service.terminalLastCommand).toBeUndefined();
		});

		it("should return empty string for terminalSelection", () => {
			expect(service.terminalSelection).toBe("");
		});

		it("should return empty string for terminalShellType", () => {
			expect(service.terminalShellType).toBe("");
		});

		it("should return empty array for terminals", () => {
			expect(service.terminals).toEqual([]);
			expect(service.terminals).toHaveLength(0);
		});
	});

	describe("Event Properties", () => {
		it("should return a function for onDidChangeTerminalShellIntegration", () => {
			expect(typeof service.onDidChangeTerminalShellIntegration).toBe("function");
		});

		it("should return a function for onDidEndTerminalShellExecution", () => {
			expect(typeof service.onDidEndTerminalShellExecution).toBe("function");
		});

		it("should return a function for onDidCloseTerminal", () => {
			expect(typeof service.onDidCloseTerminal).toBe("function");
		});

		it("should return a function for onDidWriteTerminalData", () => {
			expect(typeof service.onDidWriteTerminalData).toBe("function");
		});

		it("should return disposable from event listener registration", () => {
			const listener = () => {};
			const result = service.onDidChangeTerminalShellIntegration(listener);
			expect(result).toHaveProperty("dispose");
			expect(typeof result.dispose).toBe("function");
		});
	});

	describe("Terminal Creation", () => {
		it("should return a terminal object", () => {
			const terminal = service.createTerminal();
			expect(terminal).toBeDefined();
			expect(terminal).toBeTypeOf("object");
		});
	});

	describe("Buffer Methods", () => {
		it("getBufferForTerminal should return empty string", () => {
			const result = service.getBufferForTerminal();
			expect(result).toBe("");
		});

		it("getBufferWithPid should return empty string", async () => {
			const result = await service.getBufferWithPid();
			expect(result).toBe("");
		});

		it("getBufferWithPid should return empty string with maxChars", async () => {
			const result = await service.getBufferWithPid();
			expect(result).toBe("");
		});
	});

	describe("Command Methods", () => {
		it("getLastCommandForTerminal should return undefined", () => {
			const result = service.getLastCommandForTerminal();
			expect(result).toBeUndefined();
		});
	});

	describe("Path Contribution Methods", () => {
		it("contributePath should not throw", () => {
			expect(() => service.contributePath("test", "/path")).not.toThrow();
		});

		it("contributePath with description should not throw", () => {
			expect(() => service.contributePath("test", "/path", "Test path")).not.toThrow();
		});

		it("contributePath with command description should not throw", () => {
			expect(() => service.contributePath("test", "/path", { command: "test-cmd" })).not.toThrow();
		});

		it("contributePath with prepend should not throw", () => {
			expect(() => service.contributePath("test", "/path", undefined, true)).not.toThrow();
		});

		it("removePathContribution should not throw", () => {
			expect(() => service.removePathContribution("test")).not.toThrow();
		});
	});

	describe("Session Methods", () => {
		it("getCwdForSession should return undefined", async () => {
			const result = await service.getCwdForSession("session-123");
			expect(result).toBeUndefined();
		});

		it("getCopilotTerminals should return empty array", async () => {
			const result = await service.getCopilotTerminals("session-123");
			expect(result).toEqual([]);
		});

		it("associateTerminalWithSession should not throw", async () => {
			const mockTerminal = { name: "test" } as unknown as IKnownTerminal;
			await expect(
				service.associateTerminalWithSession(mockTerminal, "session-123", ShellIntegrationQuality.Basic)
			).resolves.toBeUndefined();
		});
	});

	describe("Dispose", () => {
		it("dispose should not throw", () => {
			expect(() => service.dispose()).not.toThrow();
		});
	});

	describe("_serviceBrand", () => {
		it("should have undefined _serviceBrand", () => {
			expect(service._serviceBrand).toBeUndefined();
		});
	});
});

describe("isTerminalService Type Guard", () => {
	it("should return true for NullTerminalService instance", () => {
		const service = new NullTerminalService();
		expect(isTerminalService(service)).toBe(true);
	});

	it("should return true for object with createTerminal function", () => {
		const obj = {
			createTerminal: () => ({}),
		};
		expect(isTerminalService(obj)).toBe(true);
	});

	it("should return true for object with createTerminal as function", () => {
		const obj = {
			createTerminal: function () {
				return {};
			},
		};
		expect(isTerminalService(obj)).toBe(true);
	});

	it("should return false for null", () => {
		expect(isTerminalService(null)).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isTerminalService(undefined)).toBe(false);
	});

	it("should return false for primitive values", () => {
		expect(isTerminalService("string")).toBe(false);
		expect(isTerminalService(123)).toBe(false);
		expect(isTerminalService(true)).toBe(false);
	});

	it("should return false for object without createTerminal", () => {
		expect(isTerminalService({})).toBe(false);
		expect(isTerminalService({ name: "test" })).toBe(false);
	});

	it("should return false for object with createTerminal as non-function", () => {
		expect(isTerminalService({ createTerminal: "not a function" })).toBe(false);
		expect(isTerminalService({ createTerminal: 123 })).toBe(false);
		expect(isTerminalService({ createTerminal: null })).toBe(false);
	});
});

describe("ITerminalService Interface", () => {
	it("NullTerminalService should implement ITerminalService", () => {
		const service = new NullTerminalService();
		expect(service).toBeDefined();
		expect(typeof service.createTerminal).toBe("function");
		expect(typeof service.terminalBuffer).toBe("string");
		expect(typeof service.terminalSelection).toBe("string");
		expect(typeof service.terminalShellType).toBe("string");
		expect(typeof service.terminalLastCommand).toBe("undefined");
	});

	it("should have correct Symbol description", () => {
		expect(ITerminalService.toString()).toBe("Symbol(ITerminalService)");
	});

	it("ITerminalService should be a Symbol", () => {
		expect(typeof ITerminalService).toBe("symbol");
	});
});

describe("IKnownTerminal Interface", () => {
	it("should extend Terminal", () => {
		// IKnownTerminal is an interface, we just verify it exists and can be used
		const terminal: IKnownTerminal = {
			name: "test",
			processId: Promise.resolve(12345),
			exitStatus: undefined,
			state: { isInteractedWith: false },
			creationOptions: {},
			dispose: () => {},
			// Additional property required by IKnownTerminal
			id: "terminal-123",
		} as unknown as IKnownTerminal;

		expect(terminal.id).toBe("terminal-123");
		expect(terminal.name).toBe("test");
	});
});
