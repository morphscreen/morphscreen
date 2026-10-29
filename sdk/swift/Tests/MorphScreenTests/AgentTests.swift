import SwiftUI
import XCTest
@testable import MorphScreen

private let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../..").standardized

/// A scripted AG-UI agent behind URLSession: each request gets the events
/// `reply` returns for it, framed as Server-Sent Events (or `recorded`'s
/// bytes as they are).
final class ScriptedAgent: URLProtocol {
    nonisolated(unsafe) static var reply: (_ n: Int, _ input: JSONValue) -> [JSONValue] = { _, _ in [] }
    nonisolated(unsafe) static var recorded: [Data] = []
    nonisolated(unsafe) static var requests: [JSONValue] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        var body = request.httpBody ?? Data()
        if let s = request.httpBodyStream {
            s.open()
            var buf = [UInt8](repeating: 0, count: 4096)
            while s.hasBytesAvailable {
                let n = s.read(&buf, maxLength: buf.count)
                if n <= 0 { break }
                body.append(buf, count: n)
            }
            s.close()
        }
        let input = JSONValue(json: String(decoding: body, as: UTF8.self))
        Self.requests.append(input)
        let events = Self.reply(Self.requests.count, input)
        let res = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/event-stream"])!
        client?.urlProtocol(self, didReceive: res, cacheStoragePolicy: .notAllowed)
        // Read past what the binding says to ignore, then the events a few bytes at a time.
        var sse = ": keep-alive\n\nevent: ignored\nid: 1\n\n"
        for e in events { sse += "data: \(e.json)\n\n" }
        let n = Self.requests.count
        let bytes = Self.recorded.isEmpty ? Data(sse.utf8) : Self.recorded[min(n, Self.recorded.count) - 1]
        var i = 0
        while i < bytes.count {
            let j = min(i + 37, bytes.count)
            client?.urlProtocol(self, didLoad: bytes.subdata(in: i..<j))
            i = j
        }
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

private func ev(_ type: String, _ kv: [String: JSONValue] = [:]) -> JSONValue {
    var o = kv
    o["type"] = .string(type)
    return .object(o)
}

private func find(_ n: UINode, _ type: String) -> UINode? {
    if n.type == type { return n }
    for c in n.children { if let f = find(c, type) { return f } }
    return nil
}

@MainActor
final class AgentTests: XCTestCase {
    func testTheCoreReadsAnSSEStream() {
        let a = AgentCore()
        let sse = """
        data: {"type":"RUN_STARTED","threadId":"t","runId":"r"}

        data: {"type":"TEXT_MESSAGE_START","messageId":"m","role":"assistant"}

        data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"m","delta":"Hi \u{1F44B}"}

        data: {"type":"TEXT_MESSAGE_END","messageId":"m"}

        data: {"type":"RUN_FINISHED","threadId":"t","runId":"r"}


        """
        var updates: [AgentUpdate] = []
        // Split mid-character: the emoji's bytes arrive in two pieces.
        let bytes = Data(sse.utf8)
        let cut = bytes.firstIndex(of: 0xF0)! + 2
        updates += a.feed(bytes.subdata(in: 0..<cut))
        updates += a.feed(bytes.subdata(in: cut..<bytes.count))
        updates += a.close()
        XCTAssertEqual(updates, [.run(threadId: "t", runId: "r"), .message(id: "m", role: "assistant", index: 0), .text(id: "m", delta: "Hi \u{1F44B}"), .end(id: "m", truncated: false), .finished(outcome: "success", pending: [])])
    }

    func testActionsInWords() {
        XCTAssertEqual(actionMessage(.vote(node: "1", name: "next", choice: "Respiration")), "I voted for \"Respiration\".")
        XCTAssertNil(actionMessage(.state(node: "1", name: "x", value: ["a"])))
        XCTAssertEqual(actionMessage(.submit(node: "1", form: "rsvp", button: "Send", fields: ["guest": .bool(true)])), "I filled in the form \"rsvp\" and pressed \"Send\":\n- guest: yes")
    }

