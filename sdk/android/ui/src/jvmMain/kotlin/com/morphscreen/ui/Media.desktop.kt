package com.morphscreen.ui

import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

private val http: HttpClient by lazy { HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build() }

internal actual suspend fun fetchImage(url: String): ImageBitmap? = withContext(Dispatchers.IO) {
    runCatching {
        val r = http.send(HttpRequest.newBuilder(URI(url)).timeout(Duration.ofSeconds(15)).GET().build(), HttpResponse.BodyHandlers.ofByteArray())
        if (r.statusCode() != 200 || r.body().size > (12 shl 20)) return@runCatching null
        org.jetbrains.skia.Image.makeFromEncoded(r.body()).toComposeImageBitmap()
    }.getOrNull()
}
