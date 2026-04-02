import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { buildCodexLoginCommand, buildCodexLoginCommandWindows, parseCodexLoginStatus, readCodexLoginStatus } from "../src/codex-login.js";
import type { SpawnedProcessLike } from "../src/codex.js";

class FakeProcess extends EventEmitter implements SpawnedProcessLike {
  stdout = new PassThrough();
  stderr = new PassThrough();

  kill(): boolean {
    this.emit("close", null);
    return true;
  }
}

test("parseCodexLoginStatus reads authenticated state", () => {
  const status = parseCodexLoginStatus("Logged in using ChatGPT");
  assert.equal(status.authenticated, true);
  assert.equal(status.authMode, "ChatGPT");
});

test("buildCodexLoginCommand keeps workspace quoted", () => {
  const command = buildCodexLoginCommand({
    codexBin: "/usr/local/bin/codex",
    workspaceRoot: "/tmp/my repo"
  });

  assert.match(command, /cd '\/tmp\/my repo'/);
  assert.match(command, /'\/usr\/local\/bin\/codex'/);
  assert.match(command, /login$/);
});

test("buildCodexLoginCommandWindows uses cd /d and double-quote escaping", () => {
  const command = buildCodexLoginCommandWindows({
    codexBin: "C:\\Program Files\\codex\\codex.exe",
    workspaceRoot: "C:\\Users\\test\\my repo"
  });

  assert.match(command, /cd \/d "C:\\Users\\test\\my repo"/);
  assert.match(command, /"C:\\Program Files\\codex\\codex.exe"/);
  assert.match(command, /login$/);
});

test("readCodexLoginStatus uses CLI status output", async () => {
  const child = new FakeProcess();

  const promise = readCodexLoginStatus({
    codexBin: "codex",
    workspaceRoot: process.cwd(),
    spawnProcess: (_command, args) => {
      assert.deepEqual(args, ["-c", 'model_reasoning_effort="high"', "login", "status"]);
      return child;
    }
  });

  child.stdout.write("Logged in using ChatGPT\n");
  child.emit("close", 0);

  const status = await promise;
  assert.equal(status.authenticated, true);
  assert.equal(status.authMode, "ChatGPT");
});
