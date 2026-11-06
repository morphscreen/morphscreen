---
title: Generative UI in React
description: Build a React chat where the model answers with charts, tables, forms and buttons, drawn as the answer streams, with clicks sent back as the next turn. Vite, Express and the web SDK, in about fifteen minutes.
---

By the end you have a chat in React where an answer can be a dashboard, a comparison table or a booking form. It draws while the model is still writing, and when the reader presses a button or sends a form, that goes back to the model as the next turn. The finished app is [morphscreen/starter-react](https://github.com/morphscreen/starter-react) on GitHub.

You need Node.js 18 or later and a MorphScreen key ([sign up](https://app.morphscreen.com/signin): the free plan includes calls on our model, so no model key is needed to try it).

:::steps
## Make the app

```bash title="Terminal"
npm create vite@latest my-chat -- --template react-ts
cd my-chat
npm install @morphscreen/web express
```

## Add the server route

The page never sees your key. It sends each run to your server, which adds the key and the model and streams the answer back:

```js file="site/docs/snippets/express-proxy.mjs" title="server.mjs"
```

This page uses `/api/agent`; `/api/chat` is there for when you draw answers in a chat UI of your own (below). Start it with your key in the environment:

```bash title="Terminal"
MORPHSCREEN_KEY=ms_live_... node server.mjs
```

## Send the page's calls to it

Vite serves the page on its own port, so pass `/api` through to the server:

```ts title="vite.config.ts"
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3000" } },
});
```

## Draw the conversation

`connectAgent` holds the conversation in one element: what the reader types, each answer as it streams, and buttons and forms sent back as the next turn. In React it lives in an effect:

```tsx file="site/docs/snippets/react-chat.tsx" title="src/main.tsx"
```

`?url` makes Vite serve the core, `morphscreen-agent.wasm`, from the package along with your app.

## Run it

```bash title="Terminal"
npm run dev
```

Open the address Vite prints and ask for something with shape: "a sales dashboard for my shop this year", "compare three phones under $500", "a form to book a table for four".
:::

## What the model can draw

The answer is Markdown with a few tags, and the API gives the model the prompt for them. With every pack on, that's {{components:all}} components: stats, charts, tables, cards, tabs, forms, quizzes, maps and more ([Components](/docs/components)). Fewer packs make a shorter prompt: set `packs` with the model in the server route's `forwardedProps`, and give `connectAgent` the same list ([Components and packs](/docs/format/packs#choosing-packs)).

## Your own components

A product card from your catalog or a chart from your design system can be one of the components the model uses. Describe it once, and the core checks the model's use of it like any other ([Your own components](/docs/format/custom-components)).

## Your own chat UI instead

When your app already has message bubbles and its own loading states, keep them and draw each answer with `<Answer>`: stream `/api/chat` from the same server and pass the text as it grows ([React](/docs/integrations/react)). Read the stream's last chunk for the verdict and a repair ([Validation and repair](/docs/format/validation)).

## Next.js

With the App Router, the route becomes a route handler and the chat a client component ([Next.js](/docs/integrations/nextjs)).

We run this page's code in CI against a recorded answer: the Express route, and the React page drawing the answer through it in Chrome.
