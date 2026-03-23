import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { parseCodexOutput, runCodexAnalysis, validateCodexOutput, type SpawnedProcessLike } from "../src/codex.js";

class FakeProcess extends EventEmitter implements SpawnedProcessLike {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();

  kill(): boolean {
    this.emit("close", null);
    return true;
  }
}

test("validateCodexOutput rejects schema mismatches", () => {
  const errors = validateCodexOutput({
    summary: "ok",
    key_points: ["a"],
    ocr_text: "bad",
    answer: "answer",
    next_actions: [],
    uncertainties: []
  });

  assert.deepEqual(errors, ["ocr_text must be a string array"]);
});

test("parseCodexOutput parses valid JSON", () => {
  const parsed = parseCodexOutput(
    JSON.stringify({
      summary: "Terminal build failure",
      key_points: ["Missing module"],
      ocr_text: ["Cannot find module x"],
      answer: "The dependency is missing.",
      next_actions: ["Reinstall dependencies"],
      uncertainties: []
    })
  );

  assert.equal(parsed.answer, "The dependency is missing.");
});

test("runCodexAnalysis parses final agent message from jsonl", async () => {
  const child = new FakeProcess();
  const progressMessages: string[] = [];
  let stdinPayload = "";

  child.stdin.on("data", (chunk) => {
    stdinPayload += chunk.toString("utf8");
  });

  const promise = runCodexAnalysis({
    config: {
      codexBin: "codex",
      codexTimeoutMs: 2_000,
      schemaPath: "/tmp/schema.json",
      workspaceRoot: process.cwd()
    },
    imagePath: "/tmp/screen.png",
    question: "这个报错是什么意思？",
    captureTarget: "main_display",
    codexModel: "gpt-5.4",
    spawnProcess: () => child,
    onProgress: (message) => {
      progressMessages.push(message);
    }
  });

  child.stdout.write('{"type":"thread.started"}\n');
  child.stdout.write('{"type":"turn.started"}\n');
  child.stdout.write(
    `{"type":"item.completed","item":{"type":"agent_message","text":${JSON.stringify(
      JSON.stringify({
        summary: "终端构建失败界面",
        key_points: ["缺少模块"],
        ocr_text: ["Cannot find module X"],
        answer: "依赖未正确安装。",
        next_actions: ["重新安装依赖"],
        uncertainties: []
      })
    )}}}\n`
  );
  child.emit("close", 0);

  const result = await promise;
  assert.equal(result.result.summary, "终端构建失败界面");
  assert.deepEqual(progressMessages, ["Codex thread started", "Codex is analyzing the screen"]);
  assert.match(stdinPayload, /这个报错是什么意思/);
});

test("runCodexAnalysis rejects invalid schema", async () => {
  const child = new FakeProcess();

  const promise = runCodexAnalysis({
    config: {
      codexBin: "codex",
      codexTimeoutMs: 2_000,
      schemaPath: "/tmp/schema.json",
      workspaceRoot: process.cwd()
    },
    imagePath: "/tmp/screen.png",
    question: "",
    captureTarget: "main_display",
    codexModel: "gpt-5.4",
    spawnProcess: () => child
  });

  child.stdout.write(
    `{"type":"item.completed","item":{"type":"agent_message","text":${JSON.stringify(
      JSON.stringify({
        summary: "bad",
        key_points: ["still ok"],
        ocr_text: "wrong shape",
        answer: "bad",
        next_actions: [],
        uncertainties: []
      })
    )}}}\n`
  );
  child.emit("close", 0);

  await assert.rejects(promise, /schema mismatch/);
});
