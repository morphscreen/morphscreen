// Columns: symmetric rows, every cell in a row the same height, narrower on
// small screens; the same rule as the core's HTML.

package com.morphscreen.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.IntrinsicMeasurable
import androidx.compose.ui.layout.IntrinsicMeasureScope
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.MeasurePolicy
import androidx.compose.ui.layout.MeasureResult
import androidx.compose.ui.layout.MeasureScope
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.morphscreen.core.NodeData
import com.morphscreen.core.UINode
import kotlin.math.ceil

/**
 * How many cells a row of these Columns items holds, and whether they're
 * rich (anything but small tiles).
 */
internal fun columnsPlan(items: List<UINode>): Pair<Int, Boolean> {
    val k = items.size
    val allStats = items.all { it.type == "Stat" }
    val rich = items.any { it.type !in setOf("Stat", "Badge", "Progress", "Avatar", "Button") }
    fun widestTable(n: UINode): Int {
        var m = if (n.type == "row") n.children.size else 0
        val d = n.data
        if (d is NodeData.Table && (n.type != "Chart" || d.columns.size >= 4)) m = maxOf(m, d.columns.size)
        return n.children.fold(m) { a, c -> maxOf(a, widestTable(c)) }
    }
    val wide = items.any { widestTable(it) >= 4 }
    val per = when {
        wide -> 1
        k <= 4 -> k
        k == 5 && allStats -> 5
        else -> ceil(k / ceil(k / 4.0)).toInt()
    }
    return maxOf(1, per) to rich
}

/**
 * Cells in rows of up to `perRow` (fewer when cells would get narrower than
 * `minWidth`), each row as even as the count allows; the core picks both
 * numbers from what the cells hold.
 */
@Composable
internal fun ColumnsLayout(perRow: Int, minWidth: Dp, modifier: Modifier = Modifier, spacing: Dp = 12.dp, content: @Composable () -> Unit) {
    Layout(content, modifier, ColumnsPolicy(perRow, minWidth, spacing))
}

private class ColumnsPolicy(val perRow: Int, val minWidth: Dp, val spacing: Dp) : MeasurePolicy {
    /** Up to perRow cells a row, fewer when a cell would get narrower than minWidth. */
    private fun rows(count: Int, width: Int, minPx: Int, gapPx: Int): List<IntRange> {
        var per = maxOf(1, perRow)
        if (minPx > 0) per = minOf(per, maxOf(1, (width + gapPx) / (minPx + gapPx)))
        val rowCount = ceil(count / per.toDouble()).toInt()
        if (rowCount == 0) return emptyList()
        val out = ArrayList<IntRange>()
        var start = 0
        for (r in 0 until rowCount) {
            val size = count / rowCount + if (r < count % rowCount) 1 else 0
            out += start until start + size
            start += size
        }
        return out
    }

    private fun cellWidth(width: Int, n: Int, gap: Int) = ((width - gap * (n - 1)) / n).coerceAtLeast(0)

    override fun MeasureScope.measure(measurables: List<Measurable>, constraints: Constraints): MeasureResult {
        val width = if (constraints.hasBoundedWidth) constraints.maxWidth else 700.dp.roundToPx()
        val gap = spacing.roundToPx()
        val placed = rows(measurables.size, width, minWidth.roundToPx(), spacing.roundToPx()).map { row ->
            val w = cellWidth(width, row.count(), gap)
            // Every cell in the row as tall as the tallest. Intrinsics can come in
            // short (rows of text inside rows), so a cell may still grow past
            // them: never cut off.
            val h = row.maxOf { measurables[it].maxIntrinsicHeight(w) }
            row.map { measurables[it].measure(Constraints(minWidth = w, maxWidth = w, minHeight = h)) }
        }
        val height = placed.sumOf { r -> r.maxOf { it.height } } + gap * (placed.size - 1).coerceAtLeast(0)
        return layout(width, height) {
            var y = 0
            for (row in placed) {
                var x = 0
                for (p in row) {
                    p.place(x, y)
                    x += p.width + gap
                }
                y += row.maxOf { it.height } + gap
            }
        }
    }

    private fun IntrinsicMeasureScope.heightFor(measurables: List<IntrinsicMeasurable>, width: Int): Int {
        val gap = spacing.roundToPx()
        val rs = rows(measurables.size, width, minWidth.roundToPx(), spacing.roundToPx())
        return rs.sumOf { row -> row.maxOf { measurables[it].maxIntrinsicHeight(cellWidth(width, row.count(), gap)) } } + gap * (rs.size - 1).coerceAtLeast(0)
    }

    override fun IntrinsicMeasureScope.maxIntrinsicHeight(measurables: List<IntrinsicMeasurable>, width: Int) = heightFor(measurables, width)
    override fun IntrinsicMeasureScope.minIntrinsicHeight(measurables: List<IntrinsicMeasurable>, width: Int) = heightFor(measurables, width)
    override fun IntrinsicMeasureScope.maxIntrinsicWidth(measurables: List<IntrinsicMeasurable>, height: Int) =
        measurables.sumOf { it.maxIntrinsicWidth(height) } + spacing.roundToPx() * (measurables.size - 1).coerceAtLeast(0)
    override fun IntrinsicMeasureScope.minIntrinsicWidth(measurables: List<IntrinsicMeasurable>, height: Int) =
        measurables.maxOfOrNull { it.minIntrinsicWidth(height) } ?: 0
}

/**
 * [wide] where the space is at least [min] wide, [narrow] below it. Unlike
 * BoxWithConstraints it answers intrinsic measurements (a Columns row asks
 * them to make its tiles one height). Each content is one element.
 */
@Composable
internal fun ByWidth(min: Dp, modifier: Modifier = Modifier, narrow: @Composable () -> Unit, wide: @Composable () -> Unit) {
    androidx.compose.ui.layout.Layout(contents = listOf(wide, narrow), modifier = modifier) { (w, n), cs ->
        val useWide = !cs.hasBoundedWidth || cs.maxWidth >= min.roundToPx()
        val p = (if (useWide) w else n).first().measure(cs)
        layout(p.width, p.height) { p.place(0, 0) }
    }
}
