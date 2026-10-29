// The interactive pack in Compose (roadmap Q7): a quiz that marks answers
// and reports the score, flashcards that flip, a poll, a checklist with
// progress, and what-if sliders whose results are worked out as they move.
// State lives here on the device; what the reader did goes back as actions.

package com.morphscreen.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.morphscreen.core.NodeData
import com.morphscreen.core.Span
import com.morphscreen.core.UINode
import com.morphscreen.core.get
import com.morphscreen.core.indices
import com.morphscreen.core.stateOf
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import com.morphscreen.core.parseInline
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.round
import kotlin.math.sqrt

/** A What-if formula's value (the core's postfix tokens, crate::formula). */
internal fun evaluate(rpn: List<String>, value: (String) -> Double?): Double? {
    val st = ArrayDeque<Double>()
    for (t in rpn) {
        when (t) {
            "+", "-", "*", "/", "^", "%", "min", "max" -> {
                val b = st.removeLastOrNull() ?: return null
                val a = st.removeLastOrNull() ?: return null
                if ((t == "/" || t == "%") && b == 0.0) return null
                st.addLast(
                    when (t) {
                        "+" -> a + b
                        "-" -> a - b
                        "*" -> a * b
                        "/" -> a / b
                        "%" -> a % b
                        "^" -> a.pow(b)
                        "min" -> min(a, b)
                        else -> max(a, b)
                    },
                )
            }
            "neg", "round", "floor", "ceil", "abs", "sqrt" -> {
                val a = st.removeLastOrNull() ?: return null
                st.addLast(
                    when (t) {
                        "neg" -> -a
                        "round" -> if (a < 0) -round(-a) else round(a)
                        "floor" -> floor(a)
                        "ceil" -> ceil(a)
                        "abs" -> abs(a)
                        else -> sqrt(a)
                    },
                )
            }
            else -> st.addLast(t.toDoubleOrNull() ?: value(t) ?: return null)
        }
    }
    val v = st.singleOrNull() ?: return null
    return if (v.isFinite()) v else null
}

/** A Result's number as the core writes it (a currency sign in front, other units after). */
/** A slider's number with its unit, the way a Result shows one, with no more decimals than it needs of those its numbers are written to; null without a unit. */
internal fun sliderText(v: Double, s: UINode): String? {
    val unit = s.attr("unit")?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val places = listOf("min", "max", "value", "step").maxOf { k -> s.attr(k)?.trim()?.substringAfter('.', "")?.trimEnd('0')?.length ?: 0 }.coerceAtMost(6)
    val d = (0 until places).firstOrNull { k -> val x = v * 10.0.pow(k); abs(x - round(x)) < 1e-9 * max(abs(x), 1.0) } ?: places
    return resultText(v, unit, d)
}

internal fun resultText(v: Double?, unit: String, decimals: Int?): String {
    if (v == null) return "—"
    val d = min(decimals ?: if (floor(v) == v) 0 else 2, 6)
    var scaled = abs(v)
    val factor = 10.0.pow(d)
    val whole = round(scaled * factor).toLong()
    val int = (whole / factor.toLong()).toString().reversed().chunked(3).joinToString(",").reversed()
    val frac = if (d == 0) "" else "." + (whole % factor.toLong()).toString().padStart(d, '0')
    val num = int + frac
    val sign = if (v < 0) "−" else ""
    val u = unit.trim()
    return when {
        u.isEmpty() -> sign + num
        u in setOf("$", "€", "£", "₹", "¥") -> sign + u + num
        u == "%" -> "$sign$num%"
        else -> "$sign$num $u"
    }
}

/** A slider's name in formulas: its name, or its label as one word ("Unit price ($)" is unit_price). */
internal fun sliderName(n: UINode): String {
    n.attr("name")?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
    val out = StringBuilder()
    for (c in (n.attr("label") ?: "").lowercase()) {
        if (c.isLetterOrDigit()) out.append(c) else if (out.isNotEmpty() && out.last() != '_') out.append('_')
    }
    return out.toString().trimEnd('_')
}

@Composable
private fun Title(t: String?) {
    if (!t.isNullOrBlank()) Txt(t, Type.callout.copy(fontWeight = FontWeight.SemiBold))
}

