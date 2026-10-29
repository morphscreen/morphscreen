---
title: Vue and Nuxt
description: A client-only component that draws the answer after it mounts, in Nuxt 4 or any Vue 3 app.
---

```sh pm
npm install @morphscreen/web
```

The core runs in the browser. In Nuxt, a component named `*.client.vue` renders only there, and `onMounted` runs after its element exists.

## Serve the core

Copy `morphscreen.wasm` into `public/` before each build:

```js file="sdk/web/install/templates/nuxt/copy-wasm.mjs" title="copy-wasm.mjs"
```

## The stylesheet

```ts file="sdk/web/install/templates/nuxt/nuxt.config.ts" title="nuxt.config.ts"
```

## The answer

```vue file="sdk/web/install/templates/nuxt/app/components/MorphAnswer.client.vue" title="app/components/MorphAnswer.client.vue"
```

`SAMPLE`, imported from `./sample`, is a saved answer standing in for your server's stream: [what's in it](/docs/integrations#the-sample).

```vue file="sdk/web/install/templates/nuxt/app/app.vue" title="app/app.vue"
```

In a Vue app with Vite but no Nuxt, import the core's address the way the [Plain JavaScript](/docs/integrations/vanilla) page does (`@morphscreen/web/morphscreen.wasm?url`) instead of copying the file.
