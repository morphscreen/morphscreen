// Streams each answer in 32-character chunks into AnswerView in an offscreen
// Compose scene (1520 x 2400 px at 2x), rendering after every chunk, twice:
// the first pass is cold, the second warm. Writes results-<raw dir>.json
// and a full-height screenshot of each finished answer.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.morphscreen.core.Answer
import com.morphscreen.ui.AnswerView
import com.morphscreen.ui.MorphColors
import org.jetbrains.skia.EncodedImageFormat
import java.io.File
import java.util.Locale

private const val WIDTH_DP = 760
private val density = Density(2f)

/** 32 code points at a time, so a chunk never ends inside an emoji. */
fun chunks(s: String, n: Int = 32): List<String> {
    val out = ArrayList<String>()
    var i = 0
    while (i < s.length) {
        var j = s.offsetByCodePoints(i, minOf(n, s.codePointCount(i, s.length)))
        out += s.substring(i, j)
        i = j
    }
    return out
}

private fun content(answer: Answer): @androidx.compose.runtime.Composable () -> Unit = {
    Box(Modifier.width(WIDTH_DP.dp).background(MorphColors.Light.page).padding(24.dp)) { AnswerView(answer, colors = MorphColors.Light) }
}

class Run(val ms: Double, val answer: Answer, val scene: ImageComposeScene)

fun stream(text: String): Run {
    val answer = Answer(listOf("data", "commerce", "scheduling", "media", "docs", "inputs", "device"))
    val scene = ImageComposeScene(WIDTH_DP * 2, 2400, density, content = content(answer))
    var ms = 0.0
    var t = 0L
    for (c in chunks(text)) {
        val t0 = System.nanoTime()
        answer.push(c)
        scene.render(t)
        ms += (System.nanoTime() - t0) / 1e6
        t += 16_000_000
    }
    val t0 = System.nanoTime()
    answer.finish()
    scene.render(t)
    ms += (System.nanoTime() - t0) / 1e6
    return Run(ms, answer, scene)
}

fun heapMB(): Double {
    repeat(3) { System.gc(); Thread.sleep(30) }
    val r = Runtime.getRuntime()
    return (r.totalMemory() - r.freeMemory()) / 1048576.0
}

@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
fun main(args: Array<String>) {
    val raw = File(args.getOrElse(0) { "../raw/nemotron-v03" })
    val out = File(args.getOrElse(1) { "out" }).apply { mkdirs() }
    val only = args.getOrElse(2) { "" }
    val files = raw.listFiles { f -> f.name.startsWith("ours__") && f.name.endsWith(".txt") }!!.sortedBy { it.name }.filter { it.name.removePrefix("ours__").startsWith(only) }
    // JIT and Compose warm up on the first answer before anything counts.
    stream(files.first().readText()).scene.close()
    val rows = ArrayList<String>()
    var total = 0.0
    for (f in files) {
        val brief = f.name.removePrefix("ours__").removeSuffix(".txt")
        val text = f.readText()
        val before = heapMB()
        val cold = stream(text)
        cold.scene.close()
        val warm = stream(text)
        val held = heapMB() - before
        val size = warm.scene.calculateContentSize()
        warm.scene.close()
        // The finished answer at its full height.
        val h = minOf(size.height.coerceAtLeast(200), 24000)
        ImageComposeScene(WIDTH_DP * 2, h, density, content = content(warm.answer)).use { s ->
            s.render(0).encodeToData(EncodedImageFormat.PNG)?.bytes?.let { out.resolve("$brief-ours.png").writeBytes(it) }
        }
        warm.answer.close()
        cold.answer.close()
        total += warm.ms
        val chunkCount = chunks(text).size
        rows += String.format(Locale.ROOT, "{\"brief\":\"%s\",\"chunks\":%d,\"cold\":%.2f,\"warm\":%.2f,\"heldMB\":%.1f,\"height\":%d}", brief, chunkCount, cold.ms, warm.ms, held, size.height)
        println(String.format(Locale.ROOT, "%-22s %4d chunks  cold %7.1f ms  warm %7.1f ms  %5.1f MB", brief, chunkCount, cold.ms, warm.ms, held))
    }
    println(String.format(Locale.ROOT, "total warm: %.0f ms over %d answers", total, rows.size))
    val machine = System.getProperty("os.name") + " " + System.getProperty("os.arch") + ", JDK " + System.getProperty("java.version")
    File("results-${raw.name}.json").writeText("{\"machine\":\"$machine, desktop Compose 1.12 (Skia), 1520 x 2400 px, 32-character chunks, render after every chunk\",\"warmMs\":${String.format(Locale.ROOT, "%.1f", total)},\"rows\":[\n" + rows.joinToString(",\n") + "]}\n")
}

private inline fun <T> ImageComposeScene.use(f: (ImageComposeScene) -> T): T = try { f(this) } finally { close() }
