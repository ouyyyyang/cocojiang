import { spawn } from "node:child_process";
import type { CaptureTarget } from "./types.js";

export type SimpleCommandRunner = (
  command: string,
  args: string[],
  options?: { timeoutMs?: number }
) => Promise<void>;

export async function captureScreen(input: {
  captureBin: string;
  captureTarget: CaptureTarget;
  outputPath: string;
  runCommand?: SimpleCommandRunner;
}): Promise<void> {
  if (input.captureTarget !== "main_display") {
    throw new Error(`Unsupported capture target: ${input.captureTarget}`);
  }

  const runCommand = input.runCommand ?? defaultCommandRunner;
  await runCommand(input.captureBin, ["-x", "-m", input.outputPath]);
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
