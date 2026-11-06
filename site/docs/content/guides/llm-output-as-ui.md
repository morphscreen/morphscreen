---
title: Rendering LLM output as UI
description: Five ways to turn a model's answer into an interface (Markdown, tool calls, JSON specs, a UI language, generated HTML), what each costs in tokens, streaming and safety, and how to choose.
---

A model writes text. Showing that text as something the reader can use, a chart, a form, a table they can sort, means choosing what the model writes and who turns it into UI. There are five common ways to do it. They differ in how well they stream, how much the model has to learn, and what can go wrong.

## 1. Markdown

The model writes Markdown and the page draws headings, lists, tables and code.

```markdown
| Plan | Calls a month | Price |
|---|---|---|
| Free | 3,000 | $0 |
```

Every model writes it well and it streams line by line. But it stops at text: no chart, no button, no form, nothing the reader can do except read.

## 2. Tool calls into your components

You define a tool per component (`show_weather`, `pick_flight`), the model calls one with JSON arguments, and your code renders the matching component. The Vercel AI SDK, CopilotKit's controlled pattern and Tambo work this way.

```json
{ "name": "show_weather", "arguments": { "city": "Lisbon", "days": 3 } }
```

You keep full control of the look, and the arguments are checked against a schema. The cost is that the layout is yours, not the model's: one tool call draws one component, a new kind of UI means a new component and a new tool, and an answer that mixes a chart, a table and a form needs your code to arrange them.

## 3. A JSON description of the UI

The model writes a tree of components as JSON, from a catalog the app registers, and a renderer draws it. A2UI and Open-JSON-UI work this way.

```json
{ "type": "Column", "children": [{ "type": "Stat", "label": "Budget", "value": "$330" }, { "type": "Chart", "kind": "bar", "data": [] }] }
```

The model composes the layout, the catalog keeps it to components you trust, and the same JSON can be drawn on any platform with a renderer. JSON costs more tokens than the same UI in a compact format, and half of a JSON document isn't valid JSON, so streaming needs a parser that repairs partial input or a format of small messages.

## 4. A UI language

The model writes a compact format made for UI, and a parser turns each piece into components as it arrives. OpenUI (OpenUI Lang) and MorphScreen (Markdown with a few tags) work this way.

```markdown
<Columns>
<Stat label="Budget" value="$330" />
<Stat label="Per day" value="$165" />
</Columns>
```

It streams well and costs few tokens, and the model composes the layout. The model has to learn the format from the system prompt, so the format's size and how close it is to what models already write decide how often they get it wrong. MorphScreen builds on Markdown for that reason: the tags are the only new part.

## 5. Generated HTML in a sandbox

The model, or a tool's server, writes HTML, and the page shows it in a sandboxed frame. MCP Apps and CopilotKit's open-ended pattern work this way.

Anything a browser can draw is possible. In exchange the code runs in a frame you have to lock down, the look rarely matches your app, and accessibility and the reader's data inside the frame are whatever the generated code makes them.

## How to choose

| Approach | Model composes the layout | Streams piece by piece | New UI without new code | Tokens |
|---|---|---|---|---|
| Markdown | text only | yes | text only | few |
| Tool calls | no | arguments are partial JSON | no | few per call |
| JSON description | yes | needs a partial parser | within the catalog | more |
| UI language | yes | yes | within the catalog | few |
| Generated HTML | yes | the frame loads when it's done | yes | many, when the model writes it |

Whichever you pick, check these:

- **What reaches the page is checked.** The model makes mistakes: a component that doesn't exist, an attribute it invented, a value outside its list. Something has to read the answer against what your app allows before the reader sees it, and decide what to do with what fails.
- **Broken output gets fixed, not shown.** A rejected answer is a blank screen. Asking the model to rewrite only the broken parts keeps the rest of what streamed.
- **Nothing the model writes runs.** No scripts, no inline styles, no `javascript:` addresses, pictures only from hosts you allow.
- **It streams.** A reader who sees the first card in under a second waits for the rest; one who sees a spinner for eight seconds leaves.
- **The prompt is small.** The format's prompt goes with every call, so its size is a cost on every answer.
- **It's accessible.** Charts with text alternatives, forms with labels, focus that works with a keyboard.

MorphScreen is approach 4, with every line checked as it streams, broken lines repaired by the same model, and nothing the model writes run ([Validation and repair](/docs/format/validation), [Security](/docs/production/security)). [Generative UI SDKs compared](/docs/comparison) puts the libraries side by side.
