// The op stream the core sends (spec/format.md, "Op stream"), decoded.

package com.morphscreen.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.doubleOrNull

sealed interface Attr {
    data class Str(val value: String) : Attr
    /** Written bare: `<Switch value>`. */
    data object Flag : Attr
}

typealias Attrs = Map<String, Attr>

/** Inline content (spec/format.md, "Spans"). */
sealed interface Span {
    data class Text(val text: String) : Span
    data class Code(val text: String) : Span
    /** strong, em, s, u, small, sub, sup, kbd, mark. */
    data class Format(val kind: String, val children: List<Span>) : Span
    data class Link(val href: String, val children: List<Span>) : Span
    /** `credit` is the image's title: who made it and its license, with links. */
    data class Image(val src: String, val alt: String, val credit: List<Span> = emptyList()) : Span
    data object LineBreak : Span
    /** A component inside a sentence or table cell. */
    data class Element(val type: String, val attrs: Attrs, val children: List<Span>) : Span
}

/** A Checklist item and whether it's done. */
data class CheckItem(val done: Boolean, val spans: List<Span>)

/** A Gallery's image, its credit, and the words after it on its line. */
data class GalleryImage(val src: String, val alt: String, val credit: List<Span> = emptyList(), val caption: List<Span> = emptyList())

/** What a component's content parsed to, or a table's right-aligned columns. */
sealed interface NodeData {
    data class Table(val columns: List<String>, val rows: List<List<String>>) : NodeData
    data class Items(val items: List<List<Span>>) : NodeData
    data class Images(val images: List<GalleryImage>) : NodeData
    data class Align(val right: List<Boolean>) : NodeData
    /** Worked out by the core: a Math formula as Unicode, a QR code's rows ("1" dark). */
    data class Lines(val lines: List<String>) : NodeData
    /** Columns: the most cells a row holds and the narrowest a cell may get (dp). */
    data class Layout(val per: Int, val min: Int) : NodeData
    /** A Question's choices and which is right (null: the answer named none). */
    data class Choices(val items: List<List<Span>>, val answer: Int?) : NodeData
    /** A Checklist's items. */
    data class Checks(val items: List<CheckItem>) : NodeData
    /** A What-if Result: its formula in postfix tokens and its starting value. */
    data class Formula(val rpn: List<String>, val value: Double?) : NodeData
}

sealed interface Op {
    /** [icon] is the node's icon as path data (Phosphor's 256-unit grid), when it has one. */
    data class Open(val id: String, val type: String, val attrs: Attrs, val icon: String? = null) : Op
    data class Spans(val id: String, val spans: List<Span>) : Op
    data class Close(val id: String, val data: NodeData?) : Op
    /** A leaf that opened and closed within one push. */
    data class Node(val id: String, val type: String, val attrs: Attrs, val spans: List<Span>?, val data: NodeData?, val icon: String? = null) : Op
    data class Diag(val line: Int, val cls: String, val detail: String, val error: Boolean) : Op
    data class End(val complete: Boolean, val truncated: Boolean) : Op
}

private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

private fun JsonObject.s(k: String): String = this[k].str() ?: ""

internal fun decodeAttrs(v: JsonElement?): Attrs {
    val o = v as? JsonObject ?: return emptyMap()
    return o.mapValues { (_, x) -> x.str()?.let { Attr.Str(it) } ?: Attr.Flag }
}

internal fun decodeSpans(v: JsonElement?): List<Span> {
    v.str()?.let { return listOf(Span.Text(it)) }
    val list = v as? JsonArray ?: return emptyList()
    return list.mapNotNull { e ->
        val s = e as? JsonObject ?: return@mapNotNull e.str()?.let { Span.Text(it) }
        when (val t = s.s("t")) {
            "text" -> Span.Text(s.s("v"))
            "code" -> Span.Code(s.s("v"))
            "br" -> Span.LineBreak
            "img" -> Span.Image(s.s("src"), s.s("alt"), decodeSpans(s["credit"]))
            "link" -> Span.Link(s.s("href"), decodeSpans(s["c"]))
            "el" -> Span.Element(s.s("type"), decodeAttrs(s["attrs"]), decodeSpans(s["c"]))
            else -> Span.Format(t, decodeSpans(s["c"]))
        }
    }
}

