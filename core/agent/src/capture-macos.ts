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

  await input.runCommand(input.captureBin, ["-x", "-m", input.outputPath]);
}
