// Spans as SwiftUI Text: formatting, links, code, and components inside a
// sentence or a table cell (a Badge reads as a colored label).

import SwiftUI

func plainText(_ spans: [Span]) -> String {
    spans.map { s -> String in
        switch s {
        case let .text(t), let .code(t): return t
        case let .format(_, c), let .link(_, c), let .element(_, _, c): return plainText(c)
        case let .image(_, alt, _): return alt
        case .lineBreak: return "\n"
        }
    }.joined()
}

/// IDs, dates, times, versions and codes (a token with a digit and a - / : .
/// or _ inside) kept on one line: a word joiner after each of those marks.
func keepIDs(_ t: String) -> String {
    var t = t
    // A dash between words ("lobbying—Microsoft"): the line may break after it, never before it.
    if t.contains("\u{2014}") || t.contains("\u{2013}") {
        var out = ""
        var prev: Character = " "
        for c in t {
            if c == "\u{2014}" || c == "\u{2013}", !prev.isWhitespace { out.append("\u{2060}") }
            out.append(c)
            prev = c
        }
        t = out
    }
    guard t.contains(where: \.isNumber) || t.contains("@") || t.contains("/") else { return t }
    return t.split(separator: " ", omittingEmptySubsequences: false).map { tok -> String in
        // A long URL, path or code (a Wi-Fi QR payload): it may break after a
        // slash or semicolon, never inside a part, as the core's HTML does (a
        // zero-width space there; selectable text, code and math, is drawn raw).
        if tok.count > 32, tok.contains("/") || tok.contains(";") {
            var parts: [String] = []
            var cur = ""
            for c in tok {
                cur.append(c)
                if c == "/" || c == ";" { parts.append(cur); cur = "" }
            }
            if !cur.isEmpty { parts.append(cur) }
            return parts.map { part in
                part.count <= 32 ? part.map { c in "-_.:".contains(c) ? "\(c)\u{2060}" : String(c) }.joined() : part
            }.joined(separator: "\u{200B}")
        }
        let core = tok.trimmingCharacters(in: CharacterSet(charactersIn: "()[],;\"'"))
        let marks: Set<Character> = ["-", "/", ":", ".", "_", "@", "\u{2013}"]
        // An email address is one piece too.
        let email = core.count <= 40 && core.contains("@") && core.contains(".") && !core.contains("://")
        guard email || ((3...32).contains(core.count) && core.contains(where: \.isNumber) && core.contains(where: { marks.contains($0) }) && !core.contains("://")) else { return String(tok) }
        var out = ""
        for c in tok {
            out.append(c)
            if marks.contains(c) { out.append("\u{2060}") }
        }
        return out
    }.joined(separator: " ")
}

/// Text for spans. `base` is the font of the block they sit in.
func inlineText(_ spans: [Span], base: Font = .body) -> Text {
    spans.reduce(Text("")) { acc, s in acc + segment(s, base: base) }
}

private func segment(_ s: Span, base: Font) -> Text {
    switch s {
    case let .text(t):
        return Text(keepIDs(t))
    case let .code(t):
        return Text(keepIDs(t)).font(.system(.callout, design: .monospaced)).foregroundColor(Theme.ink2)
    case .lineBreak:
        return Text("\n")
    case .image:
        // Shown under the text, as a photo or its description.
        return Text("")
    case let .link(href, c):
        var a = AttributedString(plainText(c))
        a.link = URL(string: href)
        a.underlineStyle = .single
        return Text(a)
    case let .format(f, c):
        let inner = inlineText(c, base: base)
        switch f {
        case "strong": return inner.fontWeight(.semibold)
        case "em": return inner.italic()
        case "s": return inner.strikethrough()
        case "u": return inner.underline()
        case "small", "sub", "sup": return inner.font(.footnote)
        case "kbd": return inner.font(.system(.callout, design: .monospaced))
        default: return inner
        }
    case let .element(type, attrs, c):
        let label = plainText(c)
        switch type {
        case "Badge":
            let tone = attrs["tone"]?.string
            let (fg, _) = Theme.tone(tone)
            let dot = tone == nil || tone == "neutral" ? "" : "● "
            return Text(dot + label).font(.caption.weight(.semibold)).foregroundColor(fg)
        case "Button":
            return Text(label).fontWeight(.semibold).foregroundColor(Theme.info)
        case "Avatar":
            return Text(attrs["name"]?.string ?? label).fontWeight(.semibold)
        case "Rating":
            // Inside a sentence: the stars' mark, the score and its count, in the text's flow.
            let count = attrs["count"]?.string.map { Text(" (\($0))").foregroundColor(Theme.ink3) } ?? Text("")
            return Text("\u{2605} ").foregroundColor(Theme.warn) + Text(attrs["value"]?.string ?? label).fontWeight(.semibold) + count
        default:
            return Text(label.isEmpty ? (attrs["label"]?.string ?? attrs["value"]?.string ?? "") : label)
        }
    }
}

/// Inline images in a block, shown under its text.
func inlineImages(_ spans: [Span]) -> [GalleryImage] {
    spans.flatMap { s -> [GalleryImage] in
        switch s {
        case let .image(src, alt, credit): return [GalleryImage(src: src, alt: alt, credit: credit)]
        case let .format(_, c), let .link(_, c), let .element(_, _, c): return inlineImages(c)
        default: return []
        }
    }
}

/// Asks with this text when tapped (a Button or follow-up inside text).
func askTarget(_ spans: [Span]) -> String? {
    for s in spans {
        if case let .element("Button", attrs, c) = s { return attrs["ask"]?.string ?? plainText(c) }
    }
    return nil
}
