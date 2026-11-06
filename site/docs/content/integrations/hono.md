---
title: Hono
description: The page's route in Hono, for Node.js, Bun, Deno or Cloudflare Workers: AG-UI runs go on to MorphScreen with your key and the events stream back.
---

```sh pm
npm install hono @hono/node-server
```

Hono returns web `Response` objects, so MorphScreen's stream goes back to the page as it is, with no piping.

```js file="site/docs/snippets/hono-proxy.mjs" title="server.mjs"
```

## Other runtimes

The route is the same everywhere; only the start and where the key comes from change:

- **Bun and Deno:** drop `serve` and `export default app`.
- **Cloudflare Workers:** `export default app`, and read the key from the binding, `c.env.MORPHSCREEN_KEY`, since Workers have no `process.env`. Put it in with `wrangler secret put MORPHSCREEN_KEY`.

## A chat UI of your own

For your own chat UI, add a second route that sends `{ model, stream: true, messages }` to `/v1/chat/completions` and returns `upstream.body` the same way. The [Express page](/docs/integrations/express) has both routes side by side.

We run this file in CI on Node.js against a recorded answer: a page with `connectAgent` draws the answer through it.
