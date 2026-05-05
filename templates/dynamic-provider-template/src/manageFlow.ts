import * as vscode from "vscode";
import { fetchModelsFromAPI, type ModelConfig } from "@all-in-copilot/sdk";
import { toSdkProviderConfig } from "./config";
import { ProviderManager } from "./providerManager";
import type { UserApiMode, UserProvider } from "./types";

const API_MODE_ITEMS: Array<{ label: string; mode: UserApiMode }> = [
	{ label: "OpenAI Compatible", mode: "openai" },
	{ label: "Anthropic", mode: "anthropic" },
	{ label: "Gemini", mode: "gemini" },
	{ label: "Ollama", mode: "ollama" },
];

export async function runManageFlow(
	providerManager: ProviderManager,
	onChanged: () => Promise<void> | void
): Promise<void> {
	for (;;) {
		const providers = providerManager.getProviders();
		const activeProviderId = providerManager.getActiveProviderId();

		const action = await vscode.window.showQuickPick(
			[
				{ label: "$(add) Add Provider", value: "add" },
				{ label: "$(edit) Edit Provider", value: "edit" },
				{ label: "$(trash) Delete Provider", value: "delete" },
				{ label: "$(check) Set Active Provider", value: "active" },
				{ label: "$(symbol-misc) Add Manual Model", value: "addModel" },
				{ label: "$(remove-close) Remove Manual Model", value: "removeModel" },
				{ label: "$(info) View Providers", value: "view" },
			],
			{
				placeHolder: `Manage Providers (${providers.length} total, active: ${activeProviderId ?? "none"})`,
				ignoreFocusOut: true,
			}
		);

		if (!action) {
			return;
		}

		if (providers.length === 0 && action.value !== "add") {
			vscode.window.showInformationMessage("No providers configured. Please add one first.");
			continue;
		}

		if (action.value === "add") {
			const created = await addProviderFlow(providerManager);
			if (created) {
				await onChanged();
				vscode.window.showInformationMessage(`Provider \"${created.name}\" added.`);
			}
			continue;
		}

		if (action.value === "edit") {
			const edited = await editProviderFlow(providerManager);
			if (edited) {
				await onChanged();
				vscode.window.showInformationMessage(`Provider \"${edited.name}\" updated.`);
			}
			continue;
		}

		if (action.value === "delete") {
			const deleted = await deleteProviderFlow(providerManager);
			if (deleted) {
				await onChanged();
			}
			continue;
		}

		if (action.value === "active") {
			const changed = await setActiveProviderFlow(providerManager);
			if (changed) {
				await onChanged();
			}
			continue;
		}

		if (action.value === "addModel") {
			const changed = await addManualModelFlow(providerManager);
			if (changed) {
				await onChanged();
			}
			continue;
		}

		if (action.value === "removeModel") {
			const changed = await removeManualModelFlow(providerManager);
			if (changed) {
				await onChanged();
			}
			continue;
		}

		if (action.value === "view") {
			showProvidersSummary(providerManager);
		}
	}
}

