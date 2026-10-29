// The component packs (spec/packs): data, commerce, scheduling, media, docs,
// inputs, and the device pack's second set. Same rules as the core's HTML.
// Media and embeds open in the platform's player or browser; nothing loads
// from their hosts here.

package com.morphscreen.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import com.morphscreen.core.parseInline
import com.morphscreen.core.NodeData
import com.morphscreen.core.UINode
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

internal val PACK_COMPONENTS = setOf(
    "KeyValue", "Timeline", "Gauge", "Heatmap", "Funnel", "Sparkline", "Tree", "Product", "Plan", "Cart", "Rating", "Compare", "Price", "Calendar", "Event",
    "TimeSlots", "Agenda", "Countdown", "Video", "Audio", "Embed", "Carousel", "Code", "Diff", "Math", "FileTree", "Citation", "RatingInput", "Combobox", "Time",
    "ToggleGroup", "Stepper", "Signature", "Contact", "AddToCalendar", "Share", "VoiceNote", "QR", "Quiz", "Flashcards", "Poll", "Checklist", "WhatIf",
)

@Composable
internal fun PackView(node: UINode) {
    when (node.type) {
        "KeyValue" -> KeyValueView(node)
        "Timeline" -> TimelineView(node)
        "Gauge" -> GaugeView(node)
        "Heatmap" -> HeatmapView(node)
        "Funnel" -> FunnelView(node)
        "Sparkline" -> SparklineView(node)
        "Tree", "FileTree" -> PathTree(node)
        "Product" -> ProductView(node)
        "Plan" -> PlanView(node)
        "Cart" -> CartView(node)
        "Rating" -> RatingView(node.attr("value")?.toDoubleOrNull() ?: 0.0, node.attr("max")?.toDoubleOrNull() ?: 5.0, node.attr("count"))
        "Compare" -> CompareView(node)
        "Price" -> PriceView(node.attr("value") ?: "", node.attr("was"), node.attr("period"), node.attr("note"))
        "Calendar" -> CalendarView(node)
        "Event" -> EventView(node)
        "Agenda" -> AgendaView(node)
        "Countdown" -> CountdownView(node)
        "Video", "Audio", "Embed" -> MediaLink(node)
        "Carousel" -> CarouselView(node)
        "Code", "Diff" -> CodeFileView(node)
        "Math" -> MathView(node)
        "Citation" -> CitationView(node)
        "AddToCalendar" -> {
            val add = rememberAddToCalendar()
            SecondaryButton(plainText(node.spans).ifEmpty { "Add to calendar" }) { add(node) }
        }
        "Share" -> {
            val share = rememberShare()
            SecondaryButton(plainText(node.spans).ifEmpty { "Share" }) { share(listOfNotNull(node.attr("text"), node.attr("href")).joinToString(" ")) }
        }
        "QR" -> QRView(node)
        "Quiz" -> QuizView(node)
        "Flashcards" -> FlashcardsView(node)
        "Poll" -> PollView(node)
        "Checklist" -> ChecklistView(node)
        "WhatIf" -> WhatIfView(node)
        else -> PackField(node)
    }
}

// ---- shared pieces ----

@Composable
private fun Caption(t: String?) {
    if (!t.isNullOrBlank()) Txt(t, Type.callout.copy(fontWeight = FontWeight.SemiBold))
}

private fun table(node: UINode) = node.data as? NodeData.Table

private fun items(node: UINode) = (node.data as? NodeData.Items)?.items ?: emptyList()

private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
private val MONTH_NAMES = listOf("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")

/** "2026-10-20T18:00" as "20 Oct 2026, 18:00"; anything else as written. */
fun readableWhen(s: String): String {
    val t = s.trim()
    if (t.length < 10 || t[4] != '-' || t[7] != '-') return t
    val y = t.substring(0, 4).toIntOrNull() ?: return t
    val m = t.substring(5, 7).toIntOrNull()?.takeIf { it in 1..12 } ?: return t
    val d = t.substring(8, 10).toIntOrNull() ?: return t
    val time = if (t.length >= 16 && (t[10] == 'T' || t[10] == ' ') && t[13] == ':') ", " + t.substring(11, 16) else ""
    return "$d ${MONTHS[m - 1]} $y$time"
}

/** Days since 1970-01-01 (Howard Hinnant's algorithm). */
internal fun epochDays(y: Int, m: Int, d: Int): Long {
    val yy = (if (m <= 2) y - 1 else y).toLong()
    val era = yy.floorDiv(400L)
    val yoe = yy - era * 400
    val doy = (153 * (if (m > 2) m - 3 else m + 9) + 2) / 5 + d - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146_097 + doe - 719_468
}

private fun monthLength(y: Int, m: Int) = when (m) {
    2 -> if ((y % 4 == 0 && y % 100 != 0) || y % 400 == 0) 29 else 28
    4, 6, 9, 11 -> 30
    else -> 31
}

/** Epoch milliseconds for "YYYY-MM-DDTHH:MM", read as UTC plus `offsetMinutes`. */
internal fun parseWhenMillis(s: String, offsetMinutes: Int = 0): Long? {
    val t = s.trim()
    if (t.length < 10) return null
    val y = t.substring(0, 4).toIntOrNull() ?: return null
    val m = t.substring(5, 7).toIntOrNull() ?: return null
    val d = t.substring(8, 10).toIntOrNull() ?: return null
    val hh = if (t.length >= 16) t.substring(11, 13).toIntOrNull() ?: 0 else 0
    val mm = if (t.length >= 16) t.substring(14, 16).toIntOrNull() ?: 0 else 0
    return ((epochDays(y, m, d) * 24 + hh) * 60 + mm - offsetMinutes) * 60_000
}

