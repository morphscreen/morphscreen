// The theme: everything an answer's look depends on (faces and type scale,
// colours in light, dark and mono, corners, spacing, depth, motion). The
// default is ThemeSpec.standard (Tokens.swift, generated from
// spec/theme.tokens.json); an app gives its own in the same W3C Design Tokens
// form with Theme.use(dtcg:), before its first answer shows.

import CoreText
import SwiftUI
#if canImport(UIKit)
import UIKit
typealias PlatformColor = UIColor
typealias PlatformFont = UIFont
#else
import AppKit
typealias PlatformColor = NSColor
typealias PlatformFont = NSFont
#endif

public struct ThemeSpec: Equatable, Sendable {
    public struct Fonts: Equatable, Sendable {
        /// Family names, first choice first, as a CSS font stack lists them.
        public var sans: [String]
        public var mono: [String]
    }

    public enum Family: Sendable { case sans, mono }

    /// The Dynamic Type style a step grows and shrinks with.
    public enum Style: String, Sendable, CaseIterable {
        case largeTitle, title, title2, title3, headline, subheadline, body, callout, footnote, caption, caption2

        var textStyle: Font.TextStyle {
            switch self {
            case .largeTitle: .largeTitle
            case .title: .title
            case .title2: .title2
            case .title3: .title3
            case .headline: .headline
            case .subheadline: .subheadline
            case .body: .body
            case .callout: .callout
            case .footnote: .footnote
            case .caption: .caption
            case .caption2: .caption2
            }
        }
    }

    /// A type step: size and line height in points, weight 100 to 900, tracking in points.
    public struct Step: Equatable, Sendable {
        public var family: Family
        public var size: CGFloat
        public var line: CGFloat
        public var weight: Int
        public var tracking: CGFloat
        public var style: Style
    }

    public struct TypeScale: Equatable, Sendable {
        public var body, callout, footnote, caption, headline, title3, title2, title, mono, display: Step
    }

    public struct Space: Equatable, Sendable {
        public var s1, s2, s3, s4, s5, s6: CGFloat
    }

    /// Cards, controls (fields, buttons, chips), small marks (badges, keys).
    public struct Radii: Equatable, Sendable {
        public var card, control, small: CGFloat
    }

    /// Durations in seconds; curves as cubic Bézier control points.
    public struct Motion: Equatable, Sendable {
        public var fast, base, slow: Double
        public var ease: [Double]
        public var spring: [Double]
    }

    public struct Shadow: Equatable, Sendable {
        public var x, y, blur, spread: CGFloat
        public var rgb: UInt32
        public var alpha: Double
    }

    public struct Palette: Equatable, Sendable {
        public var page, surface, tile, ink, ink2, ink3, line, line2, focus: UInt32
        public var accent, accentInk, accentBg: UInt32
        /// A primary button and a chosen slot: the brand colour, ink unless the theme names one.
        public var primary, primaryInk: UInt32
        public var good, goodBg, warn, warnBg, bad, badBg, info, infoBg, star: UInt32
        public var series: [UInt32]
        /// A resting card's shadow, and a lifted one's (a popover, a featured plan).
        public var rest, lifted: [Shadow]
        /// The strongest tint a heatmap cell gets, so its text stays readable.
        public var heatMax: Double
    }

    public var fonts: Fonts
    public var type: TypeScale
    public var space: Space
    public var radius: Radii
    public var motion: Motion
    public var light, dark, mono: Palette
}

// MARK: - Reading a theme (DTCG)

public struct ThemeError: Error, CustomStringConvertible {
    public let description: String
    init(_ d: String) { description = d }
}

