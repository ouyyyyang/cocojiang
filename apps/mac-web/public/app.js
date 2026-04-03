const VIEW_TITLES = {
  dashboard: "控制台",
  settings: "配置",
  testing: "测试",
  history: "历史"
};

const state = {
  token: localStorage.getItem("pairingToken") || "",
  config: null,
  ws: null,
  currentView: "dashboard",
  currentSessionId: null,
  events: [],
  sessions: [],
  selectedSession: null,
  localTrusted: isLocalTrustedHost(),
  localRuntimeStatus: null,
  localConsoleInfo: null,
  activities: [],
  defaultPromptTemplate: ""
};
const runtimeJobPolls = new Map();
const CLIENT_HEADER_VALUE = "mac_web";

const pairCard = document.querySelector("#pair-form").closest(".sidebar-card");
const pairForm = document.querySelector("#pair-form");
const pairTokenInput = document.querySelector("#pair-token");
const pairSubmit = document.querySelector("#pair-submit");
const disconnectButton = document.querySelector("#disconnect-button");
const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const refreshAllButton = document.querySelector("#refresh-all");
const viewTitle = document.querySelector("#view-title");
const socketState = document.querySelector("#socket-state");
const serviceState = document.querySelector("#service-state");
const stopLocalAgentButton = document.querySelector("#stop-local-agent");
const pairState = document.querySelector("#pair-state");
const banner = document.querySelector("#banner");
const analyzeForm = document.querySelector("#analyze-form");
const analyzeButton = document.querySelector("#analyze-button");
const analysisQuestion = document.querySelector("#analysis-question");
const dashboardSessionLabel = document.querySelector("#dashboard-session-label");
const dashboardPairingToken = document.querySelector("#dashboard-pairing-token");
const dashboardIphoneUrl = document.querySelector("#dashboard-iphone-url");
const dashboardPhoneUrls = document.querySelector("#dashboard-phone-urls");
const copyDashboardTokenButton = document.querySelector("#copy-dashboard-token");
const copyDashboardIphoneUrlButton = document.querySelector("#copy-dashboard-iphone-url");
const phoneMonitorSource = document.querySelector("#phone-monitor-source");
const phoneMonitorStatus = document.querySelector("#phone-monitor-status");
const phoneMonitorUpdatedAt = document.querySelector("#phone-monitor-updated-at");
const phoneMonitorMessage = document.querySelector("#phone-monitor-message");
const phoneMonitorQuestion = document.querySelector("#phone-monitor-question");
const phoneMonitorSession = document.querySelector("#phone-monitor-session");
const phoneActivityLog = document.querySelector("#phone-activity-log");
const statusBadge = document.querySelector("#status-badge");
const statusText = document.querySelector("#status-text");
const eventLog = document.querySelector("#event-log");
const detailEmpty = document.querySelector("#detail-empty");
const detailView = document.querySelector("#detail-view");
const detailImage = document.querySelector("#detail-image");
const detailUpdatedAt = document.querySelector("#detail-updated-at");
const detailModel = document.querySelector("#detail-model");
const detailQuestion = document.querySelector("#detail-question");
const detailSummary = document.querySelector("#detail-summary");
const detailAnswer = document.querySelector("#detail-answer");
const detailKeyPoints = document.querySelector("#detail-key-points");
const detailOcr = document.querySelector("#detail-ocr");
const detailNextActions = document.querySelector("#detail-next-actions");
const detailUncertainties = document.querySelector("#detail-uncertainties");
const detailError = document.querySelector("#detail-error");
const modelProviderSelect = document.querySelector("#model-provider");
const codexModelSelect = document.querySelector("#codex-model");
const codexReasoningField = document.querySelector("#codex-reasoning-field");
const codexReasoningEffortSelect = document.querySelector("#codex-reasoning-effort");
const cloudModelField = document.querySelector("#cloud-model-field");
const cloudModelSelect = document.querySelector("#cloud-model");
const cloudApiKeyField = document.querySelector("#cloud-api-key-field");
const cloudApiKeyInput = document.querySelector("#cloud-api-key");
const cloudProviderNote = document.querySelector("#cloud-provider-note");
const localModelField = document.querySelector("#local-model-field");
const localVisionModelSelect = document.querySelector("#local-vision-model");
const localProviderNote = document.querySelector("#local-provider-note");
const saveSettingsButton = document.querySelector("#save-settings");
const promptTemplateInput = document.querySelector("#prompt-template");
const savePromptButton = document.querySelector("#save-prompt");
const resetPromptButton = document.querySelector("#reset-prompt");
const authPanel = document.querySelector("#auth-panel");
const authStatusPill = document.querySelector("#auth-status-pill");
const authDetail = document.querySelector("#auth-detail");
const startAuthButton = document.querySelector("#start-auth");
const refreshAuthButton = document.querySelector("#refresh-auth");
const overlayShowButton = document.querySelector("#overlay-show");
const overlayHideButton = document.querySelector("#overlay-hide");
const overlayOpacitySlider = document.querySelector("#overlay-opacity");
const refreshRuntimeStatusButton = document.querySelector("#refresh-runtime-status");
const captureTestButton = document.querySelector("#capture-test-button");
const captureProgress = document.querySelector("#capture-progress");
const captureMeta = document.querySelector("#capture-meta");
const captureImage = document.querySelector("#capture-image");
const captureEmpty = document.querySelector("#capture-empty");
const modelTestButton = document.querySelector("#model-test-button");
const modelProgress = document.querySelector("#model-progress");
const modelQuestion = document.querySelector("#model-question");
const modelMeta = document.querySelector("#model-meta");
const modelImage = document.querySelector("#model-image");
const modelEmpty = document.querySelector("#model-empty");
const modelOutput = document.querySelector("#model-output");
const modelSummary = document.querySelector("#model-summary");
const modelAnswer = document.querySelector("#model-answer");
const modelKeyPoints = document.querySelector("#model-key-points");
const modelNextActions = document.querySelector("#model-next-actions");
const modelUncertainties = document.querySelector("#model-uncertainties");
const modelRawOutput = document.querySelector("#model-raw-output");
const refreshHistoryButton = document.querySelector("#refresh-history");
const historyList = document.querySelector("#history-list");
const historyDetailEmpty = document.querySelector("#history-detail-empty");
const historyDetail = document.querySelector("#history-detail");
const historyImage = document.querySelector("#history-image");
const historyUpdatedAt = document.querySelector("#history-updated-at");
const historyStatus = document.querySelector("#history-status");
const historyQuestion = document.querySelector("#history-question");
const historySummary = document.querySelector("#history-summary");
const historyAnswer = document.querySelector("#history-answer");
const historyKeyPoints = document.querySelector("#history-key-points");
const historyOcr = document.querySelector("#history-ocr");
const historyNextActions = document.querySelector("#history-next-actions");
const historyUncertainties = document.querySelector("#history-uncertainties");
const historyError = document.querySelector("#history-error");
const runtimePanels = {
  lmstudio: {
    status: document.querySelector("#runtime-status-lmstudio"),
    copy: document.querySelector("#runtime-copy-lmstudio"),
    cli: document.querySelector("#runtime-cli-lmstudio"),
    host: document.querySelector("#runtime-host-lmstudio"),
    dir: document.querySelector("#runtime-dir-lmstudio"),
    downloaded: document.querySelector("#runtime-downloaded-lmstudio"),
    loaded: document.querySelector("#runtime-loaded-lmstudio"),
    jobSummary: document.querySelector("#runtime-job-summary-lmstudio"),
    jobLogs: document.querySelector("#runtime-job-logs-lmstudio"),
    buttons: {
      start: document.querySelector("#runtime-start-lmstudio"),
      download: document.querySelector("#runtime-download-lmstudio"),
      load: document.querySelector("#runtime-load-lmstudio"),
      unload: document.querySelector("#runtime-unload-lmstudio")
    }
  },
  ollama: {
    status: document.querySelector("#runtime-status-ollama"),
    copy: document.querySelector("#runtime-copy-ollama"),
    cli: document.querySelector("#runtime-cli-ollama"),
    host: document.querySelector("#runtime-host-ollama"),
    dir: document.querySelector("#runtime-dir-ollama"),
    downloaded: document.querySelector("#runtime-downloaded-ollama"),
    loaded: document.querySelector("#runtime-loaded-ollama"),
    jobSummary: document.querySelector("#runtime-job-summary-ollama"),
    jobLogs: document.querySelector("#runtime-job-logs-ollama"),
    buttons: {
      start: document.querySelector("#runtime-start-ollama"),
      download: document.querySelector("#runtime-download-ollama"),
      unload: document.querySelector("#runtime-unload-ollama"),
      remove: document.querySelector("#runtime-remove-ollama")
    }
  }
};

