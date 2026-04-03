import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { createAgentServer } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import type { LocalRuntimeManagerLike } from "../src/local-runtime-manager.js";
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
    iphonePublicDir: join(process.cwd(), "apps", "iphone-web", "public"),
    macWebPublicDir: join(process.cwd(), "apps", "mac-web", "public"),
    overlayPublicDir: join(process.cwd(), "apps", "overlay", "public"),
    schemaPath: join(process.cwd(), "shared", "schemas", "codex-output.schema.json"),
    dataDir,
    sessionsDir: join(dataDir, "sessions"),
    tokenFilePath: join(dataDir, "pairing-token.txt"),
    settingsFilePath: join(dataDir, "settings.json"),
    promptTemplateFilePath: join(dataDir, "prompt-template.txt"),
    codexModelsCachePath: join(dataDir, "models_cache.json"),
    defaultModelProvider: "codex",
    defaultCodexModel: "gpt-5.4",
    defaultCodexReasoningEffort: "high",
    defaultLocalVisionModel: "qwen3-vl:8b",
    codexBin: "codex",
    lmStudioBin: "lms",
    ollamaBin: "ollama",
    captureBackend: "macos",
    captureBin: "/usr/sbin/screencapture",
    windowsCaptureScriptPath: join(process.cwd(), "scripts", "windows", "capture-screen.ps1"),
    codexTimeoutMs: 5_000,
    lmStudioHost: "http://127.0.0.1:1234",
    ollamaHost: "http://127.0.0.1:11434",
    openaiBaseUrl: "https://api.openai.com",
    defaultCloudModel: "",
    defaultCloudApiKey: "",
    serviceName: "Test Agent",
    pairingTokenEnv: "test-token"
  };

  let launchedCodexLogin = false;
  let shutdownRequested = false;
  let lastPrompt = "";
  const runtimeJobs = new Map<string, any>();
  let runtimeJobCounter = 0;
  const localRuntimeManager: LocalRuntimeManagerLike = {
    async getStatus() {
      return {
        runtimes: {
          lmstudio: {
            slug: "lmstudio",
            displayName: "LM Studio (MLX)",
            installed: true,
            cliAvailable: true,
            executablePath: "/usr/local/bin/lms",
            appDetected: true,
            appPath: "/Applications/LM Studio.app",
            installUrl: "https://lmstudio.ai/",
            serverHost: "http://127.0.0.1:1234",
            serverRunning: true,
            modelsDirHint: "~/.lmstudio/models",
            supportsManagedDelete: false,
            downloadedModels: [{ id: "qwen/qwen3-vl-8b", label: "Qwen3-VL-8B" }],
            loadedModels: [{ id: "qwen/qwen3-vl-8b", label: "Qwen3-VL-8B", identifier: "qwen3-vl:8b" }],
            notes: ["LM Studio runtime managed"]
          },
          ollama: {
            slug: "ollama",
            displayName: "本地 Ollama",
            installed: true,
            cliAvailable: true,
            executablePath: "/usr/local/bin/ollama",
            appDetected: true,
            appPath: "/Applications/Ollama.app",
            installUrl: "https://ollama.com/download",
            serverHost: "http://127.0.0.1:11434",
            serverRunning: false,
            modelsDirHint: "~/.ollama/models",
            supportsManagedDelete: true,
            downloadedModels: [{ id: "qwen3-vl:8b", label: "qwen3-vl:8b" }],
            loadedModels: [],
            notes: ["Ollama runtime managed"]
          }
        },
        jobs: Array.from(runtimeJobs.values())
      };
    },
    async getJob(jobId) {
      return runtimeJobs.get(jobId) ?? null;
    },
    async runOperation(input) {
      runtimeJobCounter += 1;
      const job = {
        id: `job-${runtimeJobCounter}`,
        runtime: input.runtime,
        action: input.action,
        modelSlug: input.modelSlug,
        identifier: input.identifier,
        status: "done" as const,
        summary: `${input.runtime}:${input.action}:done`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        logs: [`${input.runtime} ${input.action}`]
      };
      runtimeJobs.set(job.id, job);
      return job;
    },
    async close() {}
  };

  const agent = await createAgentServer({
    config,
    localRuntimeManager,
    captureCommandRunner: async (_command, args) => {
      const outputPath = args.at(-1);
      assert.ok(outputPath);
      await writeFile(outputPath, Buffer.alloc(1024, 0xff));
    },
    spawnProcess: (_command, args) => {
      const child = new StubProcess();
      lastPrompt = "";
      child.stdin.on("data", (chunk) => {
        lastPrompt += chunk.toString("utf8");
      });
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
    },
    onShutdownRequested: () => {
      shutdownRequested = true;
    }
  });

  const { port } = await agent.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  const unauthorizedResponse = await fetch(`${baseUrl}/api/sessions`);
  assert.equal(unauthorizedResponse.status, 200);

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
  assert.equal(settings.codexReasoningEffort, "high");

  const promptTemplateResponse = await fetch(`${baseUrl}/api/prompt-template`, {
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(promptTemplateResponse.status, 200);
  const promptTemplate = await promptTemplateResponse.json();
  assert.match(promptTemplate.promptTemplate, /算法题屏幕解析与求解助手/);
  assert.match(promptTemplate.defaultPromptTemplate, /\{\{question\}\}/);

  const savePromptTemplateResponse = await fetch(`${baseUrl}/api/prompt-template`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      promptTemplate: "你是调试提示词。\n用户问题：{{question}}\n前台应用：{{frontmostApp}}"
    })
  });
  assert.equal(savePromptTemplateResponse.status, 200);

  const localConsoleInfoResponse = await fetch(`${baseUrl}/api/local-console-info`, {
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(localConsoleInfoResponse.status, 200);
  const localConsoleInfo = await localConsoleInfoResponse.json();
  assert.equal(localConsoleInfo.pairingToken, "test-token");
  assert.equal(localConsoleInfo.macWebUrl, `${baseUrl}/desktop`);
  assert.equal(localConsoleInfo.iphoneUrl, `${baseUrl}/`);

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

  const runtimeStatusResponse = await fetch(`${baseUrl}/api/local-runtimes/status`, {
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(runtimeStatusResponse.status, 200);
  const runtimeStatus = await runtimeStatusResponse.json();
  assert.equal(runtimeStatus.runtimes.lmstudio.serverRunning, true);
  assert.equal(runtimeStatus.runtimes.ollama.supportsManagedDelete, true);

  const runtimeJobStartResponse = await fetch(`${baseUrl}/api/local-runtimes/lmstudio/download-model`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "qwen3-vl:8b"
    })
  });
  assert.equal(runtimeJobStartResponse.status, 202);
  const runtimeJob = await runtimeJobStartResponse.json();
  assert.equal(runtimeJob.runtime, "lmstudio");
  assert.equal(runtimeJob.action, "download_model");

  const runtimeJobResponse = await fetch(`${baseUrl}/api/local-runtimes/jobs/${runtimeJob.id}`, {
    headers: {
      authorization: "Bearer test-token"
    }
  });
  assert.equal(runtimeJobResponse.status, 200);
  const runtimeJobDetail = await runtimeJobResponse.json();
  assert.equal(runtimeJobDetail.status, "done");
  assert.equal(runtimeJobDetail.logs[0], "lmstudio download_model");

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
  assert.match(lastPrompt, /你是调试提示词。/);
  assert.match(lastPrompt, /用户问题：请总结当前屏幕里的关键问题。/);

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
  const stopResponse = await fetch(`${baseUrl}/api/local-control/stop`, {
    method: "POST"
  });
  assert.equal(stopResponse.status, 202);
  for (let index = 0; index < 20 && !shutdownRequested; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(shutdownRequested, true);
  await agent.close();
});
