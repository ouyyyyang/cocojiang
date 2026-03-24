import type { AppConfig } from "./config.js";
import { DEFAULT_ANALYSIS_PROMPT_TEMPLATE } from "./prompt.js";
import { ensureDir, pathExists, readTextFile, writeTextAtomic } from "./utils.js";

export class PromptTemplateStore {
  constructor(
    private readonly config: Pick<AppConfig, "dataDir" | "promptTemplateFilePath">
  ) {}

  async initialize(): Promise<string> {
    await ensureDir(this.config.dataDir);

    if (!(await pathExists(this.config.promptTemplateFilePath))) {
      await writeTextAtomic(this.config.promptTemplateFilePath, DEFAULT_ANALYSIS_PROMPT_TEMPLATE);
      return DEFAULT_ANALYSIS_PROMPT_TEMPLATE;
    }

    return await this.getPromptTemplate();
  }

  async getPromptTemplate(): Promise<string> {
    if (!(await pathExists(this.config.promptTemplateFilePath))) {
      return DEFAULT_ANALYSIS_PROMPT_TEMPLATE;
    }

    const loaded = await readTextFile(this.config.promptTemplateFilePath);
    return sanitizePromptTemplate(loaded, DEFAULT_ANALYSIS_PROMPT_TEMPLATE);
  }

  async savePromptTemplate(nextPromptTemplate: string): Promise<string> {
    const sanitized = sanitizePromptTemplate(nextPromptTemplate, DEFAULT_ANALYSIS_PROMPT_TEMPLATE);
    await writeTextAtomic(this.config.promptTemplateFilePath, sanitized);
    return sanitized;
  }
}

export function sanitizePromptTemplate(value: string | undefined, fallback: string): string {
  const normalized = value?.replace(/\r\n/g, "\n").trim();
  return normalized ? normalized : fallback;
}