const viewSections = {
  dashboard: document.querySelector("#view-dashboard"),
  settings: document.querySelector("#view-settings"),
  testing: document.querySelector("#view-testing"),
  history: document.querySelector("#view-history")
};

init().catch((error) => {
  showBanner(error.message || "初始化失败");
});

window.addEventListener("unhandledrejection", (event) => {
  showBanner(event.reason?.message || "请求失败");
});

async function init() {
  pairTokenInput.value = state.token;
  wireEvents();
  state.config = await fetchJson("/api/config");
  serviceState.textContent = `${state.config.serviceName} 已连接，当前桌面网页控制台可用。`;
  populateProviderOptions(state.config.modelProviders || [], state.config.defaults?.modelProvider || "codex");
  populateModelOptions(codexModelSelect, state.config.codexModels || [], state.config.defaults?.codexModel || "gpt-5.4");
  populateModelOptions(
    codexReasoningEffortSelect,
    state.config.codexReasoningEfforts || [],
    state.config.defaults?.codexReasoningEffort || "high"
  );
  populateModelOptions(localVisionModelSelect, state.config.localVisionModels || [], state.config.defaults?.localVisionModel || "qwen3-vl:8b");
  populateModelOptions(cloudModelSelect, [...(state.config.claudeModels || []), ...(state.config.openaiModels || [])], "");
  state.claudeModels = state.config.claudeModels || [];
  state.openaiModels = state.config.openaiModels || [];
  toggleSettingsFields();
  renderPairState();
  renderActivityMonitor();
  setView("dashboard");

  if (state.localTrusted) {
    pairCard.classList.add("hidden");
    stopLocalAgentButton.classList.remove("hidden");
    serviceState.textContent = `${state.config.serviceName} 已连接，本机直连模式已开启，无需配对。`;
    await afterPaired();
    return;
  }

  stopLocalAgentButton.classList.add("hidden");

  if (!state.token) {
    showBanner("请输入 pairing token 后再开始桌面控制台测试。", false);
    return;
  }

  const paired = await tryPairSilently();
  if (!paired) {
    showBanner("已保存的 token 无效，请重新配对。");
    return;
  }

  await afterPaired();
}

