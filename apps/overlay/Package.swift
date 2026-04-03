// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "StealthOverlay",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "StealthOverlay",
            path: "Sources/StealthOverlay"
        )
    ]
)