internal fun decodeData(v: JsonElement?): NodeData? {
    val d = v as? JsonObject ?: return null
    val cols = d["columns"] as? JsonArray
    val rows = d["rows"] as? JsonArray
    if (cols != null && rows != null) {
        return NodeData.Table(cols.map { it.str() ?: "" }, rows.map { r -> (r as? JsonArray)?.map { it.str() ?: "" } ?: emptyList() })
    }
    (d["checks"] as? JsonArray)?.let { cs ->
        return NodeData.Checks(cs.mapNotNull { (it as? JsonObject)?.let { o -> CheckItem((o["done"] as? JsonPrimitive)?.booleanOrNull ?: false, decodeSpans(o["c"])) } })
    }
    (d["formula"] as? JsonArray)?.let { f -> return NodeData.Formula(f.map { it.str() ?: "" }, (d["value"] as? JsonPrimitive)?.doubleOrNull) }
    if ("answer" in d) (d["items"] as? JsonArray)?.let { items -> return NodeData.Choices(items.map(::decodeSpans), (d["answer"] as? JsonPrimitive)?.intOrNull) }
    (d["items"] as? JsonArray)?.let { items -> return NodeData.Items(items.map(::decodeSpans)) }
    (d["images"] as? JsonArray)?.let { imgs ->
        return NodeData.Images(imgs.mapNotNull { (it as? JsonObject)?.let { o -> GalleryImage(o.s("src"), o.s("alt"), decodeSpans(o["credit"]), decodeSpans(o["caption"])) } })
    }
    (d["align"] as? JsonArray)?.let { a -> return NodeData.Align(a.map { it.str() == "right" }) }
    (d["lines"] as? JsonArray)?.let { a -> return NodeData.Lines(a.map { it.str() ?: "" }) }
    (d["layout"] as? JsonObject)?.let { l ->
        val per = (l["per"] as? JsonPrimitive)?.intOrNull
        val min = (l["min"] as? JsonPrimitive)?.intOrNull
        if (per != null && min != null) return NodeData.Layout(per, min)
    }
    return null
}

private val json = Json { ignoreUnknownKeys = true }

/** A span array as the core writes it. */
internal fun decodeSpansJson(text: String): List<Span> = decodeSpans(runCatching { json.parseToJsonElement(text) }.getOrNull())

/** One op per line, as the core writes them. */
fun decodeOps(text: String): List<Op> {
    val ops = ArrayList<Op>()
    for (line in text.lineSequence()) {
        if (line.isEmpty()) continue
        val o = runCatching { json.parseToJsonElement(line) }.getOrNull() as? JsonObject ?: continue
        val id = o.s("id")
        when (o.s("op")) {
            "open" -> ops += Op.Open(id, o.s("type"), decodeAttrs(o["attrs"]), o["icon"]?.str())
            "spans" -> ops += Op.Spans(id, decodeSpans(o["spans"]))
            "close" -> ops += Op.Close(id, decodeData(o["data"]))
            "node" -> ops += Op.Node(id, o.s("type"), decodeAttrs(o["attrs"]), o["spans"]?.let(::decodeSpans), decodeData(o["data"]), o["icon"]?.str())
            "diag" -> ops += Op.Diag((o["line"] as? JsonPrimitive)?.intOrNull ?: 0, o.s("cls"), o.s("detail"), o.s("severity") == "error")
            "end" -> ops += Op.End((o["complete"] as? JsonPrimitive)?.booleanOrNull ?: false, (o["truncated"] as? JsonPrimitive)?.booleanOrNull ?: false)
        }
    }
    return ops
}
