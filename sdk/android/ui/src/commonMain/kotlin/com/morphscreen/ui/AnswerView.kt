// AnswerView: the answer in Compose. Containers lay out their children as the
// ops arrive; each node recomposes only when it changes.

package com.morphscreen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.Alignment
import androidx.compose.ui.layout.IntrinsicMeasurable
import androidx.compose.ui.layout.IntrinsicMeasureScope
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.MeasurePolicy
import androidx.compose.ui.layout.MeasureResult
import androidx.compose.ui.layout.MeasureScope
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.morphscreen.core.Answer
import com.morphscreen.core.Attrs
import com.morphscreen.core.ComponentStore
import com.morphscreen.core.NodeData
import com.morphscreen.core.Span
import com.morphscreen.core.UINode

/** What the app gets when the user acts (spec/format.md, "Actions"). */
sealed interface Action {
    data class Ask(val text: String, val node: String) : Action
    data class Submit(val node: String, val form: String, val button: String, val fields: Map<String, FieldValue>) : Action
    /** A Quiz finished: the score and each answer (right is null where the quiz had no key). */
    data class Quiz(val node: String, val score: Int, val total: Int, val answers: List<QuizAnswer>) : Action
    data class Vote(val node: String, val name: String, val choice: String) : Action
    /** What the reader has done so far (a Checklist's ticks, the cards they know): kept, not a new turn. */
    data class State(val node: String, val name: String, val value: List<String>) : Action
}

data class QuizAnswer(val question: String, val choice: String, val right: Boolean?)

sealed interface FieldValue {
    data class Text(val value: String) : FieldValue
    data class Number(val value: Double) : FieldValue
    data class Bool(val value: Boolean) : FieldValue
    data class Items(val values: List<String>) : FieldValue
    /** Files and photos as URIs (content:// on Android, file:// on desktop). */
    data class Files(val uris: List<String>) : FieldValue
    data class Location(val lat: Double, val lng: Double, val accuracy: Double) : FieldValue
    /** A drawing (a signature) as PNG bytes. */
    class Image(val png: ByteArray) : FieldValue
}

/** An app's own component: its attributes and the text the model put inside. */
class CustomProps(val attrs: Attrs, val text: String, val node: UINode)

typealias CustomComponent = @Composable (CustomProps) -> Unit

/**
 * How images load (Coil's AsyncImage, say). It only ever gets URLs the
 * [MediaPolicy] allows; the SDK's own loader is the default.
 */
typealias ImageContent = @Composable (src: String, alt: String, modifier: Modifier) -> Unit

internal val LocalAction = staticCompositionLocalOf<(Action) -> Unit> { {} }
/** The answer's components' state (interactive components and forms read and write it). */
internal val LocalComponents = staticCompositionLocalOf { ComponentStore() }
internal val LocalCustom = staticCompositionLocalOf<Map<String, CustomComponent>> { emptyMap() }
/** Without an app's image loader, a picture is its description in a tile. */
internal val NoImageLoader: ImageContent = { _, alt, m -> ImagePlaceholder(alt, m) }
internal val LocalImage = staticCompositionLocalOf { NoImageLoader }

/** Inside a Columns cell: sections become tiles, stats lose their own tile. */
internal val LocalInTile = compositionLocalOf { false }

@Composable
fun AnswerView(
    answer: Answer,
    modifier: Modifier = Modifier,
    /** The look: MorphTheme.Standard, or an app's own from MorphTheme.fromDtcg. */
    theme: MorphTheme = LocalMorphTheme.current,
    colors: MorphColors = morphColors(theme = theme),
    components: Map<String, CustomComponent> = emptyMap(),
    image: ImageContent? = null,
    /** Where images may load from; anything else shows its description. */
    media: MediaPolicy = MediaPolicy(),
    /** The app's own map provider and key: a Map's tiles load from it. Without one a Map is its places as a list. */
    maps: MapTiles? = null,
    onAction: (Action) -> Unit = {},
) {
    CompositionLocalProvider(
        LocalMorphTheme provides theme,
        LocalMorphColors provides colors,
        LocalAction provides onAction,
        LocalComponents provides answer.components,
        LocalCustom provides components,
        LocalMedia provides media,
        LocalMaps provides maps,
        LocalImage provides guarded(image ?: MediaImageLoader, media),
    ) {
        Box(modifier.fillMaxWidth()) { Children(answer.root.children) }
    }
}

