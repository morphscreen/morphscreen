// Layouts the components need: Columns (symmetric rows, equal heights,
// narrower on small screens) and a wrapping row (badges, follow-ups, buttons).

import SwiftUI

/// Cells in rows of up to `perRow` (fewer when cells would get narrower than
/// `minWidth`), each row as even as the count allows, every cell in a row the
/// same height. The core picks both numbers from what the cells hold.
struct ColumnsLayout: Layout {
    var perRow: Int
    /// The narrowest a cell may get; a row drops a column before cells get narrower.
    var minWidth: CGFloat
    var spacing: CGFloat = 12

    func rows(count: Int, width: CGFloat) -> [Range<Int>] {
        var per = max(1, perRow)
        // SwiftUI can offer an infinite width (when it asks for the ideal size): no limit then.
        if minWidth > 0, width.isFinite { per = min(per, max(1, Int((width + spacing) / (minWidth + spacing)))) }
        let rowCount = Int((Double(count) / Double(per)).rounded(.up))
        guard rowCount > 0 else { return [] }
        var out: [Range<Int>] = []
        var start = 0
        for r in 0..<rowCount {
            let size = count / rowCount + (r < count % rowCount ? 1 : 0)
            out.append(start..<start + size)
            start += size
        }
        return out
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil } ?? 700
        var height: CGFloat = 0
        for (k, row) in rows(count: subviews.count, width: width).enumerated() {
            let w = (width - spacing * CGFloat(row.count - 1)) / CGFloat(row.count)
            let h = row.map { subviews[$0].sizeThatFits(ProposedViewSize(width: w, height: nil)).height }.max() ?? 0
            height += h + (k > 0 ? spacing : 0)
        }
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in rows(count: subviews.count, width: bounds.width) {
            let w = (bounds.width - spacing * CGFloat(row.count - 1)) / CGFloat(row.count)
            let h = row.map { subviews[$0].sizeThatFits(ProposedViewSize(width: w, height: nil)).height }.max() ?? 0
            for (k, i) in row.enumerated() {
                subviews[i].place(at: CGPoint(x: bounds.minX + CGFloat(k) * (w + spacing), y: y), proposal: ProposedViewSize(width: w, height: h))
            }
            y += h + spacing
        }
    }
}

/// Items left to right, wrapping to the next line.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    /// An item's size: its natural width, but never wider than the row (a long
    /// one wraps inside itself instead of running past the edge).
    private func size(_ s: LayoutSubview, within width: CGFloat) -> CGSize {
        let natural = s.sizeThatFits(.unspecified)
        guard width.isFinite, natural.width > width else { return natural }
        return s.sizeThatFits(ProposedViewSize(width: width, height: nil))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for s in subviews {
            let size = size(s, within: width)
            if x > 0 && x + size.width > width {
                y += line + spacing
                x = 0
                line = 0
            }
            x += size.width + spacing
            line = max(line, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + line)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
        for s in subviews {
            let size = size(s, within: bounds.width)
            if x > bounds.minX && x + size.width > bounds.maxX {
                y += line + spacing
                x = bounds.minX
                line = 0
            }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            line = max(line, size.height)
        }
    }
}

/// How many cells a row of these Columns items holds, and whether they're
/// rich (anything but small tiles): the same rule as the core's HTML.
func columnsPlan(_ items: [UINode]) -> (perRow: Int, rich: Bool) {
    let k = items.count
    let allStats = items.allSatisfy { $0.type == "Stat" }
    let rich = items.contains { !["Stat", "Badge", "Progress", "Avatar", "Button"].contains($0.type) }
    func widestTable(_ n: UINode) -> Int {
        var m = n.type == "row" ? n.children.count : 0
        if case let .table(cols, _) = n.data, n.type != "Chart" || cols.count >= 4 { m = max(m, cols.count) }
        return n.children.reduce(m) { max($0, widestTable($1)) }
    }
    let wide = items.contains { widestTable($0) >= 4 }
    let per = wide ? 1 : k <= 4 ? k : (k == 5 && allStats) ? 5 : Int((Double(k) / (Double(k) / 4).rounded(.up)).rounded(.up))
    return (max(1, per), rich)
}
