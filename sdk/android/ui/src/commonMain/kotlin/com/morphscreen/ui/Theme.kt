// The theme: everything an answer's look depends on (faces and type scale,
// colours in light, dark and mono, corners, spacing, depth, motion). The
// default is MorphTheme.Standard (Tokens.kt, generated from
// spec/theme.tokens.json); MorphTheme.fromDtcg reads an app's own in the same
// W3C Design Tokens form, and AnswerView(theme = ...) draws with it.

package com.morphscreen.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class Family { Sans, Mono }

/** A type step: size and line height in sp, weight 100 to 900, tracking in sp. */
@Immutable data class TypeStep(val family: Family, val size: Float, val line: Float, val weight: Int, val tracking: Float)

@Immutable data class TypeScale(
    val body: TypeStep, val callout: TypeStep, val footnote: TypeStep, val caption: TypeStep, val headline: TypeStep,
    val title3: TypeStep, val title2: TypeStep, val title: TypeStep, val mono: TypeStep, val display: TypeStep,
)

@Immutable data class Space(val s1: Float, val s2: Float, val s3: Float, val s4: Float, val s5: Float, val s6: Float)

/** Cards, controls (fields, buttons, chips), small marks (badges, keys). */
@Immutable data class Radii(val card: Float, val control: Float, val small: Float)

/** Durations in ms; curves as cubic Bézier control points. */
@Immutable data class Motion(val fast: Int, val base: Int, val slow: Int, val ease: List<Float>, val spring: List<Float>)

@Immutable data class Shadow(val x: Float, val y: Float, val blur: Float, val spread: Float, val rgb: Long, val alpha: Float)

@Immutable data class MorphPalette(
    val page: Long, val surface: Long, val tile: Long, val ink: Long, val ink2: Long, val ink3: Long, val line: Long, val line2: Long, val focus: Long,
    val accent: Long, val accentInk: Long, val accentBg: Long,
    /** A primary button and a chosen slot: the brand colour, ink unless the theme names one. */
    val primary: Long, val primaryInk: Long,
    val good: Long, val goodBg: Long, val warn: Long, val warnBg: Long, val bad: Long, val badBg: Long, val info: Long, val infoBg: Long, val star: Long,
    val series: List<Long>,
    /** A resting card's shadow, and a lifted one's (a popover, a featured plan). */
    val rest: List<Shadow>,
    val lifted: List<Shadow>,
    /** The strongest tint a heatmap cell gets, so its text stays readable. */
    val heatMax: Float,
)

/** Family names, first choice first, as a CSS font stack lists them. */
@Immutable data class Fonts(val sans: List<String>, val mono: List<String>)

@Immutable data class MorphTheme(
    val fonts: Fonts,
    val type: TypeScale,
    val space: Space,
    val radius: Radii,
    val motion: Motion,
    val light: MorphPalette,
    val dark: MorphPalette,
    val mono: MorphPalette,
) {
    companion object {
        /** IBM Plex Sans and Mono with a petrol accent. */
        val Standard: MorphTheme get() = StandardTheme

        /**
         * A theme from a W3C Design Tokens file (spec/theme.tokens.json's shape):
         * colour, shadow and heat per mode, aliases followed. Throws
         * [ThemeException], naming the token, when one is missing or wrong.
         */
        fun fromDtcg(json: String): MorphTheme = readDtcg(json)
    }
}

class ThemeException(message: String) : IllegalArgumentException(message)

