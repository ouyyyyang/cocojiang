import test from "node:test";
import assert from "node:assert/strict";
import { parseLmStudioModelRefsValue, parseOllamaModelRefs } from "../src/local-runtime-manager.js";

test("parseLmStudioModelRefsValue tolerates array and nested object shapes", () => {
  const parsedFromArray = parseLmStudioModelRefsValue([
    {
      modelKey: "qwen/qwen3-vl-8b",
      displayName: "Qwen3-VL-8B",
      identifier: "qwen3-vl:8b"
    }
  ]);
  assert.deepEqual(parsedFromArray, [
    {
      id: "qwen/qwen3-vl-8b",
      label: "Qwen3-VL-8B",
      identifier: "qwen3-vl:8b"
    }
  ]);

  const parsedFromNested = parseLmStudioModelRefsValue({
    data: [
      {
        key: "qwen/qwen3-vl-4b",
        name: "Qwen3-VL-4B"
      }
    ]
  });
  assert.deepEqual(parsedFromNested, [
    {
      id: "qwen/qwen3-vl-4b",
      label: "Qwen3-VL-4B",
      identifier: undefined
    }
  ]);
});

test("parseOllamaModelRefs reads Ollama API payloads", () => {
  const parsed = parseOllamaModelRefs({
    models: [
      { name: "qwen3-vl:8b" },
      { model: "qwen3-vl:4b" }
    ]
  });

  assert.deepEqual(parsed, [
    {
      id: "qwen3-vl:8b",
      label: "qwen3-vl:8b",
      identifier: undefined
    },
    {
      id: "qwen3-vl:4b",
      label: "qwen3-vl:4b",
      identifier: "qwen3-vl:4b"
    }
  ]);
});
