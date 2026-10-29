// Map tiles on the app's own key (roadmap Q15), as on the web: Google's Map
// Tiles API, Stadia, MapTiler, Thunderforest, or any {z}/{x}/{y} address.
// Tiles load straight from the provider, with the credit each one asks for;
// without a provider a Map is its list of places.

package com.morphscreen.ui

import androidx.compose.runtime.staticCompositionLocalOf

/** The app's own map provider and key, for [AnswerView]'s `maps`. */
sealed interface MapTiles {
    /** Google's Map Tiles API (2D tiles), on a key with that API enabled. */
    data class Google(val key: String, val mapType: String = "roadmap", val language: String = "en-US", val region: String = "US") : MapTiles

    /** Stadia Maps; the key can be left out where Stadia allows the app. */
    data class Stadia(val key: String? = null, val style: String = "alidade_smooth", val darkStyle: String = "alidade_smooth_dark") : MapTiles

    data class MapTiler(val key: String, val style: String = "streets-v2", val darkStyle: String = "streets-v2-dark") : MapTiles

    data class Thunderforest(val key: String, val style: String = "atlas", val darkStyle: String = "transport-dark") : MapTiles

    /** Any raster tile server: [url] with {z}, {x} and {y}, and its [credit]. */
    data class Tiles(val url: String, val credit: String, val maxZoom: Int = 19) : MapTiles
}

/** Where a map's tiles come from: the address with {z}, {x} and {y}, and the credit to show. */
internal data class TileSource(val url: String, val credit: String, val maxZoom: Int)

private const val OSM = "© OpenStreetMap contributors"

private fun enc(s: String): String = buildString {
    for (b in s.encodeToByteArray()) {
        val c = b.toInt() and 0xff
        if (c.toChar().isLetterOrDigit() && c < 128 || c.toChar() in "-._~") append(c.toChar()) else append("%" + c.toString(16).uppercase().padStart(2, '0'))
    }
}

/**
 * The tiles and credit for [m]; [dark] picks the provider's own dark style
 * where it has one. Google's needs its [session] first (createSession).
 */
internal fun tileSource(m: MapTiles, dark: Boolean, session: String? = null): TileSource = when (m) {
    is MapTiles.Google -> TileSource("https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${enc(session ?: "")}&key=${enc(m.key)}", "Google Maps", 22)
    is MapTiles.Stadia -> TileSource(
        "https://tiles.stadiamaps.com/tiles/${enc(if (dark) m.darkStyle else m.style)}/{z}/{x}/{y}.png" + (m.key?.let { "?api_key=${enc(it)}" } ?: ""),
        "© Stadia Maps © OpenMapTiles $OSM",
        20,
    )
    is MapTiles.MapTiler -> TileSource("https://api.maptiler.com/maps/${enc(if (dark) m.darkStyle else m.style)}/256/{z}/{x}/{y}.png?key=${enc(m.key)}", "© MapTiler $OSM", 20)
    is MapTiles.Thunderforest -> TileSource("https://api.thunderforest.com/${enc(if (dark) m.darkStyle else m.style)}/{z}/{x}/{y}.png?apikey=${enc(m.key)}", "Maps © Thunderforest, Data $OSM", 22)
    is MapTiles.Tiles -> TileSource(m.url, m.credit, m.maxZoom)
}

internal val LocalMaps = staticCompositionLocalOf<MapTiles?> { null }
