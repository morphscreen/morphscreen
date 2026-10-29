// The core through its C ABI: a Session reads one answer and returns the ops.

import Foundation
import MorphScreenCore

public enum Attr: Equatable, Sendable {
    case string(String)
    case flag

    public var string: String? {
        if case let .string(s) = self { return s }
        return nil
    }
}

public typealias Attrs = [String: Attr]

/// Inline content, as the core sends it (spec/format.md, "Spans").
public indirect enum Span: Equatable, Sendable {
    case text(String)
    case code(String)
    case format(String, [Span])
    case link(String, [Span])
    /// `credit` is the image's title: who made it and its license, with links.
    case image(src: String, alt: String, credit: [Span])
    case lineBreak
    case element(type: String, attrs: Attrs, children: [Span])
}

/// What a component's content parsed to (a chart's table, follow-ups, images),
/// or a table's numeric columns.
public enum NodeData: Equatable, Sendable {
    case table(columns: [String], rows: [[String]])
    case list([[Span]])
    case images([GalleryImage])
    case align([Bool])
    /// Worked out by the core: a Math formula as Unicode, a QR code's rows.
    case lines([String])
    /// Columns: the most cells a row holds and the narrowest a cell may get (points).
    case layout(per: Int, min: Int)
    /// A Question's choices and which is right (nil: the answer named none).
    case choices(items: [[Span]], answer: Int?)
    /// A Checklist's items.
    case checks([CheckItem])
    /// A What-if Result: its formula in postfix tokens and its starting value.
    case formula(rpn: [String], value: Double?)
}

public struct CheckItem: Equatable, Sendable {
    public let done: Bool
    public let spans: [Span]
}

public struct GalleryImage: Equatable, Sendable {
    public let src: String
    public let alt: String
    public var credit: [Span] = []
    /// The words after the image on its line.
    public var caption: [Span] = []
}

public enum Op: Sendable {
    /// `icon` is the node's icon as path data (Phosphor's 256-unit grid), when it has one.
    case open(id: String, type: String, attrs: Attrs, icon: String? = nil)
    case spans(id: String, spans: [Span])
    case close(id: String, data: NodeData?)
    case node(id: String, type: String, attrs: Attrs, spans: [Span]?, data: NodeData?, icon: String? = nil)
    case diag(line: Int, cls: String, detail: String, error: Bool)
    case end(complete: Bool, truncated: Bool)
}

func decodeData(_ v: Any?) -> NodeData? {
    guard let d = v as? [String: Any] else { return nil }
    if let cols = d["columns"] as? [String], let rows = d["rows"] as? [[String]] { return .table(columns: cols, rows: rows) }
    if let checks = d["checks"] as? [[String: Any]] { return .checks(checks.map { CheckItem(done: $0["done"] as? Bool ?? false, spans: decodeSpans($0["c"])) }) }
    if let rpn = d["formula"] as? [String] { return .formula(rpn: rpn, value: d["value"] as? Double) }
    if let items = d["items"] as? [Any], d.keys.contains("answer") { return .choices(items: items.map(decodeSpans), answer: d["answer"] as? Int) }
    if let items = d["items"] as? [Any] { return .list(items.map(decodeSpans)) }
    if let images = d["images"] as? [[String: Any]] { return .images(images.map { GalleryImage(src: $0["src"] as? String ?? "", alt: $0["alt"] as? String ?? "", credit: decodeSpans($0["credit"]), caption: decodeSpans($0["caption"])) }) }
    if let align = d["align"] as? [String] { return .align(align.map { $0 == "right" }) }
    if let lines = d["lines"] as? [String] { return .lines(lines) }
    if let l = d["layout"] as? [String: Any], let per = l["per"] as? Int, let min = l["min"] as? Int { return .layout(per: per, min: min) }
    return nil
}

public struct CoreError: Error, CustomStringConvertible {
    public let description: String
}

private func takeString(_ p: UnsafeMutablePointer<CChar>?) -> String {
    guard let p else { return "" }
    defer { ms_string_free(p) }
    return String(cString: p)
}

private func lastError() -> String { takeString(ms_last_error()) }

func decodeAttrs(_ v: Any?) -> Attrs {
    guard let d = v as? [String: Any] else { return [:] }
    var out: Attrs = [:]
    for (k, x) in d {
        if let s = x as? String { out[k] = .string(s) } else { out[k] = .flag }
    }
    return out
}

