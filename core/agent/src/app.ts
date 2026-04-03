import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { ActivityStore } from "./activity-store.js";
import type { AppConfig } from "./config.js";
import { resolveConfig } from "./config.js";
import { captureScreen, type SimpleCommandRunner } from "./capture.js";
import { launchCodexLoginInTerminal, readCodexLoginStatus, type LaunchCodexLogin } from "./codex-login.js";
import { runCodexAnalysis, type SpawnProcess } from "./codex.js";
import { LocalRuntimeManager, type LocalRuntimeManagerLike } from "./local-runtime-manager.js";
import { runClaudeVisionAnalysis } from "./claude-vision.js";
import { runLmStudioVisionAnalysis } from "./lmstudio-vision.js";
import { runOllamaVisionAnalysis } from "./local-vision.js";
import { runOpenAIVisionAnalysis } from "./openai-vision.js";
import { DEFAULT_ANALYSIS_PROMPT_TEMPLATE } from "./prompt.js";
import { PromptTemplateStore } from "./prompt-store.js";
import {
  loadCloudModelCatalog,
  loadCodexModelCatalog,
  loadCodexReasoningEffortCatalog,
  loadLocalVisionModelCatalog,
  loadModelProviderCatalog
} from "./model-catalog.js";
import { SessionStore } from "./session-store.js";
import { SettingsStore } from "./settings-store.js";
import type {
  AgentConfigPayload,
  CaptureTarget,
  ClientSource,
  LocalConsoleInfoPayload,
  ModelProvider,
  PromptTemplatePayload,
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
  localRuntimeManager?: LocalRuntimeManagerLike;
  promptTemplateStore?: PromptTemplateStore;
  onShutdownRequested?: () => void | Promise<void>;
  logger?: Pick<Console, "log" | "error">;
}): Promise<AgentServer> {
  const config = input?.config ?? resolveConfig();
  await ensureDir(config.dataDir);

  const store = input?.store ?? new SessionStore(config);
  const settingsStore = input?.settingsStore ?? new SettingsStore(config);
  const availableModels = await loadCodexModelCatalog(config.codexModelsCachePath);
  const availableReasoningEfforts = loadCodexReasoningEffortCatalog();
  const localVisionModels = loadLocalVisionModelCatalog();
  const claudeModels = loadCloudModelCatalog("claude");
  const openaiModels = loadCloudModelCatalog("openai");
  const availableProviders = loadModelProviderCatalog();
  const logger = input?.logger ?? console;
  const pairingToken = await store.initialize(config.pairingTokenEnv);
  const initialSettings = await settingsStore.initialize();
  const activityStore = new ActivityStore();
  const localRuntimeManager =
    input?.localRuntimeManager ??
    new LocalRuntimeManager({
      workspaceRoot: config.workspaceRoot,
      lmStudioBin: config.lmStudioBin,
      ollamaBin: config.ollamaBin,
      lmStudioHost: config.lmStudioHost,
      ollamaHost: config.ollamaHost
    });
  const promptTemplateStore = input?.promptTemplateStore ?? new PromptTemplateStore(config);
  const promptTemplateState = {
    value: await promptTemplateStore.initialize()
  };

  const hubState: {
    hub?: WebSocketHub;
  } = {};
  let closePromise: Promise<void> | null = null;

  const closeServer = async () => {
    if (closePromise) {
      return await closePromise;
    }

    closePromise = (async () => {
      hubState.hub?.close();
      await localRuntimeManager.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    })();

    return await closePromise;
  };

  const requestShutdown = () => {
    setTimeout(() => {
      if (input?.onShutdownRequested) {
        void input.onShutdownRequested();
        return;
      }

      void closeServer().catch((error) => {
        logger.error(error);
      });
    }, 120);
  };

  const server = createServer(async (request, response) => {
    try {
      await routeRequest({
        config,
        store,
        settingsStore,
        availableModels,
        availableReasoningEfforts,
        localVisionModels,
        claudeModels,
        openaiModels,
        availableProviders,
        initialSettings,
        pairingToken,
        request,
        response,
        hubState,
        captureCommandRunner: input?.captureCommandRunner,
        spawnProcess: input?.spawnProcess,
        launchCodexLogin: input?.launchCodexLogin,
        localRuntimeManager,
        promptTemplateStore,
        promptTemplateState,
        requestShutdown,
        activityStore
      });
    } catch (error) {
      logger.error(error);
      sendJson(response, 500, { error: toErrorMessage(error) });
    }
  });

  hubState.hub = attachWebSocketServer(server, {
    path: "/ws",
    verifyRequest: (request, token) => isAuthorized(request, pairingToken, token)
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
      await closeServer();
    }
  };
}

