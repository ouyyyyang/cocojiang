import { spawn } from "node:child_process";
import type { SpawnProcess, SpawnedProcessLike } from "./codex.js";

export interface CodexLoginStatus {
  authenticated: boolean;
  authMode: string | null;
  rawStatus: string;
}

export type LaunchCodexLogin = (input: {
  codexBin: string;
  workspaceRoot: string;
}) => Promise<void>;

export function parseCodexLoginStatus(rawStatus: string): CodexLoginStatus {
  const normalized = rawStatus.trim();
  const match = normalized.match(/^Logged in using (.+)$/im);

  return {
    authenticated: Boolean(match),
    authMode: match?.[1]?.trim() || null,
    rawStatus: normalized || "Unknown"
  };
}

export async function readCodexLoginStatus(input: {
  codexBin: string;
  workspaceRoot: string;
  spawnProcess?: SpawnProcess;
}): Promise<CodexLoginStatus> {
  const spawnProcess = input.spawnProcess ?? defaultSpawnProcess;
  const child = spawnProcess(
    input.codexBin,
    ["-c", 'model_reasoning_effort="high"', "login", "status"],
    { cwd: input.workspaceRoot }
  );

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  return await new Promise<CodexLoginStatus>((resolve, reject) => {
    child.on("error", reject);

    child.on("close", (code) => {
      const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").trim();

      if (code === 0) {
        resolve(parseCodexLoginStatus(combined));
        return;
      }

      if (/not logged in/i.test(combined)) {
        resolve(parseCodexLoginStatus(combined));
        return;
      }

      reject(
        new Error(
          combined
            ? `Failed to read Codex login status: ${combined}`
            : `Failed to read Codex login status: exited with code ${code}`
        )
      );
    });
  });
}

export function buildCodexLoginCommand(input: {
  codexBin: string;
  workspaceRoot: string;
}): string {
  return `cd ${shellQuote(input.workspaceRoot)} && ${shellQuote(input.codexBin)} -c 'model_reasoning_effort="high"' login`;
}

export async function launchCodexLoginInTerminal(input: {
  codexBin: string;
  workspaceRoot: string;
  platform?: NodeJS.Platform;
}): Promise<void> {
  const platform = input.platform ?? process.platform;

  if (platform === "win32") {
    await launchCodexLoginOnWindows(input);
  } else {
    await launchCodexLoginOnMacos(input);
  }
}

async function launchCodexLoginOnMacos(input: {
  codexBin: string;
  workspaceRoot: string;
}): Promise<void> {
  const command = buildCodexLoginCommand(input);
  const script = `tell application "Terminal"
activate
do script ${JSON.stringify(command)}
end tell`;

  await new Promise<void>((resolve, reject) => {
    const child = spawn("osascript", ["-e", script], {
      stdio: ["ignore", "ignore", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          stderr.trim() || `Failed to launch Codex login flow in Terminal (exit code ${code})`
        )
      );
    });
  });
}

async function launchCodexLoginOnWindows(input: {
  codexBin: string;
  workspaceRoot: string;
}): Promise<void> {
  const command = buildCodexLoginCommandWindows(input);

  await new Promise<void>((resolve, reject) => {
    const child = spawn("cmd.exe", ["/c", "start", "cmd.exe", "/k", command], {
      cwd: input.workspaceRoot,
      stdio: ["ignore", "ignore", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error("Failed to launch Codex login: cmd.exe not found"));
      } else {
        reject(error);
      }
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          stderr.trim() || `Failed to launch Codex login flow in console (exit code ${code})`
        )
      );
    });
  });
}

export function buildCodexLoginCommandWindows(input: {
  codexBin: string;
  workspaceRoot: string;
}): string {
  return `cd /d ${winQuote(input.workspaceRoot)} && ${winQuote(input.codexBin)} -c "model_reasoning_effort=high" login`;
}

function winQuote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function defaultSpawnProcess(
  command: string,
  args: string[],
  options: { cwd: string }
): SpawnedProcessLike {
  return spawn(command, args, {
    cwd: options.cwd,
    stdio: ["ignore", "pipe", "pipe"]
  });
}
