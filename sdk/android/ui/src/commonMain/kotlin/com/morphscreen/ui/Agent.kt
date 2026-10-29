// AG-UI in Compose (roadmap Q9): a conversation with any agent that speaks
// AG-UI (protocol 1.0), its answers drawn as they stream. The protocol is
// the core's (rust/core/src/agui.rs): response bytes go in, what to draw
// comes out, the same as on the web and iOS.
//
//   val chat = remember { AgentConversation(HttpTransport(agentUrl), scope, packs = listOf("interactive")) }
//   AgentView(chat)
//   scope.launch { chat.send("Quiz me on photosynthesis") }
//
// The reader's actions go back to the agent: a Button, a follow-up, a form,
// a finished quiz or a vote becomes the next user message (worded by the
// core); ticks, known cards, sliders and typed fields are the shared state
// (`morphscreen` in AG-UI's state, by message and node), sent with the next
// run, and an agent can set them with STATE_SNAPSHOT or STATE_DELTA.

package com.morphscreen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.morphscreen.core.AgentCore
import com.morphscreen.core.AgentHttpException
import com.morphscreen.core.AgentTransport
import com.morphscreen.core.AgentUpdate
import com.morphscreen.core.Answer
import com.morphscreen.core.actionMessage
import com.morphscreen.core.add
import com.morphscreen.core.components
import com.morphscreen.core.end
import com.morphscreen.core.input
import com.morphscreen.core.load
import com.morphscreen.core.messages
import com.morphscreen.core.setComponent
import com.morphscreen.core.setState
import com.morphscreen.core.state
import kotlin.random.Random
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

private fun uuid(): String {
    val b = Random.nextBytes(16)
    b[6] = ((b[6].toInt() and 0x0f) or 0x40).toByte()
    b[8] = ((b[8].toInt() and 0x3f) or 0x80).toByte()
    val h = b.joinToString("") { (it.toInt() and 0xff).toString(16).padStart(2, '0') }
    return "${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}"
}

private fun obj(vararg kv: Pair<String, Any?>): JsonObject = JsonObject(kv.associate { (k, v) -> k to json(v) })

private fun json(v: Any?): JsonElement = when (v) {
    null -> JsonNull
    is JsonElement -> v
    is String -> JsonPrimitive(v)
    is Number -> JsonPrimitive(v)
    is Boolean -> JsonPrimitive(v)
    is List<*> -> JsonArray(v.map(::json))
    is Map<*, *> -> JsonObject(v.entries.associate { (k, x) -> k.toString() to json(x) })
    else -> JsonPrimitive(v.toString())
}

/** The action as spec/format.md writes it; uploads by name only. */
internal fun Action.json(): JsonObject = when (this) {
    is Action.Ask -> obj("type" to "ask", "text" to text, "node" to node)
    is Action.Vote -> obj("type" to "vote", "node" to node, "name" to name, "choice" to choice)
    is Action.State -> obj("type" to "state", "node" to node, "name" to name, "value" to value)
    is Action.Quiz -> obj("type" to "quiz", "node" to node, "score" to score, "total" to total, "answers" to answers.map { obj("question" to it.question, "choice" to it.choice, "right" to it.right) })
    is Action.Submit -> obj(
        "type" to "submit", "node" to node, "form" to form, "button" to button,
        "fields" to JsonObject(fields.mapValues { (_, v) ->
            when (v) {
                is FieldValue.Files -> json(v.uris.map { mapOf("name" to it.substringAfterLast('/')) })
                is FieldValue.Location -> obj("lat" to v.lat, "lng" to v.lng, "accuracy" to v.accuracy)
                is FieldValue.Image -> json(listOf(mapOf("name" to "drawing.png", "type" to "image/png")))
                else -> v.state ?: JsonNull
            }
        }),
    )
}

/** The user message an action starts, or null when it starts none (spec/format.md, "Actions"). */
fun actionMessage(action: Action): String? = actionMessage(action.json().toString()).ifEmpty { null }

/** How a run ended. */
data class RunResult(
    /** As the agent said: success, interrupt or cancelled. */
    val outcome: String? = null,
    /** The agent reported a failure, or the request failed. */
    val error: String? = null,
    /** The stream broke the protocol and was stopped. */
    val rejected: String? = null,
    /** The stream ended before the run did. */
    val truncated: Boolean = false,
    /** Tool calls left for the app. */
    val pending: List<String> = emptyList(),
)

/** One turn on the page: the reader's words, or the agent's answer. */
@Stable
class AgentTurn internal constructor(val id: String, val role: String) {
    var text by mutableStateOf("")
        internal set
    var answer by mutableStateOf<Answer?>(null)
        internal set
}

