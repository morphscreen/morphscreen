// Charts on Swift Charts: bar, stacked, horizontal, line, area, scatter, pie
// and donut; radar drawn as a shape (Swift Charts has none).

import Charts
import SwiftUI

/// A chart cell as a number: "$3.5k" is 3500, anything else is missing.
func chartNumber(_ v: String) -> Double? {
    let t = v.filter { !"$€£₹¥,% ".contains($0) && !$0.isWhitespace }
    var digits = ""
    var mult = 1.0
    for (i, c) in t.enumerated() {
        if c.isNumber || c == "." || ((c == "-" || c == "+") && i == 0) {
            digits.append(c)
        } else {
            switch c.lowercased() {
            case "k": mult = 1e3
            case "m": mult = 1e6
            case "b": mult = 1e9
            default: break
            }
            break
        }
    }
    return Double(digits).map { $0 * mult }
}

struct ChartPoint: Identifiable {
    let id: Int
    let label: String
    let series: String
    let value: Double
    let order: Int
    /// The value as the answer wrote it ("$1,200", "47%"), for tooltips.
    var raw: String = ""
}

struct ChartView: View {
    let node: UINode

    var body: some View {
        if case let .table(columns, rows) = node.data, columns.count >= 2 {
            let type = (node.attr("type") ?? "bar").lowercased()
            let points = rows.enumerated().flatMap { r, row in
                columns.dropFirst().enumerated().compactMap { k, name -> ChartPoint? in
                    guard let v = chartNumber(k + 1 < row.count ? row[k + 1] : "") else { return nil }
                    return ChartPoint(id: r * 64 + k, label: row.first ?? "", series: name, value: v, order: r, raw: row[k + 1])
                }
            }
            let seriesNames = Array(columns.dropFirst())
            VStack(alignment: .leading, spacing: 10) {
                if node.attr("title") != nil || node.attr("y") != nil {
                    HStack(alignment: .firstTextBaseline) {
                        Text(node.attr("title") ?? "").font(.subheadline.weight(.semibold))
                        Spacer()
                        if type != "pie" && type != "donut", let y = node.attr("y") { Text(y).font(.caption).foregroundColor(Theme.ink3) }
                    }
                }
                switch type {
                case "pie", "donut":
                    Pie(points: points.filter { $0.series == seriesNames[0] }, donut: type == "donut")
                case "radar":
                    Radar(points: points, series: seriesNames)
                default:
                    // Horizontal bars get room for every series in every row.
                    XYChart(points: points, series: seriesNames, type: type)
                        .frame(height: type == "horizontal" ? CGFloat(max(rows.count, 1)) * CGFloat(18 + 10 * seriesNames.count) + 40 : 200)
                }
            }
        }
    }
}

/// Bar, stacked, horizontal, line, area and scatter. Touch or hover picks a
/// category: a rule there (a dot on each line) and the values as written.
/// Legend items switch a series off; the plot draws in from the leading edge.
private struct XYChart: View {
    let points: [ChartPoint]
    let series: [String]
    let type: String
    @State private var selected: String?
    @State private var hidden: Set<String> = []
    @State private var drawn: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var shown: [ChartPoint] { points.filter { !hidden.contains($0.series) } }
    private var horizontal: Bool { type == "horizontal" }
    private var lineLike: Bool { type == "line" || type == "area" }

