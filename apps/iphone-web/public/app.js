const VIEW_TITLES = {
  home: "主页",
  pair: "配对",
  status: "状态",
  detail: "详情",
  history: "历史"
};

const state = {
  token: localStorage.getItem("pairingToken") || "",
  sessions: [],
  currentSessionId: null,
  currentView: "home",
  ws: null,
  config: null,
  drawerOpen: false,
  lastError: null,
  toastTimer: null
};

const drawer = document.querySelector("#drawer");
const drawerBackdrop = document.querySelector("#drawer-backdrop");
const drawerClose = document.querySelector("#drawer-close");
const menuButton = document.querySelector("#menu-button");
const errorModal = document.querySelector("#error-modal");
const errorModalBackdrop = document.querySelector("#error-modal-backdrop");
const errorModalClose = document.querySelector("#error-modal-close");
const errorModalSession = document.querySelector("#error-modal-session");
const errorModalTime = document.querySelector("#error-modal-time");
const errorModalMessage = document.querySelector("#error-modal-message");
const errorModalOpenDetail = document.querySelector("#error-modal-open-detail");
const topToast = document.querySelector("#top-toast");
const topToastTitle = document.querySelector("#top-toast-title");
const topToastMessage = document.querySelector("#top-toast-message");
const topToastView = document.querySelector("#top-toast-view");
const topToastClose = document.querySelector("#top-toast-close");
const drawerLinks = Array.from(document.querySelectorAll(".drawer-link"));
const pairForm = document.querySelector("#pair-form");
const pairTokenInput = document.querySelector("#pair-token");
const pairButton = document.querySelector("#pair-button");
const analyzeForm = document.querySelector("#analyze-form");
const analyzeButton = document.querySelector("#analyze-button");
const questionInput = document.querySelector("#question");
const refreshHistoryButton = document.querySelector("#refresh-history");
const disconnectButton = document.querySelector("#disconnect-button");
const pageTitle = document.querySelector("#page-title");
const pairStatePill = document.querySelector("#pair-state-pill");
const socketPill = document.querySelector("#socket-pill");
const statusText = document.querySelector("#status-text");
const eventLog = document.querySelector("#event-log");
const historyList = document.querySelector("#history-list");
const currentSessionLabel = document.querySelector("#current-session-label");
const detailEmpty = document.querySelector("#detail-empty");
const detailView = document.querySelector("#detail-view");
const detailImage = document.querySelector("#detail-image");
const detailSummary = document.querySelector("#detail-summary");
const detailQuestion = document.querySelector("#detail-question");
const detailUpdatedAt = document.querySelector("#detail-updated-at");
const detailKeyPoints = document.querySelector("#detail-key-points");
const detailOcr = document.querySelector("#detail-ocr");
const detailAnswer = document.querySelector("#detail-answer");
const detailNextActions = document.querySelector("#detail-next-actions");
const detailUncertainties = document.querySelector("#detail-uncertainties");
const detailError = document.querySelector("#detail-error");
const viewSections = {
  home: document.querySelector("#view-home"),
  pair: document.querySelector("#view-pair"),
  status: document.querySelector("#view-status"),
  detail: document.querySelector("#view-detail"),
  history: document.querySelector("#view-history")
};

init().catch((error) => {
  updateStatus(error.message, true, { showToast: true });
});

window.addEventListener("unhandledrejection", (event) => {
  updateStatus(event.reason?.message || "请求失败", true, { showToast: true });
});

async function init() {
  state.config = await fetchJson("/api/config");
  pairTokenInput.value = state.token;
  wireEvents();
  setView(state.token ? "home" : "pair");
  renderShell();

  if (!state.token) {
    return;
  }

  const paired = await tryPairSilently();
  if (paired) {
    await afterPaired();
    return;
  }

  setView("pair");
  updateStatus("配对已失效，请重新输入 token。", true, { showToast: true });
}

