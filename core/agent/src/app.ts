import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import type { AppConfig } from "./config.js";
import { resolveConfig } from "./config.js";
import { captureScreen, type SimpleCommandRunner } from "./capture.js";
import { launchCodexLoginInTerminal, readCodexLoginStatus, type LaunchCodexLogin } from "./codex-login.js";
import { runCodexAnalysis, type SpawnProcess } from "./codex.js";
import { loadCodexModelCatalog } from "./model-catalog.js";
import { SessionStore } from "./session-store.js";
import { SettingsStore, sanitizeCodexModel } from "./settings-store.js";
import type {
  AgentConfigPayload,
  CaptureTarget,
  SessionRecord,
  SessionStatus,
  SupportedCaptureTarget
} from "./types.js";
import { SUPPORTED_CAPTURE_TARGETS } from "./types.js";
import {
  ensureDir,
  getLocalIpv4Addresses,
  jsonResponse,
  nowIso,
  pathExists,
  readJsonBody,
  safeTokenEqual,
  toErrorMessage
} from "./utils.js";
import { attachWebSocketServer, type WebSocketHub } from "./websocket.js";

interface AnalyzeRequest {
  question?: string;
  captureTarget?: CaptureTarget;
}

export interface AgentServer {
  config: AppConfig;
  server: Server;
  pairingToken: string;
  start(): Promise<{ port: number; urls: string[] }>;
  close(): Promise<void>;
}