extension ThemeSpec {
    /// A theme from a W3C Design Tokens file (spec/theme.tokens.json's shape):
    /// colour, shadow and heat per mode, aliases followed. Throws, naming the
    /// token, when one is missing or has the wrong type.
    public init(dtcg data: Data) throws {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ThemeError("a theme is a JSON object") }
        let get = Tokens.resolver(root)
        func families(_ k: String) throws -> [String] {
            let v = try get("font.\(k)")
            return (v as? [Any])?.map { "\($0)" } ?? ["\(v)"]
        }
        let fonts = Fonts(sans: try families("sans"), mono: try families("mono"))
        func step(_ k: String) throws -> Step {
            guard let v = try get("type.\(k)") as? [String: Any] else { throw ThemeError("type.\(k): not a typography value") }
            let fam = v["fontFamily"].flatMap { ($0 as? [Any])?.map { "\($0)" } }
            let size = try Tokens.dimension(v["fontSize"], "type.\(k).fontSize")
            let line: CGFloat = if let r = v["lineHeight"] as? Double { (size * r).rounded() } else { try Tokens.dimension(v["lineHeight"], "type.\(k).lineHeight") }
            let names = ["regular": 400, "normal": 400, "medium": 500, "semi-bold": 600, "semibold": 600, "bold": 700]
            let weight = (v["fontWeight"] as? Double).map { Int($0) } ?? (v["fontWeight"] as? String).flatMap { names[$0] } ?? 400
            let tracking = v["letterSpacing"] == nil ? 0 : try Tokens.dimension(v["letterSpacing"], "type.\(k).letterSpacing")
            let ext = (((root["type"] as? [String: Any])?[k] as? [String: Any])?["$extensions"] as? [String: Any])?["com.morphscreen"] as? [String: Any]
            let style = (ext?["apple"] as? String).flatMap(Style.init(rawValue:)) ?? .body
            return Step(family: fam == fonts.mono ? .mono : .sans, size: size, line: line, weight: weight, tracking: tracking, style: style)
        }
        self.fonts = fonts
        type = TypeScale(body: try step("body"), callout: try step("callout"), footnote: try step("footnote"), caption: try step("caption"), headline: try step("headline"),
                         title3: try step("title3"), title2: try step("title2"), title: try step("title"), mono: try step("mono"), display: try step("display"))
        func px(_ p: String) throws -> CGFloat { try Tokens.dimension(get(p), p) }
        space = Space(s1: try px("space.s1"), s2: try px("space.s2"), s3: try px("space.s3"), s4: try px("space.s4"), s5: try px("space.s5"), s6: try px("space.s6"))
        radius = Radii(card: try px("radius.card"), control: try px("radius.control"), small: try px("radius.small"))
        func ms(_ p: String) throws -> Double { try Tokens.duration(get(p), p) / 1000 }
        func curve(_ p: String) throws -> [Double] {
            guard let c = try get(p) as? [Double], c.count == 4 else { throw ThemeError("\(p): not a cubic Bézier") }
            return c
        }
        motion = Motion(fast: try ms("motion.fast"), base: try ms("motion.base"), slow: try ms("motion.slow"), ease: try curve("motion.ease"), spring: try curve("motion.spring"))
        func palette(_ m: String) throws -> Palette {
            func c(_ r: String) throws -> UInt32 { try Tokens.color(get("color.\(m).\(r)"), "color.\(m).\(r)").rgb }
            // A role older themes leave out: the one it falls back to.
            func optional(_ r: String, or other: String) throws -> UInt32 {
                ((root["color"] as? [String: Any])?[m] as? [String: Any])?[r] != nil ? try c(r) : try c(other)
            }
            guard let group = ((root["color"] as? [String: Any])?[m] as? [String: Any])?["series"] as? [String: Any] else { throw ThemeError("color.\(m).series: missing") }
            let series = try group.keys.filter { !$0.hasPrefix("$") }.sorted { (Int($0) ?? 0) < (Int($1) ?? 0) }.map { try c("series.\($0)") }
            guard series.count >= 2 else { throw ThemeError("color.\(m).series: at least two colours") }
            func shadows(_ p: String) throws -> [Shadow] {
                let v = try get(p)
                return try ((v as? [Any]) ?? [v]).map { s in
                    guard let s = s as? [String: Any] else { throw ThemeError("\(p): not a shadow") }
                    let col = try Tokens.color(s["color"], "\(p).color")
                    return Shadow(x: try Tokens.dimension(s["offsetX"], p), y: try Tokens.dimension(s["offsetY"], p), blur: try Tokens.dimension(s["blur"], p),
                                  spread: try Tokens.dimension(s["spread"] ?? 0.0, p), rgb: col.rgb, alpha: col.alpha)
                }
            }
            guard let heat = try get("heat.\(m)") as? Double else { throw ThemeError("heat.\(m): not a number") }
            return Palette(page: try c("page"), surface: try c("surface"), tile: try c("tile"), ink: try c("ink"), ink2: try c("ink2"), ink3: try c("ink3"),
                           line: try c("line"), line2: try c("line2"), focus: try c("focus"), accent: try c("accent"), accentInk: try c("accentInk"), accentBg: try c("accentBg"),
                           primary: try optional("primary", or: "ink"), primaryInk: try optional("primaryInk", or: "page"),
                           good: try c("good"), goodBg: try c("goodBg"), warn: try c("warn"), warnBg: try c("warnBg"), bad: try c("bad"), badBg: try c("badBg"),
                           info: try c("info"), infoBg: try c("infoBg"), star: try c("star"), series: series,
                           rest: try shadows("shadow.\(m).rest"), lifted: try shadows("shadow.\(m).lifted"), heatMax: heat)
        }
        light = try palette("light")
        dark = try palette("dark")
        mono = try palette("mono")
    }
}

