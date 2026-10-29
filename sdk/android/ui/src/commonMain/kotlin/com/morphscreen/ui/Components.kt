// Layout and display components: Card, Columns, Tabs, Details, Steps,
// Callout, Stat, Badge, Progress, Avatar, Gallery, FollowUps, Button.

package com.morphscreen.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.morphscreen.core.NodeData
import com.morphscreen.core.Span
import com.morphscreen.core.UINode
import kotlin.math.roundToInt

@Composable
internal fun CardView(node: UINode) {
    val inTile = LocalInTile.current
    val nested = node.cardDepth > 0
    val c = colors
    val shape = RoundedCornerShape(Radius)
    val frame = when {
        inTile -> Modifier.background(c.tile, shape).padding(Tokens.s4)
        nested -> Modifier
        else -> Modifier.background(c.surface, shape).border(1.dp, c.line, shape).padding(Tokens.s5)
    }
    CompositionLocalProvider(LocalInTile provides false) {
        // In a Columns row every tile is as tall as the tallest.
        val fill = if (inTile) Modifier.fillMaxHeight() else Modifier
        Column(Modifier.fillMaxWidth().then(fill).then(frame), verticalArrangement = Arrangement.spacedBy(Tokens.s3)) {
            val title = node.attr("title")
            val subtitle = node.attr("subtitle")
            if (title != null || subtitle != null) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    if (title != null) {
                        val icon = node.icon
                        if (icon == null) {
                            Txt(title, if (nested || inTile) Type.headline else Type.title2, Modifier.semantics { heading() })
                        } else {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                                IconView(icon, if (nested || inTile) 17.dp else 21.dp, c.ink3)
                                Txt(title, if (nested || inTile) Type.headline else Type.title2, Modifier.weight(1f, fill = false).semantics { heading() })
                            }
                        }
                    }
                    if (subtitle != null) Txt(subtitle, Type.callout.copy(color = c.ink3))
                }
            }
            val photo = if (!nested && !inTile) leadPhoto(node) else null
            if (photo == null) {
                Children(node.children)
            } else {
                // A photo first and only text after it: beside the text when there's room.
                ByWidth(
                    560.dp,
                    narrow = { Children(node.children) },
                    wide = {
                        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.s5)) {
                            Box(Modifier.width(260.dp)) { Photo(photo.src, photo.alt, photo.credit) }
                            Children(node.children.drop(1), modifier = Modifier.weight(1f))
                        }
                    },
                )
            }
        }
    }
}

/** A card's leading photo: it opens with a paragraph that is only a photo and holds nothing but text after it. */
internal fun leadPhoto(node: UINode): Span.Image? {
    val first = node.children.firstOrNull() ?: return null
    if (first.type != "p" || node.children.size < 2) return null
    val images = inlineImages(first.spans)
    if (images.size != 1 || images[0].src == "find" || plainText(first.spans.filter { it !is Span.Image }).isNotBlank()) return null
    return if (node.children.drop(1).all { it.type in setOf("p", "ul", "ol", "quote", "h") }) images[0] else null
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ColumnsView(node: UINode) {
    val items = node.children
    if (items.isNotEmpty() && items.all { it.type == "Button" }) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.s2), verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
            for (b in items) androidx.compose.runtime.key(b.id) { NodeView(b) }
        }
        return
    }
    // The core's plan once the Columns close; until then a guess from what has arrived.
    val layout = node.data as? NodeData.Layout
    val (guess, rich) = columnsPlan(items)
    val per = layout?.per ?: guess
    val min = layout?.min ?: if (rich) 200 else 140
    val c = colors
    CompositionLocalProvider(LocalInTile provides true) {
        ColumnsLayout(per, min.dp) {
            for (item in items) androidx.compose.runtime.key(item.id) {
                val tile = if (item.type == "group") Modifier.background(c.tile, RoundedCornerShape(Radius)).padding(Tokens.s4) else Modifier
                Box(Modifier.fillMaxSize().then(tile)) { NodeView(item) }
            }
        }
    }
}

