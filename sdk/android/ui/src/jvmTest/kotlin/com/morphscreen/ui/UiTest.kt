package com.morphscreen.ui

import androidx.compose.foundation.layout.width
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.morphscreen.core.Answer
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

private val raw = File(System.getProperty("morphscreen.raw"))

private fun answers(dir: String) =
    raw.resolve(dir).listFiles { f -> f.name.startsWith("ours__") && f.name.endsWith(".txt") }!!.sortedBy { it.name }.map { it.name to it.readText() }

private fun answer(text: String, packs: List<String> = emptyList()) = Answer(packs).apply { push(text); finish() }

class UiTest {
    /** Every bench answer streams into the view and lays out, at phone and desktop widths. */
    @OptIn(ExperimentalComposeUiApi::class)
    @Test
    fun everyAnswerRendersWhileStreaming() {
        val all = answers("nemotron-v03") + answers("nemotron-device-v02")
        assertTrue(all.size >= 30)
        for ((name, text) in all) for (width in listOf(360, 760)) {
            val a = Answer(listOf("device"))
            val scene = ImageComposeScene(width * 2, 1600, Density(2f)) { AnswerView(a, Modifier.width(width.dp)) }
            text.chunked(64).forEach { a.push(it); scene.render() }
            a.finish()
            scene.render()
            assertTrue(scene.calculateContentSize().height > 100, "$name at $width")
            scene.close()
            a.close()
        }
    }

    /** Every pack component streams in and lays out; Math and QR arrive worked out by the core. */
    @OptIn(ExperimentalComposeUiApi::class)
    @Test
    fun everyPackComponentRenders() {
        val text = File(System.getProperty("morphscreen.raw")).resolve("../../test/fixtures/packs-all.md").readText()
        val packs = listOf("data", "commerce", "scheduling", "media", "docs", "inputs", "device", "interactive")
        val a = Answer(packs)
        val scene = ImageComposeScene(1520, 1600, Density(2f)) { AnswerView(a, Modifier.width(760.dp)) }
        text.chunked(40).forEach { a.push(it); scene.render() }
        a.finish()
        scene.render()
        assertTrue(a.complete)
        assertTrue(scene.calculateContentSize().height > 4000)
        fun all(n: com.morphscreen.core.UINode): List<com.morphscreen.core.UINode> = listOf(n) + n.children.flatMap(::all)
        val nodes = all(a.root)
        // A component inside a sentence ("Rated <Rating/> by buyers") is an element of its paragraph's text.
        fun inline(s: List<com.morphscreen.core.Span>): List<String> = s.flatMap {
            when (it) {
                is com.morphscreen.core.Span.Element -> listOf(it.type) + inline(it.children)
                is com.morphscreen.core.Span.Format -> inline(it.children)
                is com.morphscreen.core.Span.Link -> inline(it.children)
                else -> emptyList()
            }
        }
        val types = nodes.map { it.type } + nodes.flatMap { inline(it.spans) }
        assertEquals(PACK_COMPONENTS, types.filter { it in PACK_COMPONENTS }.toSet())
        val math = nodes.first { it.type == "Math" }.data as com.morphscreen.core.NodeData.Lines
        assertEquals("Eₖ = 1/2 m v²", math.lines[0])
        val qr = nodes.first { it.type == "QR" }.data as com.morphscreen.core.NodeData.Lines
        assertTrue(qr.lines.size >= 21 && qr.lines.all { it.length == qr.lines.size })
        scene.close()
        a.close()
    }

    /** The docs' example: a pack, the prompt, and the app's own composable. */
    @OptIn(ExperimentalComposeUiApi::class)
    @Test
    fun customComponentRenders() {
        val shop = """{"name":"shop","version":"1.0.0","components":{"ProductCard":{"about":"a product with its price","attrs":{"name":{"type":"string","required":true},"price":{"type":"string","required":true}},"content":"none"}}}"""
        assertTrue(com.morphscreen.core.systemPrompt(custom = listOf(shop)).contains("<ProductCard name! price! />"))
        val a = Answer(custom = listOf(shop)).apply { push("<ProductCard name=\"Kettle\" price=\"$40\" />\n"); finish() }
        assertTrue(a.complete)
        val drawn = mutableListOf<String>()
        val scene = ImageComposeScene(800, 400, Density(2f)) {
            AnswerView(a, components = mapOf("ProductCard" to { p -> drawn += "${p.node.attr("name")} ${p.node.attr("price")}"; Txt("card") }))
        }
        scene.render()
        assertEquals("Kettle $40", drawn.last())
        scene.close()
        a.close()
    }

    @Test
    fun packHelpers() {
        assertEquals("20 Oct 2026, 18:00", readableWhen("2026-10-20T18:00"))
        assertEquals("next week", readableWhen("next week"))
        assertEquals("2021" to "First customers", timelineParts("2021: First customers"))
        assertEquals("" to "No date here", timelineParts("No date here"))
        assertEquals(1_792_022_400_000, parseWhenMillis("2026-10-15T00:00"))
        assertEquals("YouTube", embedHost("https://www.youtube.com/watch?v=x"))
        assertEquals(null, embedHost("https://evil.example/x"))
        val t = treeEntries(listOf(listOf("src/", "main.rs"), listOf("src/", "lib.rs"), listOf("Cargo.toml")))
        assertEquals(listOf("src/", "main.rs", "lib.rs", "Cargo.toml"), t.map { it.name })
        assertEquals(listOf(true, false, false, false), t.map { it.folder })
    }