function wireEvents() {
  menuButton.addEventListener("click", openDrawer);
  drawerClose.addEventListener("click", closeDrawer);
  drawerBackdrop.addEventListener("click", closeDrawer);
  errorModalClose.addEventListener("click", closeErrorModal);
  errorModalBackdrop.addEventListener("click", closeErrorModal);
  errorModalOpenDetail.addEventListener("click", () => {
    const sessionId = errorModalOpenDetail.dataset.sessionId;
    if (!sessionId) {
      return;
    }

    void runUiTask(async () => {
      await loadSession(sessionId);
      setView("detail");
      closeErrorModal();
      hideTopToast();
    }, "打开报错详情失败");
  });
  topToastClose.addEventListener("click", hideTopToast);
  topToastView.addEventListener("click", () => {
    if (!state.lastError) {
      return;
    }

    openErrorModal(state.lastError);
    hideTopToast();
  });

  for (const link of drawerLinks) {
    link.addEventListener("click", () => {
      const nextView = link.dataset.view;
      if (!nextView) {
        return;
      }

      if (!state.token && nextView !== "pair") {
        setView("pair");
        closeDrawer();
        updateStatus("请先完成配对。", true, { showToast: true });
        return;
      }

      setView(nextView);
      closeDrawer();
    });
  }

  pairForm.addEventListener("submit", onPairSubmit);
  analyzeForm.addEventListener("submit", onAnalyzeSubmit);
  refreshHistoryButton.addEventListener("click", () => {
    void runUiTask(() => loadHistory(), "刷新历史失败");
  });
  disconnectButton.addEventListener("click", disconnect);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDrawer();
      closeErrorModal();
    }
  });
}

function setView(nextView) {
  state.currentView = nextView;
  pageTitle.textContent = VIEW_TITLES[nextView];

  for (const [name, section] of Object.entries(viewSections)) {
    section.classList.toggle("hidden", name !== nextView);
    section.classList.toggle("active", name === nextView);
  }

  for (const link of drawerLinks) {
    link.classList.toggle("active", link.dataset.view === nextView);
  }
}

function openDrawer() {
  state.drawerOpen = true;
  drawer.classList.remove("hidden");
  drawerBackdrop.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  state.drawerOpen = false;
  drawer.classList.add("hidden");
  drawerBackdrop.classList.add("hidden");
  drawer.setAttribute("aria-hidden", "true");
}

async function onPairSubmit(event) {
  event.preventDefault();
  await runUiTask(async () => {
    const token = pairTokenInput.value.trim();
    if (!token) {
      throw new Error("请输入 pairing token。");
    }

    setButtonBusy(pairButton, true, "配对中...");
    try {
      await pair(token);
    } finally {
      setButtonBusy(pairButton, false, "完成配对");
    }
  }, "配对失败");
}

