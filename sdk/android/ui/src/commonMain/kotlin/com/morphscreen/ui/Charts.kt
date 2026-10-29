// Charts drawn on a Canvas: bar, stacked, horizontal, line, area, scatter,
// pie, donut and radar, with a legend and labelled axes. A tap (or hover on
// desktop) picks a category: a crosshair and dots on lines, a band on bars,
// the slice on a pie, and a tooltip with each series' value as the answer
// wrote it. Legend items switch a series off; the plot draws in.

package com.morphscreen.ui

import androidx.compose.foundation.Canvas
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.IntSize
import kotlin.math.atan2
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.morphscreen.core.NodeData
import com.morphscreen.core.UINode
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/** A chart cell as a number: "$3.5k" is 3500, anything else is missing. */
fun chartNumber(v: String): Double? {
    val t = v.filter { it !in "$€£₹¥,% " && !it.isWhitespace() }
    val digits = StringBuilder()
    var mult = 1.0
    for ((i, ch) in t.withIndex()) {
        if (ch.isDigit() || ch == '.' || ((ch == '-' || ch == '+') && i == 0)) {
            digits.append(ch)
        } else {
            mult = when (ch.lowercaseChar()) {
                'k' -> 1e3
                'm' -> 1e6
                'b' -> 1e9
                else -> 1.0
            }
            break
        }
    }
    return digits.toString().toDoubleOrNull()?.let { it * mult }
}

private class Series(val name: String, val values: List<Double?>)

/** Round steps for an axis from 0 (or the minimum, when negative) to the maximum. */
private fun ticks(lo: Double, hi: Double, count: Int = 4): List<Double> {
    if (hi <= lo) return listOf(lo)
    val raw = (hi - lo) / count
    val mag = 10.0.pow(floor(log10(raw)))
    val step = listOf(1.0, 2.0, 2.5, 5.0, 10.0).map { it * mag }.first { it >= raw }
    val start = floor(lo / step) * step
    // Up to the first tick at or past the highest value, as the core does: the top tick is the plot's top.
    return generateSequence(start) { it + step }.takeWhile { it < hi + step * 0.999 }.toList()
}

private fun short(v: Double): String {
    val a = abs(v)
    return when {
        a >= 1e9 -> trim(v / 1e9) + "B"
        a >= 1e6 -> trim(v / 1e6) + "M"
        a >= 1e4 -> trim(v / 1e3) + "k"
        else -> trim(v)
    }
}

private fun trim(v: Double): String {
    val r = (v * 10).roundToInt() / 10.0
    return if (r == floor(r)) r.toLong().toString() else r.toString()
}

@Composable
internal fun ChartView(node: UINode) {
    val d = node.data as? NodeData.Table ?: return
    if (d.columns.size < 2) return
    val type = (node.attr("type") ?: "bar").lowercase()
    val labels = d.rows.map { it.firstOrNull() ?: "" }
    val all = d.columns.drop(1).mapIndexed { k, name -> Series(name, d.rows.map { r -> chartNumber(r.getOrNull(k + 1) ?: "") }) }
    var hidden by remember(node.id) { mutableStateOf(setOf<Int>()) }
    var picked by remember(node.id) { mutableStateOf<Picked?>(null) }
    val drawn = remember(node.id) { Animatable(0f) }
    val m = LocalMorphTheme.current.motion
    LaunchedEffect(node.id) { drawn.animateTo(1f, tween(m.slow * 5 / 2, easing = CubicBezierEasing(m.ease[0], m.ease[1], m.ease[2], m.ease[3]))) }
    // A series switched off draws nothing (and leaves the scale to the rest).
    val series = all.mapIndexed { k, s -> if (k in hidden) Series(s.name, s.values.map { null }) else s }
    val c = colors
    val tm = rememberTextMeasurer()
    val density = LocalDensity.current.density
    val title = node.attr("title")
    val described = (title ?: "") + " " + type + " chart: " + labels.joinToString(", ")
    Column(Modifier.fillMaxWidth().semantics { contentDescription = described }, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (title != null || node.attr("y") != null) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                Txt(title ?: "", Type.callout.copy(fontWeight = FontWeight.SemiBold), Modifier.weight(1f))
                if (type != "pie" && type != "donut") node.attr("y")?.let { Txt(it, Type.caption.copy(color = c.ink3)) }
            }
        }
        if (type == "pie" || type == "donut") {
            Pie(labels, series[0].values, d.rows.map { it.getOrNull(1) ?: "" }, type == "donut")
        } else {
            val height = when (type) {
                "radar" -> 240.dp
                // Long labels take two lines, so their rows are taller.
                "horizontal" -> (labels.size.coerceAtLeast(1) * max(18 + 10 * series.size, if (labels.any { it.length > 18 }) 36 else 0) + 40).dp
                else -> 200.dp
            }
            Box(Modifier.fillMaxWidth().height(height)) {
                Canvas(Modifier.matchParentSize().chartPointer(type, labels.size) { at, size -> picked = at?.let { a -> pickIndex(type, a, size, labels.size, density)?.let { Picked(it, a) } } }) {
                    val sel = picked?.index
                    when (type) {
                        "radar" -> radar(labels, series, c, tm, sel, drawn.value)
                        "horizontal" -> clipRect(right = size.width * drawn.value) { horizontal(labels, series, c, tm, sel) }
                        else -> clipRect(right = size.width * drawn.value) { xy(type, labels, series, c, tm, sel) }
                    }
                }
                picked?.let { p ->
                    val rows = all.indices.filter { it !in hidden }.mapNotNull { k ->
                        val raw = d.rows.getOrNull(p.index)?.getOrNull(k + 1)?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
                        Triple(all[k].name, raw, c.series[k % c.series.size])
                    }.let { r -> if (type == "line" || type == "area") r.sortedByDescending { chartNumber(it.second) ?: Double.NEGATIVE_INFINITY } else r }
                    ChartTip(labels.getOrNull(p.index) ?: "", rows, p.at)
                }
            }
        }
        if (series.size > 1 && type != "pie" && type != "donut") {
            Legend(all.map { it.name }, hidden = hidden) { k -> hidden = if (k in hidden) hidden - k else if (hidden.size < all.size - 1) hidden + k else hidden }
        }
    }
}

