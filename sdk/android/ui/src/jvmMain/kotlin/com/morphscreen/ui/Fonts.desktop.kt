// Plex from the SDK's resources (font/, shared with Android's res/font).

package com.morphscreen.ui

import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
internal actual fun plexFont(mono: Boolean, weight: FontWeight): Font =
    if (mono) {
        androidx.compose.ui.text.platform.Font(if (weight.weight >= 550) "font/ibm_plex_mono_semibold.ttf" else "font/ibm_plex_mono_regular.ttf", weight, FontStyle.Normal)
    } else {
        androidx.compose.ui.text.platform.Font("font/ibm_plex_sans_var.ttf", weight, FontStyle.Normal, FontVariation.Settings(FontVariation.weight(weight.weight.coerceIn(100, 700))))
    }