/** The event as an iCalendar file. */
internal fun icsText(node: UINode): String {
    fun stamp(s: String): String {
        val d = s.filter { it.isDigit() }
        return if (d.length >= 12) d.take(8) + "T" + d.substring(8, 12) + "00" else d.take(8)
    }
    fun clean(s: String) = s.replace("\n", " ").replace(",", "\\,").replace(";", "\\;")
    val start = stamp(node.attr("start") ?: "")
    val end = node.attr("end")?.let(::stamp) ?: start
    val lines = mutableListOf("BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MorphScreen//EN", "BEGIN:VEVENT", "UID:$start-${fieldName(node)}@morphscreen", "DTSTART:$start", "DTEND:$end", "SUMMARY:${clean(node.attr("title") ?: "")}")
    node.attr("where")?.let { lines += "LOCATION:${clean(it)}" }
    node.attr("note")?.let { lines += "DESCRIPTION:${clean(it)}" }
    lines += listOf("END:VEVENT", "END:VCALENDAR")
    return lines.joinToString("\r\n")
}

private fun num(v: Double) = if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()

// ---- data ----

@Composable
private fun KeyValueView(node: UINode) {
    val c = colors
    val rows = table(node)?.rows ?: emptyList()
    val keyStyle = Type.callout.copy(color = c.ink3)
    // One key column for every row, no wider than 40% of the space: a long
    // key wraps in it rather than squeezing its value. Narrow, each key sits
    // above its value, as on the web.
    val widest = labelWidth(rows.map { plainText(parseInline(it.firstOrNull() ?: "")) }, keyStyle)
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        Caption(node.attr("title"))
        val keys = rows.map { cellText(it.firstOrNull() ?: "") }
        val values = rows.map { cellText(it.drop(1).joinToString(" · ")) }
        val valueStyle = Type.callout.copy(fontFeatureSettings = "tnum")
        ByWidth(
            360.dp,
            narrow = {
                Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                    for (k in rows.indices) Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Txt(keys[k], keyStyle)
                        Txt(values[k], valueStyle)
                    }
                }
            },
            wide = {
                // 168 dp is 40% of the narrowest width this layout is used at.
                val keyWidth = minOf(maxOf(widest, 96.dp), 168.dp)
                Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                    for (k in rows.indices) Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                        Txt(keys[k], keyStyle, Modifier.width(keyWidth))
                        Txt(values[k], valueStyle, Modifier.weight(1f))
                    }
                }
            },
        )
    }
}

/** "2021: First customers" as ("2021", "First customers"). */
internal fun timelineParts(text: String): Pair<String, String> {
    val i = text.indexOf(": ")
    return if (i in 1..32) text.take(i) to text.substring(i + 2) else "" to text
}

/** A pack cell's text parsed as the core parses content: bold, code and links, not raw markers. */
@Composable
private fun cellText(text: String) = inlineText(parseInline(text))

/** The widest of these labels in this style, so a column of them lines up without breaking one. */
@Composable
private fun labelWidth(labels: List<String>, style: TextStyle): Dp {
    val measurer = rememberTextMeasurer()
    val px = labels.maxOfOrNull { measurer.measure(keepIds(it), style, softWrap = false).size.width } ?: 0
    return with(LocalDensity.current) { px.toDp() } + 1.dp
}

@Composable
private fun TimelineView(node: UINode) {
    val c = colors
    val parts = items(node).map { timelineParts(plainText(it)) }
    val timeStyle = Type.footnote.copy(color = c.ink3, fontFeatureSettings = "tnum")
    val timeW = labelWidth(parts.map { it.first }, timeStyle)
    BoxWithConstraints {
    // Dates beside the entries when they leave room; above them when they don't.
    val stack = timeW > maxWidth * 0.4f
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Caption(node.attr("title"))
        for ((time, what) in parts) {
            if (stack) {
                Row(horizontalArrangement = Arrangement.spacedBy(Tokens.s3)) {
                    Box(Modifier.padding(top = 6.dp).size(7.dp).background(c.ink, CircleShape))
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        if (time.isNotEmpty()) Txt(time, timeStyle)
                        Txt(cellText(what))
                    }
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(Tokens.s3), verticalAlignment = Alignment.CenterVertically) {
                    Txt(time, timeStyle, Modifier.width(timeW.coerceAtLeast(56.dp)))
                    Box(Modifier.size(7.dp).background(c.ink, CircleShape))
                    Txt(cellText(what))
                }
            }
        }
    }
    }
}

@Composable
private fun GaugeView(node: UINode) {
    val c = colors
    val lo = node.attr("min")?.toDoubleOrNull() ?: 0.0
    val hi = (node.attr("max")?.toDoubleOrNull() ?: 100.0).let { if (it > lo) it else lo + 100 }
    val v = chartNumber(node.attr("value") ?: "") ?: lo
    val f = ((v - lo) / (hi - lo)).coerceIn(0.0, 1.0).toFloat()
    val tone = node.attr("tone")
    val color = if (tone == null || tone == "neutral") c.ink else c.tone(tone).first
    Column(
        Modifier.width(170.dp).semantics { contentDescription = "${node.attr("label") ?: ""}: ${node.attr("value") ?: ""} of ${num(hi)}" },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(150.dp, 82.dp), contentAlignment = Alignment.BottomCenter) {
            Canvas(Modifier.size(150.dp, 82.dp)) {
                val w = 10.dp.toPx()
                val r = size.width / 2 - w
                val tl = Offset(size.width / 2 - r, size.height - r - w / 2)
                drawArc(c.line, 180f, 180f, false, tl, Size(r * 2, r * 2), style = Stroke(w, cap = StrokeCap.Round))
                if (f > 0) drawArc(color, 180f, 180f * f, false, tl, Size(r * 2, r * 2), style = Stroke(w, cap = StrokeCap.Round))
            }
            Row(verticalAlignment = Alignment.Bottom) {
                Txt(node.attr("value") ?: "", Type.title2.copy(fontFeatureSettings = "tnum"))
                node.attr("unit")?.let { Txt(it, Type.caption.copy(color = c.ink3), Modifier.padding(start = 2.dp, bottom = Tokens.s1)) }
            }
        }
        Row(Modifier.width(160.dp)) {
            Txt(num(lo), Type.caption.copy(color = c.ink3))
            Spacer(Modifier.weight(1f))
            Txt(num(hi), Type.caption.copy(color = c.ink3))
        }
        Txt(node.attr("label") ?: "", Type.footnote.copy(color = c.ink2, fontWeight = FontWeight.Medium))
    }
}

