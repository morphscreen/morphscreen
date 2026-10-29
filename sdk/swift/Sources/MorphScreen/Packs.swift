// The component packs (spec/packs): data, commerce, scheduling, media, docs,
// inputs, and the device pack's second set. Same rules as the core's HTML;
// device features use the platform's own pickers and players.

import AVFoundation
import AVKit
import SwiftUI
#if os(iOS)
import ContactsUI
import EventKitUI
#endif

let packComponents: Set<String> = [
    "KeyValue", "Timeline", "Gauge", "Heatmap", "Funnel", "Sparkline", "Tree", "Product", "Plan", "Cart", "Rating", "Compare", "Price", "Calendar", "Event",
    "TimeSlots", "Agenda", "Countdown", "Video", "Audio", "Embed", "Carousel", "Code", "Diff", "Math", "FileTree", "Citation", "RatingInput", "Combobox", "Time",
    "ToggleGroup", "Stepper", "Signature", "Contact", "AddToCalendar", "Share", "VoiceNote", "QR", "Quiz", "Flashcards", "Poll", "Checklist", "WhatIf",
]

struct PackView: View {
    let node: UINode

    var body: some View {
        switch node.type {
        case "KeyValue": KeyValueView(node: node)
        case "Timeline": TimelineList(node: node)
        case "Gauge": GaugeView(node: node)
        case "Heatmap": HeatmapView(node: node)
        case "Funnel": FunnelView(node: node)
        case "Sparkline": SparklineView(node: node)
        case "Tree", "FileTree": PathTree(node: node)
        case "Product": ProductView(node: node)
        case "Plan": PlanView(node: node)
        case "Cart": CartView(node: node)
        case "Rating": RatingView(value: Double(node.attr("value") ?? "") ?? 0, max: Double(node.attr("max") ?? "") ?? 5, count: node.attr("count"))
        case "Compare": CompareView(node: node)
        case "Price": PriceView(value: node.attr("value") ?? "", was: node.attr("was"), period: node.attr("period"), note: node.attr("note"))
        case "Calendar": CalendarView(node: node)
        case "Event": EventView(node: node)
        case "Agenda": AgendaView(node: node)
        case "Countdown": CountdownView(node: node)
        case "Video": VideoBlock(node: node)
        case "Audio": AudioBlock(node: node)
        case "Embed": EmbedView(node: node)
        case "Carousel": CarouselView(node: node)
        case "Code", "Diff": CodeFileView(node: node)
        case "Math": MathView(node: node)
        case "Citation": CitationView(node: node)
        case "AddToCalendar": AddToCalendarButton(node: node)
        case "Share": ShareButton(node: node)
        case "QR": QRView(node: node)
        case "Quiz": QuizView(node: node)
        case "Flashcards": FlashcardsView(node: node)
        case "Poll": PollView(node: node)
        case "Checklist": ChecklistView(node: node)
        case "WhatIf": WhatIfView(node: node)
        default: PackField(node: node)
        }
    }
}

// MARK: - Shared pieces

private func caption(_ t: String?) -> some View {
    Group { if let t, !t.isEmpty { Text(t).font(.subheadline.weight(.semibold)) } }
}

private func tableData(_ node: UINode) -> (columns: [String], rows: [[String]]) {
    if case let .table(c, r) = node.data { return (c, r) }
    return ([], [])
}

private func listData(_ node: UINode) -> [[Span]] {
    if case let .list(items) = node.data { return items }
    return []
}

/// "2026-10-20T18:00" as "20 Oct 2026, 18:00"; anything else as written.
func readableWhen(_ s: String) -> String {
    let t = s.trimmingCharacters(in: .whitespaces)
    let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    let c = Array(t)
    guard c.count >= 10, c[4] == "-", c[7] == "-", let y = Int(String(c[0..<4])), let m = Int(String(c[5..<7])), let d = Int(String(c[8..<10])), (1...12).contains(m) else { return t }
    var out = "\(d) \(months[m - 1]) \(y)"
    if c.count >= 16, c[10] == "T" || c[10] == " ", c[13] == ":" { out += ", " + String(c[11..<16]) }
    return out
}

/// A date-time as the core and the model write it, in the user's time zone.
func parseWhen(_ s: String) -> Date? {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    for format in ["yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd HH:mm", "yyyy-MM-dd"] {
        f.dateFormat = format
        if let d = f.date(from: s.trimmingCharacters(in: .whitespaces)) { return d }
    }
    return nil
}

/// Paths ("a > b" or "src/app.ts") as an indented tree.
struct TreeEntry: Identifiable {
    let id: String
    let name: String
    let depth: Int
    let folder: Bool
}

func treeEntries(_ paths: [[String]]) -> [TreeEntry] {
    var out: [TreeEntry] = []
    var seen = Set<String>()
    for p in paths {
        for depth in p.indices {
            let key = p[0...depth].joined(separator: "\u{1}")
            guard seen.insert(key).inserted else { continue }
            let folder = depth < p.count - 1 || p[depth].hasSuffix("/")
            out.append(TreeEntry(id: key, name: p[depth], depth: depth, folder: folder))
        }
    }
    return out
}

// MARK: - data

