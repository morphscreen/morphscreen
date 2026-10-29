# MorphScreen for Compose

MorphScreen's core as a native library under Jetpack Compose and Compose
Multiplatform: an answer is read and checked as the model streams it, and
drawn with native composables. The format is in spec/format.md.

Two modules: `core` (the Rust core through JNI: the session, the op stream,
the AG-UI client) and `ui` (the composables). Android 7.0+ (API 24) and the
desktop JVM.

## Build the core

```sh
bash sdk/android/build-core.sh   # the host library for JVM tests; Android's .so files too when the NDK is installed
```

The modules aren't published yet: Android comes after the web launch.
Until then, include `sdk/android` in your Gradle build.

## Draw an answer

```kotlin
import com.morphscreen.core.Answer
import com.morphscreen.ui.Action
import com.morphscreen.ui.AnswerView
import com.morphscreen.ui.MediaPolicy

val answer = Answer()                 // every pack; Answer(packs = emptyList()) for the core alone

@Composable
fun ChatAnswer() {
    AnswerView(
        answer,
        media = MediaPolicy(hosts = listOf("cdn.example.com")),
        onAction = { action ->
            // Action.Ask, Submit, Quiz, Vote, State: the app decides what happens
        },
    )
}

// as the model's text arrives
answer.push(chunk)
answer.finish()
```

Your own components go in as `components = mapOf("ProductCard" to ...)`
with their packs as `Answer(custom = ...)` (docs/custom-components.md); your
look as `theme = MorphTheme.fromDtcg(tokens)` (docs/theme.md).

## A conversation with an agent

```kotlin
val chat = AgentConversation(HttpTransport("https://example.com/agent"), scope)
AgentView(chat)
scope.launch { chat.send("Plan a weekend in Lisbon") }
```

Any agent that speaks AG-UI 1.0; docs/agui.md has the rest.

## What it loads and sends

Pictures come only from your hosts (`MediaPolicy(hosts = ...)`). On Android, maps
are MapLibre with tiles from your own provider (`maps`), and a place given only by
its address is found with the system's geocoder (on most phones Google's).
Video, audio and embeds open when the reader taps them. The SDK sends
nothing of its own anywhere and never runs model text. docs/security.md
has the detail.

## Tests

```sh
bash sdk/android/build-core.sh && cd sdk/android && ./gradlew :core:jvmTest :ui:jvmTest
```