@Composable
private fun HeatmapView(node: UINode) {
    val t = table(node) ?: return
    val c = colors
    val values = t.rows.flatMap { r -> r.drop(1).mapNotNull(::chartNumber) }
    val lo = values.minOrNull() ?: 0.0
    val hi = values.maxOrNull() ?: 1.0
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        Caption(node.attr("title"))
        Column(Modifier.horizontalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                t.columns.forEachIndexed { k, col -> Txt(col, Type.caption.copy(color = c.ink3), Modifier.width(if (k == 0) 64.dp else 56.dp)) }
            }
            for (r in t.rows) {
                Row(horizontalArrangement = Arrangement.spacedBy(2.dp), verticalAlignment = Alignment.CenterVertically) {
                    Txt(r.firstOrNull() ?: "", Type.caption.copy(color = c.ink3), Modifier.width(64.dp))
                    for (cell in r.drop(1)) {
                        val f = if (hi > lo) (((chartNumber(cell) ?: lo) - lo) / (hi - lo)).toFloat() else 0f
                        // Capped so the ink stays readable on the darkest cell.
                        Box(Modifier.size(56.dp, 30.dp).background(c.series[0].copy(alpha = 0.06f + f * (c.heatMax - 0.06f))), contentAlignment = Alignment.Center) {
                            Txt(cell, Type.caption.copy(color = c.ink, fontFeatureSettings = "tnum"))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FunnelView(node: UINode) {
    val rows = table(node)?.rows ?: return
    val c = colors
    val first = rows.firstOrNull()?.getOrNull(1)?.let(::chartNumber)?.takeIf { it > 0 } ?: 1.0
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        Caption(node.attr("title"))
        for (r in rows) {
            val raw = r.getOrNull(1) ?: ""
            val pct = ((chartNumber(raw) ?: 0.0) / first).coerceIn(0.0, 1.0)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.s3)) {
                Txt(r.firstOrNull() ?: "", Type.callout, Modifier.width(96.dp))
                Box(Modifier.weight(1f).height(22.dp).clip(RoundedCornerShape(4.dp)).background(c.tile)) {
                    Box(Modifier.fillMaxWidth(pct.toFloat()).height(22.dp).background(c.series[0]))
                }
                Txt(raw, Type.callout.copy(fontFeatureSettings = "tnum", textAlign = androidx.compose.ui.text.style.TextAlign.End), Modifier.width(72.dp))
                Txt("${if (pct < 0.1) ((pct * 1000).roundToInt() / 10.0).toString() else (pct * 100).roundToInt().toString()}%", Type.caption.copy(color = c.ink3), Modifier.width(44.dp))
            }
        }
    }
}

@Composable
private fun SparklineView(node: UINode) {
    val c = colors
    val values = options(node.attr("values")).mapNotNull(::chartNumber)
    val change = node.attr("change") ?: ""
    Row(
        Modifier.fillMaxWidth().background(c.tile, RoundedCornerShape(Radius)).padding(horizontal = Tokens.s4, vertical = Tokens.s3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Txt(node.attr("label") ?: "", Type.footnote.copy(color = c.ink2))
            node.attr("value")?.let { Txt(it, Type.title3.copy(fontFeatureSettings = "tnum")) }
            if (change.isNotEmpty()) Txt(change, Type.caption.copy(fontWeight = FontWeight.SemiBold, color = if (change.startsWith("-") || change.startsWith("−")) c.bad else c.good))
        }
        Canvas(Modifier.size(96.dp, 32.dp).semantics { contentDescription = "Trend: " + options(node.attr("values")).joinToString(", ") }) {
            if (values.size < 2) return@Canvas
            val lo = values.min()
            val hi = values.max()
            val p = Path()
            values.forEachIndexed { i, v ->
                val x = size.width * i / (values.size - 1)
                val y = if (hi > lo) (size.height - ((v - lo) / (hi - lo)).toFloat() * (size.height - 4f) - 2f) else size.height / 2
                if (i == 0) p.moveTo(x, y) else p.lineTo(x, y)
            }
            drawPath(p, c.series[0], style = Stroke(1.6.dp.toPx(), join = StrokeJoin.Round))
        }
    }
}

internal data class TreeEntry(val key: String, val name: String, val depth: Int, val folder: Boolean)

internal fun treeEntries(paths: List<List<String>>): List<TreeEntry> {
    val out = ArrayList<TreeEntry>()
    val seen = HashSet<String>()
    for (p in paths) for (depth in p.indices) {
        val key = p.subList(0, depth + 1).joinToString("\u0001")
        if (!seen.add(key)) continue
        out += TreeEntry(key, p[depth], depth, depth < p.size - 1 || p[depth].endsWith("/"))
    }
    return out
}

@Composable
private fun PathTree(node: UINode) {
    val files = node.type == "FileTree"
    val c = colors
    val paths = items(node).map { item ->
        val text = plainText(item).trim('`', ' ')
        if (files) {
            val parts = text.split('/').filter { it.isNotEmpty() }.toMutableList()
            for (i in 0 until parts.size - 1) parts[i] = parts[i] + "/"
            if (text.endsWith("/") && parts.isNotEmpty() && !parts.last().endsWith("/")) parts[parts.size - 1] = parts.last() + "/"
            parts
        } else {
            text.split(" > ").map { it.trim() }.filter { it.isNotEmpty() }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s1)) {
        Caption(node.attr("title"))
        for (e in treeEntries(paths)) {
            Row {
                repeat(e.depth) { Box(Modifier.padding(start = Tokens.s2, end = 9.dp).width(1.dp).height(18.dp).background(c.line2)) }
                Txt(e.name, (if (files) Type.mono else Type.callout).copy(fontWeight = if (e.folder) FontWeight.SemiBold else FontWeight.Normal))
            }
        }
    }
}

// ---- commerce ----

@Composable
internal fun RatingView(value: Double, max: Double, count: String?) {
    val c = colors
    val m = max.toInt().coerceIn(1, 10)
    Row(
        Modifier.semantics { contentDescription = "${num(value)} out of $m" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Canvas(Modifier.size((14 * m).dp, 14.dp)) {
            val s = size.height
            for (k in 0 until m) {
                val fill = (value - k).coerceIn(0.0, 1.0).toFloat()
                val path = star(Offset(k * s + s / 2, s / 2), s / 2)
                drawPath(path, c.line2)
                if (fill > 0) clipRect(right = k * s + s * fill) { drawPath(path, c.warn) }
            }
        }
        Txt(num(value), Type.footnote.copy(fontFeatureSettings = "tnum"))
        if (count != null) Txt("($count)", Type.footnote.copy(color = c.ink3))
    }
}

private fun star(center: Offset, r: Float): Path = Path().apply {
    for (i in 0 until 10) {
        val rad = if (i % 2 == 0) r else r * 0.45f
        val a = -PI / 2 + i * PI / 5
        val p = Offset(center.x + (rad * cos(a)).toFloat(), center.y + (rad * sin(a)).toFloat())
        if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y)
    }
    close()
}

@Composable
internal fun PriceView(value: String, was: String?, period: String?, note: String?) {
    val c = colors
    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Txt(value, Type.title3.copy(fontFeatureSettings = "tnum"))
            if (was != null) Txt(was, Type.footnote.copy(color = c.ink3, textDecoration = TextDecoration.LineThrough), Modifier.padding(bottom = 3.dp))
            if (period != null) Txt(period, Type.footnote.copy(color = c.ink3), Modifier.padding(bottom = 3.dp))
        }
        if (note != null) Txt(note, Type.caption.copy(color = c.ink3))
    }
}