async function addProviderFlow(providerManager: ProviderManager): Promise<UserProvider | undefined> {
	const name = await vscode.window.showInputBox({
		prompt: "Provider display name",
		placeHolder: "My Provider",
		ignoreFocusOut: true,
		validateInput: (value) => (value.trim().length === 0 ? "Name is required" : undefined),
	});
	if (!name) {
		return undefined;
	}

	const baseUrl = await vscode.window.showInputBox({
		prompt: "Provider base URL or chat/completions endpoint",
		placeHolder: "https://api.example.com/v1/chat/completions",
		ignoreFocusOut: true,
		validateInput: (value) => (value.trim().length === 0 ? "Base URL is required" : undefined),
	});
	if (!baseUrl) {
		return undefined;
	}

	const apiMode = await pickApiMode();
	if (!apiMode) {
		return undefined;
	}

	const apiKey = await vscode.window.showInputBox({
		prompt: "API key",
		password: true,
		ignoreFocusOut: true,
		validateInput: (value) => (value.trim().length === 0 ? "API key is required" : undefined),
	});
	if (!apiKey) {
		return undefined;
	}

	// Immediately try to fetch models with the entered credentials
	let fetchedModels: ModelConfig[] | undefined;
	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: `Fetching models from ${name}...`, cancellable: false },
		async () => {
			try {
				const tmpSdkConfig = {
					id: "__tmp__",
					name,
					family: apiMode,
					baseUrl,
					apiKeySecret: "__tmp_key__",
					apiMode,
					supportsTools: true,
					supportsVision: false,
					defaultMaxOutputTokens: 4096,
					defaultContextLength: 200000,
					dynamicModels: true,
					modelsCacheTTL: 0,
				};
				const tmpCache = { models: null as ModelConfig[] | null, lastFetch: 0 };
				fetchedModels = await fetchModelsFromAPI(baseUrl, apiKey, tmpSdkConfig as any, tmpCache, 15000);
			} catch {
				// Fall through to manual entry
			}
		}
	);

	const provider = await providerManager.addProvider({
		name,
		baseUrl,
		apiMode,
		apiKey,
	});

	if (fetchedModels && fetchedModels.length > 0) {
		const items = fetchedModels.map((m) => ({
			label: m.name || m.id,
			description: m.id !== (m.name || m.id) ? m.id : undefined,
			detail: `Context: ${formatTokenCount(m.maxInputTokens + m.maxOutputTokens)}  |  Max output: ${formatTokenCount(m.maxOutputTokens)}`,
			picked: false,
			model: m,
		}));

		const selected = await vscode.window.showQuickPick(items, {
			placeHolder: `Select models to add (${fetchedModels.length} available, Space to select multiple)`,
			canPickMany: true,
			ignoreFocusOut: true,
		});

		for (const item of selected ?? []) {
			await providerManager.addManualModel(provider.id, {
				id: item.model.id,
				name: item.model.name,
				maxInputTokens: item.model.maxInputTokens,
				maxOutputTokens: item.model.maxOutputTokens,
			});
		}
	} else {
		// API fetch failed — fall back to manual text entry
		const initialModelsInput = await vscode.window.showInputBox({
			prompt: "Could not fetch models automatically. Enter model IDs manually (optional, comma separated)",
			placeHolder: "gpt-4o-mini, deepseek-chat",
			ignoreFocusOut: true,
		});

		const initialModels = (initialModelsInput ?? "")
			.split(",")
			.map((item) => item.trim())
			.filter((item, index, arr) => item.length > 0 && arr.indexOf(item) === index);

		for (const modelId of initialModels) {
			await providerManager.addManualModel(provider.id, { id: modelId, name: modelId });
		}
	}

	return provider;
}

async function editProviderFlow(providerManager: ProviderManager): Promise<UserProvider | undefined> {
	const provider = await pickProvider(providerManager, "Select a provider to edit");
	if (!provider) {
		return undefined;
	}

	const name = await vscode.window.showInputBox({
		prompt: "Provider display name",
		value: provider.name,
		ignoreFocusOut: true,
		validateInput: (value) => (value.trim().length === 0 ? "Name is required" : undefined),
	});
	if (!name) {
		return undefined;
	}

	const baseUrl = await vscode.window.showInputBox({
		prompt: "Provider base URL or chat/completions endpoint",
		value: provider.baseUrl,
		ignoreFocusOut: true,
		validateInput: (value) => (value.trim().length === 0 ? "Base URL is required" : undefined),
	});
	if (!baseUrl) {
		return undefined;
	}

	const apiMode = await pickApiMode(provider.apiMode);
	if (!apiMode) {
		return undefined;
	}

	const replaceApiKey = await vscode.window.showQuickPick(["Keep existing API key", "Replace API key"], {
		placeHolder: "API key handling",
		ignoreFocusOut: true,
	});
	if (!replaceApiKey) {
		return undefined;
	}

	let apiKey: string | undefined;
	if (replaceApiKey === "Replace API key") {
		apiKey = await vscode.window.showInputBox({
			prompt: "New API key",
			password: true,
			ignoreFocusOut: true,
			validateInput: (value) => (value.trim().length === 0 ? "API key cannot be empty" : undefined),
		});
		if (!apiKey) {
			return undefined;
		}
	}

	return providerManager.updateProvider(provider.id, {
		name,
		baseUrl,
		apiMode,
		apiKey,
	});
}

