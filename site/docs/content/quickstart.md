---
title: Quick start
description: From a key to an answer drawn in your page, in about ten minutes. One route on your server, a few lines in your page.
---

You need a MorphScreen key, a server that can make an HTTP request (Node.js and Python are shown), and a page that can import an npm package.

:::steps
## Get a key

Sign up at [app.morphscreen.com](https://app.morphscreen.com/signin) with your email or GitHub. Your first key is shown once on the welcome page. Copy it into your server's environment:

```bash title=".env"
MORPHSCREEN_KEY=ms_live_...
```

The free plan has 100 calls on our model, so you don't need a model key to try it, then up to 3,000 calls a month on [your own OpenRouter key](/docs/agents/openai-compatible).

## Try a call

The API speaks OpenAI's chat completions. This streams an answer from the model included in your plan:

```bash title="Terminal"
curl https://api.morphscreen.com/v1/chat/completions \
  -H "X-MorphScreen-Key: $MORPHSCREEN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek/deepseek-v4.1-flash", "stream": true,
       "messages": [{"role": "user", "content": "Plan a weekend in Lisbon"}]}'
```

Each event's `delta.content` is the next piece of the answer, in [our format](/docs/format): Markdown with a few tags.

## Add a route to your server

Your page talks to your server, and your server talks to MorphScreen with the key. One route carries the page's runs on to `/v1/ui` and streams the events back:

```js file="site/docs/snippets/agent-proxy.mjs" title="server.mjs"
```

The same route in Python, with only the standard library:

```python file="site/docs/snippets/agent_proxy.py" title="server.py"
```

## Install the web SDK

```sh pm
npm install @morphscreen/web
```

It ships two builds of the core. `morphscreen-agent.wasm` (used below) holds a whole conversation with `connectAgent`. `morphscreen.wasm` is about 34 KB smaller compressed (111 KB raw) and draws answers you stream yourself with `createAnswer`, for a chat UI of your own: [which to use](/docs/integrations#which-core).

### Draw the conversation

`connectAgent` holds the conversation: it sends what the reader types, draws each answer as it streams, and sends buttons, forms and quiz answers back as the next turn.

```html file="site/docs/snippets/agent-page.html" title="index.html"
```

```ts file="site/docs/snippets/agent-page.ts" title="main.ts"
```

Serve `morphscreen-agent.wasm` from the package with your page. Each [integration](/docs/integrations) shows how for its build tool.
:::

That's a working chat. Ask it for a trip, a dashboard or a quiz, and the answer arrives as cards, charts and questions, checked line by line.

## Where next

:::cards
- [The format](/docs/format): what the model writes, and why half an answer is always valid.
- [Components](/docs/components): all 75, drawn live, with their attributes.
- [Your own components](/docs/format/custom-components): teach the model your product's own cards.
- [Actions and state](/docs/format/actions): what comes back when the reader taps, types and answers.
:::