@Composable
private fun ProductView(node: UINode) {
    val uri = LocalUriHandler.current
    val c = colors
    val href = node.attr("href")?.takeIf(::safeHref)
    val body = @Composable {
        Column(verticalArrangement = Arrangement.spacedBy(Tokens.s1)) {
            Txt(node.attr("name") ?: "", Type.headline)
            node.attr("badge")?.let { b ->
                Row(
                    Modifier.background(c.infoBg, RoundedCornerShape(4.dp)).padding(horizontal = 7.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Box(Modifier.size(6.dp).background(c.info, CircleShape))
                    Txt(b, Type.caption.copy(fontWeight = FontWeight.SemiBold, color = c.info))
                }
            }
            node.attr("price")?.let { PriceView(it, node.attr("was"), null, null) }
            node.attr("rating")?.toDoubleOrNull()?.let { RatingView(it, 5.0, node.attr("count")) }
            if (node.spans.isNotEmpty()) Txt(inlineText(node.spans), Type.body.copy(color = c.ink2))
            // Its Buttons, under it: what the reader can do with it.
            val buttons = node.children.filter { it.type == "Button" }
            if (buttons.isNotEmpty()) Row(Modifier.padding(top = Tokens.s1), horizontalArrangement = Arrangement.spacedBy(Tokens.s2)) { for (b in buttons) ButtonView(b) }
        }
    }
    val image = LocalImage.current
    val m = if (href != null) Modifier.clickable(role = Role.Button) { uri.openUri(href) } else Modifier
    if (LocalInTile.current) {
        Column(m, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            node.attr("image")?.let { image(it, node.attr("name") ?: "", Modifier.fillMaxWidth().height(140.dp).clip(RoundedCornerShape(Radius))) }
            body()
        }
    } else {
        Row(m, horizontalArrangement = Arrangement.spacedBy(Tokens.s4)) {
            node.attr("image")?.let { image(it, node.attr("name") ?: "", Modifier.size(96.dp).clip(RoundedCornerShape(Radius))) }
            body()
        }
    }
}

@Composable
private fun PlanView(node: UINode) {
    val c = colors
    val featured = node.flag("featured")
    val shape = RoundedCornerShape(Radius)
    Column(
        // In a Columns row, as tall as the tallest plan.
        Modifier.fillMaxWidth().fillMaxHeight().background(c.surface, shape).border(if (featured) 2.dp else 1.dp, if (featured) c.ink else c.line, shape).padding(Tokens.s4),
        verticalArrangement = Arrangement.spacedBy(Tokens.s2),
    ) {
        Txt(node.attr("name") ?: "", Type.headline)
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(Tokens.s1)) {
            Txt(node.attr("price") ?: "", Type.title.copy(fontFeatureSettings = "tnum"))
            node.attr("period")?.let { Txt(it, Type.footnote.copy(color = c.ink3), Modifier.padding(bottom = 5.dp)) }
        }
        node.attr("note")?.let { Txt(it, Type.footnote.copy(color = c.ink3)) }
        for (f in items(node)) {
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.s2), verticalAlignment = Alignment.CenterVertically) {
                Tick(c.good, Modifier.size(12.dp))
                Txt(inlineText(f), Type.callout)
            }
        }
    }
}

