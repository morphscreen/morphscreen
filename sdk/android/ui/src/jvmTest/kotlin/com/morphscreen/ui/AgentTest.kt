package com.morphscreen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.runDesktopComposeUiTest
import androidx.compose.ui.unit.dp
import com.morphscreen.core.AgentTransport
import com.morphscreen.core.AgentUpdate
import com.morphscreen.core.HttpTransport
import com.morphscreen.core.UINode
import com.morphscreen.core.get
import com.morphscreen.core.indices
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.net.InetSocketAddress
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private fun j(vararg kv: Pair<String, Any?>): JsonObject = JsonObject(kv.associate { (k, v) -> k to el(v) })
private fun el(v: Any?): JsonElement = when (v) {
    null -> JsonNull
    is JsonElement -> v
    is String -> JsonPrimitive(v)
    is Number -> JsonPrimitive(v)
    is Boolean -> JsonPrimitive(v)
    is List<*> -> JsonArray(v.map(::el))
    else -> error("$v")
}
private fun ev(type: String, vararg kv: Pair<String, Any?>) = j("type" to type, *kv)

/** A scripted AG-UI agent: each request gets the events `reply` returns, framed as SSE, a few bytes at a time. */
private class ScriptedAgent(val reply: (n: Int, input: JsonObject) -> List<JsonObject>) : AgentTransport {
    val requests = mutableListOf<JsonObject>()
    override fun post(body: String, headers: Map<String, String>): Flow<ByteArray> = flow {
        val input = Json.parseToJsonElement(body) as JsonObject
        requests += input
        val sse = ": keep-alive\n\nevent: ignored\nid: 1\n\n" + reply(requests.size, input).joinToString("") { "data: $it\n\n" }
        for (piece in sse.encodeToByteArray().toList().chunked(37)) emit(piece.toByteArray())
    }
}

private fun UINode.find(type: String): UINode? = if (this.type == type) this else children.firstNotNullOfOrNull { it.find(type) }

private val lesson = (File(System.getProperty("user.dir"), "../../../test/fixtures/interactive.md").takeIf { it.exists() } ?: File("../../test/fixtures/interactive.md")).readText() +
    "\n\n<Form name=\"rsvp\">\n<Input label=\"Your name\" name=\"name\" />\n<Select label=\"Meal\" name=\"meal\" options=\"Veg | Fish\" />\n<Switch label=\"Bringing a guest\" name=\"guest\" />\n<Button>Send</Button>\n</Form>\n"

class AgentTest {
    @Test
    fun actionsInWords() {
        assertEquals("I voted for \"Respiration\".", actionMessage(Action.Vote("1", "next", "Respiration")))
        assertNull(actionMessage(Action.State("1", "x", listOf("a"))))
        assertEquals("I filled in the form \"rsvp\" and pressed \"Send\":\n- guest: yes", actionMessage(Action.Submit("1", "rsvp", "Send", mapOf("guest" to FieldValue.Bool(true)))))
    }

