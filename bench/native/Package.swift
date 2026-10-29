// swift-tools-version: 6.0
// Native benchmark: the same briefs streamed into our SwiftUI view and into
// OpenUI's Swift port (OPENUI_SWIFT, default ~/openui/packages/swift-lang),
// each in an offscreen macOS window. Main-thread time per answer, and
// screenshots of both.
//   swift run -c release nativebench ../raw/nemotron-v03 out-dir
import Foundation
import PackageDescription

let openui = ProcessInfo.processInfo.environment["OPENUI_SWIFT"] ?? (NSHomeDirectory() + "/openui/packages/swift-lang")

let package = Package(
    name: "nativebench",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(path: "../../sdk/swift"),
        .package(path: openui),
    ],
    targets: [
        // Layout checker for SwiftUI screenshots (roadmap Q2), ours and OpenUI's alike.
        .executableTarget(name: "nativecheck", swiftSettings: [.swiftLanguageMode(.v5)]),
        // Every component sample drawn by our SwiftUI view, for bench/look (roadmap M1).
        .executableTarget(
            name: "nativelook",
            dependencies: [.product(name: "MorphScreen", package: "swift")],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .executableTarget(
            name: "nativebench",
            dependencies: [.product(name: "MorphScreen", package: "swift"), .product(name: "OpenUISwiftUI", package: "swift-lang")],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