func decodeSpans(_ v: Any?) -> [Span] {
    if let s = v as? String { return [.text(s)] }
    guard let list = v as? [[String: Any]] else { return [] }
    return list.compactMap { s in
        let t = s["t"] as? String ?? ""
        switch t {
        case "text": return .text(s["v"] as? String ?? "")
        case "code": return .code(s["v"] as? String ?? "")
        case "br": return .lineBreak
        case "img": return .image(src: s["src"] as? String ?? "", alt: s["alt"] as? String ?? "", credit: decodeSpans(s["credit"]))
        case "link": return .link(s["href"] as? String ?? "", decodeSpans(s["c"]))
        case "el": return .element(type: s["type"] as? String ?? "", attrs: decodeAttrs(s["attrs"]), children: decodeSpans(s["c"]))
        default: return .format(t, decodeSpans(s["c"]))
        }
    }
}

func decodeOps(_ text: String) -> [Op] {
    var ops: [Op] = []
    for line in text.split(separator: "\n") where !line.isEmpty {
        guard let o = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any], let kind = o["op"] as? String else { continue }
        let id = o["id"] as? String ?? ""
        switch kind {
        case "open": ops.append(.open(id: id, type: o["type"] as? String ?? "", attrs: decodeAttrs(o["attrs"]), icon: o["icon"] as? String))
        case "spans": ops.append(.spans(id: id, spans: decodeSpans(o["spans"])))
        case "close": ops.append(.close(id: id, data: decodeData(o["data"])))
        case "node":
            ops.append(.node(id: id, type: o["type"] as? String ?? "", attrs: decodeAttrs(o["attrs"]), spans: o["spans"].map(decodeSpans), data: decodeData(o["data"]), icon: o["icon"] as? String))
        case "diag": ops.append(.diag(line: o["line"] as? Int ?? 0, cls: o["cls"] as? String ?? "", detail: o["detail"] as? String ?? "", error: (o["severity"] as? String) == "error"))
        case "end": ops.append(.end(complete: o["complete"] as? Bool ?? false, truncated: o["truncated"] as? Bool ?? false))
        default: break
        }
    }
    return ops
}

/// One answer being read by the core.
public final class Session {
    private let handle: OpaquePointer

    /// `packs`: beyond core, like ["device"]. `custom`: the app's own packs (pack JSON).
    public init(packs: [String] = ["all"], custom: [String] = []) throws {
        let customJSON = custom.isEmpty ? nil : "[" + custom.joined(separator: ",") + "]"
        guard let h = packs.joined(separator: ",").withCString({ p in
            customJSON.map { c in c.withCString { ms_parser_new(p, $0) } } ?? ms_parser_new(p, nil)
        }) else { throw CoreError(description: lastError()) }
        handle = h
    }

    deinit { ms_parser_free(handle) }

    /// Feeds the next chunk of the model's text; returns the ops it produced.
    public func push(_ text: String) -> [Op] {
        var t = text
        t.withUTF8 { buf in ms_parser_push(handle, buf.baseAddress, buf.count) }
        return decodeOps(takeString(ms_parser_take_ops(handle)))
    }

    /// The answer is over; returns the last ops (ending with `end`).
    public func finish(truncated: Bool = false) -> [Op] {
        ms_parser_finish(handle, truncated)
        return decodeOps(takeString(ms_parser_take_ops(handle)))
    }

    /// Pictures in `html` load only from these hosts, as in the SDKs; with
    /// none set, only data: images do.
    public func allowImages(hosts: [String]) {
        ms_parser_allow_images(handle, hosts.joined(separator: ","))
    }

    /// The finished answer as HTML (what a server would send).
    public var html: String { takeString(ms_parser_html(handle)) }

    /// The finished tree as JSON (for tests).
    public var treeJSON: String { takeString(ms_parser_tree(handle)) }
}

/// Inline text (a table cell, a list item) parsed as the core parses content,
/// so pack cells draw bold, code and links like everything else.
public func parseInline(_ text: String) -> [Span] {
    guard let p = text.withCString({ ms_inline($0) }) else { return [.text(text)] }
    let json = takeString(p)
    return decodeSpans(try? JSONSerialization.jsonObject(with: Data(json.utf8)))
}

/// The system prompt for a catalog (servers usually build it; it's here too).
public func systemPrompt(packs: [String] = ["all"], custom: [String] = []) throws -> String {
    let customJSON = custom.isEmpty ? nil : "[" + custom.joined(separator: ",") + "]"
    let p = packs.joined(separator: ",").withCString { pp in customJSON.map { c in c.withCString { ms_prompt(pp, $0) } } ?? ms_prompt(pp, nil) }
    guard p != nil else { throw CoreError(description: lastError()) }
    return takeString(p)
}
