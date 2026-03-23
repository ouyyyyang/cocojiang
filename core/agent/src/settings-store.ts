import type { AppConfig } from "./config.js";
import type { AgentSettings, ModelProvider } from "./types.js";
import { ensureDir, pathExists, readJsonFile, writeJsonAtomic } from "./utils.js";

export class SettingsStore {
  constructor(
    private readonly config: Pick<
      AppConfig,
      "dataDir" | "settingsFilePath" | "defaultModelProvider" | "defaultCodexModel" | "defaultLocalVisionModel"
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
      localVisionModel: this.config.defaultLocalVisionModel
    };

    await writeJsonAtomic(this.config.settingsFilePath, defaults);
    return defaults;
  }

  async getSettings(): Promise<AgentSettings> {
    if (!(await pathExists(this.config.settingsFilePath))) {
      return {
        modelProvider: this.config.defaultModelProvider,
        codexModel: this.config.defaultCodexModel,
        localVisionModel: this.config.defaultLocalVisionModel
      };
    }

    const loaded = await readJsonFile<Partial<AgentSettings>>(this.config.settingsFilePath);
    return {
      modelProvider: sanitizeModelProvider(loaded.modelProvider, this.config.defaultModelProvider),
      codexModel: sanitizeCodexModel(loaded.codexModel, this.config.defaultCodexModel),
      localVisionModel: sanitizeLocalVisionModel(loaded.localVisionModel, this.config.defaultLocalVisionModel)
    };
  }

  async saveSettings(update: Partial<AgentSettings>): Promise<AgentSettings> {
    const current = await this.getSettings();
    const next: AgentSettings = {
      modelProvider: sanitizeModelProvider(update.modelProvider, current.modelProvider),
      codexModel: sanitizeCodexModel(update.codexModel, current.codexModel),
      localVisionModel: sanitizeLocalVisionModel(update.localVisionModel, current.localVisionModel)
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

export function sanitizeModelProvider(value: string | undefined, fallback: ModelProvider): ModelProvider {
  return value === "ollama" || value === "lmstudio" || value === "codex" ? value : fallback;
}
