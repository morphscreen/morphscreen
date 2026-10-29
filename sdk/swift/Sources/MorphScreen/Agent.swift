// AG-UI in SwiftUI (roadmap Q9): a conversation with any agent that speaks
// AG-UI (protocol 1.0) over HTTP + Server-Sent Events, its answers drawn as
// they stream. The protocol is the core's (rust/core/src/agui.rs): response
// bytes go in, what to draw comes out, the same as on the web and Android.
//
//   let chat = AgentConversation(url: agentURL, packs: ["interactive"])
//   AgentView(chat)
//   await chat.send("Quiz me on photosynthesis")
//
// The reader's actions go back to the agent: a Button, a follow-up, a form,
// a finished quiz or a vote becomes the next user message (worded by the
// core); ticks, known cards, sliders and typed fields are the shared state
// (`morphscreen` in AG-UI's state, by message and node), sent with the next
// run, and an agent can set them with STATE_SNAPSHOT or STATE_DELTA.

import Foundation
import MorphScreenCore
import Observation
import SwiftUI

private func takeString(_ p: UnsafeMutablePointer<CChar>?) -> String? {
    guard let p else { return nil }
    defer { ms_string_free(p) }
    return String(cString: p)
}

/// What a conversation with an AG-UI agent reports (rust/core/src/agui.rs).
public enum AgentUpdate: Sendable, Equatable {
    case run(threadId: String, runId: String)
    case message(id: String, role: String, index: Int)
    case text(id: String, delta: String)
    case end(id: String, truncated: Bool)
    case reset(id: String)
    case removed(id: String)
    case changed(id: String)
    case tool(id: String, name: String, arguments: String, parentMessageId: String)
    case state
    case step(name: String, started: Bool)
    case custom(name: String, value: JSONValue)
    case finished(outcome: String, pending: [String])
    case error(message: String, code: String?)
    case rejected(message: String)
    case truncated
    case warn(message: String)

    static func decode(_ text: String?) -> [AgentUpdate] {
        guard let text else { return [] }
        return text.split(separator: "\n").compactMap { line in
            let u = JSONValue(json: String(line))
            let s = { (k: String) in u[k]?.string ?? "" }
            switch s("t") {
            case "run": return .run(threadId: s("threadId"), runId: s("runId"))
            case "message": return .message(id: s("id"), role: s("role"), index: Int(u["index"]?.number ?? 0))
            case "text": return .text(id: s("id"), delta: s("delta"))
            case "end": return .end(id: s("id"), truncated: u["truncated"]?.bool ?? false)
            case "reset": return .reset(id: s("id"))
            case "removed": return .removed(id: s("id"))
            case "changed": return .changed(id: s("id"))
            case "tool": return .tool(id: s("id"), name: s("name"), arguments: s("arguments"), parentMessageId: s("parentMessageId"))
            case "state": return .state
            case "step": return .step(name: s("name"), started: u["started"]?.bool ?? false)
            case "custom": return .custom(name: s("name"), value: u["value"] ?? .null)
            case "finished": return .finished(outcome: s("outcome"), pending: (u["pending"]?.array ?? []).compactMap(\.string))
            case "error": return .error(message: s("message"), code: u["code"]?.string)
            case "rejected": return .rejected(message: s("message"))
            case "truncated": return .truncated
            case "warn": return .warn(message: s("message"))
            default: return nil
            }
        }
    }
}

/// The core's AG-UI client: response bytes in, updates out; the conversation and the shared state.
public final class AgentCore {
    private let handle: OpaquePointer

    public init() { handle = ms_agent_new() }
    deinit { ms_agent_free(handle) }

    /// Bytes of the response body, as they arrive.
    public func feed(_ bytes: Data) -> [AgentUpdate] {
        let out = bytes.withUnsafeBytes { buf in ms_agent_feed(handle, buf.bindMemory(to: UInt8.self).baseAddress, buf.count) }
        return AgentUpdate.decode(takeString(out))
    }

    @discardableResult
    func call(_ op: String, _ a: String? = nil, _ b: String? = nil, _ c: String? = nil) throws -> String {
        let out = op.withCString { o in
            (a ?? "").withCString { x in (b ?? "").withCString { y in (c ?? "").withCString { z in ms_agent_call(handle, o, x, y, z) } } }
        }
        guard let s = takeString(out) else { throw CoreError(description: takeString(ms_last_error()) ?? "") }
        return s
    }

