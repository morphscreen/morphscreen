---
title: MorphScreen vs others
description: How MorphScreen differs from OpenUI, Thesys C1, A2UI and the Vercel AI SDK's generative UI, and where the measured numbers are.
---

Generative UI libraries share a goal: a model's answer that the reader can use, not just read. They differ in what the model writes, who checks it, and what happens when it's wrong.

## What MorphScreen does differently

- **The model writes Markdown with a few tags.** Models already write both, so the format needs a short prompt ({{prompt:core}} tokens with the core components, {{prompt:all}} with every pack), and half an answer is always a valid start of the whole one. Nothing waits for a closing bracket or a root statement.
- **Every line is checked as it streams.** The core reads each line against the components your app allows, so what reaches your page is already validated, and a mistake is tied to the line it's on.
- **Only broken lines are repaired.** When a line breaks a rule, the API asks the same model to rewrite that line, not the whole answer.
- **Any model.** The model included in every plan, or any model on OpenRouter with your own key.
- **Nothing a model wrote ever runs.** No script, no style, no address you didn't allow (see [Security](/docs/production/security)).

## Against OpenUI, measured

We measure ourselves against OpenUI on the benchmark thesysdev publishes for it: the same 46 briefs, the same models and the same rules for what counts as valid. The [benchmark page](/benchmark) has the method, every raw answer and the rows where OpenUI is ahead with why; [every row](/compare/openui) is on its own page.

## The others

| Library | What the model writes | Measured against MorphScreen |
|---|---|---|
| [OpenUI](https://www.openui.com) | OpenUI Lang, a language of its own | yes: [the benchmark](/benchmark) |
| [A2UI](https://github.com/a2ui-project/a2ui) | JSON messages that describe components | not yet |
| [Vercel AI SDK](https://ai-sdk.dev) | tool calls, which your code turns into components | not yet |
| [Thesys C1](https://www.thesys.dev) | its own format, through its API | not yet |

Comparisons with the last three need runs of their own on the same briefs; they go on this page, with their raw answers, once we have them.