    private func color(_ s: String) -> Color { Theme.series[(series.firstIndex(of: s) ?? 0) % Theme.series.count] }

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.s2) {
            chart
            if series.count > 1 { ChartLegend(series: series, hidden: $hidden) }
        }
        .onAppear {
            if reduceMotion { drawn = 1 } else { withAnimation(.easeOut(duration: Tokens.slow * 2.5)) { drawn = 1 } }
        }
    }

    private var chart: some View {
        Chart {
            ForEach(shown) { p in
                switch type {
                case "line":
                    LineMark(x: .value("x", p.label), y: .value("y", p.value), series: .value("s", p.series))
                        .interpolationMethod(.monotone)
                        .foregroundStyle(by: .value("s", p.series))
                case "area":
                    AreaMark(x: .value("x", p.label), y: .value("y", p.value), stacking: .unstacked)
                        .interpolationMethod(.monotone)
                        .foregroundStyle(by: .value("s", p.series))
                        .opacity(0.15)
                    LineMark(x: .value("x", p.label), y: .value("y", p.value), series: .value("s", p.series))
                        .interpolationMethod(.monotone)
                        .foregroundStyle(by: .value("s", p.series))
                case "scatter":
                    PointMark(x: .value("x", p.label), y: .value("y", p.value)).foregroundStyle(by: .value("s", p.series))
                case "horizontal":
                    BarMark(x: .value("y", p.value), y: .value("x", p.label))
                        .foregroundStyle(by: .value("s", p.series))
                        .position(by: .value("s", p.series))
                        .opacity(selected == nil || selected == p.label ? 1 : 0.55)
                case "stacked":
                    BarMark(x: .value("x", p.label), y: .value("y", p.value))
                        .foregroundStyle(by: .value("s", p.series))
                        .opacity(selected == nil || selected == p.label ? 1 : 0.55)
                default:
                    BarMark(x: .value("x", p.label), y: .value("y", p.value))
                        .foregroundStyle(by: .value("s", p.series))
                        .position(by: .value("s", p.series))
                        .opacity(selected == nil || selected == p.label ? 1 : 0.55)
                }
                if lineLike, selected == p.label {
                    PointMark(x: .value("x", p.label), y: .value("y", p.value))
                        .foregroundStyle(by: .value("s", p.series))
                        .symbolSize(60)
                }
            }
            if let s = selected {
                if horizontal {
                    RuleMark(y: .value("x", s)).foregroundStyle(.clear)
                        .annotation(position: .trailing, alignment: .center, spacing: 4, overflowResolution: .init(x: .fit(to: .chart), y: .fit(to: .chart))) { tip(s) }
                } else {
                    RuleMark(x: .value("x", s)).foregroundStyle(lineLike || type == "scatter" ? Theme.ink3 : .clear).lineStyle(StrokeStyle(lineWidth: 1))
                        .annotation(position: .top, alignment: .center, spacing: 4, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) { tip(s) }
                }
            }
        }
        .chartForegroundStyleScale(domain: series, range: series.indices.map { Theme.series[$0 % Theme.series.count] })
        .chartLegend(.hidden)
        .chartXAxis {
            if horizontal {
                AxisMarks { AxisValueLabel().font(.caption) }
            } else {
                // Labels that would overlap are dropped, not drawn on top of each other.
                AxisMarks(values: xLabels) { AxisValueLabel(collisionResolution: .greedy(minimumSpacing: 6)).font(.caption) }
            }
        }
        .modifier(Pick(horizontal: horizontal, selected: $selected))
        // The plot draws in from its leading edge (the axes stay put).
        .chartPlotStyle { plot in plot.mask { Rectangle().scaleEffect(x: drawn, anchor: .leading) } }
    }

    /// The selected category's values, as written; the highest first on lines.
    private func tip(_ label: String) -> some View {
        let rows = shown.filter { $0.label == label }.sorted { lineLike ? $0.value > $1.value : (series.firstIndex(of: $0.series) ?? 0) < (series.firstIndex(of: $1.series) ?? 0) }
        return ChartTip(title: label, rows: rows.map { ($0.series, $0.raw.isEmpty ? String($0.value) : $0.raw, color($0.series)) })
    }

    /// At most eight category labels on the x axis, evenly spaced, last one kept.
    private var xLabels: [String] {
        var seen = Set<String>(), all: [String] = []
        for p in points.sorted(by: { $0.order < $1.order }) where seen.insert(p.label).inserted { all.append(p.label) }
        guard all.count > 8 else { return all }
        let step = Int((Double(all.count) / 8).rounded(.up))
        return all.indices.filter { $0 % step == 0 }.map { all[$0] }
    }
}

/// The slice an angle selection falls in: Swift Charts reports the angle as a
/// running total of the (non-negative) values.
func pieSlice(at angle: Double, values: [Double]) -> Int? {
    var acc = 0.0
    for (k, v) in values.enumerated() {
        acc += max(v, 0)
        if angle <= acc { return k }
    }
    return nil
}

/// The radar spoke nearest a point: spoke 0 points straight up, the rest go clockwise.
func radarSpoke(at p: CGPoint, in size: CGSize, count: Int) -> Int {
    let n = max(count, 1)
    let a = atan2(p.y - size.height / 2, p.x - size.width / 2) + .pi / 2
    return ((Int((a / (2 * .pi) * Double(n)).rounded()) % n) + n) % n
}

/// Touch or hover picks a category: along x, or along y for horizontal bars.
private struct Pick: ViewModifier {
    let horizontal: Bool
    @Binding var selected: String?
    func body(content: Content) -> some View {
        if horizontal { content.chartYSelection(value: $selected) } else { content.chartXSelection(value: $selected) }
    }
}

