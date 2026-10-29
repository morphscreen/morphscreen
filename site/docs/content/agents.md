---
title: Build agents
description: Three ways to get MorphScreen answers into an app with an agent or a chat: the AG-UI endpoint, an AG-UI agent of your own, or the OpenAI-style call you already make.
---

There are three ways in, depending on where your conversation lives.

| You have | Use | What you get |
|---|---|---|
| A chat with no agent framework yet | `/v1/ui` and `connectAgent` ([Quick start](/docs/quickstart)) | The model run, checks and repairs on our side; the conversation, actions and state on the page; one route on your server |
| An agent that speaks AG-UI (LangGraph, Mastra, CrewAI, Pydantic AI and others) | [AG-UI agents](/docs/agents/ag-ui) | `connectAgent` pointed at your agent, which answers in our format with the prompt from the core |
| Code that already calls OpenAI or OpenRouter | [OpenAI-compatible clients](/docs/agents/openai-compatible) | The same call with a new base address and one header; you draw the text yourself |

## In one turn

1. The reader types, or taps something in the last answer.
2. The page sends it, with the conversation, as an AG-UI run or a chat call.
3. The model answers in our format, with the system prompt built from your catalog.
4. The core reads the answer as it streams: on our server through the API, and on the page in the SDK. Each line is checked, and the page draws each part as soon as it's complete.
5. The reader acts on the answer. Buttons, forms and quiz answers come back as actions, and with `connectAgent` they become the next turn.

## Tools

`/v1/ui` doesn't run tools yet: a run's `tools` must be empty. An agent of your own can use tools as it likes, and `connectAgent`'s `onToolCall` answers tools that run in the page.
