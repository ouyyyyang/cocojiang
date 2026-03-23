import AppKit
import Combine
import Foundation

@MainActor
final class AgentController: ObservableObject {
    @Published var isRunning = false
    @Published var statusText = "未启动"
    @Published var portText = "8790"
    @Published var serviceURLText = "http://127.0.0.1:8790"
    @Published var pairingToken = "-"
    @Published var logText = "日志会显示在这里。\n"
    @Published var lastError: String?

    @Published var analysisQuestion = ""
    @Published var isSubmittingAnalysis = false
    @Published var isRefreshingState = false

    @Published var codexModel = "gpt-5.4"
    @Published var isSavingSettings = false
    @Published var authStatusText = "未检查"
    @Published var authDetailText = "本机 Codex 认证状态会显示在这里。"
    @Published var isRefreshingAuth = false
    @Published var isStartingAuth = false

    @Published var captureTestImage: NSImage?
    @Published var captureTestTimestamp = "-"
    @Published var isRunningCaptureTest = false

    @Published var modelTestQuestion = "请总结当前屏幕最重要的信息，并说明是否存在错误或阻塞。"
    @Published var modelTestImage: NSImage?
    @Published var modelTestTimestamp = "-"
    @Published var modelTestSummary = "-"
    @Published var modelTestAnswer = "-"
    @Published var modelTestKeyPoints: [String] = []
    @Published var modelTestNextActions: [String] = []
    @Published var modelTestUncertainties: [String] = []
    @Published var modelTestRawOutput = ""
    @Published var isRunningModelTest = false

    @Published var sessions: [DesktopSessionSummary] = []
    @Published var selectedSessionID: String?
    @Published var selectedSession: DesktopSessionRecord?
    @Published var selectedSessionImage: NSImage?
    @Published var isLoadingHistory = false

    let repositoryRoot: URL
    let logsDirectory: URL
    let logFileURL: URL
    let appDataDirectory: URL
    let tokenFileURL: URL
    let shellPath: String
    let codexExecutablePath: String?

    private var process: Process?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?
    private var logHandle: FileHandle?
    private var didAutoStart = false
    private var bootstrapTask: Task<Void, Never>?

    init() {
        repositoryRoot = Self.resolveRepositoryRoot()
        logsDirectory = repositoryRoot.appendingPathComponent("runtime/mac-desktop", isDirectory: true)
        logFileURL = logsDirectory.appendingPathComponent("desktop-agent.log")
        appDataDirectory = logsDirectory.appendingPathComponent("app_data", isDirectory: true)
        tokenFileURL = appDataDirectory.appendingPathComponent("pairing-token.txt")
        let shellEnvironment = Self.resolveShellEnvironment()
        shellPath = shellEnvironment.path
        codexExecutablePath = shellEnvironment.codexBin
        prepareLogs()
        loadPersistedToken()

        if let codexExecutablePath {
            appendLog("Resolved codex binary: \(codexExecutablePath)")
        } else {
            appendLog("Warning: codex binary was not found in the interactive shell PATH.")
            authDetailText = "未在当前 shell 环境中找到 codex，可执行认证和模型测试前请先确认 CLI 已正确安装。"
        }
    }

    deinit {
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        stderrPipe?.fileHandleForReading.readabilityHandler = nil
        process?.terminate()
        try? logHandle?.close()
    }

    func startAgentIfNeeded() {
        guard !didAutoStart else { return }
        didAutoStart = true
        startAgent()
    }