/// The tooltip: a title, then a row per series with its colour and value.
struct ChartTip: View {
    let title: String
    let rows: [(String, String, Color)]
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if !title.isEmpty { Text(title).fontWeight(.semibold) }
            ForEach(rows.indices, id: \.self) { k in
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 2).fill(rows[k].2).frame(width: 8, height: 8)
                    Text(rows[k].0)
                    Spacer(minLength: Tokens.s2)
                    Text(rows[k].1).fontWeight(.semibold).monospacedDigit()
                }
            }
        }
        .font(.caption)
        .foregroundColor(Theme.surface)
        .padding(.horizontal, Tokens.s3).padding(.vertical, Tokens.s2)
        .background(Theme.ink, in: RoundedRectangle(cornerRadius: Theme.radius))
        .fixedSize()
    }
}

/// Series names that switch their series on and off.
struct ChartLegend: View {
    let series: [String]
    @Binding var hidden: Set<String>
    var body: some View {
        FlowLayout(spacing: Tokens.s3) {
            ForEach(series.indices, id: \.self) { k in
                let s = series[k]
                let on = !hidden.contains(s)
                Button {
                    // At least one series stays on.
                    if on { if hidden.count < series.count - 1 { hidden.insert(s) } } else { hidden.remove(s) }
                } label: {
                    HStack(spacing: 6) {
                        RoundedRectangle(cornerRadius: 2).fill(Theme.series[k % Theme.series.count].opacity(on ? 1 : 0.3)).frame(width: 8, height: 8)
                        Text(s).strikethrough(!on).foregroundColor(on ? Theme.ink2 : Theme.ink3)
                    }
                    .font(.footnote)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? [.isButton, .isSelected] : .isButton)
            }
        }
    }
}

/// Touch or hover picks a slice: it stays solid, the rest fade, and its value
/// and share show (in the hole of a donut, over a pie).
private struct Pie: View {
    let points: [ChartPoint]
    let donut: Bool
    @State private var angle: Double?
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        PieLayout { pie; legend }
            .onAppear { if reduceMotion { shown = true } else { withAnimation(.easeOut(duration: Tokens.slow * 1.8)) { shown = true } } }
    }

    private var picked: Int? { angle.flatMap { pieSlice(at: $0, values: points.map(\.value)) } }

    private var pie: some View {
        let total = points.reduce(0) { $0 + max($1.value, 0) }
        let k = picked
        return Chart(points) { p in
            SectorMark(angle: .value("v", max(p.value, 0)), innerRadius: .ratio(donut ? 0.6 : 0), angularInset: 1)
                .foregroundStyle(Theme.series[p.order % Theme.series.count])
                .opacity(k == nil || points[k!].id == p.id ? 1 : 0.4)
        }
        .chartAngleSelection(value: $angle)
        .chartBackground { _ in
            if donut, let k {
                VStack(spacing: 0) {
                    Text(points[k].label).font(.caption).foregroundColor(Theme.ink3).lineLimit(1)
                    Text(points[k].raw.isEmpty ? String(points[k].value) : points[k].raw).font(.headline).monospacedDigit()
                }
                .frame(maxWidth: 90)
            }
        }
        .overlay(alignment: .top) {
            if !donut, let k {
                ChartTip(title: "", rows: [(points[k].label, (points[k].raw.isEmpty ? String(points[k].value) : points[k].raw) + (total > 0 ? " · \(Int((max(points[k].value, 0) / total * 100).rounded()))%" : ""), Theme.series[points[k].order % Theme.series.count])])
                    .offset(y: -8)
            }
        }
        .opacity(shown ? 1 : 0)
        .frame(width: 180, height: 180)
    }

    private var legend: some View {
        let total = points.reduce(0) { $0 + max($1.value, 0) }
        return VStack(alignment: .leading, spacing: 6) {
            ForEach(points) { p in
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 2).fill(Theme.series[p.order % Theme.series.count]).frame(width: 8, height: 8)
                    Text(p.label).font(.footnote).foregroundColor(Theme.ink2).lineLimit(1)
                    Spacer(minLength: 8)
                    Text(total > 0 ? "\(Int((p.value / total * 100).rounded()))%" : "").font(.footnote).monospacedDigit()
                }
            }
        }
    }
}

/// The legend beside the pie when there's room for it, under it in a narrow
/// column. One measuring pass, unlike ViewThatFits, which lays out both.
private struct PieLayout: Layout {
    let gap: CGFloat = 24, legendMin: CGFloat = 160

