import Foundation

struct DesktopSettings: Codable {
    let codexModel: String
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
