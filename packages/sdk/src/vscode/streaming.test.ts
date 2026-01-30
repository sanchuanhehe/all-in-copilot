/**
 * Integration tests for streaming processing functions
 */

import { describe, it, expect, vi } from "vitest";
import { processOpenAIStream, processAnthropicStream } from "./providerHelpers";

// Helper to create a mock ReadableStream
function createMockReadableStream(chunks: string[]): ReadableStream {
	return new ReadableStream({
		start(controller) {
			chunks.forEach((chunk) => {
				controller.enqueue(new TextEncoder().encode(chunk));
			});
			controller.close();
		},
		cancel() {},
	});
}

// Helper to create a mock Response with a body
function createMockResponse(stream: ReadableStream): Response {
	return {
		ok: true,
		status: 200,
		body: stream,
	} as Response;
}

describe("processOpenAIStream", () => {
	it("should process text chunks correctly", async () => {
		const chunks = [
			'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
			'data: {"choices":[{"delta":{"content":" World"}}]}\n',
			"data: [DONE]\n",
		];

		const response = createMockResponse(createMockReadableStream(chunks));
		const onText = vi.fn();
		const onToolCall = vi.fn();

		await processOpenAIStream(response, onText, onToolCall);

		expect(onText).toHaveBeenCalledWith("Hello");
		expect(onText).toHaveBeenCalledWith(" World");
		expect(onToolCall).not.toHaveBeenCalled();
	});

	it("should process tool calls correctly", async () => {
		const chunks = [
			'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","index":0,"type":"function","function":{"name":"get_weather","arguments":"{\\"location\\":\\"Beijing\\"}"}}]}}]}\n',
			"data: [DONE]\n",
		];

		const response = createMockResponse(createMockReadableStream(chunks));
		const onText = vi.fn();
		const onToolCall = vi.fn();

		await processOpenAIStream(response, onText, onToolCall);

		expect(onToolCall).toHaveBeenCalledWith("call_1", "get_weather", { location: "Beijing" });
		expect(onText).not.toHaveBeenCalled();
	});

	it("should handle mixed text and tool calls", async () => {
		const chunks = [
			'data: {"choices":[{"delta":{"content":"Let me check"}}]}\n',
			'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","index":0,"type":"function","function":{"name":"get_weather","arguments":"{}"}}]}}]}\n',
			"data: [DONE]\n",
		];

		const response = createMockResponse(createMockReadableStream(chunks));
		const onText = vi.fn();
		const onToolCall = vi.fn();

		await processOpenAIStream(response, onText, onToolCall);

		expect(onText).toHaveBeenCalledWith("Let me check");
		expect(onToolCall).toHaveBeenCalledWith("call_1", "get_weather", {});
	});

	it("should throw error when response has no body", async () => {
		const response = { ok: true, status: 200, body: null } as Response;
		const onText = vi.fn();
		const onToolCall = vi.fn();

		await expect(processOpenAIStream(response, onText, onToolCall)).rejects.toThrow("No response body");
	});

	it("should handle empty stream", async () => {
		const chunks: string[] = [];
		const response = createMockResponse(createMockReadableStream(chunks));
		const onText = vi.fn();
		const onToolCall = vi.fn();

		await processOpenAIStream(response, onText, onToolCall);

		expect(onText).not.toHaveBeenCalled();
		expect(onToolCall).not.toHaveBeenCalled();
	});
});

describe("processAnthropicStream", () => {
	it("should process text chunks correctly", async () => {
		const chunks = [
			'event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"text","text":"Hello"}}\n',
			'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" World"}}\n',
			'event: content_block_stop\ndata: {"type":"content_block_stop"}\n',
			'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n',
		];

		const response = createMockResponse(createMockReadableStream(chunks));
		const onText = vi.fn();
		const onToolCall = vi.fn();

		await processAnthropicStream(response, onText, onToolCall);

		// Only processes delta text, not initial content
		expect(onText).toHaveBeenCalledWith(" World");
		expect(onToolCall).not.toHaveBeenCalled();
	});

	it("should process tool use blocks correctly", async () => {
		const chunks = [
			'event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"tool_use","id":"tool_123","name":"calculator"}}\n',
			'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"result\\":2}"}}\n',
			'event: content_block_stop\ndata: {"type":"content_block_stop"}\n',
		];

		const response = createMockResponse(createMockReadableStream(chunks));
		const onText = vi.fn();
		const onToolCall = vi.fn();

		await processAnthropicStream(response, onText, onToolCall);

		expect(onToolCall).toHaveBeenCalledWith("tool_123", "calculator", { result: 2 });
		expect(onText).not.toHaveBeenCalled();
	});

	it("should handle empty stream", async () => {
		const chunks: string[] = [];
		const response = createMockResponse(createMockReadableStream(chunks));
		const onText = vi.fn();
		const onToolCall = vi.fn();

		await processAnthropicStream(response, onText, onToolCall);

		expect(onText).not.toHaveBeenCalled();
		expect(onToolCall).not.toHaveBeenCalled();
	});

	it("should handle mixed content", async () => {
		const chunks = [
			'event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"text","text":"The answer is "}}\n',
			'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"42"}}\n',
			'event: content_block_stop\ndata: {"type":"content_block_stop"}\n',
			'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n',
		];

		const response = createMockResponse(createMockReadableStream(chunks));
		const onText = vi.fn();
		const onToolCall = vi.fn();

		await processAnthropicStream(response, onText, onToolCall);

		// Only delta text is processed
		expect(onText).toHaveBeenCalledWith("42");
	});

	it("should skip unknown events", async () => {
		const chunks = [
			"event: ping\ndata: {}\n",
			'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n',
			'event: content_block_stop\ndata: {"type":"content_block_stop"}\n',
			'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n',
		];

		const response = createMockResponse(createMockReadableStream(chunks));
		const onText = vi.fn();
		const onToolCall = vi.fn();

		await processAnthropicStream(response, onText, onToolCall);

		expect(onText).toHaveBeenCalledWith("Hello");
	});

	it("should handle malformed JSON gracefully", async () => {
		const chunks = [
			"event: content_block_delta\ndata: {invalid json\n",
			'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n',
			'event: content_block_stop\ndata: {"type":"content_block_stop"}\n',
			'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n',
		];

		const response = createMockResponse(createMockReadableStream(chunks));
		const onText = vi.fn();
		const onToolCall = vi.fn();

		// Should not throw
		await processAnthropicStream(response, onText, onToolCall);

		expect(onText).toHaveBeenCalledWith("Hello");
	});
});
