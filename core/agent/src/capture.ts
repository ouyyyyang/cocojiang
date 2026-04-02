import { spawn } from "node:child_process";
import { captureScreenOnMacos } from "./capture-macos.js";
import { captureScreenOnWindows } from "./capture-windows.js";
import type { CaptureTarget } from "./types.js";

export type CaptureBackend = "auto" | "macos" | "windows";

export type SimpleCommandRunner = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number }
) => Promise<void>;

export async function captureScreen(input: {
  captureBackend?: CaptureBackend;
  captureBin: string;
  windowsCaptureScriptPath?: string;
  captureTarget: CaptureTarget;
  outputPath: string;
  platform?: NodeJS.Platform;
  runCommand?: SimpleCommandRunner;
}): Promise<void> {
  const backend = resolveCaptureBackend({
    override: input.captureBackend,
    platform: input.platform
  });
  const runCommand = input.runCommand ?? defaultCommandRunner;

  if (backend === "macos") {
    await captureScreenOnMacos({
      captureBin: input.captureBin,
      captureTarget: input.captureTarget,
      outputPath: input.outputPath,
      runCommand
    });
    return;
  }

  if (!input.windowsCaptureScriptPath) {
    throw new Error("windowsCaptureScriptPath is required when using the Windows capture backend.");
  }

  await captureScreenOnWindows({
    captureBin: input.captureBin,
    windowsCaptureScriptPath: input.windowsCaptureScriptPath,
    captureTarget: input.captureTarget,
    outputPath: input.outputPath,
    runCommand
  });
}

export function resolveCaptureBackend(input?: {
  override?: CaptureBackend;
  platform?: NodeJS.Platform;
}): Exclude<CaptureBackend, "auto"> {
  if (input?.override === "macos" || input?.override === "windows") {
    return input.override;
  }

  const platform = input?.platform ?? process.platform;
  if (platform === "darwin") {
    return "macos";
  }

  if (platform === "win32") {
    return "windows";
  }

  throw new Error(
    `Unsupported platform for screen capture: ${platform}. Set SCREEN_PILOT_CAPTURE_BACKEND if you are testing a custom adapter.`
  );
}

export function defaultCommandRunner(
  command: string,
  args: string[],
  options?: { timeoutMs?: number }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    let timedOut = false;
    const timeout = options?.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, options.timeoutMs)
      : undefined;

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      if (timedOut) {
        reject(new Error(`Command timed out: ${command}`));
        return;
      }

      if (code !== 0) {
        const details = stderr.trim();
        reject(new Error(details ? `${command} exited with code ${code}: ${details}` : `${command} exited with code ${code}`));
        return;
      }

      resolve();
    });
  });
}
