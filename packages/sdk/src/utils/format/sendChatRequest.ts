/**
 * Send Chat Request
 * Complete HTTP request and streaming response handling for LLM APIs
 */

import type { VsCodeMessage } from "./types";
import { buildRequest, processOpenAIStream, processAnthropicStream } from "./providerHelpers";

/**
 * Configuration for sending chat requests
 */
export interface SendChatRequestConfig {
	/** Base URL for the API */
	baseUrl: string;
	/** API key for authentication */
	apiKey: string;
	/** API mode - determines auth header and response format */
	apiMode: "openai" | "anthropic";
	/** Custom headers to include in requests */
	headers?: Record<string, string>;
}

/**
 * Callbacks for handling streaming response
 */
export interface ChatResponseCallbacks {
	/** Called for each text chunk */
	onText: (text: string) => void;
	/** Called when a tool call is complete */
	onToolCall: (callId: string, name: string, args: Record<string, unknown>) => void;
}

/**
 * Send a chat request and process the streaming response
 *
 * This function encapsulates the complete HTTP request/response flow:
 * - Builds the request body using buildRequest()
 * - Sends the request with appropriate authentication headers
 * - Processes the streaming response using the appropriate stream processor
 *
 * @param config - Request configuration including URL, auth, and API mode
 * @param model - Model ID to use
 * @param messages - Chat messages to send
 * @param tools - Optional tools/function definitions
 * @param maxTokens - Maximum tokens for response
 * @param callbacks - Callbacks for handling streaming response
 * @param signal - Optional AbortSignal for cancellation
 * @throws Error if request fails or is cancelled
 */
export async function sendChatRequest(
	config: SendChatRequestConfig,
	model: string,
	messages: readonly VsCodeMessage[],
	tools: readonly unknown[] | undefined,
	maxTokens: number,
	callbacks: ChatResponseCallbacks,
	signal?: AbortSignal
): Promise<void> {
	// Build request body
	const requestBody = buildRequest(config.apiMode, model, messages, tools, maxTokens);

	// Set up abort controller
	const controller = new AbortController();
	const abortHandler = () => controller.abort();
	signal?.addEventListener("abort", abortHandler);

	try {
		// Send request
		const response = await fetch(config.baseUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				// Use appropriate auth header based on API mode
				...(config.apiMode === "anthropic"
					? {
							"x-api-key": config.apiKey,
							"anthropic-version": "2023-06-01",
						}
					: { Authorization: `Bearer ${config.apiKey}` }),
				...config.headers,
			},
			body: JSON.stringify(requestBody),
			signal: controller.signal,
		});

		// Check response status
		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new Error(`API request failed: ${response.status} ${response.statusText}${text ? `\n${text}` : ""}`);
		}

		// Select appropriate stream processor
		const processStream = config.apiMode === "anthropic" ? processAnthropicStream : processOpenAIStream;

		// Process streaming response
		await processStream(response, callbacks.onText, callbacks.onToolCall, controller.signal);
	} finally {
		// Cleanup
		signal?.removeEventListener("abort", abortHandler);
		if (!signal?.aborted) {
			controller.abort();
		}
	}
}

/**
 * Alternative version that throws errors with provider context
 */
export async function sendChatRequestWithProvider(
	config: SendChatRequestConfig,
	providerName: string,
	model: string,
	messages: readonly VsCodeMessage[],
	tools: readonly unknown[] | undefined,
	maxTokens: number,
	callbacks: ChatResponseCallbacks,
	signal?: AbortSignal
): Promise<void> {
	try {
		await sendChatRequest(config, model, messages, tools, maxTokens, callbacks, signal);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Unknown error";
		if (error instanceof DOMException && error.name === "AbortError") {
			throw new Error("Request was cancelled");
		}
		throw new Error(`Failed to connect to ${providerName}: ${errorMessage}`);
	}
}