@Composable
private fun CartView(node: UINode) {
    val t = table(node) ?: return
    val c = colors
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        Caption(node.attr("title"))
        Row {
            t.columns.forEachIndexed { k, col ->
                Txt(col, Type.footnote.copy(color = c.ink3, textAlign = if (k == 0) androidx.compose.ui.text.style.TextAlign.Start else androidx.compose.ui.text.style.TextAlign.End), Modifier.weight(if (k == 0) 2f else 1f))
            }
        }
        Rule()
        for (r in t.rows) {
            Row {
                r.forEachIndexed { k, cell ->
                    Txt(cellText(cell), Type.callout.copy(fontFeatureSettings = "tnum", textAlign = if (k == 0) androidx.compose.ui.text.style.TextAlign.Start else androidx.compose.ui.text.style.TextAlign.End), Modifier.weight(if (k == 0) 2f else 1f))
                }
            }
        }
        node.attr("total")?.let {
            Rule()
            Row {
                Txt("Total", Type.callout.copy(fontWeight = FontWeight.SemiBold), Modifier.weight(1f))
                Txt(it, Type.callout.copy(fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum"))
            }
        }
        node.attr("note")?.let { Txt(it, Type.caption.copy(color = c.ink3)) }
    }
}

@Composable
private fun CompareView(node: UINode) {
    val t = table(node) ?: return
    val c = colors
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        Caption(node.attr("title"))
        Row { t.columns.forEachIndexed { k, col -> Txt(col, Type.footnote.copy(color = c.ink3, fontWeight = FontWeight.SemiBold), Modifier.weight(if (k == 0) 1.4f else 1f)) } }
        Rule()
        for (r in t.rows) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                r.forEachIndexed { k, cell ->
                    Box(Modifier.weight(if (k == 0) 1.4f else 1f)) {
                        when (if (k == 0) "" else cell.trim().lowercase()) {
                            "yes", "y", "true", "✓", "✔", "x" -> Tick(c.good, Modifier.size(14.dp).semantics { contentDescription = "Yes" })
                            "no", "n", "false", "✗", "✘", "-", "—" -> Box(Modifier.size(12.dp, 2.dp).background(c.ink3).semantics { contentDescription = "No" })
                            else -> Txt(cellText(cell), Type.callout.copy(color = if (k == 0) c.ink2 else c.ink))
                        }
                    }
                }
            }
        }
    }
}

// ---- scheduling ----

@Composable
private fun CalendarView(node: UINode) {
    val c = colors
    val rows = table(node)?.rows ?: emptyList()
    val marked = rows.mapNotNull { r ->
        val d = r.firstOrNull()?.trim() ?: return@mapNotNull null
        if (d.length < 10) return@mapNotNull null
        Triple(d.take(4).toIntOrNull() ?: return@mapNotNull null, d.substring(5, 7).toIntOrNull() ?: return@mapNotNull null, d.substring(8, 10).toIntOrNull() ?: return@mapNotNull null) to r.drop(1).joinToString(" · ")
    }
    val month = node.attr("month")
    val (y, m) = month?.takeIf { it.length >= 7 }?.let { (it.take(4).toIntOrNull() ?: 0) to (it.substring(5, 7).toIntOrNull() ?: 0) }?.takeIf { it.second in 1..12 }
        ?: marked.firstOrNull()?.first?.let { it.first to it.second } ?: (2026 to 1)
    val lead = ((epochDays(y, m, 1) + 3) % 7 + 7).toInt() % 7
    val cells = List(lead) { 0 } + (1..monthLength(y, m)).toList()
    // On a phone a day is too narrow for its events: a dot marks the day and
    // the events are listed under the month (as on the web).
    BoxWithConstraints {
    val narrow = (maxWidth - 12.dp) / 7 < 64.dp
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Txt(node.attr("title") ?: "${MONTH_NAMES[m - 1]} $y", Type.callout.copy(fontWeight = FontWeight.SemiBold))
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) { for (d in listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")) Txt(d, Type.caption.copy(color = c.ink3), Modifier.weight(1f).padding(start = Tokens.s1)) }
        for (week in cells.chunked(7)) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                for (k in 0 until 7) {
                    val day = week.getOrNull(k) ?: 0
                    val on = marked.firstOrNull { it.first == Triple(y, m, day) }?.second
                    Column(
                        Modifier.weight(1f).heightIn(min = 52.dp)
                            .then(if (day == 0) Modifier else Modifier.border(1.dp, c.line))
                            .background(if (on != null) c.infoBg else Color.Transparent)
                            .padding(Tokens.s1),
                    ) {
                        if (day > 0) Txt("$day", Type.caption.copy(color = if (on != null) c.info else c.ink3, fontWeight = if (on != null) FontWeight.SemiBold else FontWeight.Normal))
                        if (on != null) {
                            if (narrow) Box(Modifier.padding(top = 3.dp).size(5.dp).background(c.info, CircleShape))
                            else Txt(on, Type.caption, maxLines = 2)
                        }
                    }
                }
            }
        }
        if (narrow) {
            val shown = marked.filter { it.first.first == y && it.first.second == m }
            if (shown.size > 1 && shown.all { it.second == shown[0].second }) {
                // Every day says the same thing: name it once, beside its dot.
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                    Box(Modifier.size(5.dp).background(c.info, CircleShape))
                    Txt(shown[0].second, Type.footnote.copy(color = c.ink2))
                }
            } else {
                for ((d, what) in shown) {
                    Row(horizontalArrangement = Arrangement.spacedBy(Tokens.s3)) {
                        Txt("${d.third} ${MONTH_NAMES[m - 1].take(3)}", Type.footnote.copy(color = c.ink3, fontFeatureSettings = "tnum"), Modifier.width(52.dp))
                        Txt(cellText(what), Type.footnote, Modifier.weight(1f))
                    }
                }
            }
        }
    }
    }
}

