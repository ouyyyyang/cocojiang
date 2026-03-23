import { readFile } from "node:fs/promises";
import type { AppConfig } from "./config.js";
import { parseCodexOutput, type CodexRunResult } from "./codex.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { CaptureTarget } from "./types.js";

interface LmStudioChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  } | string;
}

export async function runLmStudioVisionAnalysis(input: {
  config: Pick<AppConfig, "schemaPath" | "lmStudioHost" | "codexTimeoutMs">;
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

  await input.onProgress?.("Uploading screenshot to LM Studio");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.codexTimeoutMs);

  try {
    const response = await fetch(`${stripTrailingSlash(input.config.lmStudioHost)}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.localVisionModel,
        messages: [
          {
            role: "system",
            content: "You are Screen Pilot's local vision analysis engine. Return only valid JSON matching the provided schema."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "screen_pilot_analysis",
            strict: true,
            schema
          }
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new Error(
        errorText
          ? `LM Studio request failed: ${response.status} ${response.statusText} - ${errorText}`
          : `LM Studio request failed: ${response.status} ${response.statusText}`
      );
    }

    const payload = (await response.json()) as LmStudioChatCompletionResponse;
    const errorMessage =
      typeof payload.error === "string" ? payload.error : payload.error?.message;
    if (errorMessage) {
      throw new Error(`LM Studio returned an error: ${errorMessage}`);
    }

    const rawMessage = extractMessageContent(payload);
    if (!rawMessage) {
      throw new Error("LM Studio did not return a final assistant message");
    }

    const result = parseCodexOutput(rawMessage);
    return {
      result,
      rawMessage
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Local model timed out after ${input.config.codexTimeoutMs}ms`);
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("fetch failed")) {
      throw new Error(
        `Failed to reach LM Studio at ${input.config.lmStudioHost}. Confirm LM Studio is running, the local server is started, and the model has been loaded with the expected identifier.`
      );
    }

    throw error instanceof Error ? error : new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

function extractMessageContent(payload: LmStudioChatCompletionResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (item.type === "text" ? item.text || "" : ""))
      .join("")
      .trim();
  }

  return "";
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