    /// One event, for an app with its own transport.
    public func event(_ json: String) -> [AgentUpdate] { AgentUpdate.decode(try? call("event", json)) }
    /// The response ended.
    public func close() -> [AgentUpdate] { AgentUpdate.decode(try? call("close")) }
    /// The reader's message, or a tool's answer (an AG-UI message).
    public func add(_ message: JSONValue) throws -> [AgentUpdate] { AgentUpdate.decode(try call("add", message.json)) }
    /// The next run's request body.
    public func input(threadId: String, runId: String, extra: JSONValue? = nil) throws -> String { try call("input", threadId, runId, extra?.json) }
    /// A saved conversation.
    public func load(messages: JSONValue, state: JSONValue? = nil) throws -> [AgentUpdate] { AgentUpdate.decode(try call("load", messages.json, state?.json)) }
    public var messages: JSONValue { JSONValue(json: (try? call("messages")) ?? "[]") }
    public var state: JSONValue { JSONValue(json: (try? call("state")) ?? "{}") }
    public func setState(_ v: JSONValue) throws { try call("setState", v.json) }
    /// An answer's components' state, by node id.
    public func components(_ messageId: String) -> [String: JSONValue] { JSONValue(json: (try? call("components", messageId)) ?? "{}").object ?? [:] }
    public func setComponent(_ messageId: String, node: String, _ v: JSONValue) throws { try call("setComponent", messageId, node, v.json) }
}

/// The user message an action starts, or nil when it starts none (spec/format.md, "Actions").
public func actionMessage(_ action: Action) -> String? {
    let text = action.json.json.withCString { takeString(ms_action_message($0)) } ?? ""
    return text.isEmpty ? nil : text
}

extension Action {
    /// The action as spec/format.md writes it; uploads by name only.
    var json: JSONValue {
        switch self {
        case let .ask(text, node): return .object(["type": .string("ask"), "text": .string(text), "node": .string(node)])
        case let .vote(node, name, choice): return .object(["type": .string("vote"), "node": .string(node), "name": .string(name), "choice": .string(choice)])
        case let .state(node, name, value): return .object(["type": .string("state"), "node": .string(node), "name": .string(name), "value": .array(value.map { .string($0) })])
        case let .quiz(node, score, total, answers):
            return .object(["type": .string("quiz"), "node": .string(node), "score": .number(Double(score)), "total": .number(Double(total)), "answers": .array(answers.map { a in
                .object(["question": .string(a.question), "choice": .string(a.choice), "right": a.right.map { .bool($0) } ?? .null])
            })])
        case let .submit(node, form, button, fields):
            var f: [String: JSONValue] = [:]
            for (k, v) in fields {
                switch v {
                case let .files(urls): f[k] = .array(urls.map { .object(["name": .string($0.lastPathComponent), "type": .string(mime($0.pathExtension))]) })
                case let .photos(data): f[k] = .array(data.indices.map { .object(["name": .string("photo-\($0 + 1).jpg"), "type": .string("image/jpeg")]) })
                case let .location(lat, lng, accuracy): f[k] = .object(["lat": .number(lat), "lng": .number(lng), "accuracy": .number(accuracy)])
                default: f[k] = v.state ?? .null
                }
            }
            return .object(["type": .string("submit"), "node": .string(node), "form": .string(form), "button": .string(button), "fields": .object(f)])
        }
    }
}

private func mime(_ ext: String) -> String {
    switch ext.lowercased() {
    case "jpg", "jpeg": return "image/jpeg"
    case "png": return "image/png"
    case "heic": return "image/heic"
    case "pdf": return "application/pdf"
    case "txt": return "text/plain"
    default: return "application/octet-stream"
    }
}

/// How a run ended.
public struct RunResult: Sendable, Equatable {
    /// As the agent said: success, interrupt or cancelled.
    public var outcome: String?
    /// The agent reported a failure, or the request failed.
    public var error: String?
    /// The stream broke the protocol and was stopped.
    public var rejected: String?
    /// The stream ended before the run did.
    public var truncated = false
    /// Tool calls left for the app.
    public var pending: [String] = []
}

/// One turn on the page: the reader's words, or the agent's answer.
@Observable
public final class AgentTurn: Identifiable {
    public let id: String
    public let role: String
    public internal(set) var text = ""
    public internal(set) var answer: Answer?

    init(id: String, role: String) {
        self.id = id
        self.role = role
    }
}

/// A conversation with an AG-UI agent. Use it on the main actor.
@MainActor
@Observable
public final class AgentConversation {
    public private(set) var turns: [AgentTurn] = []
    public private(set) var running = false
    /// What to tell the reader about the last run (cut off, failed), if anything.
    public private(set) var note: String?
    public let threadId: String
    public let agent = AgentCore()

