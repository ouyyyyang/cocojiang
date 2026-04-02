import { homedir } from "node:os";
import { join } from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  workspaceRoot: string;
  iphonePublicDir: string;
  macWebPublicDir: string;
  schemaPath: string;
  dataDir: string;
  sessionsDir: string;
  tokenFilePath: string;
  settingsFilePath: string;
  promptTemplateFilePath: string;
  codexModelsCachePath: string;
  defaultModelProvider: "codex" | "claude" | "openai" | "lmstudio" | "ollama";
  defaultCodexModel: string;
  defaultCodexReasoningEffort: "low" | "medium" | "high";
  defaultLocalVisionModel: string;
  codexBin: string;
  lmStudioBin: string;
  ollamaBin: string;
  captureBackend: "auto" | "macos" | "windows";
  captureBin: string;
  windowsCaptureScriptPath: string;
  codexTimeoutMs: number;
  lmStudioHost: string;
  ollamaHost: string;
  openaiBaseUrl: string;
  defaultCloudModel: string;
  defaultCloudApiKey: string;
  serviceName: string;
  pairingTokenEnv?: string;
}

function readCaptureBackend(value: string | undefined): "auto" | "macos" | "windows" {
  return value === "macos" || value === "windows" || value === "auto" ? value : "auto";
}

function defaultCaptureBin(platform: NodeJS.Platform): string {
  return platform === "win32" ? "powershell.exe" : "/usr/sbin/screencapture";
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveConfig(): AppConfig {
  const workspaceRoot = process.cwd();
  const dataDir = process.env.APP_DATA_DIR || join(homedir(), ".mac-screen-agent-mvp");
  const rawModelProvider = process.env.MODEL_PROVIDER?.trim();
  const validProviders = ["codex", "claude", "openai", "lmstudio", "ollama"] as const;
  const defaultModelProvider = (validProviders as readonly string[]).includes(rawModelProvider ?? "")
    ? (rawModelProvider as (typeof validProviders)[number])
    : "codex";
  const rawReasoningEffort = process.env.CODEX_REASONING_EFFORT?.trim();
  const defaultCodexReasoningEffort =
    rawReasoningEffort === "low" || rawReasoningEffort === "medium" || rawReasoningEffort === "high"
      ? rawReasoningEffort
      : "high";

  return {
    host: process.env.HOST || "0.0.0.0",
    port: readPositiveInt(process.env.PORT, 8787),
    workspaceRoot,
    iphonePublicDir: join(workspaceRoot, "apps", "iphone-web", "public"),
    macWebPublicDir: join(workspaceRoot, "apps", "mac-web", "public"),
    schemaPath: join(workspaceRoot, "shared", "schemas", "codex-output.schema.json"),
    dataDir,
    sessionsDir: join(dataDir, "sessions"),
    tokenFilePath: join(dataDir, "pairing-token.txt"),
    settingsFilePath: join(dataDir, "settings.json"),
    promptTemplateFilePath: join(dataDir, "prompt-template.txt"),
    codexModelsCachePath: join(homedir(), ".codex", "models_cache.json"),
    defaultModelProvider,
    defaultCodexModel: process.env.CODEX_MODEL?.trim() || "gpt-5.4",
    defaultCodexReasoningEffort,
    defaultLocalVisionModel: process.env.LOCAL_VISION_MODEL?.trim() || "qwen3-vl:8b",
    codexBin: process.env.CODEX_BIN || "codex",
    lmStudioBin: process.env.LMSTUDIO_BIN?.trim() || join(homedir(), ".lmstudio", "bin", "lms"),
    ollamaBin: process.env.OLLAMA_BIN?.trim() || "ollama",
    captureBackend: readCaptureBackend(process.env.SCREEN_PILOT_CAPTURE_BACKEND?.trim()),
    captureBin: process.env.CAPTURE_BIN?.trim() || process.env.SCREENCAPTURE_BIN || defaultCaptureBin(process.platform),
    windowsCaptureScriptPath: join(workspaceRoot, "scripts", "windows", "capture-screen.ps1"),
    codexTimeoutMs: readPositiveInt(process.env.CODEX_TIMEOUT_MS, 120_000),
    lmStudioHost: process.env.LMSTUDIO_HOST?.trim() || "http://127.0.0.1:1234",
    ollamaHost: process.env.OLLAMA_HOST?.trim() || "http://127.0.0.1:11434",
    openaiBaseUrl: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com",
    defaultCloudModel: process.env.CLOUD_MODEL?.trim() || "",
    defaultCloudApiKey: process.env.CLOUD_API_KEY?.trim() || "",
    serviceName: "Screen Pilot Agent",
    pairingTokenEnv: process.env.PAIRING_TOKEN?.trim() || undefined
  };
}