/** What a tap or hover picked: a category, and where the pointer was. */
private class Picked(val index: Int, val at: Offset)

/** Taps everywhere, hover with a mouse: the position, or null when the pointer leaves. */
private fun Modifier.chartPointer(type: String, n: Int, onPick: (Offset?, IntSize) -> Unit) = pointerInput(type, n) {
    awaitPointerEventScope {
        while (true) {
            val e = awaitPointerEvent()
            val at = e.changes.firstOrNull()?.position ?: continue
            when (e.type) {
                PointerEventType.Exit -> onPick(null, size)
                PointerEventType.Press, PointerEventType.Move -> onPick(at, size)
                else -> {}
            }
        }
    }
}

/** The category under a point, by the same geometry the chart is drawn with. */
internal fun pickIndex(type: String, at: Offset, size: IntSize, n: Int, density: Float): Int? {
    if (n < 1) return null
    return when (type) {
        "radar" -> {
            val a = atan2((at.y - size.height / 2f).toDouble(), (at.x - size.width / 2f).toDouble()) + PI / 2
            (((a / (2 * PI) * n).roundToInt() % n) + n) % n
        }
        "horizontal" -> {
            val plotBottom = size.height - 20 * density
            if (at.y < 0 || at.y > plotBottom) null else (at.y / (plotBottom / n)).toInt().coerceIn(0, n - 1)
        }
        else -> {
            val left = 40 * density
            if (at.x < left || at.y > size.height - 20 * density) null else ((at.x - left) / ((size.width - left) / n)).toInt().coerceIn(0, n - 1)
        }
    }
}

/** The tooltip: the category, then each series' colour, name and value; beside the pointer, inside the chart. */
@Composable
private fun ChartTip(title: String, rows: List<Triple<String, String, Color>>, at: Offset) {
    val c = colors
    Layout(content = {
        Column(Modifier.background(c.ink, RoundedCornerShape(Radius)).padding(horizontal = Tokens.s3, vertical = Tokens.s2), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (title.isNotEmpty()) Txt(title, Type.caption.copy(color = c.surface, fontWeight = FontWeight.SemiBold))
            for ((name, value, color) in rows) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.size(8.dp).background(color, RoundedCornerShape(2.dp)))
                    Txt(name, Type.caption.copy(color = c.surface))
                    Txt(value, Type.caption.copy(color = c.surface, fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum"))
                }
            }
        }
    }) { ms, cons ->
        val box = ms[0].measure(Constraints())
        val gap = 14.dp.roundToPx()
        val right = at.x.toInt() + gap
        val x = if (right + box.width > cons.maxWidth) (at.x.toInt() - gap - box.width).coerceAtLeast(0) else right
        val y = (at.y.toInt() - box.height / 2).coerceIn(0, (cons.maxHeight - box.height).coerceAtLeast(0))
        layout(cons.maxWidth, cons.maxHeight) { box.place(x, y) }
    }
}

