import { readFile } from "node:fs/promises";
import type { AppConfig } from "./config.js";
import { parseCodexOutput, type CodexRunResult } from "./codex.js";
import { buildAnalysisPrompt } from "./prompt.js";
import type { CaptureTarget } from "./types.js";

interface ClaudeMessageResponse {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
}

export async function runClaudeVisionAnalysis(input: {
  config: Pick<AppConfig, "schemaPath" | "codexTimeoutMs" | "claudeBaseUrl">;
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
    throw new Error("Claude API key is not configured. Set it in the settings page or via CLOUD_API_KEY env var.");
  }

  const schema = JSON.parse(await readFile(input.config.schemaPath, "utf8"));
  const imageBase64 = await readFile(input.imagePath, { encoding: "base64" });
  const prompt = buildAnalysisPrompt({
    question: input.question,
    captureTarget: input.captureTarget,
    frontmostApp: input.frontmostApp,
    windowTitle: input.windowTitle
  }, input.promptTemplate);

  await input.onProgress?.("Uploading screenshot to Claude");

  const baseUrl = input.config.claudeBaseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.codexTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: input.cloudModel,
        max_tokens: 4096,
        system: `You are Screen Pilot's vision analysis engine. Return only valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: imageBase64
                }
              },
              {
                type: "text",
                text: prompt
              }
            ]
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new Error(
        errorText
          ? `Claude API request failed: ${response.status} ${response.statusText} - ${errorText}`
          : `Claude API request failed: ${response.status} ${response.statusText}`
      );
    }

    const payload = (await response.json()) as ClaudeMessageResponse;
    if (payload.error?.message) {
      throw new Error(`Claude returned an error: ${payload.error.message}`);
    }

    const rawMessage = extractTextContent(payload);
    if (!rawMessage) {
      throw new Error("Claude did not return a text response");
    }

    const result = parseCodexOutput(rawMessage);
    return { result, rawMessage };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Claude API timed out after ${input.config.codexTimeoutMs}ms`);
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("fetch failed")) {
      throw new Error(`Failed to reach Claude API at ${baseUrl}. Check your network connection.`);
    }

    throw error instanceof Error ? error : new Error(message);
  } finally {
    clearTimeout(timeout);
  }
}

function extractTextContent(payload: ClaudeMessageResponse): string {
  if (!Array.isArray(payload.content)) {
    return "";
  }

  return payload.content
    .filter((block) => block.type === "text")
    .map((block) => block.text || "")
    .join("")
    .trim();
}