struct KeyValueView: View {
    let node: UINode
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            caption(node.attr("title"))
            // A key column no wider than 170 points (a long key wraps in it rather
            // than squeezing its value); narrow, each key above its value, as on the web.
            let rows = tableData(node).rows
            ViewThatFits(in: .horizontal) {
                Grid(alignment: .leading, horizontalSpacing: 20, verticalSpacing: 8) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                        GridRow {
                            inlineText(parseInline(r.first ?? "")).foregroundColor(Theme.ink3).fixedSize(horizontal: false, vertical: true).frame(maxWidth: 170, alignment: .leading)
                            inlineText(parseInline(r.dropFirst().joined(separator: " · "))).monospacedDigit().fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .frame(minWidth: 360, idealWidth: 360, maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                        VStack(alignment: .leading, spacing: 2) {
                            inlineText(parseInline(r.first ?? "")).foregroundColor(Theme.ink3).fixedSize(horizontal: false, vertical: true)
                            inlineText(parseInline(r.dropFirst().joined(separator: " · "))).monospacedDigit().fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            .font(.callout)
        }
    }
}

struct TimelineList: View {
    let node: UINode
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            caption(node.attr("title"))
            // The date column is as wide as its longest date, so none of them splits.
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 10) {
                ForEach(Array(listData(node).enumerated()), id: \.offset) { _, item in
                    let (when, what) = timelineParts(plainText(item))
                    GridRow(alignment: .firstTextBaseline) {
                        Text(keepIDs(when)).font(.footnote).monospacedDigit().foregroundColor(Theme.ink3)
                        Circle().fill(Theme.ink).frame(width: 7, height: 7)
                        inlineText(parseInline(what)).fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}

/// "2021: First customers" as ("2021", "First customers").
func timelineParts(_ text: String) -> (String, String) {
    guard let r = text.range(of: ": "), text.distance(from: text.startIndex, to: r.lowerBound) <= 32 else { return ("", text) }
    return (String(text[..<r.lowerBound]), String(text[r.upperBound...]))
}

struct GaugeView: View {
    let node: UINode
    var body: some View {
        let lo = Double(node.attr("min") ?? "") ?? 0
        let hiRaw = Double(node.attr("max") ?? "") ?? 100
        let hi = hiRaw > lo ? hiRaw : lo + 100
        let v = chartNumber(node.attr("value") ?? "") ?? lo
        let f = min(max((v - lo) / (hi - lo), 0), 1)
        let tone = node.attr("tone")
        let color = tone == nil || tone == "neutral" ? Theme.ink : Theme.tone(tone).0
        VStack(spacing: 2) {
            ZStack(alignment: .bottom) {
                Arc(fraction: 1).stroke(Theme.line, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                Arc(fraction: f).stroke(color, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(node.attr("value") ?? "").font(.title2.weight(.semibold)).monospacedDigit()
                    if let u = node.attr("unit") { Text(u).font(.caption).foregroundColor(Theme.ink3) }
                }
            }
            .frame(width: 150, height: 80)
            HStack { Text(numberText(lo)); Spacer(); Text(numberText(hi)) }.font(.caption).foregroundColor(Theme.ink3).frame(width: 160)
            Text(node.attr("label") ?? "").font(.footnote.weight(.medium)).foregroundColor(Theme.ink2)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(node.attr("label") ?? "")
        .accessibilityValue("\(node.attr("value") ?? "") of \(numberText(hi))")
    }

    private func numberText(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(v) }
}

/// The top half of a circle, filled to `fraction` from the left.
struct Arc: Shape {
    var fraction: Double
    func path(in r: CGRect) -> Path {
        var p = Path()
        let radius = min(r.width / 2, r.height) - 6
        p.addArc(center: CGPoint(x: r.midX, y: r.maxY - 4), radius: radius, startAngle: .degrees(180), endAngle: .degrees(180 + 180 * fraction), clockwise: false)
        return p
    }
}

struct HeatmapView: View {
    let node: UINode
    @Environment(\.colorScheme) private var scheme
    /// The strongest tint a cell gets in this palette, so its text stays readable.
    private var heatMax: Double { Theme.palette(dark: scheme == .dark).heatMax }

    var body: some View {
        let (cols, rows) = tableData(node)
        let values = rows.flatMap { $0.dropFirst().compactMap(chartNumber) }
        let lo = values.min() ?? 0, hi = values.max() ?? 1
        VStack(alignment: .leading, spacing: 10) {
            caption(node.attr("title"))
            ScrollView(.horizontal, showsIndicators: false) {
                Grid(horizontalSpacing: 2, verticalSpacing: 2) {
                    GridRow {
                        ForEach(Array(cols.enumerated()), id: \.offset) { _, c in Text(c).font(.caption).foregroundColor(Theme.ink3) }
                    }
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                        GridRow {
                            Text(r.first ?? "").font(.caption).foregroundColor(Theme.ink3).gridColumnAlignment(.leading)
                            ForEach(Array(r.dropFirst().enumerated()), id: \.offset) { _, c in
                                let f = hi > lo ? ((chartNumber(c) ?? lo) - lo) / (hi - lo) : 0
                                Text(c).font(.caption).monospacedDigit()
                                    .foregroundColor(Theme.ink)
                                    .frame(minWidth: 52, minHeight: 30)
                                    // Capped so the ink stays readable on the darkest cell.
                                    .background(Theme.series[0].opacity(0.06 + f * (heatMax - 0.06)))
                            }
                        }
                    }
                }
            }
        }
    }
}

struct FunnelView: View {
    let node: UINode
    var body: some View {
        let rows = tableData(node).rows
        let first = rows.first.flatMap { $0.count > 1 ? chartNumber($0[1]) : nil }.flatMap { $0 > 0 ? $0 : nil } ?? 1
        VStack(alignment: .leading, spacing: Tokens.s2) {
            caption(node.attr("title"))
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                    let raw = r.count > 1 ? r[1] : ""
                    let pct = min(max((chartNumber(raw) ?? 0) / first, 0), 1)
                    GridRow {
                        Text(r.first ?? "").font(.callout).fixedSize(horizontal: false, vertical: true)
                        GeometryReader { g in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4).fill(Theme.tile)
                                RoundedRectangle(cornerRadius: 4).fill(Theme.series[0]).frame(width: g.size.width * pct)
                            }
                        }
                        .frame(height: 22)
                        Text(raw).font(.callout).monospacedDigit().gridColumnAlignment(.trailing)
                        Text("\(pct * 100 < 10 ? String(format: "%.1f", pct * 100) : String(Int((pct * 100).rounded())))%").font(.caption).foregroundColor(Theme.ink3).monospacedDigit()
                    }
                }
            }
        }
    }
}

struct SparklineView: View {
    let node: UINode
    var body: some View {
        let values = options(node.attr("values")).compactMap(chartNumber)
        let change = node.attr("change") ?? ""
        HStack(spacing: Tokens.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(node.attr("label") ?? "").font(.footnote).foregroundColor(Theme.ink2)
                if let v = node.attr("value") { Text(v).font(.title3.weight(.semibold)).monospacedDigit() }
                if !change.isEmpty {
                    Text(change).font(.caption.weight(.semibold)).foregroundColor(change.hasPrefix("-") || change.hasPrefix("−") ? Theme.bad : Theme.good)
                }
            }
            Spacer(minLength: 8)
            Canvas { ctx, size in
                guard values.count > 1, let lo = values.min(), let hi = values.max() else { return }
                var p = Path()
                for (i, v) in values.enumerated() {
                    let x = size.width * Double(i) / Double(values.count - 1)
                    let y = hi > lo ? size.height - (v - lo) / (hi - lo) * (size.height - 4) - 2 : size.height / 2
                    i == 0 ? p.move(to: CGPoint(x: x, y: y)) : p.addLine(to: CGPoint(x: x, y: y))
                }
                ctx.stroke(p, with: .color(Theme.series[0]), style: StrokeStyle(lineWidth: 1.6, lineJoin: .round))
            }
            .frame(width: 96, height: 32)
            .accessibilityLabel("Trend: \(options(node.attr("values")).joined(separator: ", "))")
        }
        .padding(.horizontal, Tokens.s4).padding(.vertical, Tokens.s3)
        .background(Theme.tile, in: RoundedRectangle(cornerRadius: Theme.radius))
    }
}

