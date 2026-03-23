import { homedir } from "node:os";
import { join } from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  workspaceRoot: string;
  publicDir: string;
  schemaPath: string;
  dataDir: string;
  sessionsDir: string;
  tokenFilePath: string;
  settingsFilePath: string;
  codexModelsCachePath: string;
  defaultCodexModel: string;
  codexBin: string;
  captureBin: string;
  codexTimeoutMs: number;
  serviceName: string;
  pairingTokenEnv?: string;
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

  return {
    host: process.env.HOST || "0.0.0.0",
    port: readPositiveInt(process.env.PORT, 8787),
    workspaceRoot,
    publicDir: join(workspaceRoot, "apps", "iphone-web", "public"),
    schemaPath: join(workspaceRoot, "shared", "schemas", "codex-output.schema.json"),
    dataDir,
    sessionsDir: join(dataDir, "sessions"),
    tokenFilePath: join(dataDir, "pairing-token.txt"),
    settingsFilePath: join(dataDir, "settings.json"),
    codexModelsCachePath: join(homedir(), ".codex", "models_cache.json"),
    defaultCodexModel: process.env.CODEX_MODEL?.trim() || "gpt-5.4",
    codexBin: process.env.CODEX_BIN || "codex",
    captureBin: process.env.SCREENCAPTURE_BIN || "/usr/sbin/screencapture",
    codexTimeoutMs: readPositiveInt(process.env.CODEX_TIMEOUT_MS, 120_000),
    serviceName: "Screen Pilot Agent",
    pairingTokenEnv: process.env.PAIRING_TOKEN?.trim() || undefined
  };
}