function wireEvents() {
  pairForm.addEventListener("submit", onPairSubmit);
  disconnectButton.addEventListener("click", disconnect);
  analyzeForm.addEventListener("submit", onAnalyzeSubmit);
  refreshAllButton.addEventListener("click", () => runUiTask(refreshEverything, "刷新失败"));
  stopLocalAgentButton.addEventListener("click", () => runUiTask(stopLocalAgent, "停止服务失败"));
  copyDashboardTokenButton.addEventListener("click", () =>
    runUiTask(() => copyToClipboard(state.localConsoleInfo?.pairingToken || ""), "复制 Token 失败")
  );
  copyDashboardIphoneUrlButton.addEventListener("click", () =>
    runUiTask(() => copyToClipboard(state.localConsoleInfo?.iphoneUrl || ""), "复制地址失败")
  );
  saveSettingsButton.addEventListener("click", () => runUiTask(saveSettings, "保存配置失败"));
  savePromptButton.addEventListener("click", () => runUiTask(savePromptTemplate, "保存 Prompt 失败"));
  resetPromptButton.addEventListener("click", () => runUiTask(restoreDefaultPromptTemplate, "恢复默认 Prompt 失败"));
  modelProviderSelect.addEventListener("change", toggleSettingsFields);
  startAuthButton.addEventListener("click", () => runUiTask(startAuth, "启动认证失败"));
  refreshAuthButton.addEventListener("click", () => runUiTask(refreshAuthStatus, "刷新认证状态失败"));
  refreshRuntimeStatusButton.addEventListener("click", () => runUiTask(loadRuntimeStatus, "刷新运行时状态失败"));
  overlayShowButton.addEventListener("click", () => sendOverlayControl("show"));
  overlayHideButton.addEventListener("click", () => sendOverlayControl("hide"));
  overlayOpacitySlider.addEventListener("input", () => sendOverlayControl("set_opacity", overlayOpacitySlider.value / 100));
  captureTestButton.addEventListener("click", () => runUiTask(runCaptureTest, "抓屏测试失败"));
  modelTestButton.addEventListener("click", () => runUiTask(runModelTest, "模型测试失败"));
  refreshHistoryButton.addEventListener("click", () => runUiTask(loadHistory, "刷新历史失败"));

  for (const link of navLinks) {
    link.addEventListener("click", () => setView(link.dataset.view));
  }

  runtimePanels.lmstudio.buttons.start.addEventListener("click", () =>
    runUiTask(() => runRuntimeAction("lmstudio", "start_server"), "启动 LM Studio server 失败")
  );
  runtimePanels.lmstudio.buttons.download.addEventListener("click", () =>
    runUiTask(() => runRuntimeAction("lmstudio", "download_model"), "下载 LM Studio 模型失败")
  );
  runtimePanels.lmstudio.buttons.load.addEventListener("click", () =>
    runUiTask(() => runRuntimeAction("lmstudio", "load_model"), "加载 LM Studio 模型失败")
  );
  runtimePanels.lmstudio.buttons.unload.addEventListener("click", () =>
    runUiTask(() => runRuntimeAction("lmstudio", "unload_model"), "卸载 LM Studio 模型失败")
  );
  runtimePanels.ollama.buttons.start.addEventListener("click", () =>
    runUiTask(() => runRuntimeAction("ollama", "start_server"), "启动 Ollama server 失败")
  );
  runtimePanels.ollama.buttons.download.addEventListener("click", () =>
    runUiTask(() => runRuntimeAction("ollama", "download_model"), "下载 Ollama 模型失败")
  );
  runtimePanels.ollama.buttons.unload.addEventListener("click", () =>
    runUiTask(() => runRuntimeAction("ollama", "unload_model"), "卸载 Ollama 模型失败")
  );
  runtimePanels.ollama.buttons.remove.addEventListener("click", () =>
    runUiTask(() => runRuntimeAction("ollama", "remove_model"), "删除 Ollama 模型失败")
  );
}

function setView(nextView) {
  if (!nextView || !viewSections[nextView]) {
    return;
  }

  state.currentView = nextView;
  viewTitle.textContent = VIEW_TITLES[nextView];

  for (const [name, section] of Object.entries(viewSections)) {
    section.classList.toggle("hidden", name !== nextView);
    section.classList.toggle("active", name === nextView);
  }

  for (const link of navLinks) {
    link.classList.toggle("active", link.dataset.view === nextView);
  }
}

async function onPairSubmit(event) {
  event.preventDefault();
  await runUiTask(async () => {
    const token = pairTokenInput.value.trim();
    if (!token) {
      throw new Error("请输入 pairing token。");
    }

    setButtonBusy(pairSubmit, true, "连接中...");
    try {
      await fetchJson("/api/pair", {
        method: "POST",
        body: JSON.stringify({ token })
      });
      state.token = token;
      localStorage.setItem("pairingToken", token);
      await afterPaired();
      showBanner("配对成功，可以开始桌面端功能测试。", false);
    } finally {
      setButtonBusy(pairSubmit, false, "连接控制台");
    }
  }, "配对失败");
}

async function tryPairSilently() {
  if (state.localTrusted) {
    return true;
  }

  try {
    await fetchJson("/api/pair", {
      method: "POST",
      body: JSON.stringify({ token: state.token })
    });
    return true;
  } catch {
    state.token = "";
    localStorage.removeItem("pairingToken");
    renderPairState();
    return false;
  }
}

async function afterPaired() {
  renderPairState();
  connectWebSocket();
  await refreshEverything();
}

function disconnect() {
  if (state.ws) {
    state.ws.close();
  }

  state.token = "";
  localStorage.removeItem("pairingToken");
  pairTokenInput.value = "";
  state.sessions = [];
  state.activities = [];
  state.events = [];
  state.currentSessionId = null;
  state.selectedSession = null;
  renderPairState();
  renderEventLog();
  renderActivityMonitor();
  renderHistory();
  renderDetail();
  renderHistoryDetail();
  setSocketState("WS Offline", "neutral");
  showBanner("已清除配对信息。", false);
}

function renderPairState() {
  if (state.localTrusted) {
    pairState.textContent = "本机直连";
    pairState.className = "status-pill paired";
    return;
  }

  const paired = Boolean(state.token);
  pairState.textContent = paired ? "已配对" : "未配对";
  pairState.className = `status-pill ${paired ? "paired" : "neutral"}`;
}

