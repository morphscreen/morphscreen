// Every component sample (test/fixtures/components.json) drawn by the Compose
// SDK, one PNG each, for bench/look/run.mjs to put beside the web and SwiftUI
// (roadmap M3: the same look on every platform).
//   cd sdk/android && ./gradlew :bench:look --args="<components.json> <outdir> <width> [light|dark|mono] [id,id...]"

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.morphscreen.core.Answer
import com.morphscreen.ui.AnswerView
import com.morphscreen.ui.morphColors
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.jetbrains.skia.EncodedImageFormat
import java.io.File

@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
fun main(args: Array<String>) {
    val json = Json.parseToJsonElement(File(args[0]).readText()).jsonObject
    val out = File(args[1]).apply { mkdirs() }
    val width = args.getOrElse(2) { "760" }.toInt()
    val theme = args.getOrElse(3) { "light" }
    val only = args.getOrNull(4)?.split(",")?.toSet()
    val packs = json["packs"]!!.jsonArray.map { it.jsonPrimitive.content }.filter { it != "core" }
    val pad = if (width < 520) 16 else 24
    for (s in json["samples"]!!.jsonArray.map { it.jsonObject }) {
        val id = s["id"]!!.jsonPrimitive.content
        if (only != null && id !in only) continue
        val answer = Answer(packs)
        answer.push(s["md"]!!.jsonPrimitive.content)
        answer.finish()
        val content = @androidx.compose.runtime.Composable {
            val colors = morphColors(dark = theme == "dark", mono = theme == "mono")
            Box(Modifier.width(width.dp).background(colors.page).padding(horizontal = pad.dp, vertical = 12.dp)) { AnswerView(answer, colors = colors) }
        }
        val probe = ImageComposeScene(width * 2, 12000, Density(2f), content = content)
        probe.render(0)
        probe.render(600_000_000)
        val h = probe.calculateContentSize().height.coerceIn(80, 12000)
        probe.close()
        val scene = ImageComposeScene(width * 2, h, Density(2f), content = content)
        scene.render(0)
        scene.render(600_000_000).encodeToData(EncodedImageFormat.PNG)?.bytes?.let { out.resolve("$id.png").writeBytes(it) }
        scene.close()
        answer.close()
        println("SHOT $id")
    }
}
