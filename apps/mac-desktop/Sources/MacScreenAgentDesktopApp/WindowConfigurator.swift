import AppKit
import SwiftUI

struct WindowConfigurator: NSViewRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> NSView {
        let view = NSView(frame: .zero)
        DispatchQueue.main.async {
            configureWindowIfNeeded(from: view, coordinator: context.coordinator)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            configureWindowIfNeeded(from: nsView, coordinator: context.coordinator)
        }
    }

    private func configureWindowIfNeeded(from view: NSView, coordinator: Coordinator) {
        guard let window = view.window else {
            return
        }

        window.title = "Screen Pilot"
        window.titleVisibility = .visible
        window.titlebarAppearsTransparent = false
        window.isMovable = true
        window.isMovableByWindowBackground = false
        window.minSize = NSSize(width: 1100, height: 720)
        window.styleMask.insert([.titled, .closable, .miniaturizable, .resizable])

        if !coordinator.didApplyInitialFrame {
            window.setContentSize(NSSize(width: 1280, height: 820))
            window.center()
            coordinator.didApplyInitialFrame = true
        }
    }
}

extension WindowConfigurator {
    final class Coordinator {
        var didApplyInitialFrame = false
    }
}