struct PathTree: View {
    let node: UINode
    var body: some View {
        let files = node.type == "FileTree"
        let paths: [[String]] = listData(node).map { item in
            let text = plainText(item).trimmingCharacters(in: CharacterSet(charactersIn: "` "))
            if files {
                var parts = text.split(separator: "/").map(String.init)
                for i in parts.indices where i < parts.count - 1 { parts[i] += "/" }
                if text.hasSuffix("/"), !parts.isEmpty, !parts[parts.count - 1].hasSuffix("/") { parts[parts.count - 1] += "/" }
                return parts
            }
            return text.components(separatedBy: " > ").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        }
        VStack(alignment: .leading, spacing: Tokens.s1) {
            caption(node.attr("title"))
            ForEach(treeEntries(paths)) { e in
                Text(e.name)
                    .font(files ? .system(.footnote, design: .monospaced) : .callout)
                    .fontWeight(e.folder ? .semibold : .regular)
                    .padding(.leading, CGFloat(e.depth) * 18)
                    .overlay(alignment: .leading) {
                        if e.depth > 0 { Rectangle().fill(Theme.line2).frame(width: 1).padding(.leading, CGFloat(e.depth) * 18 - 10) }
                    }
            }
        }
    }
}

// MARK: - commerce

struct RatingView: View {
    let value: Double
    let max: Double
    var count: String?

    var body: some View {
        let m = Swift.max(1, Swift.min(Int(max), 10))
        HStack(spacing: 6) {
            HStack(spacing: 1) {
                ForEach(0..<m, id: \.self) { k in
                    let fill = Swift.min(Swift.max(value - Double(k), 0), 1)
                    ZStack(alignment: .leading) {
                        Image(systemName: "star.fill").foregroundColor(Theme.line2)
                        Image(systemName: "star.fill").foregroundColor(Theme.warn).mask(alignment: .leading) {
                            GeometryReader { g in Rectangle().frame(width: g.size.width * fill) }
                        }
                    }
                    .font(.caption)
                }
            }
            Text(String(format: value == value.rounded() ? "%.0f" : "%.1f", value)).font(.footnote).monospacedDigit()
            if let count { Text("(\(count))").font(.footnote).foregroundColor(Theme.ink3) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(value) out of \(Int(max))")
    }
}

struct PriceView: View {
    let value: String
    let was: String?
    let period: String?
    let note: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(value).font(.title3.weight(.semibold)).monospacedDigit()
                if let was { Text(was).strikethrough().foregroundColor(Theme.ink3).font(.footnote) }
                if let period { Text(period).foregroundColor(Theme.ink3).font(.footnote) }
            }
            if let note { Text(note).font(.caption).foregroundColor(Theme.ink3) }
        }
    }
}

struct ProductView: View {
    let node: UINode
    @Environment(\.morphMedia) private var media
    @Environment(\.openURL) private var openURL
    @Environment(\.morphInTile) private var inTile

