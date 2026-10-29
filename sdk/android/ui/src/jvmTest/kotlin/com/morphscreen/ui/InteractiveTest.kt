package com.morphscreen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.runDesktopComposeUiTest
import androidx.compose.ui.unit.dp
import com.morphscreen.core.Answer
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class InteractiveTest {
    @Test
    fun formulasRunAsTheCoreCompiledThem() {
        // price * qty * (1 - discount / 100), as the core's postfix tokens.
        val rpn = listOf("price", "qty", "*", "1", "discount", "100", "/", "-", "*")
        val vars = mapOf("price" to 20.0, "qty" to 5.0, "discount" to 10.0)
        assertEquals(90.0, evaluate(rpn) { vars[it] })
        assertEquals(null, evaluate(listOf("1", "x", "/")) { 0.0 }, "dividing by zero is no number")
        assertEquals("$1,234.50", resultText(1234.5, "$", 2))
        assertEquals("−12%", resultText(-12.0, "%", null))
        assertEquals("3.5 kg", resultText(3.5, "kg", 1))
    }

    /** test/fixtures/interactive.md used as a reader would. */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun theReaderCanUseEachOne() = runDesktopComposeUiTest(width = 760, height = 3200) {
        val text = File(System.getProperty("user.dir"), "../../../test/fixtures/interactive.md").takeIf { it.exists() }?.readText()
            ?: File("../../test/fixtures/interactive.md").readText()
        val answer = Answer(listOf("interactive")).apply { push(text); finish() }
        val actions = mutableListOf<Action>()
        setContent { Box(Modifier.width(760.dp).background(colors.page)) { AnswerView(answer, onAction = { actions += it }) } }
        waitForIdle()

        // Quiz: wrong on the first, right on the second.
        onNodeWithText("A. Stomata").performClick()
        onNodeWithText("Carbon dioxide").performClick()
        waitForIdle()
        assertTrue(onAllNodesWithText("1 of 2 right").fetchSemanticsNodes().isNotEmpty(), "the score shows")
        val quiz = actions.filterIsInstance<Action.Quiz>().single()
        assertEquals(1, quiz.score)
        assertEquals(listOf(false, true), quiz.answers.map { it.right })
        assertTrue(onAllNodesWithText("Your answer").fetchSemanticsNodes().isNotEmpty())

        // Flashcards: turn one over, mark it known.
        onNodeWithText("Chlorophyll").performClick()
        waitForIdle()
        onNodeWithText("Got it").performClick()
        waitForIdle()
        assertTrue(onAllNodesWithText("1 of 3 known").fetchSemanticsNodes().isNotEmpty())
        assertEquals(listOf("Chlorophyll"), actions.filterIsInstance<Action.State>().last().value)

        // Poll and checklist.
        onNodeWithText("Transpiration").performClick()
        assertEquals("Transpiration", actions.filterIsInstance<Action.Vote>().single().choice)
        onNodeWithText("Draw the leaf diagram").performClick()
        waitForIdle()
        assertTrue(onAllNodesWithText("2 of 3 done").fetchSemanticsNodes().isNotEmpty())

        // What-if: quantity to 5 gives 20 * 5 * 0.9.
        val quantity = onAllNodes(SemanticsMatcher("range 1..10") { it.config.getOrNull(SemanticsProperties.ProgressBarRangeInfo)?.range == 1f..10f })[0]
        quantity.performSemanticsAction(SemanticsActions.SetProgress) { it(5f) }
        waitForIdle()
        // Shown with the keep-together rule's invisible joiners, read as a reader reads them.
        fun shows(t: String) = onAllNodes(SemanticsMatcher(t) { n -> n.config.getOrNull(SemanticsProperties.Text)?.any { it.text.replace("\u2060", "") == t } == true }).fetchSemanticsNodes().isNotEmpty()
        assertTrue(shows("$90.00"), "the total follows the slider")
        assertTrue(shows("$10.00"))
        answer.close()
    }

    /** Sliders and Results laid out in Columns inside the What-if, as a real answer had them (#239). */
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun aWhatIfsSlidersAndResultsCountWhereverTheySit() = runDesktopComposeUiTest(width = 760, height = 1200) {
        val text = "<WhatIf title=\"Mortgage\">\n<Columns>\n<Slider label=\"Rate (%)\" name=\"rate\" min=\"3\" max=\"9\" step=\"0.25\" value=\"6.5\" />\n<Slider label=\"Price\" name=\"price\" min=\"100000\" max=\"900000\" step=\"1000\" value=\"320000\" unit=\"$\" />\n</Columns>\n<Columns>\n<Result label=\"A month\" value=\"round(price*(rate/100/12)/(1-(1+rate/100/12)^-360))\" unit=\"$\" decimals=\"0\" />\n<Result label=\"A year\" value=\"12*round(price*(rate/100/12)/(1-(1+rate/100/12)^-360))\" unit=\"$\" decimals=\"0\" />\n</Columns>\n</WhatIf>\n"
        val answer = Answer(listOf("interactive")).apply { push(text); finish() }
        setContent { Box(Modifier.width(760.dp).background(colors.page)) { AnswerView(answer, onAction = {}) } }
        waitForIdle()
        fun shows(t: String) = onAllNodes(SemanticsMatcher(t) { n -> n.config.getOrNull(SemanticsProperties.Text)?.any { it.text.replace("\u2060", "") == t } == true }).fetchSemanticsNodes().isNotEmpty()
        assertTrue(shows("$2,023") && shows("$24,276"), "worked out at the sliders' starting values")
        assertTrue(shows("$320,000"), "a slider with a unit shows it, as a Result does (#241)")
        onAllNodes(SemanticsMatcher("range 3..9") { it.config.getOrNull(SemanticsProperties.ProgressBarRangeInfo)?.range == 3f..9f })[0].performSemanticsAction(SemanticsActions.SetProgress) { it(7f) }
        waitForIdle()
        assertTrue(shows("$2,129") && shows("$25,548"), "and as the rate moves")
        answer.close()
    }
}
