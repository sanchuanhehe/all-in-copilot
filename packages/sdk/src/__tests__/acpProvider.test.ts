import { describe, it, expect, vi } from "vitest";

// Mock VSCode module before imports
const mockVSCode = {
	window: {
		createOutputChannel: vi.fn(() => ({
			appendLine: vi.fn(),
			show: vi.fn(),
			dispose: vi.fn(),
		})),
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string) => {
				const config: Record<string, unknown> = {
					"acp.serverPath": "/usr/bin/acp",
					"acp.debug": false,
				};
				return config[key];
			}),
		})),
	},
	Uri: {
		file: (path: string) => ({ fsPath: path, scheme: "file", path }),
	},
};

vi.mock("vscode", () => mockVSCode);

// Type for extractUserContent input - matches the function parameter type
type ExtractUserContentInput =
	| { unknown: string }
	| { value?: string; data?: { type: string; data: number[] } }
	| { $mid?: number; value?: string };

// Test the UTF-8 decoding logic that was added to acpProvider.ts
describe("UTF-8 Decoding", () => {
	// Using TextDecoder instead of manual implementation
	function decodeUtf8(bytes: number[]): string {
		const decoder = new TextDecoder("utf-8");
		const uint8Array = new Uint8Array(bytes);
		return decoder.decode(uint8Array);
	}

	it("should decode ASCII characters", () => {
		const bytes = [72, 101, 108, 108, 111]; // "Hello"
		expect(decodeUtf8(bytes)).toBe("Hello");
	});

	it("should decode Chinese characters", () => {
		const bytes = [228, 189, 160, 229, 165, 189]; // "你好"
		expect(decodeUtf8(bytes)).toBe("你好");
	});

	it("should decode mixed ASCII and Chinese", () => {
		const bytes = [72, 101, 108, 108, 111, 44, 32, 228, 189, 160, 229, 165, 189, 33]; // "Hello, 你好!"
		expect(decodeUtf8(bytes)).toBe("Hello, 你好!");
	});

	it("should decode empty array", () => {
		expect(decodeUtf8([])).toBe("");
	});

	it("should decode emoji correctly", () => {
		// "🎄" (U+1F384) = [240, 159, 142, 132]
		const bytes = [240, 159, 142, 132];
		expect(decodeUtf8(bytes)).toBe("🎄");
	});

	it("should decode 4-byte UTF-8 characters", () => {
		// "𠀀" (U+20000) = [240, 160, 128, 128]
		const bytes = [240, 160, 128, 128];
		const result = decodeUtf8(bytes);
		// Check the Unicode code point, not UTF-16 length (surrogate pairs count as 2)
		expect(result.codePointAt(0)).toBe(0x20000);
		expect(result).toBe("𠀀");
	});

	it("should handle invalid UTF-8 gracefully", () => {
		// Incomplete multi-byte sequence
		const bytes = [228, 189]; // Incomplete 3-byte sequence
		const result = decodeUtf8(bytes);
		expect(typeof result).toBe("string");
	});
});

// Test message extraction patterns from VS Code cache_control format
describe("Message Content Extraction", () => {
	// Using TextDecoder for UTF-8 decoding
	function extractUserContent(message: {
		kind?: string;
		text?: string;
		value?: string;
		parts?: unknown[];
		data?: { type: string; data: number[] };
		[key: string]: unknown;
	}): string | null {
		if (message.kind === "text" && message.text) {
			return message.text;
		}
		if (message.value) {
			return message.value;
		}
		if (message.data && message.data.type === "Buffer" && Array.isArray(message.data.data)) {
			// Use TextDecoder for UTF-8 decoding
			const decoder = new TextDecoder("utf-8");
			const bytes = new Uint8Array(message.data.data);
			return decoder.decode(bytes);
		}
		return null;
	}

	it("should extract text from kind='text' format", () => {
		const message = { kind: "text", text: "Hello World" };
		expect(extractUserContent(message)).toBe("Hello World");
	});

	it("should extract text from value format (MarkdownString)", () => {
		const message = { value: "Markdown content" };
		expect(extractUserContent(message)).toBe("Markdown content");
	});

	it("should extract text from cache_control Buffer format (Chinese)", () => {
		const message = {
			data: {
				type: "Buffer",
				data: [228, 189, 160, 229, 165, 189], // "你好"
			},
		};
		expect(extractUserContent(message)).toBe("你好");
	});

	it("should extract text from cache_control Buffer format (English)", () => {
		const message = {
			data: {
				type: "Buffer",
				data: [84, 101, 115, 116, 32, 109, 101, 115, 115, 97, 103, 101], // "Test message"
			},
		};
		expect(extractUserContent(message)).toBe("Test message");
	});

	it("should return null for unknown format", () => {
		const message = { unknown: "format" };
		expect(extractUserContent(message)).toBeNull();
	});
});

// Test multi-part message joining
describe("Multi-part Message Joining", () => {
	function joinAllParts(parts: { value?: string }[]): string {
		const allPartsText = parts.filter((part) => part.value).map((part) => part.value!);
		return allPartsText.join("");
	}

	it("should join multiple parts together", () => {
		const parts = [{ value: "Hello " }, { value: "World" }, { value: "!" }];
		expect(joinAllParts(parts)).toBe("Hello World!");
	});

	it("should filter out empty parts", () => {
		const parts = [{ value: "Hello" }, {}, { value: " " }, { value: "World" }];
		expect(joinAllParts(parts)).toBe("Hello World");
	});

	it("should return empty string for empty array", () => {
		expect(joinAllParts([])).toBe("");
	});
});
