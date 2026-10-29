import SwiftUI
import XCTest
@testable import MorphScreen

/// A node and everything under it, as one comparable value.
private struct Snapshot: Equatable {
    let id: String, type: String, attrs: Attrs, spans: [Span], data: NodeData?, closed: Bool
    let children: [Snapshot]

    init(_ n: UINode) {
        id = n.id; type = n.type; attrs = n.attrs; spans = n.spans; data = n.data; closed = n.closed
        children = n.children.map(Snapshot.init)
    }
}

private let raw = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().appendingPathComponent("../../../../bench/raw/nemotron-v03").standardized

private func answers() throws -> [(String, String)] {
    try FileManager.default.contentsOfDirectory(atPath: raw.path)
        .filter { $0.hasPrefix("ours__") && $0.hasSuffix(".txt") }.sorted()
        .map { ($0, try String(contentsOf: raw.appendingPathComponent($0), encoding: .utf8)) }
}

private func pieces(_ s: String, sizes: inout SystemRandomNumberGenerator) -> [String] {
    var out: [String] = [], i = s.startIndex
    while i < s.endIndex {
        let j = s.index(i, offsetBy: Int.random(in: 1...48, using: &sizes), limitedBy: s.endIndex) ?? s.endIndex
        out.append(String(s[i..<j]))
        i = j
    }
    return out
}

final class StreamingTests: XCTestCase {
    /// However the text is split, the tree comes out the same.
    func testChunkingNeverChangesTheTree() throws {
        let all = try answers()
        XCTAssertGreaterThan(all.count, 10, "bench answers not found at \(raw.path)")
        var rng = SystemRandomNumberGenerator()
        for (name, text) in all {
            let whole = try Answer()
            whole.push(text)
            whole.finish()
            for _ in 0..<3 {
                let streamed = try Answer()
                for p in pieces(text, sizes: &rng) { streamed.push(p) }
                streamed.finish()
                XCTAssertEqual(Snapshot(streamed.root), Snapshot(whole.root), name)
                XCTAssertEqual(streamed.complete, whole.complete, name)
            }
        }
    }

    /// One character at a time is the worst case for a streaming parser.
    func testOneCharacterAtATime() throws {
        let text = "# Plan\n\n<Card title=\"Trip\">\n| Day | Cost |\n|---|---:|\n| Mon | $40 |\n\n<Stat label=\"Total\" value=\"$40\" />\n</Card>\n"
        let whole = try Answer()
        whole.push(text)
        whole.finish()
        let slow = try Answer()
        for c in text { slow.push(String(c)) }
        slow.finish()
        XCTAssertEqual(Snapshot(slow.root), Snapshot(whole.root))
        XCTAssertEqual(whole.root.children.map(\.type), ["h", "Card"])
    }

    /// Every node is closed once the answer is finished.
    func testFinishClosesEverything() throws {
        let a = try Answer()
        a.push("<Card title=\"Open\">\n<Columns>\n<Stat label=\"A\" value=\"1\" />\n")
        a.finish(truncated: true)
        func open(_ n: UINode) -> [String] { (n.closed ? [] : [n.id]) + n.children.flatMap(open) }
        XCTAssertEqual(a.root.children.flatMap(open), [])
        XCTAssertFalse(a.complete)
    }

    func testParentsAndCardDepth() throws {
        let a = try Answer()
        a.push("<Card title=\"Outer\">\n<Card title=\"Inner\">\nText.\n</Card>\n</Card>\n")
        a.finish()
        let inner = a.root.children[0].children[0]
        XCTAssertEqual(inner.type, "Card")
        XCTAssertTrue(inner.parent === a.root.children[0])
        XCTAssertEqual(inner.children[0].cardDepth, 2)
    }

    func testEveryPackUnlessCoreAlone() throws {
        let text = "<Camera label=\"Receipt\" />\n"
        let without = try Answer(packs: [])
        without.push(text)
        without.finish()
        let with = try Answer()
        with.push(text)
        with.finish()
        XCTAssertEqual(with.root.children.first?.type, "Camera")
        XCTAssertTrue(without.diagnostics.contains { $0.error }, "Camera with the core alone should be reported")
    }

    func testHTMLMatchesTheTree() throws {
        let a = try Answer()
        a.push("<Callout tone=\"warning\" title=\"Heads up\">\nRoads close at 6.\n</Callout>\n")
        a.finish()
        XCTAssertTrue(a.html.contains("Heads up"))
        XCTAssertTrue(a.html.contains("Roads close at 6."))
    }
}