function connectWebSocket() {
  if (!state.localTrusted && !state.token) {
    return;
  }

  if (state.ws) {
    state.ws.close();
  }

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const websocketPath = state.config?.capabilities?.websocketPath || "/ws";
  const tokenQuery = state.token ? `?token=${encodeURIComponent(state.token)}` : "";
  const socket = new WebSocket(`${protocol}://${location.host}${websocketPath}${tokenQuery}`);
  state.ws = socket;
  setSocketState("WS Connecting", "neutral");

  socket.addEventListener("open", () => setSocketState("WS Online", "online"));
  socket.addEventListener("close", () => setSocketState("WS Offline", "neutral"));
  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "activity" && payload.activity) {
      pushActivity(payload.activity);
      return;
    }

    pushEvent(payload);
    state.currentSessionId = payload.sessionId || state.currentSessionId;

    if (payload.status) {
      statusBadge.textContent = payload.status;
    }

    if (payload.progressMessage) {
      statusText.textContent = payload.progressMessage;
    }

    if (payload.status === "done" && payload.sessionId) {
      void runUiTask(async () => {
        await loadSession(payload.sessionId, { renderHistoryPanel: false });
        await loadHistory();
      }, "刷新分析结果失败");
    }

    if (payload.status === "error") {
      showBanner(payload.payload?.error || payload.progressMessage || "分析失败");
    }
  });
}

function setSocketState(label, tone) {
  socketState.textContent = label;
  socketState.className = `status-pill ${tone}`;
}

async function refreshEverything() {
  if (!state.localTrusted && !state.token) {
    renderPairState();
    return;
  }

  await Promise.all([
    loadLocalConsoleInfo(),
    loadSettings(),
    loadPromptTemplate(),
    refreshAuthStatus(),
    loadHistory(),
    loadRuntimeStatus(),
    loadActivities()
  ]);
}

async function loadLocalConsoleInfo() {
  try {
    const payload = await fetchJson("/api/local-console-info");
    state.localConsoleInfo = payload;
    renderLocalConsoleInfo();
  } catch {
    state.localConsoleInfo = null;
    renderLocalConsoleInfo();
  }
}

async function loadSettings() {
  const settings = await authedJson("/api/settings");
  modelProviderSelect.value = settings.modelProvider || "codex";
  codexModelSelect.value = settings.codexModel;
  codexReasoningEffortSelect.value = settings.codexReasoningEffort || "high";
  localVisionModelSelect.value = settings.localVisionModel || "qwen3-vl:8b";
  cloudModelSelect.value = settings.cloudModel || "";
  cloudApiKeyInput.value = settings.cloudApiKey || "";
  toggleSettingsFields();
}

async function loadPromptTemplate() {
  const payload = await authedJson("/api/prompt-template");
  state.defaultPromptTemplate = payload.defaultPromptTemplate || "";
  promptTemplateInput.value = payload.promptTemplate || "";
}

async function loadActivities() {
  const response = await authedJson("/api/activities");
  state.activities = response.activities || [];
  renderActivityMonitor();
}

async function saveSettings() {
  requireToken();
  setButtonBusy(saveSettingsButton, true, "保存中...");
  try {
    const settings = await authedJson("/api/settings", {
      method: "POST",
      body: JSON.stringify({
        modelProvider: modelProviderSelect.value,
        codexModel: codexModelSelect.value,
        codexReasoningEffort: codexReasoningEffortSelect.value,
        localVisionModel: localVisionModelSelect.value,
        cloudModel: cloudModelSelect.value,
        cloudApiKey: cloudApiKeyInput.value
      })
    });
    modelProviderSelect.value = settings.modelProvider || "codex";
    codexModelSelect.value = settings.codexModel;
    codexReasoningEffortSelect.value = settings.codexReasoningEffort || "high";
    localVisionModelSelect.value = settings.localVisionModel || "qwen3-vl:8b";
    cloudModelSelect.value = settings.cloudModel || "";
    cloudApiKeyInput.value = settings.cloudApiKey || "";
    toggleSettingsFields();
    showBanner("模型配置已保存。", false);
  } finally {
    setButtonBusy(saveSettingsButton, false, "保存配置");
  }
}

async function sendOverlayControl(action, value) {
  try {
    await authedJson("/api/overlay/control", {
      method: "POST",
      body: JSON.stringify({ action, value })
    });
  } catch {}
}

async function stopLocalAgent() {
  if (!state.localTrusted) {
    throw new Error("只有宿主机本机页面可以停止本地服务。");
  }

  setButtonBusy(stopLocalAgentButton, true, "停止中...");
  try {
    await fetchJson("/api/local-control/stop", {
      method: "POST"
    });
    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }
    setSocketState("WS Offline", "neutral");
    serviceState.textContent = `${state.config.serviceName} 已停止，需要重新启动 agent 后才能继续访问。`;
    showBanner("服务停止请求已发送。当前页面会保留，但后续请求将不可用。", false);
  } finally {
    setButtonBusy(stopLocalAgentButton, false, "停止服务");
  }
}

async function savePromptTemplate() {
  requireToken();
  setButtonBusy(savePromptButton, true, "保存中...");
  try {
    const payload = await authedJson("/api/prompt-template", {
      method: "POST",
      body: JSON.stringify({
        promptTemplate: promptTemplateInput.value
      })
    });
    state.defaultPromptTemplate = payload.defaultPromptTemplate || state.defaultPromptTemplate;
    promptTemplateInput.value = payload.promptTemplate || "";
    showBanner("Prompt 已保存，新的分析请求会立即使用。", false);
  } finally {
    setButtonBusy(savePromptButton, false, "保存 Prompt");
  }
}

async function restoreDefaultPromptTemplate() {
  requireToken();
  setButtonBusy(resetPromptButton, true, "恢复中...");
  try {
    if (!state.defaultPromptTemplate) {
      await loadPromptTemplate();
    }

    const payload = await authedJson("/api/prompt-template", {
      method: "POST",
      body: JSON.stringify({
        promptTemplate: state.defaultPromptTemplate
      })
    });
    state.defaultPromptTemplate = payload.defaultPromptTemplate || state.defaultPromptTemplate;
    promptTemplateInput.value = payload.promptTemplate || state.defaultPromptTemplate;
    showBanner("已恢复默认 Prompt。", false);
  } finally {
    setButtonBusy(resetPromptButton, false, "恢复默认并保存");
  }
}

