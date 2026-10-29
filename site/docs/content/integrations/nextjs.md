---
title: Next.js
description: The App Router with the page rendered on the server and the answer drawn in a client component.
---

```sh pm
npm install @morphscreen/web
```

The core runs in the browser, so the answer goes in a client component. The page around it stays a server component.

## Serve the core

Copy `morphscreen.wasm` into `public/` before each build, so it's served at `/morphscreen.wasm`:

```js file="sdk/web/install/templates/next/copy-wasm.mjs" title="copy-wasm.mjs"
```

```json title="package.json"
{ "scripts": { "build": "node copy-wasm.mjs && next build" } }
```

## The stylesheet

```tsx file="sdk/web/install/templates/next/app/layout.tsx" title="app/layout.tsx"
```

## The answer, in a client component

```tsx file="sdk/web/install/templates/next/app/answer.tsx" title="app/answer.tsx"
```

`SAMPLE`, imported from `./sample`, is a saved answer standing in for your server's stream: [what's in it](/docs/integrations#the-sample).

```tsx file="sdk/web/install/templates/next/app/page.tsx" title="app/page.tsx"
```

## Your server route

Your `/api/agent` route can be a Route Handler doing what [the Quick start's server](/docs/quickstart) does: add `X-MorphScreen-Key`, set the model, and return MorphScreen's response body as the response.

```ts file="sdk/web/install/templates/next/app/api/agent/route.ts" title="app/api/agent/route.ts"
```