/** Components that sit in a row of buttons. */
internal val BUTTONS = setOf("Button", "AddToCalendar", "Share")

/** A node's children, with consecutive Buttons in one row. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun Children(nodes: List<UINode>, spacing: Dp = 16.dp, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(spacing)) {
        var i = 0
        while (i < nodes.size) {
            if (nodes[i].type in BUTTONS) {
                var j = i
                while (j < nodes.size && nodes[j].type in BUTTONS) j++
                val run = nodes.subList(i, j)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.s2), verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                    for (b in run) androidx.compose.runtime.key(b.id) { NodeView(b) }
                }
                i = j
            } else {
                androidx.compose.runtime.key(nodes[i].id) { Box(Modifier.appear()) { NodeView(nodes[i]) } }
                i++
            }
        }
    }
}

@Composable
internal fun NodeView(node: UINode) {
    when (node.type) {
        "p" -> Paragraph(node)
        "h" -> Heading(node)
        "ul", "ol" -> ListBlock(node)
        "table" -> TableBlock(node)
        "code" -> CodeBlock(node)
        "quote" -> Txt(inlineText(node.spans), Type.body.copy(fontStyle = FontStyle.Italic, color = colors.ink2), Modifier.padding(start = Tokens.s4))
        "hr" -> Rule()
        "group" -> Children(node.children)
        "Card" -> CardView(node)
        "Columns" -> ColumnsView(node)
        "Tabs" -> TabsView(node)
        "Tab" -> Children(node.children)
        "Details" -> DetailsView(node)
        "Steps" -> StepsView(node)
        "Callout" -> CalloutView(node)
        "Stat" -> StatView(node)
        "Badge" -> BadgeView(node)
        "Progress" -> ProgressView(node)
        "Avatar" -> AvatarView(node.attr("name") ?: "", node.attr("subtitle"), node.attr("src"))
        "Gallery" -> GalleryView(node)
        "Chart" -> ChartView(node)
        "FollowUps" -> FollowUpsView(node)
        "Form" -> FormView(node)
        "Input", "TextArea", "Select", "Date", "Slider", "Checkboxes", "Radio", "Switch" -> FieldView(node)
        "Button" -> ButtonView(node)
        "Map" -> MapBlock(node)
        "Camera", "Scan", "Location", "File" -> DeviceField(node)
        in PACK_COMPONENTS -> PackView(node)
        else -> {
            val make = LocalCustom.current[node.type]
            if (make != null) make(CustomProps(node.attrs, plainText(node.spans), node)) else Facts(node)
        }
    }
}

/** Text in our colors; `style` sets size and weight, color defaults to ink. */
@Composable
internal fun Txt(text: String, style: TextStyle = Type.body, modifier: Modifier = Modifier, maxLines: Int = Int.MAX_VALUE, raw: Boolean = false) {
    val s = style.merge(TextStyle(color = if (style.color.isSpecified()) style.color else colors.ink))
    // Labels get the inline text's rules too: IDs, times and dates never split.
    // Raw text (code and math, which can be selected and copied) keeps exactly its characters.
    val t = if (raw) text else keepIds(text)
    if (style.lineBreak == LineBreak.Heading && maxLines == Int.MAX_VALUE) BalancedText(AnnotatedString(t), s, modifier)
    else BasicText(t, modifier, s, maxLines = maxLines)
}