@Composable
internal fun TabsView(node: UINode) {
    val tabs = node.children.filter { it.type == "Tab" }
    var selected by rememberSaveable(node.id) { mutableIntStateOf(0) }
    val c = colors
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s3)) {
        Column {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                tabs.forEachIndexed { k, t ->
                    Column(
                        Modifier.clickable(role = Role.Tab) { selected = k }.semantics { this.selected = k == selected },
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Txt(t.attr("title") ?: "Tab ${k + 1}", Type.callout.copy(fontWeight = FontWeight.Medium, color = if (k == selected) c.ink else c.ink3))
                        Spacer(Modifier.height(6.dp))
                        Box(Modifier.height(2.dp).widthIn(min = 24.dp).background(if (k == selected) c.ink else androidx.compose.ui.graphics.Color.Transparent))
                    }
                }
            }
            Rule()
        }
        if (selected < tabs.size) Children(tabs[selected].children)
    }
}

@Composable
internal fun DetailsView(node: UINode) {
    var open by rememberSaveable(node.id) { mutableStateOf(node.flag("open")) }
    val c = colors
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        Row(Modifier.clickable(role = Role.Button) { open = !open }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Chevron(Modifier.rotate(if (open) 90f else 0f))
            Txt(node.attr("title") ?: "", Type.body.copy(fontWeight = FontWeight.Medium))
        }
        if (open) Children(node.children, modifier = Modifier.padding(start = 18.dp))
    }
}

@Composable
private fun Chevron(modifier: Modifier = Modifier) {
    val ink3 = colors.ink3
    Canvas(modifier.size(12.dp)) {
        val p = Path().apply {
            moveTo(size.width * 0.35f, size.height * 0.2f)
            lineTo(size.width * 0.7f, size.height * 0.5f)
            lineTo(size.width * 0.35f, size.height * 0.8f)
        }
        drawPath(p, ink3, style = Stroke(1.6.dp.toPx(), cap = StrokeCap.Round))
    }
}

@Composable
internal fun StepsView(node: UINode) {
    val c = colors
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        node.children.filter { it.type == "Step" }.forEachIndexed { k, step ->
            val status = step.attr("status") ?: "todo"
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.s3)) {
                Box(
                    Modifier.size(22.dp).clip(CircleShape)
                        .background(if (status == "done") c.ink else c.surface)
                        .border(1.5.dp, if (status == "todo") c.line2 else c.ink, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    if (status == "done") Tick(c.surface, Modifier.size(10.dp))
                    else Txt("${k + 1}", Type.caption.copy(fontWeight = FontWeight.SemiBold, color = if (status == "current") c.ink else c.ink3))
                }
                Column(verticalArrangement = Arrangement.spacedBy(Tokens.s1)) {
                    Txt(step.attr("title") ?: "", Type.body.copy(fontWeight = if (status == "todo") FontWeight.Normal else FontWeight.SemiBold, color = if (status == "todo") c.ink2 else c.ink))
                    step.attr("subtitle")?.takeIf { it.isNotBlank() }?.let { Txt(it, Type.footnote.copy(color = c.ink3)) }
                    CompositionLocalProvider(LocalMorphColors provides c.copy(ink = c.ink3)) { Children(step.children, spacing = 6.dp) }
                }
            }
        }
    }
}

/** A drawn check mark (no icon font needed). */
@Composable
internal fun Tick(color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val p = Path().apply {
            moveTo(size.width * 0.1f, size.height * 0.55f)
            lineTo(size.width * 0.4f, size.height * 0.85f)
            lineTo(size.width * 0.92f, size.height * 0.18f)
        }
        drawPath(p, color, style = Stroke(1.8.dp.toPx(), cap = StrokeCap.Round))
    }
}

/** A checkbox square, ticked or not. */
@Composable
internal fun CheckMark(checked: Boolean, modifier: Modifier = Modifier) {
    val c = colors
    val shape = RoundedCornerShape(3.dp)
    Box(
        modifier.size(16.dp).clip(shape).background(if (checked) c.ink else c.surface).border(1.5.dp, if (checked) c.ink else c.ink3, shape),
        contentAlignment = Alignment.Center,
    ) { if (checked) Tick(c.surface, Modifier.size(10.dp)) }
}

