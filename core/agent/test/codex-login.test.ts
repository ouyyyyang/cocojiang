import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  buildCodexLoginCommand,
  buildCodexLoginCommandWindows,
  parseCodexLoginStatus,
  readCodexLoginStatus
} from "../src/codex-login.js";
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

test("readCodexLoginStatus normalizes Windows workspace path on win32", async () => {
  const child = new FakeProcess();

  await withPatchedPlatform("win32", async () => {
    const promise = readCodexLoginStatus({
      codexBin: "codex",
      workspaceRoot: "/mnt/h/program/cocojiang",
      spawnProcess: (_command, _args, options) => {
        assert.equal(options.cwd, "H:\\program\\cocojiang");
        return child;
      }
    });

    child.stderr.write("not logged in\n");
    child.emit("close", 1);

    const status = await promise;
    assert.equal(status.authenticated, false);
    assert.equal(status.authMode, null);
    assert.match(status.rawStatus, /not logged in/i);
  });
});

test("readCodexLoginStatus maps ENOENT to unauthenticated status", async () => {
  const child = new FakeProcess();

  const promise = readCodexLoginStatus({
    codexBin: "codex",
    workspaceRoot: process.cwd(),
    spawnProcess: () => child
  });

  child.emit("error", Object.assign(new Error("spawn codex ENOENT"), { code: "ENOENT" }));

  const status = await promise;
  assert.equal(status.authenticated, false);
  assert.equal(status.authMode, null);
  assert.match(status.rawStatus, /Codex CLI not found/i);
});

test("readCodexLoginStatus maps Windows code 9009 to unauthenticated status", async () => {
  const child = new FakeProcess();

  await withPatchedPlatform("win32", async () => {
    const promise = readCodexLoginStatus({
      codexBin: "codex",
      workspaceRoot: process.cwd(),
      spawnProcess: () => child
    });

    child.emit("close", 9009);

    const status = await promise;
    assert.equal(status.authenticated, false);
    assert.equal(status.authMode, null);
    assert.match(status.rawStatus, /Codex CLI not found/i);
  });
});

test("readCodexLoginStatus maps garbled localized command-not-found output on Windows", async () => {
  const child = new FakeProcess();

  await withPatchedPlatform("win32", async () => {
    const promise = readCodexLoginStatus({
      codexBin: "codex",
      workspaceRoot: process.cwd(),
      spawnProcess: () => child
    });

    child.stderr.write("'codex' �����ڲ����ⲿ���Ҳ���ǿ����еĳ���\n");
    child.emit("close", 1);

    const status = await promise;
    assert.equal(status.authenticated, false);
    assert.equal(status.authMode, null);
    assert.match(status.rawStatus, /Codex CLI not found/i);
  });
});

async function withPatchedPlatform<T>(platform: NodeJS.Platform, work: () => Promise<T>): Promise<T> {
  const originalPlatform = process.platform;

  Object.defineProperty(process, "platform", {
    value: platform
  });

  try {
    return await work();
  } finally {
    Object.defineProperty(process, "platform", {
      value: originalPlatform
    });
  }
}
