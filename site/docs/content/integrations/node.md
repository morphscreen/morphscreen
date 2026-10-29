---
title: Node.js
description: Call MorphScreen from a Node.js server with nothing but fetch: carry a page's AG-UI runs, stream an answer's text, or render a finished answer as HTML.
---

Node 18 or later has everything this needs. Keep `MORPHSCREEN_KEY` in the server's environment; it never goes to the page.

## A route for the page

The page's `connectAgent` sends its runs to your route, which adds the key and the model and streams the events back:

```js file="site/docs/snippets/agent-proxy.mjs" title="server.mjs"
```

In Express, Fastify or Hono, the route body is the same: read the run, set `forwardedProps.model`, `fetch` MorphScreen's `/v1/ui`, and pipe the response body back with its status and content type.

## The answer's text, or HTML

For work on the server (a mail, a saved report, a page drawn without JavaScript), stream the answer's text from `/v1/chat/completions`, or render a finished answer with `/v1/render`:

```js file="site/docs/snippets/stream-answer.mjs" title="morphscreen.mjs"
```

```js title="Using it"
import { renderHtml, streamAnswer } from "./morphscreen.mjs";

let text = "";
for await (const piece of streamAnswer([{ role: "user", content: "Make me a sales dashboard" }])) text += piece;
const { html, verdict } = await renderHtml(text);
```

Both are what our tests run against a recorded answer, in Node and in Python.