/// The spacing scale and motion of the current theme, and the DTCG value readers.
enum Tokens {
    static var s1: CGFloat { Theme.current.space.s1 }
    static var s2: CGFloat { Theme.current.space.s2 }
    static var s3: CGFloat { Theme.current.space.s3 }
    static var s4: CGFloat { Theme.current.space.s4 }
    static var s5: CGFloat { Theme.current.space.s5 }
    static var s6: CGFloat { Theme.current.space.s6 }
    static var fast: Double { Theme.current.motion.fast }
    static var base: Double { Theme.current.motion.base }
    static var slow: Double { Theme.current.motion.slow }

    /// A token's value with aliases ("{color.light.accent}") followed.
    static func resolver(_ root: [String: Any]) -> (String) throws -> Any {
        func at(_ path: String) throws -> Any {
            var node: Any = root
            for part in path.split(separator: ".") {
                guard let o = node as? [String: Any], let next = o[String(part)] else { throw ThemeError("no token at \(path)") }
                node = next
            }
            guard let o = node as? [String: Any], let v = o["$value"] else { throw ThemeError("\(path) is a group, not a token") }
            return v
        }
        func resolve(_ v: Any, _ seen: [String]) throws -> Any {
            if let s = v as? String, s.hasPrefix("{"), s.hasSuffix("}") {
                let p = String(s.dropFirst().dropLast())
                if seen.contains(p) { throw ThemeError("alias loop: \((seen + [p]).joined(separator: " -> "))") }
                return try resolve(at(p), seen + [p])
            }
            if let a = v as? [Any] { return try a.map { try resolve($0, seen) } }
            if let o = v as? [String: Any] { return try o.mapValues { try resolve($0, seen) } }
            return v
        }
        return { path in try resolve(at(path), [path]) }
    }

    static func color(_ v: Any?, _ at: String) throws -> (rgb: UInt32, alpha: Double) {
        if let s = v as? String, s.hasPrefix("#"), s.count == 7 || s.count == 9, let n = UInt64(s.dropFirst(), radix: 16) {
            return s.count == 7 ? (UInt32(n), 1) : (UInt32(n >> 8), Double(n & 0xFF) / 255)
        }
        if let o = v as? [String: Any] {
            let alpha = o["alpha"] as? Double ?? 1
            if let hex = o["hex"] as? String { return (try color(hex, at).rgb, alpha) }
            if (o["colorSpace"] as? String ?? "srgb") == "srgb", let c = o["components"] as? [Double], c.count == 3 {
                let b = c.map { UInt32(max(0, min(255, ($0 * 255).rounded()))) }
                return (b[0] << 16 | b[1] << 8 | b[2], alpha)
            }
        }
        throw ThemeError("\(at): not an sRGB colour")
    }