/**
 * A conversation with an AG-UI agent. Use it on the main thread; `scope`
 * runs the turns the reader's actions start. Close it when done.
 */
class AgentConversation(
    private val transport: AgentTransport,
    private val scope: CoroutineScope,
    val threadId: String = uuid(),
    private val packs: List<String> = listOf("all"),
    private val custom: List<String> = emptyList(),
) : AutoCloseable {
    val turns = mutableStateListOf<AgentTurn>()
    var running by mutableStateOf(false)
        private set
    /** What to tell the reader about the last run (cut off, failed), if anything. */
    var note by mutableStateOf<String?>(null)
        private set
    val agent = AgentCore()
    var headers: Map<String, String> = emptyMap()
    /** The app's own tools, context and pass-through props, sent with every run. */
    var extra: JsonElement? = null
    /** Every update from the core (steps, custom events, warnings...). */
    var onUpdate: ((AgentUpdate) -> Unit)? = null
    /** A tool of the app's own that the agent called: return its result to answer it. */
    var onToolCall: (suspend (id: String, name: String, arguments: String) -> String?)? = null
    /** Send the reader's actions on as user messages (default true). */
    var sendActions = true
    private var current: Job? = null
    private val toolAnswers = mutableListOf<Deferred<Boolean>>()

    val state: JsonElement get() = agent.state
    val messages: JsonElement get() = agent.messages

    fun setState(v: JsonElement) {
        agent.setState(v)
        handle(listOf(AgentUpdate.State))
    }

    /** Starts from a saved conversation. */
    fun load(messages: JsonElement, state: JsonElement? = null) = handle(agent.load(messages, state))

    /** The reader says something (text, or AG-UI content parts); runs the agent. */
    suspend fun send(content: JsonElement, id: String = uuid()): RunResult {
        handle(agent.add(obj("id" to id, "role" to "user", "content" to content)))
        return run()
    }

    suspend fun send(text: String, id: String = uuid()): RunResult = send(JsonPrimitive(text), id)

    /** Runs the agent on the conversation as it is, again while the app answers its tool calls. */
    suspend fun run(): RunResult {
        while (true) {
            toolAnswers.clear()
            val r = runOnce()
            val answered = toolAnswers.map { it.await() }.any { it }
            if (!answered || r.error != null || r.rejected != null || r.truncated || r.outcome != "success") return r
        }
    }

    /** Stops the run in progress (it ends truncated, not cancelled). */
    fun stop() {
        current?.cancel()
    }

    private suspend fun runOnce(): RunResult {
        if (running) return RunResult(error = "a run is already going")
        running = true
        note = null
        var r = RunResult()
        fun watch(us: List<AgentUpdate>) {
            for (u in us) r = when (u) {
                is AgentUpdate.Finished -> r.copy(outcome = u.outcome, pending = u.pending)
                is AgentUpdate.Error -> r.copy(error = u.message)
                is AgentUpdate.Rejected -> r.copy(rejected = u.message)
                AgentUpdate.Truncated -> r.copy(truncated = true)
                else -> r
            }
            handle(us)
        }
        try {
            val body = agent.input(threadId, uuid(), extra)
            var reached = false
            coroutineScope {
                current = launch {
                    try {
                        transport.post(body, headers).collect { bytes ->
                            reached = true
                            watch(agent.feed(bytes))
                        }
                        reached = true
                    } catch (e: AgentHttpException) {
                        r = r.copy(error = e.message)
                        note = "The agent answered ${e.status}."
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        // Before the response, the agent wasn't reached; after, the stream broke.
                        if (!reached) {
                            r = r.copy(error = "the agent couldn't be reached (${e.message})")
                            note = "The agent couldn't be reached."
                        }
                    }
                }
            }
            // The response ended (or was stopped): a run left open is cut off.
            if (reached) watch(agent.end())
        } finally {
            current = null
            running = false
        }
        return r
    }

    private fun turn(id: String) = turns.firstOrNull { it.id == id }

    private fun answer(t: AgentTurn): Answer? {
        t.answer?.let { return it }
        val a = runCatching { Answer(packs, custom) }.getOrNull() ?: return null
        a.components.apply(agent.components(t.id))
        a.components.onChange = { node, v -> agent.setComponent(t.id, node, v) }
        t.answer = a
        return a
    }

    /** Applies the core's updates to the turns. */
    internal fun handle(updates: List<AgentUpdate>) {
        for (u in updates) {
            onUpdate?.invoke(u)
            when (u) {
                is AgentUpdate.Message -> if (u.role == "user" || u.role == "assistant") {
                    // Where the core put it among the turns shown (other roles aren't).
                    val before = (agent.messages as? JsonArray)?.take(u.index)?.mapNotNull { ((it as? JsonObject)?.get("id") as? JsonPrimitive)?.content } ?: emptyList()
                    val at = turns.indexOfLast { it.id in before } + 1
                    turns.add(at.coerceIn(0, turns.size), AgentTurn(u.id, u.role))
                }
                is AgentUpdate.Text -> turn(u.id)?.let { t -> if (t.role == "user") t.text += u.delta else answer(t)?.push(u.delta) }
                is AgentUpdate.End -> turn(u.id)?.answer?.finish(u.truncated)
                is AgentUpdate.Reset -> turn(u.id)?.let { t ->
                    t.answer?.close()
                    t.answer = null
                    t.text = ""
                }
                is AgentUpdate.Removed -> turns.removeAll { t -> (t.id == u.id).also { if (it) t.answer?.close() } }
                AgentUpdate.State -> for (t in turns) t.answer?.components?.apply(agent.components(t.id))
                is AgentUpdate.Tool -> onToolCall?.let { call ->
                    toolAnswers += scope.async {
                        val result = call(u.id, u.name, u.arguments) ?: return@async false
                        handle(agent.add(obj("id" to uuid(), "role" to "tool", "toolCallId" to u.id, "content" to result)))
                        true
                    }
                }
                is AgentUpdate.Error -> note = "The agent stopped: ${u.message}"
                is AgentUpdate.Rejected -> note = "The agent's reply broke off (it didn't follow the protocol)."
                AgentUpdate.Truncated -> note = "The reply was cut off."
                else -> {}
            }
        }
    }

    /** The reader acted in an answer: a turn of their own, unless it's only state. */
    fun act(action: Action) {
        if (!sendActions || running) return
        val text = actionMessage(action) ?: return
        val drawings = (action as? Action.Submit)?.fields?.values?.filterIsInstance<FieldValue.Image>().orEmpty()
        val content: JsonElement = if (drawings.isEmpty()) JsonPrimitive(text) else JsonArray(
            listOf(obj("type" to "text", "text" to text)) + drawings.map {
                obj("type" to "image", "source" to obj("type" to "data", "value" to base64(it.png), "mimeType" to "image/png"))
            },
        )
        scope.launch { send(content) }
    }

    override fun close() {
        current?.cancel()
        for (t in turns) t.answer?.close()
        agent.close()
    }
}

