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
                LabeledContent("当前模型", value: controller.codexModel)
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

                        TextField("Codex 模型", text: $controller.codexModel)
                            .textFieldStyle(.roundedBorder)

                        HStack {
                            Button(controller.isSavingSettings ? "保存中..." : "保存配置") {
                                controller.saveSettings()
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(!controller.isRunning || controller.isSavingSettings)

                            Text("这里直接决定 `codex exec` 使用的模型。")
                                .foregroundStyle(.secondary)
                        }
                    }
                } label: {
                    Label("配置", systemImage: "slider.horizontal.3")
                }

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

                        if controller.isRunningModelTest {
                            progressHint("模型加载中，正在抓取屏幕并提交给 Codex 分析...")
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
                                    Text("\(session.status) · \(session.codexModel)")
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
                                    Text("\(session.status) · \(session.codexModel)")
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
}