async function loadRuntimeStatus() {
  const payload = await authedJson("/api/local-runtimes/status");
  state.localRuntimeStatus = payload;
  renderRuntimeStatus();

  for (const job of payload.jobs || []) {
    if (job.status === "running") {
      ensureRuntimeJobPolling(job.id);
    }
  }
}

async function runRuntimeAction(runtime, action) {
  requireToken();
  const endpoint = runtimeActionEndpoint(runtime, action);
  const runtimePanel = runtimePanels[runtime];
  const button = runtimeActionButton(runtime, action);
  const idleLabel = button.textContent;
  const busyLabel = runtimeActionBusyLabel(action);

  setButtonBusy(button, true, busyLabel);
  try {
    const model = localVisionModelSelect.value;
    const body =
      action === "start_server"
        ? undefined
        : JSON.stringify({
            model,
            identifier: model
          });
    const job = await authedJson(endpoint, {
      method: "POST",
      body
    });

    runtimePanel.jobSummary.textContent = job.summary || "任务已提交。";
    runtimePanel.jobLogs.textContent = (job.logs || []).join("\n") || "-";
    ensureRuntimeJobPolling(job.id);
    showBanner(`${providerDisplayName(runtime)} 任务已提交：${runtimeActionDisplayName(action)}。`, false);
  } finally {
    setButtonBusy(button, false, idleLabel);
  }
}

async function refreshAuthStatus() {
  requireToken();
  setButtonBusy(refreshAuthButton, true, "刷新中...");
  try {
    const status = await authedJson("/api/codex-auth/status");
    authStatusPill.textContent = status.authenticated
      ? `已认证${status.authMode ? ` · ${status.authMode}` : ""}`
      : "未认证";
    authDetail.textContent = status.rawStatus;
  } finally {
    setButtonBusy(refreshAuthButton, false, "刷新状态");
  }
}

async function startAuth() {
  requireToken();
  setButtonBusy(startAuthButton, true, "启动中...");
  try {
    const response = await authedJson("/api/codex-auth/start", { method: "POST" });
    authDetail.textContent = response.message;
    showBanner("已启动 Codex 登录流程。", false);
  } finally {
    setButtonBusy(startAuthButton, false, "开始 OpenAI 认证");
  }
}

async function onAnalyzeSubmit(event) {
  event.preventDefault();
  await runUiTask(async () => {
    requireToken();
    setButtonBusy(analyzeButton, true, "提交中...");

    try {
      const response = await authedJson("/api/analyze", {
        method: "POST",
        body: JSON.stringify({
          question: analysisQuestion.value.trim(),
          captureTarget: "main_display"
        })
      });
      state.currentSessionId = response.sessionId;
      dashboardSessionLabel.textContent = shortenSessionId(response.sessionId);
      statusBadge.textContent = "queued";
      statusText.textContent = "分析请求已提交，等待截图。";
      setView("dashboard");
      await loadHistory();
    } finally {
      setButtonBusy(analyzeButton, false, "抓取并分析");
    }
  }, "分析请求失败");
}

async function runCaptureTest() {
  requireToken();
  setButtonBusy(captureTestButton, true, "抓取中...");
  captureProgress.classList.remove("hidden");

  try {
    const response = await authedJson("/api/test/capture", { method: "POST" });
    captureMeta.textContent = `最近抓取时间：${formatDateTime(response.capturedAt)}`;
    captureImage.src = withCacheBust(response.imageUrl);
    captureImage.classList.remove("hidden");
    captureEmpty.classList.add("hidden");
    showBanner("抓屏测试完成。", false);
  } finally {
    captureProgress.classList.add("hidden");
    setButtonBusy(captureTestButton, false, "测试抓屏");
  }
}

async function runModelTest() {
  requireToken();
  setButtonBusy(modelTestButton, true, "测试中...");
  updateModelProgressCopy();
  modelProgress.classList.remove("hidden");

  try {
    const response = await authedJson("/api/test/model", {
      method: "POST",
      body: JSON.stringify({
        question: modelQuestion.value.trim()
      })
    });

    modelMeta.textContent = `最近测试时间：${formatDateTime(response.capturedAt)} · 链路：${formatModelLabel(response)}`;
    modelImage.src = withCacheBust(response.imageUrl);
    modelImage.classList.remove("hidden");
    modelEmpty.classList.add("hidden");
    modelOutput.classList.remove("hidden");
    modelSummary.textContent = response.result.summary || "无";
    modelAnswer.textContent = response.result.answer || "无";
    renderList(modelKeyPoints, response.result.key_points);
    renderList(modelNextActions, response.result.next_actions);
    renderList(modelUncertainties, response.result.uncertainties);
    modelRawOutput.textContent = prettyJson(response.rawMessage);
    showBanner(`${providerDisplayName(response.modelProvider)} 模型测试完成。`, false);
  } finally {
    modelProgress.classList.add("hidden");
    setButtonBusy(modelTestButton, false, "运行模型测试");
  }
}

async function loadHistory() {
  requireToken();
  const response = await authedJson("/api/sessions");
  state.sessions = response.sessions || [];
  renderHistory();

  const targetSessionId = state.currentSessionId || state.sessions[0]?.id;
  if (targetSessionId) {
    await loadSession(targetSessionId, { renderHistoryPanel: true });
  }
}

async function loadSession(sessionId, options = { renderHistoryPanel: true }) {
  requireToken();
  const session = await authedJson(`/api/sessions/${sessionId}`);
  state.currentSessionId = sessionId;
  state.selectedSession = session;
  dashboardSessionLabel.textContent = shortenSessionId(sessionId);
  renderDetail();

  if (options.renderHistoryPanel) {
    renderHistory();
    renderHistoryDetail();
  }
}

