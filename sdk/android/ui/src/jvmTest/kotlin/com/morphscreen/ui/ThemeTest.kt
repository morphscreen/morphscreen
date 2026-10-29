package com.morphscreen.ui

import androidx.compose.ui.text.font.FontWeight
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

// The theme format (roadmap T1): spec/theme.tokens.json read here is the
// built-in theme exactly, any other theme file reads too, and a broken one
// says which token is wrong.
class ThemeTest {
    private val repo = File(System.getProperty("morphscreen.raw")).resolve("../..").canonicalFile
    private fun read(path: String) = repo.resolve(path).readText()

    @Test fun theFileIsTheBuiltInTheme() {
        assertEquals(MorphTheme.Standard, MorphTheme.fromDtcg(read("spec/theme.tokens.json")))
    }

    @Test fun anotherThemeReads() {
        val clay = MorphTheme.fromDtcg(read("test/fixtures/themes/clay.tokens.json"))
        assertEquals("Charter", clay.fonts.sans.first())
        assertEquals(2f, clay.radius.card)
        assertEquals(18f, clay.space.s4)
        assertEquals(0xFFA2431CL, clay.light.accent)
        assertEquals(MorphTheme.Standard.type.body, clay.type.body)
    }

    @Test fun aliasesAndErrors() {
        val text = read("spec/theme.tokens.json")
        val darkFocus = Regex("(\"dark\": \\{\\s*\"page\"[\\s\\S]*?\"focus\": )\\{[^\\n]*\\}(,)")
        val aliased = darkFocus.replaceFirst(text, "$1{ \"\\\$value\": \"{color.dark.ink}\" }$2")
        assertEquals(MorphTheme.Standard.dark.ink, MorphTheme.fromDtcg(aliased).dark.focus)
        val missing = Regex("\\n\\s*\"accentBg\": [^\\n]*").replaceFirst(text, "")
        val e = assertFailsWith<ThemeException> { MorphTheme.fromDtcg(missing) }
        assertTrue("color.light.accentBg" in e.message!!, e.message)
    }

    @Test fun plexShipsWithTheSdk() {
        for (f in listOf("font/ibm_plex_sans_var.ttf", "font/ibm_plex_mono_regular.ttf", "font/ibm_plex_mono_semibold.ttf", "font/PLEX-LICENSE.txt"))
            assertTrue(javaClass.classLoader.getResource(f) != null, f)
        assertTrue(family(MorphTheme.Standard.fonts.sans, emptyMap()) != androidx.compose.ui.text.font.FontFamily.Default)
        assertEquals(androidx.compose.ui.text.font.FontFamily.Serif, family(listOf("Nonexistent Face", "ui-serif"), emptyMap()))
        plexFont(false, FontWeight(650))
    }
}
