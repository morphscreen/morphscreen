---
title: connectAgent
description: A whole conversation with an AG-UI agent, drawn as it streams, with the reader's actions sent back and the state shared.
---

```ts
connectAgent(el: HTMLElement, options: AgentOptions): Conversation
```

It needs the core from `morphscreen-agent.wasm`. Every option of [`createAnswer`](/docs/reference/web#createanswer) applies to each answer, except `onOps`.

## AgentOptions

| Option | Type | What it does |
|---|---|---|
| `url` | `string` | the agent's endpoint: a run's input is POSTed, its events read back |
| `headers` | object, or a function returning one | request headers, like your own auth, for each run |
| `threadId` | `string` | the conversation's id; a new one when left out |
| `tools`, `context`, `forwardedProps` | | sent with every run, as AG-UI defines them |
| `onToolCall` | `(call) => result` | answers a tool of yours the agent called; the conversation then goes on |
| `onUpdate` | `(update) => void` | every update from the core: steps, custom events, warnings |
| `onState` | `(state) => void` | the shared state changed, by the agent or the reader |
| `sendActions` | `boolean` | send the reader's actions on as user messages (default `true`) |

## Conversation

| Member | What it does |
|---|---|
| `send(content, id?)` | the reader says something (text, or AG-UI content parts); runs the agent |
| `run()` | runs the agent on the conversation as it is |
| `stop()` | stops the run in progress, which ends as truncated |
| `messages()`, `state()` | what to save |
| `load(messages, state?)` | starts from a saved conversation |
| `setState(state)` | sets the shared state |
| `threadId`, `running` | the conversation's id, and whether a run is going |
| `destroy()` | stops and clears it |

[AG-UI agents](/docs/agents/ag-ui) has the guide.