    /**
     * The same script as the web's test-agent.mjs: a lesson streams in as
     * chunks; ticks are state; a finished quiz is the next user message with
     * the state; the agent's patch ticks, marks and fills (and the views show
     * it); a snapshot rewrites; a cut-off stream and a failed run say so; a
     * saved conversation comes back with its components.
     */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun aConversation() = runDesktopComposeUiTest(width = 760, height = 4200) {
        val ids = mutableMapOf<String, String>()
        val agent = ScriptedAgent { n, input ->
            val run = arrayOf("threadId" to input["threadId"], "runId" to input["runId"])
            val start = ev("RUN_STARTED", *run, "protocolVersion" to "1.0")
            val end = ev("RUN_FINISHED", *run)
            when (n) {
                1 -> listOf(start, ev("STATE_SNAPSHOT", "snapshot" to j("lesson" to "photosynthesis"))) +
                    lesson.chunked(41).mapIndexed { i, d -> if (i == 0) ev("TEXT_MESSAGE_CHUNK", "messageId" to "m1", "role" to "assistant", "delta" to d) else ev("TEXT_MESSAGE_CHUNK", "delta" to d) } + end
                2 -> {
                    val p = { node: String -> "/morphscreen/m1/$node" }
                    val delta = listOf(
                        j("op" to "replace", "path" to p(ids.getValue("checklist")) + "/done", "value" to listOf(0, 1, 2)),
                        j("op" to "add", "path" to p(ids.getValue("flashcards")), "value" to j("known" to listOf(1))),
                        j("op" to "add", "path" to p(ids.getValue("form")), "value" to j("fields" to j("name" to "Ana", "meal" to "Fish", "guest" to true))),
                    )
                    listOf(start, ev("STATE_DELTA", "delta" to delta), ev("TEXT_MESSAGE_START", "messageId" to "m2", "role" to "assistant"), ev("TEXT_MESSAGE_CONTENT", "messageId" to "m2", "delta" to "Nice work. **Respiration** is next."), ev("TEXT_MESSAGE_END", "messageId" to "m2"), end)
                }
                3 -> {
                    val kept = (input["messages"] as JsonArray).filter { (it as JsonObject)["id"] != JsonPrimitive("m2") }
                    listOf(start, ev("MESSAGES_SNAPSHOT", "messages" to kept + j("id" to "m2", "role" to "assistant", "content" to "Good work. Respiration is next.")), ev("TEXT_MESSAGE_START", "messageId" to "m3"), ev("TEXT_MESSAGE_CONTENT", "messageId" to "m3", "delta" to "<Card title=\"Respiration\">\nCells break gluc"))
                }
                else -> listOf(start, ev("RUN_ERROR", "message" to "the model is overloaded", "code" to "overloaded"))
            }
        }
        runBlocking {
            val chat = AgentConversation(agent, this, packs = listOf("interactive", "inputs"))
            // 1. The lesson streams in as one answer.
            var r = chat.send("Quiz me on photosynthesis")
            assertEquals("success", r.outcome)
            assertEquals(listOf("user", "assistant"), chat.turns.map { it.role })
            val a = assertNotNull(chat.turns[1].answer)
            assertTrue(a.complete)
            for (t in listOf("Quiz", "Flashcards", "Poll", "Checklist", "WhatIf", "Form")) assertNotNull(a.root.find(t), t)
            ids["checklist"] = a.root.find("Checklist")!!.id
            ids["flashcards"] = a.root.find("Flashcards")!!.id
            ids["form"] = a.root.find("Form")!!.id
            assertEquals(JsonPrimitive("1.0"), agent.requests[0]["protocolVersion"])

            // 2. A tick and a typed name are state, not a turn.
            a.components.set(ids.getValue("checklist"), j("done" to listOf(0, 1)))
            FormState(a.root.find("Form")!!, a.components).set("name", FieldValue.Text("A"))
            assertEquals(j("done" to listOf(0, 1)), chat.state["morphscreen"]["m1"][ids.getValue("checklist")])
            assertEquals(JsonPrimitive("A"), chat.state["morphscreen"]["m1"][ids.getValue("form")]["fields"]["name"])
            assertEquals(JsonPrimitive("photosynthesis"), chat.state["lesson"])
            assertEquals(1, agent.requests.size)

            // 3. A finished quiz is the next user message, with the ticks.
            chat.act(Action.Quiz(a.root.find("Quiz")!!.id, 1, 2, listOf(QuizAnswer("What absorbs light in a leaf?", "B. Chlorophyll", true), QuizAnswer("Which gas do plants take in?", "Oxygen", false))))
            while (agent.requests.size < 2 || chat.running) yield()
            val said = (agent.requests[1]["messages"] as JsonArray).last() as JsonObject
            assertEquals(JsonPrimitive("user"), said["role"])
            assertTrue((said["content"] as JsonPrimitive).content.startsWith("I finished the quiz: 1 of 2 right."))
            assertEquals(j("done" to listOf(0, 1)), agent.requests[1]["state"]["morphscreen"]["m1"][ids.getValue("checklist")])

            // 4. The agent's patch is in the store the views read.
            assertEquals(listOf(0, 1, 2), a.components[ids.getValue("checklist")]["done"].indices)
            assertEquals(listOf(1), a.components[ids.getValue("flashcards")]["known"].indices)
            assertEquals("m2", chat.turns.last().id)

            // 5. A snapshot rewrites m2; the stream breaks off in m3.
            r = chat.send("What's next?")
            assertTrue(r.truncated)
            assertEquals("The reply was cut off.", chat.note)
            assertEquals("<p>Good work. Respiration is next.</p>", chat.turns.first { it.id == "m2" }.answer!!.html)
            assertTrue(chat.turns.first { it.id == "m3" }.answer!!.html.contains("Cells break gluc"))

            // 6. A failed run says so.
            r = chat.send("Again")
            assertEquals("the model is overloaded", r.error)
            assertEquals("The agent stopped: the model is overloaded", chat.note)

            // The views show the agent's state: all ticked, one card known, the form filled in.
            setContent { Box(Modifier.width(760.dp).background(colors.page)) { AgentView(chat) } }
            waitForIdle()
            for (t in listOf("3 of 3 done", "1 of 3 known", "Ana", "Fish", "The agent stopped: the model is overloaded")) {
                assertTrue(onAllNodesWithText(t, substring = true).fetchSemanticsNodes().isNotEmpty(), "shows $t")
            }

            // 7. A saved conversation comes back with its components, and runs nothing.
            val before = agent.requests.size
            val again = AgentConversation(agent, this, packs = listOf("interactive", "inputs"))
            again.load(chat.messages, chat.state)
            assertEquals(7, again.turns.size)
            assertEquals(listOf(0, 1, 2), again.turns.first { it.id == "m1" }.answer!!.components[ids.getValue("checklist")]["done"].indices)
            assertEquals(before, agent.requests.size)
            chat.close()
            again.close()
        }
    }

