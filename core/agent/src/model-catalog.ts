import type { CodexModelOption } from "./types.js";
import { pathExists, readJsonFile } from "./utils.js";

const FALLBACK_MODELS: CodexModelOption[] = [
  {
    slug: "gpt-5.4",
    displayName: "gpt-5.4",
    description: "Latest frontier agentic coding model."
  },
  {
    slug: "gpt-5.4-mini",
    displayName: "gpt-5.4-mini",
    description: "Smaller frontier agentic coding model."
  },
  {
    slug: "gpt-5.2",
    displayName: "gpt-5.2",
    description: "Optimized for professional work and long-running agents."
  }
];

interface ModelsCacheFile {
  models?: Array<{
    slug?: string;
    display_name?: string;
    description?: string;
    visibility?: string;
    priority?: number;
  }>;
}

export async function loadCodexModelCatalog(cachePath: string): Promise<CodexModelOption[]> {
  if (!(await pathExists(cachePath))) {
    return FALLBACK_MODELS;
  }

  try {
    const parsed = await readJsonFile<ModelsCacheFile>(cachePath);
    const models = (parsed.models || [])
      .filter((model) => model.slug && model.visibility === "list")
      .sort((left, right) => (left.priority ?? 9999) - (right.priority ?? 9999))
      .map((model) => ({
        slug: model.slug!,
        displayName: model.display_name || model.slug!,
        description: model.description
      }));

    return models.length > 0 ? dedupeBySlug(models) : FALLBACK_MODELS;
  } catch {
    return FALLBACK_MODELS;
  }
}

function dedupeBySlug(models: CodexModelOption[]): CodexModelOption[] {
  const seen = new Set<string>();
  const output: CodexModelOption[] = [];

  for (const model of models) {
    if (seen.has(model.slug)) {
      continue;
    }

    seen.add(model.slug);
    output.push(model);
  }

  return output;
}