export async function createAgentServer(input?: {
  config?: AppConfig;
  store?: SessionStore;
  settingsStore?: SettingsStore;
  captureCommandRunner?: SimpleCommandRunner;
  spawnProcess?: SpawnProcess;
  launchCodexLogin?: LaunchCodexLogin;
  logger?: Pick<Console, "log" | "error">;
}): Promise<AgentServer> {
  const config = input?.config ?? resolveConfig();
  await ensureDir(config.dataDir);

  const store = input?.store ?? new SessionStore(config);
  const settingsStore = input?.settingsStore ?? new SettingsStore(config);
  const availableModels = await loadCodexModelCatalog(config.codexModelsCachePath);
  const logger = input?.logger ?? console;
  const pairingToken = await store.initialize(config.pairingTokenEnv);
  const initialSettings = await settingsStore.initialize();

  const hubState: {
    hub?: WebSocketHub;
  } = {};

  const server = createServer(async (request, response) => {
    try {
      await routeRequest({
        config,
        store,
        settingsStore,
        availableModels,
        initialSettings,
        pairingToken,
        request,
        response,
        hubState,
        captureCommandRunner: input?.captureCommandRunner,
        spawnProcess: input?.spawnProcess,
        launchCodexLogin: input?.launchCodexLogin
      });
    } catch (error) {
      logger.error(error);
      sendJson(response, 500, { error: toErrorMessage(error) });
    }
  });

  hubState.hub = attachWebSocketServer(server, {
    path: "/ws",
    verifyToken: (token) => Boolean(token) && safeTokenEqual(pairingToken, token!)
  });

  return {
    config,
    server,
    pairingToken,
    async start() {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          server.off("error", reject);
          resolve();
        });
      });

      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Failed to resolve listening address");
      }

      const urls = [
        `http://127.0.0.1:${address.port}`,
        ...getLocalIpv4Addresses().map((ip) => `http://${ip}:${address.port}`)
      ];

      return {
        port: address.port,
        urls
      };
    },

    async close() {
      hubState.hub?.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

async function routeRequest(input: {
  config: AppConfig;
  store: SessionStore;
  settingsStore: SettingsStore;
  availableModels: AgentConfigPayload["codexModels"];
  initialSettings: { codexModel: string };
  pairingToken: string;
  request: IncomingMessage;
  response: ServerResponse;
  hubState: { hub?: WebSocketHub };
  captureCommandRunner?: SimpleCommandRunner;
  spawnProcess?: SpawnProcess;
  launchCodexLogin?: LaunchCodexLogin;
}): Promise<void> {
  const method = input.request.method || "GET";
  const url = new URL(input.request.url || "/", "http://localhost");
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/api/config") {
    const payload: AgentConfigPayload = {
      serviceName: input.config.serviceName,
      auth: {
        pairingRequired: true
      },
      capabilities: {
        captureTargets: SUPPORTED_CAPTURE_TARGETS,
        websocketPath: "/ws",
        history: true,
        settings: true
      },
      defaults: {
        captureTarget: "main_display",
        codexModel: input.initialSettings.codexModel
      },
      codexModels: input.availableModels
    };

    sendJson(input.response, 200, payload);
    return;
  }

  if (method === "POST" && pathname === "/api/pair") {
    const body = await readJsonBody<{ token?: string }>(input.request);
    if (!body.token || !safeTokenEqual(input.pairingToken, body.token)) {
      sendJson(input.response, 401, { error: "Invalid pairing token" });
      return;
    }

    sendJson(input.response, 200, { ok: true });
    return;
  }

  if (pathname.startsWith("/api/")) {
    if (!isAuthorized(input.request, input.pairingToken)) {
      sendJson(input.response, 401, { error: "Unauthorized" });
      return;
    }

    if (method === "POST" && pathname === "/api/analyze") {
      const body = await readJsonBody<AnalyzeRequest>(input.request);
      const captureTarget = body.captureTarget ?? "main_display";
      const settings = await input.settingsStore.getSettings();

      if (captureTarget !== "main_display") {
        sendJson(input.response, 400, {
          error: `Unsupported captureTarget: ${captureTarget}`
        });
        return;
      }

      const session = await input.store.createSession({
        question: (body.question || "").trim(),
        captureTarget,
        codexModel: settings.codexModel
      });

      input.hubState.hub?.broadcast({
        sessionId: session.id,
        status: "queued",
        progressMessage: "Request queued"
      });

      void processAnalysisSession({
        config: input.config,
        store: input.store,
        hub: input.hubState.hub,
        sessionId: session.id,
        captureTarget,
        codexModel: settings.codexModel,
        question: session.question,
        captureCommandRunner: input.captureCommandRunner,
        spawnProcess: input.spawnProcess
      });

      sendJson(input.response, 202, { sessionId: session.id });
      return;
    }

    if (method === "GET" && pathname === "/api/sessions") {
      sendJson(input.response, 200, {
        sessions: await input.store.listSessions()
      });
      return;
    }

    if (method === "GET" && pathname === "/api/settings") {
      sendJson(input.response, 200, await input.settingsStore.getSettings());
      return;
    }

    if (method === "POST" && pathname === "/api/settings") {
      const body = await readJsonBody<{ codexModel?: string }>(input.request);
      const nextModel = sanitizeCodexModel(body.codexModel, "");

      if (!nextModel) {
        sendJson(input.response, 400, { error: "codexModel is required" });
        return;
      }

      const settings = await input.settingsStore.saveSettings({
        codexModel: nextModel
      });
      sendJson(input.response, 200, settings);
      return;
    }

    if (method === "GET" && pathname === "/api/codex-auth/status") {
      const status = await readCodexLoginStatus({
        codexBin: input.config.codexBin,
        workspaceRoot: input.config.workspaceRoot,
        spawnProcess: input.spawnProcess
      });
      sendJson(input.response, 200, status);
      return;
    }

    if (method === "POST" && pathname === "/api/codex-auth/start") {
      const launchCodexLogin = input.launchCodexLogin ?? launchCodexLoginInTerminal;
      await launchCodexLogin({
        codexBin: input.config.codexBin,
        workspaceRoot: input.config.workspaceRoot
      });
      sendJson(input.response, 202, {
        ok: true,
        message: "Codex login flow started in Terminal"
      });
      return;
    }

    if (method === "POST" && pathname === "/api/test/capture") {
      const imagePath = manualCaptureImagePath(input.config);
      await ensureDir(manualTestsDir(input.config));
      await captureScreen({
        captureBin: input.config.captureBin,
        captureTarget: "main_display",
        outputPath: imagePath,
        runCommand: input.captureCommandRunner
      });

      sendJson(input.response, 200, {
        capturedAt: nowIso(),
        imageUrl: "/api/test/capture/image",
        captureTarget: "main_display"
      });
      return;
    }

    if (method === "GET" && pathname === "/api/test/capture/image") {
      const imagePath = manualCaptureImagePath(input.config);
      if (!(await pathExists(imagePath))) {
        sendJson(input.response, 404, { error: "Capture image not found" });
        return;
      }

      input.response.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "no-store"
      });
      createReadStream(imagePath).pipe(input.response);
      return;
    }

    if (method === "POST" && pathname === "/api/test/model") {
      const body = await readJsonBody<{ question?: string }>(input.request);
      const settings = await input.settingsStore.getSettings();
      const imagePath = manualModelImagePath(input.config);
      const question = (body.question || "").trim() || "请总结当前屏幕最重要的信息，并说明是否存在错误或阻塞。";

      await ensureDir(manualTestsDir(input.config));
      await captureScreen({
        captureBin: input.config.captureBin,
        captureTarget: "main_display",
        outputPath: imagePath,
        runCommand: input.captureCommandRunner
      });

      const analysis = await runCodexAnalysis({
        config: input.config,
        imagePath,
        question,
        captureTarget: "main_display",
        codexModel: settings.codexModel,
        spawnProcess: input.spawnProcess
      });

      const payload = {
        capturedAt: nowIso(),
        question,
        codexModel: settings.codexModel,
        imageUrl: "/api/test/model/image",
        result: analysis.result,
        rawMessage: analysis.rawMessage
      };

      await fs.writeFile(manualModelResultPath(input.config), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      sendJson(input.response, 200, payload);
      return;
    }

    if (method === "GET" && pathname === "/api/test/model/image") {
      const imagePath = manualModelImagePath(input.config);
      if (!(await pathExists(imagePath))) {
        sendJson(input.response, 404, { error: "Model test image not found" });
        return;
      }

      input.response.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "no-store"
      });
      createReadStream(imagePath).pipe(input.response);
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/sessions/") && pathname.endsWith("/image")) {
      const sessionId = pathname.split("/")[3];
      const session = await input.store.getSession(sessionId);

      if (!session?.imagePath || !(await pathExists(session.imagePath))) {
        sendJson(input.response, 404, { error: "Image not found" });
        return;
      }

      input.response.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "no-store"
      });
      createReadStream(session.imagePath).pipe(input.response);
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/sessions/")) {
      const sessionId = pathname.split("/")[3];
      const session = await input.store.getSession(sessionId);

      if (!session) {
        sendJson(input.response, 404, { error: "Session not found" });
        return;
      }

      sendJson(input.response, 200, session);
      return;
    }

    sendJson(input.response, 404, { error: "Not found" });
    return;
  }

  if (method === "GET") {
    await serveStatic(input.response, input.config.publicDir, pathname);
    return;
  }

  sendJson(input.response, 405, { error: "Method not allowed" });
}