@Composable
private fun Progress(done: Int, total: Int, word: String) {
    val c = colors
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        LinearProgressIndicator(progress = { if (total == 0) 0f else done.toFloat() / total }, modifier = Modifier.widthIn(max = 220.dp).weight(1f, fill = false), color = c.ink, trackColor = c.tile)
        Txt("$done of $total $word", Type.footnote.copy(color = c.ink3))
    }
}

/** A choice row: a radio mark, the words, and once answered whether it was right. */
@Composable
private fun ChoiceRow(spans: List<Span>, chosen: Boolean, mark: String?, enabled: Boolean, onClick: () -> Unit) {
    val c = colors
    val shape = RoundedCornerShape(Radius)
    val tint = when (mark) {
        "Right" -> c.goodBg
        null -> Color.Transparent
        else -> c.badBg
    }
    Row(
        Modifier.fillMaxWidth().background(tint, shape).border(1.dp, if (mark == null) c.line else Color.Transparent, shape)
            .clickable(enabled = enabled, role = Role.RadioButton, onClick = onClick).padding(horizontal = Tokens.s3, vertical = Tokens.s2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.s2),
    ) {
        Box(Modifier.size(16.dp).border(1.5.dp, c.ink3, CircleShape), contentAlignment = Alignment.Center) {
            if (chosen) Box(Modifier.size(8.dp).background(c.ink, CircleShape))
        }
        Txt(inlineText(spans), Type.body, Modifier.weight(1f))
        if (mark != null) Txt(mark, Type.caption.copy(fontWeight = FontWeight.SemiBold, color = if (mark == "Right") c.good else c.bad))
    }
}

@Composable
internal fun QuizView(node: UINode) {
    val act = LocalAction.current
    val c = colors
    val store = LocalComponents.current
    val questions = node.children.filter { it.type == "Question" }
    // Each question's chosen answer, from the state {answers: [index or null]}.
    val saved = store[node.id]["answers"] as? JsonArray
    val picked: Map<String, Int> = questions.withIndex().mapNotNull { (k, q) -> (saved?.getOrNull(k) as? JsonPrimitive)?.doubleOrNull?.toInt()?.let { q.id to it } }.toMap()
    fun choices(q: UINode) = q.data as? NodeData.Choices
    val score = questions.count { q -> choices(q)?.answer?.let { picked[q.id] == it } == true }
    Column(Modifier.animateContentSize(tween(Tokens.FAST)), verticalArrangement = Arrangement.spacedBy(Tokens.s5)) {
        Title(node.attr("title"))
        for (q in questions) androidx.compose.runtime.key(q.id) {
            val ch = choices(q)
            val chosen = picked[q.id]
            Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                Txt(q.attr("text") ?: "", Type.headline)
                ch?.items?.forEachIndexed { k, it ->
                    val mark = when {
                        chosen == null -> null
                        k == ch.answer -> "Right"
                        k == chosen -> "Your answer"
                        else -> null
                    }
                    ChoiceRow(it, chosen == k, mark, enabled = chosen == null) {
                        val picked = picked + (q.id to k)
                        store.set(node.id, stateOf("answers" to JsonArray(questions.map { x -> picked[x.id]?.let { JsonPrimitive(it) } ?: JsonNull })))
                        if (picked.size == questions.size) {
                            val answers = questions.map { x ->
                                val xc = choices(x)
                                val i = picked[x.id] ?: 0
                                QuizAnswer(x.attr("text") ?: "", xc?.items?.getOrNull(i)?.let(::plainText) ?: "", xc?.answer?.let { it == i })
                            }
                            act(Action.Quiz(node.id, answers.count { it.right == true }, questions.size, answers))
                        }
                    }
                }
                if (chosen != null) q.attr("explain")?.takeIf { it.isNotBlank() }?.let { Txt(it, Type.callout.copy(color = c.ink2)) }
            }
        }
        if (questions.isNotEmpty() && picked.size == questions.size) Txt("$score of ${questions.size} right", Type.headline)
    }
}

