import AppKit
import MorphScreen
import SwiftUI

// Every component sample (test/fixtures/components.json) drawn by the SwiftUI
// SDK, one PNG each, for bench/look/run.mjs to put beside the web and Compose
// (roadmap M1: the same look on every platform).
//   swift run -c release nativelook <components.json> <outdir> <width> [light|dark|mono] [id,id...]

@MainActor var windows: [NSWindow] = []

@MainActor
func shot(_ view: AnyView, width: CGFloat, to path: String) {
    let host = NSHostingController(rootView: view)
    host.sizingOptions = []
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: 1200), styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentViewController = host
    window.setContentSize(NSSize(width: width, height: 1200))
    windows.append(window)
    host.view.layoutSubtreeIfNeeded()
    RunLoop.main.run(until: Date().addingTimeInterval(0.6))
    let fit = host.sizeThatFits(in: CGSize(width: width, height: .infinity))
    let height = max(80, min(fit.height.isFinite ? fit.height : 6000, 6000))
    window.setContentSize(NSSize(width: width, height: height))
    host.view.layoutSubtreeIfNeeded()
    RunLoop.main.run(until: Date().addingTimeInterval(0.15))
    guard let rep = host.view.bitmapImageRepForCachingDisplay(in: host.view.bounds) else { return }
    host.view.cacheDisplay(in: host.view.bounds, to: rep)
    try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
    window.orderOut(nil)
}

@MainActor
func main() throws {
    _ = NSApplication.shared
    let args = CommandLine.arguments
    guard args.count >= 4 else {
        print("usage: nativelook <components.json> <outdir> <width> [light|dark|mono] [id,id...]")
        exit(2)
    }
    let theme = args.count > 4 ? args[4] : "light"
    NSApp.appearance = NSAppearance(named: theme == "dark" ? .darkAqua : .aqua)
    Theme.monochrome = theme == "mono"
    let only = args.count > 5 ? Set(args[5].split(separator: ",").map(String.init)) : nil
    let json = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[1]))) as! [String: Any]
    let packs = (json["packs"] as! [String]).filter { $0 != "core" }
    let samples = json["samples"] as! [[String: Any]]
    let out = args[2]
    try FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
    let width = CGFloat(Double(args[3]) ?? 760)
    for s in samples {
        let id = s["id"] as! String
        if let only, !only.contains(id) { continue }
        let answer = try Answer(packs: packs)
        answer.push(s["md"] as! String)
        answer.finish()
        // The web's answer has 24 px of room on each side (16 on a phone).
        let pad: CGFloat = width < 520 ? 16 : 24
        shot(AnyView(AnswerView(answer).padding(.horizontal, pad).padding(.vertical, 12).frame(width: width, alignment: .topLeading).background(Theme.page)), width: width, to: "\(out)/\(id).png")
        print("SHOT \(id)")
    }
}

MainActor.assumeIsolated { try! main() }
