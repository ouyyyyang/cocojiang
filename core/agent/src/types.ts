export const RESERVED_CAPTURE_TARGETS = ["main_display", "frontmost_window"] as const;
export const SUPPORTED_CAPTURE_TARGETS = ["main_display"] as const;
export const SESSION_STATUSES = ["queued", "capturing", "analyzing", "done", "error"] as const;

export type CaptureTarget = (typeof RESERVED_CAPTURE_TARGETS)[number];
export type SupportedCaptureTarget = (typeof SUPPORTED_CAPTURE_TARGETS)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];

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

export interface AgentSettings {
  codexModel: string;
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
  codexModel: string;
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
  codexModel: string;
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
    codexModel: string;
  };
  codexModels: CodexModelOption[];
}