@Composable
private fun EventView(node: UINode) {
    val c = colors
    val tone = node.attr("tone")
    val start = node.attr("start") ?: ""
    val end = node.attr("end")
    val sameDay = end != null && end.length >= 16 && start.length >= 16 && end.take(10) == start.take(10)
    val time = readableWhen(start) + (end?.let { " – " + if (sameDay) it.substring(11, 16) else readableWhen(it) } ?: "")
    Column(Modifier.fillMaxWidth().background(c.tile, RoundedCornerShape(Radius)).padding(horizontal = Tokens.s4, vertical = Tokens.s3), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(6.dp).background(if (tone == null || tone == "neutral") c.ink3 else c.tone(tone).first, CircleShape))
            Txt(time, Type.caption.copy(color = c.ink3, fontFeatureSettings = "tnum"))
        }
        Txt(node.attr("title") ?: "", Type.body.copy(fontWeight = FontWeight.SemiBold))
        node.attr("where")?.let { Txt(it, Type.footnote.copy(color = c.ink2)) }
        if (node.spans.isNotEmpty()) Txt(inlineText(node.spans), Type.callout)
    }
}

@Composable
private fun AgendaView(node: UINode) {
    val c = colors
    val rows = table(node)?.rows ?: emptyList()
    val timeStyle = Type.callout.copy(color = c.ink3, fontFeatureSettings = "tnum")
    // As wide as the longest time ("09:00–09:30"), within reason.
    val timeW = labelWidth(rows.map { it.firstOrNull() ?: "" }, timeStyle).coerceIn(48.dp, 140.dp)
    Column {
        Caption(node.attr("title"))
        rows.forEachIndexed { k, r ->
            if (k > 0) Rule()
            Row(Modifier.padding(vertical = Tokens.s2), horizontalArrangement = Arrangement.spacedBy(Tokens.s3)) {
                Txt(r.firstOrNull() ?: "", timeStyle, Modifier.width(timeW))
                Txt(cellText(r.drop(1).joinToString(" · ")))
            }
        }
    }
}

@Composable
private fun CountdownView(node: UINode) {
    val c = colors
    val until = node.attr("until") ?: ""
    val target = parseWhenMillis(until, localOffsetMinutes())
    var now by remember { mutableLongStateOf(currentMillis()) }
    LaunchedEffect(until) {
        while (true) {
            delay(1000)
            now = currentMillis()
        }
    }
    Column(Modifier.fillMaxWidth().background(c.tile, RoundedCornerShape(Radius)).padding(horizontal = Tokens.s4, vertical = Tokens.s3), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Txt(node.attr("label") ?: "", Type.footnote.copy(color = c.ink2))
        Txt(target?.let { left((it - now) / 1000) } ?: readableWhen(until), Type.title3.copy(fontFeatureSettings = "tnum"))
    }
}

private fun left(s: Long): String {
    if (s <= 0) return "Now"
    val d = s / 86400
    val h = s % 86400 / 3600
    val m = s % 3600 / 60
    val sec = s % 60
    return if (d > 0) "${d}d ${h}h ${m}m" else "${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}"
}

// ---- media ----

/** Video, audio and embeds: a card that opens them in the platform's player or the browser. */
@Composable
private fun MediaLink(node: UINode) {
    val uri = LocalUriHandler.current
    val c = colors
    val src = node.attr("src") ?: ""
    val host = embedHost(src)
    val sub = when (node.type) {
        "Embed" -> host?.let { "Play on $it" } ?: src
        "Audio" -> "Audio"
        else -> listOfNotNull("Video", node.attr("caption")).joinToString(" · ")
    }
    val shape = RoundedCornerShape(Radius)
    Row(
        Modifier.fillMaxWidth().clip(shape).border(1.dp, c.line, shape).clickable(role = Role.Button) { if (safeHref(src)) uri.openUri(src) }.padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.s3),
    ) {
        Box(Modifier.size(28.dp).background(c.ink, CircleShape), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(10.dp)) {
                drawPath(Path().apply { moveTo(size.width * 0.15f, 0f); lineTo(size.width, size.height / 2); lineTo(size.width * 0.15f, size.height); close() }, c.surface)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Txt(node.attr("title") ?: src, Type.body.copy(fontWeight = FontWeight.SemiBold))
            Txt(sub, Type.caption.copy(color = c.ink3))
        }
    }
}

internal fun embedHost(src: String): String? {
    val h = src.substringAfter("://", "").substringBefore('/').lowercase().removePrefix("www.").removePrefix("m.")
    return when {
        h == "youtube.com" || h == "youtu.be" -> "YouTube"
        h == "vimeo.com" -> "Vimeo"
        h == "open.spotify.com" -> "Spotify"
        h == "soundcloud.com" -> "SoundCloud"
        else -> null
    }
}

@Composable
private fun CarouselView(node: UINode) {
    val images = (node.data as? NodeData.Images)?.images ?: emptyList()
    val image = LocalImage.current
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        Caption(node.attr("title"))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(Tokens.s2)) {
            itemsIndexed(images) { _, img -> image(img.src, img.alt, Modifier.width(300.dp).height(220.dp).clip(RoundedCornerShape(Radius))) }
        }
    }
}

// ---- docs ----