    var body: some View {
        let layout = inTile ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(alignment: .top, spacing: Tokens.s4))
        layout {
            if let src = node.attr("image"), let url = media.url(src) {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Theme.tile }
                    .frame(width: inTile ? nil : 96, height: 96)
                    .frame(maxWidth: inTile ? .infinity : nil)
                    .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                    .accessibilityLabel(node.attr("name") ?? "")
            }
            VStack(alignment: .leading, spacing: Tokens.s1) {
                Text(node.attr("name") ?? "").font(.headline)
                if let b = node.attr("badge") {
                    HStack(spacing: 5) {
                        Circle().fill(Theme.info).frame(width: 6, height: 6)
                        Text(b)
                    }
                    .font(.caption.weight(.semibold)).foregroundColor(Theme.info)
                    .padding(.horizontal, 7).frame(height: 20)
                    .background(Theme.infoBg, in: RoundedRectangle(cornerRadius: 4))
                }
                if let p = node.attr("price") { PriceView(value: p, was: node.attr("was"), period: nil, note: nil) }
                if let r = node.attr("rating"), let v = Double(r) { RatingView(value: v, max: 5, count: node.attr("count")) }
                if !node.spans.isEmpty { inlineText(node.spans).foregroundColor(Theme.ink2).fixedSize(horizontal: false, vertical: true) }
                // Its Buttons, under it: what the reader can do with it.
                let buttons = node.children.filter { $0.type == "Button" }
                if !buttons.isEmpty {
                    HStack(spacing: Tokens.s2) { ForEach(buttons) { ButtonView(node: $0) } }.padding(.top, Tokens.s1)
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { if let h = node.attr("href"), let url = URL(string: h), ["http", "https"].contains(url.scheme ?? "") { openURL(url) } }
    }
}

struct PlanView: View {
    let node: UINode
    var body: some View {
        let featured = node.flag("featured")
        VStack(alignment: .leading, spacing: Tokens.s2) {
            Text(node.attr("name") ?? "").font(.headline)
            HStack(alignment: .firstTextBaseline, spacing: Tokens.s1) {
                Text(node.attr("price") ?? "").font(.title.weight(.semibold)).monospacedDigit()
                if let p = node.attr("period") { Text(p).font(.footnote).foregroundColor(Theme.ink3) }
            }
            if let n = node.attr("note") { Text(n).font(.footnote).foregroundColor(Theme.ink3) }
            ForEach(Array(listData(node).enumerated()), id: \.offset) { _, f in
                HStack(alignment: .firstTextBaseline, spacing: Tokens.s2) {
                    Image(systemName: "checkmark").font(.caption.weight(.bold)).foregroundColor(Theme.good)
                    inlineText(f).font(.callout)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(Tokens.s4)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(featured ? Theme.ink : Theme.line, lineWidth: featured ? 2 : 1))
    }
}

struct CartView: View {
    let node: UINode
    var body: some View {
        let (cols, rows) = tableData(node)
        VStack(alignment: .leading, spacing: 10) {
            caption(node.attr("title"))
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                GridRow {
                    ForEach(Array(cols.enumerated()), id: \.offset) { k, c in
                        Text(c).font(.footnote).foregroundColor(Theme.ink3).gridColumnAlignment(k == 0 ? .leading : .trailing)
                    }
                }
                Divider().gridCellUnsizedAxes(.horizontal)
                ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                    GridRow { ForEach(Array(r.enumerated()), id: \.offset) { _, c in inlineText(parseInline(c)).font(.callout).monospacedDigit().fixedSize(horizontal: false, vertical: true) } }
                }
                if let total = node.attr("total") {
                    Divider().gridCellUnsizedAxes(.horizontal)
                    GridRow {
                        Text("Total").fontWeight(.semibold).gridCellColumns(max(cols.count - 1, 1)).gridColumnAlignment(.trailing)
                        Text(total).fontWeight(.semibold).monospacedDigit()
                    }
                }
            }
            if let n = node.attr("note") { Text(n).font(.caption).foregroundColor(Theme.ink3) }
        }
    }
}

struct CompareView: View {
    let node: UINode
    var body: some View {
        let (cols, rows) = tableData(node)
        VStack(alignment: .leading, spacing: 10) {
            caption(node.attr("title"))
            ScrollView(.horizontal, showsIndicators: false) {
                Grid(alignment: .leading, horizontalSpacing: 20, verticalSpacing: 8) {
                    GridRow { ForEach(Array(cols.enumerated()), id: \.offset) { _, c in Text(c).font(.footnote.weight(.semibold)).foregroundColor(Theme.ink3) } }
                    Divider().gridCellUnsizedAxes(.horizontal)
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                        GridRow {
                            ForEach(Array(r.enumerated()), id: \.offset) { k, c in
                                switch k == 0 ? "" : c.trimmingCharacters(in: .whitespaces).lowercased() {
                                case "yes", "y", "true", "✓", "✔", "x": Image(systemName: "checkmark").foregroundColor(Theme.good).accessibilityLabel("Yes")
                                case "no", "n", "false", "✗", "✘", "-", "—": Image(systemName: "minus").foregroundColor(Theme.ink3).accessibilityLabel("No")
                                default: inlineText(parseInline(c)).font(.callout).foregroundColor(k == 0 ? Theme.ink2 : Theme.ink)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - scheduling

struct CalendarView: View {
    let node: UINode
    @State private var width: CGFloat = 700
    var body: some View {
        let rows = tableData(node).rows
        let marked: [(DateComponents, String)] = rows.compactMap { r in
            guard let first = r.first, let d = parseWhen(first) else { return nil }
            return (Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: d), r.dropFirst().joined(separator: " · "))
        }
        let ym: (Int, Int) = {
            if let m = node.attr("month"), m.count >= 7, let y = Int(m.prefix(4)), let mo = Int(m.dropFirst(5).prefix(2)), (1...12).contains(mo) { return (y, mo) }
            if let f = marked.first, let y = f.0.year, let m = f.0.month { return (y, m) }
            return (2026, 1)
        }()
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        let first = cal.date(from: DateComponents(year: ym.0, month: ym.1, day: 1)) ?? Date()
        let len = cal.range(of: .day, in: .month, for: first)?.count ?? 30
        let lead = (cal.component(.weekday, from: first) + 5) % 7
        let cells: [Int?] = Array(repeating: nil, count: lead) + (1...len).map { $0 }
        let title = node.attr("title") ?? DateFormatter().monthSymbols[ym.1 - 1] + " \(ym.0)"
        // On a phone a day is too narrow for its events: a dot marks it and the
        // events are listed under the month, or named once if they're all the same.
        let narrow = (width - 12) / 7 < 64
        let shown = marked.filter { $0.0.year == ym.0 && $0.0.month == ym.1 }
        return VStack(alignment: .leading, spacing: Tokens.s2) {
            Text(title).font(.subheadline.weight(.semibold))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 2) {
                ForEach(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], id: \.self) { Text($0).font(.caption).foregroundColor(Theme.ink3) }
                ForEach(Array(cells.enumerated()), id: \.offset) { _, day in
                    let on = day.flatMap { d in marked.first { $0.0.year == ym.0 && $0.0.month == ym.1 && $0.0.day == d }?.1 }
                    VStack(alignment: .leading, spacing: 2) {
                        if let day { Text("\(day)").font(.caption).fontWeight(on == nil ? .regular : .semibold).foregroundColor(on == nil ? Theme.ink3 : Theme.info) }
                        if let on {
                            if narrow { Circle().fill(Theme.info).frame(width: 5, height: 5).padding(.top, 1) } else { Text(on).font(.caption).lineLimit(2) }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(Tokens.s1)
                    .frame(maxWidth: .infinity, minHeight: narrow ? 40 : 52, alignment: .topLeading)
                    .background(on == nil ? Color.clear : Theme.infoBg)
                    .overlay(Rectangle().stroke(day == nil ? Color.clear : Theme.line))
                }
            }
            if narrow {
                if shown.count > 1, shown.allSatisfy({ $0.1 == shown[0].1 }) {
                    HStack(spacing: Tokens.s2) {
                        Circle().fill(Theme.info).frame(width: 5, height: 5)
                        Text(shown[0].1).font(.footnote).foregroundColor(Theme.ink2)
                    }
                } else {
                    ForEach(Array(shown.enumerated()), id: \.offset) { _, e in
                        HStack(alignment: .firstTextBaseline, spacing: Tokens.s3) {
                            Text("\(e.0.day ?? 0) \(DateFormatter().shortMonthSymbols[ym.1 - 1])").font(.footnote.weight(.semibold)).monospacedDigit().foregroundColor(Theme.info).frame(width: 52, alignment: .leading)
                            Text(e.1).font(.footnote)
                        }
                    }
                }
            }
        }
        .background(GeometryReader { g in Color.clear.onAppear { width = g.size.width }.onChange(of: g.size.width) { width = $1 } })
    }
}

struct EventView: View {
    let node: UINode
    var body: some View {
        let tone = node.attr("tone")
        let start = node.attr("start") ?? ""
        let end = node.attr("end")
        let sameDay = end.map { $0.count >= 16 && start.count >= 16 && $0.prefix(10) == start.prefix(10) } ?? false
        let when = readableWhen(start) + (end.map { " – " + (sameDay ? String($0.dropFirst(11).prefix(5)) : readableWhen($0)) } ?? "")
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Circle().fill(tone == nil || tone == "neutral" ? Theme.ink3 : Theme.tone(tone).0).frame(width: 6, height: 6)
                Text(when).font(.caption).monospacedDigit().foregroundColor(Theme.ink3)
            }
            Text(node.attr("title") ?? "").fontWeight(.semibold)
            if let w = node.attr("where") { Text(w).font(.footnote).foregroundColor(Theme.ink2) }
            if !node.spans.isEmpty { inlineText(node.spans).font(.callout) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tokens.s4).padding(.vertical, Tokens.s3)
        .background(Theme.tile, in: RoundedRectangle(cornerRadius: Theme.radius))
    }
}

struct AgendaView: View {
    let node: UINode
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            caption(node.attr("title")).padding(.bottom, 6)
            // The time column is as wide as its longest time ("09:00–09:30").
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 0) {
                ForEach(Array(tableData(node).rows.enumerated()), id: \.offset) { k, r in
                    if k > 0 { Divider() }
                    GridRow(alignment: .firstTextBaseline) {
                        Text(keepIDs(r.first ?? "")).font(.callout).monospacedDigit().foregroundColor(Theme.ink3).padding(.vertical, Tokens.s2)
                        inlineText(parseInline(r.dropFirst().joined(separator: " · "))).fixedSize(horizontal: false, vertical: true).padding(.vertical, Tokens.s2).frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }
}

struct CountdownView: View {
    let node: UINode
    var body: some View {
        let target = parseWhen(node.attr("until") ?? "")
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            VStack(alignment: .leading, spacing: 2) {
                Text(node.attr("label") ?? "").font(.footnote).foregroundColor(Theme.ink2)
                Text(target.map { left($0.timeIntervalSince(ctx.date)) } ?? readableWhen(node.attr("until") ?? ""))
                    .font(.title3.weight(.semibold)).monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tokens.s4).padding(.vertical, Tokens.s3)
        .background(Theme.tile, in: RoundedRectangle(cornerRadius: Theme.radius))
    }

    private func left(_ s: TimeInterval) -> String {
        if s <= 0 { return "Now" }
        let t = Int(s)
        let (d, h, m, sec) = (t / 86400, t % 86400 / 3600, t % 3600 / 60, t % 60)
        return d > 0 ? "\(d)d \(h)h \(m)m" : String(format: "%02d:%02d:%02d", h, m, sec)
    }
}

// MARK: - media

/// Nothing streams until the user taps play.
struct VideoBlock: View {
    let node: UINode
    @Environment(\.morphMedia) private var media
    @State private var player: AVPlayer?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack {
                if let player {
                    VideoPlayer(player: player)
                } else {
                    Rectangle().fill(Color.black)
                    if let p = node.attr("poster"), let url = media.url(p) { AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.black } }
                    Button { start() } label: {
                        Image(systemName: "play.fill").font(.title2).foregroundColor(.white).padding(18).background(Circle().fill(.black.opacity(0.6)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Play \(node.attr("title") ?? "video")")
                }
            }
            .aspectRatio(16 / 9, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
            if node.attr("title") != nil || node.attr("caption") != nil {
                (Text(node.attr("title") ?? "").fontWeight(.semibold) + Text(node.attr("caption").map { " " + $0 } ?? "")).font(.footnote).foregroundColor(Theme.ink2)
            }
        }
    }

    private func start() {
        guard let s = node.attr("src"), let url = URL(string: s) else { return }
        let p = AVPlayer(url: url)
        player = p
        p.play()
    }
}

struct AudioBlock: View {
    let node: UINode
    @State private var player: AVPlayer?
    @State private var playing = false

    var body: some View {
        HStack(spacing: Tokens.s3) {
            Button {
                if player == nil, let s = node.attr("src"), let url = URL(string: s) { player = AVPlayer(url: url) }
                playing ? player?.pause() : player?.play()
                playing.toggle()
            } label: {
                Image(systemName: playing ? "pause.fill" : "play.fill").foregroundColor(Theme.surface).frame(width: 34, height: 34).background(Circle().fill(Theme.ink))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(playing ? "Pause" : "Play")
            Text(node.attr("title") ?? "Audio").fontWeight(.medium)
            Spacer()
        }
        .padding(10)
        .background(Theme.tile, in: RoundedRectangle(cornerRadius: Theme.radius))
    }
}

func embedHost(_ src: String) -> String? {
    guard let host = URL(string: src)?.host?.lowercased() else { return nil }
    if host.hasSuffix("youtube.com") || host == "youtu.be" { return "YouTube" }
    if host.hasSuffix("vimeo.com") { return "Vimeo" }
    if host == "open.spotify.com" { return "Spotify" }
    if host.hasSuffix("soundcloud.com") { return "SoundCloud" }
    return nil
}

/// Opens in the host's app or the browser; nothing loads here first.
struct EmbedView: View {
    let node: UINode
    @Environment(\.openURL) private var openURL

    var body: some View {
        let src = node.attr("src") ?? ""
        Button {
            if let url = URL(string: src), ["http", "https"].contains(url.scheme ?? "") { openURL(url) }
        } label: {
            HStack(spacing: Tokens.s3) {
                Image(systemName: "play.fill").font(.caption).foregroundColor(Theme.surface).frame(width: 26, height: 26).background(Circle().fill(Theme.ink))
                VStack(alignment: .leading, spacing: 2) {
                    Text(node.attr("title") ?? src).fontWeight(.semibold).foregroundColor(Theme.ink)
                    Text(embedHost(src).map { "Play on \($0)" } ?? src).font(.caption).foregroundColor(Theme.ink3)
                }
                Spacer()
            }
            .padding(14)
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line))
        }
        .buttonStyle(.plain)
    }
}

struct CarouselView: View {
    let node: UINode
    @Environment(\.morphMedia) private var media
    var body: some View {
        let images: [GalleryImage] = if case let .images(i) = node.data { i } else { [] }
        VStack(alignment: .leading, spacing: Tokens.s2) {
            caption(node.attr("title"))
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: Tokens.s2) {
                    ForEach(Array(images.enumerated()), id: \.offset) { _, img in
                        Group {
                            if let url = media.url(img.src) {
                                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Theme.tile }
                            } else {
                                Text(keepIDs(img.alt)).font(.footnote).foregroundColor(Theme.ink3).padding(Tokens.s2).frame(maxWidth: .infinity, maxHeight: .infinity).background(Theme.tile)
                            }
                        }
                            .containerRelativeFrame(.horizontal) { w, _ in w * 0.85 }
                            .frame(height: 240)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                            .accessibilityLabel(img.alt)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .frame(height: 240)
        }
    }
}

// MARK: - docs

struct CodeFileView: View {
    let node: UINode
    /// The block's width, so highlighted lines span it inside the sideways scroll.
    @State private var width: CGFloat = 0

    var body: some View {
        // The lines the core kept as written (older trees: a fenced block inside).
        let lines: [String] = if case let .lines(l) = node.data { l } else { plainText(node.children.first { $0.type == "code" }?.spans ?? []).components(separatedBy: "\n") }
        let marks = Set(options(node.attr("highlight")).compactMap { Int($0) })
        let diff = node.type == "Diff"
        VStack(alignment: .leading, spacing: Tokens.s2) {
            VStack(alignment: .leading, spacing: 0) {
                if let f = node.attr("file") {
                    Text(f).font(.system(.caption, design: .monospaced)).foregroundColor(Theme.ink2).padding(.horizontal, Tokens.s3).padding(.vertical, 6)
                    Divider()
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(lines.enumerated()), id: \.offset) { k, l in
                            let kind = diff ? (l.hasPrefix("+++") || l.hasPrefix("---") || l.hasPrefix("@@") ? "meta" : l.hasPrefix("+") ? "add" : l.hasPrefix("-") ? "del" : "") : (marks.contains(k + 1) ? "hl" : "")
                            HStack(spacing: Tokens.s3) {
                                if !diff { Text("\(k + 1)").foregroundColor(Theme.ink3).frame(width: 24, alignment: .trailing) }
                                // Code keeps its lines; the block scrolls sideways instead.
                                Text(l.isEmpty ? " " : l).fixedSize(horizontal: true, vertical: false).foregroundColor(kind == "add" ? Theme.good : kind == "del" ? Theme.bad : kind == "meta" ? Theme.ink3 : Theme.ink)
                            }
                            .padding(.horizontal, Tokens.s3).padding(.vertical, 1)
                            .frame(minWidth: width, alignment: .leading)
                            .background(kind == "add" ? Theme.goodBg : kind == "del" ? Theme.badBg : kind == "hl" ? Theme.warnBg : Color.clear)
                        }
                    }
                    .padding(.vertical, Tokens.s2)
                }
                .font(.system(.footnote, design: .monospaced))
                .textSelection(.enabled)
                .background(GeometryReader { g in Color.clear.onAppear { width = g.size.width }.onChange(of: g.size.width) { width = g.size.width } })
            }
            .background(Theme.tile, in: RoundedRectangle(cornerRadius: Theme.radius))
            Children(nodes: node.children.filter { $0.type != "code" })
        }
    }
}

struct MathView: View {
    let node: UINode
    var body: some View {
        let text: String = if case let .lines(l) = node.data, let first = l.first { first } else { node.attr("tex") ?? "" }
        VStack(alignment: .leading, spacing: 6) {
            Text(text).font(.system(.title3, design: .serif)).textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Tokens.s4).padding(.vertical, Tokens.s3)
                .background(Theme.tile, in: RoundedRectangle(cornerRadius: Theme.radius))
                .accessibilityLabel(node.attr("tex") ?? text)
            if let l = node.attr("label") { Text(l).font(.caption).foregroundColor(Theme.ink3) }
        }
    }
}

struct CitationView: View {
    let node: UINode
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.s2) {
            if !node.spans.isEmpty { inlineText(node.spans).foregroundColor(Theme.ink2).fixedSize(horizontal: false, vertical: true) }
            // Title, then source and date: on one line when they fit, under it when not.
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) { source; meta }
                VStack(alignment: .leading, spacing: 2) { source; meta }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tokens.s4).padding(.vertical, Tokens.s3)
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line))
    }

