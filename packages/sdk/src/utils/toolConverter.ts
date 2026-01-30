/**
 * Tool conversion utilities
 * Convert between different tool formats
 */

import type { ToolDefinition } from "../core/types";

/**
 * Sanitize function name to be valid identifier
 */
export function sanitizeFunctionName(name: unknown): string {
	if (typeof name !== "string" || !name) {
		return "tool";
	}

	let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "_");

	// Must start with letter
	if (!/^[a-zA-Z]/.test(sanitized)) {
		sanitized = `tool_${sanitized}`;
	}

	// Remove duplicate underscores
	sanitized = sanitized.replace(/_+/g, "_");

	// Limit length
	return sanitized.slice(0, 64);
}

/**
 * Check if a property name suggests it should be an integer
 */
export function isIntegerLikePropertyName(propertyName: string | undefined): boolean {
	if (!propertyName) {
		return false;
	}

	const lowered = propertyName.toLowerCase();
	const integerMarkers = [
		"id",
		"limit",
		"count",
		"index",
		"size",
		"offset",
		"length",
		"results_limit",
		"maxresults",
		"debugsessionid",
		"cellid",
	];

	return integerMarkers.some((m) => lowered.includes(m)) || lowered.endsWith("_id");
}

/**
 * Remove unsupported JSON Schema keywords
 */
export function pruneUnknownSchemaKeywords(schema: unknown): Record<string, unknown> {
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
		return {};
	}

	const allow = new Set([
		"type",
		"properties",
		"required",
		"additionalProperties",
		"description",
		"enum",
		"default",
		"items",
		"minLength",
		"maxLength",
		"minimum",
		"maximum",
		"pattern",
		"format",
	]);

	const out: Record<string, unknown> = {};
	const input = schema as Record<string, unknown>;

	for (const [k, v] of Object.entries(input)) {
		if (allow.has(k)) {
			out[k] = v;
		}
	}

	return out;
}

/**
 * Process composite schema keywords (anyOf, oneOf, allOf)
 */
export function processCompositeSchemas(schema: unknown): Record<string, unknown> {
	if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
		return {};
	}

	const result = { ...(schema as Record<string, unknown>) };

	for (const composite of ["anyOf", "oneOf", "allOf"]) {
		const branch = result[composite] as unknown;
		if (Array.isArray(branch) && branch.length > 0) {
			// Find preferred branch (prefer string type for simple enums)
			let preferred: Record<string, unknown> | undefined;
			for (const b of branch) {
				if (b && typeof b === "object") {
					const obj = b as Record<string, unknown>;
					if (obj.type === "string" && obj.enum) {
						preferred = obj;
						break;
					}
				}
			}

			// Use first branch if no preferred found
			result[composite] = [preferred ?? branch[0]];
			break;
		}
	}

	return result;
}

/**
 * Sanitize a JSON schema for tool parameters
 */
export function sanitizeSchema(input: unknown, propName?: string): Record<string, unknown> {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return { type: "object", properties: {} };
	}

	let schema = processCompositeSchemas(input);
	schema = pruneUnknownSchemaKeywords(schema);

	let t = schema.type as string | undefined;
	if (t == null) {
		t = "object";
		schema.type = t;
	}

	// Convert number to integer for likely integer properties
	if (t === "number" && propName && isIntegerLikePropertyName(propName)) {
		schema.type = "integer";
		t = "integer";
	}

	// Recursively sanitize nested objects
	if (t === "object" && schema.properties) {
		const sanitizedProps: Record<string, unknown> = {};
		const props = schema.properties as Record<string, unknown>;

		for (const [key, value] of Object.entries(props)) {
			sanitizedProps[key] = sanitizeSchema(value, key);
		}

		schema.properties = sanitizedProps;
	}

	return schema;
}

/**
 * Convert VS Code tools to OpenAI function definitions
 */
export function convertTools(tools: readonly unknown[]): ToolDefinition[] {
	if (!tools || tools.length === 0) {
		return [];
	}

	return tools.map((tool) => {
		const t = tool as Record<string, unknown>;

		if (t.type === "function") {
			const func = t.function as Record<string, unknown>;
			const name = sanitizeFunctionName(func.name);
			const description = func.description as string | undefined;
			const parameters = func.parameters as unknown;

			const sanitizedParams = sanitizeSchema(parameters);

			return {
				type: "function",
				function: {
					name,
					description,
					parameters: sanitizedParams,
				},
			};
		}

		return {
			type: "function",
			function: {
				name: "unknown_tool",
				description: "Unknown tool type",
				parameters: { type: "object", properties: {} },
			},
		};
	});
}

/**
 * Create tool call result message
 */
export function createToolResult(
	toolCallId: string,
	toolName: string,
	result: string
): { role: "tool"; content: string; tool_call_id: string; name?: string } {
	return {
		role: "tool",
		content: result,
		tool_call_id: toolCallId,
		name: toolName,
	};
}

/**
 * Parse tool arguments from string
 */
export function parseToolArguments<T = Record<string, unknown>>(args: string): T | undefined {
	try {
		return JSON.parse(args) as T;
	} catch {
		return undefined;
	}
}

/**
 * Convert VS Code tools to OpenAI format
 * VS Code tool format: { name, description?, inputSchema }
 * OpenAI tool format: { type: "function", function: { name, description?, parameters } }
 */
export function convertToolsToOpenAI(
	tools: readonly unknown[] | undefined
):
	| { type: "function"; function: { name: string; description?: string; parameters?: Record<string, unknown> } }[]
	| undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}

	return tools.map((tool: unknown) => {
		const t = tool as { name: string; description?: string; inputSchema?: Record<string, unknown> };
		return {
			type: "function" as const,
			function: {
				name: sanitizeFunctionName(t.name),
				description: t.description,
				parameters: t.inputSchema,
			},
		};
	});
}

/**
 * Convert VS Code tools to Anthropic format
 * VS Code tool format: { name, description?, inputSchema }
 * Anthropic tool format: { name, description?, input_schema }
 */
export function convertToolsToAnthropic(
	tools: readonly unknown[] | undefined
): { name: string; description?: string; input_schema: Record<string, unknown> }[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}

	return tools.map((tool: unknown) => {
		const t = tool as { name: string; description?: string; inputSchema?: Record<string, unknown> };
		const result: { name: string; description?: string; input_schema: Record<string, unknown> } = {
			name: sanitizeFunctionName(t.name),
			input_schema: t.inputSchema || { type: "object", properties: {} },
		};
		// Only add description if it exists and is non-empty
		if (t.description && t.description.trim()) {
			result.description = t.description;
		}
		return result;
	});
}

/**
 * Format tool arguments to string
 */
export function formatToolArguments(args: Record<string, unknown>): string {
	return JSON.stringify(args, null, 2);
}
