// Forms: every field writes its value, typed as spec/format.md says, into the
// form it's in; a Button inside the form submits them. What's typed so far is
// also the form's state {fields: {name: value}} in the answer's component
// store, so an agent can fill a form in.

package com.morphscreen.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.morphscreen.core.ComponentStore
import com.morphscreen.core.get
import com.morphscreen.core.stateOf
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import com.morphscreen.core.UINode

/** The values of one form's fields, by key. */
class FormState internal constructor(val node: UINode, private val store: ComponentStore? = null) {
    val values = mutableStateMapOf<String, FieldValue>()

    init {
        load(store?.get(node.id))
    }

    /** The reader typed: kept, and reported as the form's state. */
    fun set(key: String, v: FieldValue) {
        if (values[key] == v) return
        values[key] = v
        store?.set(node.id, stateOf("fields" to JsonObject(values.mapNotNull { (k, x) -> x.state?.let { k to it } }.toMap())))
    }

    /** A field's starting value: kept, not reported. */
    fun seed(key: String, v: FieldValue) {
        if (key !in values) values[key] = v
    }

    /** Fields set from outside (an agent's state). */
    fun load(state: JsonElement?) {
        val fields = state["fields"] as? JsonObject ?: return
        for ((k, v) in fields) fieldValue(v)?.let { if (values[k] != it) values[k] = it }
    }

    fun submit(button: String): Action = Action.Submit(node.id, node.attr("name") ?: "", button, values.toMap())
}

/** A field as state; uploads, places and drawings stay on the device. */
internal val FieldValue.state: JsonElement?
    get() = when (this) {
        is FieldValue.Text -> JsonPrimitive(value)
        is FieldValue.Number -> JsonPrimitive(value)
        is FieldValue.Bool -> JsonPrimitive(value)
        is FieldValue.Items -> JsonArray(values.map { JsonPrimitive(it) })
        else -> null
    }

internal fun fieldValue(v: JsonElement): FieldValue? = when {
    v is JsonArray -> FieldValue.Items(v.mapNotNull { (it as? JsonPrimitive)?.contentOrNull })
    v is JsonPrimitive && v.isString -> FieldValue.Text(v.content)
    v is JsonPrimitive && v.booleanOrNull != null -> FieldValue.Bool(v.booleanOrNull!!)
    v is JsonPrimitive && v.doubleOrNull != null -> FieldValue.Number(v.doubleOrNull!!)
    else -> null
}

internal val LocalForm = staticCompositionLocalOf<FormState?> { null }

/** A field's key in the submitted values: its name, or its label as a slug. */
fun fieldName(node: UINode): String {
    node.attr("name")?.takeIf { it.isNotEmpty() }?.let { return it }
    val label = (node.attr("label") ?: "field").lowercase()
    val out = StringBuilder()
    var dash = false
    for (ch in label) {
        if (ch.code < 128 && ch.isLetterOrDigit()) {
            if (dash && out.isNotEmpty()) out.append('-')
            dash = false
            out.append(ch)
        } else {
            dash = true
        }
    }
    return out.toString()
}

fun options(v: String?): List<String> = (v ?: "").split('|').map { it.trim() }.filter { it.isNotEmpty() }

@Composable
internal fun FormView(node: UINode) {
    val store = LocalComponents.current
    val state = remember(node.id) { FormState(node, store) }
    // State set from outside fills the fields in.
    val outside = store[node.id]
    LaunchedEffect(outside) { state.load(outside) }
    CompositionLocalProvider(LocalForm provides state) { Children(node.children) }
}

/** A label above a control, with an optional hint under it. */
@Composable
internal fun Labeled(label: String, hint: String?, required: Boolean = false, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (label.isNotEmpty()) Txt(label + if (required) " *" else "", Type.footnote.copy(fontWeight = FontWeight.SemiBold))
        content()
        if (!hint.isNullOrEmpty()) Txt(hint, Type.caption.copy(color = colors.ink3))
    }
}

@Composable
internal fun FieldBox(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val c = colors
    val shape = RoundedCornerShape(Radius)
    Box(
        modifier.fillMaxWidth().heightIn(min = 38.dp).background(c.surface, shape).border(1.dp, c.line2, shape).padding(horizontal = 10.dp, vertical = 9.dp),
        contentAlignment = Alignment.CenterStart,
    ) { content() }
}