@Composable
internal fun Txt(text: AnnotatedString, style: TextStyle = Type.body, modifier: Modifier = Modifier) {
    val s = style.merge(TextStyle(color = if (style.color.isSpecified()) style.color else colors.ink))
    if (style.lineBreak == LineBreak.Heading) BalancedText(text, s, modifier) else BasicText(text, modifier, s)
}

/**
 * A title on more than one line, laid out as narrow as it can be without
 * adding a line, so its lines come out even and no word is left alone (what
 * CSS's text-wrap: balance does; LineBreak.Heading only works on Android 13+).
 */
@Composable
private fun BalancedText(text: AnnotatedString, style: TextStyle, modifier: Modifier) {
    val measurer = rememberTextMeasurer()
    Layout({ BasicText(text, style = style) }, modifier) { ms, cs ->
        var w = cs.maxWidth
        if (cs.hasBoundedWidth) {
            val lines = measurer.measure(text, style, constraints = Constraints(maxWidth = w)).lineCount
            if (lines > 1) {
                // Balanced lines are never narrower than half the width.
                var lo = w / 2
                var hi = w
                while (hi - lo > 2) {
                    val mid = (lo + hi) / 2
                    if (measurer.measure(text, style, constraints = Constraints(maxWidth = mid)).lineCount > lines) lo = mid else hi = mid
                }
                w = hi
            }
        }
        val p = ms.first().measure(cs.copy(minWidth = minOf(cs.minWidth, w), maxWidth = w))
        layout(maxOf(p.width, cs.minWidth), p.height) { p.place(0, 0) }
    }
}

private fun androidx.compose.ui.graphics.Color.isSpecified() = this != androidx.compose.ui.graphics.Color.Unspecified

@Composable
internal fun Rule(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(1.dp).background(colors.line))
}

// ---- Markdown blocks ----

@Composable
private fun Paragraph(node: UINode) {
    val act = LocalAction.current
    val ask = askTarget(node.spans)
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        val m = if (ask != null) Modifier.clickable { act(Action.Ask(ask, node.id)) } else Modifier
        // A readable line length (about 70 characters) in a wide card; a paragraph that is only a photo has no text.
        if (plainText(node.spans.filter { it !is Span.Image }).isNotBlank()) Txt(inlineText(node.spans), Type.body, m.widthIn(max = 620.dp))
        for (img in inlineImages(node.spans)) Photo(img.src, img.alt, img.credit)
    }
}

@Composable
private fun Heading(node: UINode) {
    val style = when (node.attr("level")?.toIntOrNull() ?: 1) {
        1 -> Type.title
        2 -> Type.title2
        3 -> Type.title3
        else -> Type.headline
    }
    Txt(inlineText(node.spans), style, Modifier.padding(top = Tokens.s1).semantics { heading() })
}

@Composable
private fun ListBlock(node: UINode) {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s1)) {
        node.children.forEachIndexed { k, li ->
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                val task = li.attr("task")
                when (task) {
                    "done" -> CheckMark(checked = true, Modifier.padding(top = Tokens.s1))
                    "open" -> CheckMark(checked = false, Modifier.padding(top = Tokens.s1))
                    else -> Txt(if (node.type == "ol") "${k + 1}." else "•", Type.body.copy(color = colors.ink3))
                }
                Txt(
                    inlineText(li.spans),
                    Type.body.copy(
                        color = if (task == "done") colors.ink3 else colors.ink,
                        textDecoration = if (task == "done") TextDecoration.LineThrough else null,
                    ),
                )
            }
        }
    }
}

