import { describe, it, expect } from "vitest";
import {
	isTextPart,
	isToolCallPart,
	isToolResultPart,
	isDataPart,
	isCacheControlPart,
	isImagePart,
	ROLE,
	convertToOpenAI,
	ensureValidMessageOrder,
	buildRequest,
} from "./index";

describe("Type Guards", () => {
	describe("isTextPart", () => {
		it("should return true for valid text part", () => {
			expect(isTextPart({ value: "Hello" })).toBe(true);
			expect(isTextPart({ value: "" })).toBe(true);
		});

		it("should return false for null", () => {
			expect(isTextPart(null)).toBe(false);
		});

		it("should return false for non-object", () => {
			expect(isTextPart("string")).toBe(false);
			expect(isTextPart(123)).toBe(false);
		});

		it("should return false for object without value", () => {
			expect(isTextPart({})).toBe(false);
			expect(isTextPart({ type: "text" })).toBe(false);
		});

		it("should return false for object with non-string value", () => {
			expect(isTextPart({ value: 123 })).toBe(false);
			expect(isTextPart({ value: null })).toBe(false);
		});
	});

	describe("isToolCallPart", () => {
		it("should return true for valid tool call part", () => {
			expect(isToolCallPart({ callId: "123", name: "getWeather", input: { city: "NYC" } })).toBe(true);
		});

		it("should return false for null", () => {
			expect(isToolCallPart(null)).toBe(false);
		});

		it("should return false for missing properties", () => {
			expect(isToolCallPart({ callId: "123" })).toBe(false);
			expect(isToolCallPart({ name: "test" })).toBe(false);
			expect(isToolCallPart({ callId: "123", name: "test" })).toBe(false);
		});
	});

	describe("isToolResultPart", () => {
		it("should return true for valid tool result part", () => {
			expect(isToolResultPart({ callId: "123", content: ["result"] })).toBe(true);
			expect(isToolResultPart({ callId: "123", content: [] })).toBe(true);
		});

		it("should return false when name property is present", () => {
			// Tool result should not have name, tool call should
			expect(isToolResultPart({ callId: "123", name: "test", content: [] })).toBe(false);
		});

		it("should return false for missing properties", () => {
			expect(isToolResultPart({ callId: "123" })).toBe(false);
			expect(isToolResultPart({ content: [] })).toBe(false);
		});
	});

	describe("isDataPart", () => {
		it("should return true for valid data part", () => {
			expect(isDataPart({ mimeType: "image/png", data: new Uint8Array([1, 2, 3]) })).toBe(true);
		});

		it("should return false for missing properties", () => {
			expect(isDataPart({ mimeType: "image/png" })).toBe(false);
			expect(isDataPart({ data: new Uint8Array() })).toBe(false);
		});
	});

	describe("isCacheControlPart", () => {
		it("should return true for cache control data part", () => {
			expect(isCacheControlPart({ mimeType: "cache_control", data: new Uint8Array([0]) })).toBe(true);
		});

		it("should return false for non-cache-control", () => {
			expect(isCacheControlPart({ mimeType: "image/png", data: new Uint8Array() })).toBe(false);
		});
	});

	describe("isImagePart", () => {
		it("should return true for image data part", () => {
			expect(isImagePart({ mimeType: "image/png", data: new Uint8Array([1, 2]) })).toBe(true);
			expect(isImagePart({ mimeType: "image/jpeg", data: new Uint8Array() })).toBe(true);
			expect(isImagePart({ mimeType: "image/webp", data: new Uint8Array() })).toBe(true);
		});

		it("should return false for cache_control", () => {
			expect(isImagePart({ mimeType: "cache_control", data: new Uint8Array() })).toBe(false);
		});

		it("should return false for non-image mime types", () => {
			expect(isImagePart({ mimeType: "text/plain", data: new Uint8Array() })).toBe(false);
		});
	});
});

describe("ROLE constants", () => {
	it("should have correct role values", () => {
		expect(ROLE.User).toBe(1);
		expect(ROLE.Assistant).toBe(2);
		expect(ROLE.System).toBe(3);
	});
});

describe("convertToOpenAI", () => {
	it("should convert system message", () => {
		const input = [{ role: ROLE.System, content: [{ value: "You are a helpful assistant" }] }];
		const result = convertToOpenAI(input);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ role: "system", content: "You are a helpful assistant" });
	});

	it("should convert user message", () => {
		const input = [{ role: ROLE.User, content: [{ value: "Hello" }] }];
		const result = convertToOpenAI(input);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ role: "user", content: "Hello" });
	});

	it("should convert assistant message", () => {
		const input = [{ role: ROLE.Assistant, content: [{ value: "Hi there!" }] }];
		const result = convertToOpenAI(input);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ role: "assistant", content: "Hi there!" });
	});

	it("should convert message with tool calls", () => {
		const input = [
			{
				role: ROLE.Assistant,
				content: [{ callId: "123", name: "getWeather", input: { city: "NYC" } }],
			},
		];
		const result = convertToOpenAI(input);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			role: "assistant",
			content: undefined,
			tool_calls: [
				{
					id: "123",
					type: "function" as const,
					function: { name: "getWeather", arguments: '{"city":"NYC"}' },
				},
			],
		});
	});

	it("should convert message with tool results", () => {
		const input = [
			{
				role: ROLE.User,
				content: [{ callId: "123", content: [{ value: "The weather is sunny" }] }],
			},
		];
		const result = convertToOpenAI(input);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			role: "tool",
			tool_call_id: "123",
			content: "The weather is sunny",
		});
	});

	it("should handle empty content", () => {
		const input = [{ role: ROLE.User, content: [] }];
		const result = convertToOpenAI(input);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ role: "user", content: "" });
	});

	it("should handle undefined content", () => {
		const input = [{ role: ROLE.User, content: undefined }];
		const result = convertToOpenAI(input);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ role: "user", content: "" });
	});

	it("should handle multiple messages", () => {
		const input = [
			{ role: ROLE.System, content: [{ value: "You are a helpful assistant." }] },
			{ role: ROLE.User, content: [{ value: "What is 2+2?" }] },
		];
		const result = convertToOpenAI(input);
		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({ role: "system", content: "You are a helpful assistant." });
		expect(result[1]).toEqual({ role: "user", content: "What is 2+2?" });
	});
});