    @ViewBuilder private var source: some View {
        if let h = node.attr("href"), let url = URL(string: h), ["http", "https"].contains(url.scheme ?? "") {
            Button { openURL(url) } label: { Text(node.attr("title") ?? h).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true) }
                .buttonStyle(.plain).underline().font(.footnote.weight(.medium))
        } else {
            Text(node.attr("title") ?? "").font(.footnote.weight(.medium)).fixedSize(horizontal: false, vertical: true)
        }
    }

    private var meta: some View {
        Text(keepIDs([node.attr("source"), node.attr("date")].compactMap { $0 }.joined(separator: " · "))).font(.caption).foregroundColor(Theme.ink3)
    }
}

// MARK: - device, second set

struct ShareButton: View {
    let node: UINode
    var body: some View {
        let label = plainText(node.spans).isEmpty ? "Share" : plainText(node.spans)
        let text = node.attr("text") ?? ""
        Group {
            if let h = node.attr("href"), let url = URL(string: h) {
                ShareLink(item: url, message: text.isEmpty ? nil : Text(text)) { Text(label).modifier(SecondaryLabel()) }
            } else {
                ShareLink(item: text.isEmpty ? label : text) { Text(label).modifier(SecondaryLabel()) }
            }
        }
        .buttonStyle(.plain)
    }
}