function renderEventLog() {
  if (!eventLog) {
    return;
  }

  if (!state.events || state.events.length === 0) {
    eventLog.innerHTML = '<div class="empty-state">还没有状态事件。</div>';
    return;
  }

  eventLog.innerHTML = state.events
    .map((event) => `
      <div class="event-item">
        <strong>${escapeHtml(event.status || "event")}</strong>
        <div>${escapeHtml(event.progressMessage || "状态更新")}</div>
        <div class="meta-copy">${escapeHtml(sourceDisplayName(event.source || "unknown"))}</div>
        <div class="meta-copy">${escapeHtml(event.sessionId ? shortenSessionId(event.sessionId) : "-")}</div>
      </div>
    `)
    .join("");
}

function pushEvent(event) {
  if (!state.events) {
    state.events = [];
  }

  state.events.unshift(event);
  state.events = state.events.slice(0, 18);
  renderEventLog();
}

function pushActivity(activity) {
  if (!activity) {
    return;
  }

  state.activities.unshift(activity);
  state.activities = state.activities.slice(0, 40);
  renderActivityMonitor();
}

function renderDetail() {
  const session = state.selectedSession;
  if (!session) {
    detailEmpty.classList.remove("hidden");
    detailView.classList.add("hidden");
    return;
  }

  detailEmpty.classList.add("hidden");
  detailView.classList.remove("hidden");
  detailUpdatedAt.textContent = formatDateTime(session.updatedAt);
  detailModel.textContent = formatModelLabel(session);
  detailQuestion.textContent = session.question || "未填写问题";
  detailSummary.textContent = session.result?.summary || "暂无摘要";
  detailAnswer.textContent = session.result?.answer || "暂无回答";
  detailError.textContent = session.error || "无";
  renderList(detailKeyPoints, session.result?.key_points || []);
  renderList(detailOcr, session.result?.ocr_text || []);
  renderList(detailNextActions, session.result?.next_actions || []);
  renderList(detailUncertainties, session.result?.uncertainties || []);

  if (session.imageUrl) {
    detailImage.src = withCacheBust(session.imageUrl);
    detailImage.classList.remove("hidden");
  } else {
    detailImage.classList.add("hidden");
  }
}

function renderHistory() {
  if (state.sessions.length === 0) {
    historyList.innerHTML = '<div class="empty-state">还没有历史分析结果。</div>';
    renderHistoryDetail();
    return;
  }

  historyList.innerHTML = state.sessions
    .map((session) => `
      <button class="history-card ${session.id === state.currentSessionId ? "active" : ""}" data-session-id="${escapeHtml(session.id)}" type="button">
        <strong>${escapeHtml(session.question || "未填写问题")}</strong>
        <div>${escapeHtml(`${session.status} · ${formatModelLabel(session)}`)}</div>
        <div class="meta-copy">${escapeHtml(session.summary || session.error || "等待结果")}</div>
      </button>
    `)
    .join("");

  for (const button of historyList.querySelectorAll(".history-card")) {
    button.addEventListener("click", () => {
      const sessionId = button.dataset.sessionId;
      if (!sessionId) {
        return;
      }
      void runUiTask(() => loadSession(sessionId, { renderHistoryPanel: true }), "加载历史详情失败");
    });
  }

  renderHistoryDetail();
}

function renderHistoryDetail() {
  const session = state.selectedSession;
  if (!session) {
    historyDetailEmpty.classList.remove("hidden");
    historyDetail.classList.add("hidden");
    return;
  }

  historyDetailEmpty.classList.add("hidden");
  historyDetail.classList.remove("hidden");
  historyUpdatedAt.textContent = formatDateTime(session.updatedAt);
  historyStatus.textContent = session.status || "-";
  historyQuestion.textContent = session.question || "未填写问题";
  historySummary.textContent = session.result?.summary || "暂无摘要";
  historyAnswer.textContent = session.result?.answer || "暂无回答";
  historyError.textContent = session.error || "无";
  renderList(historyKeyPoints, session.result?.key_points || []);
  renderList(historyOcr, session.result?.ocr_text || []);
  renderList(historyNextActions, session.result?.next_actions || []);
  renderList(historyUncertainties, session.result?.uncertainties || []);

  if (session.imageUrl) {
    historyImage.src = withCacheBust(session.imageUrl);
    historyImage.classList.remove("hidden");
  } else {
    historyImage.classList.add("hidden");
  }
}

function renderActivityMonitor() {
  const phoneActivities = state.activities.filter((activity) => activity.source === "iphone_web");
  const latest = phoneActivities[0];

  phoneMonitorSource.textContent = latest ? "iPhone 网页端在线" : "等待手机端操作";
  phoneMonitorStatus.textContent = latest?.status || actionDisplayName(latest?.action) || "-";
  phoneMonitorUpdatedAt.textContent = latest ? formatDateTime(latest.timestamp) : "-";
  phoneMonitorMessage.textContent = latest?.message || "还没有收到手机端操作。";
  phoneMonitorQuestion.textContent = latest?.question || "当前没有关联问题。";
  phoneMonitorSession.textContent = latest?.sessionId ? shortenSessionId(latest.sessionId) : "-";

  if (phoneActivities.length === 0) {
    phoneActivityLog.innerHTML = '<div class="empty-state">手机端一旦完成配对、点击抓取或进入模型生成，这里会实时显示。</div>';
    return;
  }

  phoneActivityLog.innerHTML = phoneActivities
    .slice(0, 16)
    .map(
      (activity) => `
        <div class="activity-item">
          <div class="activity-head">
            <strong>${escapeHtml(activity.status || actionDisplayName(activity.action))}</strong>
            <span class="meta-copy">${escapeHtml(formatDateTime(activity.timestamp))}</span>
          </div>
          <div>${escapeHtml(activity.message)}</div>
          <div class="meta-copy">${escapeHtml(activity.question || "无关联问题")}</div>
          <div class="meta-copy">${escapeHtml(activity.sessionId ? shortenSessionId(activity.sessionId) : "-")}</div>
        </div>
      `
    )
    .join("");
}

