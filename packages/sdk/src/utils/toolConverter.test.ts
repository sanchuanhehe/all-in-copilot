import { describe, it, expect } from "vitest";
import { sanitizeFunctionName, pruneUnknownSchemaKeywords, isIntegerLikePropertyName } from "./toolConverter";

describe("sanitizeFunctionName", () => {
	it('should return "tool" for non-string input', () => {
		expect(sanitizeFunctionName(null)).toBe("tool");
		expect(sanitizeFunctionName(undefined)).toBe("tool");
		expect(sanitizeFunctionName(123)).toBe("tool");
		expect(sanitizeFunctionName("")).toBe("tool");
	});

	it("should sanitize special characters", () => {
		// Dash (-) is allowed in the regex, so it stays
		expect(sanitizeFunctionName("my-function")).toBe("my-function");
		// Dot and space are replaced
		expect(sanitizeFunctionName("my.function")).toBe("my_function");
		expect(sanitizeFunctionName("my function")).toBe("my_function");
		expect(sanitizeFunctionName("my@function")).toBe("my_function");
	});

	it('should prepend "tool_" if name starts with number', () => {
		expect(sanitizeFunctionName("123abc")).toBe("tool_123abc");
		expect(sanitizeFunctionName("0test")).toBe("tool_0test");
	});

	it("should remove duplicate underscores", () => {
		expect(sanitizeFunctionName("my__function")).toBe("my_function");
		expect(sanitizeFunctionName("my___function")).toBe("my_function");
	});

	it("should limit length to 64 characters", () => {
		const longName = "a".repeat(100);
		const result = sanitizeFunctionName(longName);
		expect(result.length).toBe(64);
	});

	it("should handle valid names unchanged", () => {
		expect(sanitizeFunctionName("myFunction")).toBe("myFunction");
		expect(sanitizeFunctionName("my_function_123")).toBe("my_function_123");
		// Dash is allowed, so it stays as-is
		expect(sanitizeFunctionName("my-function")).toBe("my-function");
	});
});

describe("isIntegerLikePropertyName", () => {
	it("should return true for id-like names", () => {
		expect(isIntegerLikePropertyName("id")).toBe(true);
		expect(isIntegerLikePropertyName("userId")).toBe(true);
		expect(isIntegerLikePropertyName("product_id")).toBe(true);
	});

	it("should return true for count/limit names", () => {
		expect(isIntegerLikePropertyName("limit")).toBe(true);
		expect(isIntegerLikePropertyName("count")).toBe(true);
		expect(isIntegerLikePropertyName("offset")).toBe(true);
		expect(isIntegerLikePropertyName("pageSize")).toBe(true);
	});

	it("should return false for normal strings", () => {
		expect(isIntegerLikePropertyName("name")).toBe(false);
		expect(isIntegerLikePropertyName("description")).toBe(false);
		expect(isIntegerLikePropertyName("title")).toBe(false);
	});

	it("should return false for undefined or empty", () => {
		expect(isIntegerLikePropertyName(undefined)).toBe(false);
		expect(isIntegerLikePropertyName("")).toBe(false);
	});
});

describe("pruneUnknownSchemaKeywords", () => {
	it("should return empty object for non-object input", () => {
		expect(pruneUnknownSchemaKeywords(null)).toEqual({});
		expect(pruneUnknownSchemaKeywords("string")).toEqual({});
		expect(pruneUnknownSchemaKeywords(123)).toEqual({});
		expect(pruneUnknownSchemaKeywords([])).toEqual({});
	});

	it("should keep allowed keywords", () => {
		const schema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
			required: ["name"],
			description: "A test schema",
		};
		const result = pruneUnknownSchemaKeywords(schema);
		expect(result).toEqual(schema);
	});

	it("should remove unknown keywords", () => {
		const schema = {
			type: "object",
			unknownField: "should be removed",
			anotherUnknown: 123,
			$schema: "http://json-schema.org/draft-07/schema#",
		};
		const result = pruneUnknownSchemaKeywords(schema);
		expect(result).toEqual({ type: "object" });
	});

	it("should handle nested objects", () => {
		const schema = {
			type: "object",
			properties: {
				nested: {
					type: "object",
					unknownNested: "should be removed",
					properties: {
						value: { type: "string" },
					},
				},
			},
			unknownTopLevel: "removed",
		};
		const result = pruneUnknownSchemaKeywords(schema);
		// Note: pruneUnknownSchemaKeywords only prunes top-level, not nested objects
		expect(result).toEqual({
			type: "object",
			properties: {
				nested: {
					type: "object",
					unknownNested: "should be removed", // Not pruned because it's nested
					properties: {
						value: { type: "string" },
					},
				},
			},
		});
	});
});
