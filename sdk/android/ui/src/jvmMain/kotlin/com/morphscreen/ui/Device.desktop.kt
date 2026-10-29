// The device pack on the desktop: places as a numbered list with map links,
// files and photos from the system picker, codes and places typed in.

package com.morphscreen.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.morphscreen.core.UINode
import java.awt.FileDialog
import java.awt.Frame
import java.io.File

@Composable
internal actual fun MapBlock(node: UINode) {
    val uri = LocalUriHandler.current
    val c = colors
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        node.attr("title")?.let { Txt(it, Type.callout.copy(fontWeight = FontWeight.SemiBold)) }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (p in places(node)) {
                Column(Modifier.clickable(role = Role.Button) { uri.openUri(mapLink(p)) }) {
                    Txt("${p.index + 1}. ${p.name}", Type.body.copy(fontWeight = FontWeight.Medium))
                    if (p.address.isNotEmpty()) Txt(p.address, Type.footnote.copy(color = c.ink3))
                }
            }
        }
    }
}

@Composable
internal actual fun DeviceField(node: UINode) {
    val form = LocalForm.current
    val key = fieldName(node)
    Labeled(node.attr("label") ?: "", node.attr("hint"), node.flag("required")) {
        when (node.type) {
            "Scan" -> {
                var code by rememberSaveable(node.id) { mutableStateOf("") }
                TextInput(code, { code = it; form?.values?.set(key, FieldValue.Text(it)) }, "Type the code")
            }
            "Location" -> {
                var place by rememberSaveable(node.id) { mutableStateOf("") }
                TextInput(place, { place = it; form?.values?.set(key, FieldValue.Text(it)) }, "City or address")
            }
            else -> {
                var files by rememberSaveable(node.id) { mutableStateOf(listOf<String>()) }
                val photo = node.type == "Camera"
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    SecondaryButton(if (files.isEmpty()) (if (photo) "Choose photo" else "Choose file") else "Choose again") {
                        val chosen = pick(if (photo) listOf("image") else options(node.attr("accept")), node.flag("multiple"))
                        if (chosen.isNotEmpty()) {
                            files = chosen.map { it.toURI().toString() }
                            form?.values?.set(key, FieldValue.Files(files))
                        }
                    }
                    for (f in files) Txt(f.substringAfterLast('/'), Type.footnote.copy(color = colors.ink3))
                }
            }
        }
    }
}

/** The system file dialog, filtered by the field's accept list. */
internal fun pick(accept: List<String>, multiple: Boolean): List<File> {
    val d = FileDialog(null as Frame?, "Choose", FileDialog.LOAD)
    d.isMultipleMode = multiple
    val exts = accept.flatMap {
        when (it.lowercase()) {
            "image", "images", "photo", "photos", "image/*" -> listOf("jpg", "jpeg", "png", "heic", "webp", "gif")
            "pdf", "application/pdf" -> listOf("pdf")
            "video", "videos", "video/*" -> listOf("mp4", "mov", "webm")
            "audio", "audio/*" -> listOf("mp3", "m4a", "wav", "ogg")
            else -> if (it.startsWith(".")) listOf(it.drop(1).lowercase()) else emptyList()
        }
    }
    if (exts.isNotEmpty()) d.setFilenameFilter { _, name -> name.substringAfterLast('.').lowercase() in exts }
    d.isVisible = true
    return d.files.toList()
}
