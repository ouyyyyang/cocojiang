import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { createAgentServer } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { TestWebSocketClient } from "./helpers/websocket-client.js";

class StubProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();

  kill(): boolean {
    this.emit("close", null);
    return true;
  }
}

async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  isReady: (payload: T) => boolean,
  attempts = 10
): Promise<T> {
  let lastPayload: T | undefined;

  for (let index = 0; index < attempts; index += 1) {
    const response = await fetch(url, init);
    assert.equal(response.status, 200);
    const payload = (await response.json()) as T;
    lastPayload = payload;

    if (isReady(payload)) {
      return payload;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for ready payload: ${JSON.stringify(lastPayload)}`);
}

test("agent server supports pairing, websocket updates, analysis, and history", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "agent-app-"));
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    workspaceRoot: process.cwd(),
    publicDir: join(process.cwd(), "apps", "iphone-web", "public"),
    schemaPath: join(process.cwd(), "shared", "schemas", "codex-output.schema.json"),
    dataDir,
    sessionsDir: join(dataDir, "sessions"),
    tokenFilePath: join(dataDir, "pairing-token.txt"),
    settingsFilePath: join(dataDir, "settings.json"),
    codexModelsCachePath: join(dataDir, "models_cache.json"),
    defaultCodexModel: "gpt-5.4",
    codexBin: "codex",
    captureBin: "/usr/sbin/screencapture",
    codexTimeoutMs: 5_000,
    serviceName: "Test Agent",
    pairingTokenEnv: "test-token"
  };

  let launchedCodexLogin = false;

  const agent = await createAgentServer({
    config,
    captureCommandRunner: async (_command, args) => {
      const outputPath = args.at(-1);
      assert.ok(outputPath);
      await writeFile(outputPath, "fake image");
    },
    spawnProcess: (_command, args) => {
      const child = new StubProcess();
      queueMicrotask(() => {
        if (args.includes("login") && args.includes("status")) {
          child.stdout.write("Logged in using ChatGPT\n");
          child.emit("close", 0);
          return;
        }

        const modelIndex = args.indexOf("-m");
        assert.notEqual(modelIndex, -1);
        assert.equal(args[modelIndex + 1], "gpt-5.4-mini");
        child.stdout.write('{"type":"thread.started"}\n');
        child.stdout.write('{"type":"turn.started"}\n');
        child.stdout.write(
          `{"type":"item.completed","item":{"type":"agent_message","text":${JSON.stringify(
            JSON.stringify({
              summary: "这是一个终端构建失败界面。",
              key_points: ["编译器提示缺少模块 X"],
              ocr_text: ["Cannot find module X"],
              answer: "核心问题是依赖没有被正确链接。",
              next_actions: ["重新安装依赖", "清理缓存后重试"],
              uncertainties: []
            })
          )}}}\n`
        );
        child.emit("close", 0);
      });
      return child as any;
    },
    launchCodexLogin: async () => {
      launchedCodexLogin = true;
    }
  });

  const { port } = await agent.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  const unauthorizedResponse = await fetch(`${baseUrl}/api/sessions`);
  assert.equal(unauthorizedResponse.status, 401);

  const pairResponse = await fetch(`${baseUrl}/api/pair`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ token: "test-token" })
  });
  assert.equal(pairResponse.status, 200);

  const settingsResponse = await fetch(`${baseUrl}/api/settings`, {
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(settingsResponse.status, 200);
  const settings = await settingsResponse.json();
  assert.equal(settings.codexModel, "gpt-5.4");

  const saveSettingsResponse = await fetch(`${baseUrl}/api/settings`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      codexModel: "gpt-5.4-mini"
    })
  });
  assert.equal(saveSettingsResponse.status, 200);

  const authStatusResponse = await fetch(`${baseUrl}/api/codex-auth/status`, {
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(authStatusResponse.status, 200);
  const authStatus = await authStatusResponse.json();
  assert.equal(authStatus.authenticated, true);
  assert.equal(authStatus.authMode, "ChatGPT");

  const startAuthResponse = await fetch(`${baseUrl}/api/codex-auth/start`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(startAuthResponse.status, 202);
  assert.equal(launchedCodexLogin, true);

  const captureTestResponse = await fetch(`${baseUrl}/api/test/capture`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(captureTestResponse.status, 200);
  const captureTest = await captureTestResponse.json();
  assert.equal(captureTest.captureTarget, "main_display");

  const captureImageResponse = await fetch(`${baseUrl}${captureTest.imageUrl}`, {
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(captureImageResponse.status, 200);

  const modelTestResponse = await fetch(`${baseUrl}/api/test/model`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      question: "请总结当前屏幕里的关键问题。"
    })
  });
  assert.equal(modelTestResponse.status, 200);
  const modelTest = await modelTestResponse.json();
  assert.equal(modelTest.codexModel, "gpt-5.4-mini");
  assert.equal(modelTest.result.answer, "核心问题是依赖没有被正确链接。");
  assert.match(modelTest.rawMessage, /summary/);

  const modelTestImageResponse = await fetch(`${baseUrl}${modelTest.imageUrl}`, {
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(modelTestImageResponse.status, 200);

  const ws = await TestWebSocketClient.connect({
    port,
    path: "/ws?token=test-token"
  });

  const analyzeResponse = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      question: "这个报错是什么意思？",
      captureTarget: "main_display"
    })
  });

  assert.equal(analyzeResponse.status, 202);
  const { sessionId } = await analyzeResponse.json();
  assert.ok(sessionId);

  const doneEvent = await ws.waitFor((event) => event.payload.sessionId === sessionId && event.payload.status === "done");
  assert.equal(doneEvent.payload.status, "done");

  const session = await fetchJsonWithRetry<any>(`${baseUrl}/api/sessions/${sessionId}`, {
    headers: {
      authorization: "Bearer test-token"
    }
  }, (payload) => Boolean(payload?.result?.answer));
  assert.equal(session.result.answer, "核心问题是依赖没有被正确链接。");
  assert.equal(session.codexModel, "gpt-5.4-mini");

  const historyResponse = await fetch(`${baseUrl}/api/sessions`, {
    headers: {
      authorization: "Bearer test-token"
    }
  });
  const history = await historyResponse.json();
  assert.equal(history.sessions.length, 1);
  assert.equal(history.sessions[0].id, sessionId);
  assert.equal(history.sessions[0].codexModel, "gpt-5.4-mini");

  const imageResponse = await fetch(`${baseUrl}/api/sessions/${sessionId}/image`, {
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(imageResponse.status, 200);

  ws.close();
  await agent.close();
});
