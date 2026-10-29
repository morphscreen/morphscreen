---
title: React
description: Draw an answer with the Answer component in React 18 or later. It reads the text as it grows, so you can pass your streamed text straight in.
---

```sh pm
npm install @morphscreen/web
```

`<Answer>` takes the core and the answer's text so far. When `text` grows, only the new part is read, so you can set it on every chunk. Set `done` when the answer is complete.

```tsx file="sdk/web/install/templates/vite-react/src/main.tsx" title="src/main.tsx"
```

`SAMPLE`, imported from `./sample`, is a saved answer standing in for your server's stream: [what's in it](/docs/integrations#the-sample).

With Vite, `?url` turns the package's `morphscreen.wasm` into an address it serves with your app.

## Its props

| Prop | What it is |
|---|---|
| `core` | from `loadCore` |
| `text` | the answer so far; or `stream`, an async iterable of chunks |
| `done` | the answer is complete |
| `packs`, `custom`, `components` | the packs and your own components ([Your own components](/docs/format/custom-components)) |
| `onAction` | what the reader did ([Actions and state](/docs/format/actions)) |
| `imageHosts`, `maps`, `maplibre` | where pictures and map tiles load from ([Pictures, icons and maps](/docs/format/media)) |
| `className` | your classes for the answer's element |

For a whole conversation, use `connectAgent` in an effect ([Quick start](/docs/quickstart)), or `<Answer>` once per message.