    static func dimension(_ v: Any?, _ at: String) throws -> CGFloat {
        if let n = v as? Double { return n }
        if let o = v as? [String: Any], let n = o["value"] as? Double { return o["unit"] as? String == "rem" ? n * 16 : n }
        if let s = (v as? String)?.trimmingCharacters(in: .whitespaces) {
            if s.hasSuffix("rem"), let n = Double(s.dropLast(3)) { return n * 16 }
            if let n = Double(s.hasSuffix("px") ? String(s.dropLast(2)) : s) { return n }
        }
        throw ThemeError("\(at): not a dimension")
    }

    static func duration(_ v: Any?, _ at: String) throws -> Double {
        if let o = v as? [String: Any], let n = o["value"] as? Double { return o["unit"] as? String == "s" ? n * 1000 : n }
        if let s = (v as? String)?.trimmingCharacters(in: .whitespaces) {
            if s.hasSuffix("ms"), let n = Double(s.dropLast(2)) { return n }
            if s.hasSuffix("s"), let n = Double(s.dropLast()) { return n * 1000 }
        }
        throw ThemeError("\(at): not a duration")
    }
}

// MARK: - Faces

/// The faces a theme names, resolved once each: IBM Plex Sans and Mono ship in
/// this package (Fonts/, SIL Open Font License); system names map to the
/// system face; any other family is used when the app has it.
enum Faces {
    enum Face: Hashable {
        case plexSans, plexMono, system(Font.Design), named(String)
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var registered = false
    nonisolated(unsafe) private static var chosen: [[String]: Face] = [:]
    nonisolated(unsafe) private static var natural: [String: CGFloat] = [:]

    static func register() {
        lock.lock()
        defer { lock.unlock() }
        guard !registered else { return }
        registered = true
        for f in ["IBMPlexSansVar-Roman", "IBMPlexMono-Regular", "IBMPlexMono-SemiBold"] {
            if let url = Bundle.module.url(forResource: f, withExtension: "ttf", subdirectory: "Fonts") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }

    static func face(_ families: [String]) -> Face {
        lock.lock()
        if let f = chosen[families] { lock.unlock(); return f }
        lock.unlock()
        register()
        var pick: Face = .system(.default)
        for name in families {
            switch name.lowercased() {
            case "ibm plex sans": pick = .plexSans
            case "ibm plex mono": pick = .plexMono
            case "system-ui", "ui-sans-serif", "-apple-system", "blinkmacsystemfont", "sans-serif", "sf pro", "sf pro text": pick = .system(.default)
            case "ui-monospace", "monospace", "sfmono-regular", "sf mono", "menlo": pick = .system(.monospaced)
            case "ui-serif", "serif", "new york": pick = .system(.serif)
            case "ui-rounded": pick = .system(.rounded)
            default:
                guard PlatformFont(name: name, size: 12) != nil || installed(family: name) else { continue }
                pick = .named(name)
            }
            break
        }
        lock.lock()
        chosen[families] = pick
        lock.unlock()
        return pick
    }

    private static func installed(family: String) -> Bool {
        let d = CTFontDescriptorCreateWithAttributes([kCTFontFamilyNameAttribute: family] as CFDictionary)
        return CTFontDescriptorCreateMatchingFontDescriptor(d, nil) != nil
    }

    private static func swiftWeight(_ w: Int) -> Font.Weight {
        switch w {
        case ..<250: .ultraLight
        case ..<350: .light
        case ..<475: .regular
        case ..<575: .medium
        case ..<675: .semibold
        case ..<775: .bold
        default: .heavy
        }
    }

    /// The font for a step, scaling with Dynamic Type from the step's size.
    static func font(_ s: ThemeSpec.Step, weight: Int? = nil, families: [String]) -> Font {
        let w = weight ?? s.weight
        let style = s.style.textStyle
        switch face(families) {
        case .plexSans: return .custom("IBMPlexSansVar-Regular", size: s.size, relativeTo: style).weight(swiftWeight(w))
        case .plexMono: return .custom(w >= 550 ? "IBMPlexMono-SmBld" : "IBMPlexMono", size: s.size, relativeTo: style)
        case let .named(n): return .custom(n, size: s.size, relativeTo: style).weight(swiftWeight(w))
        case let .system(design):
            #if canImport(UIKit)
            let size = UIFontMetrics(forTextStyle: uiStyle(s.style)).scaledValue(for: s.size)
            #else
            let size = s.size
            #endif
            return .system(size: size, weight: swiftWeight(w), design: design)
        }
    }

    #if canImport(UIKit)
    private static func uiStyle(_ s: ThemeSpec.Style) -> UIFont.TextStyle {
        switch s {
        case .largeTitle: .largeTitle
        case .title: .title1
        case .title2: .title2
        case .title3: .title3
        case .headline: .headline
        case .subheadline: .subheadline
        case .body: .body
        case .callout: .callout
        case .footnote: .footnote
        case .caption: .caption1
        case .caption2: .caption2
        }
    }
    #endif

    /// How tall a line of this face is at this size with no added spacing.
    static func naturalLine(_ s: ThemeSpec.Step, families: [String]) -> CGFloat {
        let face = face(families)
        let key = "\(face)|\(s.size)"
        lock.lock()
        if let n = natural[key] { lock.unlock(); return n }
        lock.unlock()
        let ct: CTFont = switch face {
        case .plexSans: CTFontCreateWithName("IBMPlexSansVar-Regular" as CFString, s.size, nil)
        case .plexMono: CTFontCreateWithName("IBMPlexMono" as CFString, s.size, nil)
        case let .named(n): CTFontCreateWithName(n as CFString, s.size, nil)
        case .system: PlatformFont.systemFont(ofSize: s.size) as CTFont
        }
        let n = CTFontGetAscent(ct) + CTFontGetDescent(ct) + CTFontGetLeading(ct)
        lock.lock()
        natural[key] = n
        lock.unlock()
        return n
    }

    static func reset() {
        lock.lock()
        chosen = [:]
        natural = [:]
        lock.unlock()
    }
}

// MARK: - The theme in use

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255, opacity: alpha)
    }

    /// One colour role, picked from the current theme's palette for the scheme
    /// when drawn: mono when the app asks for it, else light or dark.
    static func token(_ pick: @escaping (ThemeSpec.Palette) -> UInt32) -> Color {
        func pc(_ h: UInt32) -> PlatformColor {
            PlatformColor(red: CGFloat((h >> 16) & 0xFF) / 255, green: CGFloat((h >> 8) & 0xFF) / 255, blue: CGFloat(h & 0xFF) / 255, alpha: 1)
        }
        #if canImport(UIKit)
        return Color(UIColor { pc(pick(Theme.palette(dark: $0.userInterfaceStyle == .dark))) })
        #else
        return Color(NSColor(name: nil) { pc(pick(Theme.palette(dark: $0.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua))) })
        #endif
    }
}

