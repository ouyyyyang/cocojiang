import Cocoa
import WebKit

// ── Configuration ──────────────────────────────────────────────────

let defaultPort = 8788
let portRange = 8788...8792

func resolveAgentUrl() -> URL {
    // Check command line arg first: --url http://127.0.0.1:8788
    let args = CommandLine.arguments
    if let idx = args.firstIndex(of: "--url"), idx + 1 < args.count,
       let url = URL(string: args[idx + 1]) {
        return url
    }

    // Try to read port from runtime/agent/agent.port
    let scriptPath = URL(fileURLWithPath: #file)
    let candidates = [
        scriptPath.deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("runtime/agent/agent.port"),
        URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent("runtime/agent/agent.port")
    ]

    for candidate in candidates {
        if let portStr = try? String(contentsOf: candidate, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
           let port = Int(portStr) {
            return URL(string: "http://127.0.0.1:\(port)")!
        }
    }

    // Probe ports
    for port in portRange {
        let url = URL(string: "http://127.0.0.1:\(port)/api/config")!
        let sem = DispatchSemaphore(value: 0)
        var found = false
        let task = URLSession.shared.dataTask(with: url) { _, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                found = true
            }
            sem.signal()
        }
        task.resume()
        _ = sem.wait(timeout: .now() + 0.5)
        if found {
            return URL(string: "http://127.0.0.1:\(port)")!
        }
    }

    return URL(string: "http://127.0.0.1:\(defaultPort)")!
}

// ── Transparent WKWebView ──────────────────────────────────────────

class TransparentWebView: WKWebView {
    override var isOpaque: Bool { false }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.clear.setFill()
        dirtyRect.fill()
        super.draw(dirtyRect)
    }
}

// ── Stealth Panel ──────────────────────────────────────────────────

class StealthPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

// ── App Delegate ───────────────────────────────────────────────────

class OverlayAppDelegate: NSObject, NSApplicationDelegate {
    var panel: StealthPanel!
    var webView: TransparentWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 500, height: 700)

        // Position: right side of screen, full height
        let panelWidth: CGFloat = min(420, screenFrame.width * 0.35)
        let panelFrame = NSRect(
            x: screenFrame.maxX - panelWidth - 20,
            y: screenFrame.minY + 20,
            width: panelWidth,
            height: screenFrame.height - 40
        )

        panel = StealthPanel(
            contentRect: panelFrame,
            styleMask: [.nonactivatingPanel, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        // ── Stealth properties ──
        panel.sharingType = .none              // Invisible to screen capture / recording / sharing
        panel.level = .floating                // Always on top
        panel.isFloatingPanel = true           // Not in Cmd+Tab
        panel.hidesOnDeactivate = false        // Stays visible when app loses focus
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        // ── Transparent chrome ──
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.titlebarAppearsTransparent = true
        panel.titleVisibility = .hidden
        panel.hasShadow = false
        panel.isMovableByWindowBackground = true

        // ── Web content ──
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = TransparentWebView(frame: panel.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsMagnification = false

        panel.contentView = webView

        let agentUrl = resolveAgentUrl()
        let overlayUrl = agentUrl.appendingPathComponent("overlay")
        webView.load(URLRequest(url: overlayUrl))

        panel.orderFrontRegardless()

        NSLog("StealthOverlay: panel open, agent at \(agentUrl.absoluteString), sharingType=none")
    }
}

// ── Entry ──────────────────────────────────────────────────────────

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // No dock icon, no menu bar
let delegate = OverlayAppDelegate()
app.delegate = delegate
app.run()
