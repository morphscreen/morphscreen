package com.morphscreen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.click
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.graphics.toAwtImage
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.runDesktopComposeUiTest
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.morphscreen.core.Answer
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChartsTest {
    @Test
    fun pickingFollowsTheDrawing() {
        val size = IntSize(400, 200)
        // Bars and lines: 40 dp of axis labels, then equal bands (density 1).
        assertEquals(0, pickIndex("bar", Offset(60f, 100f), size, 3, 1f))
        assertEquals(2, pickIndex("line", Offset(390f, 100f), size, 3, 1f))
        assertNull(pickIndex("bar", Offset(10f, 100f), size, 3, 1f), "the axis labels pick nothing")
        // Horizontal bars: bands down the plot.
        assertEquals(1, pickIndex("horizontal", Offset(200f, 100f), size, 3, 1f))
        // Radar: spoke 0 points up.
        assertEquals(0, pickIndex("radar", Offset(200f, 10f), size, 4, 1f))
        assertEquals(1, pickIndex("radar", Offset(390f, 100f), size, 4, 1f))
        // Pie: clockwise from the top; the first slice is half the circle.
        val pie = IntSize(180, 180)
        assertEquals(0, pieSlice(Offset(150f, 90f), pie, listOf(50.0, 30.0, 20.0)))
        assertEquals(1, pieSlice(Offset(40f, 120f), pie, listOf(50.0, 30.0, 20.0)))
    }

    /** Taps the middle of each chart in the fixture and reads the tooltip. */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun aTapShowsTheValuesAsWritten() = runDesktopComposeUiTest(width = 760, height = 4000) {
        val text = File(System.getProperty("user.dir"), "../../../test/fixtures/charts.md").takeIf { it.exists() }?.readText()
            ?: File("../../test/fixtures/charts.md").readText()
        val answer = Answer().apply { push(text); finish() }
        setContent { androidx.compose.foundation.layout.Box(Modifier.width(760.dp).background(colors.page)) { AnswerView(answer) } }
        waitForIdle()
        // The bar chart: its first band holds Jan, 120.
        val canvases = onAllNodes(SemanticsMatcher("chart") { it.config.getOrNull(SemanticsProperties.ContentDescription)?.any { d: String -> d.contains(" chart: ") } == true })
        canvases[0].performTouchInput { click(Offset(40.dp.toPx() + 20f, height / 2f)) }
        waitForIdle()
        assertTrue(onAllNodesWithText("Jan").fetchSemanticsNodes().isNotEmpty(), "the tooltip names the category")
        assertTrue(onAllNodesWithText("120").fetchSemanticsNodes().isNotEmpty(), "the tooltip shows the value as written")
        // CHARTS_SHOT=file.png: the line chart with its tooltip open, to look at.
        System.getenv("CHARTS_SHOT")?.let { path ->
            canvases[1].performTouchInput { click(Offset(width * 0.6f, height / 2f)) }
            waitForIdle()
            javax.imageio.ImageIO.write(onRoot().captureToImage().toAwtImage(), "png", File(path))
        }
        answer.close()
    }
}