    func startAgent() {
        guard process == nil else {
            statusText = "服务已经在运行"
            return
        }

        let port = normalizedPort()
        let serviceURL = URL(string: "http://127.0.0.1:\(port)")!
        serviceURLText = serviceURL.absoluteString
        statusText = "正在启动服务..."
        lastError = nil

        appendLog("=== Starting Mac agent on port \(port) ===")

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = [
            "-lc",
            "npm run build && exec node build/node/core/agent/src/server.js"
        ]
        process.currentDirectoryURL = repositoryRoot
        process.environment = ProcessInfo.processInfo.environment.merging(
            [
                "PORT": String(port),
                "APP_DATA_DIR": appDataDirectory.path,
                "PATH": shellPath,
                "CODEX_BIN": codexExecutablePath ?? "codex"
            ],
            uniquingKeysWith: { _, new in new }
        )

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        observe(pipe: stdoutPipe)
        observe(pipe: stderrPipe)

        process.terminationHandler = { [weak self] process in
            Task { @MainActor in
                guard let self else { return }
                self.isRunning = false
                self.process = nil
                self.stdoutPipe = nil
                self.stderrPipe = nil
                self.bootstrapTask?.cancel()
                self.bootstrapTask = nil

                if process.terminationStatus == 0 {
                    self.statusText = "服务已停止"
                    self.appendLog("=== Agent stopped ===")
                } else {
                    self.statusText = "服务异常退出"
                    self.lastError = "Agent exited with status \(process.terminationStatus)"
                    self.appendLog("=== Agent exited with status \(process.terminationStatus) ===")
                }
            }
        }

        do {
            try process.run()
            self.process = process
            self.stdoutPipe = stdoutPipe
            self.stderrPipe = stderrPipe
            self.isRunning = true
        } catch {
            self.statusText = "无法启动服务"
            self.present(error: error, status: "无法启动服务")
            appendLog("Failed to start agent: \(self.presentableErrorMessage(error))")
        }
    }

    func stopAgent() {
        guard let process else { return }
        appendLog("=== Stopping Mac agent ===")
        process.terminate()
        self.process = nil
        isRunning = false
        statusText = "服务已停止"
    }

    func stopAgentForTermination() {
        stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        stderrPipe?.fileHandleForReading.readabilityHandler = nil
        process?.terminate()
        process = nil
    }

    func refreshAllState() {
        guard isRunning else { return }

        Task {
            await MainActor.run {
                self.isRefreshingState = true
            }

            do {
                async let settingsTask: Void = refreshSettings()
                async let authTask: Void = refreshAuthStatus()
                async let historyTask: Void = refreshSessions()
                _ = try await (settingsTask, authTask, historyTask)
            } catch {
                await MainActor.run {
                    self.present(error: error)
                }
            }

            await MainActor.run {
                self.isRefreshingState = false
            }
        }
    }

    func saveSettings() {
        Task {
            guard isRunning else { return }
            await MainActor.run {
                self.isSavingSettings = true
                self.lastError = nil
            }

            do {
                let body = try jsonData(["codexModel": codexModel])
                let settings: DesktopSettings = try await requestJSON(path: "/api/settings", method: "POST", body: body)
                await MainActor.run {
                    self.codexModel = settings.codexModel
                    self.statusText = "已保存模型配置"
                }
            } catch {
                await MainActor.run {
                    self.present(error: error, status: "保存配置失败")
                }
            }

            await MainActor.run {
                self.isSavingSettings = false
            }
        }
    }

    func refreshAuthStatus() async throws {
        await MainActor.run {
            self.isRefreshingAuth = true
        }

        defer {
            Task { @MainActor in
                self.isRefreshingAuth = false
            }
        }

        let status: DesktopCodexAuthStatus = try await requestJSON(path: "/api/codex-auth/status")
        await MainActor.run {
            self.authStatusText = status.authenticated
                ? "已认证\(status.authMode.map { " · \($0)" } ?? "")"
                : "未认证"
            self.authDetailText = status.rawStatus
        }
    }

    func startCodexAuthentication() {
        Task {
            guard isRunning else { return }
            await MainActor.run {
                self.isStartingAuth = true
                self.lastError = nil
            }

            do {
                let response: DesktopLaunchAuthResponse = try await requestJSON(path: "/api/codex-auth/start", method: "POST")
                await MainActor.run {
                    self.authDetailText = response.message
                    self.statusText = "已启动 Codex 登录流程"
                }
            } catch {
                await MainActor.run {
                    self.present(error: error, status: "启动认证失败")
                }
            }

            await MainActor.run {
                self.isStartingAuth = false
            }
        }
    }

