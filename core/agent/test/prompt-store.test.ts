import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PromptTemplateStore } from "../src/prompt-store.js";
import { DEFAULT_ANALYSIS_PROMPT_TEMPLATE } from "../src/prompt.js";

test("PromptTemplateStore persists edited prompt templates", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "prompt-store-"));
  const store = new PromptTemplateStore({
    dataDir,
    promptTemplateFilePath: join(dataDir, "prompt-template.txt")
  });

  const defaults = await store.initialize();
  assert.equal(defaults, DEFAULT_ANALYSIS_PROMPT_TEMPLATE);

  const updated = await store.savePromptTemplate("你是一个算法题助手。\n用户问题：{{question}}");
  assert.equal(updated, "你是一个算法题助手。\n用户问题：{{question}}");

  const secondStore = new PromptTemplateStore({
    dataDir,
    promptTemplateFilePath: join(dataDir, "prompt-template.txt")
  });

  const persisted = await secondStore.getPromptTemplate();
  assert.equal(persisted, "你是一个算法题助手。\n用户问题：{{question}}");
});
