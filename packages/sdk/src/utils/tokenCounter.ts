/**
 * Token counting utilities
 * Simple token estimation without external dependencies
 */

/**
 * Estimate token count for a text string
 * Uses simple character-based approximation: 1 token ≈ 4 characters
 */
export function estimateTokens(text: string): number {
	if (!text || typeof text !== "string") {
		return 0;
	}
	return Math.ceil(text.length / 4);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value) ?? "";
	} catch {
		return "";
	}
}

function estimatePartTokens(part: unknown): number {
	if (typeof part === "string") {
		return estimateTokens(part);
	}

	if (!isRecord(part)) {
		return 0;
	}

	// VS Code text part: { value: string }
	if (typeof part.value === "string") {
		return estimateTokens(part.value);
	}

	// OpenAI text part: { type: "text", text: string }
	if (part.type === "text" && typeof part.text === "string") {
		return estimateTokens(part.text);
	}

	// Tool call part: include tool name and input payload
	if (typeof part.name === "string" && "input" in part) {
		return estimateTokens(part.name) + estimateTokens(safeStringify(part.input));
	}

	// Tool result part: recurse into content
	if ("content" in part) {
		return estimateUnknownTokens(part.content);
	}

	// Binary/data parts (e.g. image bytes) are intentionally not expanded
	if ("mimeType" in part && "data" in part) {
		return typeof part.mimeType === "string" ? estimateTokens(part.mimeType) : 0;
	}

	return estimateTokens(safeStringify(part));
}

/**
 * Estimate tokens for unknown input (string, VS Code message, message parts, arrays)
 */
export function estimateUnknownTokens(input: unknown): number {
	if (typeof input === "string") {
		return estimateTokens(input);
	}

	if (Array.isArray(input)) {
		return input.reduce((sum, item) => sum + estimatePartTokens(item), 0);
	}

	if (!isRecord(input)) {
		return 0;
	}

	let total = 0;

	if (typeof input.role === "string") {
		total += estimateTokens(input.role) + 1;
	}

	if (typeof input.name === "string") {
		total += estimateTokens(input.name) + 1;
	}

	if ("content" in input) {
		total += estimateUnknownTokens(input.content);
	}

	if ("input" in input && !("content" in input)) {
		total += estimateUnknownTokens(input.input);
	}

	if (total > 0) {
		return total;
	}

	return estimateTokens(safeStringify(input));
}

/**
 * Estimate token count for messages
 * Counts content, role, and name overhead
 */
export function estimateMessagesTokens(
	messages: Array<{
		role: string;
		content: string | Array<{ type: string; text?: string }>;
		name?: string;
	}>
): number {
	let total = 0;

	for (const message of messages) {
		const content =
			typeof message.content === "string"
				? message.content
				: message.content
						.filter((p) => p.type === "text" && p.text)
						.map((p) => (p as { text: string }).text)
						.join("");

		total += estimateTokens(content);

		// Count role overhead
		total += estimateTokens(message.role);
		total += 1; // Role delimiter

		// Count name if present
		if (message.name) {
			total += estimateTokens(message.name);
			total += 1; // Name delimiter
		}
	}

	return total;
}

/**
 * Estimate token count for tool definitions
 */
export function estimateToolTokens(
	tools: Array<{
		type: string;
		function: {
			name: string;
			description?: string;
			parameters?: object;
		};
	}>
): number {
	if (!tools || tools.length === 0) {
		return 0;
	}

	try {
		return estimateTokens(JSON.stringify(tools));
	} catch {
		return 0;
	}
}

/**
 * Calculate remaining context space
 */
export function calculateRemainingContext(
	totalContextLength: number,
	messages: Array<{
		role: string;
		content: string | Array<{ type: string; text?: string }>;
		name?: string;
	}>,
	tools:
		| Array<{
				type: string;
				function: {
					name: string;
					description?: string;
					parameters?: object;
				};
		  }>
		| undefined,
	reservedOutputTokens: number
): number {
	const messageTokens = estimateMessagesTokens(messages);
	const toolTokens = estimateToolTokens(tools ?? []);
	const reserved = reservedOutputTokens;

	return Math.max(0, totalContextLength - messageTokens - toolTokens - reserved);
}
