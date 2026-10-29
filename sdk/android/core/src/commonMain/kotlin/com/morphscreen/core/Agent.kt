// AG-UI (roadmap Q9): the core's client for a conversation with an agent
// that speaks AG-UI 1.0. Response bytes go in; what to draw comes out as
// updates (rust/core/src/agui.rs lists them), the same as on the web and iOS.

package com.morphscreen.core

import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/** What a conversation with an AG-UI agent reports. */
sealed interface AgentUpdate {
    data class Run(val threadId: String, val runId: String) : AgentUpdate
    data class Message(val id: String, val role: String, val index: Int) : AgentUpdate
    data class Text(val id: String, val delta: String) : AgentUpdate
    data class End(val id: String, val truncated: Boolean) : AgentUpdate
    data class Reset(val id: String) : AgentUpdate
    data class Removed(val id: String) : AgentUpdate
    data class Changed(val id: String) : AgentUpdate
    data class Tool(val id: String, val name: String, val arguments: String, val parentMessageId: String) : AgentUpdate
    data object State : AgentUpdate
    data class Step(val name: String, val started: Boolean) : AgentUpdate
    data class Custom(val name: String, val value: JsonElement) : AgentUpdate
    data class Finished(val outcome: String, val pending: List<String>) : AgentUpdate
    data class Error(val message: String, val code: String?) : AgentUpdate
    data class Rejected(val message: String) : AgentUpdate
    data object Truncated : AgentUpdate
    data class Warn(val message: String) : AgentUpdate
}

internal val agentJson = Json { ignoreUnknownKeys = true }

fun decodeUpdates(text: String): List<AgentUpdate> = text.split('\n').filter { it.isNotEmpty() }.mapNotNull { line ->
    val u = runCatching { agentJson.parseToJsonElement(line) as JsonObject }.getOrNull() ?: return@mapNotNull null
    fun s(k: String) = (u[k] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: ""
    when (s("t")) {
        "run" -> AgentUpdate.Run(s("threadId"), s("runId"))
        "message" -> AgentUpdate.Message(s("id"), s("role"), (u["index"] as? JsonPrimitive)?.doubleOrNull?.toInt() ?: 0)
        "text" -> AgentUpdate.Text(s("id"), s("delta"))
        "end" -> AgentUpdate.End(s("id"), (u["truncated"] as? JsonPrimitive)?.booleanOrNull == true)
        "reset" -> AgentUpdate.Reset(s("id"))
        "removed" -> AgentUpdate.Removed(s("id"))
        "changed" -> AgentUpdate.Changed(s("id"))
        "tool" -> AgentUpdate.Tool(s("id"), s("name"), s("arguments"), s("parentMessageId"))
        "state" -> AgentUpdate.State
        "step" -> AgentUpdate.Step(s("name"), (u["started"] as? JsonPrimitive)?.booleanOrNull == true)
        "custom" -> AgentUpdate.Custom(s("name"), u["value"] ?: JsonNull)
        "finished" -> AgentUpdate.Finished(s("outcome"), (u["pending"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.content } ?: emptyList())
        "error" -> AgentUpdate.Error(s("message"), (u["code"] as? JsonPrimitive)?.content)
        "rejected" -> AgentUpdate.Rejected(s("message"))
        "truncated" -> AgentUpdate.Truncated
        "warn" -> AgentUpdate.Warn(s("message"))
        else -> null
    }
}

/**
 * The core's AG-UI client: response bytes in, updates out; the conversation
 * and the shared state. Use it on one thread; close it when done.
 */
expect class AgentCore() : AutoCloseable {
    /** Bytes of the response body, as they arrive. */
    fun feed(bytes: ByteArray): List<AgentUpdate>

    /** Any other call by name (rust/ffi Agent::call); throws CoreException on failure. */
    fun call(op: String, a: String = "", b: String = "", c: String = ""): String

    override fun close()
}

/** One event, for an app with its own transport. */
fun AgentCore.event(json: String): List<AgentUpdate> = decodeUpdates(call("event", json))
/** The response ended. */
fun AgentCore.end(): List<AgentUpdate> = decodeUpdates(call("close"))
/** The reader's message, or a tool's answer (an AG-UI message). */
fun AgentCore.add(message: JsonElement): List<AgentUpdate> = decodeUpdates(call("add", message.toString()))
/** The next run's request body. */
fun AgentCore.input(threadId: String, runId: String, extra: JsonElement? = null): String = call("input", threadId, runId, extra?.toString() ?: "")
/** A saved conversation. */
fun AgentCore.load(messages: JsonElement, state: JsonElement? = null): List<AgentUpdate> = decodeUpdates(call("load", messages.toString(), state?.toString() ?: ""))
val AgentCore.messages: JsonElement get() = agentJson.parseToJsonElement(call("messages"))
val AgentCore.state: JsonElement get() = agentJson.parseToJsonElement(call("state"))
fun AgentCore.setState(v: JsonElement) { call("setState", v.toString()) }
/** An answer's components' state, by node id. */
fun AgentCore.components(messageId: String): Map<String, JsonElement> = (agentJson.parseToJsonElement(call("components", messageId)) as? JsonObject) ?: emptyMap()
fun AgentCore.setComponent(messageId: String, node: String, v: JsonElement) { call("setComponent", messageId, node, v.toString()) }

/** The user message an action (JSON) starts, or "" when it starts none (spec/format.md, "Actions"). */
expect fun actionMessage(actionJson: String): String

/** How a run's request goes out and its response comes back. */
interface AgentTransport {
    /** POSTs the run input; emits the response body as it arrives. Throws [AgentHttpException] for a status other than 200. */
    fun post(body: String, headers: Map<String, String>): Flow<ByteArray>
}

class AgentHttpException(val status: Int) : Exception("the agent answered $status")
