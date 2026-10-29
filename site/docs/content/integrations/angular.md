---
title: Angular
description: The core served as an asset and drawn after the view starts, in Angular 22.
---

```sh pm
npm install @morphscreen/web
```

## Serve the core and the stylesheet

```json title="angular.json (build options)"
{
  "styles": ["node_modules/@morphscreen/web/dist/morphscreen.css"],
  "assets": [{ "glob": "morphscreen.wasm", "input": "node_modules/@morphscreen/web/dist", "output": "/" }]
}
```

## The answer

```ts file="sdk/web/install/templates/angular/src/app/app.ts" title="src/app/app.ts"
```

`SAMPLE`, imported from `./sample`, is a saved answer standing in for your server's stream: [what's in it](/docs/integrations#the-sample).

Angular CLI 22 needs Node.js 22.22.3 or later, or 24.15 or later.
