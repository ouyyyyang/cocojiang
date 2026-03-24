export const RESERVED_CAPTURE_TARGETS = ["main_display", "frontmost_window"] as const;
export const SUPPORTED_CAPTURE_TARGETS = ["main_display"] as const;
export const SESSION_STATUSES = ["queued", "capturing", "analyzing", "done", "error"] as const;
export const MODEL_PROVIDERS = ["codex", "lmstudio", "ollama"] as const;
export const CODEX_REASONING_EFFORTS = ["low", "medium", "high"] as const;
export const LOCAL_RUNTIME_SLUGS = ["lmstudio", "ollama"] as const;
export const LOCAL_RUNTIME_JOB_STATUSES = ["running", "done", "error"] as const;
export const CLIENT_SOURCES = ["iphone_web", "mac_web", "mac_desktop", "unknown"] as const;
export const LOCAL_RUNTIME_ACTIONS = [
  "start_server",
  "download_model",
  "load_model",
  "unload_model",
  "remove_model"
] as const;

export type CaptureTarget = (typeof RESERVED_CAPTURE_TARGETS)[number];
export type SupportedCaptureTarget = (typeof SUPPORTED_CAPTURE_TARGETS)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];
export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number];
export type LocalRuntimeSlug = (typeof LOCAL_RUNTIME_SLUGS)[number];
export type LocalRuntimeJobStatus = (typeof LOCAL_RUNTIME_JOB_STATUSES)[number];
export type ClientSource = (typeof CLIENT_SOURCES)[number];
export type LocalRuntimeAction = (typeof LOCAL_RUNTIME_ACTIONS)[number];

export interface CodexOutput {
  summary: string;
  key_points: string[];
  ocr_text: string[];
  answer: string;
  next_actions: string[];
  uncertainties: string[];
}

export interface CodexModelOption {
  slug: string;
  displayName: string;
  description?: string;
}

export interface LocalVisionModelCatalogEntry extends CodexModelOption {
  lmStudioQuery: string;
  ollamaModel: string;
}

export interface ModelProviderOption {
  slug: ModelProvider;
  displayName: string;
  description?: string;
}

export interface CodexReasoningEffortOption {
  slug: CodexReasoningEffort;
  displayName: string;
  description?: string;
}

export interface AgentSettings {
  modelProvider: ModelProvider;
  codexModel: string;
  codexReasoningEffort: CodexReasoningEffort;
  localVisionModel: string;
}

export interface SessionEvent {
  timestamp: string;
  status: SessionStatus;
  progressMessage?: string;
  payload?: unknown;
}

export interface SessionRecord {
  id: string;
  question: string;
  captureTarget: CaptureTarget;
  modelProvider: ModelProvider;
  codexModel: string;
  codexReasoningEffort: CodexReasoningEffort;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  imagePath?: string;
  imageUrl?: string;
  frontmostApp?: string | null;
  windowTitle?: string | null;
  result?: CodexOutput;
  error?: string;
  events: SessionEvent[];
}

export interface SessionSummary {
  id: string;
  question: string;
  captureTarget: CaptureTarget;
  modelProvider: ModelProvider;
  codexModel: string;
  codexReasoningEffort: CodexReasoningEffort;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  imageUrl?: string;
  summary?: string;
  error?: string;
}

export interface AgentConfigPayload {
  serviceName: string;
  auth: {
    pairingRequired: true;
  };
  capabilities: {
    captureTargets: readonly SupportedCaptureTarget[];
    websocketPath: string;
    history: true;
    settings: true;
  };
  defaults: {
    captureTarget: SupportedCaptureTarget;
    modelProvider: ModelProvider;
    codexModel: string;
    codexReasoningEffort: CodexReasoningEffort;
    localVisionModel: string;
  };
  modelProviders: ModelProviderOption[];
  codexModels: CodexModelOption[];
  codexReasoningEfforts: CodexReasoningEffortOption[];
  localVisionModels: CodexModelOption[];
}

export interface PromptTemplatePayload {
  promptTemplate: string;
  defaultPromptTemplate: string;
}

export interface LocalRuntimeModelRef {
  id: string;
  label: string;
  identifier?: string;
}

export interface LocalRuntimeStatusRecord {
  slug: LocalRuntimeSlug;
  displayName: string;
  installed: boolean;
  cliAvailable: boolean;
  executablePath: string | null;
  appDetected: boolean;
  appPath: string | null;
  installUrl: string;
  serverHost: string;
  serverRunning: boolean;
  modelsDirHint: string;
  supportsManagedDelete: boolean;
  downloadedModels: LocalRuntimeModelRef[];
  loadedModels: LocalRuntimeModelRef[];
  notes: string[];
}

export interface LocalRuntimeJobRecord {
  id: string;
  runtime: LocalRuntimeSlug;
  action: LocalRuntimeAction;
  modelSlug?: string;
  identifier?: string;
  status: LocalRuntimeJobStatus;
  summary: string;
  createdAt: string;
  updatedAt: string;
  logs: string[];
  error?: string;
}

export interface LocalRuntimeStatusPayload {
  runtimes: Record<LocalRuntimeSlug, LocalRuntimeStatusRecord>;
  jobs: LocalRuntimeJobRecord[];
}

export interface LocalConsoleInfoPayload {
  pairingToken: string;
  macWebUrl: string;
  iphoneUrl: string;
  phoneUrls: string[];
}

export interface ActivityRecord {
  id: string;
  timestamp: string;
  source: ClientSource;
  action: "pair" | "analyze_requested" | "session_status";
  sessionId?: string;
  status?: SessionStatus;
  message: string;
  question?: string;
}

export interface ActivitiesPayload {
  activities: ActivityRecord[];
}
