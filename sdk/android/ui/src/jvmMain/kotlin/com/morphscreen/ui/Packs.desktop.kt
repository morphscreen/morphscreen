// The device pack's second set on the desktop: the clipboard for sharing, the
// system calendar through an .ics file, typed contacts, audio files.

package com.morphscreen.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
import com.morphscreen.core.UINode
import org.jetbrains.skia.EncodedImageFormat
import org.jetbrains.skia.Paint
import org.jetbrains.skia.PaintMode
import org.jetbrains.skia.PaintStrokeCap
import org.jetbrains.skia.Surface
import java.awt.Desktop
import java.awt.Toolkit
import java.awt.datatransfer.StringSelection
import java.io.File
import java.util.TimeZone

internal actual fun localOffsetMinutes(): Int = TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000

internal actual fun currentMillis(): Long = System.currentTimeMillis()

internal actual fun strokesPng(strokes: List<List<Offset>>, width: Int, height: Int): ByteArray {
    val surface = Surface.makeRasterN32Premul(width.coerceAtLeast(1), height.coerceAtLeast(1))
    val canvas = surface.canvas
    canvas.clear(0xFFFFFFFF.toInt())
    val paint = Paint().apply {
        color = 0xFF000000.toInt()
        mode = PaintMode.STROKE
        strokeWidth = 4f
        strokeCap = PaintCap()
        isAntiAlias = true
    }
    for (s in strokes) {
        if (s.size < 2) continue
        for (k in 1 until s.size) canvas.drawLine(s[k - 1].x, s[k - 1].y, s[k].x, s[k].y, paint)
    }
    return surface.makeImageSnapshot().encodeToData(EncodedImageFormat.PNG)?.bytes ?: ByteArray(0)
}

private fun PaintCap() = PaintStrokeCap.ROUND

@Composable
internal actual fun rememberShare(): (String) -> Unit = { text ->
    runCatching { Toolkit.getDefaultToolkit().systemClipboard.setContents(StringSelection(text), null) }
}

@Composable
internal actual fun rememberAddToCalendar(): (UINode) -> Unit = { node ->
    runCatching {
        val f = File.createTempFile("event-", ".ics")
        f.writeText(icsText(node))
        Desktop.getDesktop().open(f)
    }
}

@Composable
internal actual fun ContactField(node: UINode, onValue: (String) -> Unit) {
    var text by rememberSaveable(node.id) { mutableStateOf("") }
    TextInput(text, { text = it; onValue(it) }, "Name, phone or email")
}

@Composable
internal actual fun VoiceNoteField(node: UINode, onFile: (String) -> Unit) {
    var file by rememberSaveable(node.id) { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SecondaryButton(if (file.isEmpty()) "Choose a recording" else "Choose again") {
            pick(listOf("audio"), false).firstOrNull()?.let { file = it.toURI().toString(); onFile(file) }
        }
        if (file.isNotEmpty()) Txt(file.substringAfterLast('/'), Type.footnote.copy(color = colors.ink3))
    }
}
