import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
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
    defaultLocalVisionModel: "qwen3-vl:8b"
  });

  const defaults = await store.initialize();
  assert.deepEqual(defaults, {
    modelProvider: "codex",
    codexModel: "gpt-5.4",
    codexReasoningEffort: "high",
    localVisionModel: "qwen3-vl:8b"
  });

  const updated = await store.saveSettings({
    modelProvider: "lmstudio",
    codexModel: "gpt-5.5",
    codexReasoningEffort: "medium",
    localVisionModel: "qwen3-vl:4b"
  });

  assert.deepEqual(updated, {
    modelProvider: "lmstudio",
    codexModel: "gpt-5.5",
    codexReasoningEffort: "medium",
    localVisionModel: "qwen3-vl:4b"
  });

  const secondStore = new SettingsStore({
    dataDir,
    settingsFilePath: join(dataDir, "settings.json"),
    defaultModelProvider: "codex",
    defaultCodexModel: "gpt-5.4",
    defaultCodexReasoningEffort: "high",
    defaultLocalVisionModel: "qwen3-vl:8b"
  });

  const persisted = await secondStore.getSettings();
  assert.equal(persisted.modelProvider, "lmstudio");
  assert.equal(persisted.codexModel, "gpt-5.5");
  assert.equal(persisted.codexReasoningEffort, "medium");
  assert.equal(persisted.localVisionModel, "qwen3-vl:4b");
});