    /// The same script as the web's test-agent.mjs: a lesson streams in as
    /// chunks; ticks are state; a finished quiz is the next user message with
    /// the state; the agent's patch ticks, marks and fills; a snapshot
    /// rewrites; a cut-off stream and a failed run say so; a saved
    /// conversation comes back with its components.
    func testAConversation() async throws {
        let lesson = try String(contentsOf: repo.appendingPathComponent("test/fixtures/interactive.md"), encoding: .utf8)
            + "\n\n<Form name=\"rsvp\">\n<Input label=\"Your name\" name=\"name\" />\n<Select label=\"Meal\" name=\"meal\" options=\"Veg | Fish\" />\n<Switch label=\"Bringing a guest\" name=\"guest\" />\n<Button>Send</Button>\n</Form>\n"
        var ids: [String: String] = [:]
        ScriptedAgent.requests = []
        ScriptedAgent.reply = { n, input in
            let run: [String: JSONValue] = ["threadId": input["threadId"] ?? .null, "runId": input["runId"] ?? .null]
            let start = ev("RUN_STARTED", run.merging(["protocolVersion": .string("1.0")]) { a, _ in a })
            let end = ev("RUN_FINISHED", run)
            switch n {
            case 1:
                var out = [start, ev("STATE_SNAPSHOT", ["snapshot": .object(["lesson": .string("photosynthesis")])])]
                var i = lesson.startIndex, first = true
                while i < lesson.endIndex {
                    let j = lesson.index(i, offsetBy: 41, limitedBy: lesson.endIndex) ?? lesson.endIndex
                    var kv: [String: JSONValue] = ["delta": .string(String(lesson[i..<j]))]
                    if first { kv["messageId"] = .string("m1"); kv["role"] = .string("assistant"); first = false }
                    out.append(ev("TEXT_MESSAGE_CHUNK", kv))
                    i = j
                }
                return out + [end]
            case 2:
                let p = { (node: String) in "/morphscreen/m1/\(node)" }
                let delta: JSONValue = .array([
                    .object(["op": .string("replace"), "path": .string(p(ids["checklist"]!) + "/done"), "value": .array([0, 1, 2].map { .number($0) })]),
                    .object(["op": .string("add"), "path": .string(p(ids["flashcards"]!)), "value": .object(["known": .array([.number(1)])])]),
                    .object(["op": .string("add"), "path": .string(p(ids["form"]!)), "value": .object(["fields": .object(["name": .string("Ana"), "meal": .string("Fish"), "guest": .bool(true)])])]),
                ])
                return [start, ev("STATE_DELTA", ["delta": delta]), ev("TEXT_MESSAGE_START", ["messageId": .string("m2"), "role": .string("assistant")]), ev("TEXT_MESSAGE_CONTENT", ["messageId": .string("m2"), "delta": .string("Nice work. **Respiration** is next.")]), ev("TEXT_MESSAGE_END", ["messageId": .string("m2")]), end]
            case 3:
                let kept = (input["messages"]?.array ?? []).filter { $0["id"]?.string != "m2" }
                return [start, ev("MESSAGES_SNAPSHOT", ["messages": .array(kept + [.object(["id": .string("m2"), "role": .string("assistant"), "content": .string("Good work. Respiration is next.")])])]), ev("TEXT_MESSAGE_START", ["messageId": .string("m3")]), ev("TEXT_MESSAGE_CONTENT", ["messageId": .string("m3"), "delta": .string("<Card title=\"Respiration\">\nCells break gluc")])]
            default:
                return [start, ev("RUN_ERROR", ["message": .string("the model is overloaded"), "code": .string("overloaded")])]
            }
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [ScriptedAgent.self]
        let chat = AgentConversation(url: URL(string: "https://agent.test/agent")!, packs: ["interactive", "inputs"], session: URLSession(configuration: config))

        // 1. The lesson streams in as one answer.
        var r = await chat.send("Quiz me on photosynthesis")
        XCTAssertEqual(r.outcome, "success")
        XCTAssertEqual(chat.turns.map(\.role), ["user", "assistant"])
        XCTAssertEqual(chat.turns[0].text, "Quiz me on photosynthesis")
        let a = try XCTUnwrap(chat.turns[1].answer)
        XCTAssertTrue(a.complete)
        for t in ["Quiz", "Flashcards", "Poll", "Checklist", "WhatIf", "Form"] { XCTAssertNotNil(find(a.root, t), t) }
        ids = ["checklist": find(a.root, "Checklist")!.id, "flashcards": find(a.root, "Flashcards")!.id, "form": find(a.root, "Form")!.id]
        XCTAssertEqual(ScriptedAgent.requests[0]["protocolVersion"], .string("1.0"))

        // 2. A tick and a typed name are state, not a turn.
        a.components.set(ids["checklist"]!, .object(["done": .array([.number(0), .number(1)])]))
        let form = FormState(node: find(a.root, "Form")!, store: a.components)
        form.set("name", .text("A"))
        XCTAssertEqual(chat.state["morphscreen"]?["m1"]?[ids["checklist"]!], .object(["done": .array([.number(0), .number(1)])]))
        XCTAssertEqual(chat.state["morphscreen"]?["m1"]?[ids["form"]!]?["fields"]?["name"], .string("A"))
        XCTAssertEqual(chat.state["lesson"], .string("photosynthesis"))
        XCTAssertEqual(ScriptedAgent.requests.count, 1)

        // 3. A finished quiz is the next user message, with the ticks.
        chat.act(.quiz(node: find(a.root, "Quiz")!.id, score: 1, total: 2, answers: [QuizAnswer(question: "What absorbs light in a leaf?", choice: "B. Chlorophyll", right: true), QuizAnswer(question: "Which gas do plants take in?", choice: "Oxygen", right: false)]))
        while ScriptedAgent.requests.count < 2 || chat.running { await Task.yield() }
        let said = ScriptedAgent.requests[1]["messages"]?.array?.last
        XCTAssertEqual(said?["role"], .string("user"))
        XCTAssertTrue(said?["content"]?.string?.hasPrefix("I finished the quiz: 1 of 2 right.") ?? false)
        XCTAssertEqual(ScriptedAgent.requests[1]["state"]?["morphscreen"]?["m1"]?[ids["checklist"]!], .object(["done": .array([.number(0), .number(1)])]))

        // 4. The agent's patch is in the store the views read.
        XCTAssertEqual(a.components[ids["checklist"]!]?["done"]?.indices, [0, 1, 2])
        XCTAssertEqual(a.components[ids["flashcards"]!]?["known"]?.indices, [1])
        form.load(a.components[ids["form"]!])
        XCTAssertEqual(form.values["meal"], .text("Fish"))
        XCTAssertEqual(form.values["guest"], .bool(true))
        XCTAssertEqual(chat.turns.map(\.id).suffix(2), ["\(chat.turns[2].id)", "m2"])

        // 5. A snapshot rewrites m2; the stream breaks off in m3.
        r = await chat.send("What's next?")
        XCTAssertTrue(r.truncated)
        XCTAssertEqual(chat.note, "The reply was cut off.")
        let m2 = try XCTUnwrap(chat.turns.first { $0.id == "m2" }?.answer)
        XCTAssertEqual(m2.html, "<p>Good work. Respiration is next.</p>")
        let m3 = try XCTUnwrap(chat.turns.first { $0.id == "m3" }?.answer)
        XCTAssertTrue(m3.complete == false || m3.html.contains("Cells break gluc"))

        // 6. A failed run says so.
        r = await chat.send("Again")
        XCTAssertEqual(r.error, "the model is overloaded")
        XCTAssertEqual(chat.note, "The agent stopped: the model is overloaded")

        // The whole conversation draws.
        let host = NSHostingView(rootView: ScrollView { AgentView(chat).padding(24) }.frame(width: 760, height: 3000))
        host.frame = NSRect(x: 0, y: 0, width: 760, height: 3000)
        host.layoutSubtreeIfNeeded()
        if let shot = ProcessInfo.processInfo.environment["AGENT_SHOT"] {
            let image = ImageRenderer(content: AgentView(chat).padding(24).frame(width: 760).background(Theme.page))
            image.scale = 1
            if let tiff = image.nsImage?.tiffRepresentation { try? NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: shot)) }
        }