    @ObservationIgnored let url: URL
    @ObservationIgnored let packs: [String]
    @ObservationIgnored let custom: [String]
    @ObservationIgnored let session: URLSession
    @ObservationIgnored public var headers: [String: String] = [:]
    /// The app's own tools, context and pass-through props, sent with every run.
    @ObservationIgnored public var extra: JSONValue?
    /// Every update from the core (steps, custom events, warnings...).
    @ObservationIgnored public var onUpdate: ((AgentUpdate) -> Void)?
    /// A tool of the app's own that the agent called: return its result to answer it.
    @ObservationIgnored public var onToolCall: ((_ id: String, _ name: String, _ arguments: String) async -> String?)?
    /// Send the reader's actions on as user messages (default true).
    @ObservationIgnored public var sendActions = true
    @ObservationIgnored private var task: Task<RunResult, Never>?
    @ObservationIgnored private var toolAnswers: [Task<Bool, Never>] = []

    public init(url: URL, threadId: String = UUID().uuidString, packs: [String] = ["all"], custom: [String] = [], session: URLSession = .shared) {
        self.url = url
        self.threadId = threadId
        self.packs = packs
        self.custom = custom
        self.session = session
    }

    public var state: JSONValue { agent.state }
    public var messages: JSONValue { agent.messages }

    public func setState(_ v: JSONValue) {
        try? agent.setState(v)
        handle([.state])
    }

    /// Starts from a saved conversation.
    public func load(messages: JSONValue, state: JSONValue? = nil) {
        handle((try? agent.load(messages: messages, state: state)) ?? [])
    }

    /// The reader says something (text, or AG-UI content parts); runs the agent.
    @discardableResult
    public func send(_ content: JSONValue, id: String = UUID().uuidString) async -> RunResult {
        handle((try? agent.add(.object(["id": .string(id), "role": .string("user"), "content": content]))) ?? [])
        return await run()
    }

    @discardableResult
    public func send(_ text: String, id: String = UUID().uuidString) async -> RunResult { await send(.string(text), id: id) }

    /// Runs the agent on the conversation as it is, again while the app answers its tool calls.
    @discardableResult
    public func run() async -> RunResult {
        while true {
            toolAnswers = []
            let t = Task { await runOnce() }
            task = t
            let r = await t.value
            var answered = false
            for a in toolAnswers where await a.value { answered = true }
            if !answered || r.error != nil || r.rejected != nil || r.truncated || r.outcome != "success" { return r }
        }
    }

    /// Stops the run in progress (it ends truncated, not cancelled).
    public func stop() { task?.cancel() }

    private func runOnce() async -> RunResult {
        guard !running else { return RunResult(error: "a run is already going") }
        running = true
        note = nil
        defer { running = false }
        var result = RunResult()
        let watch = { (us: [AgentUpdate]) in
            for u in us {
                switch u {
                case let .finished(outcome, pending): result.outcome = outcome; result.pending = pending
                case let .error(m, _): result.error = m
                case let .rejected(m): result.rejected = m
                case .truncated: result.truncated = true
                default: break
                }
            }
            self.handle(us)
        }
        do {
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
            req.httpBody = Data(try agent.input(threadId: threadId, runId: UUID().uuidString, extra: extra).utf8)
            let (bytes, response) = try await session.bytes(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                result.error = "the agent answered \(code)"
                note = "The agent answered \(code)."
                return result
            }
            var buf = Data()
            do {
                // Lines go in whole: the core frames them, a blank line ends an event.
                for try await b in bytes {
                    buf.append(b)
                    if b == 0x0A {
                        watch(agent.feed(buf))
                        buf.removeAll(keepingCapacity: true)
                    }
                }
            } catch {
                // Stopped, or the connection dropped: what came stays; close() says it's truncated.
            }
            if !buf.isEmpty { watch(agent.feed(buf)) }
            watch(agent.close())
        } catch {
            result.error = "the agent couldn't be reached (\(error.localizedDescription))"
            note = "The agent couldn't be reached."
        }
        return result
    }

    private func turn(_ id: String) -> AgentTurn? { turns.first { $0.id == id } }

    private func answer(for t: AgentTurn) -> Answer? {
        if let a = t.answer { return a }
        guard let a = try? Answer(packs: packs, custom: custom) else { return nil }
        let id = t.id
        a.components.apply(agent.components(id))
        a.components.onChange = { [weak self] node, v in
            try? self?.agent.setComponent(id, node: node, v)
        }
        t.answer = a
        return a
    }

