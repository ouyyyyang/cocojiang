import AppKit
import SwiftUI

private enum DesktopTab: Hashable {
    case dashboard
    case settings
    case testing
    case history
}

struct ContentView: View {
    @EnvironmentObject private var controller: AgentController
    @State private var selectedTab: DesktopTab = .dashboard

    var body: some View {
        NavigationSplitView {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    titleBlock
                    statusCard
                    quickActionsCard
                    logsCard
                }
                .padding(22)
            }
            .frame(minWidth: 320)
            .navigationSplitViewColumnWidth(min: 320, ideal: 360)
        } detail: {
            VStack(spacing: 0) {
                headerBar

                if let lastError = controller.lastError {
                    errorBanner(lastError)
                }

                TabView(selection: $selectedTab) {
                    dashboardTab
                        .tabItem {
                            Label("控制台", systemImage: "rectangle.grid.2x2")
                        }
                        .tag(DesktopTab.dashboard)

                    settingsTab
                        .tabItem {
                            Label("配置", systemImage: "slider.horizontal.3")
                        }
                        .tag(DesktopTab.settings)

                    testingTab
                        .tabItem {
                            Label("测试", systemImage: "wrench.and.screwdriver")
                        }
                        .tag(DesktopTab.testing)

                    historyTab
                        .tabItem {
                            Label("历史", systemImage: "clock.arrow.circlepath")
                        }
                        .tag(DesktopTab.history)
                }
                .padding(20)
            }
            .background(Color(nsColor: .windowBackgroundColor))
        }
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Screen Pilot")
                .font(.system(size: 30, weight: .semibold, design: .rounded))
            Text("原生 Mac 控制台。App 启动后拉起本地 agent，在这里直接做配置、抓屏测试、模型测试和历史查看。")
                .foregroundStyle(.secondary)
        }
    }

    private var headerBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Mac Agent Desktop")
                    .font(.title2.weight(.semibold))
                Text(controller.statusText)
                    .foregroundStyle(controller.isRunning ? .green : .secondary)
            }

            Spacer()

            Button("刷新") {
                controller.refreshAllState()
            }
            .buttonStyle(.bordered)
            .disabled(!controller.isRunning || controller.isRefreshingState)

            Button(controller.isRunning ? "停止服务" : "启动服务") {
                if controller.isRunning {
                    controller.stopAgent()
                } else {
                    controller.startAgent()
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(20)
        .background(.bar)
    }

    private var statusCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                LabeledContent("运行状态", value: controller.statusText)
                LabeledContent("服务地址", value: controller.serviceURLText)
                LabeledContent("Pairing Token", value: controller.pairingToken)
                LabeledContent("当前模型", value: controller.activeModelSummary)
                LabeledContent("认证状态", value: controller.authStatusText)

                HStack {
                    Button("复制 Token") {
                        controller.copyPairingToken()
                    }
                    .buttonStyle(.bordered)

                    Button("复制地址") {
                        controller.copyServiceURL()
                    }
                    .buttonStyle(.bordered)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } label: {
            Label("状态", systemImage: "bolt.circle")
        }
    }

    private var quickActionsCard: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                Button("浏览器打开网页控制台") {
                    controller.openInBrowser()
                }
                .buttonStyle(.bordered)

                Button("打开日志目录") {
                    controller.openLogsFolder()
                }
                .buttonStyle(.bordered)

                Button("打开仓库目录") {
                    controller.openRepositoryRoot()
                }
                .buttonStyle(.bordered)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } label: {
            Label("快速操作", systemImage: "paperplane")
        }
    }

    private var logsCard: some View {
        GroupBox {
            ScrollView {
                Text(controller.logText)
                    .font(.system(.caption, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                    .padding(.vertical, 6)
            }
            .frame(minHeight: 260)
        } label: {
            Label("运行日志", systemImage: "doc.text")
        }
    }

    private var dashboardTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GroupBox {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("发起一次分析")
                            .font(.headline)

                        TextEditor(text: $controller.analysisQuestion)
                            .font(.body)
                            .frame(minHeight: 160)
                            .padding(10)
                            .background(
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(Color(nsColor: .textBackgroundColor))
                            )

                        HStack {
                            Button(controller.isSubmittingAnalysis ? "提交中..." : "抓取并分析") {
                                controller.submitAnalysis()
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(!controller.isRunning || controller.isSubmittingAnalysis)

                            Text("结果会进入“历史”页，适合持续做真实场景分析。")
                                .foregroundStyle(.secondary)
                        }
                    }
                } label: {
                    Label("分析入口", systemImage: "sparkles")
                }

                GroupBox {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("当前工作流")
                            .font(.headline)
                        Text("1. App 启动时拉起 agent。2. 在“配置”里确认模型和认证。3. 在“测试”里验证抓屏和模型。4. 在这里提交真实分析任务。")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                } label: {
                    Label("说明", systemImage: "list.bullet.rectangle")
                }
            }
        }
    }

    private var settingsTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GroupBox {
                    VStack(alignment: .leading, spacing: 14) {
                        Text("模型配置")
                            .font(.headline)

                        Picker("模型提供方", selection: $controller.modelProvider) {
                            ForEach(DesktopModelProvider.allCases) { provider in
                                Text(provider.displayName).tag(provider)
                            }
                        }
                        .pickerStyle(.segmented)

                        if controller.modelProvider == .codex {
                            TextField("Codex 模型", text: $controller.codexModel)
                                .textFieldStyle(.roundedBorder)
                        } else {
                            TextField("本地视觉模型", text: $controller.localVisionModel)
                                .textFieldStyle(.roundedBorder)

                            Text(controller.modelProvider == .lmstudio
                                 ? "LM Studio 模式要求你先把模型下载并加载到本地 server，模型标识建议直接统一成 `qwen3-vl:8b`。"
                                 : "Ollama 模式会直接按模型名请求本地服务。Mac 24GB 统一内存优先从 `qwen3-vl:8b` 开始。")
                                .foregroundStyle(.secondary)
                        }

                        HStack {
                            Button(controller.isSavingSettings ? "保存中..." : "保存配置") {
                                controller.saveSettings()
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(!controller.isRunning || controller.isSavingSettings)

                            Text(controller.modelProvider == .codex
                                 ? "这里直接决定 `codex exec` 使用的模型。"
                                 : controller.modelProvider == .lmstudio
                                   ? "这里决定 LM Studio 本地 server 请求使用的模型标识。"
                                   : "这里决定 Ollama 请求使用的本地视觉模型名。")
                                .foregroundStyle(.secondary)
                        }
                    }
                } label: {
                    Label("配置", systemImage: "slider.horizontal.3")
                }

                if controller.modelProvider == .codex {
                    GroupBox {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("Codex 认证")
                                .font(.headline)

                            LabeledContent("认证状态", value: controller.authStatusText)
                            Text(controller.authDetailText)
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)

                            HStack {
                                Button(controller.isStartingAuth ? "启动中..." : "开始 OpenAI 认证") {
                                    controller.startCodexAuthentication()
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled(!controller.isRunning || controller.isStartingAuth)

                                Button(controller.isRefreshingAuth ? "刷新中..." : "刷新状态") {
                                    controller.refreshAllState()
                                }
                                .buttonStyle(.bordered)
                                .disabled(!controller.isRunning || controller.isRefreshingAuth)
                            }
                        }
                    } label: {
                        Label("认证", systemImage: "person.crop.circle.badge.checkmark")
                    }
                }

                runtimeManagementSection
            }
        }
    }

    private var testingTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                GroupBox {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Text("屏幕抓取测试")
                                .font(.headline)
                            Spacer()
                            Button(controller.isRunningCaptureTest ? "抓取中..." : "测试抓屏") {
                                controller.runCaptureTest()
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(!controller.isRunning || controller.isRunningCaptureTest)
                        }

                        Text("只验证 `screencapture` 和 Screen Recording 权限，不调用模型。")
                            .foregroundStyle(.secondary)

                        LabeledContent("最近抓取时间", value: controller.captureTestTimestamp)

                        if controller.isRunningCaptureTest {
                            progressHint("正在抓取当前屏幕，请稍等...")
                        }

                        if let image = controller.captureTestImage {
                            nativeImageView(image)
                        } else {
                            emptyHint("还没有抓取结果。")
                        }
                    }
                } label: {
                    Label("抓屏测试", systemImage: "display")
                }

                GroupBox {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Text("模型输出测试")
                                .font(.headline)
                            Spacer()
                            Button(controller.isRunningModelTest ? "测试中..." : "运行模型测试") {
                                controller.runModelTest()
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(!controller.isRunning || controller.isRunningModelTest)
                        }

                        TextEditor(text: $controller.modelTestQuestion)
                            .font(.body)
                            .frame(minHeight: 110)
                            .padding(10)
                            .background(
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(Color(nsColor: .textBackgroundColor))
                            )

                        LabeledContent("最近测试时间", value: controller.modelTestTimestamp)
                        LabeledContent("当前测试链路", value: controller.activeModelSummary)

                        if controller.isRunningModelTest {
                            progressHint("模型加载中，正在抓取屏幕并提交给 \(controller.modelProvider.displayName) 分析...")
                        }

                        if let image = controller.modelTestImage {
                            nativeImageView(image)
                        } else {
                            emptyHint("还没有模型测试结果。")
                        }

                        if controller.modelTestSummary != "-" || controller.modelTestAnswer != "-" {
                            VStack(alignment: .leading, spacing: 10) {
                                infoBlock("摘要", value: controller.modelTestSummary)
                                infoBlock("回答", value: controller.modelTestAnswer)
                                bulletBlock("关键点", items: controller.modelTestKeyPoints)
                                bulletBlock("下一步建议", items: controller.modelTestNextActions)
                                bulletBlock("不确定点", items: controller.modelTestUncertainties)

                                VStack(alignment: .leading, spacing: 6) {
                                    Text("原始 JSON")
                                        .font(.headline)
                                    ScrollView {
                                        Text(controller.modelTestRawOutput.isEmpty ? "无" : controller.modelTestRawOutput)
                                            .font(.system(.caption, design: .monospaced))
                                            .textSelection(.enabled)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .padding(10)
                                    }
                                    .frame(minHeight: 180)
                                    .background(
                                        RoundedRectangle(cornerRadius: 14)
                                            .fill(Color(nsColor: .textBackgroundColor))
                                    )
                                }
                            }
                        }
                    }
                } label: {
                    Label("模型测试", systemImage: "cpu")
                }
            }
        }
    }

    private var historyTab: some View {
        HSplitView {
            GroupBox {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("分析历史")
                            .font(.headline)
                        Spacer()
                        Button("刷新") {
                            controller.refreshAllState()
                        }
                        .buttonStyle(.bordered)
                        .disabled(!controller.isRunning || controller.isLoadingHistory)
                    }

                    if controller.sessions.isEmpty {
                        emptyHint("还没有历史分析结果。")
                    } else {
                        List(controller.sessions, selection: $controller.selectedSessionID) { session in
                            Button {
                                controller.selectSession(session.id)
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(session.question.isEmpty ? "未填写问题" : session.question)
                                        .font(.body.weight(.medium))
                                        .lineLimit(2)
                                    Text("\(session.status) · \(session.modelProvider.displayName) · \(session.codexModel)")
                                        .foregroundStyle(.secondary)
                                        .font(.caption)
                                    Text(session.summary ?? session.error ?? "等待结果")
                                        .foregroundStyle(.secondary)
                                        .font(.caption)
                                        .lineLimit(2)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                        }
                        .listStyle(.inset)
                    }
                }
            } label: {
                Label("历史", systemImage: "clock.arrow.circlepath")
            }
            .frame(minWidth: 320)

            GroupBox {
                if let session = controller.selectedSession {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(session.question.isEmpty ? "未填写问题" : session.question)
                                        .font(.title3.weight(.semibold))
                                    Text("\(session.status) · \(session.modelProvider.displayName) · \(session.codexModel)")
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(session.updatedAt)
                                    .foregroundStyle(.secondary)
                                    .font(.caption)
                            }

                            if let image = controller.selectedSessionImage {
                                nativeImageView(image)
                            }

                            if let result = session.result {
                                infoBlock("摘要", value: result.summary)
                                infoBlock("回答", value: result.answer)
                                bulletBlock("关键点", items: result.keyPoints)
                                bulletBlock("OCR", items: result.ocrText)
                                bulletBlock("下一步建议", items: result.nextActions)
                                bulletBlock("不确定点", items: result.uncertainties)
                            }

                            if let error = session.error, !error.isEmpty {
                                infoBlock("错误", value: error)
                            }
                        }
                    }
                } else {
                    emptyHint("选择一条历史记录后，这里显示详情。")
                }
            } label: {
                Label("详情", systemImage: "doc.text.magnifyingglass")
            }
        }
    }

    private var runtimeManagementSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("本地运行时与模型管理")
                            .font(.headline)
                        Text("这里不接管安装包和任意路径，只负责检测状态、启动 server、下载当前配置模型、加载/卸载，以及 Ollama 的删除。")
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Button(controller.isRefreshingLocalRuntimes ? "刷新中..." : "刷新运行时") {
                        controller.refreshAllState()
                    }
                    .buttonStyle(.bordered)
                    .disabled(!controller.isRunning || controller.isRefreshingLocalRuntimes)
                }

                runtimeCard(.lmstudio)
                runtimeCard(.ollama)
            }
        } label: {
            Label("运行时", systemImage: "shippingbox")
        }
    }

    @ViewBuilder
    private func runtimeCard(_ runtime: DesktopLocalRuntimeSlug) -> some View {
        let status = controller.runtimeStatus(for: runtime)
        let latestJob = controller.latestRuntimeJob(for: runtime)

        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(runtime.displayName)
                        .font(.headline)
                    Text(runtimeCopy(runtime: runtime, status: status))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(runtimeStatusLabel(status))
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(runtimeStatusColor(status).opacity(0.12))
                    .foregroundStyle(runtimeStatusColor(status))
                    .clipShape(Capsule())
            }

            HStack(alignment: .top, spacing: 12) {
                infoBlock("CLI", value: status?.executablePath ?? (status?.installed == true ? "已安装但未检测到 CLI" : "未检测到"))
                infoBlock("Server", value: status.map { "\($0.serverHost) · \($0.serverRunning ? "在线" : "离线")" } ?? "-")
                infoBlock("模型目录", value: status?.modelsDirHint ?? "-")
            }

            HStack {
                Button("官方下载") {
                    controller.openRuntimeDownloadPage(runtime)
                }
                .buttonStyle(.bordered)

                Button(controller.isRuntimeActionBusy(runtime, action: .startServer) ? "启动中..." : "启动 Server") {
                    controller.runRuntimeAction(runtime, action: .startServer)
                }
                .buttonStyle(.bordered)
                .disabled(!controller.isRunning || controller.isRuntimeActionBusy(runtime, action: .startServer))

                Button(controller.isRuntimeActionBusy(runtime, action: .downloadModel) ? "下载中..." : "下载当前模型") {
                    controller.runRuntimeAction(runtime, action: .downloadModel)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!controller.isRunning || controller.isRuntimeActionBusy(runtime, action: .downloadModel))

                if runtime == .lmstudio {
                    Button(controller.isRuntimeActionBusy(runtime, action: .loadModel) ? "加载中..." : "加载当前模型") {
                        controller.runRuntimeAction(runtime, action: .loadModel)
                    }
                    .buttonStyle(.bordered)
                    .disabled(!controller.isRunning || controller.isRuntimeActionBusy(runtime, action: .loadModel))
                }

                Button(controller.isRuntimeActionBusy(runtime, action: .unloadModel) ? "卸载中..." : "卸载当前模型") {
                    controller.runRuntimeAction(runtime, action: .unloadModel)
                }
                .buttonStyle(.bordered)
                .disabled(!controller.isRunning || controller.isRuntimeActionBusy(runtime, action: .unloadModel))

                if runtime == .ollama {
                    Button(controller.isRuntimeActionBusy(runtime, action: .removeModel) ? "删除中..." : "删除当前模型") {
                        controller.runRuntimeAction(runtime, action: .removeModel)
                    }
                    .buttonStyle(.bordered)
                    .disabled(!controller.isRunning || controller.isRuntimeActionBusy(runtime, action: .removeModel))
                }
            }

            HStack(alignment: .top, spacing: 12) {
                bulletBlock("已下载模型", items: status?.downloadedModels.map { model in
                    if let identifier = model.identifier, !identifier.isEmpty {
                        return "\(model.label) (\(identifier))"
                    }
                    return model.label
                } ?? [])

                bulletBlock("已加载模型", items: status?.loadedModels.map { model in
                    if let identifier = model.identifier, !identifier.isEmpty {
                        return "\(model.label) (\(identifier))"
                    }
                    return model.label
                } ?? [])
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("最近任务")
                    .font(.headline)
                Text(latestJob.map { "\($0.summary) · \($0.updatedAt)" } ?? "还没有执行过任务。")
                    .foregroundStyle(.secondary)
                ScrollView {
                    Text((latestJob?.logs.isEmpty == false ? latestJob!.logs.joined(separator: "\n") : "-"))
                        .font(.system(.caption, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                }
                .frame(minHeight: 120)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color(nsColor: .textBackgroundColor))
                )
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            Text(message)
                .foregroundStyle(.primary)
            Spacer()
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.orange.opacity(0.12))
        )
        .padding(.horizontal, 20)
        .padding(.top, 12)
    }

    private func infoBlock(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
            Text(value.isEmpty ? "无" : value)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
    }

    private func bulletBlock(_ title: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.headline)
            ForEach(items.isEmpty ? ["无"] : items, id: \.self) { item in
                HStack(alignment: .top, spacing: 8) {
                    Text("•")
                    Text(item)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color(nsColor: .controlBackgroundColor))
        )
    }

    private func emptyHint(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.secondary.opacity(0.2), style: StrokeStyle(lineWidth: 1, dash: [5]))
            )
    }

    private func progressHint(_ text: String) -> some View {
        HStack(spacing: 12) {
            ProgressView()
                .controlSize(.regular)
            Text(text)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.accentColor.opacity(0.08))
        )
    }

    private func nativeImageView(_ image: NSImage) -> some View {
        Image(nsImage: image)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.secondary.opacity(0.14), lineWidth: 1)
            )
    }

    private func runtimeStatusLabel(_ status: DesktopLocalRuntimeStatus?) -> String {
        guard let status else { return "未检查" }
        if !status.installed { return "未安装" }
        return status.serverRunning ? "在线" : "已安装"
    }

    private func runtimeStatusColor(_ status: DesktopLocalRuntimeStatus?) -> Color {
        guard let status else { return .secondary }
        if !status.installed { return .orange }
        return status.serverRunning ? .green : .secondary
    }

    private func runtimeCopy(runtime: DesktopLocalRuntimeSlug, status: DesktopLocalRuntimeStatus?) -> String {
        guard let status else {
            return "等待刷新运行时状态。"
        }

        if !status.installed {
            return "\(runtime.displayName) 尚未检测到。先走官方下载，再回来启动 server、下载并加载当前配置模型 \(controller.localVisionModel)。"
        }

        let prefix = status.serverRunning ? "已检测到安装，server 当前在线。" : "已检测到安装，但 server 当前离线。"
        let note = status.notes.first ?? ""
        return "\(prefix) 当前配置模型是 \(controller.localVisionModel)。\(note)"
    }
}