async function routeRequest(input: {
  config: AppConfig;
  store: SessionStore;
  settingsStore: SettingsStore;
  availableModels: AgentConfigPayload["codexModels"];
  availableReasoningEfforts: AgentConfigPayload["codexReasoningEfforts"];
  localVisionModels: AgentConfigPayload["localVisionModels"];
  claudeModels: AgentConfigPayload["claudeModels"];
  openaiModels: AgentConfigPayload["openaiModels"];
  availableProviders: AgentConfigPayload["modelProviders"];
  initialSettings: {
    modelProvider: ModelProvider;
    codexModel: string;
    codexReasoningEffort: "low" | "medium" | "high";
    localVisionModel: string;
  };
  pairingToken: string;
  request: IncomingMessage;
  response: ServerResponse;
  hubState: { hub?: WebSocketHub };
  captureCommandRunner?: SimpleCommandRunner;
  spawnProcess?: SpawnProcess;
  launchCodexLogin?: LaunchCodexLogin;
  localRuntimeManager: LocalRuntimeManagerLike;
  promptTemplateStore: PromptTemplateStore;
  promptTemplateState: { value: string };
  requestShutdown: () => void;
  activityStore: ActivityStore;
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
        modelProvider: input.initialSettings.modelProvider,
        codexModel: input.initialSettings.codexModel,
        codexReasoningEffort: input.initialSettings.codexReasoningEffort,
        localVisionModel: input.initialSettings.localVisionModel
      },
      modelProviders: input.availableProviders,
      codexModels: input.availableModels,
      codexReasoningEfforts: input.availableReasoningEfforts,
      localVisionModels: input.localVisionModels,
      claudeModels: input.claudeModels,
      openaiModels: input.openaiModels
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

    const source = detectClientSource(input.request);
    if (source !== "unknown") {
      const activity = input.activityStore.record({
        source,
        action: "pair",
        message: `${clientSourceLabel(source)} 完成配对`
      });
      input.hubState.hub?.broadcast({
        type: "activity",
        activity
      });
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
      const source = detectClientSource(input.request);

      if (captureTarget !== "main_display") {
        sendJson(input.response, 400, {
          error: `Unsupported captureTarget: ${captureTarget}`
        });
        return;
      }

      const session = await input.store.createSession({
        question: (body.question || "").trim(),
        captureTarget,
        modelProvider: settings.modelProvider,
        codexModel: resolveSelectedModel(settings),
        codexReasoningEffort: settings.codexReasoningEffort
      });

      const requestedActivity = input.activityStore.record({
        source,
        action: "analyze_requested",
        sessionId: session.id,
        message: `${clientSourceLabel(source)} 发起分析请求`,
        question: session.question
      });
      input.hubState.hub?.broadcast({
        type: "activity",
        activity: requestedActivity
      });

      input.hubState.hub?.broadcast({
        type: "session_status",
        sessionId: session.id,
        status: "queued",
        progressMessage: "Request queued",
        source
      });

      void processAnalysisSession({
        config: input.config,
        store: input.store,
        activityStore: input.activityStore,
        hub: input.hubState.hub,
        sessionId: session.id,
        captureTarget,
        modelProvider: settings.modelProvider,
        modelName: resolveSelectedModel(settings),
        codexReasoningEffort: settings.codexReasoningEffort,
        cloudApiKey: settings.cloudApiKey,
        promptTemplate: input.promptTemplateState.value,
        question: session.question,
        clientSource: source,
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

    if (method === "GET" && pathname === "/api/activities") {
      sendJson(input.response, 200, {
        activities: input.activityStore.list()
      });
      return;
    }

    if (method === "GET" && pathname === "/api/prompt-template") {
      const payload: PromptTemplatePayload = {
        promptTemplate: input.promptTemplateState.value,
        defaultPromptTemplate: DEFAULT_ANALYSIS_PROMPT_TEMPLATE
      };
      sendJson(input.response, 200, payload);
      return;
    }

    if (method === "POST" && pathname === "/api/settings") {
      const body = await readJsonBody<{
        modelProvider?: ModelProvider;
        codexModel?: string;
        codexReasoningEffort?: "low" | "medium" | "high";
        localVisionModel?: string;
        cloudModel?: string;
        cloudApiKey?: string;
      }>(input.request);

      const settings = await input.settingsStore.saveSettings({
        modelProvider: body.modelProvider,
        codexModel: body.codexModel,
        codexReasoningEffort: body.codexReasoningEffort,
        localVisionModel: body.localVisionModel,
        cloudModel: body.cloudModel,
        cloudApiKey: body.cloudApiKey
      });
      sendJson(input.response, 200, settings);
      return;
    }

    if (method === "POST" && pathname === "/api/prompt-template") {
      const body = await readJsonBody<{
        promptTemplate?: string;
      }>(input.request);

      if (typeof body.promptTemplate !== "string") {
        sendJson(input.response, 400, { error: "promptTemplate must be a string" });
        return;
      }

      const promptTemplate = await input.promptTemplateStore.savePromptTemplate(body.promptTemplate);
      input.promptTemplateState.value = promptTemplate;

      const payload: PromptTemplatePayload = {
        promptTemplate,
        defaultPromptTemplate: DEFAULT_ANALYSIS_PROMPT_TEMPLATE
      };
      sendJson(input.response, 200, payload);
      return;
    }

    if (method === "GET" && pathname === "/api/local-console-info") {
      if (!isLoopbackRequest(input.request)) {
        sendJson(input.response, 403, { error: "Local console info is only available on loopback requests" });
        return;
      }

      const localPort = input.request.socket.localPort ?? input.config.port;
      const payload: LocalConsoleInfoPayload = {
        pairingToken: input.pairingToken,
        macWebUrl: `http://127.0.0.1:${localPort}/desktop`,
        iphoneUrl: `http://127.0.0.1:${localPort}/`,
        phoneUrls: getLocalIpv4Addresses().map((ip) => `http://${ip}:${localPort}/`)
      };

      sendJson(input.response, 200, payload);
      return;
    }

    if (method === "POST" && pathname === "/api/local-control/stop") {
      if (!isLoopbackRequest(input.request)) {
        sendJson(input.response, 403, { error: "Stopping the local agent is only available on loopback requests" });
        return;
      }

      sendJson(input.response, 202, {
        ok: true,
        message: "Local agent shutdown requested"
      });
      input.requestShutdown();
      return;
    }

    if (method === "GET" && pathname === "/api/local-runtimes/status") {
      sendJson(input.response, 200, await input.localRuntimeManager.getStatus());
      return;
    }

    if (method === "GET" && pathname.startsWith("/api/local-runtimes/jobs/")) {
      const jobId = pathname.split("/")[4];
      const job = await input.localRuntimeManager.getJob(jobId);
      if (!job) {
        sendJson(input.response, 404, { error: "Runtime job not found" });
        return;
      }

      sendJson(input.response, 200, job);
      return;
    }

    if (method === "POST" && pathname === "/api/local-runtimes/lmstudio/server/start") {
      sendJson(
        input.response,
        202,
        await input.localRuntimeManager.runOperation({
          runtime: "lmstudio",
          action: "start_server"
        })
      );
      return;
    }

    if (method === "POST" && pathname === "/api/local-runtimes/lmstudio/download-model") {
      const body = await readJsonBody<{ model?: string }>(input.request);
      const settings = await input.settingsStore.getSettings();
      sendJson(
        input.response,
        202,
        await input.localRuntimeManager.runOperation({
          runtime: "lmstudio",
          action: "download_model",
          modelSlug: (body.model || settings.localVisionModel).trim()
        })
      );
      return;
    }

    if (method === "POST" && pathname === "/api/local-runtimes/lmstudio/load-model") {
      const body = await readJsonBody<{ model?: string; identifier?: string }>(input.request);
      const settings = await input.settingsStore.getSettings();
      const modelSlug = (body.model || settings.localVisionModel).trim();
      sendJson(
        input.response,
        202,
        await input.localRuntimeManager.runOperation({
          runtime: "lmstudio",
          action: "load_model",
          modelSlug,
          identifier: (body.identifier || modelSlug).trim()
        })
      );
      return;
    }

    if (method === "POST" && pathname === "/api/local-runtimes/lmstudio/unload-model") {
      const body = await readJsonBody<{ model?: string; identifier?: string }>(input.request);
      const settings = await input.settingsStore.getSettings();
      const modelSlug = (body.model || settings.localVisionModel).trim();
      sendJson(
        input.response,
        202,
        await input.localRuntimeManager.runOperation({
          runtime: "lmstudio",
          action: "unload_model",
          modelSlug,
          identifier: (body.identifier || modelSlug).trim()
        })
      );
      return;
    }

    if (method === "POST" && pathname === "/api/local-runtimes/ollama/server/start") {
      sendJson(
        input.response,
        202,
        await input.localRuntimeManager.runOperation({
          runtime: "ollama",
          action: "start_server"
        })
      );
      return;
    }

    if (method === "POST" && pathname === "/api/local-runtimes/ollama/pull-model") {
      const body = await readJsonBody<{ model?: string }>(input.request);
      const settings = await input.settingsStore.getSettings();
      sendJson(
        input.response,
        202,
        await input.localRuntimeManager.runOperation({
          runtime: "ollama",
          action: "download_model",
          modelSlug: (body.model || settings.localVisionModel).trim()
        })
      );
      return;
    }

    if (method === "POST" && pathname === "/api/local-runtimes/ollama/unload-model") {
      const body = await readJsonBody<{ model?: string }>(input.request);
      const settings = await input.settingsStore.getSettings();
      const modelSlug = (body.model || settings.localVisionModel).trim();
      sendJson(
        input.response,
        202,
        await input.localRuntimeManager.runOperation({
          runtime: "ollama",
          action: "unload_model",
          modelSlug,
          identifier: modelSlug
        })
      );
      return;
    }

    if (method === "POST" && pathname === "/api/local-runtimes/ollama/remove-model") {
      const body = await readJsonBody<{ model?: string }>(input.request);
      const settings = await input.settingsStore.getSettings();
      const modelSlug = (body.model || settings.localVisionModel).trim();
      sendJson(
        input.response,
        202,
        await input.localRuntimeManager.runOperation({
          runtime: "ollama",
          action: "remove_model",
          modelSlug,
          identifier: modelSlug
        })
      );
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

    if (method === "POST" && pathname === "/api/overlay/control") {
      const body = await readJsonBody<{
        action: string;
        value?: number;
        sessionId?: string;
      }>(input.request);

      input.hubState.hub?.broadcast({
        type: "overlay_control",
        action: body.action,
        value: body.value,
        sessionId: body.sessionId
      });

      sendJson(input.response, 200, { ok: true });
      return;
    }

    if (method === "POST" && pathname === "/api/test/capture") {
      const imagePath = manualCaptureImagePath(input.config);
      await ensureDir(manualTestsDir(input.config));
      await captureScreen({
        captureBackend: input.config.captureBackend,
        captureBin: input.config.captureBin,
        windowsCaptureScriptPath: input.config.windowsCaptureScriptPath,
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
      const question =
        (body.question || "").trim() ||
        "请识别这道算法题，提取题意与约束，给出解题思路、复杂度分析和可直接提交的完整代码。如果题面看不清，请明确说明不确定点。";

      await ensureDir(manualTestsDir(input.config));
      await captureScreen({
        captureBackend: input.config.captureBackend,
        captureBin: input.config.captureBin,
        windowsCaptureScriptPath: input.config.windowsCaptureScriptPath,
        captureTarget: "main_display",
        outputPath: imagePath,
        runCommand: input.captureCommandRunner
      });

      const selectedModel = resolveSelectedModel(settings);
      const analysisResult = await runConfiguredAnalysis({
        config: input.config,
        imagePath,
        question,
        captureTarget: "main_display",
        promptTemplate: input.promptTemplateState.value,
        modelProvider: settings.modelProvider,
        modelName: selectedModel,
        codexReasoningEffort: settings.codexReasoningEffort,
        cloudApiKey: settings.cloudApiKey,
        spawnProcess: input.spawnProcess,
        onProgress: undefined
      });

      const payload = {
        capturedAt: nowIso(),
        question,
        modelProvider: settings.modelProvider,
        codexModel: selectedModel,
        codexReasoningEffort: settings.codexReasoningEffort,
        imageUrl: "/api/test/model/image",
        result: analysisResult.result,
        rawMessage: analysisResult.rawMessage
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
    await serveStatic(input.response, input.config, pathname);
    return;
  }

  sendJson(input.response, 405, { error: "Method not allowed" });
}

async function processAnalysisSession(input: {
  config: AppConfig;
  store: SessionStore;
  activityStore: ActivityStore;
  hub?: WebSocketHub;
  sessionId: string;
  captureTarget: SupportedCaptureTarget;
  modelProvider: ModelProvider;
  modelName: string;
  codexReasoningEffort: "low" | "medium" | "high";
  cloudApiKey: string;
  promptTemplate: string;
  question: string;
  clientSource: ClientSource;
  captureCommandRunner?: SimpleCommandRunner;
  spawnProcess?: SpawnProcess;
}): Promise<void> {
  try {
    await transitionSession(
      input.store,
      input.activityStore,
      input.hub,
      input.clientSource,
      input.sessionId,
      "capturing",
      "Capturing main display",
      (record) => {
        record.error = undefined;
      }
    );

    const imagePath = input.store.imageFilePath(input.sessionId);
    await captureScreen({
      captureBackend: input.config.captureBackend,
      captureBin: input.config.captureBin,
      windowsCaptureScriptPath: input.config.windowsCaptureScriptPath,
      captureTarget: input.captureTarget,
      outputPath: imagePath,
      runCommand: input.captureCommandRunner
    });

    await transitionSession(
      input.store,
      input.activityStore,
      input.hub,
      input.clientSource,
      input.sessionId,
      "capturing",
      "Screenshot captured",
      (record) => {
        record.imagePath = imagePath;
      }
    );

    await transitionSession(
      input.store,
      input.activityStore,
      input.hub,
      input.clientSource,
      input.sessionId,
      "analyzing",
      input.modelProvider === "claude"
        ? "Submitting screenshot to Claude"
        : input.modelProvider === "openai"
          ? "Submitting screenshot to OpenAI"
          : input.modelProvider === "lmstudio"
            ? "Submitting screenshot to LM Studio"
            : input.modelProvider === "ollama"
              ? "Submitting screenshot to local Ollama model"
              : "Submitting screenshot to Codex"
    );

    const analysis = await runConfiguredAnalysis({
      config: input.config,
      imagePath,
      question: input.question,
      captureTarget: input.captureTarget,
      promptTemplate: input.promptTemplate,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
      codexReasoningEffort: input.codexReasoningEffort,
      cloudApiKey: input.cloudApiKey,
      spawnProcess: input.spawnProcess,
      onProgress: async (message) => {
        await transitionSession(input.store, input.activityStore, input.hub, input.clientSource, input.sessionId, "analyzing", message);
      }
    });

    await transitionSession(input.store, input.activityStore, input.hub, input.clientSource, input.sessionId, "done", "Analysis completed", (record) => {
      record.result = analysis.result;
      record.error = undefined;
    });
  } catch (error) {
    await transitionSession(input.store, input.activityStore, input.hub, input.clientSource, input.sessionId, "error", "Analysis failed", (record) => {
      record.error = toErrorMessage(error);
    });
  }
}

async function transitionSession(
  store: SessionStore,
  activityStore: ActivityStore,
  hub: WebSocketHub | undefined,
  source: ClientSource,
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

  const activity = activityStore.record({
    source,
    action: "session_status",
    sessionId,
    status,
    message: progressMessage || `状态更新：${status}`,
    question: session.question
  });

  hub?.broadcast({
    type: "session_status",
    sessionId,
    status,
    progressMessage,
    source,
    question: session.question,
    payload: status === "done" ? { result: session.result } : status === "error" ? { error: session.error } : undefined
  });
  hub?.broadcast({
    type: "activity",
    activity
  });
}

function isAuthorized(request: IncomingMessage, pairingToken: string, websocketToken?: string | null): boolean {
  if (isLoopbackRequest(request)) {
    return true;
  }

  if (typeof websocketToken === "string") {
    return websocketToken.length > 0 && safeTokenEqual(pairingToken, websocketToken);
  }

  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return false;
  }

  return safeTokenEqual(pairingToken, header.slice("Bearer ".length));
}

function isLoopbackRequest(request: IncomingMessage): boolean {
  const remoteAddress = request.socket.remoteAddress || "";
  return remoteAddress === "::1" || remoteAddress === "127.0.0.1" || remoteAddress.startsWith("::ffff:127.");
}

function detectClientSource(request: IncomingMessage): ClientSource {
  const header = request.headers["x-screen-pilot-client"];
  const raw = Array.isArray(header) ? header[0] : header;
  return raw === "iphone_web" || raw === "mac_web" || raw === "mac_desktop" ? raw : "unknown";
}

function clientSourceLabel(source: ClientSource): string {
  switch (source) {
    case "iphone_web":
      return "iPhone 网页端";
    case "mac_web":
      return "Mac 网页端";
    case "mac_desktop":
      return "Mac 原生壳";
    default:
      return "未知客户端";
  }
}

function resolveSelectedModel(settings: {
  modelProvider: ModelProvider;
  codexModel: string;
  localVisionModel: string;
  cloudModel: string;
}): string {
  if (settings.modelProvider === "codex") return settings.codexModel;
  if (settings.modelProvider === "claude" || settings.modelProvider === "openai") return settings.cloudModel;
  return settings.localVisionModel;
}

async function runConfiguredAnalysis(input: {
  config: AppConfig;
  imagePath: string;
  question: string;
  captureTarget: CaptureTarget;
  promptTemplate: string;
  modelProvider: ModelProvider;
  modelName: string;
  codexReasoningEffort: "low" | "medium" | "high";
  cloudApiKey: string;
  spawnProcess?: SpawnProcess;
  onProgress?: (message: string) => void | Promise<void>;
}) {
  if (input.modelProvider === "claude") {
    return await runClaudeVisionAnalysis({
      config: input.config,
      apiKey: input.cloudApiKey,
      imagePath: input.imagePath,
      question: input.question,
      captureTarget: input.captureTarget,
      promptTemplate: input.promptTemplate,
      cloudModel: input.modelName,
      onProgress: input.onProgress
    });
  }

  if (input.modelProvider === "openai") {
    return await runOpenAIVisionAnalysis({
      config: input.config,
      apiKey: input.cloudApiKey,
      imagePath: input.imagePath,
      question: input.question,
      captureTarget: input.captureTarget,
      promptTemplate: input.promptTemplate,
      cloudModel: input.modelName,
      onProgress: input.onProgress
    });
  }

  if (input.modelProvider === "ollama") {
    return await runOllamaVisionAnalysis({
      config: input.config,
      imagePath: input.imagePath,
      question: input.question,
      captureTarget: input.captureTarget,
      promptTemplate: input.promptTemplate,
      localVisionModel: input.modelName,
      onProgress: input.onProgress
    });
  }

  if (input.modelProvider === "lmstudio") {
    return await runLmStudioVisionAnalysis({
      config: input.config,
      imagePath: input.imagePath,
      question: input.question,
      captureTarget: input.captureTarget,
      promptTemplate: input.promptTemplate,
      localVisionModel: input.modelName,
      onProgress: input.onProgress
    });
  }

  return await runCodexAnalysis({
    config: input.config,
    imagePath: input.imagePath,
    question: input.question,
    captureTarget: input.captureTarget,
    promptTemplate: input.promptTemplate,
    codexModel: input.modelName,
    codexReasoningEffort: input.codexReasoningEffort,
    spawnProcess: input.spawnProcess,
    onProgress: input.onProgress
  });
}

async function serveStatic(
  response: ServerResponse,
  config: Pick<AppConfig, "iphonePublicDir" | "macWebPublicDir" | "overlayPublicDir">,
  pathname: string
): Promise<void> {
  const target = resolveStaticTarget(config, pathname);
  const normalizedPath = target.path;
  const sanitized = normalize(normalizedPath)
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(target.publicDir, sanitized);

  const resolvedPath = await resolveStaticFilePath(filePath);
  if (resolvedPath) {
    filePath = resolvedPath;
  } else {
    const fallback = join(target.publicDir, "index.html");
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

function resolveStaticTarget(
  config: Pick<AppConfig, "iphonePublicDir" | "macWebPublicDir" | "overlayPublicDir">,
  pathname: string
): { publicDir: string; path: string } {
  if (pathname === "/desktop" || pathname.startsWith("/desktop/")) {
    const relativePath = pathname === "/desktop" ? "/" : pathname.slice("/desktop".length) || "/";
    return {
      publicDir: config.macWebPublicDir,
      path: relativePath === "/" ? "/index.html" : relativePath
    };
  }

  if (pathname === "/overlay" || pathname.startsWith("/overlay/")) {
    const relativePath = pathname === "/overlay" ? "/" : pathname.slice("/overlay".length) || "/";
    return {
      publicDir: config.overlayPublicDir,
      path: relativePath === "/" ? "/index.html" : relativePath
    };
  }

  return {
    publicDir: config.iphonePublicDir,
    path: pathname === "/" ? "/index.html" : pathname
  };
}

async function resolveStaticFilePath(filePath: string): Promise<string | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }

  const stats = await fs.stat(filePath);
  if (stats.isDirectory()) {
    const directoryIndexPath = join(filePath, "index.html");
    return (await pathExists(directoryIndexPath)) ? directoryIndexPath : null;
  }

  return filePath;
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