    /// Applies the core's updates to the turns.
    func handle(_ updates: [AgentUpdate]) {
        for u in updates {
            onUpdate?(u)
            switch u {
            case let .message(id, role, index) where role == "user" || role == "assistant":
                let t = AgentTurn(id: id, role: role)
                // Where the core put it among the turns shown (other roles aren't).
                let before = (agent.messages.array ?? []).prefix(index).compactMap { $0["id"]?.string }
                let at = turns.lastIndex { before.contains($0.id) }.map { $0 + 1 } ?? 0
                turns.insert(t, at: min(at, turns.count))
            case let .text(id, delta):
                guard let t = turn(id) else { break }
                if t.role == "user" { t.text += delta } else { answer(for: t)?.push(delta) }
            case let .end(id, truncated):
                turn(id)?.answer?.finish(truncated: truncated)
            case let .reset(id):
                guard let t = turn(id) else { break }
                t.answer = nil
                t.text = ""
            case let .removed(id):
                turns.removeAll { $0.id == id }
            case .state:
                for t in turns { t.answer?.components.apply(agent.components(t.id)) }
            case let .tool(id, name, arguments, _):
                if let onToolCall {
                    toolAnswers.append(Task { [weak self] in
                        guard let result = await onToolCall(id, name, arguments), let self else { return false }
                        self.handle((try? self.agent.add(.object(["id": .string(UUID().uuidString), "role": .string("tool"), "toolCallId": .string(id), "content": .string(result)]))) ?? [])
                        return true
                    })
                }
            case let .error(message, _):
                note = "The agent stopped: \(message)"
            case .rejected:
                note = "The agent's reply broke off (it didn't follow the protocol)."
            case .truncated:
                note = "The reply was cut off."
            default:
                break
            }
        }
    }

    /// The reader acted in an answer: a turn of their own, unless it's only state.
    public func act(_ action: Action) {
        guard sendActions, !running, let text = actionMessage(action) else { return }
        var parts: [JSONValue] = []
        if case let .submit(_, _, _, fields) = action {
            for v in fields.values {
                switch v {
                case let .photos(photos):
                    parts += photos.map { .object(["type": .string("image"), "source": .object(["type": .string("data"), "value": .string($0.base64EncodedString()), "mimeType": .string("image/jpeg")])]) }
                case let .files(urls):
                    for u in urls {
                        guard let d = try? Data(contentsOf: u) else { continue }
                        let m = mime(u.pathExtension)
                        let kind = m.hasPrefix("image/") ? "image" : "document"
                        parts.append(.object(["type": .string(kind), "source": .object(["type": .string("data"), "value": .string(d.base64EncodedString()), "mimeType": .string(m)]), "metadata": .object(["filename": .string(u.lastPathComponent)])]))
                    }
                default: break
                }
            }
        }
        Task { await send(parts.isEmpty ? .string(text) : .array([.object(["type": .string("text"), "text": .string(text)])] + parts)) }
    }
}

/// The conversation: the reader's turns on the right, the agent's answers as they stream.
public struct AgentView: View {
    let conversation: AgentConversation
    let components: [String: CustomView]
    let media: MediaPolicy
    let onAction: (Action) -> Void

    public init(_ conversation: AgentConversation, components: [String: CustomView] = [:], media: MediaPolicy = MediaPolicy(), onAction: @escaping (Action) -> Void = { _ in }) {
        self.conversation = conversation
        self.components = components
        self.media = media
        self.onAction = onAction
    }

    public var body: some View {
        LazyVStack(alignment: .leading, spacing: Tokens.s6) {
            ForEach(conversation.turns) { t in
                TurnView(turn: t, components: components, media: media) { a in
                    onAction(a)
                    conversation.act(a)
                }
            }
            if let note = conversation.note {
                HStack(alignment: .firstTextBaseline, spacing: Tokens.s2) {
                    Circle().fill(note.hasPrefix("The reply was cut off") ? Theme.ink3 : Theme.bad).frame(width: 6, height: 6).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 1 }
                    Text(note).font(.footnote).foregroundColor(Theme.ink2)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct TurnView: View {
    let turn: AgentTurn
    let components: [String: CustomView]
    let media: MediaPolicy
    let act: (Action) -> Void

    var body: some View {
        if turn.role == "user" {
            if !turn.text.isEmpty {
                Text(turn.text)
                    .padding(.horizontal, Tokens.s3)
                    .padding(.vertical, Tokens.s2)
                    .background(Theme.tile, in: RoundedRectangle(cornerRadius: Theme.radius))
                    .frame(maxWidth: 560, alignment: .trailing)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .textSelection(.enabled)
            }
        } else if let a = turn.answer {
            AnswerView(a, components: components, media: media, onAction: act)
        }
    }
}