struct AddToCalendarButton: View {
    let node: UINode
    @State private var editing = false

    var body: some View {
        let label = plainText(node.spans).isEmpty ? "Add to calendar" : plainText(node.spans)
        Button(label) { add() }
            .buttonStyle(Secondary())
        #if os(iOS)
            .sheet(isPresented: $editing) { EventEditor(node: node) }
        #endif
    }

    private func add() {
        #if os(iOS)
        editing = true
        #else
        // The system Calendar imports an .ics file.
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("event-\(node.id).ics")
        try? icsText(node).write(to: url, atomically: true, encoding: .utf8)
        NSWorkspace.shared.open(url)
        #endif
    }
}

/// The event as an iCalendar file.
func icsText(_ node: UINode) -> String {
    let stamp: (String) -> String = { s in
        let d = s.filter(\.isNumber)
        return d.count >= 12 ? String(d.prefix(8)) + "T" + String(d.dropFirst(8).prefix(4)) + "00" : String(d.prefix(8))
    }
    let clean: (String) -> String = { $0.replacingOccurrences(of: "\n", with: " ").replacingOccurrences(of: ",", with: "\\,").replacingOccurrences(of: ";", with: "\\;") }
    let start = stamp(node.attr("start") ?? "")
    let end = node.attr("end").map(stamp) ?? start
    var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MorphScreen//EN", "BEGIN:VEVENT", "UID:\(UUID().uuidString)", "DTSTART:\(start)", "DTEND:\(end)", "SUMMARY:\(clean(node.attr("title") ?? ""))"]
    if let w = node.attr("where") { lines.append("LOCATION:\(clean(w))") }
    if let n = node.attr("note") { lines.append("DESCRIPTION:\(clean(n))") }
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return lines.joined(separator: "\r\n")
}

