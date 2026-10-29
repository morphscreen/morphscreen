package com.morphscreen.core

import java.io.File
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** A node and everything under it, as one comparable value. */
private data class Snap(val id: String, val type: String, val attrs: Attrs, val spans: List<Span>, val data: NodeData?, val closed: Boolean, val children: List<Snap>)

private fun snap(n: UINode): Snap = Snap(n.id, n.type, n.attrs, n.spans, n.data, n.closed, n.children.map(::snap))

private val raw = File(System.getProperty("morphscreen.raw"))

private fun answers(dir: String): List<Pair<String, String>> =
    raw.resolve(dir).listFiles { f -> f.name.startsWith("ours__") && f.name.endsWith(".txt") }!!.sortedBy { it.name }.map { it.name to it.readText() }

/** Splits on code points, so a chunk never ends inside an emoji. */
private fun pieces(s: String, rnd: Random): List<String> {
    val out = ArrayList<String>()
    var i = 0
    while (i < s.length) {
        var j = minOf(s.length, i + rnd.nextInt(1, 48))
        if (j < s.length && s[j - 1].isHighSurrogate()) j++
        out += s.substring(i, j)
        i = j
    }
    return out
}

class AnswerTest {
    @Test
    fun chunkingNeverChangesTheTree() {
        val rnd = Random(7)
        val all = answers("nemotron-v03") + answers("nemotron-device-v02")
        assertTrue(all.size >= 30, "bench answers not found under $raw")
        for ((name, text) in all) {
            val packs = if (name.startsWith("ours__d")) listOf("device") else emptyList()
            val whole = Answer(packs).apply { push(text); finish() }
            repeat(3) {
                val streamed = Answer(packs)
                for (p in pieces(text, rnd)) streamed.push(p)
                streamed.finish()
                assertEquals(snap(whole.root), snap(streamed.root), name)
                assertEquals(whole.complete, streamed.complete, name)
                streamed.close()
            }
            whole.close()
        }
    }

    @Test
    fun emojiAndOtherTextSurviveTheBridge() {
        // Supplementary characters break JNI's modified UTF-8; the bridge uses bytes.
        val a = Answer().apply { push("Grüße aus Zürich — 東京 𝐀 ok\n"); finish() }
        val text = (a.root.children[0].spans[0] as Span.Text).text
        // (A dash gets a no-break space before it, so it never starts a line.)
        assertEquals("Grüße aus Zürich — 東京 𝐀 ok", text)
    }

    @Test
    fun finishClosesEverything() {
        val a = Answer().apply { push("<Card title=\"Open\">\n<Columns>\n<Stat label=\"A\" value=\"1\" />\n"); finish(truncated = true) }
        fun open(n: UINode): List<String> = (if (n.closed) emptyList() else listOf(n.id)) + n.children.flatMap(::open)
        assertEquals(emptyList(), a.root.children.flatMap(::open))
        assertFalse(a.complete)
    }

    @Test
    fun everyPackUnlessCoreAlone() {
        val text = "<Camera label=\"Receipt\" />\n"
        val without = Answer(emptyList()).apply { push(text); finish() }
        val with = Answer().apply { push(text); finish() }
        assertEquals("Camera", with.root.children.first().type)
        assertTrue(without.diagnostics.any { it.error })
    }

    @Test
    fun customPacksAddComponents() {
        val pack = """{"name":"acme","version":"1.0.0","components":{"Product":{"about":"a product","attrs":{"name":{"type":"string","required":true}},"content":"none"}}}"""
        val a = Answer(custom = listOf(pack)).apply { push("<Product name=\"Lamp\" />\n"); finish() }
        assertTrue(a.complete)
        assertEquals("Lamp", a.root.children[0].attr("name"))
        assertTrue(systemPrompt(custom = listOf(pack)).contains("Product"))
    }

    @Test
    fun badPacksAreAnError() {
        val e = runCatching { Session(listOf("no-such-pack")) }.exceptionOrNull()
        assertTrue(e is CoreException, "$e")
    }

    @Test
    fun packCellsParseLikeContent() {
        assertEquals(listOf(Span.Format("strong", listOf(Span.Text("Keynote"))), Span.Text(" at "), Span.Code("9:00")), parseInline("**Keynote** at `9:00`"))
    }

    @Test
    fun verdictAndHtml() {
        val s = Session()
        s.push("<Callout tone=\"warning\" title=\"Heads up\">\nRoads close at 6.\n</Callout>\n")
        s.finish()
        assertTrue(s.verdict().contains("\"complete\":true"))
        assertTrue(s.html().contains("Roads close at 6."))
        s.close()
        s.close()
    }

    @Test
    fun htmlPicturesLoadOnlyFromAllowedHosts() {
        val answer = "<Avatar name=\"Sarah Chen\" src=\"https://cdn.example/sarah.png\" />\n"
        Session().use { s ->
            s.push(answer)
            s.finish()
            assertTrue(s.html().contains("<span>SC</span>"), s.html())
            s.allowImages(listOf("cdn.example"))
            assertTrue(s.html().contains("<img src=\"https://cdn.example/sarah.png\""), s.html())
        }
    }
}
