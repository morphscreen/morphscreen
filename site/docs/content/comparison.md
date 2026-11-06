---
title: Generative UI SDKs compared
description: MorphScreen beside OpenUI, CopilotKit, the Vercel AI SDK, A2UI, MCP Apps, Tambo and Thesys C1, what each asks the model to write, and which one fits which app. Facts as of November 2026.
---

Generative UI libraries share a goal: a model's answer that the reader can use, not just read. They differ in what the model writes, who checks it, and what happens when it's wrong. This page says what each one does, where we've measured, and when another one is the better pick. Each fact about another project comes from its own README or docs, read in November 2026.

## What MorphScreen does differently

- **The model writes Markdown with a few tags.** Models already write both, so the format needs a short prompt ({{prompt:core}} tokens with the core components, {{prompt:all}} with every pack), and half an answer is always a valid start of the whole one. Nothing waits for a closing bracket or a root statement.
- **Every line is checked as it streams.** The core reads each line against the components your app allows, so what reaches your page is already validated, and a mistake is tied to the line it's on.
- **Only broken lines are repaired.** When a line breaks a rule, the API asks the same model to rewrite that line, not the whole answer.
- **Any model.** The model included in every plan, or any model on OpenRouter with your own key.
- **Nothing a model wrote ever runs.** No script, no style, no address you didn't allow (see [Security](/docs/production/security)).

## Against OpenUI, measured

We measure ourselves against OpenUI on the benchmark thesysdev publishes for it: the same 46 briefs, the same models and the same rules for what counts as valid. The [benchmark page](/benchmark) has the method, every raw answer and the rows where OpenUI is ahead with why; [every row](/compare/openui) is on its own page.

## The others

| Library | What the model writes | Who draws it | Licence |
|---|---|---|---|
| [OpenUI](https://github.com/thesysdev/openui) | OpenUI Lang, a compact language of its own | runtimes for React, Vue, Svelte and Angular | MIT |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) | tool calls your components render, A2UI or Open-JSON-UI specs, or MCP Apps | React and Next.js, with Angular, Vue and React Native supported | MIT |
| [Vercel AI SDK](https://ai-sdk.dev) | tool calls, which your code turns into components | your components, through its React and Vue hooks | Apache-2.0 |
| [A2UI](https://github.com/a2ui-project/a2ui) | JSON messages describing components from a catalog | its renderers (web components first) | Apache-2.0 |
| [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) | a tool call; the tool's server supplies an HTML view | the chat client, in a sandboxed frame | MIT, moving to Apache-2.0 |
| [Tambo](https://github.com/tambo-ai/tambo) | tool calls to components registered with Zod schemas | React | MIT |
| [Thesys C1](https://www.thesys.dev) | its own format, through its hosted API | its React SDK | hosted |

Only OpenUI is measured against MorphScreen so far. The others need runs of their own on the same briefs; they go here, with their raw answers, once we have them.

## Which fits which app

- **OpenUI** if you want a fully open stack you can run yourself, and React, Vue, Svelte or Angular. It's ahead of us on some rows of its own benchmark; the [benchmark page](/benchmark) says which and why.
- **CopilotKit** for a copilot inside your app that reads and changes the app's own state: shared state, frontend tools, human-in-the-loop steps, and adapters for most agent frameworks (LangGraph, CrewAI, Mastra, Google ADK, PydanticAI and more). It's built on AG-UI, which its team created. More on [MorphScreen vs CopilotKit](/docs/comparison/copilotkit).
- **The Vercel AI SDK** when you already use it and need a few known components, one per tool: a weather card, a flight picker. Its React Server Components approach to generative UI is paused, by its own docs; tool calls are the way it supports now.
- **A2UI** when one agent should draw the same UI on several platforms through an open standard, with renderers from its project and from others.
- **MCP Apps** when your UI is part of an MCP server and should appear inside chat clients that support MCP Apps (Claude among them), not in your own app.
- **Tambo** for React apps that want the model to fill your own components' props. Its README says Tambo Cloud, the hosted backend, stopped answering on 2026-10-31; the SDK and a self-hosted backend remain.
- **Thesys C1** was Thesys's hosted API. Its docs now lead to openui.com, and thesys.dev's pricing page sells OpenUI Cloud, the hosted side of OpenUI.

## When MorphScreen isn't the right pick

- **You need native apps today.** The web SDK is the one we ship. SwiftUI and Jetpack Compose run on the same core in our tests, but they aren't released yet.
- **Your UI is a fixed set of screens.** If every answer should show one known component, tool calls into your own components (the Vercel AI SDK, CopilotKit) are simpler.
- **You want no hosted part at all.** The core, the format and the SDKs are open source (Apache-2.0), and an answer can be drawn without our API ([LangChain.js](/docs/agents/langchain) shows how). Repairs, the included model and metering are our hosted API.
- **You need a long track record.** MorphScreen launched in October 2026.
