import { describe, it, expect, vi } from "vitest";
import { ACPClientManager, type ACPClientConfig, type AgentInfo } from "./clientManager";
import type { ClientSideConnection } from "@agentclientprotocol/sdk";

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
		it("should return a ClientSideConnection for stdio transport", async () => {
			const manager = new ACPClientManager();
			const config: ACPClientConfig = {
				transport: "stdio",
				agentPath: "/path/to/agent",
				agentArgs: ["--test"],
			};

			// Note: This will fail to actually spawn a process since /path/to/agent doesn't exist
			// but it should return a ClientSideConnection object (not throw)
			const result = await manager.getClient(config);
			expect(result).toBeDefined();
			expect(result.initialize).toBeDefined();
		});

		it("should throw error for unsupported transport", async () => {
			const manager = new ACPClientManager();
			const config: ACPClientConfig = {
				transport: "websocket",
				agentPath: "/path/to/agent",
			} as unknown as ACPClientConfig;

			await expect(manager.getClient(config)).rejects.toThrow("Unsupported transport type");
		});
	});

	describe("initialize", () => {
		it("should return InitResult with success false for invalid client", async () => {
			const manager = new ACPClientManager();
			const mockClient = {
				initialize: undefined,
			} as unknown as ClientSideConnection;

			const result = await manager.initialize(mockClient);
			expect(result.success).toBe(false);
			expect(result.error).toContain("not a function");
		});

		it("should return InitResult with success false on error", async () => {
			const manager = new ACPClientManager();
			const mockClient = {
				initialize: vi.fn().mockRejectedValue(new Error("Connection failed")),
			} as unknown as ClientSideConnection;

			const result = await manager.initialize(mockClient);
			expect(result.success).toBe(false);
			expect(result.error).toBe("Connection failed");
		});
	});

	describe("newSession", () => {
		it("should return NewSessionResult with success false for invalid client", async () => {
			const manager = new ACPClientManager();
			const mockClient = {
				newSession: undefined,
			} as unknown as ClientSideConnection;

			const result = await manager.newSession(mockClient, { cwd: "/test/path" });
			expect(result.success).toBe(false);
			expect(result.error).toBe("Client does not support newSession");
		});
	});

	describe("prompt", () => {
		it("should return PromptResult with success false for invalid client", async () => {
			const manager = new ACPClientManager();
			const mockClient = {
				prompt: undefined,
			} as unknown as ClientSideConnection;

			const result = await manager.prompt(mockClient, {
				sessionId: "test-session",
				prompt: [{ type: "text", text: "Hello" }],
			});
			expect(result.success).toBe(false);
			expect(result.error).toBe("Client does not support prompt");
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