    func submitAnalysis() {
        Task {
            guard isRunning else { return }
            await MainActor.run {
                self.isSubmittingAnalysis = true
                self.lastError = nil
            }

            do {
                let body = try jsonData([
                    "question": analysisQuestion.trimmingCharacters(in: .whitespacesAndNewlines),
                    "captureTarget": "main_display"
                ])
                let response: DesktopAnalyzeResponse = try await requestJSON(path: "/api/analyze", method: "POST", body: body)
                await MainActor.run {
                    self.statusText = "分析任务已提交"
                    self.selectedSessionID = response.sessionId
                }
                try await Task.sleep(for: .seconds(1))
                try await refreshSessions()
                if let selectedSessionID {
                    try await loadSession(selectedSessionID)
                }
            } catch {
                await MainActor.run {
                    self.present(error: error, status: "提交分析失败")
                }
            }

            await MainActor.run {
                self.isSubmittingAnalysis = false
            }
        }
    }

    func runCaptureTest() {
        Task {
            guard isRunning else { return }
            await MainActor.run {
                self.isRunningCaptureTest = true
                self.lastError = nil
                self.statusText = "正在抓取屏幕..."
            }

            do {
                let response: DesktopCaptureTestResponse = try await requestJSON(path: "/api/test/capture", method: "POST")
                let image = try await loadImage(path: response.imageUrl)
                await MainActor.run {
                    self.captureTestImage = image
                    self.captureTestTimestamp = self.format(dateString: response.capturedAt)
                    self.statusText = "屏幕抓取测试完成"
                }
            } catch {
                await MainActor.run {
                    self.present(error: error, status: "屏幕抓取测试失败")
                }
            }

            await MainActor.run {
                self.isRunningCaptureTest = false
            }
        }
    }

    func runModelTest() {
        Task {
            guard isRunning else { return }
            await MainActor.run {
                self.isRunningModelTest = true
                self.lastError = nil
                self.statusText = "模型加载中..."
            }

            do {
                let body = try jsonData([
                    "question": modelTestQuestion.trimmingCharacters(in: .whitespacesAndNewlines)
                ])
                let response: DesktopModelTestResponse = try await requestJSON(path: "/api/test/model", method: "POST", body: body)
                let image = try await loadImage(path: response.imageUrl)
                await MainActor.run {
                    self.modelTestImage = image
                    self.modelTestTimestamp = self.format(dateString: response.capturedAt)
                    self.modelTestSummary = response.result.summary
                    self.modelTestAnswer = response.result.answer
                    self.modelTestKeyPoints = response.result.keyPoints
                    self.modelTestNextActions = response.result.nextActions
                    self.modelTestUncertainties = response.result.uncertainties
                    self.modelTestRawOutput = self.prettyJSON(response.rawMessage)
                    self.statusText = "模型测试完成"
                }
            } catch {
                await MainActor.run {
                    self.present(error: error, status: "模型测试失败")
                }
            }

            await MainActor.run {
                self.isRunningModelTest = false
            }
        }
    }

    func refreshSessions() async throws {
        await MainActor.run {
            self.isLoadingHistory = true
        }

        defer {
            Task { @MainActor in
                self.isLoadingHistory = false
            }
        }

        let response: DesktopSessionsResponse = try await requestJSON(path: "/api/sessions")
        await MainActor.run {
            self.sessions = response.sessions
        }

        if let selectedSessionID {
            try await loadSession(selectedSessionID)
        } else if let first = response.sessions.first {
            await MainActor.run {
                self.selectedSessionID = first.id
            }
            try await loadSession(first.id)
        }
    }

    func selectSession(_ sessionID: String) {
        Task {
            do {
                try await loadSession(sessionID)
            } catch {
                await MainActor.run {
                    self.present(error: error, status: "加载历史详情失败")
                }
            }
        }
    }

    func openInBrowser() {
        guard let url = currentURL else { return }
        NSWorkspace.shared.open(url)
    }

    func openLogsFolder() {
        NSWorkspace.shared.activateFileViewerSelecting([logFileURL])
    }

