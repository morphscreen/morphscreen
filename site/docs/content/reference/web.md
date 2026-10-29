---
title: "@morphscreen/web"
description: The web SDK's functions and types: loadCore, createAnswer and its options, the Answer it returns, the Core and its sessions, and the actions.
---

```ts
import { createAnswer, connectAgent, loadCore } from "@morphscreen/web";
import "@morphscreen/web/morphscreen.css";
```

## loadCore

```ts
loadCore(src: string | URL | ArrayBuffer | Uint8Array | Response): Promise<Core>
```

Loads the core from `morphscreen.wasm`, or `morphscreen-agent.wasm` for `connectAgent`, and starts the answer faces loading alongside. Load it once and share it.

## createAnswer

```ts
createAnswer(el: HTMLElement, options: AnswerOptions): Answer
```

Draws an answer into `el`, which gets the class `ms-answer`.

| Option | Type | What it does |
|---|---|---|
| `core` | `Core` | from `loadCore` |
| `packs` | `string[]` | packs beyond core; every one when left out, `[]` for core alone |
| `custom` | `Pack[]` | your own packs |
| `components` | `Record<string, Mount>` | how to draw your own components: `(el, { attrs, html, text }) => cleanup?` |
| `onAction` | `(action: Action) => void` | the reader asked, submitted, finished a quiz, voted or changed state |
| `onComponentState` | `(node, state) => void` | an interactive component's state changed because the reader acted |
| `imageHosts` | `string[]` | hosts pictures may load from; any other shows its description |
| `maps` | `MapTiles` | your map provider and key |
| `maplibre` | module, or a function that loads it | MapLibre GL 6.16 or later, for live maps |
| `onOps` | `(ops: Op[]) => void` | every op, for logging or a renderer of your own |

## Answer

| Method | What it does |
|---|---|
| `push(text)` | the next piece of the model's text |
| `end(truncated?)` | the answer is over; `true` if it hit the token limit |
| `html()` | the finished answer as HTML, what a server would send |
| `applyState(states)` | sets interactive components' state, by node id |
| `destroy()` | stops it and empties its element, so a new answer can draw there |

## Action

```ts
type Action =
  | { type: "ask"; text: string; node: string }
  | { type: "submit"; node: string; form: string; button: string; fields: Record<string, FieldValue> }
  | { type: "quiz"; node: string; score: number; total: number; answers: { question: string; choice: string; right: boolean | null }[] }
  | { type: "vote"; node: string; name: string; choice: string }
  | { type: "state"; node: string; name: string; value: unknown };

type FieldValue = string | number | boolean | string[] | File[] | { lat: number; lng: number; accuracy: number };
```

[Actions and state](/docs/format/actions) says when each is sent.

## Core

| Method | What it does |
|---|---|
| `prompt(packs?, custom?)` | the system prompt for that catalog |
| `session(packs?, custom?)` | a `Session` that reads one answer |
| `actionMessage(action)` | the user message an action starts, worded as the API words it; in both builds of the core |

## Session

For reading an answer yourself, without drawing it:

| Method | What it does |
|---|---|
| `push(text)` | feeds the next piece; returns the ops it produced |
| `finish(truncated?)` | the answer is over; returns the last ops |
| `html()`, `tree()` | the answer as HTML, or as its tree |
| `verdict()` | the core's verdict: valid, truncated, the component count and the diagnostics |
| `allowImages(hosts)` | where the HTML's pictures may load from |

## Other exports

- `connectAgent(el, options)`: a conversation with an AG-UI agent ([its reference](/docs/reference/agent)).
- `allowedImage(src, { imageHosts })`: whether a picture's address may load.
- `enhanceCharts(root)`: makes the charts under `root` respond (tooltips, legend items that switch a series off), for HTML from the server; returns a function that undoes it.

The package also has `@morphscreen/web/react` ([React](/docs/reference/react)) and `@morphscreen/web/theme` ([theme](/docs/reference/theme)).
