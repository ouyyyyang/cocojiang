import type { AppConfig } from "./config.js";
import type { AgentSettings } from "./types.js";
import { ensureDir, pathExists, readJsonFile, writeJsonAtomic } from "./utils.js";

export class SettingsStore {
  constructor(
    private readonly config: Pick<AppConfig, "dataDir" | "settingsFilePath" | "defaultCodexModel">
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
      codexModel: this.config.defaultCodexModel
    };

    await writeJsonAtomic(this.config.settingsFilePath, defaults);
    return defaults;
  }

  async getSettings(): Promise<AgentSettings> {
    if (!(await pathExists(this.config.settingsFilePath))) {
      return {
        codexModel: this.config.defaultCodexModel
      };
    }

    const loaded = await readJsonFile<Partial<AgentSettings>>(this.config.settingsFilePath);
    return {
      codexModel: sanitizeCodexModel(loaded.codexModel, this.config.defaultCodexModel)
    };
  }

  async saveSettings(update: Partial<AgentSettings>): Promise<AgentSettings> {
    const current = await this.getSettings();
    const next: AgentSettings = {
      codexModel: sanitizeCodexModel(update.codexModel, current.codexModel)
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
