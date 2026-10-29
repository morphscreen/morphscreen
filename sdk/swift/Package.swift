// swift-tools-version: 5.9
// The SwiftUI SDK: the Rust core (MorphScreenCore, built by build-core.sh) and the
// views that render its op stream natively on iOS and macOS.
import PackageDescription

let package = Package(
    name: "MorphScreen",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "MorphScreen", targets: ["MorphScreen"]),
    ],
    targets: [
        .binaryTarget(name: "MorphScreenCore", path: "Frameworks.nosync/MorphScreenCore.xcframework"),
        // Fonts/: IBM Plex Sans (variable) and Plex Mono, SIL Open Font License 1.1.
        .target(name: "MorphScreen", dependencies: ["MorphScreenCore"], resources: [.copy("Fonts")]),
        .testTarget(name: "MorphScreenTests", dependencies: ["MorphScreen"]),
    ]
)