@Immutable
data class MorphColors(
    val page: Color,
    val surface: Color,
    val tile: Color,
    val ink: Color,
    val ink2: Color,
    val ink3: Color,
    val line: Color,
    val line2: Color,
    val good: Color,
    val goodBg: Color,
    val warn: Color,
    val warnBg: Color,
    val bad: Color,
    val badBg: Color,
    val info: Color,
    val infoBg: Color,
    /** Chart series, in order. */
    val series: List<Color>,
    /** The strongest tint a heatmap cell gets, so its text stays readable. */
    val heatMax: Float = 0.62f,
    val focus: Color = ink,
    /** What can be pressed or is chosen, focus, the first series. */
    val accent: Color = ink,
    /** Text and marks on a filled accent. */
    val accentInk: Color = surface,
    /** The accent's light tint (a chosen chip). */
    val accentBg: Color = tile,
    /** A primary button and a chosen slot (the brand colour; ink by default). */
    val primary: Color = ink,
    /** Text on primary. */
    val primaryInk: Color = surface,
    val star: Color = warn,
    val rest: List<Shadow> = emptyList(),
    val lifted: List<Shadow> = emptyList(),
) {
    /** (foreground, background) for a tone. */
    fun tone(t: String?): Pair<Color, Color> = when (t) {
        "success" -> good to goodBg
        "warning" -> warn to warnBg
        "danger" -> bad to badBg
        "info" -> info to infoBg
        else -> ink2 to tile
    }

    companion object {
        fun of(p: MorphPalette) = MorphColors(
            page = Color(p.page), surface = Color(p.surface), tile = Color(p.tile),
            ink = Color(p.ink), ink2 = Color(p.ink2), ink3 = Color(p.ink3),
            line = Color(p.line), line2 = Color(p.line2),
            good = Color(p.good), goodBg = Color(p.goodBg), warn = Color(p.warn), warnBg = Color(p.warnBg),
            bad = Color(p.bad), badBg = Color(p.badBg), info = Color(p.info), infoBg = Color(p.infoBg),
            series = p.series.map { Color(it) },
            heatMax = p.heatMax,
            focus = Color(p.focus), accent = Color(p.accent), accentInk = Color(p.accentInk), accentBg = Color(p.accentBg), star = Color(p.star),
            primary = Color(p.primary), primaryInk = Color(p.primaryInk),
            rest = p.rest, lifted = p.lifted,
        )

        // The default theme's palettes.
        val Light = of(StandardTheme.light)
        val Dark = of(StandardTheme.dark)
        /** Grayscale: tones become ink on light grey (the web's data-theme="mono"). */
        val Mono = of(StandardTheme.mono)
    }
}

val LocalMorphTheme = staticCompositionLocalOf { StandardTheme }
val LocalMorphColors = staticCompositionLocalOf { MorphColors.Light }

internal val colors: MorphColors
    @Composable get() = LocalMorphColors.current

/** A theme's palette for the system's light or dark setting, or grayscale when `mono`. */
@Composable
fun morphColors(dark: Boolean = isSystemInDarkTheme(), mono: Boolean = false, theme: MorphTheme = LocalMorphTheme.current): MorphColors =
    MorphColors.of(if (mono) theme.mono else if (dark) theme.dark else theme.light)

// ---------- Faces ----------

/** IBM Plex Sans (variable) or Plex Mono at a weight, shipped with the SDK (SIL Open Font License). */
internal expect fun plexFont(mono: Boolean, weight: FontWeight): Font

private val SYSTEM_SANS = setOf("system-ui", "ui-sans-serif", "-apple-system", "blinkmacsystemfont", "sans-serif", "roboto", "segoe ui")
private val SYSTEM_MONO = setOf("ui-monospace", "monospace", "sfmono-regular", "menlo", "consolas", "roboto mono")
private val SYSTEM_SERIF = setOf("ui-serif", "serif", "georgia")
private val families = HashMap<List<String>, FontFamily>()

/**
 * The family a theme's stack names: Plex ships with the SDK, system names map
 * to the platform's own faces; a family the app registers itself goes through
 * [LocalFontFamilies].
 */
internal fun family(stack: List<String>, named: Map<String, FontFamily>): FontFamily = families.getOrPut(stack + named.keys) {
    for (name in stack) {
        named[name]?.let { return@getOrPut it }
        when (name.lowercase()) {
            "ibm plex sans" -> return@getOrPut FontFamily((1..9).map { plexFont(false, FontWeight(it * 100)) } + listOf(450, 550, 620, 640, 650).map { plexFont(false, FontWeight(it)) })
            "ibm plex mono" -> return@getOrPut FontFamily(plexFont(true, FontWeight.Normal), plexFont(true, FontWeight.SemiBold))
            in SYSTEM_SANS -> return@getOrPut FontFamily.SansSerif
            in SYSTEM_MONO -> return@getOrPut FontFamily.Monospace
            in SYSTEM_SERIF -> return@getOrPut FontFamily.Serif
        }
    }
    FontFamily.Default
}