@Composable
internal fun CalloutView(node: UINode) {
    val tone = node.attr("tone") ?: "info"
    val c = colors
    val (fg, bg) = if (tone == "neutral") c.ink3 to c.tile else c.tone(tone)
    Row(
        Modifier.fillMaxWidth().background(bg, RoundedCornerShape(Radius)).padding(horizontal = Tokens.s4, vertical = Tokens.s3),
        horizontalArrangement = Arrangement.spacedBy(Tokens.s3),
    ) {
        Box(Modifier.padding(top = 7.dp).size(8.dp).background(fg, CircleShape))
        Column(verticalArrangement = Arrangement.spacedBy(Tokens.s1)) {
            node.attr("title")?.let { Txt(it, Type.body.copy(fontWeight = FontWeight.SemiBold)) }
            CompositionLocalProvider(LocalMorphColors provides c.copy(ink = c.ink2)) { Children(node.children, spacing = 4.dp) }
        }
    }
}

@Composable
internal fun StatView(node: UINode) {
    val inTile = LocalInTile.current
    val c = colors
    val change = node.attr("change") ?: ""
    val tone = node.attr("tone")?.takeIf { it != "neutral" }
    val changeColor = tone?.let { c.tone(it).first } ?: if (change.startsWith("-") || change.startsWith("−")) c.bad else c.good
    val frame = if (inTile) Modifier else Modifier.background(c.tile, RoundedCornerShape(Radius)).padding(Tokens.s3)
    Column(Modifier.fillMaxWidth().then(frame), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (tone != null && change.isEmpty()) Box(Modifier.size(6.dp).background(c.tone(tone).first, CircleShape))
            node.icon?.let { IconView(it, 14.dp, c.ink3) }
            Txt(node.attr("label") ?: "", Type.footnote.copy(color = c.ink2), Modifier.weight(1f, fill = false))
        }
        Txt(node.attr("value") ?: "", Type.title2.copy(fontFeatureSettings = "tnum"), maxLines = 2)
        if (change.isNotEmpty()) Txt(change, Type.caption.copy(fontWeight = FontWeight.SemiBold, color = changeColor))
        node.attr("note")?.let { Txt(it, Type.caption.copy(color = c.ink3)) }
    }
}

@Composable
internal fun BadgeView(node: UINode) {
    val tone = node.attr("tone") ?: "neutral"
    val (fg, bg) = colors.tone(tone)
    Row(
        Modifier.background(bg, RoundedCornerShape(4.dp)).heightIn(min = 20.dp).padding(horizontal = 7.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        if (tone != "neutral") Box(Modifier.size(6.dp).background(fg, CircleShape))
        Txt(inlineText(node.spans), Type.caption.copy(fontWeight = FontWeight.SemiBold, color = fg))
    }
}

@Composable
internal fun ProgressView(node: UINode) {
    val c = colors
    val max = node.attr("max")?.toDoubleOrNull() ?: 100.0
    val value = node.attr("value")?.toDoubleOrNull() ?: 0.0
    val pct = if (max > 0) (value / max).coerceIn(0.0, 1.0) else 0.0
    val tone = node.attr("tone")
    val bar = if (tone == null || tone == "neutral") c.ink else c.tone(tone).first
    Column(
        Modifier.fillMaxWidth().semantics { progressBarRangeInfo = ProgressBarRangeInfo(pct.toFloat(), 0f..1f) },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(Tokens.s2)) {
            Txt(node.attr("label") ?: "", Type.callout.copy(color = c.ink2), Modifier.weight(1f))
            Txt("${(pct * 100).roundToInt()}%", Type.footnote.copy(color = c.ink3, fontFeatureSettings = "tnum"), maxLines = 1)
        }
        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(c.line)) {
            Box(Modifier.fillMaxWidth(pct.toFloat()).height(6.dp).background(bar))
        }
    }
}

