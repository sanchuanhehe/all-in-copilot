/**
 * Streaming Utilities
 * Process streaming responses from OpenAI and Anthropic APIs
 */

// ============================================================================
// OpenAI Streaming
// ============================================================================

/**
 * Buffered tool call for accumulating streaming chunks
 */
interface ToolCallBuffer {
	id: string;
	name: string;
	arguments: string;
}

/**
 * Process OpenAI streaming response
 */
export async function processOpenAIStream(
	response: Response,
	onText: (text: string) => void,
	onToolCall: (callId: string, name: string, args: Record<string, unknown>) => void,
	signal?: AbortSignal
): Promise<void> {
	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error("No response body");
	}

	const decoder = new TextDecoder();
	let buffer = "";
	const toolCallBuffers = new Map<number, ToolCallBuffer>();

	const flushToolCalls = () => {
		for (const [, tc] of toolCallBuffers) {
			try {
				const args = tc.arguments ? JSON.parse(tc.arguments) : {};
				onToolCall(tc.id, tc.name, args);
			} catch {
				console.warn("Failed to parse tool arguments");
				onToolCall(tc.id, tc.name, {});
			}
		}
		toolCallBuffers.clear();
	};

	try {
		while (true) {
			if (signal?.aborted) {
				break;
			}

			const { done, value } = await reader.read();
			if (done) {
				flushToolCalls();
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed || !trimmed.startsWith("data:")) {
					continue;
				}

				const data = trimmed.slice(5).trim();
				if (data === "[DONE]") {
					flushToolCalls();
					continue;
				}

				try {
					const chunk = JSON.parse(data);
					const delta = chunk.choices?.[0]?.delta;

					if (delta?.content) {
						onText(delta.content);
					}

					if (delta?.tool_calls) {
						for (const tc of delta.tool_calls) {
							const index = tc.index ?? 0;
							if (!toolCallBuffers.has(index)) {
								toolCallBuffers.set(index, {
									id: tc.id || "",
									name: tc.function?.name || "",
									arguments: "",
								});
							}
							const buf = toolCallBuffers.get(index)!;
							if (tc.id) {
								buf.id = tc.id;
							}
							if (tc.function?.name) {
								buf.name = tc.function.name;
							}
							if (tc.function?.arguments) {
								buf.arguments += tc.function.arguments;
							}
						}
					}
				} catch {
					// Skip invalid JSON
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

// ============================================================================
// Anthropic Streaming
// ============================================================================

/**
 * Process Anthropic streaming response
 */
export async function processAnthropicStream(
	response: Response,
	onText: (text: string) => void,
	onToolCall: (callId: string, name: string, args: Record<string, unknown>) => void,
	signal?: AbortSignal
): Promise<void> {
	const reader = response.body?.getReader();
	if (!reader) {
		throw new Error("No response body");
	}

	const decoder = new TextDecoder();
	let buffer = "";
	let currentToolId = "";
	let currentToolName = "";
	let currentToolArgs = "";

	const flushToolCall = () => {
		if (currentToolId && currentToolName) {
			try {
				const args = currentToolArgs ? JSON.parse(currentToolArgs) : {};
				onToolCall(currentToolId, currentToolName, args);
			} catch {
				console.warn("Failed to parse tool arguments");
				onToolCall(currentToolId, currentToolName, {});
			}
			currentToolId = "";
			currentToolName = "";
			currentToolArgs = "";
		}
	};

	try {
		while (true) {
			if (signal?.aborted) {
				break;
			}

			const { done, value } = await reader.read();
			if (done) {
				flushToolCall();
				break;
			}

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) {
					continue;
				}

				if (trimmed.startsWith("event:")) {
					const event = trimmed.slice(6).trim();
					if (event === "content_block_stop") {
						flushToolCall();
					}
					continue;
				}

				if (!trimmed.startsWith("data:")) {
					continue;
				}
				const data = trimmed.slice(5).trim();

				try {
					const chunk = JSON.parse(data);

					if (chunk.type === "content_block_start") {
						if (chunk.content_block?.type === "tool_use") {
							currentToolId = chunk.content_block.id;
							currentToolName = chunk.content_block.name;
							currentToolArgs = "";
						}
					} else if (chunk.type === "content_block_delta") {
						const delta = chunk.delta;
						if (delta?.type === "text_delta" && delta.text) {
							onText(delta.text);
						} else if (delta?.type === "input_json_delta" && delta.partial_json) {
							currentToolArgs += delta.partial_json;
						}
					}
				} catch {
					// Skip invalid JSON
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}