@Composable
internal fun TextInput(value: String, onChange: (String) -> Unit, placeholder: String, lines: Int = 1, keyboard: KeyboardOptions = KeyboardOptions.Default) {
    val c = colors
    FieldBox {
        BasicTextField(
            value, onChange,
            Modifier.fillMaxWidth(),
            textStyle = Type.body.copy(color = c.ink),
            singleLine = lines == 1,
            minLines = lines,
            keyboardOptions = keyboard,
            cursorBrush = SolidColor(c.ink),
            decorationBox = { inner ->
                if (value.isEmpty() && placeholder.isNotEmpty()) Txt(placeholder, Type.body.copy(color = c.ink3))
                inner()
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun FieldView(node: UINode) {
    val form = LocalForm.current
    val key = fieldName(node)
    val label = node.attr("label") ?: ""
    val hint = node.attr("hint")
    val required = node.flag("required")
    val c = colors
    // A field outside any form keeps its own value.
    var own by remember(node.id) { mutableStateOf<FieldValue?>(null) }
    val value = form?.values?.get(key) ?: own
    fun set(v: FieldValue) {
        if (form != null) form.set(key, v) else own = v
    }
    fun seed(v: FieldValue) {
        if (form != null) form.seed(key, v) else if (own == null) own = v
    }
    val str = (value as? FieldValue.Text)?.value ?: ""
    when (node.type) {
        "Input", "TextArea" -> {
            LaunchedEffect(node.id) { node.attr("value")?.takeIf { it.isNotEmpty() }?.let { seed(FieldValue.Text(it)) } }
            val text = str
            val kind = node.attr("type")
            val keyboard = KeyboardOptions(
                keyboardType = when (kind) {
                    "email" -> KeyboardType.Email
                    "number" -> KeyboardType.Decimal
                    "tel" -> KeyboardType.Phone
                    "url" -> KeyboardType.Uri
                    "password" -> KeyboardType.Password
                    else -> KeyboardType.Text
                },
                capitalization = if (kind == "email" || kind == "url") KeyboardCapitalization.None else KeyboardCapitalization.Sentences,
            )
            Labeled(label, hint, required) {
                TextInput(text, { set(FieldValue.Text(it)) }, node.attr("placeholder") ?: "", if (node.type == "TextArea") node.attr("rows")?.toIntOrNull() ?: 3 else 1, keyboard)
            }
        }
        "Select" -> {
            LaunchedEffect(node.id) { node.attr("value")?.takeIf { it.isNotEmpty() }?.let { seed(FieldValue.Text(it)) } }
            val value = str
            var open by remember { mutableStateOf(false) }
            Labeled(label, hint, required) {
                Box {
                    FieldBox(Modifier.clickable(role = Role.DropdownList) { open = true }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            // The text takes what the arrow leaves, so a long placeholder never squeezes it.
                            Txt(value.ifEmpty { node.attr("placeholder") ?: "Choose" }, Type.body.copy(color = if (value.isEmpty()) c.ink3 else c.ink), Modifier.weight(1f))
                            Txt("▾", Type.footnote.copy(color = c.ink3), Modifier.padding(start = Tokens.s2))
                        }
                    }
                    DropdownMenu(open, { open = false }, containerColor = c.surface) {
                        for (o in options(node.attr("options"))) {
                            DropdownMenuItem(text = { Text(o, style = Type.body.copy(color = c.ink)) }, onClick = { open = false; set(FieldValue.Text(o)) })
                        }
                    }
                }
            }
        }
        "Date" -> {
            LaunchedEffect(node.id) { node.attr("value")?.takeIf { it.isNotEmpty() }?.let { seed(FieldValue.Text(it)) } }
            val value = str
            var picking by remember { mutableStateOf(false) }
            Labeled(label, hint, required) {
                FieldBox(Modifier.clickable(role = Role.Button) { picking = true }) {
                    Txt(value.ifEmpty { "YYYY-MM-DD" }, Type.body.copy(color = if (value.isEmpty()) c.ink3 else c.ink, fontFeatureSettings = "tnum"))
                }
            }
            if (picking) {
                val state = rememberDatePickerState()
                DatePickerDialog(
                    onDismissRequest = { picking = false },
                    confirmButton = {
                        TextButton({
                            state.selectedDateMillis?.let { set(FieldValue.Text(isoDate(it))) }
                            picking = false
                        }) { Text("Done") }
                    },
                ) { DatePicker(state) }
            }
        }
        "Slider" -> {
            val lo = node.attr("min")?.toFloatOrNull() ?: 0f
            val hi = node.attr("max")?.toFloatOrNull() ?: 100f
            val step = node.attr("step")?.toFloatOrNull() ?: 1f
            LaunchedEffect(node.id) { seed(FieldValue.Number((node.attr("value")?.toFloatOrNull() ?: lo).coerceIn(lo, maxOf(lo, hi)).toDouble())) }
            val v = ((value as? FieldValue.Number)?.value?.toFloat() ?: lo).coerceIn(lo, maxOf(lo, hi))
            Labeled(label, hint) {
                if (hi > lo) {
                    val steps = if (step > 0) (((hi - lo) / step).toInt() - 1).coerceIn(0, 200) else 0
                    Slider(
                        v, { set(FieldValue.Number(it.toDouble())) }, valueRange = lo..hi, steps = if ((hi - lo) / step <= 201) steps else 0,
                        colors = SliderDefaults.colors(thumbColor = c.ink, activeTrackColor = c.ink, inactiveTrackColor = c.line2, activeTickColor = c.ink, inactiveTickColor = c.line2),
                    )
                    Row(Modifier.fillMaxWidth()) {
                        Txt(sliderText(lo.toDouble(), node) ?: node.attr("min") ?: "", Type.caption.copy(color = c.ink3))
                        Spacer(Modifier.weight(1f))
                        Txt(sliderText(v.toDouble(), node) ?: num(v), Type.caption.copy(color = c.ink, fontWeight = FontWeight.SemiBold))
                        Spacer(Modifier.weight(1f))
                        Txt(sliderText(hi.toDouble(), node) ?: node.attr("max") ?: "", Type.caption.copy(color = c.ink3))
                    }
                }
            }
        }
        "Checkboxes" -> {
            val opts = options(node.attr("options"))
            LaunchedEffect(node.id) { options(node.attr("value")).takeIf { it.isNotEmpty() }?.let { seed(FieldValue.Items(it)) } }
            val chosen = ((value as? FieldValue.Items)?.values ?: emptyList()).toSet()
            Labeled(label, hint, required) {
                Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                    for (o in opts) {
                        Row(
                            Modifier.clickable(role = Role.Checkbox) {
                                val now = if (o in chosen) chosen - o else chosen + o
                                set(FieldValue.Items(opts.filter { it in now }))
                            },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(9.dp),
                        ) {
                            CheckMark(o in chosen)
                            Txt(o)
                        }
                    }
                }
            }
        }
        "Radio" -> {
            LaunchedEffect(node.id) { node.attr("value")?.takeIf { it.isNotEmpty() }?.let { seed(FieldValue.Text(it)) } }
            val value = str
            Labeled(label, hint, required) {
                Column(verticalArrangement = Arrangement.spacedBy(Tokens.s2)) {
                    for (o in options(node.attr("options"))) {
                        Row(
                            Modifier.clickable(role = Role.RadioButton) { set(FieldValue.Text(o)) },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(9.dp),
                        ) {
                            Box(Modifier.size(16.dp).border(1.5.dp, if (value == o) c.ink else c.ink3, CircleShape), contentAlignment = Alignment.Center) {
                                if (value == o) Box(Modifier.size(8.dp).background(c.ink, CircleShape))
                            }
                            Txt(o)
                        }
                    }
                }
            }
        }
        "Switch" -> {
            LaunchedEffect(node.id) { seed(FieldValue.Bool(node.flag("value"))) }
            val on = (value as? FieldValue.Bool)?.value ?: node.flag("value")
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Txt(label, Type.body, Modifier.weight(1f))
                Switch(on, { set(FieldValue.Bool(it)) }, colors = SwitchDefaults.colors(checkedTrackColor = c.ink, checkedThumbColor = c.surface, uncheckedTrackColor = c.line, uncheckedBorderColor = c.line2, uncheckedThumbColor = c.ink3))
            }
        }
    }
}

private fun num(v: Float): String = if (v == v.toLong().toFloat()) v.toLong().toString() else ((v * 100).toLong() / 100.0).toString()

/** Epoch milliseconds (UTC midnight, as the date picker gives them) as YYYY-MM-DD. */
internal fun isoDate(millis: Long): String {
    // Days to civil date (Howard Hinnant's algorithm), no date library needed.
    val z = millis.floorDiv(86_400_000L) + 719_468
    val era = z.floorDiv(146_097L)
    val doe = z - era * 146_097
    val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    val d = doy - (153 * mp + 2) / 5 + 1
    val m = if (mp < 10) mp + 3 else mp - 9
    val y = yoe + era * 400 + if (m <= 2) 1 else 0
    return "$y-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}"
}

/** An outlined button for the device fields. */
@Composable
internal fun SecondaryButton(label: String, onClick: () -> Unit) {
    val c = colors
    val shape = RoundedCornerShape(Radius)
    Box(
        Modifier.clip(shape).border(1.dp, c.line2, shape).clickable(role = Role.Button, onClick = onClick).heightIn(min = 30.dp).padding(horizontal = 10.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) { Txt(label, Type.footnote.copy(fontWeight = FontWeight.SemiBold)) }
}