@Composable
internal fun FlashcardsView(node: UINode) {
    val act = LocalAction.current
    val c = colors
    val rows = (node.data as? NodeData.Table)?.rows?.filter { it.isNotEmpty() } ?: emptyList()
    val store = LocalComponents.current
    val flipped = remember(node.id) { mutableStateMapOf<Int, Boolean>() }
    // The cards the reader knows, from the state {known: [index]}.
    val known = store[node.id]["known"].indices.toSet()
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s3)) {
        Title(node.attr("title"))
        Progress(known.size, rows.size, "known")
        ColumnsLayout(perRow = 3, minWidth = 150.dp, spacing = Tokens.s2) {
            rows.forEachIndexed { k, r ->
                val open = flipped[k] == true
                val isKnown = k in known
                val shape = RoundedCornerShape(Radius)
                Column(
                    Modifier.fillMaxWidth().heightIn(min = 96.dp).background(if (isKnown) c.goodBg else c.surface, shape)
                        .border(1.dp, if (isKnown) Color.Transparent else c.line, shape)
                        .clickable(role = Role.Button) { flipped[k] = !open }.padding(Tokens.s4).animateContentSize(tween(Tokens.FAST)),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(Tokens.s2, Alignment.CenterVertically),
                ) {
                    if (open) {
                        Txt(r[0], Type.footnote.copy(color = c.ink3, textAlign = TextAlign.Center))
                        Txt(inlineText(parseInline(r.drop(1).joinToString(" · "))), Type.body.copy(textAlign = TextAlign.Center))
                        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.s3)) {
                            for ((label, knew) in listOf("Got it" to true, "Again" to false)) {
                                Txt(
                                    label,
                                    Type.footnote.copy(fontWeight = FontWeight.SemiBold, color = if (knew) c.ink else c.ink3),
                                    Modifier.clickable(role = Role.Button) {
                                        val now = (if (knew) known + k else known - k).sorted()
                                        store.set(node.id, stateOf("known" to indices(now)))
                                        flipped[k] = false
                                        act(Action.State(node.id, "known", now.map { rows[it][0] }))
                                    }.padding(vertical = Tokens.s1),
                                )
                            }
                        }
                    } else {
                        Txt(inlineText(parseInline(r[0])), Type.headline.copy(textAlign = TextAlign.Center))
                    }
                }
            }
        }
    }
}

@Composable
internal fun PollView(node: UINode) {
    val act = LocalAction.current
    val c = colors
    val options = (node.attr("options") ?: "").split('|').map { it.trim() }.filter { it.isNotEmpty() }
    val store = LocalComponents.current
    // The reader's vote, from the state {vote: option or null}.
    val vote = (store[node.id]["vote"] as? JsonPrimitive)?.takeIf { it.isString }?.content
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        Txt(node.attr("label") ?: "", Type.headline)
        for (o in options) ChoiceRow(listOf(Span.Text(o)), vote == o, null, enabled = vote == null) {
            store.set(node.id, stateOf("vote" to JsonPrimitive(o)))
            act(Action.Vote(node.id, node.attr("name") ?: "", o))
        }
        vote?.let { v ->
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                Txt("You voted for $v.", Type.footnote.copy(color = c.ink2))
                Txt("Change vote", Type.footnote.copy(color = c.ink, textDecoration = TextDecoration.Underline), Modifier.clickable(role = Role.Button) { store.set(node.id, stateOf("vote" to JsonNull)) })
            }
        }
    }
}

