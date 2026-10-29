package com.morphscreen.ui

import kotlin.test.Test
import kotlin.test.assertEquals

/** Map tiles on the app's own key (roadmap Q15): each provider's address and credit, as the web SDK writes them. */
class MapsTest {
    @Test
    fun eachProvidersTilesAndCredit() {
        val stadia = tileSource(MapTiles.Stadia(key = "K"), dark = false)
        assertEquals("https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key=K", stadia.url)
        assertEquals("© Stadia Maps © OpenMapTiles © OpenStreetMap contributors", stadia.credit)
        assertEquals("https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png", tileSource(MapTiles.Stadia(), dark = true).url)
        assertEquals("https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=K", tileSource(MapTiles.MapTiler("K"), dark = false).url)
        assertEquals("https://api.maptiler.com/maps/streets-v2-dark/256/{z}/{x}/{y}.png?key=K", tileSource(MapTiles.MapTiler("K"), dark = true).url)
        assertEquals("© MapTiler © OpenStreetMap contributors", tileSource(MapTiles.MapTiler("K"), dark = false).credit)
        val tf = tileSource(MapTiles.Thunderforest("K"), dark = false)
        assertEquals("https://api.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey=K", tf.url)
        assertEquals("Maps © Thunderforest, Data © OpenStreetMap contributors", tf.credit)
        val google = tileSource(MapTiles.Google("K e/y"), dark = false, session = "S1")
        assertEquals("https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=S1&key=K%20e%2Fy", google.url)
        assertEquals("Google Maps" to 22, google.credit to google.maxZoom)
        val own = tileSource(MapTiles.Tiles("https://tiles.example/{z}/{x}/{y}.png", "© Example", 18), dark = true)
        assertEquals(TileSource("https://tiles.example/{z}/{x}/{y}.png", "© Example", 18), own)
    }
}
