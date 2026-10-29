// Layout checker for Compose (roadmap Q2): the defects bench/quality/check.js
// finds in a browser, read here from Compose's semantics tree and each text's
// layout. Every finished answer is laid out at phone and chat-column widths.
//   cd sdk/android && ./gradlew :bench:layoutCheck --args="../../bench/raw/nemotron-v03 ../../bench/raw/packs-data"
// Writes ../quality/compose-results.json (the scoreboard reads it).
// Charts draw their labels on a canvas, outside the semantics tree, so chart
// text isn't checked here (the web checker reads it from the SVG).

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.graphics.toAwtImage
import androidx.compose.ui.test.runDesktopComposeUiTest
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.unit.dp
import com.morphscreen.core.Answer
import com.morphscreen.ui.AnswerView
import com.morphscreen.ui.MorphColors
import com.morphscreen.ui.MediaPolicy
import java.io.File
import java.util.Locale

private val PACKS = listOf("data", "commerce", "scheduling", "media", "docs", "inputs", "device", "interactive")
private val WIDTHS = listOf(390, 760)

data class Defect(val kind: String, val at: String, val detail: String)

private fun q(s: String) = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ") + "\""

/** A word made of letters, digits and joiners, with the punctuation around it dropped. */
private fun token(t: String, at: Int): String {
    var a = at
    var b = at
    while (a > 0 && !t[a - 1].isWhitespace()) a--
    while (b < t.length && !t[b].isWhitespace()) b++
    return t.substring(a, b).replace("⁠", "").trim('(', ')', '[', ']', ',', ';', ':', '.', '!', '?', '"', '\'', '“', '”', '‘', '’')
}

private fun textDefects(t: String, r: TextLayoutResult, heading: Boolean, out: MutableList<Defect>) {
    val at = t.take(48)
    // Smallest size anywhere in the text, in dp (the scene runs at density 1).
    val sizes = listOf(r.layoutInput.style.fontSize) + r.layoutInput.text.spanStyles.map { it.item.fontSize }
    val px = sizes.filter { it.isSp }.minOfOrNull { it.value }
    if (px != null && px < 11f && t.isNotBlank()) out += Defect("tiny-text", at, "${px}sp")
    // Cut off: lines dropped, an ellipsis, or a line wider than the box it's in.
    // (hasVisualOverflow can't tell: short text gets a box narrower than the
    // width it was laid out at.)
    val ellipsis = (0 until r.lineCount).any { r.isLineEllipsized(it) }
    val wide = (0 until r.lineCount).any { r.getLineRight(it) - r.getLineLeft(it) > r.size.width + 2 }
    val cut = r.multiParagraph.height > r.size.height + 1
    if (cut || ellipsis || wide) out += Defect("clipped-text", at, if (ellipsis) "ellipsis" else if (wide) "wider than its box (${(0 until r.lineCount).maxOf { r.getLineRight(it) - r.getLineLeft(it) }} in ${r.size.width})" else "${r.lineCount} lines, some cut (${r.multiParagraph.height} in ${r.size.height}, max ${r.layoutInput.constraints.maxHeight})")
    val hyphens = r.layoutInput.style.hyphens == Hyphens.Auto
    for (i in 0 until r.lineCount - 1) {
        val end = r.getLineEnd(i)
        if (end <= 0 || end >= t.length) continue
        // The last visible character before the break (break hints are invisible).
        var b = end - 1
        while (b > 0 && (t[b] == '\u200B' || t[b] == '\u2060')) b--
        val before = t[b]
        val next = t[end]
        if (before.isWhitespace() || next.isWhitespace()) continue
        // Code wraps where it must, as in the browser (the web checker skips it too).
        val mono = r.layoutInput.text.spanStyles.any { it.start <= end - 1 && end <= it.end && it.item.fontFamily == FontFamily.Monospace } || r.layoutInput.style.fontFamily == FontFamily.Monospace
        if (mono) continue
        val tok = token(t, end)
        val split = "\"${t.substring(maxOf(0, end - 8), end)}|${t.substring(end, minOf(t.length, end + 8))}\""
        val id = tok.any { it.isDigit() } || (Regex("[A-Z]{2}").containsMatchIn(tok) && before != '-' && before != '/')
        when {
            // A URL, path or code may break after its slash or semicolon (where the renderers put break points).
            before == '/' || before == ';' -> {}
            id -> out += Defect("broken-id", at, split)
            before in "-/–—_." -> {}
            hyphens && tok.all { it.isLetter() || it == '-' } -> {}
            else -> out += Defect("broken-word", at, split)
        }
    }
    val chars = t.trim().length
    if ('\n' !in t && chars >= 40 && r.lineCount >= 3 && chars / r.lineCount < 16) out += Defect("cramped-text", at, "${r.lineCount} lines, ${chars / r.lineCount} characters each")
    if (heading && r.lineCount >= 2 && t.trim().split(Regex("\\s+")).size >= 3) {
        val last = t.substring(r.getLineStart(r.lineCount - 1)).trim()
        if (last.isNotEmpty() && !last.contains(' ')) out += Defect("stranded-word", at, "\"…| $last\"")
    }
}