async function processAnalysisSession(input: {
  config: AppConfig;
  store: SessionStore;
  hub?: WebSocketHub;
  sessionId: string;
  captureTarget: SupportedCaptureTarget;
  codexModel: string;
  question: string;
  captureCommandRunner?: SimpleCommandRunner;
  spawnProcess?: SpawnProcess;
}): Promise<void> {
  try {
    await transitionSession(input.store, input.hub, input.sessionId, "capturing", "Capturing main display", (record) => {
      record.error = undefined;
    });

    const imagePath = input.store.imageFilePath(input.sessionId);
    await captureScreen({
      captureBin: input.config.captureBin,
      captureTarget: input.captureTarget,
      outputPath: imagePath,
      runCommand: input.captureCommandRunner
    });

    await transitionSession(input.store, input.hub, input.sessionId, "capturing", "Screenshot captured", (record) => {
      record.imagePath = imagePath;
    });

    await transitionSession(input.store, input.hub, input.sessionId, "analyzing", "Submitting screenshot to Codex");

    const analysis = await runCodexAnalysis({
      config: input.config,
      imagePath,
      question: input.question,
      captureTarget: input.captureTarget,
      codexModel: input.codexModel,
      spawnProcess: input.spawnProcess,
      onProgress: async (message) => {
        await transitionSession(input.store, input.hub, input.sessionId, "analyzing", message);
      }
    });

    await transitionSession(input.store, input.hub, input.sessionId, "done", "Analysis completed", (record) => {
      record.result = analysis.result;
      record.error = undefined;
    });
  } catch (error) {
    await transitionSession(input.store, input.hub, input.sessionId, "error", "Analysis failed", (record) => {
      record.error = toErrorMessage(error);
    });
  }
}

async function transitionSession(
  store: SessionStore,
  hub: WebSocketHub | undefined,
  sessionId: string,
  status: SessionStatus,
  progressMessage?: string,
  mutate?: (record: SessionRecord) => void
): Promise<void> {
  const session = await store.updateSession(sessionId, (record) => {
    if (mutate) {
      mutate(record);
    }
    record.updatedAt = nowIso();
    store.withStatus(record, status, progressMessage);
  });

  hub?.broadcast({
    sessionId,
    status,
    progressMessage,
    payload: status === "done" ? { result: session.result } : status === "error" ? { error: session.error } : undefined
  });
}

function isAuthorized(request: IncomingMessage, pairingToken: string): boolean {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return false;
  }

  return safeTokenEqual(pairingToken, header.slice("Bearer ".length));
}

async function serveStatic(response: ServerResponse, publicDir: string, pathname: string): Promise<void> {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const sanitized = normalize(normalizedPath)
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(publicDir, sanitized);

  if (!(await pathExists(filePath))) {
    const fallback = join(publicDir, "index.html");
    const html = await fs.readFile(fallback, "utf8");
    sendResponse(response, 200, html, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    return;
  }

  const contentType = contentTypeForPath(filePath);
  const content = await fs.readFile(filePath);
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  response.end(content);
}

function contentTypeForPath(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const json = jsonResponse(statusCode, payload);
  sendResponse(response, json.statusCode, json.body, json.headers);
}

function sendResponse(
  response: ServerResponse,
  statusCode: number,
  body: string,
  headers: Record<string, string>
): void {
  response.writeHead(statusCode, headers);
  response.end(body);
}

function manualTestsDir(config: Pick<AppConfig, "dataDir">): string {
  return join(config.dataDir, "manual-tests");
}

function manualCaptureImagePath(config: Pick<AppConfig, "dataDir">): string {
  return join(manualTestsDir(config), "last-capture.png");
}

function manualModelImagePath(config: Pick<AppConfig, "dataDir">): string {
  return join(manualTestsDir(config), "last-model-capture.png");
}

function manualModelResultPath(config: Pick<AppConfig, "dataDir">): string {
  return join(manualTestsDir(config), "last-model-output.json");
}
