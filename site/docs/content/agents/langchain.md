---
title: LangChain.js
description: Any LangChain.js chat model answers in MorphScreen's format once it has MorphScreen's system prompt. The web SDK draws the text and its core checks every line as it streams.
---

```sh pm
npm install @langchain/core @langchain/openai
```

A LangChain model writes MorphScreen answers when it gets MorphScreen's system prompt. Your chain, tools and model stay as they are; MorphScreen adds the prompt on the way in and draws the text on the way out.

## The prompt and the stream

```js file="site/docs/snippets/langchain-answer.mjs" title="morphscreen.mjs"
```

`morphscreenPrompt` calls [`POST /v1/prompt`](/docs/reference/api/prompt), which isn't counted as a call. Fetch it once when the server starts, with the [packs](/docs/format/packs) your answers use.

## With a model

Any chat model LangChain has works. On OpenRouter, for example:

```js title="Using it"
import { ChatOpenAI } from "@langchain/openai";
import { morphscreenPrompt, streamAnswer } from "./morphscreen.mjs";

const model = new ChatOpenAI({
  model: "deepseek/deepseek-v4.1-flash",
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
});
const prompt = await morphscreenPrompt(["data", "inputs", "interactive"]);

for await (const text of streamAnswer(model, prompt, [{ role: "user", content: "Compare three running shoes under $120" }])) {
  // send each piece to the page
}
```

## In the page

Send each piece to the page as it comes (a streamed HTTP response or a WebSocket), and draw it with [`createAnswer`](/docs/reference/web) or [`<Answer>`](/docs/integrations/react). The core in the page reads each line against the components you allow as it arrives: an unknown component becomes plain text and a bad value falls back to its default ([Validation and repair](/docs/format/validation)), and nothing the model wrote ever runs.

## What you give up

Here your own model writes the answer, so MorphScreen's API isn't in the path and its repairs aren't either: a line with an error is drawn as well as the core can read it, not rewritten by the model. When you want repairs, send the conversation to [`/v1/chat/completions`](/docs/agents/openai-compatible) instead, on the model in your plan or your own OpenRouter key.

For a LangGraph agent served over AG-UI to `connectAgent`, see [LangGraph](/docs/agents/langgraph).

We run `morphscreen.mjs` in CI: it fetches the prompt from the API, and a scripted LangChain model streams a recorded answer through `streamAnswer`.
