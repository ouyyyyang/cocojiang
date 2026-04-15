import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsStore } from "../src/settings-store.js";

test("SettingsStore persists provider and model selections", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "settings-store-"));
  const store = new SettingsStore({
    dataDir,
    settingsFilePath: join(dataDir, "settings.json"),
    defaultModelProvider: "codex",
    defaultCodexModel: "gpt-5.4",
    defaultCodexReasoningEffort: "high",
    defaultLocalVisionModel: "qwen3-vl:8b",
    defaultCloudModel: "",
    defaultCloudApiKey: "",
    claudeBaseUrl: "https://api.anthropic.com"
  });

  const defaults = await store.initialize();
  assert.deepEqual(defaults, {
    modelProvider: "codex",
    codexModel: "gpt-5.4",
    codexReasoningEffort: "high",
    localVisionModel: "qwen3-vl:8b",
    cloudModel: "",
    cloudApiKey: "",
    claudeBaseUrl: "https://api.anthropic.com"
  });

  const updated = await store.saveSettings({
    modelProvider: "lmstudio",
    codexModel: "gpt-5.5",
    codexReasoningEffort: "medium",
    localVisionModel: "qwen3-vl:4b",
    claudeBaseUrl: " https://proxy.example.com/anthropic/ "
  });

  assert.equal(updated.modelProvider, "lmstudio");
  assert.equal(updated.codexModel, "gpt-5.5");
  assert.equal(updated.codexReasoningEffort, "medium");
  assert.equal(updated.localVisionModel, "qwen3-vl:4b");
  assert.equal(updated.claudeBaseUrl, "https://proxy.example.com/anthropic");

  const secondStore = new SettingsStore({
    dataDir,
    settingsFilePath: join(dataDir, "settings.json"),
    defaultModelProvider: "codex",
    defaultCodexModel: "gpt-5.4",
    defaultCodexReasoningEffort: "high",
    defaultLocalVisionModel: "qwen3-vl:8b",
    defaultCloudModel: "",
    defaultCloudApiKey: "",
    claudeBaseUrl: "https://api.anthropic.com"
  });

  const persisted = await secondStore.getSettings();
  assert.equal(persisted.modelProvider, "lmstudio");
  assert.equal(persisted.codexModel, "gpt-5.5");
  assert.equal(persisted.codexReasoningEffort, "medium");
  assert.equal(persisted.localVisionModel, "qwen3-vl:4b");
  assert.equal(persisted.claudeBaseUrl, "https://proxy.example.com/anthropic");
});

test("SettingsStore falls back to the configured Claude base URL for legacy settings", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "settings-store-legacy-"));
  const settingsFilePath = join(dataDir, "settings.json");
  const fallbackClaudeBaseUrl = "https://gateway.example.com/anthropic";

  const store = new SettingsStore({
    dataDir,
    settingsFilePath,
    defaultModelProvider: "claude",
    defaultCodexModel: "gpt-5.4",
    defaultCodexReasoningEffort: "high",
    defaultLocalVisionModel: "qwen3-vl:8b",
    defaultCloudModel: "claude-opus-4-6",
    defaultCloudApiKey: "test-key",
    claudeBaseUrl: fallbackClaudeBaseUrl
  });

  await writeFile(
    settingsFilePath,
    JSON.stringify({
      modelProvider: "claude",
      codexModel: "gpt-5.4",
      codexReasoningEffort: "high",
      localVisionModel: "qwen3-vl:8b",
      cloudModel: "claude-opus-4-6",
      cloudApiKey: "test-key"
    }),
    "utf8"
  );

  const settings = await store.getSettings();
  assert.equal(settings.claudeBaseUrl, fallbackClaudeBaseUrl);

  const reset = await store.saveSettings({ claudeBaseUrl: "   " });
  assert.equal(reset.claudeBaseUrl, fallbackClaudeBaseUrl);
});
