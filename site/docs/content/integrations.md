---
title: Integrations
description: The web SDK works in any framework. Each page here is a small app we install, build and run in Chrome before every release, so the code works as written.
---

The web SDK is one npm package: the core as WebAssembly, a renderer for the page, a React component, and a stylesheet. It works with any framework and any package manager. Each integration needs the same three things:

1. **The stylesheet:** import `@morphscreen/web/morphscreen.css` once.
2. **The core, served as a file:** `morphscreen.wasm` (or `morphscreen-agent.wasm` for `connectAgent`, see [which core](#which-core)) from the package, at an address `loadCore` can fetch. How depends on your build tool, and each page shows it.
3. **The browser only:** the core runs in the browser. On a framework that renders on the server, load it in a client component or after mount.

## Frameworks

:::cards
- [React](/docs/integrations/react): the `<Answer>` component, with Vite.
- [Next.js](/docs/integrations/nextjs): the App Router, the page rendered on the server and the answer in a client component.
- [Vue and Nuxt](/docs/integrations/vue): a client-only component.
- [Svelte and SvelteKit](/docs/integrations/svelte): `onMount`, with the core imported as a URL.
- [Angular](/docs/integrations/angular): the core as an asset, after the view starts.
- [Plain JavaScript](/docs/integrations/vanilla): `createAnswer` with Vite and no framework.
- [webpack](/docs/integrations/webpack): the core as an asset module.
:::

## Package managers

Every package manager works: npm, pnpm, Yarn (with node_modules or Plug'n'Play) and bun. We install with each of them under Vite before every release.

## On your server

Your server keeps the key and talks to MorphScreen: [Node.js](/docs/integrations/node), [Python](/docs/integrations/python), or [HTML with no JavaScript](/docs/integrations/html) for pages drawn on the server.

In these examples a saved answer stands in for your server's stream, so they run anywhere. In your app, the text comes from your server's route ([Quick start](/docs/quickstart)).

## The sample

`./sample` exports one answer in [our format](/docs/format) as a string, `export const SAMPLE = "...";`. This is the one the pages use:

```markdown file="sdk/web/install/sample.md" title="the answer in sample.ts"
```

Any answer works in its place: one you saved from `/v1/chat/completions`, or one you write by hand.

## Which core

The package has two builds of the core, and you serve one:

- **`morphscreen.wasm`** draws answers (`createAnswer`, `<Answer>`) and words actions as the next message (`core.actionMessage`). About 219 KB compressed, 662 KB raw.
- **`morphscreen-agent.wasm`** does all that and holds a whole conversation with `connectAgent`, an AG-UI client. About 253 KB compressed, 773 KB raw.

Use the agent build with `connectAgent`, as the [Quick start](/docs/quickstart) does, and the smaller one when your own code holds the conversation.

## Your own chat UI, or connectAgent

`connectAgent` talks to `/v1/ui` and draws the whole conversation into one element: the reader's messages, each answer, the buttons and forms sending the next turn. It's the shortest way to a working chat.

With a chat UI of your own (your own message bubbles, your own loading states, the page around each answer), stream `/v1/chat/completions` from your server instead and draw each answer with `createAnswer` (or `<Answer>` in React). Then:

- push each chunk's `delta.content` into the answer, and call `end()` when the stream ends;
- when the last chunk's `morphscreen.repair.text` is there, draw it in place of what streamed; a repair that only closed open tags streams its closing lines as content instead, so there's nothing to swap ([Validation](/docs/format/validation#what-you-see)); a chunk with `morphscreen.repairing` comes first, so you can show that a fix is on its way;
- turn the reader's actions into your next user message with `core.actionMessage(action)`, worded as the API words them ([Actions and state](/docs/format/actions)).