/** A Markdown table: columns as wide as their widest cell, scrolling sideways when wide. */
@Composable
private fun TableBlock(node: UINode) {
    val right = (node.data as? NodeData.Align)?.right ?: emptyList()
    val rows = node.children
    val c = colors
    Box(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
        Layout(content = {
            rows.forEachIndexed { r, row ->
                row.children.forEachIndexed { k, cell ->
                    Txt(
                        inlineText(cell.spans),
                        (if (r == 0) Type.footnote else Type.callout).copy(color = if (r == 0) c.ink3 else c.ink, textAlign = if (k < right.size && right[k]) androidx.compose.ui.text.style.TextAlign.End else androidx.compose.ui.text.style.TextAlign.Unspecified),
                    )
                }
            }
            Rule()
        }, measurePolicy = rows.map { it.children.size }.let { cells -> remember(cells, right) { TablePolicy(cells, right) } })
    }
}

/** Columns as wide as their widest cell, rows as tall as their tallest, a rule under the header. */
private class TablePolicy(val cells: List<Int>, val right: List<Boolean>) : MeasurePolicy {
    private val cols = cells.maxOrNull() ?: 0

    private fun <T> grid(items: List<T>): List<List<T>> {
        var i = 0
        return cells.map { n -> List(n) { items[i++] } }
    }

    override fun MeasureScope.measure(measurables: List<Measurable>, constraints: Constraints): MeasureResult {
        val gapX = 16.dp.roundToPx()
        val gapY = 8.dp.roundToPx()
        val placed = grid(measurables.dropLast(1)).map { row -> row.map { it.measure(Constraints()) } }
        val widths = IntArray(cols)
        for (row in placed) row.forEachIndexed { k, p -> widths[k] = maxOf(widths[k], p.width) }
        val width = (widths.sum() + gapX * (cols - 1).coerceAtLeast(0)).coerceIn(constraints.minWidth, MAX)
        val rule = measurables.last().measure(Constraints.fixed(width.coerceAtLeast(1), 1.dp.roundToPx()))
        val heights = placed.map { r -> r.maxOfOrNull { it.height } ?: 0 }
        val height = heights.sum() + gapY * (heights.size - 1).coerceAtLeast(0) + if (placed.isNotEmpty()) rule.height + gapY else 0
        return layout(width, height.coerceAtMost(MAX)) {
            var y = 0
            placed.forEachIndexed { r, row ->
                var x = 0
                row.forEachIndexed { k, p ->
                    val dx = if (k < right.size && right[k]) widths[k] - p.width else 0
                    p.place(x + dx, y)
                    x += widths[k] + gapX
                }
                y += heights[r] + gapY
                if (r == 0) {
                    rule.place(0, y - gapY / 2)
                    y += rule.height + gapY / 2
                }
            }
        }
    }

    private fun IntrinsicMeasureScope.height(measurables: List<IntrinsicMeasurable>): Int {
        val rows = grid(measurables.dropLast(1))
        val heights = rows.map { r -> r.maxOfOrNull { it.maxIntrinsicHeight(it.maxIntrinsicWidth(Constraints.Infinity)) } ?: 0 }
        return heights.sum() + 8.dp.roundToPx() * heights.size + 1.dp.roundToPx()
    }

    private fun IntrinsicMeasureScope.width(measurables: List<IntrinsicMeasurable>): Int {
        val widths = IntArray(cols)
        for (row in grid(measurables.dropLast(1))) row.forEachIndexed { k, m -> widths[k] = maxOf(widths[k], m.maxIntrinsicWidth(Constraints.Infinity)) }
        return (widths.sum() + 16.dp.roundToPx() * (cols - 1).coerceAtLeast(0)).coerceAtMost(MAX)
    }

    override fun IntrinsicMeasureScope.maxIntrinsicHeight(measurables: List<IntrinsicMeasurable>, width: Int) = height(measurables)
    override fun IntrinsicMeasureScope.minIntrinsicHeight(measurables: List<IntrinsicMeasurable>, width: Int) = height(measurables)
    override fun IntrinsicMeasureScope.maxIntrinsicWidth(measurables: List<IntrinsicMeasurable>, height: Int) = width(measurables)
    override fun IntrinsicMeasureScope.minIntrinsicWidth(measurables: List<IntrinsicMeasurable>, height: Int) = width(measurables)

