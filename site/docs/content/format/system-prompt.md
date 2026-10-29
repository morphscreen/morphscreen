---
title: The system prompt
description: How the model learns the format. The API builds the prompt from your catalog and puts it before your own messages; you can also build it yourself.
---

The model learns the format from a system prompt built from the catalog: the components your app allows, their attributes, and the rules that keep answers valid. It's the same catalog the core checks answers against, so the two can't disagree.

## Through the API

The API builds the prompt for you. It goes first, and your own messages, system messages included, follow unchanged:

```json
{
  "model": "deepseek/deepseek-v4.1-flash",
  "messages": [
    { "role": "system", "content": "You are Lisbon Trams' trip planner. Answer in British English." },
    { "role": "user", "content": "Plan a weekend for two" }
  ],
  "morphscreen": { "packs": ["data"] }
}
```

Your system message says who the assistant is and what it knows. Ours says how to answer. You don't need to describe the components yourself.

## Building it yourself

To run a model of your own, outside the API, build the same prompt with the core and send it as the first system message.

In the browser or Node, with the web SDK:

```ts
const prompt = core.prompt(["data"], [shop]); // packs, then your own packs
```

From any server (Python, Go, anything that speaks HTTP), ask the API for it once at start. It isn't counted as a call:

```bash title="Terminal"
curl https://api.morphscreen.com/v1/prompt \
  -H "X-MorphScreen-Key: $MORPHSCREEN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"packs": ["data"]}'
```

It answers `{"prompt": "..."}`, the same text `core.prompt` gives. Leave `packs` out for every pack; your own packs go in `components`.

Then check what comes back with the core yourself: a `Session` from `core.session(packs, custom)` reads the text as it streams and gives you the verdict ([the web SDK reference](/docs/reference/web)). The API does that, and the repair, for you.

## What it costs

With the core alone the prompt is {{prompt:core}} tokens, and with every pack {{prompt:all}}: about {{prompt:per}} tokens for each component a pack adds (counted with o200k, the tokenizer the benchmark uses). The prompt's version is a hash recorded with every call, so the dashboard and the benchmark can tell which prompt an answer came from.
