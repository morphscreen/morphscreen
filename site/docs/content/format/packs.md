---
title: Components and packs
description: The 75 components come in a core that every answer has and eight packs an app can choose. Fewer packs, shorter prompt.
---

The components come in packs. `core` is always there: layout, text blocks, numbers, charts, forms and buttons. Eight more packs add data, commerce, the device, docs, inputs, interaction, media and scheduling.

| Pack | What it adds |
|---|---|
| [Core](/docs/components/core) | Cards, columns, tabs, steps, callouts, stats, badges, progress, charts, forms, buttons, follow-up questions |
| [Data](/docs/components/data) | Key-value facts, timelines, gauges, heatmaps, funnels, sparklines, trees |
| [Commerce](/docs/components/commerce) | Products, plans, carts, ratings, comparisons, prices |
| [Device](/docs/components/device) | Maps, camera, barcode scanning, location, files, contacts, calendar, sharing, voice notes, QR codes |
| [Docs](/docs/components/docs) | Code with a file name, diffs, formulas, file trees, citations |
| [Inputs](/docs/components/inputs) | Star ratings, searchable choices, times, toggle groups, steppers, signatures |
| [Interactive](/docs/components/interactive) | Quizzes, flashcards, polls, checklists, what-if sliders |
| [Media](/docs/components/media) | Video, audio, embeds, carousels |
| [Scheduling](/docs/components/scheduling) | Calendars, events, time slots, agendas, countdowns |

## Choosing packs

Every pack is on unless you name the ones you want. The model is told about only the components it may use, and the core checks the answer against the same list.

```js title="On your server, for /v1/chat/completions"
{ "model": "deepseek/deepseek-v4.1-flash", "messages": [...], "morphscreen": { "packs": ["data", "interactive"] } }
```

```js title="On your server, for /v1/ui"
run.forwardedProps = { ...run.forwardedProps, model: MODEL, packs: ["data", "interactive"] };
```

```js title="In the page"
createAnswer(el, { core, packs: ["data", "interactive"] });
```

Give the page the same packs as the API, so the page can read everything the model was allowed to write. `[]` is the core alone.

## Prompt length

| Packs | System prompt |
|---|---|
| Core alone | {{prompt:core}} tokens |
| Every pack | {{prompt:all}} tokens |

Each component a pack adds costs about {{prompt:per}} tokens. A shorter prompt costs less on every call and leaves the model fewer ways to go wrong; the benchmark measured both ([the benchmark](/benchmark)).

## Names models use on their own

Models sometimes write `<Table>`, `<Column>` or `<Buttons>` without being told. The core reads them as the component they mean and notes it, rather than failing the answer.
