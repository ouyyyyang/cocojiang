import type { CaptureTarget } from "./types.js";
import type { SimpleCommandRunner } from "./capture.js";

export async function captureScreenOnWindows(input: {
  captureBin: string;
  windowsCaptureScriptPath: string;
  captureTarget: CaptureTarget;
  outputPath: string;
  runCommand: SimpleCommandRunner;
}): Promise<void> {
  if (input.captureTarget !== "main_display") {
    throw new Error(`Capture target "${input.captureTarget}" is not yet implemented. Currently only "main_display" is supported.`);
  }

  await input.runCommand(
    input.captureBin,
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-STA",
      "-File",
      input.windowsCaptureScriptPath,
      "-OutputPath",
      input.outputPath
    ],
    { timeoutMs: 15_000 }
  );
}
