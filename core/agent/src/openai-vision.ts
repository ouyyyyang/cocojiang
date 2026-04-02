import { readFile } from "node:fs/promises";
import type { AppConfig } from "./config.js";
import { parseCodexOutput, type CodexRunResult } from "./codex.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { CaptureTarget } from "./types.js";

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

export async function runOpenAIVisionAnalysis(input: {
  config: Pick<AppConfig, "schemaPath" | "openaiBaseUrl" | "codexTimeoutMs">;
  apiKey: string;
  imagePath: string;
  question: string;
  captureTarget: CaptureTarget;
  promptTemplate: string;
  cloudModel: string;
  frontmostApp?: string | null;
  windowTitle?: string | null;
  onProgress?: (message: string) => void | Promise<void>;
}): Promise<CodexRunResult> {
  if (!input.apiKey) {
    throw new Error("OpenAI API key is not configured. Set it in the settings page or via CLOUD_API_KEY env var.");
  }

  const schema = JSON.parse(await readFile(input.config.schemaPath, "utf8"));
  const imageBase64 = await readFile(input.imagePath, { encoding: "base64" });
  const prompt = buildAnalysisPrompt({
    question: input.question,
    captureTarget: input.captureTarget,
    frontmostApp: input.frontmostApp,
    windowTitle: input.windowTitle
  }, input.promptTemplate);

  await input.onProgress?.("Uploading screenshot to OpenAI");

  const baseUrl = input.config.openaiBaseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.codexTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`
      },
      body: JSON.stringify({
        model: input.cloudModel,
        messages: [
          {
            role: "system",
            content: "You are Screen Pilot's vision analysis engine. Return only valid JSON matching the provided schema."
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
          ? `OpenAI API request failed: ${response.status} ${response.statusText} - ${errorText}`
          : `OpenAI API request failed: ${response.status} ${response.statusText}`
      );
    }

    const payload = (await response.json()) as OpenAIChatCompletionResponse;
    if (payload.error?.message) {
      throw new Error(`OpenAI returned an error: ${payload.error.message}`);
    }

    const rawMessage = payload.choices?.[0]?.message?.content?.trim();
    if (!rawMessage) {
      throw new Error("OpenAI did not return a response");
    }

    const result = parseCodexOutput(rawMessage);
    return { result, rawMessage };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`OpenAI API timed out after ${input.config.codexTimeoutMs}ms`);
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("fetch failed")) {
      throw new Error(`Failed to reach OpenAI API at ${baseUrl}. Check your network connection.`);
    }

    throw error instanceof Error ? error : new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}