/** Faces an app supplies by name, for a theme that names them ("Charter" to its FontFamily). */
val LocalFontFamilies = staticCompositionLocalOf<Map<String, FontFamily>> { emptyMap() }

internal fun TypeStep.style(theme: MorphTheme, named: Map<String, FontFamily>) = TextStyle(
    fontFamily = family(if (family == Family.Mono) theme.fonts.mono else theme.fonts.sans, named),
    fontSize = size.sp,
    lineHeight = line.sp,
    fontWeight = FontWeight(weight),
    letterSpacing = tracking.sp,
)

/** Type: the theme's scale, with how each kind of text breaks. */
internal object Type {
    private val t: MorphTheme @Composable @ReadOnlyComposable get() = LocalMorphTheme.current
    private val f: Map<String, FontFamily> @Composable @ReadOnlyComposable get() = LocalFontFamilies.current

    // Running text hyphenates long words where the platform can (Android does).
    val body: TextStyle @Composable @ReadOnlyComposable get() = t.type.body.style(t, f).copy(hyphens = Hyphens.Auto)
    val callout: TextStyle @Composable @ReadOnlyComposable get() = t.type.callout.style(t, f).copy(hyphens = Hyphens.Auto)
    val footnote: TextStyle @Composable @ReadOnlyComposable get() = t.type.footnote.style(t, f).copy(hyphens = Hyphens.Auto)
    val caption: TextStyle @Composable @ReadOnlyComposable get() = t.type.caption.style(t, f)
    // Titles share their lines evenly instead of stranding a word.
    val headline: TextStyle @Composable @ReadOnlyComposable get() = t.type.headline.style(t, f).copy(lineBreak = LineBreak.Heading)
    val title3: TextStyle @Composable @ReadOnlyComposable get() = t.type.title3.style(t, f).copy(lineBreak = LineBreak.Heading)
    val title2: TextStyle @Composable @ReadOnlyComposable get() = t.type.title2.style(t, f).copy(lineBreak = LineBreak.Heading)
    val title: TextStyle @Composable @ReadOnlyComposable get() = t.type.title.style(t, f).copy(lineBreak = LineBreak.Heading)
    val display: TextStyle @Composable @ReadOnlyComposable get() = t.type.display.style(t, f)
    val mono: TextStyle @Composable @ReadOnlyComposable get() = t.type.mono.style(t, f)
}

/** The theme's spacing, corners and motion. */
internal object Tokens {
    private val t: MorphTheme @Composable @ReadOnlyComposable get() = LocalMorphTheme.current
    val s1: Dp @Composable @ReadOnlyComposable get() = t.space.s1.dp
    val s2: Dp @Composable @ReadOnlyComposable get() = t.space.s2.dp
    val s3: Dp @Composable @ReadOnlyComposable get() = t.space.s3.dp
    val s4: Dp @Composable @ReadOnlyComposable get() = t.space.s4.dp
    val s5: Dp @Composable @ReadOnlyComposable get() = t.space.s5.dp
    val s6: Dp @Composable @ReadOnlyComposable get() = t.space.s6.dp
    val FAST: Int @Composable @ReadOnlyComposable get() = t.motion.fast
    val BASE: Int @Composable @ReadOnlyComposable get() = t.motion.base
    val SLOW: Int @Composable @ReadOnlyComposable get() = t.motion.slow
    val ease: List<Float> @Composable @ReadOnlyComposable get() = t.motion.ease
    val spring: List<Float> @Composable @ReadOnlyComposable get() = t.motion.spring
}

/** Cards. */
internal val Radius: Dp @Composable @ReadOnlyComposable get() = LocalMorphTheme.current.radius.card.dp
/** Fields, buttons, chips. */
internal val RadiusControl: Dp @Composable @ReadOnlyComposable get() = LocalMorphTheme.current.radius.control.dp
/** Badges, keys, small marks. */
internal val RadiusSmall: Dp @Composable @ReadOnlyComposable get() = LocalMorphTheme.current.radius.small.dp
