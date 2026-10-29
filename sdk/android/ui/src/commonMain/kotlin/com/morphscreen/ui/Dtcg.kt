// Reading a theme from the W3C Design Tokens format (DTCG 2025.10), the shape
// of spec/theme.tokens.json: aliases followed, colours as sRGB objects or hex,
// dimensions in px or rem, durations in ms or s.

package com.morphscreen.ui

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.roundToInt

private class DtcgFile(val root: JsonObject) {
    fun at(path: String): JsonElement {
        var node: JsonElement = root
        for (part in path.split(".")) node = (node as? JsonObject)?.get(part) ?: throw ThemeException("no token at $path")
        return (node as? JsonObject)?.get("\$value") ?: throw ThemeException("$path is a group, not a token")
    }

    fun get(path: String): JsonElement = resolve(at(path), listOf(path))

    private fun resolve(v: JsonElement, seen: List<String>): JsonElement = when (v) {
        is JsonPrimitive -> {
            val s = if (v.isString) v.content else null
            if (s != null && s.startsWith("{") && s.endsWith("}")) {
                val p = s.substring(1, s.length - 1)
                if (p in seen) throw ThemeException("alias loop: ${(seen + p).joinToString(" -> ")}")
                resolve(at(p), seen + p)
            } else v
        }
        is JsonArray -> JsonArray(v.map { resolve(it, seen) })
        is JsonObject -> JsonObject(v.mapValues { resolve(it.value, seen) })
    }
}

