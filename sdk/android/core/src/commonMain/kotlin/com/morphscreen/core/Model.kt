// The answer as a tree of observable nodes, built from the op stream. A
// composable reading a node recomposes only when that node changes; a closed
// node never changes again.

package com.morphscreen.core

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

@Stable
class UINode internal constructor(
    val id: String,
    val type: String,
    val attrs: Attrs,
    val parent: UINode?,
    /** Its icon as path data, when it has one. */
    val icon: String? = null,
) {
    val children: List<UINode> get() = _children
    internal val _children = mutableStateListOf<UINode>()
    var spans: List<Span> by mutableStateOf(emptyList())
        internal set
    var data: NodeData? by mutableStateOf(null)
        internal set
    var closed: Boolean by mutableStateOf(false)
        internal set

    fun attr(k: String): String? = (attrs[k] as? Attr.Str)?.value

    /** A boolean attribute: bare, or "true". */
    fun flag(k: String): Boolean = when (val a = attrs[k]) {
        Attr.Flag -> true
        is Attr.Str -> a.value.equals("true", ignoreCase = true)
        null -> false
    }

    /** Cards around this node (sets heading sizes and card style). */
    val cardDepth: Int
        get() {
            var d = 0
            var p = parent
            while (p != null) {
                if (p.type == "Card") d++
                p = p.parent
            }
            return d
        }
}

data class Diagnostic(val line: Int, val cls: String, val detail: String, val error: Boolean)

/**
 * One answer: feed it the model's text, show it with AnswerView. Use it on
 * one thread (the UI thread); close it when the answer is gone.
 *
 * `packs`: beyond core, like listOf("device"). `custom`: the app's own packs
 * (pack JSON).
 */
class Answer(packs: List<String> = listOf("all"), custom: List<String> = emptyList()) : AutoCloseable {
    val root = UINode("", "root", emptyMap(), null)
    var complete: Boolean by mutableStateOf(false)
        private set
    val diagnostics = ArrayList<Diagnostic>()
    /** Its interactive components' state, by node id: what the reader did, or what an agent set. */
    val components = ComponentStore()
    private val session = Session(packs, custom)
    private val index = HashMap<String, UINode>().apply { put("", root) }

    /** The next chunk of the model's text. */
    fun push(text: String) = apply(session.push(text))

    /** The answer is over. */
    fun finish(truncated: Boolean = false) = apply(session.finish(truncated))

    /** The finished answer as HTML (what a server would send). */
    val html: String get() = session.html()

    override fun close() = session.close()

    internal fun apply(ops: List<Op>) {
        for (op in ops) when (op) {
            is Op.Open -> open(op.id, op.type, op.attrs, op.icon)
            is Op.Spans -> index[op.id]?.spans = op.spans
            is Op.Close -> close(op.id, op.data)
            is Op.Node -> {
                open(op.id, op.type, op.attrs, op.icon)
                op.spans?.let { index[op.id]?.spans = it }
                close(op.id, op.data)
            }
            is Op.Diag -> diagnostics += Diagnostic(op.line, op.cls, op.detail, op.error)
            is Op.End -> complete = op.complete
        }
    }

    private fun open(id: String, type: String, attrs: Attrs, icon: String?) {
        val parentId = id.substringBeforeLast('.', "")
        val parent = index[parentId] ?: return
        val n = UINode(id, type, attrs, parent, icon)
        index[id] = n
        parent._children += n
    }

    private fun close(id: String, data: NodeData?) {
        val n = index[id] ?: return
        if (data != null) n.data = data
        n.closed = true
    }
}

class CoreException(message: String) : Exception(message)

/** One answer being read by the core. */
expect class Session(packs: List<String> = listOf("all"), custom: List<String> = emptyList()) : AutoCloseable {
    /** Feeds the next chunk of the model's text; returns the ops it produced. */
    fun push(text: String): List<Op>

    /** The answer is over; returns the last ops (ending with End). */
    fun finish(truncated: Boolean = false): List<Op>

    /** Pictures in [html] load only from these hosts, as in the SDKs; with none, only data: images. */
    fun allowImages(hosts: List<String>)

    /** The finished answer as HTML. */
    fun html(): String

    /** The verdict as JSON: complete, renderable, n, errs, notes. */
    fun verdict(truncated: Boolean = false, reqs: Int = 0, strict: Boolean = false): String

    override fun close()
}

/** The system prompt for a catalog (servers usually build it; it's here too). */
expect fun systemPrompt(packs: List<String> = listOf("all"), custom: List<String> = emptyList()): String

/** Inline text (a table cell, a list item) parsed as the core parses content. */
expect fun parseInline(text: String): List<Span>