@Composable
private fun CodeFileView(node: UINode) {
    val c = colors
    // The lines the core kept as written (older trees: a fenced block inside).
    val lines = (node.data as? NodeData.Lines)?.lines ?: plainText(node.children.firstOrNull { it.type == "code" }?.spans ?: emptyList()).split("\n")
    val marks = options(node.attr("highlight")).mapNotNull { it.toIntOrNull() }.toSet()
    val diff = node.type == "Diff"
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        Column(Modifier.fillMaxWidth().background(c.tile, RoundedCornerShape(Radius))) {
            node.attr("file")?.let {
                Txt(it, Type.mono.copy(color = c.ink2), Modifier.padding(horizontal = Tokens.s3, vertical = 6.dp))
                Rule()
            }
            SelectionContainer {
                Column(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = Tokens.s2)) {
                    lines.forEachIndexed { k, l ->
                        val kind = if (diff) {
                            when {
                                l.startsWith("+++") || l.startsWith("---") || l.startsWith("@@") -> "meta"
                                l.startsWith("+") -> "add"
                                l.startsWith("-") -> "del"
                                else -> ""
                            }
                        } else if (k + 1 in marks) "hl" else ""
                        Row(
                            Modifier.widthIn(min = 600.dp).background(
                                when (kind) {
                                    "add" -> c.goodBg
                                    "del" -> c.badBg
                                    "hl" -> c.warnBg
                                    else -> Color.Transparent
                                },
                            ).padding(horizontal = Tokens.s3),
                            horizontalArrangement = Arrangement.spacedBy(Tokens.s3),
                        ) {
                            if (!diff) Txt("${k + 1}", Type.mono.copy(color = c.ink3, textAlign = androidx.compose.ui.text.style.TextAlign.End), Modifier.width(24.dp))
                            Txt(l.ifEmpty { " " }, Type.mono.copy(color = when (kind) { "add" -> c.good; "del" -> c.bad; "meta" -> c.ink3; else -> c.ink }), raw = true)
                        }
                    }
                }
            }
        }
        Children(node.children.filter { it.type != "code" })
    }
}

