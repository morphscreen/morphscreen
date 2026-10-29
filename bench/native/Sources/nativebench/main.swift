import AppKit
import MorphScreen
import OpenUISwiftUI
import SwiftUI

// Streams `text` in 32-character chunks into a hosted view, forcing SwiftUI to
// update and lay out after every chunk, and returns the main-thread time.
@MainActor
func stream(_ chunks: [String], width: CGFloat, makeView: (Int) -> AnyView, push: (Int) -> Void, finish: () -> Void) -> (ms: Double, host: NSHostingController<AnyView>) {
    let host = NSHostingController(rootView: makeView(0))
    // The window keeps the size we give it; the answer doesn't resize it.
    host.sizingOptions = []
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: 1200), styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentViewController = host
    window.setContentSize(NSSize(width: width, height: 1200))
    windows.append(window)
    var ms = 0.0
    for k in chunks.indices {
        let t0 = CFAbsoluteTimeGetCurrent()
        push(k)
        host.rootView = makeView(k + 1)
        host.view.layoutSubtreeIfNeeded()
        ms += (CFAbsoluteTimeGetCurrent() - t0) * 1000
    }
    let t0 = CFAbsoluteTimeGetCurrent()
    finish()
    host.rootView = makeView(chunks.count + 1)
    host.view.layoutSubtreeIfNeeded()
    ms += (CFAbsoluteTimeGetCurrent() - t0) * 1000
    return (ms, host)
}

@MainActor var windows: [NSWindow] = []

/// The whole answer as a PNG, at the window's width and the answer's height.
@MainActor
func snapshot(_ host: NSHostingController<AnyView>, to path: String) {
    // Let async work land and animations finish first (OpenUI fades views in
    // over 0.6 s; our maps place geocoded pins), then measure the live tree.
    RunLoop.main.run(until: Date().addingTimeInterval(1.2))
    let width = host.view.frame.width
    let fit = host.sizeThatFits(in: CGSize(width: width, height: .infinity))
    let height = max(200, min(fit.height.isFinite ? fit.height : 12000, 12000))
    host.view.window?.setContentSize(NSSize(width: width, height: height))
    host.view.layoutSubtreeIfNeeded()
    RunLoop.main.run(until: Date().addingTimeInterval(0.2))
    let view = host.view
    guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
    view.cacheDisplay(in: view.bounds, to: rep)
    try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
}

/// The process's memory footprint now and its peak so far, in MB (what
/// Activity Monitor and jetsam count).
func footprint() -> (now: Double, peak: Double) {
    var info = rusage_info_v4()
    let ok = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: rusage_info_t?.self, capacity: 1) { proc_pid_rusage(getpid(), RUSAGE_INFO_V4, $0) }
    }
    guard ok == 0 else { return (0, 0) }
    return (Double(info.ri_phys_footprint) / 1_048_576, Double(info.ri_lifetime_max_phys_footprint) / 1_048_576)
}

func chunks(_ s: String, _ n: Int) -> [String] {
    var out: [String] = []
    var i = s.startIndex
    while i < s.endIndex {
        let j = s.index(i, offsetBy: n, limitedBy: s.endIndex) ?? s.endIndex
        out.append(String(s[i..<j]))
        i = j
    }
    return out
}

// One brief, one side, in this process: the driver (run.mjs) starts one
// process per brief and side, so a renderer that crashes costs only its own
// row. The answer streams twice; the first pass is cold (SwiftUI and the
// renderer warming up), the second is the one reported as warm.
@MainActor
func main() throws {
    _ = NSApplication.shared
    // Light, like the web and Compose runs, whatever the Mac is set to;
    // NATIVE_THEME=dark or mono for the theme review.
    let theme = ProcessInfo.processInfo.environment["NATIVE_THEME"]
    NSApp.appearance = NSAppearance(named: theme == "dark" ? .darkAqua : .aqua)
    Theme.monochrome = theme == "mono"
    let args = CommandLine.arguments
    guard args.count == 5 else {
        print("usage: nativebench <rawdir> <outdir> <brief> <ours|openui>")
        exit(2)
    }
    let dir = URL(fileURLWithPath: args[1])
    let out = args[2], brief = args[3], side = args[4]
    try FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
    let file = dir.appendingPathComponent(side == "ours" ? "ours__\(brief).txt" : "openuichat__\(brief).txt")
    let text = try String(contentsOf: file, encoding: .utf8)
    let parts = chunks(text, 32)
    // NATIVE_WIDTH=390 renders at a phone's width (screenshots only; the timings use 760).
    let width = CGFloat(Double(ProcessInfo.processInfo.environment["NATIVE_WIDTH"] ?? "") ?? 760)
    // NATIVE_HOSTS=127.0.0.1,cdn.example.com: photos load from those hosts (and nothing else does).
    let media = MediaPolicy(hosts: (ProcessInfo.processInfo.environment["NATIVE_HOSTS"] ?? "").split(separator: ",").map(String.init))

    func once() throws -> (ms: Double, host: NSHostingController<AnyView>) {
        if side == "ours" {
            // Every pack is on: briefs that use none of them are unaffected.
            let answer = try Answer(packs: ["data", "commerce", "scheduling", "media", "docs", "inputs", "device", "interactive"])
            return stream(parts, width: width, makeView: { _ in AnyView(AnswerView(answer, media: media).padding(24)) }, push: { answer.push(parts[$0]) }, finish: { answer.finish() })
        }
        var prefix = ""
        var done = false
        return stream(parts, width: width, makeView: { _ in
            AnyView(OpenUIRenderer(response: prefix, isStreaming: !done, library: OpenUIChatLibrary.library, publishObservability: false).padding(24))
        }, push: { prefix += parts[$0] }, finish: { done = true })
    }

    // NATIVE_SHOT_ONLY=1: one pass and the screenshot (the layout check needs no timings).
    if ProcessInfo.processInfo.environment["NATIVE_SHOT_ONLY"] != nil {
        let host = try once().host
        // NATIVE_WAIT=4: seconds for photos to arrive before the screenshot.
        if let wait = Double(ProcessInfo.processInfo.environment["NATIVE_WAIT"] ?? "") {
            RunLoop.main.run(until: Date().addingTimeInterval(wait))
        }
        snapshot(host, to: "\(out)/\(brief)-\(side).png")
        print("SHOT \(brief) \(side)")
        return
    }
    // Memory is read before the screenshot, so it's the renderer's, not the bitmap's.
    let base = footprint().now
    let cold = try once()
    let warm = try once()
    let mem = footprint()
    snapshot(warm.host, to: "\(out)/\(brief)-\(side).png")
    print(String(format: "RESULT {\"brief\":\"%@\",\"side\":\"%@\",\"chunks\":%d,\"cold\":%.2f,\"warm\":%.2f,\"baseMB\":%.1f,\"peakMB\":%.1f,\"endMB\":%.1f}", brief, side, parts.count, cold.ms, warm.ms, base, mem.peak, mem.now))
}

MainActor.assumeIsolated { try! main() }
