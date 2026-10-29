---
title: OpenAI-compatible clients
description: Code that calls OpenAI or OpenRouter switches to MorphScreen with a new base address and one header. Answers come back in our format, checked and repaired.
---

The API speaks OpenAI's chat completions, OpenRouter's flavour: streaming, usage with cost, fallback models, OpenRouter's provider settings. Code written for OpenAI's SDK or OpenRouter's switches by its base address and one header, and the rest stays as it is.

## On your own OpenRouter key

Any model on OpenRouter runs on your own key. It goes to OpenRouter and nowhere else, never stored or logged.

```ts title="Node.js"
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.morphscreen.com/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { "X-MorphScreen-Key": process.env.MORPHSCREEN_KEY },
});

const stream = await client.chat.completions.create({
  model: "anthropic/claude-sonnet-4.6",
  stream: true,
  messages: [{ role: "user", content: "Compare three running shoes under $120" }],
});
for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
```

```python title="Python"
import os

from openai import OpenAI

client = OpenAI(
    base_url="https://api.morphscreen.com/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
    default_headers={"X-MorphScreen-Key": os.environ["MORPHSCREEN_KEY"]},
)
```

## On the model in your plan

The model included in your plan needs no OpenRouter key: send no `Authorization` header at all. OpenAI's Node SDK always adds one, so turn it off:

```ts title="Node.js"
const client = new OpenAI({
  baseURL: "https://api.morphscreen.com/v1",
  apiKey: "unused",
  defaultHeaders: { "X-MorphScreen-Key": process.env.MORPHSCREEN_KEY, Authorization: null },
});
// model: "deepseek/deepseek-v4.1-flash"
```

From Python, call the API without the SDK ([Python](/docs/integrations/python)), since any `Authorization` header is taken as an OpenRouter key.

## OpenRouter's own SDK

```ts title="Node.js"
import { OpenRouter } from "@openrouter/sdk";
import { HTTPClient } from "@openrouter/sdk/lib/http.js";

const httpClient = new HTTPClient();
httpClient.addHook("beforeRequest", (req) => {
  const r = new Request(req);
  r.headers.set("X-MorphScreen-Key", process.env.MORPHSCREEN_KEY);
  return r;
});
const openrouter = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, serverURL: "https://api.morphscreen.com/v1", httpClient });
```

## What changes

- The answer is in our format, and the API's system prompt goes before your messages ([The system prompt](/docs/format/system-prompt)).
- The last streamed chunk carries the core's verdict, and the repaired text when a repair was needed ([Validation and repair](/docs/format/validation)).
- OpenRouter's errors come back as your SDK's own error classes, with OpenRouter's status: a 402 when your OpenRouter credit runs out, a 429 with its wait.
- Options go in a `morphscreen` field of the request: `packs`, `components`, `images`, `photos`, `repair` ([the reference](/docs/reference/api/chat-completions)).

To draw the text, pass it to the web SDK's `createAnswer` or `<Answer>`, or render it on your server with `/v1/render`.
