import { stat } from "node:fs/promises";
import type { CaptureTarget } from "./types.js";
import type { SimpleCommandRunner } from "./capture.js";

export async function captureScreenOnMacos(input: {
  captureBin: string;
  captureTarget: CaptureTarget;
  outputPath: string;
  runCommand: SimpleCommandRunner;
}): Promise<void> {
  if (input.captureTarget !== "main_display") {
    throw new Error(`Capture target "${input.captureTarget}" is not yet implemented. Currently only "main_display" is supported.`);
  }

  try {
    await input.runCommand(input.captureBin, ["-x", "-m", input.outputPath]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("exited with code 1") || message.includes("Permission") || message.includes("not permitted")) {
      throw new Error(
        "Screen capture failed — most likely the Screen Recording permission has not been granted.\n\n" +
        "Fix: System Settings -> Privacy & Security -> Screen Recording -> enable your terminal app (Terminal / iTerm / VS Code).\n" +
        "After enabling, you may need to restart the terminal."
      );
    }
    throw error;
  }

  // Some macOS versions silently produce an empty file when permission is denied
  try {
    const info = await stat(input.outputPath);
    if (info.size < 512) {
      throw new Error(
        "Screen capture produced an empty image — this usually means the Screen Recording permission was denied.\n\n" +
        "Fix: System Settings -> Privacy & Security -> Screen Recording -> enable your terminal app.\n" +
        "After enabling, you may need to restart the terminal."
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Screen Recording")) {
      throw error;
    }
    // stat failed (ENOENT) = file doesn't exist, let downstream handle it
  }
}