    func copyServiceURL() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(serviceURLText, forType: .string)
    }

    func copyPairingToken() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(pairingToken, forType: .string)
    }

    func openRepositoryRoot() {
        NSWorkspace.shared.activateFileViewerSelecting([repositoryRoot])
    }

    private var currentURL: URL? {
        URL(string: serviceURLText)
    }

    private func prepareLogs() {
        do {
            try FileManager.default.createDirectory(at: logsDirectory, withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: appDataDirectory, withIntermediateDirectories: true)

            if !FileManager.default.fileExists(atPath: logFileURL.path) {
                FileManager.default.createFile(atPath: logFileURL.path, contents: Data())
            }

            logHandle = try FileHandle(forWritingTo: logFileURL)
            try logHandle?.seekToEnd()
            appendLog("=== Mac desktop console ready ===")
        } catch {
            logText += "无法创建日志文件：\(error.localizedDescription)\n"
        }
    }

    private func observe(pipe: Pipe) {
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else {
                return
            }

            Task { @MainActor in
                self?.consumeLogChunk(text)
            }
        }
    }

    private func consumeLogChunk(_ chunk: String) {
        appendLog(chunk.trimmingCharacters(in: .newlines))

        for line in chunk.split(whereSeparator: \.isNewline).map(String.init) {
            if let port = parsePort(from: line) {
                serviceURLText = "http://127.0.0.1:\(port)"
                statusText = "服务运行中"
                scheduleBootstrap()
            }

            if line.hasPrefix("Pairing token: ") {
                pairingToken = String(line.dropFirst("Pairing token: ".count))
                scheduleBootstrap()
            }
        }
    }

    private func scheduleBootstrap() {
        bootstrapTask?.cancel()
        bootstrapTask = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: .milliseconds(400))
            await self.bootstrapConsoleState()
        }
    }

    private func bootstrapConsoleState() async {
        loadPersistedToken()

        do {
            async let settingsTask: Void = refreshSettings()
            async let authTask: Void = refreshAuthStatus()
            async let historyTask: Void = refreshSessions()
            _ = try await (settingsTask, authTask, historyTask)
        } catch {
            present(error: error)
        }
    }

    private func refreshSettings() async throws {
        let settings: DesktopSettings = try await requestJSON(path: "/api/settings")
        await MainActor.run {
            self.codexModel = settings.codexModel
        }
    }

    private func loadSession(_ sessionID: String) async throws {
        let record: DesktopSessionRecord = try await requestJSON(path: "/api/sessions/\(sessionID)")
        let image: NSImage?
        if let imageURL = record.imageUrl {
            image = try await loadImage(path: imageURL)
        } else {
            image = nil
        }
        await MainActor.run {
            self.selectedSessionID = sessionID
            self.selectedSession = record
            self.selectedSessionImage = image
        }
    }

    private func requestJSON<T: Decodable>(
        path: String,
        method: String = "GET",
        body: Data? = nil
    ) async throws -> T {
        guard let baseURL = currentURL else {
            throw ControllerError.serviceUnavailable
        }

        let token = pairingTokenFromMemoryOrDisk()
        guard !token.isEmpty else {
            throw ControllerError.missingPairingToken
        }

        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw ControllerError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ControllerError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = parseErrorMessage(from: data) ?? "Request failed with \(httpResponse.statusCode)"
            throw ControllerError.remote(message)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }

    private func loadImage(path: String) async throws -> NSImage {
        guard let baseURL = currentURL else {
            throw ControllerError.serviceUnavailable
        }

        let token = pairingTokenFromMemoryOrDisk()
        guard !token.isEmpty else {
            throw ControllerError.missingPairingToken
        }

        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw ControllerError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw ControllerError.remote("Failed to load image")
        }

        guard let image = NSImage(data: data) else {
            throw ControllerError.remote("Failed to decode image")
        }

        return image
    }

    private func parsePort(from line: String) -> Int? {
        guard let portText = line.components(separatedBy: "port ").last else {
            return nil
        }

        return Int(portText.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private func appendLog(_ line: String) {
        guard !line.isEmpty else { return }

        let formatted = line.hasSuffix("\n") ? line : "\(line)\n"
        logText += formatted

        if logText.count > 60_000 {
            logText = String(logText.suffix(60_000))
        }

        if let data = formatted.data(using: .utf8) {
            try? logHandle?.write(contentsOf: data)
        }
    }

    private func normalizedPort() -> Int {
        let parsed = Int(portText.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 8790
        let safePort = max(1025, min(parsed, 65535))
        portText = String(safePort)
        return safePort
    }

    private func loadPersistedToken() {
        guard let token = try? String(contentsOf: tokenFileURL, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !token.isEmpty else {
            return
        }

        pairingToken = token
    }

    private func pairingTokenFromMemoryOrDisk() -> String {
        if pairingToken != "-" && !pairingToken.isEmpty {
            return pairingToken
        }

        loadPersistedToken()
        return pairingToken == "-" ? "" : pairingToken
    }

    private func parseErrorMessage(from data: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        return object["error"] as? String
    }

    private func present(error: Error, status: String? = nil) {
        if isIgnorableCancellation(error) {
            return
        }

        let message = presentableErrorMessage(error)
        lastError = message
        if let status {
            statusText = status
        }
    }

    private func isIgnorableCancellation(_ error: Error) -> Bool {
        if error is CancellationError {
            return true
        }

        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return true
        }

        if nsError.domain == NSCocoaErrorDomain && nsError.code == NSUserCancelledError {
            return true
        }

        let message = ((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return message == "cancelled" || message == "canceled" || message == "已取消"
    }

    private func presentableErrorMessage(_ error: Error) -> String {
        let message = ((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if message.contains("could not create image from display") || message.contains("screencapture exited with code 1") {
            return "录屏权限还没有真正生效。请到“系统设置 > 隐私与安全性 > 屏幕与系统音频录制”里允许 Screen Pilot Native.app，然后完全退出并重新打开 App 后再测试抓屏。"
        }

        if message.contains("spawn codex ENOENT") {
            return "没有找到 Codex CLI。请确认 `codex` 已安装，并且在终端执行 `command -v codex` 可以返回路径。"
        }

        return message.isEmpty ? "发生未知错误。" : message
    }

    private func jsonData(_ object: [String: String]) throws -> Data {
        try JSONSerialization.data(withJSONObject: object, options: [])
    }

    private func format(dateString: String) -> String {
        let formatter = ISO8601DateFormatter()
        if let date = formatter.date(from: dateString) {
            return date.formatted(date: .abbreviated, time: .standard)
        }
        return dateString
    }

    private func prettyJSON(_ raw: String) -> String {
        guard let data = raw.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let prettyData = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted]),
              let prettyString = String(data: prettyData, encoding: .utf8) else {
            return raw
        }

        return prettyString
    }

    private static func resolveRepositoryRoot() -> URL {
        let startingPoints = [
            URL(fileURLWithPath: FileManager.default.currentDirectoryPath),
            Bundle.main.bundleURL.deletingLastPathComponent(),
            Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent(),
            Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        ]

        for start in startingPoints {
            if let root = findRepositoryRoot(startingAt: start) {
                return root
            }
        }

        return URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    }

    private static func findRepositoryRoot(startingAt start: URL) -> URL? {
        var current = start.standardizedFileURL

        while true {
            let packageJSON = current.appendingPathComponent("package.json")
            if FileManager.default.fileExists(atPath: packageJSON.path) {
                return current
            }

            let parent = current.deletingLastPathComponent()
            if parent.path == current.path {
                return nil
            }

            current = parent
        }
    }

    private static func resolveShellEnvironment() -> (path: String, codexBin: String?) {
        let fallbackPath = ProcessInfo.processInfo.environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"
        let rawShellPath = runShellProbe(script: "printf %s \"$PATH\"")
        let shellPath = rawShellPath?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? rawShellPath!.trimmingCharacters(in: .whitespacesAndNewlines)
            : fallbackPath
        let rawCodexBin = runShellProbe(script: "command -v codex 2>/dev/null || true")
        let codexBin = rawCodexBin?.trimmingCharacters(in: .whitespacesAndNewlines)

        return (
            path: shellPath.trimmingCharacters(in: .whitespacesAndNewlines),
            codexBin: codexBin?.isEmpty == false ? codexBin : nil
        )
    }

    private static func runShellProbe(script: String) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-lic", script]

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return nil
        }

        guard process.terminationStatus == 0 else {
            return nil
        }

        let data = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
        guard let output = String(data: data, encoding: .utf8) else {
            return nil
        }

        return output
    }
}

enum ControllerError: LocalizedError {
    case serviceUnavailable
    case missingPairingToken
    case invalidURL
    case invalidResponse
    case remote(String)

    var errorDescription: String? {
        switch self {
        case .serviceUnavailable:
            return "本地服务未启动。"
        case .missingPairingToken:
            return "尚未读取到 pairing token。"
        case .invalidURL:
            return "构造请求地址失败。"
        case .invalidResponse:
            return "服务返回了无效响应。"
        case .remote(let message):
            return message
        }
    }
}
