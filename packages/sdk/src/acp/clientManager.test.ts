import { describe, it, expect, beforeEach } from "vitest";
import { ACPClientManager, type ACPClientConfig, type AgentInfo } from "./clientManager";

describe("ACPClientManager", () => {
	describe("constructor", () => {
		it("should create with default client info", () => {
			const manager = new ACPClientManager();
			expect(manager).toBeDefined();
		});

		it("should create with custom client info", () => {
			const manager = new ACPClientManager({
				name: "TestClient",
				version: "2.0.0",
			});
			expect(manager).toBeDefined();
		});
	});

	describe("getClient", () => {
		it("should throw error indicating SDK direct usage", async () => {
			const manager = new ACPClientManager();
			const config: ACPClientConfig = {
				transport: "stdio",
				agentPath: "/path/to/agent",
				agentArgs: ["--test"],
			};

			await expect(manager.getClient(config)).rejects.toThrow("Use the SDK directly for client connections");
		});
	});

	describe("initialize", () => {
		it("should throw error indicating SDK direct usage", async () => {
			const manager = new ACPClientManager();
			// Mock client for testing
			const mockClient = {} as any;

			await expect(manager.initialize(mockClient)).rejects.toThrow("Use the SDK directly for initialization");
		});
	});

	describe("newSession", () => {
		it("should throw error indicating SDK direct usage", async () => {
			const manager = new ACPClientManager();
			const mockClient = {} as any;

			await expect(manager.newSession(mockClient, { cwd: "/test/path" })).rejects.toThrow(
				"Use the SDK directly for sessions"
			);
		});
	});

	describe("prompt", () => {
		it("should throw error indicating SDK direct usage", async () => {
			const manager = new ACPClientManager();
			const mockClient = {} as any;

			await expect(
				manager.prompt(mockClient, {
					sessionId: "test-session",
					prompt: [{ type: "text", text: "Hello" }],
				})
			).rejects.toThrow("Use the SDK directly for prompting");
		});
	});

	describe("dispose", () => {
		it("should not throw any errors", async () => {
			const manager = new ACPClientManager();
			await expect(manager.dispose()).resolves.not.toThrow();
		});
	});
});

describe("ACPClientConfig", () => {
	it("should accept valid stdio transport config", () => {
		const config: ACPClientConfig = {
			transport: "stdio",
			agentPath: "/usr/bin/claude-code",
			agentArgs: ["--agent"],
			env: { DEBUG: "1" },
		};

		expect(config.transport).toBe("stdio");
		expect(config.agentPath).toBe("/usr/bin/claude-code");
		expect(config.agentArgs).toEqual(["--agent"]);
		expect(config.env).toEqual({ DEBUG: "1" });
	});
});

describe("AgentInfo", () => {
	it("should accept agent info with name and optional version", () => {
		const info: AgentInfo = {
			name: "Claude Code",
			version: "1.0.0",
		};

		expect(info.name).toBe("Claude Code");
		expect(info.version).toBe("1.0.0");
	});

	it("should accept agent info without version", () => {
		const info: AgentInfo = {
			name: "Test Agent",
		};

		expect(info.name).toBe("Test Agent");
		expect(info.version).toBeUndefined();
	});
});