    /** The real binding: a POST to a server, its SSE read as it arrives. */
    @Test
    fun overHttp() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        var body = ""
        server.createContext("/agent") { x ->
            body = x.requestBody.readBytes().decodeToString()
            x.responseHeaders.add("Content-Type", "text/event-stream")
            x.sendResponseHeaders(200, 0)
            x.responseBody.use { out ->
                for (e in listOf(
                    """{"type":"RUN_STARTED","threadId":"t","runId":"r"}""",
                    """{"type":"TEXT_MESSAGE_START","messageId":"m","role":"assistant"}""",
                    """{"type":"TEXT_MESSAGE_CONTENT","messageId":"m","delta":"<Callout tone=\"success\">\nBooked.\n</Callout>\n"}""",
                    """{"type":"TEXT_MESSAGE_END","messageId":"m"}""",
                    """{"type":"RUN_FINISHED","threadId":"t","runId":"r"}""",
                )) {
                    out.write("data: $e\n\n".encodeToByteArray())
                    out.flush()
                }
            }
        }
        server.start()
        try {
            runBlocking {
                val chat = AgentConversation(HttpTransport("http://127.0.0.1:${server.address.port}/agent"), this)
                val updates = mutableListOf<AgentUpdate>()
                chat.onUpdate = { updates += it }
                val r = chat.send("Book it")
                assertEquals("success", r.outcome)
                assertTrue(body.contains("\"protocolVersion\":\"1.0\"") && body.contains("Book it"), body)
                assertTrue(chat.turns.last().answer!!.html.contains("Booked."))
                assertTrue(updates.any { it is AgentUpdate.Finished })
                chat.close()
            }
        } finally {
            server.stop(0)
        }
    }

    /**
     * Two runs recorded from the LangGraph example agent (examples/langgraph,
     * RECORD=1): its stream reads cleanly, its closing snapshots restate the
     * answer without redrawing it, and its state comes back.
     */
    @Test
    fun theLangGraphAgentsStream() = runBlocking {
        val dir = listOf(File(System.getProperty("user.dir"), "../../../test/agui/langgraph"), File("../../test/agui/langgraph")).first { it.exists() }
        val runs = listOf("run1.sse", "run2.sse").map { File(dir, it).readBytes() }
        var n = 0
        val recorded = object : AgentTransport {
            override fun post(body: String, headers: Map<String, String>): Flow<ByteArray> = flow {
                for (piece in runs[n++].toList().chunked(53)) emit(piece.toByteArray())
            }
        }
        val chat = AgentConversation(recorded, this, packs = listOf("interactive", "inputs", "data"))
        val updates = mutableListOf<AgentUpdate>()
        chat.onUpdate = { updates += it }
        // The ids the recording was made with.
        assertEquals("success", chat.send("Quiz me on photosynthesis", "u1").outcome)
        assertTrue(updates.none { it is AgentUpdate.Warn || it is AgentUpdate.Rejected }, updates.filterIsInstance<AgentUpdate.Warn>().toString())
        assertTrue(updates.none { it is AgentUpdate.Reset }, "the snapshot restated the answer, it didn't redraw it")
        val a = assertNotNull(chat.turns[1].answer)
        assertTrue(a.complete)
        assertNotNull(a.root.find("Quiz"))
        chat.send("I finished the quiz: 1 of 2 right.", "u2")
        assertEquals(listOf("user", "assistant", "user", "assistant"), chat.turns.map { it.role })
        assertTrue(chat.turns.last().answer!!.html.contains("Nice work"))
        assertNotNull(chat.state["morphscreen"])
        chat.close()
    }

    /** The LangGraph example agent itself, when one is running (AGENT_URL=http://127.0.0.1:8123/agent). */
    @Test
    fun theLangGraphAgentLive() {
        val url = System.getProperty("agentUrl").orEmpty().ifEmpty { System.getenv("AGENT_URL").orEmpty() }
        if (url.isEmpty()) return println("skipped: set AGENT_URL to a running examples/langgraph agent")
        runBlocking {
            val chat = AgentConversation(HttpTransport(url), this, packs = listOf("interactive", "inputs", "data"))
            assertEquals("success", chat.send("Quiz me on photosynthesis").outcome)
            val a = assertNotNull(chat.turns.last().answer)
            assertTrue(a.complete)
            a.root.find("Checklist")?.let { a.components.set(it.id, j("done" to listOf(1))) }
            assertEquals("success", chat.send("I finished the quiz: 1 of 2 right.").outcome)
            assertEquals(4, chat.turns.size)
            if (a.root.find("Checklist") != null) {
                val kept = (chat.state["morphscreen"] as JsonObject).values.any { m -> (m as JsonObject).values.any { it["done"].indices == listOf(1) } }
                assertTrue(kept, "the tick comes back in LangGraph's state")
            }
            chat.close()
        }
    }
}