/** Series names; with `onToggle` each switches its series on and off. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Legend(names: List<String>, hidden: Set<Int> = emptySet(), onToggle: ((Int) -> Unit)? = null) {
    val c = colors
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.s3), verticalArrangement = Arrangement.spacedBy(Tokens.s1)) {
        names.forEachIndexed { k, n ->
            val on = k !in hidden
            val tap = if (onToggle != null) Modifier.toggleable(value = on, role = Role.Checkbox) { onToggle(k) } else Modifier
            Row(tap, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.size(8.dp).background(c.series[k % c.series.size].copy(alpha = if (on) 1f else 0.3f), RoundedCornerShape(2.dp)))
                Txt(n, Type.caption.copy(color = if (on) c.ink2 else c.ink3, textDecoration = if (on) null else TextDecoration.LineThrough))
            }
        }
    }
}

// Axis labels at the caption size: never under 12.
private val axisStyle = TextStyle(fontSize = 12.sp)

private fun DrawScope.label(tm: TextMeasurer, text: String, at: Offset, color: Color, alignEnd: Boolean = false, center: Boolean = false, maxWidth: Float = 140f, lines: Int = 1) {
    val r = tm.measure(text, axisStyle.copy(color = color), maxLines = lines, overflow = TextOverflow.Ellipsis, constraints = Constraints(maxWidth = max(1, maxWidth.toInt())))
    val x = when {
        alignEnd -> at.x - r.size.width
        center -> at.x - r.size.width / 2f
        else -> at.x
    }
    drawText(r, topLeft = Offset(x, at.y - r.size.height / 2f))
}

private fun DrawScope.xy(type: String, labels: List<String>, series: List<Series>, c: MorphColors, tm: TextMeasurer, selected: Int? = null) {
    val all = series.flatMap { it.values.filterNotNull() }
    if (all.isEmpty() || labels.isEmpty()) return
    val stacked = type == "stacked"
    val hi = if (stacked) labels.indices.maxOf { i -> series.sumOf { max(it.values[i] ?: 0.0, 0.0) } } else all.max()
    val lo = min(0.0, all.min())
    val ts = ticks(lo, max(hi, lo + 1))
    val top = ts.last()
    val bottom = ts.first()
    val left = 40.dp.toPx()
    val plotTop = 9.dp.toPx()
    val plotBottom = size.height - 20.dp.toPx()
    fun y(v: Double) = (plotBottom - (v - bottom) / (top - bottom) * (plotBottom - plotTop)).toFloat()
    for (t in ts) {
        drawLine(c.line, Offset(left, y(t)), Offset(size.width, y(t)), 1f)
        label(tm, short(t), Offset(left - 6.dp.toPx(), y(t)), c.ink3, alignEnd = true)
    }
    val n = labels.size
    val band = (size.width - left) / n
    // At most eight category labels, evenly spaced, so they never overlap.
    val every = ceil(n / min(8.0, max(1.0, ((size.width - left) / 70.dp.toPx()).toDouble()))).toInt().coerceAtLeast(1)
    for (i in labels.indices step every) label(tm, labels[i], Offset(left + band * (i + 0.5f), plotBottom + 11.dp.toPx()), c.ink3, center = true, maxWidth = band * every)
    // The picked category: a band behind bars, a crosshair for lines (dots come after the lines).
    if (selected != null && type != "line" && type != "area" && type != "scatter") drawRect(c.ink.copy(alpha = 0.06f), Offset(left + band * selected, plotTop), Size(band, plotBottom - plotTop))
    if (selected != null && (type == "line" || type == "area" || type == "scatter")) {
        val cx = left + band * (selected + 0.5f)
        drawLine(c.ink3, Offset(cx, plotTop), Offset(cx, plotBottom), 1f)
    }
    when (type) {
        "line", "area", "scatter" -> series.forEachIndexed { k, s ->
            val color = c.series[k % c.series.size]
            val pts = s.values.mapIndexedNotNull { i, v -> v?.let { Offset(left + band * (i + 0.5f), y(it)) } }
            if (pts.isEmpty()) return@forEachIndexed
            if (type == "scatter") {
                for (p in pts) drawCircle(color, 3.5.dp.toPx(), p)
                return@forEachIndexed
            }
            val path = Path().apply { pts.forEachIndexed { i, p -> if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) } }
            if (type == "area") {
                val fill = Path().apply {
                    addPath(path)
                    lineTo(pts.last().x, y(max(bottom, 0.0)))
                    lineTo(pts.first().x, y(max(bottom, 0.0)))
                    close()
                }
                drawPath(fill, color.copy(alpha = 0.15f))
            }
            drawPath(path, color, style = Stroke(2.dp.toPx()))
            if (pts.size <= 24) for (p in pts) drawCircle(color, 2.5.dp.toPx(), p)
            selected?.let { i -> s.values.getOrNull(i)?.let { v ->
                val at = Offset(left + band * (i + 0.5f), y(v))
                drawCircle(c.surface, 5.dp.toPx(), at)
                drawCircle(color, 3.5.dp.toPx(), at)
            } }
        }
        else -> {
            val groupW = band * 0.72f
            for (i in labels.indices) {
                val x0 = left + band * i + (band - groupW) / 2
                if (stacked) {
                    var acc = 0.0
                    series.forEachIndexed { k, s ->
                        val v = max(s.values[i] ?: 0.0, 0.0)
                        drawRect(c.series[k % c.series.size], Offset(x0, y(acc + v)), Size(groupW, y(acc) - y(acc + v)))
                        acc += v
                    }
                } else {
                    val w = groupW / series.size
                    series.forEachIndexed { k, s ->
                        val v = s.values[i] ?: return@forEachIndexed
                        val y0 = y(max(v, 0.0))
                        val y1 = y(min(v, 0.0))
                        drawRect(c.series[k % c.series.size], Offset(x0 + w * k, y0), Size(max(w - 2f, 1f), max(y1 - y0, 1f)))
                    }
                }
            }
        }
    }
}

private fun DrawScope.horizontal(labels: List<String>, series: List<Series>, c: MorphColors, tm: TextMeasurer, selected: Int? = null) {
    val all = series.flatMap { it.values.filterNotNull() }
    if (all.isEmpty()) return
    val ts = ticks(min(0.0, all.min()), max(all.max(), 1.0))
    val top = ts.last()
    val bottom = ts.first()
    val left = min(size.width * 0.35f, 150.dp.toPx())
    val plotRight = size.width - 8.dp.toPx()
    val plotBottom = size.height - 20.dp.toPx()
    fun x(v: Double) = (left + (v - bottom) / (top - bottom) * (plotRight - left)).toFloat()
    for (t in ts) {
        drawLine(c.line, Offset(x(t), 0f), Offset(x(t), plotBottom), 1f)
        // The last tick sits on the right edge: it ends there rather than centring past it.
        label(tm, short(t), Offset(x(t), plotBottom + 11.dp.toPx()), c.ink3, center = t != ts.last(), alignEnd = t == ts.last())
    }
    val band = plotBottom / labels.size
    val barH = band * 0.7f / series.size
    if (selected != null) drawRect(c.ink.copy(alpha = 0.06f), Offset(0f, band * selected), Size(size.width, band))
    labels.forEachIndexed { i, l ->
        label(tm, l, Offset(0f, band * (i + 0.5f)), c.ink2, maxWidth = left - 8.dp.toPx(), lines = 2)
        series.forEachIndexed { k, s ->
            val v = s.values[i] ?: return@forEachIndexed
            val y0 = band * i + band * 0.15f + barH * k
            drawRect(c.series[k % c.series.size], Offset(x(min(v, 0.0)), y0), Size(max(abs(x(v) - x(0.0)), 1f), barH - 1f))
        }
    }
}

private fun DrawScope.radar(labels: List<String>, series: List<Series>, c: MorphColors, tm: TextMeasurer, selected: Int? = null, drawn: Float = 1f) {
    val n = labels.size.coerceAtLeast(1)
    val maxV = max(series.flatMap { it.values.filterNotNull() }.maxOrNull() ?: 1.0, 1.0)
    val center = Offset(size.width / 2, size.height / 2)
    val r = min(size.width, size.height) / 2 - 28.dp.toPx()
    fun pt(k: Int, v: Double): Offset {
        val a = -PI / 2 + 2 * PI * k / n
        return Offset((center.x + r * v / maxV * cos(a)).toFloat(), (center.y + r * v / maxV * sin(a)).toFloat())
    }
    for (f in listOf(1.0 / 3, 2.0 / 3, 1.0)) {
        val p = Path().apply { for (k in 0 until n) pt(k, maxV * f).let { if (k == 0) moveTo(it.x, it.y) else lineTo(it.x, it.y) }; close() }
        drawPath(p, c.line, style = Stroke(1f))
    }
    if (selected != null) drawLine(c.ink3, center, pt(selected, maxV), 1f)
    // Labels on a side spoke start (or end) just past the ring; top and bottom ones centre on it.
    labels.forEachIndexed { k, l ->
        val dx = pt(k, maxV).x - center.x
        val side = abs(dx) > 4.dp.toPx()
        label(tm, l, pt(k, maxV * if (side) 1.08 else 1.18), if (k == selected) c.ink else c.ink3, alignEnd = side && dx < 0, center = !side)
    }
    series.forEachIndexed { j, s ->
        if (s.values.all { it == null }) return@forEachIndexed
        val p = Path().apply { for (k in labels.indices) pt(k, s.values[k] ?: 0.0).let { if (k == 0) moveTo(it.x, it.y) else lineTo(it.x, it.y) }; close() }
        val color = c.series[j % c.series.size].copy(alpha = drawn)
        drawPath(p, color.copy(alpha = 0.16f * drawn))
        drawPath(p, color, style = Stroke(1.5.dp.toPx()))
    }
}

/** The slice at a point of a pie of this size, counting clockwise from the top. */
internal fun pieSlice(at: Offset, size: IntSize, values: List<Double>): Int? {
    val total = values.sum()
    if (total <= 0) return null
    var a = Math.toDegrees(atan2((at.y - size.height / 2f).toDouble(), (at.x - size.width / 2f).toDouble())) + 90
    if (a < 0) a += 360
    var acc = 0.0
    values.forEachIndexed { k, v ->
        acc += v / total * 360
        if (a <= acc) return k
    }
    return null
}