        // 7. A saved conversation comes back with its components, and runs nothing.
        let before = ScriptedAgent.requests.count
        let again = AgentConversation(url: URL(string: "https://agent.test/agent")!, packs: ["interactive", "inputs"], session: URLSession(configuration: config))
        again.load(messages: chat.messages, state: chat.state)
        XCTAssertEqual(again.turns.count, 7)
        let back = try XCTUnwrap(again.turns.first { $0.id == "m1" }?.answer)
        XCTAssertEqual(back.components[ids["checklist"]!]?["done"]?.indices, [0, 1, 2])
        XCTAssertEqual(ScriptedAgent.requests.count, before)
    }

    /// Two runs recorded from the LangGraph example agent (examples/langgraph,
    /// RECORD=1): its stream reads cleanly, its closing snapshots restate the
    /// answer without redrawing it, and its state comes back with the
    /// components' state in it.
    func testTheLangGraphAgentsStream() async throws {
        let dir = repo.appendingPathComponent("test/agui/langgraph")
        ScriptedAgent.requests = []
        ScriptedAgent.recorded = try ["run1.sse", "run2.sse"].map { try Data(contentsOf: dir.appendingPathComponent($0)) }
        defer { ScriptedAgent.recorded = [] }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [ScriptedAgent.self]
        let chat = AgentConversation(url: URL(string: "https://agent.test/agent")!, packs: ["interactive", "inputs", "data"], session: URLSession(configuration: config))
        var updates: [AgentUpdate] = []
        chat.onUpdate = { updates.append($0) }
        // The ids the recording was made with.
        let r = await chat.send("Quiz me on photosynthesis", id: "u1")
        XCTAssertEqual(r.outcome, "success")
        XCTAssertFalse(updates.contains { if case .warn = $0 { return true }; if case .rejected = $0 { return true }; return false }, "\(updates.filter { if case .warn = $0 { return true }; return false })")
        XCTAssertFalse(updates.contains { if case .reset = $0 { return true }; return false }, "the snapshot restated the answer, it didn't redraw it")
        XCTAssertEqual(chat.turns.map(\.role), ["user", "assistant"])
        let a = try XCTUnwrap(chat.turns[1].answer)
        XCTAssertTrue(a.complete)
        XCTAssertNotNil(find(a.root, "Quiz"))
        XCTAssertNotNil(find(a.root, "Checklist"))
        await chat.send("I finished the quiz: 1 of 2 right.\n1. What absorbs light in a leaf? I answered \"B. Chlorophyll\" (right).\n2. Which gas do plants take in? I answered \"Oxygen\" (wrong).", id: "u2")
        XCTAssertEqual(chat.turns.map(\.role), ["user", "assistant", "user", "assistant"])
        XCTAssertTrue(chat.turns.last?.answer?.html.contains("Nice work") ?? false)
        XCTAssertNotNil(chat.state["morphscreen"])
    }

