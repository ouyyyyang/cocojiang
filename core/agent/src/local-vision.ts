import { readFile } from "node:fs/promises";
import type { AppConfig } from "./config.js";
import { parseCodexOutput, type CodexRunResult } from "./codex.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { CaptureTarget } from "./types.js";

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

export async function runOllamaVisionAnalysis(input: {
  config: Pick<AppConfig, "schemaPath" | "ollamaHost" | "codexTimeoutMs">;
  imagePath: string;
  question: string;
  captureTarget: CaptureTarget;
  localVisionModel: string;
  frontmostApp?: string | null;
  windowTitle?: string | null;
  onProgress?: (message: string) => void | Promise<void>;
}): Promise<CodexRunResult> {
  const schema = JSON.parse(await readFile(input.config.schemaPath, "utf8"));
  const imageBase64 = await readFile(input.imagePath, { encoding: "base64" });
  const prompt = buildAnalysisPrompt({
    question: input.question,
    captureTarget: input.captureTarget,
    frontmostApp: input.frontmostApp,
    windowTitle: input.windowTitle
  });

  await input.onProgress?.("Uploading screenshot to local model");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.codexTimeoutMs);

  try {
    const response = await fetch(`${stripTrailingSlash(input.config.ollamaHost)}/api/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.localVisionModel,
        prompt,
        images: [imageBase64],
        format: schema,
        stream: false,
        system: "You are Screen Pilot's local vision analysis engine. Return only valid JSON matching the provided schema."
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new Error(
        errorText
          ? `Ollama request failed: ${response.status} ${response.statusText} - ${errorText}`
          : `Ollama request failed: ${response.status} ${response.statusText}`
      );
    }

    const payload = (await response.json()) as OllamaGenerateResponse;
    if (payload.error) {
      throw new Error(`Ollama returned an error: ${payload.error}`);
    }

    if (!payload.response || !payload.response.trim()) {
      throw new Error("Ollama did not return a response body");
    }

    const result = parseCodexOutput(payload.response);
    return {
      result,
      rawMessage: payload.response
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Local model timed out after ${input.config.codexTimeoutMs}ms`);
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("fetch failed")) {
      throw new Error(`Failed to reach Ollama at ${input.config.ollamaHost}. Confirm Ollama is running and the model has been pulled.`);
    }

    throw error instanceof Error ? error : new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
