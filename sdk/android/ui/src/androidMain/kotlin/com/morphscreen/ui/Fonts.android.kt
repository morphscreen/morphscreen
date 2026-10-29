// Plex from the library's res/font (also the desktop build's resources).

package com.morphscreen.ui

import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
internal actual fun plexFont(mono: Boolean, weight: FontWeight): Font =
    if (mono) {
        Font(if (weight.weight >= 550) R.font.ibm_plex_mono_semibold else R.font.ibm_plex_mono_regular, weight, FontStyle.Normal)
    } else {
        Font(R.font.ibm_plex_sans_var, weight, FontStyle.Normal, FontVariation.Settings(FontVariation.weight(weight.weight.coerceIn(100, 700))))
    }
