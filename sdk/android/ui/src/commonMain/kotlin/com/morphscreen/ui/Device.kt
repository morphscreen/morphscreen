// The device pack. Each platform has its own: on Android the camera, ML Kit's
// code scanner, fused location, MapLibre and the document picker; on the
// desktop, file pickers, typed codes and places, and map links. Nothing runs
// until the user taps.

package com.morphscreen.ui

import androidx.compose.runtime.Composable
import com.morphscreen.core.NodeData
import com.morphscreen.core.UINode

/** A place in a Map's table: a name, an address, and coordinates when given. */
data class Place(val index: Int, val name: String, val address: String, val lat: Double?, val lng: Double?)

/** The places in a Map node: lat/lng columns when there are any, else an address column. */
fun places(node: UINode): List<Place> {
    val t = node.data as? NodeData.Table ?: return emptyList()
    val head = t.columns.map { it.lowercase() }
    fun col(f: (String) -> Boolean) = head.indices.firstOrNull { it > 0 && f(head[it]) }
    val lat = col { it.startsWith("lat") }
    val lng = col { it.startsWith("lng") || it.startsWith("lon") }
    val addr = col { "address" in it || "location" in it || "where" in it }
    return t.rows.mapIndexed { i, r ->
        val a = lat?.let { r.getOrNull(it)?.trim()?.toDoubleOrNull() }?.takeIf { kotlin.math.abs(it) <= 90 }
        val b = lng?.let { r.getOrNull(it)?.trim()?.toDoubleOrNull() }?.takeIf { kotlin.math.abs(it) <= 180 }
        Place(i, r.firstOrNull() ?: "", addr?.let { r.getOrNull(it) } ?: "", if (b != null) a else null, if (a != null) b else null)
    }
}

/** An OpenStreetMap link for a place: its pin, or a search for its name and address. */
fun mapLink(p: Place): String =
    if (p.lat != null && p.lng != null) "https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}"
    else "https://www.openstreetmap.org/search?query=" + encode(listOf(p.name, p.address).filter { it.isNotEmpty() }.joinToString(", "))

private fun encode(s: String): String = buildString {
    for (b in s.encodeToByteArray()) {
        val ch = b.toInt() and 0xFF
        if (ch.toChar().isLetterOrDigit() && ch < 128 || ch.toChar() in "-_.~") append(ch.toChar()) else append('%' + ch.toString(16).uppercase().padStart(2, '0'))
    }
}

@Composable
internal expect fun MapBlock(node: UINode)

@Composable
internal expect fun DeviceField(node: UINode)