public enum Theme {
    /// The theme every answer draws with. Set it with `use` before the first
    /// answer shows; colours follow at once, sizes on the next layout.
    nonisolated(unsafe) public private(set) static var current: ThemeSpec = .standard

    public static func use(_ spec: ThemeSpec) {
        current = spec
        Faces.reset()
    }

    /// An app's own theme, as a W3C Design Tokens file (spec/theme.tokens.json's shape).
    public static func use(dtcg: Data) throws {
        use(try ThemeSpec(dtcg: dtcg))
    }

    /// The grayscale palette instead of light and dark (the web's data-theme="mono").
    /// Colours are resolved when drawn, so a change shows on the next redraw.
    nonisolated(unsafe) public static var monochrome = false

    static func palette(dark: Bool) -> ThemeSpec.Palette {
        monochrome ? current.mono : dark ? current.dark : current.light
    }

    public static let page = Color.token { $0.page }
    public static let surface = Color.token { $0.surface }
    public static let tile = Color.token { $0.tile }
    public static let ink = Color.token { $0.ink }
    public static let ink2 = Color.token { $0.ink2 }
    public static let ink3 = Color.token { $0.ink3 }
    public static let line = Color.token { $0.line }
    public static let line2 = Color.token { $0.line2 }
    public static let focus = Color.token { $0.focus }
    /// What can be pressed or is chosen, focus, the first series.
    public static let accent = Color.token { $0.accent }
    /// Text and marks on a filled accent.
    public static let accentInk = Color.token { $0.accentInk }
    /// The accent's light tint (a chosen chip, an info callout).
    public static let accentBg = Color.token { $0.accentBg }
    /// A primary button and a chosen slot (the brand colour; ink by default).
    public static let primary = Color.token { $0.primary }
    /// Text on primary.
    public static let primaryInk = Color.token { $0.primaryInk }
    public static let good = Color.token { $0.good }
    public static let goodBg = Color.token { $0.goodBg }
    public static let warn = Color.token { $0.warn }
    public static let warnBg = Color.token { $0.warnBg }
    public static let bad = Color.token { $0.bad }
    public static let badBg = Color.token { $0.badBg }
    public static let info = Color.token { $0.info }
    public static let infoBg = Color.token { $0.infoBg }
    public static let star = Color.token { $0.star }
    /// Chart series, in order.
    public static let series: [Color] = (0..<8).map { i in Color.token { $0.series[i % $0.series.count] } }