async function deleteProviderFlow(providerManager: ProviderManager): Promise<boolean> {
	const provider = await pickProvider(providerManager, "Select a provider to delete");
	if (!provider) {
		return false;
	}

	const confirm = await vscode.window.showWarningMessage(
		`Delete provider \"${provider.name}\"? This also removes its API key and manual models.`,
		{ modal: true },
		"Delete"
	);

	if (confirm !== "Delete") {
		return false;
	}

	const deleted = await providerManager.deleteProvider(provider.id);
	if (deleted) {
		vscode.window.showInformationMessage(`Provider \"${provider.name}\" deleted.`);
	}
	return deleted;
}

async function setActiveProviderFlow(providerManager: ProviderManager): Promise<boolean> {
	const provider = await pickProvider(providerManager, "Select active provider");
	if (!provider) {
		return false;
	}

	const changed = await providerManager.setActiveProvider(provider.id);
	if (changed) {
		vscode.window.showInformationMessage(`Active provider set to \"${provider.name}\".`);
	}
	return changed;
}

async function addManualModelFlow(providerManager: ProviderManager): Promise<boolean> {
	const provider = await pickProvider(providerManager, "Select provider for manual model");
	if (!provider) {
		return false;
	}

	// Try to fetch model list from the provider API
	let fetchedModels: ModelConfig[] | undefined;
	const apiKey = await providerManager.getProviderApiKey(provider);

	if (apiKey) {
		await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: `Fetching models from ${provider.name}...`, cancellable: false },
			async () => {
				try {
					const sdkConfig = toSdkProviderConfig(provider);
					const tmpCache = { models: null as ModelConfig[] | null, lastFetch: 0 };
					fetchedModels = await fetchModelsFromAPI(provider.baseUrl, apiKey, sdkConfig, tmpCache, 15000);
				} catch {
					// Silently fall back to manual entry
				}
			}
		);
	}

	let selectedModelId: string | undefined;
	let selectedMaxInput: number | undefined;
	let selectedMaxOutput: number | undefined;

	if (fetchedModels && fetchedModels.length > 0) {
		// Show fetched models in QuickPick
		const MANUAL_ENTRY_ID = "__manual__";
		const items: vscode.QuickPickItem[] = [
			...fetchedModels.map((m) => ({
				label: m.name || m.id,
				description: m.id !== m.name ? m.id : undefined,
				detail: `Context: ${formatTokenCount(m.maxInputTokens + m.maxOutputTokens)}  |  Max output: ${formatTokenCount(m.maxOutputTokens)}`,
				// store info via alwaysShow trick — keep picked reference via Map
			})),
			{ label: "$(edit) Enter model ID manually", description: MANUAL_ENTRY_ID },
		];

		const pickedItem = await vscode.window.showQuickPick(items, {
			placeHolder: `Select a model from ${provider.name} (${fetchedModels.length} available)`,
			ignoreFocusOut: true,
		});

		if (!pickedItem) {
			return false;
		}

		if (pickedItem.description === MANUAL_ENTRY_ID) {
			// Fall through to manual entry below
		} else {
			// Find matched model
			const matchedModel = fetchedModels.find(
				(m) => (m.name || m.id) === pickedItem.label && (m.id !== m.name ? m.id : undefined) === pickedItem.description
			) ?? fetchedModels.find((m) => m.name === pickedItem.label || m.id === pickedItem.label);

			if (matchedModel) {
				selectedModelId = matchedModel.id;
				selectedMaxInput = matchedModel.maxInputTokens;
				selectedMaxOutput = matchedModel.maxOutputTokens;
			} else {
				selectedModelId = pickedItem.label;
			}
		}
	}

	// Manual entry (or user chose manual)
	if (!selectedModelId) {
		const modelId = await vscode.window.showInputBox({
			prompt: "Model ID",
			placeHolder: "gpt-4o-mini",
			ignoreFocusOut: true,
			validateInput: (value) => (value.trim().length === 0 ? "Model ID is required" : undefined),
		});
		if (!modelId) {
			return false;
		}
		selectedModelId = modelId;
	}

	// Allow user to override context length
	const contextLengthInput = await vscode.window.showInputBox({
		prompt: "Context window size (tokens, press Enter to keep)",
		value: selectedMaxInput !== undefined ? String(selectedMaxInput + (selectedMaxOutput ?? 0)) : "",
		placeHolder: "200000",
		ignoreFocusOut: true,
		validateInput: (v) => {
			if (v.trim() === "") return undefined;
			return isNaN(Number(v)) || Number(v) <= 0 ? "Must be a positive number" : undefined;
		},
	});

	const maxOutputInput = await vscode.window.showInputBox({
		prompt: "Max output tokens (press Enter to keep)",
		value: selectedMaxOutput !== undefined ? String(selectedMaxOutput) : "",
		placeHolder: "4096",
		ignoreFocusOut: true,
		validateInput: (v) => {
			if (v.trim() === "") return undefined;
			return isNaN(Number(v)) || Number(v) <= 0 ? "Must be a positive number" : undefined;
		},
	});

	// contextLengthInput is total context size; store as maxInputTokens = contextLength - maxOutput
	const totalContext = contextLengthInput?.trim() ? Number(contextLengthInput) : undefined;
	const maxOutputTokens = maxOutputInput?.trim() ? Number(maxOutputInput) : selectedMaxOutput;
	const maxInputTokens = totalContext !== undefined
		? Math.max(1, totalContext - (maxOutputTokens ?? 4096))
		: selectedMaxInput;

	const model = await providerManager.addManualModel(provider.id, {
		id: selectedModelId,
		name: selectedModelId,
		maxInputTokens,
		maxOutputTokens,
	});

	if (!model) {
		return false;
	}

	vscode.window.showInformationMessage(`Model "${model.name}" added to "${provider.name}".`);
	return true;
}

function formatTokenCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
	return String(n);
}

async function removeManualModelFlow(providerManager: ProviderManager): Promise<boolean> {
	const provider = await pickProvider(providerManager, "Select provider");
	if (!provider) {
		return false;
	}

	const models = providerManager.getManualModels(provider.id);
	if (models.length === 0) {
		vscode.window.showInformationMessage(`Provider \"${provider.name}\" has no manual models.`);
		return false;
	}

	const selected = await vscode.window.showQuickPick(
		models.map((model) => ({ label: model.name, description: model.id, value: model.id })),
		{
			placeHolder: "Select a manual model to remove",
			ignoreFocusOut: true,
		}
	);
	if (!selected) {
		return false;
	}

	const removed = await providerManager.removeManualModel(provider.id, selected.value);
	if (removed) {
		vscode.window.showInformationMessage(`Manual model \"${selected.label}\" removed.`);
	}
	return removed;
}

function showProvidersSummary(providerManager: ProviderManager): void {
	const providers = providerManager.getProviders();
	const activeProviderId = providerManager.getActiveProviderId();

	if (providers.length === 0) {
		void vscode.window.showInformationMessage("No providers configured yet.");
		return;
	}

	const lines = providers.map((provider) => {
		const manualModelsCount = providerManager.getManualModels(provider.id).length;
		const active = provider.id === activeProviderId ? " [active]" : "";
		return `${provider.name}${active}\n  ${provider.apiMode} | ${provider.baseUrl}\n  manual models: ${manualModelsCount}`;
	});

	void vscode.window.showInformationMessage(lines.join("\n\n"));
}

async function pickProvider(providerManager: ProviderManager, placeHolder: string): Promise<UserProvider | undefined> {
	const activeProviderId = providerManager.getActiveProviderId();
	const providers = providerManager.getProviders();

	if (providers.length === 0) {
		return undefined;
	}

	const picked = await vscode.window.showQuickPick(
		providers.map((provider) => ({
			label: provider.name,
			description: `${provider.apiMode} | ${provider.baseUrl}`,
			detail: provider.id === activeProviderId ? "Active provider" : undefined,
			provider,
		})),
		{ placeHolder, ignoreFocusOut: true }
	);

	return picked?.provider;
}

async function pickApiMode(defaultValue?: UserApiMode): Promise<UserApiMode | undefined> {
	const picked = await vscode.window.showQuickPick(
		API_MODE_ITEMS.map((item) => ({
			label: item.label,
			description: item.mode,
			picked: defaultValue === item.mode,
			mode: item.mode,
		})),
		{
			placeHolder: "Select API format",
			ignoreFocusOut: true,
		}
	);

	return picked?.mode;
}