    companion object {
        /** Wider than any screen, small enough for Constraints. */
        const val MAX = 32_000
    }
}

@Composable
private fun CodeBlock(node: UINode) {
    Box(Modifier.fillMaxWidth().background(colors.tile, RoundedCornerShape(Radius)).horizontalScroll(rememberScrollState())) {
        SelectionContainer { Txt(plainText(node.spans), Type.mono, Modifier.padding(Tokens.s3), raw = true) }
    }
}

/** A component with no view here: its attributes as a list, then its content. */
@Composable
private fun Facts(node: UINode) {
    val listed = node.attrs.mapNotNull { (k, v) -> (v as? com.morphscreen.core.Attr.Str)?.value?.takeIf { it.isNotEmpty() }?.let { k to it } }.sortedBy { it.first }
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        for ((k, v) in listed) {
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.s4)) {
                Txt(k, Type.callout.copy(color = colors.ink3), Modifier.width(120.dp))
                Txt(v, Type.callout)
            }
        }
        if (node.spans.isNotEmpty()) Txt(inlineText(node.spans))
        Children(node.children)
    }
}

@Composable
internal fun ImagePlaceholder(alt: String, modifier: Modifier) {
    // As on the web: a long description a size smaller, in even lines, so it
    // runs two lines in a small tile rather than three short ones.
    val style = (if (alt.length > 32) Type.caption.copy(fontSize = 11.5.sp) else Type.footnote).copy(color = colors.ink3, textAlign = TextAlign.Center, lineBreak = LineBreak.Heading)
    // Too small for words (a product's photo beside its name): a picture's
    // outline, with the description for screen readers.
    ByWidth(
        104.dp,
        modifier.background(colors.tile, RoundedCornerShape(Radius)),
        narrow = { Box(Modifier.fillMaxSize().semantics { contentDescription = alt.ifEmpty { "Image" } }, contentAlignment = Alignment.Center) { IconView(PICTURE_ICON, 28.dp, colors.ink3) } },
        wide = { Box(Modifier.fillMaxSize().padding(Tokens.s2), contentAlignment = Alignment.Center) { Txt(alt.ifEmpty { "Image" }, style) } },
    )
}

/** Phosphor's image icon (regular), as the core sends icons. */
internal const val PICTURE_ICON = "M216 40l-176 0c-9 0-16 7-16 16l0 144c0 9 7 16 16 16l176 0c9 0 16-7 16-16l0-144c0-9-7-16-16-16zM216 56l0 103-26-26c-3-3-7-5-11-5-5 0-9 2-12 5l-20 20-44-44c-6-7-16-7-22 0l-41 40 0-93zM40 172l52-52 80 80-132 0zM216 200l-21 0-36-36 20-20 37 37 0 19zM144 100c0-7 5-12 12-12 7 0 12 5 12 12 0 7-5 12-12 12-7 0-12-5-12-12z"

/**
 * How a block arrives (roadmap Q8): it fades in and rises 4 dp over the
 * tokens' base duration, drawn in its final place (alpha and translation
 * only, so nothing around it moves). Android scales or skips it with the
 * system's animation setting.
 */
@Composable
internal fun Modifier.appear(): Modifier {
    val a = remember { androidx.compose.animation.core.Animatable(0f) }
    val m = LocalMorphTheme.current.motion
    androidx.compose.runtime.LaunchedEffect(Unit) {
        a.animateTo(1f, androidx.compose.animation.core.tween(m.base, easing = androidx.compose.animation.core.CubicBezierEasing(m.ease[0], m.ease[1], m.ease[2], m.ease[3])))
    }
    return this.then(Modifier.graphicsLayer { alpha = a.value; translationY = (1f - a.value) * 4.dp.toPx() })
}
