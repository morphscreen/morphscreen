// The device pack's second set on Android: the share sheet, the calendar's
// insert screen, the contact picker (no contacts permission: the picker
// grants the one contact chosen), and voice notes with MediaRecorder.

package com.morphscreen.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.provider.CalendarContract
import android.provider.ContactsContract
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.morphscreen.core.UINode
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.TimeZone

internal actual fun localOffsetMinutes(): Int = TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000

internal actual fun currentMillis(): Long = System.currentTimeMillis()

internal actual fun strokesPng(strokes: List<List<Offset>>, width: Int, height: Int): ByteArray {
    val bmp = Bitmap.createBitmap(width.coerceAtLeast(1), height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    canvas.drawColor(android.graphics.Color.WHITE)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.BLACK
        style = Paint.Style.STROKE
        strokeWidth = 4f
        strokeCap = Paint.Cap.ROUND
    }
    for (s in strokes) {
        if (s.size < 2) continue
        val p = android.graphics.Path()
        p.moveTo(s[0].x, s[0].y)
        for (o in s.drop(1)) p.lineTo(o.x, o.y)
        canvas.drawPath(p, paint)
    }
    return ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
}

@Composable
internal actual fun rememberShare(): (String) -> Unit {
    val context = LocalContext.current
    return { text ->
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        context.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

@Composable
internal actual fun rememberAddToCalendar(): (UINode) -> Unit {
    val context = LocalContext.current
    return { node ->
        val offset = localOffsetMinutes()
        val begin = parseWhenMillis(node.attr("start") ?: "", offset)
        val end = node.attr("end")?.let { parseWhenMillis(it, offset) }
        val i = Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.Events.TITLE, node.attr("title") ?: "")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        node.attr("where")?.let { i.putExtra(CalendarContract.Events.EVENT_LOCATION, it) }
        node.attr("note")?.let { i.putExtra(CalendarContract.Events.DESCRIPTION, it) }
        begin?.let { i.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, it) }
        (end ?: begin?.plus(3_600_000))?.let { i.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, it) }
        context.startActivity(i)
    }
}

@Composable
internal actual fun ContactField(node: UINode, onValue: (String) -> Unit) {
    val context = LocalContext.current
    var text by rememberSaveable(node.id) { mutableStateOf("") }
    // Picking a phone number grants read access to that one entry.
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val uri = r.data?.data ?: return@rememberLauncherForActivityResult
        context.contentResolver.query(uri, arrayOf(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER), null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                text = listOfNotNull(c.getString(0), c.getString(1)).filter { it.isNotBlank() }.joinToString(", ")
                onValue(text)
            }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TextInput(text, { text = it; onValue(it) }, "Name, phone or email")
        SecondaryButton("Choose from contacts") { pick.launch(Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI)) }
    }
}

@Composable
internal actual fun VoiceNoteField(node: UINode, onFile: (String) -> Unit) {
    val context = LocalContext.current
    val max = (node.attr("max")?.toIntOrNull() ?: 120).coerceIn(1, 600)
    var recorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var file by rememberSaveable(node.id) { mutableStateOf("") }
    fun start() {
        val out = File(context.cacheDir, "voice-${System.currentTimeMillis()}.m4a")
        @Suppress("DEPRECATION")
        val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
        r.setAudioSource(MediaRecorder.AudioSource.MIC)
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        r.setMaxDuration(max * 1000)
        r.setOutputFile(out.absolutePath)
        r.setOnInfoListener { mr, what, _ ->
            if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
                mr.stop(); mr.release(); recorder = null
                file = Uri.fromFile(out).toString(); onFile(file)
            }
        }
        r.prepare()
        r.start()
        recorder = r
        file = Uri.fromFile(out).toString()
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) start() }
    DisposableEffect(Unit) { onDispose { recorder?.release() } }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        SecondaryButton(if (recorder != null) "Stop" else if (file.isEmpty()) "Record" else "Record again") {
            val r = recorder
            if (r != null) {
                runCatching { r.stop() }
                r.release()
                recorder = null
                onFile(file)
            } else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                start()
            } else {
                ask.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
        if (recorder != null) Txt("Recording…", Type.footnote.copy(color = colors.bad))
        else if (file.isNotEmpty()) Txt("Voice note added", Type.footnote.copy(color = colors.ink3))
    }
}
