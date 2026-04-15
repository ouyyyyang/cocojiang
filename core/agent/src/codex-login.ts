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

function codexCliMissingStatus(codexBin: string): CodexLoginStatus {
  return {
    authenticated: false,
    authMode: null,
    rawStatus: `Codex CLI not found (${codexBin}). Install Codex and add it to PATH, or set CODEX_BIN to the full executable path.`
  };
}

function isCodexCommandMissingError(input: {
  code: number | null;
  output: string;
  codexBin: string;
}): boolean {
  const output = input.output.trim();
  if (!output && input.code !== 9009) {
    return false;
  }

  if (input.code === 9009) {
    return true;
  }

  if (/is not recognized as an internal or external command/i.test(output)) {
    return true;
  }

  if (/不是内部或外部命令/.test(output)) {
    return true;
  }

  if (/command not found/i.test(output)) {
    return true;
  }

  const commandName = extractCommandName(input.codexBin);
  if (
    process.platform === "win32" &&
    output.includes("�") &&
    commandName &&
    new RegExp(`'${escapeRegExp(commandName)}(?:\\.(?:cmd|exe|bat))?'`, "i").test(output)
  ) {
    return true;
  }

  return false;
}

function extractCommandName(command: string): string {
  const unquoted = command.trim().replace(/^['"]|['"]$/g, "");
  if (!unquoted) {
    return "";
  }

  const segments = unquoted.split(/[\\/]/);
  const leaf = segments.at(-1) || unquoted;
  return leaf.replace(/\.(cmd|exe|bat)$/i, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function readCodexLoginStatus(input: {
  codexBin: string;
  workspaceRoot: string;
  spawnProcess?: SpawnProcess;
}): Promise<CodexLoginStatus> {
  const spawnProcess = input.spawnProcess ?? defaultSpawnProcess;
  const workspaceRoot = normalizeWorkspaceRootForCurrentPlatform(input.workspaceRoot);
  const child = spawnProcess(
    normalizeWindowsCommandPath(input.codexBin),
    ["-c", 'model_reasoning_effort="high"', "login", "status"],
    { cwd: workspaceRoot }
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
    let settled = false;
    const settleResolve = (status: CodexLoginStatus) => {
      if (!settled) {
        settled = true;
        resolve(status);
      }
    };
    const settleReject = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        settleResolve(codexCliMissingStatus(input.codexBin));
        return;
      }

      settleReject(error);
    });

    child.on("close", (code) => {
      const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").trim();

      if (code === 0) {
        settleResolve(parseCodexLoginStatus(combined));
        return;
      }

      if (/not logged in/i.test(combined)) {
        settleResolve(parseCodexLoginStatus(combined));
        return;
      }

      if (isCodexCommandMissingError({ code, output: combined, codexBin: input.codexBin })) {
        settleResolve(codexCliMissingStatus(input.codexBin));
        return;
      }

      settleReject(
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
  const workspaceRoot = normalizeWindowsPath(input.workspaceRoot);
  const codexBin = normalizeWindowsCommandPathForCmd(input.codexBin);
  const command = buildCodexLoginCommandWindows({
    codexBin,
    workspaceRoot
  });

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "cmd.exe",
      ["/d", "/s", "/c", "start", '""', "cmd.exe", "/k", command],
      {
        cwd: workspaceRoot,
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: false
      }
    );

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
  const codexCommand = isWindowsAbsolutePath(input.codexBin)
    ? winQuote(input.codexBin)
    : input.codexBin;

  return `cd /d ${winQuote(input.workspaceRoot)} && ${codexCommand} -c "model_reasoning_effort=high" login`;
}

export function normalizeWorkspaceRootForCurrentPlatform(workspaceRoot: string): string {
  if (process.platform !== "win32") {
    return workspaceRoot;
  }

  return normalizeWindowsPath(workspaceRoot);
}

function normalizeWindowsCommandPath(command: string): string {
  if (process.platform !== "win32") {
    return command;
  }

  return normalizeWindowsCommandPathForCmd(command);
}

function normalizeWindowsCommandPathForCmd(command: string): string {
  if (!command) {
    return command;
  }

  if (!isWindowsAbsolutePath(command) && !isLikelyWslPath(command)) {
    return command;
  }

  return normalizeWindowsPath(command);
}

function normalizeWindowsPath(value: string): string {
  const trimmed = value.trim();

  const driveMatch = trimmed.match(/^\/mnt\/([a-zA-Z])(\/.*)?$/);
  if (driveMatch) {
    const drive = driveMatch[1].toUpperCase();
    const rest = (driveMatch[2] || "").replaceAll("/", "\\");
    return `${drive}:\\${rest.replace(/^\\+/, "")}`;
  }

  return trimmed.replaceAll("/", "\\");
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

function isLikelyWslPath(value: string): boolean {
  return value.startsWith("/mnt/");
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
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32"
  });
}