function populateProviderOptions(options, defaultProvider) {
  modelProviderSelect.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.slug)}">${escapeHtml(option.displayName || option.slug)}</option>`)
    .join("");
  modelProviderSelect.value = defaultProvider;
}

function populateModelOptions(selectElement, options, defaultModel) {
  selectElement.innerHTML = options
    .map((option) => `<option value="${escapeHtml(option.slug)}">${escapeHtml(option.displayName || option.slug)}</option>`)
    .join("");
  selectElement.value = defaultModel;
}

function toggleSettingsFields() {
  const provider = modelProviderSelect.value;
  const isCodex = provider === "codex";
  const isCloud = provider === "claude" || provider === "openai";
  const isLocal = provider === "lmstudio" || provider === "ollama";

  codexModelSelect.closest(".field").classList.toggle("hidden", !isCodex);
  codexReasoningField.classList.toggle("hidden", !isCodex);
  authPanel.classList.toggle("hidden", !isCodex);

  cloudModelField.classList.toggle("hidden", !isCloud);
  cloudApiKeyField.classList.toggle("hidden", !isCloud);
  cloudProviderNote.classList.toggle("hidden", !isCloud);

  localModelField.classList.toggle("hidden", !isLocal);
  localProviderNote.classList.toggle("hidden", !isLocal);

  if (isCloud) {
    const models = provider === "claude" ? (state.claudeModels || []) : (state.openaiModels || []);
    populateModelOptions(cloudModelSelect, models, cloudModelSelect.value || models[0]?.slug || "");
    cloudProviderNote.textContent =
      provider === "claude"
        ? "需要 Anthropic API Key。在 console.anthropic.com 获取。"
        : "需要 OpenAI API Key。在 platform.openai.com 获取。支持所有 OpenAI 兼容 API。";
  }

  if (isLocal) {
    localProviderNote.textContent =
      provider === "lmstudio"
        ? "LM Studio 需要先 `lms server start`，并把目标模型加载为当前标识，例如 `qwen3-vl:8b`。"
        : "Ollama 需要先 `ollama pull qwen3-vl:8b`，必要时再执行 `ollama serve`。";
  }

  updateModelProgressCopy();
}

function renderRuntimeStatus() {
  const payload = state.localRuntimeStatus;
  if (!payload?.runtimes) {
    return;
  }

  for (const runtime of ["lmstudio", "ollama"]) {
    renderRuntimeCard(runtime, payload.runtimes[runtime], payload.jobs || []);
  }
}

function renderLocalConsoleInfo() {
  const payload = state.localConsoleInfo;
  dashboardPairingToken.textContent = payload?.pairingToken || "仅本机可见";
  dashboardIphoneUrl.textContent = payload?.iphoneUrl || "-";
  renderList(dashboardPhoneUrls, payload?.phoneUrls || []);
}

function renderRuntimeCard(runtime, status, jobs) {
  const panel = runtimePanels[runtime];
  if (!panel || !status) {
    return;
  }

  panel.status.textContent = statusBadgeCopy(status);
  panel.status.className = `status-pill ${statusTone(status)}`;
  panel.copy.textContent = statusCopy(status, localVisionModelSelect.value);
  panel.cli.textContent = status.executablePath || (status.cliAvailable ? "已检测到" : "未检测到");
  panel.host.textContent = `${status.serverHost} · ${status.serverRunning ? "在线" : "离线"}`;
  panel.dir.textContent = status.modelsDirHint || "-";
  renderModelRefList(panel.downloaded, status.downloadedModels);
  renderModelRefList(panel.loaded, status.loadedModels);

  for (const [action, button] of Object.entries(panel.buttons)) {
    button.disabled = !status.installed;
  }

  const latestJob = (jobs || []).find((job) => job.runtime === runtime);
  panel.jobSummary.textContent = latestJob ? `${latestJob.summary} · ${formatDateTime(latestJob.updatedAt)}` : "还没有执行过任务。";
  panel.jobLogs.textContent = latestJob?.logs?.length ? latestJob.logs.join("\n") : "-";
}

function updateModelProgressCopy() {
  const labels = {
    claude: "Claude API",
    openai: "OpenAI API",
    lmstudio: "LM Studio (MLX)",
    ollama: "本地 Ollama 视觉模型"
  };
  const label = labels[modelProviderSelect.value] || "Codex";
  modelProgress.textContent = `模型加载中，正在抓取屏幕并提交给 ${label} 分析...`;
}

function providerDisplayName(provider) {
  const names = {
    claude: "Claude API",
    openai: "OpenAI API",
    lmstudio: "LM Studio (MLX)",
    ollama: "本地 Ollama"
  };
  return names[provider] || "Codex";
}

function formatModelLabel(session) {
  if (session.modelProvider === "codex") {
    return `${providerDisplayName(session.modelProvider)} · ${session.codexModel || "-"} · ${session.codexReasoningEffort || "high"}`;
  }

  return `${providerDisplayName(session.modelProvider)} · ${session.codexModel || session.cloudModel || "-"}`;
}

function renderList(element, items) {
  const entries = Array.isArray(items) && items.length > 0 ? items : ["无"];
  element.innerHTML = entries.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderModelRefList(element, items) {
  const entries = Array.isArray(items) && items.length > 0 ? items : [{ label: "无" }];
  element.innerHTML = entries
    .map((item) => `<li>${escapeHtml(item.identifier ? `${item.label} (${item.identifier})` : item.label)}</li>`)
    .join("");
}

async function authedJson(path, init = {}) {
  requireToken();
  const headers = new Headers(init.headers || {});
  if (state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }
  headers.set("X-Screen-Pilot-Client", CLIENT_HEADER_VALUE);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return await fetchJson(path, { ...init, headers });
}

async function fetchJson(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("X-Screen-Pilot-Client")) {
    headers.set("X-Screen-Pilot-Client", CLIENT_HEADER_VALUE);
  }
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const payload = await safeJson(response);
    throw new Error(payload?.error || `${response.status} ${response.statusText}`);
  }
  return await response.json();
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function runUiTask(task, fallbackMessage) {
  hideBanner();
  try {
    await task();
  } catch (error) {
    showBanner(error.message || fallbackMessage);
  }
}

function setButtonBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function showBanner(message, isError = true) {
  banner.textContent = message;
  banner.classList.remove("hidden");
  banner.classList.toggle("warning-block", isError);
}

function hideBanner() {
  banner.classList.add("hidden");
}

function requireToken() {
  if (!state.localTrusted && !state.token) {
    throw new Error("请先完成配对。");
  }
}

function isLocalTrustedHost() {
  return location.hostname === "127.0.0.1" || location.hostname === "localhost" || location.hostname === "::1";
}

function shortenSessionId(sessionId) {
  return sessionId ? `${sessionId.slice(0, 8)}...` : "No Session";
}

function withCacheBust(path) {
  const url = new URL(path, location.origin);
  url.searchParams.set("_", String(Date.now()));
  return url.toString();
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

function prettyJson(rawMessage) {
  try {
    return JSON.stringify(JSON.parse(rawMessage), null, 2);
  } catch {
    return rawMessage || "";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function copyToClipboard(value) {
  if (!value) {
    throw new Error("没有可复制的内容。");
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
  } else {
    const input = document.createElement("textarea");
    input.value = value;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  showBanner("已复制。", false);
}

function runtimeActionEndpoint(runtime, action) {
  if (runtime === "lmstudio") {
    return {
      start_server: "/api/local-runtimes/lmstudio/server/start",
      download_model: "/api/local-runtimes/lmstudio/download-model",
      load_model: "/api/local-runtimes/lmstudio/load-model",
      unload_model: "/api/local-runtimes/lmstudio/unload-model"
    }[action];
  }

  return {
    start_server: "/api/local-runtimes/ollama/server/start",
    download_model: "/api/local-runtimes/ollama/pull-model",
    unload_model: "/api/local-runtimes/ollama/unload-model",
    remove_model: "/api/local-runtimes/ollama/remove-model"
  }[action];
}

function runtimeActionButton(runtime, action) {
  if (runtime === "lmstudio") {
    return {
      start_server: runtimePanels.lmstudio.buttons.start,
      download_model: runtimePanels.lmstudio.buttons.download,
      load_model: runtimePanels.lmstudio.buttons.load,
      unload_model: runtimePanels.lmstudio.buttons.unload
    }[action];
  }

  return {
    start_server: runtimePanels.ollama.buttons.start,
    download_model: runtimePanels.ollama.buttons.download,
    unload_model: runtimePanels.ollama.buttons.unload,
    remove_model: runtimePanels.ollama.buttons.remove
  }[action];
}

function runtimeActionDisplayName(action) {
  return {
    start_server: "启动 server",
    download_model: "下载当前模型",
    load_model: "加载当前模型",
    unload_model: "卸载当前模型",
    remove_model: "删除当前模型"
  }[action] || action;
}

function runtimeActionBusyLabel(action) {
  return {
    start_server: "启动中...",
    download_model: "下载中...",
    load_model: "加载中...",
    unload_model: "卸载中...",
    remove_model: "删除中..."
  }[action] || "处理中...";
}

function statusBadgeCopy(status) {
  if (!status.installed) {
    return "未安装";
  }

  if (status.serverRunning) {
    return "在线";
  }

  return "已安装";
}

function statusTone(status) {
  if (!status.installed) {
    return "error";
  }

  return status.serverRunning ? "online" : "neutral";
}

function statusCopy(status, currentModel) {
  if (!status.installed) {
    return `${providerDisplayName(status.slug)} 尚未检测到。先走官方下载，再回到这里启动 server、下载并加载 ${currentModel}。`;
  }

  const installedCopy = status.serverRunning ? "已检测到安装，server 当前在线。" : "已检测到安装，但 server 当前离线。";
  return `${installedCopy} 当前配置模型是 ${currentModel}。${(status.notes || [])[0] || ""}`;
}

function actionDisplayName(action) {
  if (action === "pair") {
    return "已配对";
  }
  if (action === "analyze_requested") {
    return "已发起分析";
  }
  if (action === "session_status") {
    return "状态更新";
  }
  return "事件";
}

function sourceDisplayName(source) {
  if (source === "iphone_web") {
    return "iPhone 网页端";
  }
  if (source === "mac_web") {
    return "Mac 网页端";
  }
  if (source === "mac_desktop") {
    return "Mac 原生壳";
  }
  return "未知客户端";
}

function ensureRuntimeJobPolling(jobId) {
  if (!jobId || runtimeJobPolls.has(jobId)) {
    return;
  }

  const poll = pollRuntimeJob(jobId).finally(() => {
    runtimeJobPolls.delete(jobId);
  });
  runtimeJobPolls.set(jobId, poll);
}

async function pollRuntimeJob(jobId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const job = await authedJson(`/api/local-runtimes/jobs/${jobId}`);
    mergeRuntimeJob(job);
    renderRuntimeStatus();

    if (job.status !== "running") {
      if (job.status === "done") {
        showBanner(job.summary || "运行时任务已完成。", false);
      } else if (job.status === "error") {
        showBanner(job.error || job.summary || "运行时任务失败。");
      }
      await loadRuntimeStatus();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

function mergeRuntimeJob(job) {
  if (!state.localRuntimeStatus) {
    state.localRuntimeStatus = {
      runtimes: {},
      jobs: []
    };
  }

  const jobs = Array.isArray(state.localRuntimeStatus.jobs) ? state.localRuntimeStatus.jobs : [];
  const existingIndex = jobs.findIndex((entry) => entry.id === job.id);
  if (existingIndex >= 0) {
    jobs.splice(existingIndex, 1, job);
  } else {
    jobs.unshift(job);
  }
  state.localRuntimeStatus.jobs = jobs.slice(0, 12);
}