    private func beside(_ width: CGFloat, _ pie: CGSize) -> Bool { width >= pie.width + gap + legendMin }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 480
        let pie = subviews[0].sizeThatFits(.unspecified)
        if beside(width, pie) {
            let legend = subviews[1].sizeThatFits(ProposedViewSize(width: width - pie.width - gap, height: nil))
            return CGSize(width: width, height: max(pie.height, legend.height))
        }
        let legend = subviews[1].sizeThatFits(ProposedViewSize(width: width, height: nil))
        return CGSize(width: width, height: pie.height + 14 + legend.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let pie = subviews[0].sizeThatFits(.unspecified)
        if beside(bounds.width, pie) {
            let w = bounds.width - pie.width - gap
            let legend = subviews[1].sizeThatFits(ProposedViewSize(width: w, height: nil))
            subviews[0].place(at: CGPoint(x: bounds.minX, y: bounds.midY - pie.height / 2), proposal: .unspecified)
            subviews[1].place(at: CGPoint(x: bounds.minX + pie.width + gap, y: bounds.midY - legend.height / 2), proposal: ProposedViewSize(width: w, height: nil))
        } else {
            subviews[0].place(at: bounds.origin, proposal: .unspecified)
            subviews[1].place(at: CGPoint(x: bounds.minX, y: bounds.minY + pie.height + 14), proposal: ProposedViewSize(width: bounds.width, height: nil))
        }
    }
}

/// Touch or hover picks the nearest spoke; its values show under the chart.
private struct Radar: View {
    let points: [ChartPoint]
    let series: [String]
    @State private var spoke: Int?

    private var labels: [String] { Array(NSOrderedSet(array: points.map(\.label))) as? [String] ?? [] }

    @State private var hidden: Set<String> = []

    private func pick(_ at: CGPoint, in size: CGSize) { spoke = radarSpoke(at: at, in: size, count: labels.count) }

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.s2) {
            GeometryReader { g in
                canvas
                    .contentShape(Rectangle())
                    .onTapGesture(coordinateSpace: .local) { pick($0, in: g.size) }
                    .onContinuousHover { phase in
                        if case let .active(at) = phase { pick(at, in: g.size) } else { spoke = nil }
                    }
            }
            .frame(height: 240)
            if series.count > 1 { ChartLegend(series: series, hidden: $hidden) }
            if let k = spoke, k < labels.count {
                let rows = series.enumerated().compactMap { j, s -> (String, String, Color)? in
                    guard !hidden.contains(s), let p = points.first(where: { $0.label == labels[k] && $0.series == s }) else { return nil }
                    return (s, p.raw.isEmpty ? String(p.value) : p.raw, Theme.series[j % Theme.series.count])
                }
                ChartTip(title: labels[k], rows: rows)
            }
        }
    }

    private var canvas: some View {
        let labels = self.labels
        let maxV = max(points.map(\.value).max() ?? 1, 1)
        return Canvas { ctx, size in
            let c = CGPoint(x: size.width / 2, y: size.height / 2)
            let r = min(size.width, size.height) / 2 - 28
            let n = max(labels.count, 1)
            // Typed step by step: mixing CGFloat and Double in one line is too
            // slow for older Swift compilers to type-check.
            func pt(_ k: Int, _ v: Double) -> CGPoint {
                let a: Double = -Double.pi / 2 + 2 * Double.pi * Double(k) / Double(n)
                let d: Double = Double(r) * v / maxV
                return CGPoint(x: Double(c.x) + d * cos(a), y: Double(c.y) + d * sin(a))
            }
            for f in [1.0 / 3, 2.0 / 3, 1] {
                var p = Path()
                for k in 0..<n { k == 0 ? p.move(to: pt(k, maxV * f)) : p.addLine(to: pt(k, maxV * f)) }
                p.closeSubpath()
                ctx.stroke(p, with: .color(Theme.line))
            }
            for (k, l) in labels.enumerated() {
                ctx.draw(Text(l).font(.caption).foregroundColor(Theme.ink3), at: pt(k, maxV * 1.18))
            }
            for (j, s) in series.enumerated() where !hidden.contains(s) {
                var p = Path()
                for (k, l) in labels.enumerated() {
                    let v = points.first { $0.label == l && $0.series == s }?.value ?? 0
                    k == 0 ? p.move(to: pt(k, v)) : p.addLine(to: pt(k, v))
                }
                p.closeSubpath()
                let color = Theme.series[j % Theme.series.count]
                ctx.fill(p, with: .color(color.opacity(0.16)))
                ctx.stroke(p, with: .color(color), lineWidth: 1.5)
            }
        }
    }
}