#if os(iOS)
/// The system's event editor, filled in; it asks for nothing until saved.
struct EventEditor: UIViewControllerRepresentable {
    let node: UINode
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let store = EKEventStore()
        let event = EKEvent(eventStore: store)
        event.title = node.attr("title")
        event.location = node.attr("where")
        event.notes = node.attr("note")
        event.startDate = parseWhen(node.attr("start") ?? "") ?? Date()
        event.endDate = node.attr("end").flatMap(parseWhen) ?? event.startDate.addingTimeInterval(3600)
        let c = EKEventEditViewController()
        c.eventStore = store
        c.event = event
        c.editViewDelegate = context.coordinator
        return c
    }

    func updateUIViewController(_ c: EKEventEditViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: { dismiss() }) }

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let done: () -> Void
        init(done: @escaping () -> Void) { self.done = done }
        func eventEditViewController(_ c: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) { done() }
    }
}
#endif

struct QRView: View {
    let node: UINode
    var body: some View {
        let rows: [String] = if case let .lines(l) = node.data { l } else { [] }
        VStack(spacing: Tokens.s2) {
            Canvas { ctx, size in
                let n = CGFloat(rows.count + 8)
                let cell = min(size.width, size.height) / n
                ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white))
                for (y, r) in rows.enumerated() {
                    for (x, c) in r.enumerated() where c == "1" {
                        ctx.fill(Path(CGRect(x: (CGFloat(x) + 4) * cell, y: (CGFloat(y) + 4) * cell, width: cell + 0.3, height: cell + 0.3)), with: .color(.black))
                    }
                }
            }
            .frame(width: 200, height: 200)
            .accessibilityLabel("QR code: \(node.attr("value") ?? "")")
            if let l = node.attr("label") { Text(keepIDs(l)).font(.footnote.weight(.semibold)).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true) }
            // The code carries the value; the caption is one line, shortened in the
            // middle, and copies whole (so no break characters go into it).
            Text(node.attr("value") ?? "").font(.caption).foregroundColor(Theme.ink3).lineLimit(1).truncationMode(.middle).textSelection(.enabled)
        }
        .frame(maxWidth: 220)
    }
}

// MARK: - form fields from the packs

struct PackField: View {
    let node: UINode
    @Environment(FormState.self) private var form: FormState?
    @State private var text = ""
    @State private var chosen: Set<String> = []
    @State private var number = 0
    @State private var time = Date()
    @State private var stars = 0
    @State private var strokes: [[CGPoint]] = []
    @State private var recorder = VoiceRecorder()
    @State private var pickingContact = false

    private var key: String { fieldName(node) }
    private func set(_ v: FieldValue) { form?.values[key] = v }

