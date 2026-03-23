import SwiftUI

@main
struct MacScreenAgentDesktopApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var controller = AgentController()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(controller)
                .background(WindowConfigurator())
                .frame(minWidth: 1100, minHeight: 720)
                .task {
                    appDelegate.onTerminate = {
                        controller.stopAgentForTermination()
                    }
                    controller.startAgentIfNeeded()
                }
        }
        .windowResizability(.automatic)
    }
}
