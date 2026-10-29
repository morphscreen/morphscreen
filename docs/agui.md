# Talking to an agent (AG-UI)

The SDKs can hold a whole conversation with any agent that speaks
[AG-UI](https://github.com/ag-ui-protocol/ag-ui) 1.0 over HTTP and
Server-Sent Events: LangGraph, Mastra, CrewAI, Pydantic AI, the Vercel AI SDK
and the rest of the frameworks with an AG-UI adapter. The agent answers in
MorphScreen (it uses the system prompt from `mscore prompt` or the API), and
each answer is drawn as it streams.

The protocol itself lives in the core (`rust/core/src/agui.rs`), so the web,
SwiftUI and Compose read a stream the same way. Each response's bytes go in,
and what to draw comes out.

## Web

```js
import { connectAgent, loadCore } from "@morphscreen/web";

// morphscreen-agent.wasm from the package, served with the app
const core = await loadCore("/assets/morphscreen-agent.wasm");
const chat = connectAgent(document.querySelector("#chat"), {
  core,
  url: "/agent",
  packs: ["interactive"],
  headers: () => ({ Authorization: `Bearer ${token}` }),
});
await chat.send("Quiz me on photosynthesis");
```

The AG-UI client adds 36 KB brotli to the core, so it ships as its own build:
`morphscreen-agent.wasm` (238 KB) instead of `morphscreen.wasm` (202 KB).
Pages that only show answers keep the smaller one.

`chat.load(messages, state)` restores a saved conversation, and
`chat.messages()` / `chat.state()` are what to save. `sdk/web/example/agent.html`
is a complete chat page that keeps the conversation in the browser.

## SwiftUI

```swift
let chat = AgentConversation(url: agentURL, packs: ["interactive"])
chat.headers = ["Authorization": "Bearer \(token)"]

ScrollView { AgentView(chat).padding() }
Task { await chat.send("Quiz me on photosynthesis") }
```

## Compose

```kotlin
val scope = rememberCoroutineScope()
val chat = remember { AgentConversation(HttpTransport(agentUrl), scope, packs = listOf("interactive")) }

LazyColumn { item { AgentView(chat) } }
scope.launch { chat.send("Quiz me on photosynthesis") }
```

`HttpTransport` works on Android and the desktop JVM. Anything else that
carries the bytes (a WebSocket, a test) can implement `AgentTransport`.

## What goes back to the agent

When the reader acts in an answer, it goes back two ways.

A Button, a follow-up, a submitted form, a finished quiz or a vote becomes
the next user message, worded by the core the same way on every platform:

```text
I finished the quiz: 1 of 2 right.
1. What absorbs light in a leaf? I answered "B. Chlorophyll" (right).
2. Which gas do plants take in? I answered "Oxygen" (wrong).
```

Photos and files from a form go along as AG-UI content parts.

Everything else the reader does is state: ticks, known cards, slider
positions, a vote, quiz answers, what's typed in a form. It lives in the
shared state under `morphscreen`, by message id and node id, and goes to the
agent with the next run:

```json
{
  "morphscreen": {
    "msg-1": {
      "1.2": { "answers": [1, 0] },
      "1.3": { "known": [0, 2] },
      "1.4": { "vote": "Transpiration" },
      "1.5": { "done": [0, 1] },
      "1.6": { "values": { "price": 20, "qty": 5 } },
      "1.7": { "fields": { "name": "Ana", "meal": "Fish", "guest": true } }
    }
  }
}
```

| Component | State |
|---|---|
| Quiz | `answers`: the chosen choice's index per question, `null` until answered |
| Flashcards | `known`: indices of the cards marked known |
| Poll | `vote`: the option, or `null` |
| Checklist | `done`: indices of the ticked items |
| WhatIf | `values`: each slider by its name |
| Form | `fields`: each field by its name (uploads and locations stay on the device) |

It works the other way too. An agent that sends a `STATE_SNAPSHOT` or a
`STATE_DELTA` touching these keys sets the components: a box ticks, a form
fills in, a quiz shows its answers. Setting state never sends a message,
because the reader didn't act. The rest of the shared state is the agent's
own and is kept as it is.

## How strictly a stream is read

The client follows AG-UI 1.0's processing model. Each event is checked
against the protocol's schema (`spec/agui/schema.json`): anything the schema
doesn't describe is removed with a warning, and a value it does describe but
gets wrong stops the stream. Chunks are expanded, and runs, messages, tool
calls, steps, reasoning and subagents must open and close in order. Retired
shapes from older producers (THINKING events, `binary` parts, nulls for
absent fields) are translated first.

The protocol's own conformance streams (`test/agui/streams`, 68 of them) run
in `cargo test`. 65 pass. The other 3 test downgrade shims for peers older
than 1.0, which this client doesn't have, because it speaks 1.0 to everyone.
One stream pins a known gap in the TypeScript client (an unknown message role
is fatal there). This client does what the spec says and removes the role.

A stream that breaks the rules stops with `rejected`. A run the agent says
failed (`RUN_ERROR`) is shown as failed. A response that ends mid-run is
`truncated`, and the answer it was writing is finished as cut off. Each
platform shows these as a short note under the conversation.

## The example agent

`examples/langgraph/agent.py` is a LangGraph graph served with the
protocol's own LangGraph adapter (`ag-ui-langgraph`). The same server hands
out the example chat page:

```sh
uv venv --python 3.12 ~/.cache/morphscreen-agent/venv
VIRTUAL_ENV=~/.cache/morphscreen-agent/venv uv pip install -r examples/langgraph/requirements.txt
~/.cache/morphscreen-agent/venv/bin/python examples/langgraph/agent.py
# http://127.0.0.1:8123/example/agent.html
```

It uses a free model on OpenRouter by default (`MORPHSCREEN_AGENT_MODEL`
picks another). `MORPHSCREEN_AGENT_MODEL=script` swaps in a scripted model
that needs no network, which the checks use:

- `node examples/langgraph/check.mjs`: the web SDK against the running
  agent. It sends a message, ticks a box, answers the quiz, and checks the
  tick comes back in LangGraph's state, then reloads.
- `AGENT_URL=http://127.0.0.1:8123/agent swift test --filter AgentTests` and
  the same variable for `./gradlew :ui:jvmTest`: SwiftUI and Compose against
  it.
- `test/agui/langgraph/` holds two recorded runs that the Swift and Kotlin
  tests replay without a server.

## The server side

`morphscreen_core::agui::emit` writes the events for an answer as a model
streams it. That covers the run, the message, and the state, sent whole the
first time and as changes after that (a JSON Patch the core works out).

```sh
mscore agui answer.md            # a saved answer as an AG-UI stream
mscore agui-read response.sse    # a recorded stream, read by the client: its updates
```

The API (roadmap G1) will stream with the same functions.
