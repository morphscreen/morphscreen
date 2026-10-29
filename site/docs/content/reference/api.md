---
title: The HTTP API
description: The base address, the two keys, the endpoints you call, and where the API's machine-readable description lives.
---

```text
https://api.morphscreen.com/v1
```

## Keys

| Header | What it is |
|---|---|
| `X-MorphScreen-Key: ms_live_...` | Your MorphScreen key, on every call. The call counts against your plan. Keep it on your server. |
| `Authorization: Bearer sk-or-...` | Your own OpenRouter key, when you want a model other than the one in your plan. It goes to OpenRouter and nowhere else, never stored or logged. Leave it out to use the model in your plan. |

## Endpoints

| Endpoint | What it does |
|---|---|
| [`POST /v1/chat/completions`](/docs/reference/api/chat-completions) | OpenAI's chat completion, answered in our format, checked and repaired; streamed or whole |
| [`POST /v1/ui`](/docs/reference/api/ui) | An AG-UI run, what the web SDK's `connectAgent` reads |
| [`POST /v1/render`](/docs/reference/api/render) | An answer you already have, drawn as HTML (or ops, or the tree) with no model called |
| [`POST /v1/prompt`](/docs/reference/api/prompt) | The system prompt for some packs, for an agent that runs its own model; not counted |
| [`GET /v1/health`](/docs/reference/api/health) | Whether the API is up |

## Options

Each model call takes the same options: in a `morphscreen` field for chat completions, in `forwardedProps` for AG-UI, at the top level for render.

| Option | What it does |
|---|---|
| `packs` | the packs to add to core; every pack when left out, `[]` for core alone |
| `components` | your own packs ([Your own components](/docs/format/custom-components)) |
| `images` | your own pictures, which the model shows by id |
| `photos` | your own Pexels, Unsplash or Openverse key, for photos the model asks for |
| `image_hosts` | more hosts the HTML's pictures may load from |
| `repair` | repair an answer with errors (default `true`) |
| `output` | what comes back: `text` or `html` for chat completions, `agui` or `ops` for AG-UI, `html`, `ops` or `tree` for render |

## The description

The API's OpenAPI 3.1 description is at [`/v1/openapi.json`](https://api.morphscreen.com/v1/openapi.json). Our tests hold the server to it, and these reference pages are generated from it.

[Limits and errors](/docs/production/limits) has every error and what to do about it.
