---
title: Generative UI in Next.js, with the answer drawn while it streams
description: A Next.js App Router chat where the model answers with charts, tables and forms. One route handler that keeps the key on the server, one client component, and the four things that tripped us up.
date: 2026-11-15
keywords: generative UI, Next.js, App Router, React, streaming, AI chat, LLM UI, AG-UI
---

Generative UI in Next.js takes three files. A route handler adds your key and passes the conversation on, a client component draws each answer as it streams, and a small script copies the WebAssembly core into `public/`. The model answers in Markdown with a few component tags, and the reader sees cards, charts and forms instead of a wall of text.

If you'd rather see it before writing anything, type a prompt at [morphscreen.com/try](https://morphscreen.com/try). No account needed.

:::figure What a reader gets back for "my monthly budget on $3,200". Drawn by MorphScreen from the Markdown it's written in.
## A month on $3,200

<Columns>
<Stat label="Coming in" value="$3,200" />
<Stat label="Going out" value="$2,860" />
<Stat label="Left to save" value="$340" />
</Columns>

<Chart type="donut" title="Where it goes">
| Item | USD |
|---|---|
| Rent | 1400 |
| Food | 520 |
| Transport | 240 |
| Bills | 310 |
| Fun | 390 |
</Chart>
:::

All of this is the [Next.js starter](https://github.com/morphscreen/starter-nextjs), so you can also clone it and skip to the end.

## 1. Install, and put the core where the browser can get it

```sh
npm install @morphscreen/web
```

The SDK's parser and validator is a small Rust core compiled to WebAssembly, `morphscreen-agent.wasm`. Next.js doesn't serve files out of `node_modules`, so copy it into `public/` before `dev` and `build`:

```js title="copy-wasm.mjs"
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
mkdirSync("public", { recursive: true });
copyFileSync(require.resolve("@morphscreen/web/morphscreen-agent.wasm"), "public/morphscreen-agent.wasm");
```

```json title="package.json"
"scripts": {
  "dev": "node copy-wasm.mjs && next dev",
  "build": "node copy-wasm.mjs && next build",
  "start": "next start"
}
```

## 2. A route handler that keeps the key on the server

The page talks AG-UI to your own route. The route adds your key and the model, sends the run on to MorphScreen, and streams the events straight back:

```ts title="app/api/agent/route.ts"
const API = process.env.MORPHSCREEN_API ?? "https://api.morphscreen.com/v1";
const MODEL = process.env.MODEL ?? "deepseek/deepseek-v4.1-flash";

export async function POST(req: Request) {
  const run = await req.json();
  run.forwardedProps = { ...run.forwardedProps, model: MODEL };
  const upstream = await fetch(`${API}/ui`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MorphScreen-Key": process.env.MORPHSCREEN_KEY ?? "" },
    body: JSON.stringify(run),
    // The reader leaving stops the call too.
    signal: req.signal,
  });
  return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream" } });
}
```

Two lines there matter more than they look. `upstream.body` goes back as it is, so every event reaches the page the moment it arrives. And `signal: req.signal` means a reader closing the tab stops the model too.

The server picks the model, not the page. On the free plan, `deepseek/deepseek-v4.1-flash` runs on our key, so you don't need a model key to start. For any other model on OpenRouter, add your OpenRouter key as `Authorization: Bearer ...` in that fetch.

## 3. A client component that draws each answer as it streams

```tsx title="app/chat.tsx"
"use client";

import { useEffect, useRef, useState } from "react";
import { connectAgent, loadCore, type Conversation } from "@morphscreen/web";

export function Chat() {
  const element = useRef<HTMLDivElement>(null);
  const [chat, setChat] = useState<Conversation | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live: Conversation | undefined;
    let gone = false;
    loadCore("/morphscreen-agent.wasm").then((core) => {
      if (gone) return;
      live = connectAgent(element.current!, { core, url: "/api/agent" });
      setChat(live);
    });
    return () => {
      gone = true;
      live?.destroy();
    };
  }, []);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("message") as HTMLInputElement;
    const text = input.value;
    input.value = "";
    setBusy(true);
    try {
      await chat?.send(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div ref={element} />
      <form onSubmit={send}>
        <input name="message" placeholder="Ask anything" aria-label="Your message" required />
        <button disabled={!chat || busy}>Send</button>
      </form>
    </main>
  );
}
```

`connectAgent` holds the whole conversation: what the reader typed, each answer drawn as it streams, and the buttons, forms and quizzes in an answer sent back as the next turn. Your page itself can stay a server component that renders `<Chat />`.

The answers need the SDK's stylesheet, once, in `app/layout.tsx`. Without it they come out as bare HTML:

```ts title="app/layout.tsx"
import "@morphscreen/web/morphscreen.css";
```

## 4. Your own components

The built-in ones (75 of them, in packs) cover a lot, but the point is usually your app's own pieces: a product card from your store, a booking slot, a ticket. You describe each one once in JSON, the model is told about it, every line that uses it is checked against that description while it streams, and your own React code draws it. [Custom components](https://morphscreen.com/docs/format/custom-components) has the whole thing.

## What tripped us up

**React's dev mode mounts effects twice.** Without the `gone` flag, the first mount's core finishes loading after the cleanup ran and you get two conversations in one div. The flag drops the late one.

**A content security policy needs `'wasm-unsafe-eval'`.** If your app sends a CSP, the core won't start without it in `script-src`. We hit this ourselves when we put the playground on our own site, which has a strict policy.

**Something between you and the reader can hold the stream back.** Next's own server doesn't, and neither does Vercel. But behind nginx or another proxy that buffers, the whole answer shows up at once at the end. Add `X-Accel-Buffering: no` to the route's response, or turn buffering off for that path.

**The key goes in `MORPHSCREEN_KEY`, never `NEXT_PUBLIC_`.** Anything with that prefix is bundled into the page for everyone to read.

## How it's tested

The starter has an end-to-end check: a script builds it with `next build`, starts it against our API server replaying a recorded answer, types a question in Chrome and waits for the answer to be drawn with no page errors. It passed on today's SDK, 0.1.2.

Clone it with `gh repo create my-chat --template morphscreen/starter-nextjs --private --clone`, or read [Generative UI in React](https://morphscreen.com/docs/guides/generative-ui-react) for the same thing without Next.js. The SDK and the core are open source under Apache-2.0 at [github.com/morphscreen/morphscreen](https://github.com/morphscreen/morphscreen).
