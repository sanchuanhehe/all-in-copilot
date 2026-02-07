/**
 * Unit tests for sendChatRequest and sendChatRequestWithProvider
 *
 * Key regression test: ensure signal parameter must be a proper AbortSignal,
 * not a vscode.CancellationToken (which lacks addEventListener).
 * See: https://github.com/sanchuanhehe/all-in-copilot - CancellationToken bug fix
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	sendChatRequest,
	sendChatRequestWithProvider,
	type SendChatRequestConfig,
	type ChatResponseCallbacks,
} from "./sendChatRequest";

// ============================================================================
// Helpers
// ============================================================================

function createMockStreamResponse(chunks: string[]): Response {
	const stream = new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(new TextEncoder().encode(chunk));
			}
			controller.close();
		},
	});
	return {
		ok: true,
		status: 200,
		statusText: "OK",
		body: stream,
		text: () => Promise.resolve(""),
	} as unknown as Response;
}

function createOpenAIConfig(overrides?: Partial<SendChatRequestConfig>): SendChatRequestConfig {
	return {
		baseUrl: "https://api.example.com/v1/chat/completions",
		apiKey: "test-api-key",
		apiMode: "openai",
		...overrides,
	};
}

function createAnthropicConfig(overrides?: Partial<SendChatRequestConfig>): SendChatRequestConfig {
	return {
		baseUrl: "https://api.example.com/v1/messages",
		apiKey: "test-api-key",
		apiMode: "anthropic",
		...overrides,
	};
}

function createCallbacks(): ChatResponseCallbacks & {
	onText: ReturnType<typeof vi.fn>;
	onToolCall: ReturnType<typeof vi.fn>;
} {
	return {
		onText: vi.fn(),
		onToolCall: vi.fn(),
	};
}

const simpleMessages = [{ role: 1, content: [{ value: "Hello" }] }] as const;

// ============================================================================
// Tests
// ============================================================================

describe("sendChatRequest", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// --------------------------------------------------------------------------
	// REGRESSION: CancellationToken vs AbortSignal
	// --------------------------------------------------------------------------
	describe("signal parameter type safety (regression)", () => {
		it("should work correctly with a proper AbortSignal", async () => {
			const openAIChunks = ['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', "data: [DONE]\n\n"];
			fetchSpy.mockResolvedValueOnce(createMockStreamResponse(openAIChunks));

			const callbacks = createCallbacks();
			const abortController = new AbortController();

			await sendChatRequest(
				createOpenAIConfig(),
				"test-model",
				simpleMessages,
				undefined,
				1024,
				callbacks,
				abortController.signal
			);

			expect(callbacks.onText).toHaveBeenCalledWith("Hi");
		});

		it("should throw if signal lacks addEventListener (simulates CancellationToken)", async () => {
			// This simulates passing a vscode.CancellationToken instead of AbortSignal.
			// CancellationToken has onCancellationRequested() but NOT addEventListener().
			const fakeCancellationToken = {
				isCancellationRequested: false,
				onCancellationRequested: vi.fn(),
			};

			const callbacks = createCallbacks();

			// The call should fail because the fake token doesn't have addEventListener
			await expect(
				sendChatRequest(
					createOpenAIConfig(),
					"test-model",
					simpleMessages,
					undefined,
					1024,
					callbacks,
					// @ts-expect-error - intentionally passing wrong type to test runtime behavior
					fakeCancellationToken
				)
			).rejects.toThrow();
		});

		it("should work without signal (undefined)", async () => {
			const openAIChunks = ['data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n', "data: [DONE]\n\n"];
			fetchSpy.mockResolvedValueOnce(createMockStreamResponse(openAIChunks));

			const callbacks = createCallbacks();

			// No signal passed - should work fine
			await sendChatRequest(createOpenAIConfig(), "test-model", simpleMessages, undefined, 1024, callbacks);

			expect(callbacks.onText).toHaveBeenCalledWith("Hello");
		});

		it("should properly convert CancellationToken pattern: AbortController + onCancellationRequested", async () => {
			// This tests the CORRECT pattern used in the fixed templates:
			//   const abortController = new AbortController();
			//   token.onCancellationRequested(() => abortController.abort());
			//   sendChatRequest(..., abortController.signal);

			const openAIChunks = ['data: {"choices":[{"delta":{"content":"test"}}]}\n\n', "data: [DONE]\n\n"];
			fetchSpy.mockResolvedValueOnce(createMockStreamResponse(openAIChunks));

			const callbacks = createCallbacks();

			// Simulate the correct conversion pattern
			const abortController = new AbortController();
			const fakeCancellationToken = {
				isCancellationRequested: false,
				onCancellationRequested: (cb: () => void) => {
					// In a real scenario, VS Code would call this when user cancels
					// Store callback for later verification
					fakeCancellationToken._callback = cb;
				},
				_callback: null as (() => void) | null,
			};

			fakeCancellationToken.onCancellationRequested(() => abortController.abort());

			await sendChatRequest(
				createOpenAIConfig(),
				"test-model",
				simpleMessages,
				undefined,
				1024,
				callbacks,
				abortController.signal
			);

			expect(callbacks.onText).toHaveBeenCalledWith("test");
		});
	});

	// --------------------------------------------------------------------------
	// Abort / Cancellation
	// --------------------------------------------------------------------------
	describe("abort handling", () => {
		it("should abort fetch when AbortSignal is triggered", async () => {
			const abortController = new AbortController();
			// Abort before fetch completes
			fetchSpy.mockImplementationOnce(async (_url: string, init: RequestInit) => {
				// Verify the signal is passed through to fetch
				expect(init.signal).toBeInstanceOf(AbortSignal);
				abortController.abort();
				throw new DOMException("The operation was aborted.", "AbortError");
			});

			const callbacks = createCallbacks();

			await expect(
				sendChatRequest(
					createOpenAIConfig(),
					"test-model",
					simpleMessages,
					undefined,
					1024,
					callbacks,
					abortController.signal
				)
			).rejects.toThrow();
		});

		it("should clean up event listeners after completion", async () => {
			const openAIChunks = ['data: {"choices":[{"delta":{"content":"done"}}]}\n\n', "data: [DONE]\n\n"];
			fetchSpy.mockResolvedValueOnce(createMockStreamResponse(openAIChunks));

			const abortController = new AbortController();
			const addSpy = vi.spyOn(abortController.signal, "addEventListener");
			const removeSpy = vi.spyOn(abortController.signal, "removeEventListener");

			const callbacks = createCallbacks();

			await sendChatRequest(
				createOpenAIConfig(),
				"test-model",
				simpleMessages,
				undefined,
				1024,
				callbacks,
				abortController.signal
			);

			expect(addSpy).toHaveBeenCalledWith("abort", expect.any(Function));
			expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
		});
	});

	// --------------------------------------------------------------------------
	// HTTP request correctness
	// --------------------------------------------------------------------------
	describe("request building", () => {
		it("should use Bearer auth for OpenAI mode", async () => {
			const openAIChunks = ['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', "data: [DONE]\n\n"];
			fetchSpy.mockResolvedValueOnce(createMockStreamResponse(openAIChunks));

			await sendChatRequest(
				createOpenAIConfig({ apiKey: "sk-test-123" }),
				"gpt-4",
				simpleMessages,
				undefined,
				2048,
				createCallbacks()
			);

			expect(fetchSpy).toHaveBeenCalledOnce();
			const [url, options] = fetchSpy.mock.calls[0];
			expect(url).toBe("https://api.example.com/v1/chat/completions");
			expect(options.headers["Authorization"]).toBe("Bearer sk-test-123");
			expect(options.headers["Content-Type"]).toBe("application/json");
		});

		it("should use x-api-key auth for Anthropic mode", async () => {
			const anthropicChunks = [
				'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n',
				'event: message_stop\ndata: {"type":"message_stop"}\n\n',
			];
			fetchSpy.mockResolvedValueOnce(createMockStreamResponse(anthropicChunks));

			await sendChatRequest(
				createAnthropicConfig({ apiKey: "sk-ant-test" }),
				"claude-3",
				simpleMessages,
				undefined,
				4096,
				createCallbacks()
			);

			expect(fetchSpy).toHaveBeenCalledOnce();
			const [, options] = fetchSpy.mock.calls[0];
			expect(options.headers["x-api-key"]).toBe("sk-ant-test");
			expect(options.headers["anthropic-version"]).toBe("2023-06-01");
			expect(options.headers["Authorization"]).toBeUndefined();
		});

		it("should include custom headers", async () => {
			const openAIChunks = ['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', "data: [DONE]\n\n"];
			fetchSpy.mockResolvedValueOnce(createMockStreamResponse(openAIChunks));

			await sendChatRequest(
				createOpenAIConfig({ headers: { "X-Custom": "value" } }),
				"test-model",
				simpleMessages,
				undefined,
				1024,
				createCallbacks()
			);

			const [, options] = fetchSpy.mock.calls[0];
			expect(options.headers["X-Custom"]).toBe("value");
		});
	});

	// --------------------------------------------------------------------------
	// Error handling
	// --------------------------------------------------------------------------
	describe("error handling", () => {
		it("should throw on non-ok response", async () => {
			fetchSpy.mockResolvedValueOnce({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
				text: () => Promise.resolve("Invalid API key"),
			});

			await expect(
				sendChatRequest(createOpenAIConfig(), "test-model", simpleMessages, undefined, 1024, createCallbacks())
			).rejects.toThrow("API request failed: 401 Unauthorized");
		});

		it("should include response body in error message", async () => {
			fetchSpy.mockResolvedValueOnce({
				ok: false,
				status: 429,
				statusText: "Too Many Requests",
				text: () => Promise.resolve("Rate limit exceeded"),
			});

			await expect(
				sendChatRequest(createOpenAIConfig(), "test-model", simpleMessages, undefined, 1024, createCallbacks())
			).rejects.toThrow("Rate limit exceeded");
		});
	});
});

describe("sendChatRequestWithProvider", () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should wrap errors with provider name", async () => {
		fetchSpy.mockResolvedValueOnce({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
			text: () => Promise.resolve("Server error"),
		});

		await expect(
			sendChatRequestWithProvider(
				createOpenAIConfig(),
				"MiniMax",
				"test-model",
				simpleMessages,
				undefined,
				1024,
				createCallbacks()
			)
		).rejects.toThrow("Failed to connect to MiniMax");
	});

	it("should convert AbortError to cancellation message", async () => {
		fetchSpy.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

		await expect(
			sendChatRequestWithProvider(
				createOpenAIConfig(),
				"TestProvider",
				"test-model",
				simpleMessages,
				undefined,
				1024,
				createCallbacks()
			)
		).rejects.toThrow("Request was cancelled");
	});

	it("should work with proper AbortSignal from AbortController", async () => {
		const openAIChunks = ['data: {"choices":[{"delta":{"content":"response"}}]}\n\n', "data: [DONE]\n\n"];
		fetchSpy.mockResolvedValueOnce(createMockStreamResponse(openAIChunks));

		const callbacks = createCallbacks();
		const abortController = new AbortController();

		await sendChatRequestWithProvider(
			createOpenAIConfig(),
			"MiniMax",
			"test-model",
			simpleMessages,
			undefined,
			1024,
			callbacks,
			abortController.signal
		);

		expect(callbacks.onText).toHaveBeenCalledWith("response");
	});

	it("should fail when CancellationToken is passed instead of AbortSignal (regression)", async () => {
		// This is the exact scenario that caused the original bug:
		// "s?.addEventListener is not a function"
		const fakeCancellationToken = {
			isCancellationRequested: false,
			onCancellationRequested: vi.fn(),
		};

		await expect(
			sendChatRequestWithProvider(
				createOpenAIConfig(),
				"MiniMax",
				"test-model",
				simpleMessages,
				undefined,
				1024,
				createCallbacks(),
				// @ts-expect-error - testing runtime behavior with wrong type
				fakeCancellationToken
			)
		).rejects.toThrow("Failed to connect to MiniMax");
	});
});