async function onAnalyzeSubmit(event) {
  event.preventDefault();
  await runUiTask(async () => {
    if (!state.token) {
      setView("pair");
      throw new Error("请先完成配对。");
    }

    setButtonBusy(analyzeButton, true, "提交中...");

    try {
      const payload = {
        question: questionInput.value.trim(),
        captureTarget: "main_display"
      };
      const response = await authedJson("/api/analyze", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      state.currentSessionId = response.sessionId;
      currentSessionLabel.textContent = formatSessionLabel(response.sessionId);
      renderPendingDetail({
        id: response.sessionId,
        question: payload.question,
        updatedAt: new Date().toISOString()
      });
      updateStatus("分析请求已提交，正在等待截图。");
      await loadHistory();
    } finally {
      setButtonBusy(analyzeButton, false, "抓取并分析");
    }
  }, "分析请求失败");
}

async function pair(token) {
  await fetchJson("/api/pair", {
    method: "POST",
    body: JSON.stringify({ token })
  });

  state.token = token;
  localStorage.setItem("pairingToken", token);
  await afterPaired();
}

async function tryPairSilently() {
  try {
    await fetchJson("/api/pair", {
      method: "POST",
      body: JSON.stringify({ token: state.token })
    });
    return true;
  } catch {
    localStorage.removeItem("pairingToken");
    state.token = "";
    return false;
  }
}

async function afterPaired() {
  renderShell();
  connectWebSocket();
  await loadHistory();
  updateStatus("已完成配对，可以发起新的分析。");
  setView("home");
}

function renderShell() {
  const paired = Boolean(state.token);
  pairStatePill.textContent = paired ? "已配对" : "未配对";
  pairStatePill.dataset.state = paired ? "paired" : "idle";
}

function connectWebSocket() {
  if (state.ws) {
    state.ws.close();
  }

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const websocketPath = state.config?.capabilities?.websocketPath || "/ws";
  const url = `${protocol}://${location.host}${websocketPath}?token=${encodeURIComponent(state.token)}`;
  const socket = new WebSocket(url);
  state.ws = socket;
  setSocketState("WS Connecting");

  socket.addEventListener("open", () => {
    setSocketState("WS Online");
  });

  socket.addEventListener("close", () => {
    setSocketState("WS Offline");
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    pushEvent(message);

    if (message.sessionId) {
      state.currentSessionId = message.sessionId;
      currentSessionLabel.textContent = formatSessionLabel(message.sessionId);
    }

    if (message.progressMessage) {
      updateStatus(message.progressMessage, message.status === "error", {
        showToast: message.status === "error",
        errorInfo: message.status === "error" ? buildErrorInfoFromSocketMessage(message) : null
      });
    } else if (message.status) {
      updateStatus(`状态更新：${message.status}`, message.status === "error", {
        showToast: message.status === "error",
        errorInfo: message.status === "error" ? buildErrorInfoFromSocketMessage(message) : null
      });
    }

    if (message.status === "done" || message.status === "error") {
      void runUiTask(async () => {
        await Promise.all([loadHistory(), loadSession(message.sessionId)]);
      }, "加载会话详情失败");
    }
  });
}

async function loadHistory() {
  const response = await authedJson("/api/sessions");
  state.sessions = response.sessions;
  renderHistory();

  if (state.sessions.length === 0) {
    state.currentSessionId = null;
    currentSessionLabel.textContent = "No Session";
    renderDetail(null);
    return;
  }

  if (!state.currentSessionId) {
    state.currentSessionId = state.sessions[0].id;
  }

  await loadSession(state.currentSessionId);
}

async function loadSession(sessionId) {
  const session = await authedJson(`/api/sessions/${sessionId}`);
  state.currentSessionId = sessionId;
  renderDetail(session);
}

function renderHistory() {
  historyList.innerHTML = "";

  if (state.sessions.length === 0) {
    historyList.innerHTML = '<div class="empty-state">还没有历史记录。</div>';
    return;
  }

  for (const session of state.sessions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    button.innerHTML = `
      <div class="history-status">${escapeHtml(session.status)}</div>
      <strong>${escapeHtml(session.question || "未填写问题")}</strong>
      <div class="muted">${escapeHtml(session.summary || session.error || "等待结果")}</div>
      <div class="muted">${formatDateTime(session.updatedAt)}</div>
    `;
    button.addEventListener("click", () => {
      void runUiTask(async () => {
        await loadSession(session.id);
        setView("detail");
      }, "打开历史会话失败");
    });
    historyList.append(button);
  }
}

function renderPendingDetail(session) {
  detailEmpty.classList.add("hidden");
  detailView.classList.remove("hidden");
  detailImage.removeAttribute("src");
  detailSummary.textContent = "截图和分析结果生成中。";
  detailQuestion.textContent = session.question || "未填写问题";
  detailUpdatedAt.textContent = formatDateTime(session.updatedAt);
  detailAnswer.textContent = "等待 Codex 返回。";
  detailError.textContent = "无";
  renderList(detailKeyPoints, []);
  renderList(detailOcr, []);
  renderList(detailNextActions, []);
  renderList(detailUncertainties, ["如果截图或结果尚未生成，这里会在完成后刷新。"]);
}

function renderDetail(session) {
  if (!session) {
    detailEmpty.classList.remove("hidden");
    detailView.classList.add("hidden");
    detailImage.removeAttribute("src");
    detailSummary.textContent = "";
    detailQuestion.textContent = "-";
    detailUpdatedAt.textContent = "-";
    detailAnswer.textContent = "";
    detailError.textContent = "";
    renderList(detailKeyPoints, []);
    renderList(detailOcr, []);
    renderList(detailNextActions, []);
    renderList(detailUncertainties, []);
    return;
  }

  detailEmpty.classList.add("hidden");
  detailView.classList.remove("hidden");
  currentSessionLabel.textContent = formatSessionLabel(session.id);
  detailQuestion.textContent = session.question || "未填写问题";
  detailUpdatedAt.textContent = formatDateTime(session.updatedAt);

  if (session.imageUrl) {
    detailImage.src = `${session.imageUrl}?t=${Date.now()}`;
  } else {
    detailImage.removeAttribute("src");
  }

  detailSummary.textContent = session.result?.summary || "暂无摘要";
  detailAnswer.textContent = session.result?.answer || "暂无回答";
  detailError.textContent = session.error || "无";
  renderList(detailKeyPoints, session.result?.key_points || []);
  renderList(detailOcr, session.result?.ocr_text || []);
  renderList(detailNextActions, session.result?.next_actions || []);
  renderList(detailUncertainties, session.result?.uncertainties || []);
}

function renderList(container, items) {
  container.innerHTML = "";

  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "无";
    container.append(li);
    return;
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    container.append(li);
  }
}

