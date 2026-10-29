// The interactive components' state as plain JSON (roadmap Q9), the same
// shapes on every platform: Quiz {answers: [choice index or null]},
// Flashcards {known: [card index]}, Poll {vote: option or null}, Checklist
// {done: [item index]}, WhatIf {values: {slider: number}}, Form {fields:
// {name: value}}. The composables read and write it here, so state set from
// outside (an agent's shared state) shows at once, and the reader's changes
// go out through `onChange`.

package com.morphscreen.core

import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateMapOf
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

/** One answer's components' state, by node id. */
@Stable
class ComponentStore {
    private val values = mutableStateMapOf<String, JsonElement>()
    /** The reader changed a component. */
    var onChange: ((node: String, state: JsonElement) -> Unit)? = null

    operator fun get(node: String): JsonElement? = values[node]

    /** The reader acted: kept, and reported. */
    fun set(node: String, state: JsonElement) {
        if (values[node] == state) return
        values[node] = state
        onChange?.invoke(node, state)
    }

    /** From outside (an agent's state): shown, not reported, since the reader didn't act. */
    fun apply(states: Map<String, JsonElement>) {
        for ((node, v) in states) if (values[node] != v) values[node] = v
    }
}

/** A field of a state object. */
operator fun JsonElement?.get(key: String): JsonElement? = (this as? JsonObject)?.get(key)

/** A list of whole numbers (indices). */
val JsonElement?.indices: List<Int> get() = (this as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull ?: (it as? JsonPrimitive)?.doubleOrNull?.toInt() } ?: emptyList()

fun indices(list: Iterable<Int>): JsonArray = JsonArray(list.map { JsonPrimitive(it) })

fun stateOf(vararg kv: Pair<String, JsonElement>): JsonObject = JsonObject(kv.toMap())