@Composable
private fun Pie(labels: List<String>, values: List<Double?>, raws: List<String>, donut: Boolean) {
    val c = colors
    val vs = values.map { max(it ?: 0.0, 0.0) }
    val total = vs.sum()
    val pct = vs.map { if (total > 0) "${(it / total * 100).roundToInt()}%" else "" }
    var picked by remember(labels) { mutableStateOf<Picked?>(null) }
    val shown = remember(labels) { Animatable(0f) }
    val slow = Tokens.SLOW
    LaunchedEffect(labels) { shown.animateTo(1f, tween(slow * 9 / 5)) }
    // Legend beside the pie when there's room, under it in a narrow column.
    androidx.compose.ui.layout.Layout(content = {
        Box(Modifier.size(180.dp)) {
        Canvas(Modifier.matchParentSize().chartPointer("pie", labels.size) { at, size -> picked = at?.let { a -> pieSlice(a, size, vs)?.let { Picked(it, a) } } }) {
            var start = -90f
            vs.forEachIndexed { k, v ->
                if (total <= 0) return@forEachIndexed
                val sweep = (v / total * 360).toFloat()
                val sel = picked?.index
                val color = c.series[k % c.series.size].copy(alpha = shown.value * if (sel == null || sel == k) 1f else 0.4f)
                if (donut) {
                    val w = size.minDimension * 0.2f
                    drawArc(color, start, max(sweep - 1f, 0.5f), false, Offset(w / 2, w / 2), Size(size.width - w, size.height - w), style = Stroke(w))
                } else {
                    drawArc(color, start, max(sweep - 0.6f, 0.5f), true)
                }
                start += sweep
            }
        }
        picked?.let { p ->
            ChartTip("", listOf(Triple(labels.getOrNull(p.index) ?: "", (raws.getOrNull(p.index) ?: "") + " · " + pct.getOrElse(p.index) { "" }, c.series[p.index % c.series.size])), p.at)
        }
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            labels.forEachIndexed { k, l ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.size(8.dp).background(c.series[k % c.series.size], RoundedCornerShape(2.dp)))
                    Txt(l, Type.footnote.copy(color = c.ink2), Modifier.weight(1f), maxLines = 1)
                    Txt(pct[k], Type.footnote.copy(fontFeatureSettings = "tnum"))
                }
            }
        }
    }) { ms, cons ->
        val width = if (cons.hasBoundedWidth) cons.maxWidth else 480.dp.roundToPx()
        val pie = ms[0].measure(Constraints())
        val gap = 24.dp.roundToPx()
        val beside = width >= pie.width + gap + 160.dp.roundToPx()
        val legendW = if (beside) width - pie.width - gap else width
        val legend = ms[1].measure(Constraints(minWidth = legendW, maxWidth = legendW))
        val h = if (beside) max(pie.height, legend.height) else pie.height + 14.dp.roundToPx() + legend.height
        layout(width, h) {
            if (beside) {
                pie.place(0, (h - pie.height) / 2)
                legend.place(pie.width + gap, (h - legend.height) / 2)
            } else {
                pie.place(0, 0)
                legend.place(0, pie.height + 14.dp.roundToPx())
            }
        }
    }
}