function pushEvent(message) {
  const entry = document.createElement("div");
  entry.className = "event-item";
  entry.innerHTML = `
    <div class="history-status">${escapeHtml(message.status || "update")}</div>
    <div>${escapeHtml(message.progressMessage || "收到状态更新")}</div>
    <div class="muted">${new Date().toLocaleTimeString()}</div>
  `;

  const errorInfo = buildErrorInfoFromSocketMessage(message);
  if (errorInfo) {
    const actions = document.createElement("div");
    actions.className = "event-item-actions";
    const detailButton = document.createElement("button");
    detailButton.type = "button";
    detailButton.className = "event-detail-button";
    detailButton.textContent = "查看报错";
    detailButton.addEventListener("click", () => {
      openErrorModal(errorInfo);
    });
    actions.append(detailButton);
    entry.append(actions);
  }

  eventLog.prepend(entry);
  const overflow = Array.from(eventLog.children).slice(20);
  for (const node of overflow) {
    node.remove();
  }
}

function updateStatus(message, isError = false, options = {}) {
  statusText.textContent = message;
  statusText.style.color = isError ? "var(--warn)" : "var(--ink)";

  if (isError && options.showToast) {
    showTopToast(
      options.errorInfo || {
        title: "操作失败",
        message,
        detail: message
      }
    );
  }
}

function setSocketState(label) {
  socketPill.textContent = label;
}

async function authedJson(url, options = {}) {
  if (!state.token) {
    throw new Error("设备尚未配对");
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${state.token}`);
  return fetchJson(url, { ...options, headers });
}

async function fetchJson(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload;
}

function disconnect() {
  localStorage.removeItem("pairingToken");
  state.token = "";
  state.sessions = [];
  state.currentSessionId = null;

  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }

  pairTokenInput.value = "";
  questionInput.value = "";
  eventLog.innerHTML = "";
  historyList.innerHTML = "";
  renderDetail(null);
  currentSessionLabel.textContent = "No Session";
  state.lastError = null;
  renderShell();
  setSocketState("WS Offline");
  hideTopToast();
  closeErrorModal();
  updateStatus("已清除配对信息。");
  setView("pair");
  closeDrawer();
}

async function runUiTask(task, fallbackMessage) {
  try {
    await task();
  } catch (error) {
    const message = error.message || fallbackMessage;
    updateStatus(message, true, {
      showToast: true,
      errorInfo: {
        title: "操作失败",
        message,
        detail: message
      }
    });
  }
}

function setButtonBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}

function formatSessionLabel(sessionId) {
  if (!sessionId) {
    return "No Session";
  }

  return sessionId.length > 14 ? `#${sessionId.slice(0, 8)}` : sessionId;
}

function formatDateTime(value) {
  return new Date(value).toLocaleString();
}

function showTopToast(errorInfo) {
  state.lastError = errorInfo;
  topToastTitle.textContent = errorInfo.title || "错误提示";
  topToastMessage.textContent = errorInfo.message || "发生错误";
  topToast.classList.remove("hidden");

  const hasDetail = Boolean(errorInfo.detail || errorInfo.sessionId);
  topToastView.classList.toggle("hidden", !hasDetail);

  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
  }

  state.toastTimer = setTimeout(() => {
    hideTopToast();
  }, 5000);
}

function hideTopToast() {
  topToast.classList.add("hidden");
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
    state.toastTimer = null;
  }
}

function openErrorModal(errorInfo) {
  state.lastError = errorInfo;
  errorModalSession.textContent = errorInfo.sessionId ? formatSessionLabel(errorInfo.sessionId) : "无会话";
  errorModalTime.textContent = errorInfo.timestamp ? formatDateTime(errorInfo.timestamp) : formatDateTime(new Date().toISOString());
  errorModalMessage.textContent = errorInfo.detail || errorInfo.message || "未知错误";
  errorModalOpenDetail.classList.toggle("hidden", !errorInfo.sessionId);

  if (errorInfo.sessionId) {
    errorModalOpenDetail.dataset.sessionId = errorInfo.sessionId;
  } else {
    delete errorModalOpenDetail.dataset.sessionId;
  }

  errorModal.classList.remove("hidden");
  errorModalBackdrop.classList.remove("hidden");
  errorModal.setAttribute("aria-hidden", "false");
}

function closeErrorModal() {
  errorModal.classList.add("hidden");
  errorModalBackdrop.classList.add("hidden");
  errorModal.setAttribute("aria-hidden", "true");
}

function buildErrorInfoFromSocketMessage(message) {
  if (message.status !== "error") {
    return null;
  }

  const detail = message.payload?.error || message.progressMessage || "分析执行失败";
  return {
    title: "分析失败",
    message: message.progressMessage || "本次分析发生错误",
    detail,
    sessionId: message.sessionId || null,
    timestamp: new Date().toISOString()
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