@Composable
internal fun ChecklistView(node: UINode) {
    val act = LocalAction.current
    val c = colors
    val store = LocalComponents.current
    val items = (node.data as? NodeData.Checks)?.items ?: emptyList()
    // Ticked items, from the state {done: [index]}; until there is one, as the model wrote them.
    val marked = store[node.id]["done"]?.let { it.indices.toSet() }
    val done = items.indices.map { marked?.contains(it) ?: items[it].done }
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
        Title(node.attr("title"))
        Progress(done.count { it }, items.size, "done")
        items.forEachIndexed { k, it ->
            val on = done[k]
            Row(
                Modifier.fillMaxWidth().clickable(role = Role.Checkbox) {
                    val now = items.indices.filter { i -> if (i == k) !on else done[i] }
                    store.set(node.id, stateOf("done" to indices(now)))
                    act(Action.State(node.id, node.attr("name") ?: "", now.map { i -> plainText(items[i].spans) }))
                }.semantics { stateDescription = if (on) "done" else "not done" }.padding(vertical = Tokens.s1),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Tokens.s2),
            ) {
                Box(Modifier.size(16.dp).background(if (on) c.ink else Color.Transparent, RoundedCornerShape(3.dp)).border(1.5.dp, if (on) c.ink else c.ink3, RoundedCornerShape(3.dp)), contentAlignment = Alignment.Center) {
                    if (on) Txt("✓", Type.caption.copy(color = c.surface, fontWeight = FontWeight.Bold))
                }
                Txt(inlineText(it.spans), Type.body.copy(color = if (on) c.ink3 else c.ink, textDecoration = if (on) TextDecoration.LineThrough else null), Modifier.weight(1f))
            }
        }
    }
}

/** A What-if's own sliders or results, wherever they sit in it (in Columns, say), not a What-if's inside it. */
private fun UINode.own(type: String): List<UINode> = children.flatMap { k -> if (k.type == type) listOf(k) else if (k.type == "WhatIf") emptyList() else k.own(type) }

@Composable
internal fun WhatIfView(node: UINode) {
    val c = colors
    val sliders = node.own("Slider")
    val results = node.own("Result")
    val store = LocalComponents.current
    // Where the sliders are, from the state {values: {name: number}}.
    val values: Map<String, Double> = (store[node.id]["values"] as? JsonObject)?.mapNotNull { (k, v) -> (v as? JsonPrimitive)?.doubleOrNull?.let { k to it } }?.toMap() ?: emptyMap()
    fun start(s: UINode) = (s.attr("value") ?: s.attr("min"))?.toDoubleOrNull() ?: 0.0
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s3)) {
        Title(node.attr("title"))
        for (s in sliders) androidx.compose.runtime.key(s.id) {
            val name = sliderName(s)
            val lo = s.attr("min")?.toDoubleOrNull() ?: 0.0
            val hi = max(s.attr("max")?.toDoubleOrNull() ?: 100.0, lo + 1)
            val step = s.attr("step")?.toDoubleOrNull()?.takeIf { it > 0 } ?: 1.0
            val v = values[name] ?: start(s)
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(Modifier.fillMaxWidth()) {
                    Txt(s.attr("label") ?: name, Type.footnote.copy(fontWeight = FontWeight.SemiBold), Modifier.weight(1f))
                    Txt(sliderText(v, s) ?: if (floor(v) == v) v.toLong().toString() else ((v * 100).toLong() / 100.0).toString(), Type.footnote.copy(fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum"))
                }
                val steps = ((hi - lo) / step).toInt() - 1
                Slider(
                    value = v.toFloat(),
                    onValueChange = { x ->
                        val moved = lo + round((x - lo) / step) * step
                        store.set(node.id, stateOf("values" to JsonObject(sliders.associate { sl -> sliderName(sl) to JsonPrimitive(if (sliderName(sl) == name) moved else values[sliderName(sl)] ?: start(sl)) })))
                    },
                    valueRange = lo.toFloat()..hi.toFloat(),
                    steps = if (steps in 1..200) steps else 0,
                    colors = SliderDefaults.colors(thumbColor = c.ink, activeTrackColor = c.ink, inactiveTrackColor = c.line2, activeTickColor = Color.Transparent, inactiveTickColor = Color.Transparent),
                )
            }
        }
        for (r in results) androidx.compose.runtime.key(r.id) {
            val rpn = (r.data as? NodeData.Formula)?.rpn ?: emptyList()
            val value = evaluate(rpn) { name -> sliders.firstOrNull { sliderName(it).equals(name, ignoreCase = true) }?.let { values[sliderName(it)] ?: start(it) } }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                Txt(r.attr("label") ?: "", Type.body, Modifier.weight(1f))
                Txt(resultText(value, r.attr("unit") ?: "", r.attr("decimals")?.toIntOrNull()), Type.title3.copy(fontFeatureSettings = "tnum"))
            }
        }
        Spacer(Modifier.size(0.dp))
    }
}
