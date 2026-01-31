/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// VS Code Proposed API - Chat Participant Additions
// This file contains APIs that are not yet stable and may change

import type { Uri } from "vscode";
import type { MarkdownString } from "vscode";

export interface ChatTerminalToolInvocationData {
	commandLine: {
		original: string;
		userEdited?: string;
		toolEdited?: string;
	};
	language: string;

	/**
	 * Terminal command output. Displayed when the terminal is no longer available.
	 */
	output?: {
		/** The raw output text, may include ANSI escape codes. */
		text: string;
	};

	/**
	 * Command execution state.
	 */
	state?: {
		/** Exit code of the command. */
		exitCode?: number;
		/** Duration of execution in milliseconds. */
		duration?: number;
	};
}

export class McpToolInvocationContentData {
	/**
	 * The mime type which determines how the data property is interpreted.
	 */
	mimeType: string;

	/**
	 * The byte data for this part.
	 */
	data: Uint8Array;

	/**
	 * Construct a generic data part with the given content.
	 * @param data The byte data for this part.
	 * @param mimeType The mime type of the data.
	 */
	constructor(data: Uint8Array, mimeType: string);
}

export interface ChatMcpToolInvocationData {
	input: string;
	output: McpToolInvocationContentData[];
}

export class ChatToolInvocationPart {
	toolName: string;
	toolCallId: string;
	isError?: boolean;
	invocationMessage?: string | MarkdownString;
	originMessage?: string | MarkdownString;
	pastTenseMessage?: string | MarkdownString;
	isConfirmed?: boolean;
	isComplete?: boolean;
	toolSpecificData?: ChatTerminalToolInvocationData | ChatMcpToolInvocationData;
	subAgentInvocationId?: string;
	presentation?: "hidden" | "hiddenAfterComplete" | undefined;

	constructor(toolName: string, toolCallId: string, isError?: boolean);
}
