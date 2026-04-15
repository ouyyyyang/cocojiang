import test from "node:test";
import assert from "node:assert/strict";
import { captureScreen, resolveCaptureBackend } from "../src/capture.js";

test("resolveCaptureBackend auto-detects macos on darwin", () => {
  assert.equal(resolveCaptureBackend({ platform: "darwin" }), "macos");
});

test("resolveCaptureBackend auto-detects windows on win32", () => {
  assert.equal(resolveCaptureBackend({ platform: "win32" }), "windows");
});

test("resolveCaptureBackend respects override", () => {
  assert.equal(resolveCaptureBackend({ platform: "darwin", override: "windows" }), "windows");
});

test("captureScreen runs screencapture on macos backend", async () => {
  let capturedCommand = "";
  let capturedArgs: string[] = [];

  await captureScreen({
    captureBackend: "macos",
    captureBin: "/usr/sbin/screencapture",
    captureTarget: "main_display",
    outputPath: "/tmp/screen.png",
    runCommand: async (command, args) => {
      capturedCommand = command;
      capturedArgs = args;
    }
  });

  assert.equal(capturedCommand, "/usr/sbin/screencapture");
  assert.deepEqual(capturedArgs, ["-x", "/tmp/screen.png"]);
});

test("captureScreen runs PowerShell capture script on windows backend", async () => {
  let capturedCommand = "";
  let capturedArgs: string[] = [];
  let capturedTimeout = 0;

  await captureScreen({
    captureBackend: "windows",
    captureBin: "powershell.exe",
    windowsCaptureScriptPath: "C:/repo/scripts/windows/capture-screen.ps1",
    captureTarget: "main_display",
    outputPath: "C:/tmp/screen.png",
    runCommand: async (command, args, options) => {
      capturedCommand = command;
      capturedArgs = args;
      capturedTimeout = options?.timeoutMs || 0;
    }
  });

  assert.equal(capturedCommand, "powershell.exe");
  assert.deepEqual(capturedArgs, [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-STA",
    "-File",
    "C:/repo/scripts/windows/capture-screen.ps1",
    "-OutputPath",
    "C:/tmp/screen.png"
  ]);
  assert.equal(capturedTimeout, 15_000);
});