    /// The LangGraph example agent itself, when one is running:
    /// AGENT_URL=http://127.0.0.1:8123/agent swift test --filter AgentTests
    func testTheLangGraphAgentLive() async throws {
        guard let url = ProcessInfo.processInfo.environment["AGENT_URL"].flatMap(URL.init(string:)) else { throw XCTSkip("set AGENT_URL to a running examples/langgraph agent") }
        let chat = AgentConversation(url: url, packs: ["interactive", "inputs", "data"])
        let r = await chat.send("Quiz me on photosynthesis")
        XCTAssertEqual(r.outcome, "success", "\(r)")
        let a = try XCTUnwrap(chat.turns.last?.answer)
        XCTAssertTrue(a.complete)
        if let checklist = find(a.root, "Checklist") {
            a.components.set(checklist.id, .object(["done": .array([.number(1)])]))
        }
        if let quiz = find(a.root, "Quiz") {
            let r2 = await chat.send(.string("I finished the quiz: 1 of 2 right."))
            XCTAssertEqual(r2.outcome, "success")
            XCTAssertEqual(chat.turns.count, 4)
            _ = quiz
        }
        let kept = chat.state["morphscreen"]?.object?.values.contains { ($0.object ?? [:]).values.contains { $0["done"]?.indices == [1] } } ?? false
        XCTAssertTrue(kept || find(a.root, "Checklist") == nil, "the tick comes back in LangGraph's state")
    }
}
