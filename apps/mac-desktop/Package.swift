// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "MacScreenAgentDesktop",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(
            name: "MacScreenAgentDesktopApp",
            targets: ["MacScreenAgentDesktopApp"]
        )
    ],
    targets: [
        .executableTarget(
            name: "MacScreenAgentDesktopApp",
            path: "Sources/MacScreenAgentDesktopApp"
        )
    ]
)
