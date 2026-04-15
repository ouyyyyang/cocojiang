import { spawn } from "node:child_process";
import type { AppConfig } from "./config.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { CodexOutput, CaptureTarget, CodexReasoningEffort } from "./types.js";

export interface SpawnedProcessLike {
  stdin?: NodeJS.WritableStream | null;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "close", listener: (code: number | null) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnProcess = (
  command: string,
  args: string[],
  options: { cwd: string }
) => SpawnedProcessLike;

export interface CodexRunResult {
  result: CodexOutput;
  rawMessage: string;
}

export function validateCodexOutput(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Output must be an object"];
  }

  const candidate = value as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof candidate.summary !== "string") {
    errors.push("summary must be a string");
  }

  if (typeof candidate.answer !== "string") {
    errors.push("answer must be a string");
  }

  for (const key of ["key_points", "ocr_text", "next_actions", "uncertainties"] as const) {
    if (!Array.isArray(candidate[key]) || candidate[key].some((item) => typeof item !== "string")) {
      errors.push(`${key} must be a string array`);
    }
  }

  return errors;
}

export function parseCodexOutput(rawMessage: string): CodexOutput {
  const parsed = JSON.parse(rawMessage) as unknown;
  const errors = validateCodexOutput(parsed);
  if (errors.length > 0) {
    throw new Error(`Codex output schema mismatch: ${errors.join("; ")}`);
  }

  return parsed as CodexOutput;
}

export async function runCodexAnalysis(input: {
  config: Pick<AppConfig, "codexBin" | "codexTimeoutMs" | "schemaPath" | "workspaceRoot">;
  imagePath: string;
  question: string;
  captureTarget: CaptureTarget;
  promptTemplate: string;
  codexModel: string;
  codexReasoningEffort: CodexReasoningEffort;
  frontmostApp?: string | null;
  windowTitle?: string | null;
  spawnProcess?: SpawnProcess;
  onProgress?: (message: string) => void | Promise<void>;
}): Promise<CodexRunResult> {
  const spawnProcess = input.spawnProcess ?? defaultSpawnProcess;
  const prompt = buildAnalysisPrompt({
    question: input.question,
    captureTarget: input.captureTarget,
    frontmostApp: input.frontmostApp,
    windowTitle: input.windowTitle
  }, input.promptTemplate);

  const args = [
    "-c",
    `model_reasoning_effort="${input.codexReasoningEffort}"`,
    "-m",
    input.codexModel,
    "exec",
    "--skip-git-repo-check",
    "--json",
    "--output-schema",
    input.config.schemaPath,
    "--image",
    input.imagePath
  ];

  const child = spawnProcess(input.config.codexBin, args, {
    cwd: input.config.workspaceRoot
  });

  let finalAgentMessage: string | undefined;
  let stderrOutput = "";
  let timedOut = false;
  let progressQueue = Promise.resolve();

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, input.config.codexTimeoutMs);

  if (child.stdin) {
    child.stdin.end(`${prompt}\n`);
  }

  const queueProgress = (message: string) => {
    if (!input.onProgress) {
      return;
    }

    progressQueue = progressQueue.then(() => input.onProgress?.(message));
  };

  attachLineReader(child.stdout, (line) => {
    const parsed = tryParseJson(line);
    if (!parsed) {
      return;
    }

    if (parsed.type === "thread.started") {
      queueProgress("Codex thread started");
      return;
    }

    if (parsed.type === "turn.started") {
      queueProgress("Codex is analyzing the screen");
      return;
    }

    if (
      parsed.type === "item.completed" &&
      parsed.item &&
      typeof parsed.item === "object" &&
      parsed.item.type === "agent_message" &&
      typeof parsed.item.text === "string"
    ) {
      finalAgentMessage = parsed.item.text;
    }
  });

  attachLineReader(child.stderr, (line) => {
    stderrOutput = stderrOutput ? `${stderrOutput}\n${line}` : line;
  });

  return await new Promise<CodexRunResult>((resolve, reject) => {
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (error.code === "ENOENT") {
        reject(new Error(`Codex binary not found at "${input.config.codexBin}". Please install Codex first: https://codex.openai.com`));
      } else {
        reject(error);
      }
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        reject(new Error(`Codex timed out after ${input.config.codexTimeoutMs}ms`));
        return;
      }

      if (code !== 0) {
        const detail = stderrOutput.trim();
        reject(new Error(detail ? `Codex exited with code ${code}: ${detail}` : `Codex exited with code ${code}`));
        return;
      }

      if (!finalAgentMessage) {
        reject(new Error("Codex did not emit a final agent_message"));
        return;
      }

      void progressQueue
        .then(() => {
          const result = parseCodexOutput(finalAgentMessage!);
          resolve({
            result,
            rawMessage: finalAgentMessage!
          });
        })
        .catch((error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  });
}

function attachLineReader(stream: NodeJS.ReadableStream, onLine: (line: string) => void): void {
  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += chunk.toString("utf8");

    while (true) {
      const lineBreakIndex = buffer.indexOf("\n");
      if (lineBreakIndex === -1) {
        break;
      }

      const line = buffer.slice(0, lineBreakIndex).trim();
      buffer = buffer.slice(lineBreakIndex + 1);

      if (line) {
        onLine(line);
      }
    }
  });

  stream.on("end", () => {
    const remaining = buffer.trim();
    if (remaining) {
      onLine(remaining);
    }
  });
}

function tryParseJson(line: string): Record<string, any> | null {
  try {
    return JSON.parse(line) as Record<string, any>;
  } catch {
    return null;
  }
}

function defaultSpawnProcess(
  command: string,
  args: string[],
  options: { cwd: string }
): SpawnedProcessLike {
  return spawn(command, args, {
    cwd: options.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32"
  });
}
