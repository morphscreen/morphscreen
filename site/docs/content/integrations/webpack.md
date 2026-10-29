---
title: webpack
description: The core as an asset module and the stylesheet through css-loader, in webpack 5.
---

```sh pm
npm install @morphscreen/web
```

An `asset/resource` rule turns the imported `.wasm` into the address of a file webpack emits, which `loadCore` fetches.

```js file="sdk/web/install/templates/webpack/webpack.config.js" title="webpack.config.js"
```

```js file="sdk/web/install/templates/webpack/src/main.js" title="src/main.js"
```

`SAMPLE`, imported from `./sample`, is a saved answer standing in for your server's stream: [what's in it](/docs/integrations#the-sample).
