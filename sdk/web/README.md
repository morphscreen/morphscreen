# @morphscreen/web

The web SDK: MorphScreen's core as WebAssembly and a renderer that draws an
answer on the page as the model streams it, with plain DOM or React 18+.
The core checks every line as it arrives, so what reaches the page is
already validated. The format is at https://morphscreen.com/docs/format.

It works with a MorphScreen account (the free plan is enough): make one at
https://app.morphscreen.com and take an API key from the dashboard.
https://morphscreen.com/docs/quickstart goes from nothing to an answer on
the page.

## Install

```sh
npm install @morphscreen/web
```

It's a public beta: before 1.0 a minor version (0.2 after 0.1) may break
things, each written in CHANGELOG.md
(https://morphscreen.com/docs/reference/versioning). The package is ESM,
with `morphscreen.wasm` (the core), `morphscreen-agent.wasm` (the core
with the AG-UI client) and `morphscreen.css` in it. Serve the WASM file you use with your app: with
Vite or SvelteKit, `import wasm from "@morphscreen/web/morphscreen.wasm?url"`;
with webpack, import it as an `asset/resource`; elsewhere copy it into
the folder your app serves (Next.js and Nuxt `public/`, Angular's
`assets`). https://morphscreen.com/docs/integrations has a working setup
for each. Before a release the packed package is installed into a fresh app for every
one (npm, pnpm, Yarn with PnP and node_modules, bun; Vite, React, webpack,
Next.js App Router, Angular, Nuxt, SvelteKit), built, and checked in
Chrome to draw an answer.

## Draw an answer

```js
import { createAnswer, loadCore } from "@morphscreen/web";
import "@morphscreen/web/morphscreen.css";

const core = await loadCore("/assets/morphscreen.wasm");
const answer = createAnswer(document.querySelector("#answer"), {
  core,
  maps: { provider: "stadia", key: "..." }, // a map's tiles, on your own key
  imageHosts: ["cdn.example.com", "images.pexels.com"], // pictures load from these hosts, nothing else
  onAction: (action) => {
    // { type: "ask" | "submit" | "quiz" | "vote" | "state", ... }
  },
});
for await (const text of stream) answer.push(text);
answer.end();
```

`stream` is the answer's text as it arrives: from the MorphScreen API
through your server (https://morphscreen.com/docs/reference/api), or from
your own model with the system prompt the core builds.

## React

```jsx
import { Answer } from "@morphscreen/web/react";

<Answer core={core} text={text} done={done} imageHosts={["cdn.example.com"]} onAction={send} />
```

`text` can grow on every render; only the new part is read. Your own
components go in as `components={{ ProductCard: MyCard }}` with their
packs as `custom` (https://morphscreen.com/docs/format/custom-components).

## A conversation with an agent

`connectAgent` holds a whole conversation with an agent that speaks AG-UI
1.0 (LangGraph, Mastra, CrewAI, Pydantic AI and the rest), with the
`morphscreen-agent.wasm` build. https://morphscreen.com/docs/agents/ag-ui
has it.

## In your page

An answer keeps its own look inside a page built with Tailwind (and
shadcn/ui), Bootstrap or MUI: their resets stop at its edge, and nothing in
`morphscreen.css` reaches the rest of your page, its light or dark
included. Your own components inside an answer (`custom`) keep your
styles. Both are checked element by element in the SDK's tests.

## Your look

`@morphscreen/web/theme` applies a W3C Design Tokens file to every
component. https://morphscreen.com/docs/reference/theme has the tokens.

## What it loads and sends

Nothing an app didn't choose. Pictures come only from `imageHosts`
(anything else shows its description; an app that gives the API a photo
key lists its provider's image host), map tiles only from the
provider in `maps` (the live map also needs MapLibre, `maplibre`), embeds and video only when the
reader taps them, and the SDK sends nothing of its own anywhere. No model
text is ever run. https://morphscreen.com/docs/production/security has the
detail.

## Browsers

Any browser with WebAssembly. Tested in Chrome and Firefox, and in Safari
on a Mac.

## Help

Mail support@morphscreen.com. The docs are at https://morphscreen.com/docs.

## License

Apache License 2.0 (LICENSE and NOTICE). The source is at
https://github.com/morphscreen/morphscreen, with the Rust core, the SwiftUI
and Compose SDKs, the format and the benchmark; issues and pull requests
are welcome there. The hosted API it talks to is a paid service under the
terms at https://morphscreen.com/terms. The third-party parts inside it
(Motion, libm, IBM Plex, Phosphor's icons) keep their own licenses, in
dist/THIRD_PARTY_NOTICES.md.
