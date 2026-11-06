---
title: MorphScreen vs CopilotKit
description: CopilotKit connects your app to AI agents; MorphScreen turns each answer into UI the model composes. What each does, where they overlap, and which to pick. Facts as of November 2026.
---

Both put a model's answer on screen as UI, but they start from different ends. CopilotKit, in its own words, is "an open-source framework that connects your app to AI agents": it gives the agent your app's state and tools, and draws what it does with your components. MorphScreen gives the model a format to compose UI in, answer by answer, and checks every line of it as it streams.

Facts about CopilotKit here come from its README and docs, read in November 2026.

## Side by side

| Aspect | CopilotKit | MorphScreen |
|---|---|---|
| What the model writes | tool calls your components render; A2UI or Open-JSON-UI specs; MCP Apps from MCP servers | Markdown with a few tags ([the format](/docs/format)) |
| Who decides the layout | your components, or the spec against a catalog you register | the model, within the components your app allows |
| New kinds of UI | a component and a tool for each, or a catalog for specs | {{components:all}} components in packs, plus [your own](/docs/format/custom-components) |
| Checking the model's output | not stated in its docs | every line, as it streams ([Validation and repair](/docs/format/validation)) |
| Fixing broken output | not stated in its docs | the broken lines rewritten by the same model |
| In the browser | React and Next.js; Angular, Vue and React Native supported | any framework through one web SDK ([Integrations](/docs/integrations)) |
| Agent frameworks | LangGraph, CrewAI, Mastra, Google ADK, PydanticAI, AWS Strands, LlamaIndex, Agno and more | any that speaks AG-UI or OpenAI's chat completions ([Build agents](/docs/agents)) |
| Protocol | AG-UI, which its team created | AG-UI for `connectAgent` ([`/v1/ui`](/docs/reference/api/ui)) |
| Licence | MIT | the core and SDKs Apache-2.0; the API hosted |

## Pick CopilotKit when

- The assistant works on your app, not just in a chat: it reads the page's state, calls your frontend functions, and waits for the reader to approve a step.
- You use one of the agent frameworks it adapts to, and want its chat, sidebar and popup components ready made.
- You want Slack or Microsoft Teams as well as the web (on its hosted platform).

## Pick MorphScreen when

- Answers should be rich and different each time: a dashboard for one question, a comparison table and a booking form for the next, without a component and a tool written for each.
- You want what reaches the page checked as it streams, with broken lines repaired by the model rather than shown.
- You want one format any model can write, from a prompt of {{prompt:core}} to {{prompt:all}} tokens, and a renderer in any web framework.

## Together

CopilotKit is built on AG-UI, and MorphScreen's `/v1/ui` is an AG-UI endpoint, so the two speak the same protocol. We haven't yet tested CopilotKit's own components drawing MorphScreen's answers; until we have, use `connectAgent` for the conversation that should answer in UI.