private fun base64(b: ByteArray): String {
    val abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    val out = StringBuilder((b.size + 2) / 3 * 4)
    for (i in b.indices step 3) {
        val n = ((b[i].toInt() and 0xff) shl 16) or ((b.getOrNull(i + 1)?.toInt()?.and(0xff) ?: 0) shl 8) or (b.getOrNull(i + 2)?.toInt()?.and(0xff) ?: 0)
        out.append(abc[n shr 18 and 63]).append(abc[n shr 12 and 63])
        out.append(if (i + 1 < b.size) abc[n shr 6 and 63] else '=').append(if (i + 2 < b.size) abc[n and 63] else '=')
    }
    return out.toString()
}

/** The conversation: the reader's turns on the right, the agent's answers as they stream. */
@Composable
fun AgentView(
    conversation: AgentConversation,
    modifier: Modifier = Modifier,
    colors: MorphColors = morphColors(),
    components: Map<String, CustomComponent> = emptyMap(),
    image: ImageContent? = null,
    media: MediaPolicy = MediaPolicy(),
    onAction: (Action) -> Unit = {},
) {
    CompositionLocalProvider(LocalMorphColors provides colors) {
        Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Tokens.s6)) {
            for (t in conversation.turns) key(t.id) {
                if (t.role == "user") {
                    if (t.text.isNotEmpty()) Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
                        Txt(t.text, Type.body.copy(color = colors.ink), Modifier.widthIn(max = 560.dp).background(colors.tile, RoundedCornerShape(Radius)).padding(horizontal = Tokens.s3, vertical = Tokens.s2))
                    }
                } else {
                    t.answer?.let { a ->
                        AnswerView(a, colors = colors, components = components, image = image, media = media, onAction = { act ->
                            onAction(act)
                            conversation.act(act)
                        })
                    }
                }
            }
            conversation.note?.let { n ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                    Box(Modifier.size(6.dp).background(if (n.startsWith("The reply was cut off")) colors.ink3 else colors.bad, CircleShape))
                    Txt(n, Type.footnote.copy(color = colors.ink2))
                }
            }
        }
    }
}