final class FormTests: XCTestCase {
    func testFieldNames() {
        func node(_ attrs: Attrs) -> UINode { UINode(id: "1", type: "Input", attrs: attrs) }
        XCTAssertEqual(fieldName(node(["name": .string("email")])), "email")
        XCTAssertEqual(fieldName(node(["label": .string("Estimated Duration (hrs)")])), "estimated-duration-hrs")
        XCTAssertEqual(fieldName(node(["label": .string("  Café & Bar  ")])), "caf-bar")
        XCTAssertEqual(fieldName(node([:])), "field")
    }

    func testOptions() {
        XCTAssertEqual(options(" a | b ||c "), ["a", "b", "c"])
        XCTAssertEqual(options(nil), [])
    }

    func testPackCellsParseLikeContent() {
        XCTAssertEqual(parseInline("**Keynote** at `9:00`"), [.format("strong", [.text("Keynote")]), .text(" at "), .code("9:00")])
        XCTAssertEqual(parseInline("plain"), [.text("plain")])
    }

    func testChartSelectionPicksTheRightMark() {
        // Angles are running totals: 0...5400 is the first slice, then 2100 more, then 1500.
        XCTAssertEqual(pieSlice(at: 100, values: [5400, 2100, 1500]), 0)
        XCTAssertEqual(pieSlice(at: 6000, values: [5400, 2100, 1500]), 1)
        XCTAssertEqual(pieSlice(at: 8999, values: [5400, 2100, 1500]), 2)
        XCTAssertNil(pieSlice(at: 9500, values: [5400, 2100, 1500]))
        // Four spokes in a 200 x 200 radar: up, right, down, left.
        let size = CGSize(width: 200, height: 200)
        XCTAssertEqual(radarSpoke(at: CGPoint(x: 100, y: 20), in: size, count: 4), 0)
        XCTAssertEqual(radarSpoke(at: CGPoint(x: 180, y: 100), in: size, count: 4), 1)
        XCTAssertEqual(radarSpoke(at: CGPoint(x: 100, y: 180), in: size, count: 4), 2)
        XCTAssertEqual(radarSpoke(at: CGPoint(x: 20, y: 100), in: size, count: 4), 3)
    }

    func testColumnsSurviveAnInfiniteWidth() {
        // SwiftUI offers an infinite width when it asks for an ideal size; that used to trap.
        let layout = ColumnsLayout(perRow: 3, minWidth: 200)
        XCTAssertEqual(layout.rows(count: 6, width: .infinity), [0..<3, 3..<6])
        XCTAssertEqual(layout.rows(count: 6, width: 500), [0..<2, 2..<4, 4..<6])
        XCTAssertEqual(layout.rows(count: 6, width: 390).count, 6)
    }

    func testIDsAndDashesKeepTogether() {
        let j = "\u{2060}"
        XCTAssertEqual(keepIDs("Order WO-2025 shipped"), "Order WO-\(j)2025 shipped")
        XCTAssertEqual(keepIDs("a well-known fix"), "a well-known fix")
        XCTAssertEqual(keepIDs("lobbying\u{2014}Microsoft"), "lobbying\(j)\u{2014}Microsoft")
        XCTAssertEqual(keepIDs("Z\u{a0}\u{2014} ok"), "Z\u{a0}\u{2014} ok")
    }

    func testSubmitCarriesTypedValues() throws {
        let a = try Answer()
        a.push("<Form name=\"rsvp\">\n<Input label=\"Name\" />\n<Switch label=\"Vegetarian\" />\n<Button>Send</Button>\n</Form>\n")
        a.finish()
        let form = FormState(node: a.root.children[0])
        form.values["name"] = .text("Ada")
        form.values["vegetarian"] = .bool(true)
        guard case let .submit(node, name, button, fields) = form.submit(button: "Send") else { return XCTFail() }
        XCTAssertEqual(node, a.root.children[0].id)
        XCTAssertEqual(name, "rsvp")
        XCTAssertEqual(button, "Send")
        XCTAssertEqual(fields, ["name": .text("Ada"), "vegetarian": .bool(true)])
    }
}

final class LayoutTests: XCTestCase {
    func testChartNumbers() {
        XCTAssertEqual(chartNumber("$3.5k"), 3500)
        XCTAssertEqual(chartNumber("12%"), 12)
        XCTAssertEqual(chartNumber("-4"), -4)
        XCTAssertEqual(chartNumber("1,240"), 1240)
        XCTAssertEqual(chartNumber("2.1M"), 2_100_000)
        XCTAssertNil(chartNumber("n/a"))
        XCTAssertNil(chartNumber(""))
    }