describe("ensureValidMessageOrder", () => {
	it("should create user message if empty", () => {
		const input: Array<{ role: "user" | "assistant"; content: Array<{ type: "text"; text: string }> }> = [];
		const result = ensureValidMessageOrder(input);
		expect(result).toHaveLength(1);
		expect(result[0].role).toBe("user");
		expect(result[0].content).toEqual([{ type: "text", text: "Hello" }]);
	});

	it("should prepend user message if starts with assistant", () => {
		const input: Array<{ role: "user" | "assistant"; content: Array<{ type: "text"; text: string }> }> = [
			{ role: "assistant", content: [{ type: "text", text: "Hi" }] },
		];
		const result = ensureValidMessageOrder(input);
		expect(result[0].role).toBe("user");
		expect(result[0].content).toEqual([{ type: "text", text: "(continue)" }]);
		expect(result[1].role).toBe("assistant");
	});

	it("should merge consecutive messages of same role", () => {
		const input: Array<{ role: "user" | "assistant"; content: Array<{ type: "text"; text: string }> }> = [
			{ role: "user", content: [{ type: "text", text: "Hello" }] },
			{ role: "user", content: [{ type: "text", text: " world" }] },
		];
		const result = ensureValidMessageOrder(input);
		expect(result).toHaveLength(1);
		expect(result[0].content).toHaveLength(2);
	});

	it("should alternate user and assistant correctly", () => {
		const input: Array<{ role: "user" | "assistant"; content: Array<{ type: "text"; text: string }> }> = [
			{ role: "user", content: [{ type: "text", text: "Hello" }] },
			{ role: "assistant", content: [{ type: "text", text: "Hi there!" }] },
			{ role: "user", content: [{ type: "text", text: "How are you?" }] },
		];
		const result = ensureValidMessageOrder(input);
		expect(result).toHaveLength(3);
		expect(result[0].role).toBe("user");
		expect(result[1].role).toBe("assistant");
		expect(result[2].role).toBe("user");
	});
});

describe("buildRequest", () => {
	it("should build OpenAI format request", () => {
		const messages = [{ role: ROLE.User, content: [{ value: "Hello" }] }];
		const result = buildRequest("openai", "gpt-4o", messages, undefined, 4096);

		expect(result.model).toBe("gpt-4o");
		expect(result.stream).toBe(true);
		expect(result.max_tokens).toBe(4096);
		expect(result.messages as unknown[]).toHaveLength(1);
	});

	it("should build Anthropic format request", () => {
		const messages = [{ role: ROLE.User, content: [{ value: "Hello" }] }];
		const result = buildRequest("anthropic", "claude-3-5-sonnet", messages, undefined, 4096);

		expect(result.model).toBe("claude-3-5-sonnet");
		expect(result.stream).toBe(true);
		expect(result.max_tokens).toBe(4096);
		expect(result.messages as unknown[]).toHaveLength(1);
	});

	it("should include tools in OpenAI format", () => {
		const messages = [{ role: ROLE.User, content: [{ value: "What is the weather?" }] }];
		const tools = [{ name: "getWeather", inputSchema: { type: "object", properties: { city: { type: "string" } } } }];
		const result = buildRequest("openai", "gpt-4o", messages, tools as readonly unknown[], 4096);

		expect(result.tools).toBeDefined();
		expect(result.tools as unknown[]).toHaveLength(1);
	});

	it("should include tools in Anthropic format", () => {
		const messages = [{ role: ROLE.User, content: [{ value: "What is the weather?" }] }];
		const tools = [{ name: "getWeather", inputSchema: { type: "object", properties: { city: { type: "string" } } } }];
		const result = buildRequest("anthropic", "claude-3-5-sonnet", messages, tools as readonly unknown[], 4096);

		expect(result.tools).toBeDefined();
		expect(result.tools as unknown[]).toHaveLength(1);
	});

	it("should include system message in Anthropic format", () => {
		const messages = [
			{ role: ROLE.System, content: [{ value: "You are a helpful assistant." }] },
			{ role: ROLE.User, content: [{ value: "Hello" }] },
		];
		const result = buildRequest("anthropic", "claude-3-5-sonnet", messages, undefined, 4096);

		expect(result.system).toBe("You are a helpful assistant.");
		expect(result.messages as unknown[]).toHaveLength(1);
	});
});
