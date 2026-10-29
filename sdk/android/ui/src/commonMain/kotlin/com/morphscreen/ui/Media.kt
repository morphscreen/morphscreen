// Where pictures may load from. An answer's image URLs are the model's:
// loading one tells its host who is reading, and a URL can carry what the
// screen holds out to anyone. So only the app's own hosts load (with a photo
// key for the API, its provider's too); any other image shows its
// description in a tile, an avatar its initials.

package com.morphscreen.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.morphscreen.core.Span

/** Where images may load from: [hosts] ("cdn.example.com", "images.pexels.com"). */
data class MediaPolicy(val hosts: List<String> = emptyList()) {
    private fun hostOf(u: String): String? {
        val m = Regex("^([a-zA-Z][a-zA-Z0-9+.-]*)://([^/?#]+)").find(u) ?: return null
        return m.groupValues[2].substringAfterLast('@').lowercase()
    }

    /** The URL to load for [src], if it may load: https (http on this machine) from an allowed host. */
    fun url(src: String): String? {
        val scheme = src.substringBefore("://", "").lowercase()
        val host = hostOf(src) ?: return null
        val name = host.substringBefore(':')
        val local = name == "localhost" || name == "127.0.0.1" || name == "[::1]"
        if (scheme != "https" && !(scheme == "http" && local)) return null
        if (host !in hosts.map { (hostOf(it) ?: it).lowercase() }) return null
        return src
    }
}

internal val LocalMedia = staticCompositionLocalOf { MediaPolicy() }

/** Fetches and decodes an image (the platform's HTTP and decoder), or null. */
internal expect suspend fun fetchImage(url: String): ImageBitmap?

/** The last few photos decoded, so scrolling back doesn't fetch again. */
private object Decoded {
    private val map = LinkedHashMap<String, ImageBitmap>(16, 0.75f, true)
    fun get(url: String) = map[url]
    fun put(url: String, b: ImageBitmap) {
        map[url] = b
        while (map.size > 32) map.remove(map.keys.first())
    }
}

/** The SDK's own loader, for URLs the policy allows: the photo, cropped to its frame. */
internal val MediaImageLoader: ImageContent = { url, alt, m ->
    var bitmap by remember(url) { mutableStateOf(Decoded.get(url)) }
    var failed by remember(url) { mutableStateOf(false) }
    LaunchedEffect(url) {
        if (bitmap == null) {
            val b = fetchImage(url)
            if (b != null) Decoded.put(url, b) else failed = true
            bitmap = b
        }
    }
    val b = bitmap
    when {
        b != null -> Image(b, alt, m, contentScale = ContentScale.Crop)
        failed -> ImagePlaceholder(alt, m)
        else -> Box(m.background(colors.tile))
    }
}

/** [loader] for what the policy allows; a tile with the description for anything else. */
internal fun guarded(loader: ImageContent, media: MediaPolicy): ImageContent = { src, alt, m ->
    val url = media.url(src)
    if (url == null) ImagePlaceholder(alt, m) else loader(url, alt, m)
}

/** A photo filling a frame of [aspect], with its credit under it. */
@Composable
internal fun Photo(src: String, alt: String, credit: List<Span> = emptyList(), aspect: Float = 1.5f) {
    val media = LocalMedia.current
    val sized = media.url(src)
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.s1)) {
        LocalImage.current(sized ?: src, alt, Modifier.fillMaxWidth().aspectRatio(aspect).clip(RoundedCornerShape(Radius)).semantics { contentDescription = alt })
        if (sized != null && credit.isNotEmpty()) Txt(inlineText(credit), Type.caption.copy(color = colors.ink3))
    }
}

/** An icon from the core: its path (Phosphor's 256-unit grid) filled in [color] at [size]. */
@Composable
internal fun IconView(path: String, size: Dp, color: Color) {
    val p = remember(path) { PathParser().parsePathString(path).toPath() }
    Canvas(Modifier.size(size).clearAndSetSemantics {}) {
        scale(this.size.minDimension / 256f, pivot = Offset.Zero) { drawPath(p, color) }
    }
}