    func testColumnsPlan() throws {
        func plan(_ body: String) throws -> (Int, Bool) {
            let a = try Answer()
            a.push("<Columns>\n" + body + "</Columns>\n")
            a.finish()
            let p = columnsPlan(a.root.children[0].children)
            return (p.perRow, p.rich)
        }
        let stat = "<Stat label=\"A\" value=\"1\" />\n"
        XCTAssert(try plan(String(repeating: stat, count: 3)) == (3, false))
        XCTAssert(try plan(String(repeating: stat, count: 5)) == (5, false))
        XCTAssert(try plan(String(repeating: stat, count: 6)) == (3, false))
        let card = "<Card title=\"T\">\nText.\n</Card>\n"
        XCTAssert(try plan(card + card) == (2, true))
        let wide = "<Card title=\"T\">\n| a | b | c | d |\n|---|---|---|---|\n| 1 | 2 | 3 | 4 |\n</Card>\n"
        XCTAssert(try plan(wide + card) == (1, true))
    }

    /// Every bench answer renders without a crash in an offscreen window.
    @MainActor
    func testEveryAnswerRenders() throws {
        for (name, text) in try answers().prefix(8) {
            let a = try Answer()
            a.push(text)
            a.finish()
            let host = NSHostingView(rootView: AnswerView(a).frame(width: 760))
            host.frame = NSRect(x: 0, y: 0, width: 760, height: 1200)
            host.layoutSubtreeIfNeeded()
            XCTAssertGreaterThan(host.fittingSize.height, 100, name)
        }
    }
}

final class CustomComponentTests: XCTestCase {
    private let shop = #"{"name":"shop","version":"1.0.0","components":{"ProductCard":{"about":"a product with its price","attrs":{"name":{"type":"string","required":true},"price":{"type":"string","required":true}},"content":"none"}}}"#

    /// The docs' example: a pack, the prompt, and the app's own view.
    @MainActor
    func testCustomComponentEndToEnd() throws {
        XCTAssertTrue(try systemPrompt(custom: [shop]).contains("<ProductCard name! price! />"))
        let a = try Answer(custom: [shop])
        a.push("<ProductCard name=\"Kettle\" price=\"$40\" />\n")
        a.finish()
        XCTAssertTrue(a.complete)
        var drawn: [String] = []
        let view = AnswerView(a, components: ["ProductCard": { p in
            drawn.append((p.attrs["name"]?.string ?? "") + " " + (p.attrs["price"]?.string ?? ""))
            return AnyView(Text("card"))
        }])
        let host = NSHostingView(rootView: view.frame(width: 400))
        host.frame = NSRect(x: 0, y: 0, width: 400, height: 200)
        host.layoutSubtreeIfNeeded()
        XCTAssertEqual(drawn.last, "Kettle $40")
    }

    func testUnknownCustomComponentIsReported() throws {
        let a = try Answer()
        a.push("<ProductCard name=\"Kettle\" price=\"$40\" />\n")
        a.finish()
        XCTAssertTrue(a.diagnostics.contains { $0.cls == "hallucinated-component" })
    }
}

final class MediaTests: XCTestCase {
    /// Only the app's hosts load; a model's URL never does.
    func testOnlyAllowedHostsLoad() {
        let p = MediaPolicy(hosts: ["cdn.shop.example", "images.pexels.com"])
        XCTAssertEqual(p.url("https://images.pexels.com/photos/1/a.jpeg?w=1280")?.absoluteString, "https://images.pexels.com/photos/1/a.jpeg?w=1280")
        XCTAssertEqual(p.url("https://cdn.shop.example/a.jpg")?.absoluteString, "https://cdn.shop.example/a.jpg")
        XCTAssertNil(p.url("https://images.unsplash.com/photo-1"))
        XCTAssertNil(p.url("https://cdn.shop.example.evil.example/x.jpg"))
        XCTAssertNil(p.url("http://cdn.shop.example/a.jpg"), "plain http only on this machine")
        XCTAssertNil(p.url("find"))
        XCTAssertNil(MediaPolicy().url("https://cdn.shop.example/a.jpg"), "nothing loads by default")
        let local = MediaPolicy(hosts: ["127.0.0.1:8790"])
        XCTAssertNotNil(local.url("http://127.0.0.1:8790/a.jpg"))
        XCTAssertNil(local.url("http://127.0.0.1:9999/track.png"), "another port is another host")
    }
}

final class InteractiveTests: XCTestCase {
    /// The core's postfix tokens run the same here; results read the same as the web's.
    func testFormulasAndResults() {
        let rpn = ["price", "qty", "*", "1", "discount", "100", "/", "-", "*"]
        let vars = ["price": 20.0, "qty": 5.0, "discount": 10.0]
        XCTAssertEqual(evaluate(rpn) { vars[$0] }, 90)
        XCTAssertNil(evaluate(["1", "x", "/"]) { _ in 0 }, "dividing by zero is no number")
        XCTAssertEqual(resultText(1234.5, unit: "$", decimals: 2), "$1,234.50")
        XCTAssertEqual(resultText(-12, unit: "%", decimals: nil), "\u{2212}12%")
        XCTAssertEqual(resultText(3.5, unit: "kg", decimals: 1), "3.5 kg")
    }
}