    /// Cards.
    public static var radius: CGFloat { current.radius.card }
    /// Fields, buttons, chips.
    public static var radiusControl: CGFloat { current.radius.control }
    /// Badges, keys, small marks.
    public static var radiusSmall: CGFloat { current.radius.small }

    /// (foreground, background) for a tone.
    public static func tone(_ t: String?) -> (Color, Color) {
        switch t {
        case "success": return (good, goodBg)
        case "warning": return (warn, warnBg)
        case "danger": return (bad, badBg)
        case "info": return (info, infoBg)
        default: return (ink2, tile)
        }
    }

    // Type: each step's face, size and weight, scaling with Dynamic Type.
    public typealias StepKey = KeyPath<ThemeSpec.TypeScale, ThemeSpec.Step>
    public static func font(_ k: StepKey, weight: Int? = nil) -> Font {
        let s = current.type[keyPath: k]
        return Faces.font(s, weight: weight, families: s.family == .mono ? current.fonts.mono : current.fonts.sans)
    }
    /// The space SwiftUI adds between lines so a step's lines are its line height apart.
    static func lineSpacing(_ k: StepKey) -> CGFloat {
        let s = current.type[keyPath: k]
        return max(0, s.line - Faces.naturalLine(s, families: s.family == .mono ? current.fonts.mono : current.fonts.sans))
    }
    public static var body: Font { font(\.body) }
    public static var callout: Font { font(\.callout) }
    public static var footnote: Font { font(\.footnote) }
    public static var caption: Font { font(\.caption) }
    public static var headline: Font { font(\.headline) }
    public static var title3: Font { font(\.title3) }
    public static var title2: Font { font(\.title2) }
    public static var title: Font { font(\.title) }
    public static var mono: Font { font(\.mono) }
    public static var display: Font { font(\.display) }
}

extension View {
    /// A type step all at once: face, size, weight, tracking and line height.
    func type(_ k: Theme.StepKey, weight: Int? = nil) -> some View {
        font(Theme.font(k, weight: weight)).tracking(Theme.current.type[keyPath: k].tracking).lineSpacing(Theme.lineSpacing(k))
    }

    /// A resting card's shadow (or a lifted one's), from the palette in use.
    func depth(lifted: Bool = false, in shape: some Shape) -> some View {
        modifier(Depth(lifted: lifted, shape: AnyShape(shape)))
    }
}

struct Depth: ViewModifier {
    let lifted: Bool
    let shape: AnyShape
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let p = Theme.palette(dark: scheme == .dark)
        let shadows = lifted ? p.lifted : p.rest
        content.background {
            ZStack {
                ForEach(Array(shadows.enumerated()), id: \.offset) { _, s in
                    // CSS blur is twice SwiftUI's radius; spread grows or shrinks the shape.
                    shape.fill(Color.black)
                        .padding(-s.spread)
                        .shadow(color: Color(hex: s.rgb, alpha: s.alpha), radius: s.blur / 2, x: s.x, y: s.y)
                }
            }
            // Only the shadow shows, never the shape that casts it.
            .mask { ZStack { Rectangle().padding(-200); shape.blendMode(.destinationOut) }.compositingGroup() }
            .allowsHitTesting(false)
        }
    }
}