    var body: some View {
        let label = node.attr("label") ?? ""
        Labeled(label: label, hint: node.attr("hint"), required: node.flag("required")) {
            switch node.type {
            case "TimeSlots", "ToggleGroup": chips
            case "RatingInput": starInput
            case "Combobox": combobox
            case "Time":
                DatePicker("", selection: $time, displayedComponents: .hourAndMinute).labelsHidden()
                    .onChange(of: time) {
                        let c = Calendar.current.dateComponents([.hour, .minute], from: time)
                        set(.text(String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)))
                    }
                    .onAppear {
                        if let v = node.attr("value"), let d = parseWhen("2000-01-01T" + v) { time = d }
                    }
            case "Stepper": stepper
            case "Signature": signature
            case "Contact": contact
            case "VoiceNote": voice
            default: EmptyView()
            }
        }
    }

    private var chips: some View {
        let multiple = node.type == "ToggleGroup" && node.flag("multiple")
        let opts = options(node.attr("options"))
        return FlowLayout {
            ForEach(opts, id: \.self) { o in
                let on = chosen.contains(o)
                Button {
                    if multiple { if on { chosen.remove(o) } else { chosen.insert(o) } } else { chosen = [o] }
                    set(multiple ? .list(opts.filter(chosen.contains)) : .text(o))
                } label: {
                    Text(o).font(.subheadline).monospacedDigit()
                        .foregroundColor(on ? Theme.primaryInk : Theme.ink)
                        .padding(.horizontal, Tokens.s3).frame(height: 34)
                        .background(on ? Theme.primary : Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
                        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(on ? Theme.primary : Theme.line2))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .onAppear { chosen = Set(options(node.attr("value"))) }
    }

    private var starInput: some View {
        let max = Swift.min(Swift.max(Int(node.attr("max") ?? "") ?? 5, 1), 10)
        return HStack(spacing: Tokens.s1) {
            ForEach(1...max, id: \.self) { k in
                Button { stars = k; set(.number(Double(k))) } label: {
                    Image(systemName: "star.fill").font(.title2).foregroundColor(k <= stars ? Theme.warn : Theme.line2)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(k) of \(max)")
                .accessibilityAddTraits(k == stars ? .isSelected : [])
            }
        }
        .onAppear { stars = Int(node.attr("value") ?? "") ?? 0 }
    }

    private var combobox: some View {
        let opts = options(node.attr("options"))
        let matches = text.isEmpty ? [] : opts.filter { $0.localizedCaseInsensitiveContains(text) && $0 != text }.prefix(6)
        return VStack(alignment: .leading, spacing: Tokens.s1) {
            TextField(node.attr("placeholder") ?? "", text: $text).textFieldStyle(.plain).modifier(FieldStyle())
                .onChange(of: text) { set(.text(text)) }
            ForEach(Array(matches), id: \.self) { m in
                Button { text = m } label: { Text(m).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6).padding(.horizontal, 10) }
                    .buttonStyle(.plain)
                    .background(Theme.tile, in: RoundedRectangle(cornerRadius: Theme.radius))
            }
        }
        .onAppear { text = node.attr("value") ?? "" }
    }

    private var stepper: some View {
        let lo = Int(node.attr("min") ?? "") ?? Int.min
        let hi = Int(node.attr("max") ?? "") ?? Int.max
        let step = Swift.max(Int(node.attr("step") ?? "") ?? 1, 1)
        return Stepper(value: $number, in: lo...hi, step: step) {
            Text("\(number)\(node.attr("unit").map { " " + $0 } ?? "")").monospacedDigit()
        }
        .onChange(of: number) { set(.number(Double(number))) }
        .onAppear { number = Swift.min(Swift.max(Int(node.attr("value") ?? "") ?? (lo == Int.min ? 0 : lo), lo), hi) }
    }

    private var signature: some View {
        VStack(alignment: .leading, spacing: 6) {
            Canvas { ctx, _ in
                for s in strokes where s.count > 1 {
                    var p = Path()
                    p.addLines(s)
                    ctx.stroke(p, with: .color(Theme.ink), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }
            }
            .frame(height: 140)
            .background(Theme.surface)
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line2))
            .gesture(DragGesture(minimumDistance: 0)
                .onChanged { v in
                    if v.translation == .zero { strokes.append([v.location]) } else { strokes[strokes.count - 1].append(v.location) }
                }
                .onEnded { _ in exportSignature() })
            .accessibilityLabel("Signature pad")
            Button("Clear") { strokes = []; form?.values[key] = nil }.buttonStyle(Secondary())
        }
    }

    /// The drawing as a PNG, in the form's values.
    @MainActor private func exportSignature() {
        let drawing = Canvas { ctx, _ in
            for s in strokes where s.count > 1 {
                var p = Path()
                p.addLines(s)
                ctx.stroke(p, with: .color(.black), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
            }
        }
        .frame(width: 600, height: 140)
        let r = ImageRenderer(content: drawing)
        #if os(iOS)
        if let png = r.uiImage?.pngData() { set(.photos([png])) }
        #else
        if let tiff = r.nsImage?.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) { set(.photos([png])) }
        #endif
    }

    private var contact: some View {
        HStack(spacing: Tokens.s2) {
            TextField("Name, phone or email", text: $text).textFieldStyle(.plain).modifier(FieldStyle())
                .onChange(of: text) { set(.text(text)) }
            #if os(iOS)
            Button("Contacts") { pickingContact = true }.buttonStyle(Secondary())
                .background(ContactPicker(show: $pickingContact) { text = $0 })
            #endif
        }
    }

    private var voice: some View {
        let max = TimeInterval(Int(node.attr("max") ?? "") ?? 120)
        return HStack(spacing: 10) {
            Button(recorder.recording ? "Stop" : (recorder.file == nil ? "Record" : "Record again")) {
                if recorder.recording {
                    recorder.stop()
                    if let f = recorder.file { set(.files([f])) }
                } else {
                    Task { await recorder.start(max: max) }
                }
            }
            .buttonStyle(Secondary())
            if recorder.recording { Text("Recording…").font(.footnote).foregroundColor(Theme.bad) }
            else if recorder.file != nil { Text("Voice note added").font(.footnote).foregroundColor(Theme.ink3) }
        }
    }
}

/// A short voice note to a file in the app's temporary folder.
@Observable
final class VoiceRecorder {
    var recording = false
    var file: URL?
    @ObservationIgnored private var recorder: AVAudioRecorder?

    @MainActor
    func start(max: TimeInterval) async {
        #if os(iOS)
        guard await AVAudioApplication.requestRecordPermission() else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playAndRecord, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
        #else
        guard await AVCaptureDevice.requestAccess(for: .audio) else { return }
        #endif
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1]
        guard let r = try? AVAudioRecorder(url: url, settings: settings) else { return }
        recorder = r
        r.record(forDuration: max)
        file = url
        recording = true
    }

    func stop() {
        recorder?.stop()
        recording = false
    }
}

#if os(iOS)
/// The system contact picker, presented from the view's own controller.
struct ContactPicker: UIViewControllerRepresentable {
    @Binding var show: Bool
    let picked: (String) -> Void

    func makeUIViewController(context: Context) -> UIViewController { UIViewController() }

    func updateUIViewController(_ host: UIViewController, context: Context) {
        guard show, host.presentedViewController == nil else { return }
        let p = CNContactPickerViewController()
        p.delegate = context.coordinator
        DispatchQueue.main.async { host.present(p, animated: true) }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, CNContactPickerDelegate {
        let parent: ContactPicker
        init(_ p: ContactPicker) { parent = p }
        func contactPicker(_ picker: CNContactPickerViewController, didSelect c: CNContact) {
            let name = [c.givenName, c.familyName].filter { !$0.isEmpty }.joined(separator: " ")
            let reach = c.phoneNumbers.first?.value.stringValue ?? (c.emailAddresses.first?.value as String?) ?? ""
            parent.picked([name, reach].filter { !$0.isEmpty }.joined(separator: ", "))
            parent.show = false
        }
        func contactPickerDidCancel(_ picker: CNContactPickerViewController) { parent.show = false }
    }
}
#endif
