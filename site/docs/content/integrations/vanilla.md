---
title: Plain JavaScript
description: createAnswer draws into any element, with no framework. Push the text as it arrives and end it when it's done.
---

```sh pm
npm install @morphscreen/web
```

```ts file="sdk/web/install/templates/vite/src/main.ts" title="src/main.ts"
```

`SAMPLE`, imported from `./sample`, is a saved answer standing in for your server's stream: [what's in it](/docs/integrations#the-sample).

```html file="sdk/web/install/templates/vite/index.html" title="index.html"
```

`createAnswer` returns the answer: `push(text)` for each piece, `end()` when it's done, `html()` for the finished answer as HTML, `applyState(states)` to set what the reader did, and `destroy()`. [The web SDK reference](/docs/reference/web) has its options.