    @Test
    fun columnsPlanMatchesTheHtml() {
        fun plan(body: String) = columnsPlan(answer("<Columns>\n$body</Columns>\n").root.children[0].children)
        val stat = "<Stat label=\"A\" value=\"1\" />\n"
        assertEquals(3 to false, plan(stat.repeat(3)))
        assertEquals(5 to false, plan(stat.repeat(5)))
        assertEquals(3 to false, plan(stat.repeat(6)))
        val card = "<Card title=\"T\">\nText.\n</Card>\n"
        assertEquals(2 to true, plan(card + card))
        val wide = "<Card title=\"T\">\n| a | b | c | d |\n|---|---|---|---|\n| 1 | 2 | 3 | 4 |\n</Card>\n"
        assertEquals(1 to true, plan(wide + card))
    }

    @Test
    fun chartNumbers() {
        assertEquals(3500.0, chartNumber("$3.5k"))
        assertEquals(12.0, chartNumber("12%"))
        assertEquals(-4.0, chartNumber("-4"))
        assertEquals(1240.0, chartNumber("1,240"))
        assertEquals(2_100_000.0, chartNumber("2.1M"))
        assertNull(chartNumber("n/a"))
        assertNull(chartNumber(""))
    }

    @Test
    fun fieldNamesAndOptions() {
        val a = answer("<Form name=\"f\">\n<Input name=\"email\" label=\"Email\" />\n<Input label=\"Estimated Duration (hrs)\" />\n<Input label=\"  Café & Bar  \" />\n</Form>\n")
        assertEquals(listOf("email", "estimated-duration-hrs", "caf-bar"), a.root.children[0].children.map(::fieldName))
        assertEquals(listOf("a", "b", "c"), options(" a | b ||c "))
        assertEquals(emptyList(), options(null))
    }

    @Test
    fun submitCarriesTypedValues() {
        val a = answer("<Form name=\"rsvp\">\n<Input label=\"Name\" />\n<Switch label=\"Vegetarian\" />\n<Button>Send</Button>\n</Form>\n")
        val form = FormState(a.root.children[0])
        form.values["name"] = FieldValue.Text("Ada")
        form.values["vegetarian"] = FieldValue.Bool(true)
        assertEquals(Action.Submit(a.root.children[0].id, "rsvp", "Send", mapOf("name" to FieldValue.Text("Ada"), "vegetarian" to FieldValue.Bool(true))), form.submit("Send"))
    }

    @Test
    fun datesFromThePicker() {
        assertEquals("1970-01-01", isoDate(0))
        assertEquals("2026-10-15", isoDate(1_792_022_400_000))
        assertEquals("2024-02-29", isoDate(1_709_164_800_000))
        assertEquals("1969-12-31", isoDate(-86_400_000))
    }

    @Test
    fun placesAndMapLinks() {
        val a = answer("<Map title=\"Stops\">\n| Place | Lat | Lng |\n|---|---|---|\n| Belém | 38.69 | -9.21 |\n| Nowhere | 999 | 0 |\n</Map>\n<Map>\n| Place | Address |\n|---|---|\n| Cafe | 1 Main St |\n</Map>\n", listOf("device"))
        val p = places(a.root.children[0])
        assertEquals(38.69, p[0].lat)
        assertNull(p[1].lat, "out-of-range coordinates are dropped")
        assertTrue(mapLink(p[0]).startsWith("https://www.openstreetmap.org/?mlat=38.69&mlon=-9.21"))
        val q = places(a.root.children[1])
        assertEquals("1 Main St", q[0].address)
        assertEquals("https://www.openstreetmap.org/search?query=Cafe%2C%201%20Main%20St", mapLink(q[0]))
    }

    @Test
    fun onlySafeLinksOpen() {
        assertTrue(safeHref("https://example.com"))
        assertTrue(safeHref("mailto:a@b.c"))
        assertTrue(!safeHref("javascript:alert(1)"))
        assertTrue(!safeHref("file:///etc/passwd"))
    }

    @Test
    fun idsAndDashesKeepTogether() {
        val j = "\u2060"
        assertEquals("Order WO-${j}2025 shipped", keepIds("Order WO-2025 shipped"))
        assertEquals("a well-known fix", keepIds("a well-known fix"))
        assertEquals("lobbying$j\u2014Microsoft", keepIds("lobbying\u2014Microsoft"))
        assertEquals("Z\u00a0\u2014 ok", keepIds("Z\u00a0\u2014 ok"))
    }

    /** Only the app's hosts load; a model's URL never does. */
    @Test
    fun onlyAllowedHostsLoad() {
        val p = MediaPolicy(hosts = listOf("cdn.shop.example", "https://images.pexels.com"))
        kotlin.test.assertEquals("https://images.pexels.com/photos/1/a.jpeg?w=1280", p.url("https://images.pexels.com/photos/1/a.jpeg?w=1280"))
        kotlin.test.assertEquals("https://cdn.shop.example/a.jpg", p.url("https://cdn.shop.example/a.jpg"))
        kotlin.test.assertNull(p.url("https://images.unsplash.com/photo-1"))
        kotlin.test.assertNull(p.url("https://cdn.shop.example.evil.example/x.jpg"))
        kotlin.test.assertNull(p.url("https://user@evil.example/x.jpg"))
        kotlin.test.assertNull(p.url("http://cdn.shop.example/a.jpg"), "plain http only on this machine")
        kotlin.test.assertNull(p.url("find"))
        kotlin.test.assertNull(MediaPolicy().url("https://cdn.shop.example/a.jpg"), "nothing loads by default")
        val local = MediaPolicy(hosts = listOf("http://127.0.0.1:8790"))
        kotlin.test.assertNotNull(local.url("http://127.0.0.1:8790/a.jpg"))
        kotlin.test.assertNull(local.url("http://127.0.0.1:9999/track.png"), "another port is another host")
    }
}