@OptIn(ExperimentalTestApi::class)
fun check(text: String, widthDp: Int, shot: String? = null): List<Defect> {
    val answer = Answer(PACKS).apply { push(text); finish() }
    val out = ArrayList<Defect>()
    runDesktopComposeUiTest(width = widthDp, height = 1600) {
        val pad = if (widthDp < 600) 16.dp else 24.dp
        // CHECK_THEME=dark or mono for the theme review.
        val colors = when (System.getenv("CHECK_THEME")) { "dark" -> MorphColors.Dark; "mono" -> MorphColors.Mono; else -> MorphColors.Light }
        // CHECK_HOSTS=127.0.0.1,cdn.example.com: photos load from those hosts (and nothing else does).
        val media = MediaPolicy(hosts = System.getenv("CHECK_HOSTS")?.split(",")?.filter { it.isNotBlank() } ?: emptyList())
        setContent {
            Box(Modifier.fillMaxWidth().background(colors.page).verticalScroll(rememberScrollState()).padding(pad)) {
                AnswerView(answer, colors = colors, media = media)
            }
        }
        waitForIdle()
        if (media != null) repeat(3) {
            Thread.sleep(1500)
            waitForIdle()
        }
        if (shot != null) javax.imageio.ImageIO.write(onRoot().captureToImage().toAwtImage(), "png", File("$shot-$widthDp.png"))
        val nodes = onAllNodes(SemanticsMatcher("any") { true }, useUnmergedTree = true).fetchSemanticsNodes()
        val right = widthDp.toFloat()
        val over = HashSet<Int>()
        for (n in nodes) {
            if (n.boundsInRoot.right > right + 1 && n.boundsInRoot.width > 0) over += n.id
            val action = n.config.getOrNull(SemanticsActions.GetTextLayoutResult)?.action ?: continue
            val results = ArrayList<TextLayoutResult>()
            if (action(results) != true) continue
            val r = results.firstOrNull() ?: continue
            val heading = n.config.getOrNull(SemanticsProperties.Heading) != null
            textDefects(r.layoutInput.text.text, r, heading, out)
        }
        // Report the outermost thing past the edge, not everything inside it.
        fun parentOver(n: SemanticsNode): Boolean = n.parent?.let { it.id in over } ?: false
        for (n in nodes) if (n.id in over && !parentOver(n)) {
            val label = n.config.getOrNull(SemanticsProperties.Text)?.joinToString(" ")?.take(48) ?: "node ${n.id}"
            out += Defect("overflow", label, "${(n.boundsInRoot.right - right).toInt()}dp past the edge")
        }
    }
    answer.close()
    return out
}

fun main(args: Array<String>) {
    val dirs = args.map(::File).ifEmpty { listOf(File("../raw/nemotron-v03")) }
    val rows = ArrayList<String>()
    val perWidth = WIDTHS.associateWith { HashMap<String, Int>() }
    val clean = WIDTHS.associateWith { 0 }.toMutableMap()
    var answers = 0
    for (dir in dirs) {
        val files = dir.listFiles { f -> f.name.startsWith("ours__") && f.name.endsWith(".txt") }!!.sortedBy { it.name }
        for (f in files) {
            val brief = f.name.removePrefix("ours__").removeSuffix(".txt")
            if (!File(dir, "openuichat__$brief.txt").exists()) continue
            answers++
            for (w in WIDTHS) {
                val d = check(f.readText(), w, System.getenv("CHECK_SHOT")?.let { "$it-$brief" })
                if (d.isEmpty()) clean[w] = clean.getValue(w) + 1
                for (x in d) perWidth.getValue(w).merge(x.kind, 1, Int::plus)
                rows += "{\"label\":${q(dir.name)},\"brief\":${q(brief)},\"width\":$w,\"defects\":[" + d.joinToString(",") { "{\"kind\":${q(it.kind)},\"at\":${q(it.at)},\"detail\":${q(it.detail)}}" } + "]}"
                println("${dir.name}/$brief @$w: ${d.size} defects" + if (d.isEmpty()) "" else "  " + d.groupingBy { it.kind }.eachCount())
                if (System.getenv("CHECK_VERBOSE") != null) d.take(12).forEach { println("   $it") }
            }
        }
    }
    val summary = WIDTHS.joinToString(",") { w ->
        val by = perWidth.getValue(w)
        val total = by.values.sum()
        "\"$w\":{\"answers\":$answers,\"ours\":{\"layoutPerAnswer\":${String.format(Locale.ROOT, "%.2f", total.toDouble() / maxOf(1, answers))},\"cleanLayout\":${clean.getValue(w)},\"by\":{" +
            by.entries.sortedBy { it.key }.joinToString(",") { "${q(it.key)}:${it.value}" } + "}}}"
    }
    val theme = System.getenv("CHECK_THEME")
    // CHECK_OUT=file.json writes the results elsewhere (a one-off run).
    File(System.getenv("CHECK_OUT") ?: if (theme != null) "../quality/compose-results-$theme.json" else "../quality/compose-results.json").writeText("{\"summary\":{$summary},\"rows\":[\n" + rows.joinToString(",\n") + "]}\n")
    println("{$summary}")
}
