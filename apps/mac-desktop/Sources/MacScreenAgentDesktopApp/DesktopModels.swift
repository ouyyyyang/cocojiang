import Foundation

enum DesktopModelProvider: String, Codable, CaseIterable, Identifiable {
    case codex
    case lmstudio
    case ollama

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .codex:
            return "Codex"
        case .lmstudio:
            return "LM Studio (MLX)"
        case .ollama:
            return "本地 Ollama"
        }
    }
}

enum DesktopLocalRuntimeSlug: String, Codable, CaseIterable, Identifiable {
    case lmstudio
    case ollama

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .lmstudio:
            return "LM Studio (MLX)"
        case .ollama:
            return "本地 Ollama"
        }
    }
}

enum DesktopLocalRuntimeAction: String, Codable {
    case startServer = "start_server"
    case downloadModel = "download_model"
    case loadModel = "load_model"
    case unloadModel = "unload_model"
    case removeModel = "remove_model"

    var displayName: String {
        switch self {
        case .startServer:
            return "启动 server"
        case .downloadModel:
            return "下载当前模型"
        case .loadModel:
            return "加载当前模型"
        case .unloadModel:
            return "卸载当前模型"
        case .removeModel:
            return "删除当前模型"
        }
    }
}

struct DesktopSettings: Codable {
    let modelProvider: DesktopModelProvider
    let codexModel: String
    let localVisionModel: String
}

struct DesktopCodexAuthStatus: Codable {
    let authenticated: Bool
    let authMode: String?
    let rawStatus: String
}

struct DesktopCaptureTestResponse: Codable {
    let capturedAt: String
    let imageUrl: String
    let captureTarget: String
}

struct DesktopCodexResult: Codable {
    let summary: String
    let keyPoints: [String]
    let ocrText: [String]
    let answer: String
    let nextActions: [String]
    let uncertainties: [String]

    enum CodingKeys: String, CodingKey {
        case summary
        case keyPoints = "key_points"
        case ocrText = "ocr_text"
        case answer
        case nextActions = "next_actions"
        case uncertainties
    }
}

struct DesktopModelTestResponse: Codable {
    let capturedAt: String
    let question: String
    let modelProvider: DesktopModelProvider
    let codexModel: String
    let imageUrl: String
    let result: DesktopCodexResult
    let rawMessage: String
}

struct DesktopAnalyzeResponse: Codable {
    let sessionId: String
}

struct DesktopSessionsResponse: Codable {
    let sessions: [DesktopSessionSummary]
}

struct DesktopSessionSummary: Codable, Identifiable {
    let id: String
    let question: String
    let captureTarget: String
    let modelProvider: DesktopModelProvider
    let codexModel: String
    let status: String
    let createdAt: String
    let updatedAt: String
    let imageUrl: String?
    let summary: String?
    let error: String?
}

struct DesktopSessionRecord: Codable, Identifiable {
    let id: String
    let question: String
    let captureTarget: String
    let modelProvider: DesktopModelProvider
    let codexModel: String
    let status: String
    let createdAt: String
    let updatedAt: String
    let imageUrl: String?
    let result: DesktopCodexResult?
    let error: String?
}

struct DesktopLaunchAuthResponse: Codable {
    let ok: Bool
    let message: String
}

struct DesktopLocalRuntimeModelRef: Codable, Identifiable {
    let id: String
    let label: String
    let identifier: String?
}

struct DesktopLocalRuntimeStatus: Codable {
    let slug: DesktopLocalRuntimeSlug
    let displayName: String
    let installed: Bool
    let cliAvailable: Bool
    let executablePath: String?
    let appDetected: Bool
    let appPath: String?
    let installUrl: String
    let serverHost: String
    let serverRunning: Bool
    let modelsDirHint: String
    let supportsManagedDelete: Bool
    let downloadedModels: [DesktopLocalRuntimeModelRef]
    let loadedModels: [DesktopLocalRuntimeModelRef]
    let notes: [String]
}

struct DesktopLocalRuntimeStatusMap: Codable {
    let lmstudio: DesktopLocalRuntimeStatus
    let ollama: DesktopLocalRuntimeStatus
}

struct DesktopLocalRuntimeJob: Codable, Identifiable {
    let id: String
    let runtime: DesktopLocalRuntimeSlug
    let action: DesktopLocalRuntimeAction
    let modelSlug: String?
    let identifier: String?
    let status: String
    let summary: String
    let createdAt: String
    let updatedAt: String
    let logs: [String]
    let error: String?
}

struct DesktopLocalRuntimeStatusResponse: Codable {
    let runtimes: DesktopLocalRuntimeStatusMap
    var jobs: [DesktopLocalRuntimeJob]
}
