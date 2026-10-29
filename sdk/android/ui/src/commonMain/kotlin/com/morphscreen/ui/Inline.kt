// Spans as an AnnotatedString: formatting, links, code, and components inside
// a sentence or a table cell (a Badge reads as a colored label).

package com.morphscreen.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.BaselineShift
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.em
import com.morphscreen.core.Attr
import com.morphscreen.core.Span

fun plainText(spans: List<Span>): String = buildString {
    for (s in spans) when (s) {
        is Span.Text -> append(keepIds(s.text))
        is Span.Code -> append(s.text)
        is Span.Format -> append(plainText(s.children))
        is Span.Link -> append(plainText(s.children))
        is Span.Element -> append(plainText(s.children))
        is Span.Image -> append(s.alt)
        Span.LineBreak -> append('\n')
    }
}

private val ID_MARKS = setOf('-', '/', ':', '.', '_', '\u2013')

/**
 * IDs, dates, times, versions and codes (a token with a digit and a - / : . or
 * _ inside) kept on one line: a word joiner after each of those marks.
 */
fun keepIds(text: String): String {
    // A dash between words ("lobbying—Microsoft"): the line may break after it, never before it.
    val t = if ('\u2014' !in text && '\u2013' !in text) text
    else buildString { text.forEachIndexed { i, c -> if ((c == '\u2014' || c == '\u2013') && i > 0 && !text[i - 1].isWhitespace()) append('\u2060'); append(c) } }
    if (t.none { it.isDigit() } && '@' !in t && '/' !in t) return t
    return t.split(' ').joinToString(" ") { tok ->
        // A long URL, path or code (a Wi-Fi QR payload): it may break after a
        // slash or semicolon, never inside a part, as the core's HTML does (a
        // zero-width space there; selectable text, code and math, is drawn raw).
        if (tok.length > 32 && ('/' in tok || ';' in tok)) return@joinToString Regex("(?<=[/;])").split(tok).filter { it.isNotEmpty() }.joinToString("\u200B") { part ->
            if (part.length > 32) part else buildString { for (c in part) { append(c); if (c in "-_.:") append('\u2060') } }
        }
        val core = tok.trim('(', ')', '[', ']', ',', ';', '"', '\'')
        // An email address is one piece too.
        val email = core.length <= 40 && '@' in core && '.' in core && "://" !in core
        if (!email && (core.length !in 3..32 || core.none { it.isDigit() } || core.none { it in ID_MARKS } || "://" in core)) tok
        else buildString { for (c in tok) { append(c); if (c in ID_MARKS || c == '@') append('\u2060') } }
    }
}

/** Only safe links open: http(s), mailto and tel. */
internal fun safeHref(href: String): Boolean {
    val h = href.trim().lowercase()
    return h.startsWith("https://") || h.startsWith("http://") || h.startsWith("mailto:") || h.startsWith("tel:")
}

@Composable
internal fun inlineText(spans: List<Span>): AnnotatedString {
    val c = colors
    return buildAnnotatedString { appendSpans(spans, c) }
}

private fun AnnotatedString.Builder.appendSpans(spans: List<Span>, c: MorphColors) {
    for (s in spans) when (s) {
        // Running text gets the same rules as labels: IDs, ranges and times never split.
        is Span.Text -> append(keepIds(s.text))
        is Span.Code -> withStyle(SpanStyle(fontFamily = FontFamily.Monospace, fontSize = 0.92.em, color = c.ink2, background = c.tile)) { append(keepIds(s.text)) }
        Span.LineBreak -> append('\n')
        // Shown under the text, as a photo or its description.
        is Span.Image -> {}
        is Span.Link ->
            if (safeHref(s.href)) {
                withLink(LinkAnnotation.Url(s.href, TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline)))) { appendSpans(s.children, c) }
            } else {
                appendSpans(s.children, c)
            }
        is Span.Format -> {
            val style = when (s.kind) {
                "strong" -> SpanStyle(fontWeight = FontWeight.SemiBold)
                "em" -> SpanStyle(fontStyle = FontStyle.Italic)
                "s" -> SpanStyle(textDecoration = TextDecoration.LineThrough)
                "u" -> SpanStyle(textDecoration = TextDecoration.Underline)
                "small" -> SpanStyle(fontSize = 0.85.em)
                "sub" -> SpanStyle(fontSize = 0.8.em, baselineShift = BaselineShift.Subscript)
                "sup" -> SpanStyle(fontSize = 0.8.em, baselineShift = BaselineShift.Superscript)
                "kbd" -> SpanStyle(fontFamily = FontFamily.Monospace)
                "mark" -> SpanStyle(background = c.warnBg)
                else -> SpanStyle()
            }
            withStyle(style) { appendSpans(s.children, c) }
        }
        is Span.Element -> {
            val label = plainText(s.children)
            when (s.type) {
                "Badge" -> {
                    val tone = (s.attrs["tone"] as? Attr.Str)?.value
                    val fg = c.tone(tone).first
                    withStyle(SpanStyle(color = fg, fontWeight = FontWeight.SemiBold, fontSize = 0.85.em)) {
                        if (tone != null && tone != "neutral") append("● ")
                        append(label)
                    }
                }
                "Button" -> withStyle(SpanStyle(color = c.info, fontWeight = FontWeight.SemiBold)) { append(label) }
                "Avatar" -> withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append((s.attrs["name"] as? Attr.Str)?.value ?: label) }
                // Inside a sentence: the stars' mark, the score and its count, in the text's flow.
                "Rating" -> {
                    withStyle(SpanStyle(color = c.warn)) { append("\u2605 ") }
                    withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append((s.attrs["value"] as? Attr.Str)?.value ?: label) }
                    (s.attrs["count"] as? Attr.Str)?.value?.let { n -> withStyle(SpanStyle(color = c.ink3)) { append(" ($n)") } }
                }
                else -> append(label.ifEmpty { (s.attrs["label"] as? Attr.Str)?.value ?: (s.attrs["value"] as? Attr.Str)?.value ?: "" })
            }
        }
    }
}

/** Inline images in a block, shown under its text. */
internal fun inlineImages(spans: List<Span>): List<Span.Image> = spans.flatMap { s ->
    when (s) {
        is Span.Image -> listOf(s)
        is Span.Format -> inlineImages(s.children)
        is Span.Link -> inlineImages(s.children)
        is Span.Element -> inlineImages(s.children)
        else -> emptyList()
    }
}

/** Asks with this text when tapped (a Button inside text). */
internal fun askTarget(spans: List<Span>): String? {
    for (s in spans) if (s is Span.Element && s.type == "Button") return (s.attrs["ask"] as? Attr.Str)?.value ?: plainText(s.children)
    return null
}
