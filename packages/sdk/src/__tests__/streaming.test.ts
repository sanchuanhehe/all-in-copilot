import { describe, it, expect } from "vitest";
import { processOpenAIStream } from "../utils/format/streaming";

function makeSSEStream(chunks: string[]): Response {
	const lines = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("");
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(lines));
			controller.close();
		},
	});
	return new Response(body);
}

function makeDeltaStream(contents: Array<string | null>): Response {
	const lines = contents
		.map((content, i) => {
			if (i === contents.length - 1) {
				return "data: [DONE]\n\n";
			}
			const chunk = {
				choices: [{ delta: content !== null ? { content } : {} }],
			};
			return `data: ${JSON.stringify(chunk)}\n\n`;
		})
		.join("");
	const body = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(lines));
			controller.close();
		},
	});
	return new Response(body);
}

describe("processOpenAIStream - think tag filtering", () => {
	it("正常文本原样输出", async () => {
		const chunks = ["hello ", "world"];
		const response = makeDeltaStream([...chunks, null]);
		const received: string[] = [];
		await processOpenAIStream(response, (t) => received.push(t), () => {});
		expect(received.join("")).toBe("hello world");
	});

	it("单 chunk 内完整 think 块被过滤", async () => {
		const response = makeDeltaStream(["<think>reasoning</think>answer", null]);
		const received: string[] = [];
		await processOpenAIStream(response, (t) => received.push(t), () => {});
		expect(received.join("")).toBe("answer");
	});

	it("think 块跨多个 chunk 被正确过滤", async () => {
		const response = makeDeltaStream(["<think>", "reasoning", "</think>", "answer", null]);
		const received: string[] = [];
		await processOpenAIStream(response, (t) => received.push(t), () => {});
		expect(received.join("")).toBe("answer");
	});

	it("think 块前后都有普通文本", async () => {
		const response = makeDeltaStream(["prefix<think>hidden</think>suffix", null]);
		const received: string[] = [];
		await processOpenAIStream(response, (t) => received.push(t), () => {});
		expect(received.join("")).toBe("prefixsuffix");
	});

	it("无 think 标签时不影响输出", async () => {
		const response = makeDeltaStream(["hello", " world", null]);
		const received: string[] = [];
		await processOpenAIStream(response, (t) => received.push(t), () => {});
		expect(received.join("")).toBe("hello world");
	});

	it("连续多个 think 块全部过滤", async () => {
		const response = makeDeltaStream(["<think>a</think>ok<think>b</think>done", null]);
		const received: string[] = [];
		await processOpenAIStream(response, (t) => received.push(t), () => {});
		expect(received.join("")).toBe("okdone");
	});
});