@Composable
private fun MathView(node: UINode) {
    val c = colors
    val text = (node.data as? NodeData.Lines)?.lines?.firstOrNull() ?: node.attr("tex") ?: ""
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SelectionContainer {
            Txt(
                text,
                Type.title3.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal),
                Modifier.fillMaxWidth().background(c.tile, RoundedCornerShape(Radius)).padding(horizontal = Tokens.s4, vertical = Tokens.s3).semantics { contentDescription = node.attr("tex") ?: text },
                raw = true,
            )
        }
        node.attr("label")?.let { Txt(it, Type.caption.copy(color = c.ink3)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CitationView(node: UINode) {
    val c = colors
    val uri = LocalUriHandler.current
    val shape = RoundedCornerShape(Radius)
    Column(Modifier.fillMaxWidth().border(1.dp, c.line, shape).padding(horizontal = Tokens.s4, vertical = Tokens.s3), verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        if (node.spans.isNotEmpty()) Txt(inlineText(node.spans), Type.body.copy(color = c.ink2))
        // Title, then source and date: on the same line when they fit, under it when not.
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            val href = node.attr("href")?.takeIf(::safeHref)
            Txt(
                node.attr("title") ?: "",
                Type.footnote.copy(fontWeight = FontWeight.Medium, textDecoration = if (href != null) TextDecoration.Underline else null),
                if (href != null) Modifier.clickable(role = Role.Button) { uri.openUri(href) } else Modifier,
            )
            Txt(listOfNotNull(node.attr("source"), node.attr("date")).joinToString(" · "), Type.caption.copy(color = c.ink3))
        }
    }
}

// ---- device, second set ----

@Composable
private fun QRView(node: UINode) {
    val rows = (node.data as? NodeData.Lines)?.lines ?: emptyList()
    val c = colors
    Column(Modifier.widthIn(max = 220.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        Canvas(Modifier.size(200.dp).semantics { contentDescription = "QR code: " + (node.attr("value") ?: "") }) {
            drawRect(Color.White)
            val n = rows.size + 8
            val cell = size.minDimension / n
            rows.forEachIndexed { y, r ->
                r.forEachIndexed { x, ch -> if (ch == '1') drawRect(Color.Black, Offset((x + 4) * cell, (y + 4) * cell), Size(cell + 0.5f, cell + 0.5f)) }
            }
        }
        node.attr("label")?.let { Txt(it, Type.footnote.copy(fontWeight = FontWeight.SemiBold)) }
        Txt(node.attr("value") ?: "", Type.caption.copy(color = c.ink3, textAlign = androidx.compose.ui.text.style.TextAlign.Center))
    }
}

// ---- form fields from the packs ----

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PackField(node: UINode) {
    val form = LocalForm.current
    val key = fieldName(node)
    val c = colors
    fun set(v: FieldValue?) {
        if (v == null) form?.values?.remove(key) else form?.values?.set(key, v)
    }
    Labeled(node.attr("label") ?: "", node.attr("hint"), node.flag("required")) {
        when (node.type) {
            "TimeSlots", "ToggleGroup" -> {
                val multiple = node.type == "ToggleGroup" && node.flag("multiple")
                val opts = options(node.attr("options"))
                var chosen by rememberSaveable(node.id) { mutableStateOf(options(node.attr("value")).toSet()) }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.s2), verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                    for (o in opts) {
                        val on = o in chosen
                        val shape = RoundedCornerShape(Radius)
                        Box(
                            Modifier.clip(shape).background(if (on) c.primary else c.surface).border(1.dp, if (on) c.primary else c.line2, shape)
                                .clickable(role = if (multiple) Role.Checkbox else Role.RadioButton) {
                                    chosen = if (multiple) (if (on) chosen - o else chosen + o) else setOf(o)
                                    set(if (multiple) FieldValue.Items(opts.filter { it in chosen }) else FieldValue.Text(o))
                                }
                                .semantics { selected = on }
                                .heightIn(min = 34.dp).padding(horizontal = Tokens.s3, vertical = 7.dp),
                            contentAlignment = Alignment.Center,
                        ) { Txt(o, Type.callout.copy(color = if (on) c.primaryInk else c.ink, fontFeatureSettings = "tnum")) }
                    }
                }
            }
            "RatingInput" -> {
                val max = (node.attr("max")?.toIntOrNull() ?: 5).coerceIn(1, 10)
                var stars by rememberSaveable(node.id) { mutableIntStateOf(node.attr("value")?.toDoubleOrNull()?.toInt() ?: 0) }
                Row(horizontalArrangement = Arrangement.spacedBy(Tokens.s1)) {
                    for (k in 1..max) {
                        Canvas(
                            Modifier.size(28.dp).clickable(role = Role.RadioButton) { stars = k; set(FieldValue.Number(k.toDouble())) }
                                .semantics { contentDescription = "$k of $max"; selected = k == stars },
                        ) { drawPath(star(center, size.minDimension / 2), if (k <= stars) c.warn else c.line2) }
                    }
                }
            }
            "Combobox" -> {
                var text by rememberSaveable(node.id) { mutableStateOf(node.attr("value") ?: "") }
                val matches = if (text.isEmpty()) emptyList() else options(node.attr("options")).filter { it.contains(text, ignoreCase = true) && it != text }.take(6)
                Column(verticalArrangement = Arrangement.spacedBy(Tokens.s1)) {
                    TextInput(text, { text = it; set(FieldValue.Text(it)) }, node.attr("placeholder") ?: "")
                    for (m in matches) {
                        Txt(m, Type.body, Modifier.fillMaxWidth().clip(RoundedCornerShape(Radius)).background(c.tile).clickable(role = Role.Button) { text = m; set(FieldValue.Text(m)) }.padding(horizontal = 10.dp, vertical = 6.dp))
                    }
                }
            }
            "Time" -> {
                var text by rememberSaveable(node.id) { mutableStateOf(node.attr("value") ?: "") }
                TextInput(text, { v ->
                    text = v.filter { it.isDigit() || it == ':' }.take(5)
                    if (Regex("^([01]?\\d|2[0-3]):[0-5]\\d$").matches(text)) set(FieldValue.Text(text.padStart(5, '0')))
                }, "HH:MM")
            }
            "Stepper" -> {
                val lo = node.attr("min")?.toIntOrNull() ?: Int.MIN_VALUE
                val hi = node.attr("max")?.toIntOrNull() ?: Int.MAX_VALUE
                val step = (node.attr("step")?.toIntOrNull() ?: 1).coerceAtLeast(1)
                var n by rememberSaveable(node.id) { mutableIntStateOf((node.attr("value")?.toIntOrNull() ?: if (lo == Int.MIN_VALUE) 0 else lo).coerceIn(lo, hi)) }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SecondaryButton("−") { if (n - step >= lo) { n -= step; set(FieldValue.Number(n.toDouble())) } }
                    Txt("$n" + (node.attr("unit")?.let { " $it" } ?: ""), Type.body.copy(fontFeatureSettings = "tnum"))
                    SecondaryButton("+") { if (n + step <= hi) { n += step; set(FieldValue.Number(n.toDouble())) } }
                }
            }
            "Signature" -> SignaturePad { set(it) }
            "Contact" -> ContactField(node) { set(FieldValue.Text(it)) }
            "VoiceNote" -> VoiceNoteField(node) { set(FieldValue.Files(listOf(it))) }
        }
    }
}

/** Draw with a finger or the mouse; the drawing goes in the form as a PNG. */
@Composable
private fun SignaturePad(onValue: (FieldValue?) -> Unit) {
    val c = colors
    val strokes = remember { mutableStateListOf<List<Offset>>() }
    var current by remember { mutableStateOf(listOf<Offset>()) }
    var size by remember { mutableStateOf(IntSize.Zero) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Canvas(
            Modifier.fillMaxWidth().height(140.dp).background(c.surface).border(1.dp, c.line2, RoundedCornerShape(Radius))
                .onSizeChanged { size = it }
                .semantics { contentDescription = "Signature pad" }
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { current = listOf(it) },
                        onDrag = { ch, _ -> current = current + ch.position },
                        onDragEnd = {
                            strokes += current
                            current = emptyList()
                            onValue(FieldValue.Image(strokesPng(strokes.toList(), size.width, size.height)))
                        },
                    )
                },
        ) {
            for (s in strokes + listOf(current)) {
                if (s.size < 2) continue
                val p = Path().apply { s.forEachIndexed { i, o -> if (i == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y) } }
                drawPath(p, c.ink, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
        SecondaryButton("Clear") { strokes.clear(); onValue(null) }
    }
}

/** The local time zone's offset from UTC now, in minutes. */
internal expect fun localOffsetMinutes(): Int

internal expect fun currentMillis(): Long

/** A drawing's strokes as a PNG (black on white). */
internal expect fun strokesPng(strokes: List<List<Offset>>, width: Int, height: Int): ByteArray

/** Opens the platform's share sheet (or copies, where there is none). */
@Composable
internal expect fun rememberShare(): (String) -> Unit

/** Hands the event to the platform's calendar. */
@Composable
internal expect fun rememberAddToCalendar(): (UINode) -> Unit

@Composable
internal expect fun ContactField(node: UINode, onValue: (String) -> Unit)

@Composable
internal expect fun VoiceNoteField(node: UINode, onFile: (String) -> Unit)
