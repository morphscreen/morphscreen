---
title: AG-UI agents
description: Hold a whole conversation with any agent that speaks AG-UI 1.0, with answers drawn as they stream, actions sent back and the reader's state shared with the agent.
---

`connectAgent` holds a conversation with an agent that speaks [AG-UI](https://github.com/ag-ui-protocol/ag-ui) 1.0 over HTTP and server-sent events: `/v1/ui`, or your own agent on LangGraph, Mastra, CrewAI, Pydantic AI, the Vercel AI SDK or anything else with an AG-UI adapter. The protocol is read by the core, so a stream is read the same way everywhere.

```ts title="main.ts"
import { connectAgent, loadCore } from "@morphscreen/web";
import "@morphscreen/web/morphscreen.css";

// morphscreen-agent.wasm from the package, served with your page
const core = await loadCore("/morphscreen-agent.wasm");
const chat = connectAgent(document.querySelector<HTMLElement>("#chat")!, {
  core,
  url: "/api/agent",
  packs: ["interactive"],
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
});

await chat.send("Quiz me on photosynthesis");
```

The AG-UI client adds about 34 KB to the core compressed (111 KB raw), so it's a build of its own: `morphscreen-agent.wasm` instead of `morphscreen.wasm`. Pages that only show answers keep the smaller one ([which core](/docs/integrations#which-core)).

## Your agent answers in our format

An agent of your own needs MorphScreen's system prompt for the components the page will draw: `core.prompt(packs)` in Node or the browser, or `POST /v1/prompt` from any server ([The system prompt](/docs/format/system-prompt)). Give the page the same `packs`.

## Saving the conversation

`chat.messages()` and `chat.state()` are what to save; `chat.load(messages, state)` starts from them again. `chat.stop()` stops a run part way.

## What goes back to the agent

A button, a follow-up, a submitted form, a finished quiz or a vote becomes the next user message, worded the same way on every platform. Photos and files from a form go along as AG-UI content parts.

Everything else the reader does is state: ticks, known cards, slider positions, a vote, quiz answers, what's typed in a form. It lives in the shared state under `morphscreen`, by message id and node id, and goes to the agent with the next run:

```json
{
  "morphscreen": {
    "msg-1": {
      "1.2": { "answers": [1, 0] },
      "1.5": { "done": [0, 1] },
      "1.7": { "fields": { "name": "Ana", "meal": "Fish", "guest": true } }
    }
  }
}
```

It works the other way too. An agent that sends a `STATE_SNAPSHOT` or `STATE_DELTA` touching these keys sets the components: a box ticks, a form fills in. Setting state never sends a message, because the reader didn't act. The rest of the shared state is your agent's own and is kept as it is.

## How strictly a stream is read

Each event is checked against the protocol's schema. A field the schema doesn't describe is removed with a warning; a value it describes but gets wrong stops the stream. Runs, messages, tool calls, steps and reasoning must open and close in order. Older shapes from producers before 1.0 are translated first. The protocol's own conformance streams run in our tests.

A stream that breaks the rules stops as `rejected`. A run the agent says failed (`RUN_ERROR`) is shown as failed. A response that ends mid-run is `truncated`, and the answer it was writing is finished as cut off. Each shows as a short note under the conversation.
