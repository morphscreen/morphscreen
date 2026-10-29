package com.morphscreen.ui

import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

internal actual suspend fun fetchImage(url: String): ImageBitmap? = withContext(Dispatchers.IO) {
    runCatching {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 5000
        c.readTimeout = 15000
        c.instanceFollowRedirects = false
        try {
            if (c.responseCode != 200 || c.contentLengthLong > (12L shl 20)) return@runCatching null
            val bytes = c.inputStream.use { it.readBytes() }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
        } finally {
            c.disconnect()
        }
    }.getOrNull()
}
