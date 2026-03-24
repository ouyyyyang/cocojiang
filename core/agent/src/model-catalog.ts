import type {
  CodexModelOption,
  CodexReasoningEffortOption,
  LocalVisionModelCatalogEntry,
  ModelProviderOption
} from "./types.js";
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

const LOCAL_VISION_MODELS: LocalVisionModelCatalogEntry[] = [
  {
    slug: "qwen3-vl:4b",
    displayName: "qwen3-vl:4b",
    description: "Smaller local vision-language model via Ollama.",
    lmStudioQuery: "qwen3-vl-4b",
    ollamaModel: "qwen3-vl:4b"
  },
  {
    slug: "qwen3-vl:8b",
    displayName: "qwen3-vl:8b",
    description: "Recommended local vision-language model on Apple Silicon when you want stronger quality.",
    lmStudioQuery: "qwen3-vl-8b",
    ollamaModel: "qwen3-vl:8b"
  }
];

export function loadLocalVisionModelCatalog(): CodexModelOption[] {
  return LOCAL_VISION_MODELS;
}

export function loadCodexReasoningEffortCatalog(): CodexReasoningEffortOption[] {
  return [
    {
      slug: "low",
      displayName: "low",
      description: "更快返回，适合轻量分析。"
    },
    {
      slug: "medium",
      displayName: "medium",
      description: "速度和推理深度的平衡值。"
    },
    {
      slug: "high",
      displayName: "high",
      description: "更深的推理，适合更复杂的屏幕分析。"
    }
  ];
}

export function getLocalVisionModelSpec(slug: string): LocalVisionModelCatalogEntry | undefined {
  return LOCAL_VISION_MODELS.find((model) => model.slug === slug);
}

export function loadModelProviderCatalog(): ModelProviderOption[] {
  return [
    {
      slug: "codex",
      displayName: "Codex",
      description: "Cloud Codex CLI execution."
    },
    {
      slug: "lmstudio",
      displayName: "LM Studio (MLX)",
      description: "Local Apple Silicon optimized inference through LM Studio."
    },
    {
      slug: "ollama",
      displayName: "Local Ollama",
      description: "Local vision-language inference through Ollama."
    }
  ];
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
