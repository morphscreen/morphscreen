---
title: Svelte and SvelteKit
description: Draw the answer in onMount, with the core imported as a URL, in SvelteKit 3 or any Svelte 5 app.
---

```sh pm
npm install @morphscreen/web
```

`onMount` runs in the browser only, so the core never loads on the server. Vite's `?url` turns the package's `morphscreen.wasm` into an address it serves.

```svelte file="sdk/web/install/templates/sveltekit/src/routes/+page.svelte" title="src/routes/+page.svelte"
```

`SAMPLE`, imported from `./sample`, is a saved answer standing in for your server's stream: [what's in it](/docs/integrations#the-sample).

```ts file="sdk/web/install/templates/sveltekit/vite.config.ts" title="vite.config.ts"
```
