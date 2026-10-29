// The interactive components' state as plain JSON (roadmap Q9), the same
// shapes on every platform: Quiz {answers: [choice index or null]},
// Flashcards {known: [card index]}, Poll {vote: option or null}, Checklist
// {done: [item index]}, WhatIf {values: {slider: number}}, Form {fields:
// {name: value}}. The views read and write it here, so state set from
// outside (an agent's shared state) shows at once, and the reader's changes
// go out through `onChange`.

import Foundation
import Observation

/// A JSON value.
public indirect enum JSONValue: Equatable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    /// From what JSONSerialization reads.
    public init(_ any: Any?) {
        switch any {
        case nil, is NSNull: self = .null
        // JSONSerialization's booleans are NSNumbers too; CF tells them apart.
        case let n as NSNumber: self = CFGetTypeID(n) == CFBooleanGetTypeID() ? .bool(n.boolValue) : .number(n.doubleValue)
        case let s as String: self = .string(s)
        case let a as [Any]: self = .array(a.map { JSONValue($0) })
        case let o as [String: Any]: self = .object(o.mapValues { JSONValue($0) })
        default: self = .null
        }
    }

    /// Parsed from JSON text (null when it isn't JSON).
    public init(json: String) {
        self = JSONValue(try? JSONSerialization.jsonObject(with: Data(json.utf8), options: [.fragmentsAllowed]))
    }

    /// For JSONSerialization.
    public var any: Any {
        switch self {
        case .null: return NSNull()
        case let .bool(b): return b
        case let .number(n): return n
        case let .string(s): return s
        case let .array(a): return a.map(\.any)
        case let .object(o): return o.mapValues(\.any)
        }
    }

    public var json: String {
        guard let d = try? JSONSerialization.data(withJSONObject: any, options: [.fragmentsAllowed, .sortedKeys, .withoutEscapingSlashes]) else { return "null" }
        return String(decoding: d, as: UTF8.self)
    }

    public subscript(key: String) -> JSONValue? {
        if case let .object(o) = self { return o[key] }
        return nil
    }

    public var string: String? { if case let .string(s) = self { return s }; return nil }
    public var number: Double? { if case let .number(n) = self { return n }; return nil }
    public var bool: Bool? { if case let .bool(b) = self { return b }; return nil }
    public var array: [JSONValue]? { if case let .array(a) = self { return a }; return nil }
    public var object: [String: JSONValue]? { if case let .object(o) = self { return o }; return nil }
    /// A list of whole numbers (indices).
    public var indices: [Int] { (array ?? []).compactMap { $0.number.map { Int($0) } } }
}

/// One answer's components' state, by node id.
@Observable
public final class ComponentStore {
    public private(set) var values: [String: JSONValue] = [:]
    /// The reader changed a component.
    @ObservationIgnored public var onChange: ((String, JSONValue) -> Void)?

    public init() {}

    /// The reader acted: kept, and reported.
    func set(_ node: String, _ v: JSONValue) {
        guard values[node] != v else { return }
        values[node] = v
        onChange?(node, v)
    }

    /// From outside (an agent's state): shown, not reported, since the reader didn't act.
    public func apply(_ states: [String: JSONValue]) {
        for (node, v) in states where values[node] != v {
            values[node] = v
        }
    }

    public subscript(node: String) -> JSONValue? { values[node] }
}

extension FieldValue {
    /// The field as state; uploads and places stay on the device.
    var state: JSONValue? {
        switch self {
        case let .text(s): return .string(s)
        case let .number(n): return .number(n)
        case let .bool(b): return .bool(b)
        case let .list(l): return .array(l.map { .string($0) })
        case .files, .photos, .location: return nil
        }
    }

    init?(state: JSONValue) {
        switch state {
        case let .string(s): self = .text(s)
        case let .number(n): self = .number(n)
        case let .bool(b): self = .bool(b)
        case let .array(a): self = .list(a.compactMap(\.string))
        default: return nil
        }
    }
}
