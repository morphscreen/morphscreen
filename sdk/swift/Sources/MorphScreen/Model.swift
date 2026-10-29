// The answer as a tree of observable nodes, built from the op stream. A view
// redraws only when its own node changes; a closed node never changes again.

import Foundation
import Observation

@Observable
public final class UINode: Identifiable {
    public let id: String
    public let type: String
    public let attrs: Attrs
    /// Its icon as path data, when it has one.
    public let icon: String?
    public internal(set) var children: [UINode] = []
    public internal(set) var spans: [Span] = []
    public internal(set) var data: NodeData?
    public internal(set) var closed = false
    @ObservationIgnored public internal(set) weak var parent: UINode?

    init(id: String, type: String, attrs: Attrs, icon: String? = nil) {
        self.id = id
        self.type = type
        self.attrs = attrs
        self.icon = icon
    }

    public func attr(_ k: String) -> String? { attrs[k]?.string }

    /// A boolean attribute: bare, or "true".
    public func flag(_ k: String) -> Bool {
        switch attrs[k] {
        case .flag: return true
        case let .string(s): return s.lowercased() == "true"
        case nil: return false
        }
    }

    /// Cards around this node (sets heading sizes and card style).
    public var cardDepth: Int {
        var d = 0
        var p = parent
        while let n = p {
            if n.type == "Card" { d += 1 }
            p = n.parent
        }
        return d
    }
}

/// One answer: feed it the model's text, show it with AnswerView.
@Observable
public final class Answer {
    public let root = UINode(id: "", type: "root", attrs: [:])
    public private(set) var complete = false
    public private(set) var diagnostics: [(line: Int, cls: String, detail: String, error: Bool)] = []
    /// Its interactive components' state, by node id: what the reader did, or what an agent set.
    public let components = ComponentStore()
    @ObservationIgnored private var index: [String: UINode] = [:]
    @ObservationIgnored private let session: Session

    /// `packs`: beyond core, like ["device"]. `custom`: the app's own packs (pack JSON).
    public init(packs: [String] = ["all"], custom: [String] = []) throws {
        session = try Session(packs: packs, custom: custom)
        index[""] = root
    }

    /// The next chunk of the model's text.
    public func push(_ text: String) { apply(session.push(text)) }

    /// The answer is over.
    public func finish(truncated: Bool = false) { apply(session.finish(truncated: truncated)) }

    /// The finished answer as HTML (what a server would send).
    public var html: String { session.html }

    func apply(_ ops: [Op]) {
        for op in ops {
            switch op {
            case let .open(id, type, attrs, icon):
                open(id, type, attrs, icon)
            case let .spans(id, spans):
                index[id]?.spans = spans
            case let .close(id, data):
                close(id, data)
            case let .node(id, type, attrs, spans, data, icon):
                open(id, type, attrs, icon)
                if let spans { index[id]?.spans = spans }
                close(id, data)
            case let .diag(line, cls, detail, error):
                diagnostics.append((line, cls, detail, error))
            case let .end(c, _):
                complete = c
            }
        }
    }

    private func open(_ id: String, _ type: String, _ attrs: Attrs, _ icon: String?) {
        let parentId = id.lastIndex(of: ".").map { String(id[..<$0]) } ?? ""
        guard let parent = index[parentId] else { return }
        let n = UINode(id: id, type: type, attrs: attrs, icon: icon)
        n.parent = parent
        index[id] = n
        parent.children.append(n)
    }

    private func close(_ id: String, _ data: NodeData?) {
        guard let n = index[id] else { return }
        if let data { n.data = data }
        n.closed = true
    }
}