@Composable
internal fun AvatarView(name: String, subtitle: String?, src: String?) {
    val c = colors
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.s3)) {
        Box(Modifier.size(40.dp).clip(CircleShape).background(c.tile), contentAlignment = Alignment.Center) {
            val initials = name.split(" ").filter { it.isNotEmpty() }.take(2).joinToString("") { it.first().uppercase() }
            // A photo from somewhere not allowed can't show, and its description (the name) won't fit: initials.
            val url = src?.let { LocalMedia.current.url(it) }
            if (url != null) LocalImage.current(url, name, Modifier.size(40.dp)) else Txt(initials, Type.footnote.copy(fontWeight = FontWeight.SemiBold, color = c.ink2))
        }
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Txt(name, Type.body.copy(fontWeight = FontWeight.SemiBold))
            if (subtitle != null) Txt(subtitle, Type.footnote.copy(color = c.ink3))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun GalleryView(node: UINode) {
    val images = (node.data as? NodeData.Images)?.images ?: emptyList()
    val c = colors
    // One item a line: the photo, then its caption and credit. Three across, two on a phone, as on the web.
    ColumnsLayout(perRow = 3, minWidth = 130.dp, spacing = Tokens.s2) {
        for (img in images) {
            Column(verticalArrangement = Arrangement.spacedBy(Tokens.s1)) {
                Photo(img.src, img.alt, aspect = 4f / 3f)
                val cap = img.caption
                val name = (cap.firstOrNull() as? Span.Format)?.takeIf { it.kind == "strong" }
                if (name != null) {
                    Txt(plainText(name.children), Type.footnote.copy(fontWeight = FontWeight.SemiBold))
                    if (plainText(cap.drop(1)).isNotBlank()) Txt(inlineText(cap.drop(1)), Type.footnote.copy(color = c.ink2))
                } else if (cap.isNotEmpty()) {
                    Txt(inlineText(cap), Type.footnote.copy(color = c.ink2))
                }
                if (img.credit.isNotEmpty() && LocalMedia.current.url(img.src) != null) Txt(inlineText(img.credit), Type.caption.copy(color = c.ink3))
            }
        }
        for (n in node.children) androidx.compose.runtime.key(n.id) { NodeView(n) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun FollowUpsView(node: UINode) {
    val items = (node.data as? NodeData.Items)?.items ?: emptyList()
    val act = LocalAction.current
    val c = colors
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.s2), verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        for (q in items) {
            val shape = RoundedCornerShape(Radius)
            Row(
                Modifier.clip(shape).border(1.dp, c.line2, shape).clickable(role = Role.Button) { act(Action.Ask(plainText(q), node.id)) }
                    .padding(horizontal = Tokens.s3, vertical = 5.dp),
                horizontalArrangement = Arrangement.spacedBy(Tokens.s1),
            ) {
                // A long question wraps and leaves the arrow its room.
                Txt(inlineText(q), Type.callout.copy(color = c.ink2), Modifier.weight(1f, fill = false))
                Txt("→", Type.callout.copy(color = c.ink3))
            }
        }
    }
}

@Composable
internal fun ButtonView(node: UINode) {
    val act = LocalAction.current
    val form = LocalForm.current
    val uri = LocalUriHandler.current
    val c = colors
    val variant = node.attr("variant") ?: "primary"
    val size = node.attr("size") ?: "medium"
    val disabled = node.flag("disabled")
    val shape = RoundedCornerShape(Radius)
    val label = plainText(node.spans).ifEmpty { node.attr("label") ?: "" }
    val style = when (size) {
        "small" -> Type.footnote
        "large" -> Type.body
        else -> Type.callout
    }.copy(
        fontWeight = FontWeight.SemiBold,
        color = when (variant) {
            "primary" -> c.primaryInk
            "danger" -> c.bad
            "tertiary" -> c.ink2
            else -> c.ink
        },
    )
    val frame = when (variant) {
        "primary" -> Modifier.background(c.primary, shape)
        "danger" -> Modifier.background(c.badBg, shape)
        "secondary" -> Modifier.border(1.dp, c.line2, shape)
        else -> Modifier
    }
    Box(
        Modifier.clip(shape).then(frame)
            .clickable(enabled = !disabled, role = Role.Button) {
                val href = node.attr("href")
                val ask = node.attr("ask")
                when {
                    href != null && safeHref(href) -> uri.openUri(href)
                    !ask.isNullOrEmpty() -> act(Action.Ask(ask, node.id))
                    form != null -> act(form.submit(label))
                    else -> act(Action.Ask(label, node.id))
                }
            }
            .semantics { if (disabled) this.disabled() }
            .heightIn(min = if (size == "small") 28.dp else if (size == "large") 44.dp else 36.dp)
            .padding(horizontal = if (size == "small") 10.dp else if (size == "large") 20.dp else 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        val color = if (disabled) style.color.copy(alpha = 0.4f) else style.color
        val icon = node.icon
        if (icon == null) {
            Txt(label, style.copy(color = color, textAlign = androidx.compose.ui.text.style.TextAlign.Center))
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                IconView(icon, if (size == "small") 13.dp else 15.dp, color)
                Txt(label, style.copy(color = color, textAlign = androidx.compose.ui.text.style.TextAlign.Center), Modifier.weight(1f, fill = false))
            }
        }
    }
}
