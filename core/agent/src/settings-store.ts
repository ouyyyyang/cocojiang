import type { AppConfig } from "./config.js";
import type { AgentSettings, CodexReasoningEffort, ModelProvider } from "./types.js";
import { ensureDir, pathExists, readJsonFile, writeJsonAtomic } from "./utils.js";

export class SettingsStore {
  constructor(
    private readonly config: Pick<
      AppConfig,
      | "dataDir"
      | "settingsFilePath"
      | "defaultModelProvider"
      | "defaultCodexModel"
      | "defaultCodexReasoningEffort"
      | "defaultLocalVisionModel"
      | "defaultCloudModel"
      | "defaultCloudApiKey"
    >
  ) {}

  async initialize(): Promise<AgentSettings> {
    await ensureDir(this.config.dataDir);

    if (await pathExists(this.config.settingsFilePath)) {
      const current = await this.getSettings();
      if (current.codexModel) {
        return current;
      }
    }

    const defaults: AgentSettings = {
      modelProvider: this.config.defaultModelProvider,
      codexModel: this.config.defaultCodexModel,
      codexReasoningEffort: this.config.defaultCodexReasoningEffort,
      localVisionModel: this.config.defaultLocalVisionModel,
      cloudModel: this.config.defaultCloudModel,
      cloudApiKey: this.config.defaultCloudApiKey
    };

    await writeJsonAtomic(this.config.settingsFilePath, defaults);
    return defaults;
  }

  async getSettings(): Promise<AgentSettings> {
    if (!(await pathExists(this.config.settingsFilePath))) {
      return {
        modelProvider: this.config.defaultModelProvider,
        codexModel: this.config.defaultCodexModel,
        codexReasoningEffort: this.config.defaultCodexReasoningEffort,
        localVisionModel: this.config.defaultLocalVisionModel,
        cloudModel: this.config.defaultCloudModel,
        cloudApiKey: this.config.defaultCloudApiKey
      };
    }

    const loaded = await readJsonFile<Partial<AgentSettings>>(this.config.settingsFilePath);
    return {
      modelProvider: sanitizeModelProvider(loaded.modelProvider, this.config.defaultModelProvider),
      codexModel: sanitizeCodexModel(loaded.codexModel, this.config.defaultCodexModel),
      codexReasoningEffort: sanitizeCodexReasoningEffort(
        loaded.codexReasoningEffort,
        this.config.defaultCodexReasoningEffort
      ),
      localVisionModel: sanitizeLocalVisionModel(loaded.localVisionModel, this.config.defaultLocalVisionModel),
      cloudModel: loaded.cloudModel?.trim() || this.config.defaultCloudModel,
      cloudApiKey: loaded.cloudApiKey?.trim() || this.config.defaultCloudApiKey
    };
  }

  async saveSettings(update: Partial<AgentSettings>): Promise<AgentSettings> {
    const current = await this.getSettings();
    const next: AgentSettings = {
      modelProvider: sanitizeModelProvider(update.modelProvider, current.modelProvider),
      codexModel: sanitizeCodexModel(update.codexModel, current.codexModel),
      codexReasoningEffort: sanitizeCodexReasoningEffort(update.codexReasoningEffort, current.codexReasoningEffort),
      localVisionModel: sanitizeLocalVisionModel(update.localVisionModel, current.localVisionModel),
      cloudModel: update.cloudModel?.trim() || current.cloudModel,
      cloudApiKey: update.cloudApiKey?.trim() || current.cloudApiKey
    };

    await writeJsonAtomic(this.config.settingsFilePath, next);
    return next;
  }
}

export function sanitizeCodexModel(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized;
}

export function sanitizeLocalVisionModel(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized;
}

export function sanitizeCodexReasoningEffort(
  value: string | undefined,
  fallback: CodexReasoningEffort
): CodexReasoningEffort {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}

export function sanitizeModelProvider(value: string | undefined, fallback: ModelProvider): ModelProvider {
  return value === "ollama" || value === "lmstudio" || value === "codex" || value === "claude" || value === "openai"
    ? value
    : fallback;
}