private fun JsonElement?.num(): Double? = (this as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull

private fun color(v: JsonElement?, at: String): Pair<Long, Float> {
    if (v is JsonPrimitive && v.isString) {
        val s = v.content
        if (s.startsWith("#") && (s.length == 7 || s.length == 9)) {
            val n = s.substring(1).toLongOrNull(16) ?: throw ThemeException("$at: not a colour: $s")
            return if (s.length == 7) n to 1f else (n shr 8) to ((n and 0xFF) / 255f)
        }
    }
    if (v is JsonObject) {
        val alpha = v["alpha"].num()?.toFloat() ?: 1f
        (v["hex"] as? JsonPrimitive)?.let { return color(it, at).first to alpha }
        val c = (v["components"] as? JsonArray)?.map { it.num() }
        if (((v["colorSpace"] as? JsonPrimitive)?.content ?: "srgb") == "srgb" && c != null && c.size == 3 && c.all { it != null })
            return c.fold(0L) { acc, x -> (acc shl 8) or (x!! * 255).roundToInt().coerceIn(0, 255).toLong() } to alpha
    }
    throw ThemeException("$at: not an sRGB colour")
}

private fun dimension(v: JsonElement?, at: String): Float {
    v.num()?.let { return it.toFloat() }
    if (v is JsonObject) v["value"].num()?.let { n -> return (if ((v["unit"] as? JsonPrimitive)?.content == "rem") n * 16 else n).toFloat() }
    if (v is JsonPrimitive && v.isString) {
        val s = v.content.trim()
        if (s.endsWith("rem")) s.dropLast(3).toDoubleOrNull()?.let { return (it * 16).toFloat() }
        (if (s.endsWith("px")) s.dropLast(2) else s).toDoubleOrNull()?.let { return it.toFloat() }
    }
    throw ThemeException("$at: not a dimension")
}

private fun duration(v: JsonElement?, at: String): Int {
    if (v is JsonObject) v["value"].num()?.let { n -> return (if ((v["unit"] as? JsonPrimitive)?.content == "s") n * 1000 else n).roundToInt() }
    if (v is JsonPrimitive && v.isString) {
        val s = v.content.trim()
        if (s.endsWith("ms")) s.dropLast(2).toDoubleOrNull()?.let { return it.roundToInt() }
        if (s.endsWith("s")) s.dropLast(1).toDoubleOrNull()?.let { return (it * 1000).roundToInt() }
    }
    throw ThemeException("$at: not a duration")
}

internal fun readDtcg(json: String): MorphTheme {
    val root = Json.parseToJsonElement(json) as? JsonObject ?: throw ThemeException("a theme is a JSON object")
    val t = DtcgFile(root)
    fun families(k: String): List<String> = when (val v = t.get("font.$k")) {
        is JsonArray -> v.map { (it as JsonPrimitive).content }
        else -> listOf((v as JsonPrimitive).content)
    }
    val fonts = Fonts(families("sans"), families("mono"))
    fun step(k: String): TypeStep {
        val v = t.get("type.$k") as? JsonObject ?: throw ThemeException("type.$k: not a typography value")
        val fam = (v["fontFamily"] as? JsonArray)?.map { (it as JsonPrimitive).content }
        val size = dimension(v["fontSize"], "type.$k.fontSize")
        val lh = v["lineHeight"]
        val line = lh.num()?.let { (size * it).roundToInt().toFloat() } ?: dimension(lh, "type.$k.lineHeight")
        val names = mapOf("regular" to 400, "normal" to 400, "medium" to 500, "semi-bold" to 600, "semibold" to 600, "bold" to 700)
        val w = v["fontWeight"]
        val weight = w.num()?.roundToInt() ?: (w as? JsonPrimitive)?.content?.let { names[it] } ?: 400
        val tracking = if (v["letterSpacing"] == null) 0f else dimension(v["letterSpacing"], "type.$k.letterSpacing")
        return TypeStep(if (fam == fonts.mono) Family.Mono else Family.Sans, size, line, weight, tracking)
    }
    fun px(p: String) = dimension(t.get(p), p)
    fun curve(p: String): List<Float> = (t.get(p) as? JsonArray)?.map { it.num()?.toFloat() ?: throw ThemeException("$p: not a cubic Bézier") }?.takeIf { it.size == 4 }
        ?: throw ThemeException("$p: not a cubic Bézier")
    fun palette(m: String): MorphPalette {
        fun c(r: String) = color(t.get("color.$m.$r"), "color.$m.$r").first or 0xFF000000L
        // A role older themes leave out: the one it falls back to.
        fun optional(r: String, or: String) = if (((root["color"] as? JsonObject)?.get(m) as? JsonObject)?.containsKey(r) == true) c(r) else c(or)
        val group = ((root["color"] as? JsonObject)?.get(m) as? JsonObject)?.get("series") as? JsonObject ?: throw ThemeException("color.$m.series: missing")
        val series = group.keys.filter { !it.startsWith("$") }.sortedBy { it.toIntOrNull() ?: 0 }.map { c("series.$it") }
        if (series.size < 2) throw ThemeException("color.$m.series: at least two colours")
        fun shadows(p: String): List<Shadow> {
            val v = t.get(p)
            return (if (v is JsonArray) v else listOf(v)).map { s ->
                s as? JsonObject ?: throw ThemeException("$p: not a shadow")
                val (rgb, alpha) = color(s["color"], "$p.color")
                Shadow(dimension(s["offsetX"], p), dimension(s["offsetY"], p), dimension(s["blur"], p), s["spread"]?.let { dimension(it, p) } ?: 0f, rgb or 0xFF000000L, alpha)
            }
        }
        val heat = t.get("heat.$m").num()?.toFloat() ?: throw ThemeException("heat.$m: not a number")
        return MorphPalette(
            page = c("page"), surface = c("surface"), tile = c("tile"), ink = c("ink"), ink2 = c("ink2"), ink3 = c("ink3"), line = c("line"), line2 = c("line2"), focus = c("focus"),
            accent = c("accent"), accentInk = c("accentInk"), accentBg = c("accentBg"),
            primary = optional("primary", "ink"), primaryInk = optional("primaryInk", "page"),
            good = c("good"), goodBg = c("goodBg"), warn = c("warn"), warnBg = c("warnBg"), bad = c("bad"), badBg = c("badBg"), info = c("info"), infoBg = c("infoBg"), star = c("star"),
            series = series, rest = shadows("shadow.$m.rest"), lifted = shadows("shadow.$m.lifted"), heatMax = heat,
        )
    }
    return MorphTheme(
        fonts = fonts,
        type = TypeScale(step("body"), step("callout"), step("footnote"), step("caption"), step("headline"), step("title3"), step("title2"), step("title"), step("mono"), step("display")),
        space = Space(px("space.s1"), px("space.s2"), px("space.s3"), px("space.s4"), px("space.s5"), px("space.s6")),
        radius = Radii(px("radius.card"), px("radius.control"), px("radius.small")),
        motion = Motion(duration(t.get("motion.fast"), "motion.fast"), duration(t.get("motion.base"), "motion.base"), duration(t.get("motion.slow"), "motion.slow"), curve("motion.ease"), curve("motion.spring")),
        light = palette("light"),
        dark = palette("dark"),
        mono = palette("mono"),
    )
}
