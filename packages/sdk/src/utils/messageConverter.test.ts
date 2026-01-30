import { describe, it, expect } from "vitest";
import { mapVsCodeRole, convertVsCodeContent, ROLE } from "./messageConverter";

describe("mapVsCodeRole", () => {
	it("should map system role (1)", () => {
		expect(mapVsCodeRole(1)).toBe("system");
	});

	it("should map assistant role (3)", () => {
		expect(mapVsCodeRole(3)).toBe("assistant");
	});

	it("should map user role (2 and default)", () => {
		expect(mapVsCodeRole(2)).toBe("user");
		expect(mapVsCodeRole(0)).toBe("user");
		expect(mapVsCodeRole(4)).toBe("user");
	});
});

describe("convertVsCodeContent", () => {
	it("should convert text parts to string", () => {
		const input = [
			{ type: "text", text: "Hello" },
			{ type: "text", text: " World" },
		] as const;
		expect(convertVsCodeContent(input)).toBe("Hello World");
	});

	it("should preserve image_url parts as array", () => {
		const input = [
			{ type: "text", text: "Check this image:" },
			{ type: "image_url", image_url: { url: "https://example.com/image.png" } },
		] as const;
		const result = convertVsCodeContent(input);
		expect(Array.isArray(result)).toBe(true);
		if (Array.isArray(result)) {
			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({ type: "text", text: "Check this image:" });
			expect(result[1]).toEqual({ type: "image_url", image_url: { url: "https://example.com/image.png" } });
		}
	});

	it("should handle VSCodeLanguageModelTextPart with value property", () => {
		const input = [{ value: "Hello from VSCode" }] as readonly unknown[];
		expect(convertVsCodeContent(input)).toBe("Hello from VSCode");
	});

	it("should handle empty array", () => {
		expect(convertVsCodeContent([])).toBe("");
	});

	it("should handle mixed content with only text", () => {
		const input = [{ type: "text", text: "Hello" }, { value: " World" }] as const;
		expect(convertVsCodeContent(input)).toBe("Hello World");
	});
});

describe("ROLE constants", () => {
	it("should have correct role values", () => {
		expect(ROLE.SYSTEM).toBe("system");
		expect(ROLE.USER).toBe("user");
		expect(ROLE.ASSISTANT).toBe("assistant");
		expect(ROLE.TOOL).toBe("tool");
	});
});
