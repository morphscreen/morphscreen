# Changelog

Every published version of `@morphscreen/web`, newest first. A release
publishes only a version written here.

## Unreleased

- A map keeps the core's drawn map when the live one can't start: without
  WebGL (switched off, or a machine without it) MapLibre fails, and the
  figure was left as an empty box.

## 0.1.1

Open source under the Apache License 2.0, at
https://github.com/morphscreen/morphscreen. Fixes from building an app with
nothing but the public docs, and from two demos in a chat widget's width.

- `destroy()` empties the element it drew into, as the docs say, so an
  answer drawn there again (a repaired one) no longer stacks under the old.
- `core.actionMessage()` works with `morphscreen.wasm` too, not only the
  agent build.
- A vote's action carries the poll's `question` and its message names it; a
  quiz's carries its `title`; a form's carries each field's label in
  `labels`, and its message lists the fields by label.
- `<Answer>` in React takes `onComponentState`, `state` and `onOps`, so an
  answer can be saved and drawn again as the reader left it.
- An app's own `:root { --ms-... }` after the stylesheet wins in dark mode
  too, and `--ms-numeric: normal` turns the tabular figures off.
- A quoted value reads `&quot;`, `&apos;`, `&lt;`, `&gt;` and `&amp;` the way
  HTML does.
- `morphscreen-page.css` is exported; the package ships types only for what
  it exports, and its stylesheet without our own notes (17.4 KB brotli, from
  23.7).
- In a chat widget's width, a comparison's feature names wrap so its options
  fit side by side. A table still wider than its box fades out on the side
  there's more to see, and a comparison keeps its feature names in place as
  it scrolls.
- `--ms-primary` and `--ms-primary-ink` (`primary` and `primaryInk` in a theme
  file) colour primary buttons, a chosen time slot and the open tab, so they
  can take your brand colour. They're ink until you set them, and themes
  without them keep their look, in SwiftUI and Compose too.
- A time slot keeps its label on one line; longer labels get wider columns.
- Buttons inside an app's own component look like buttons, and come to it as
  `actions` too (`{ label, ask, variant }`) for an app that draws its own.
- An app's own component whose content is a list, a table, pictures or code
  gets it in `html` and `text`; before, only `any` content arrived.
- An empty line in a code block keeps its height, so the line numbers no
  longer sit on each other.

## 0.1.0

The first public beta.

- The WASM core reads an answer as it streams, checks every line against
  the components the app allows, and draws it with plain DOM or React 18+.
- 75 components in nine packs; an app's own components as custom packs.
  The app's function draws one as soon as it opens, from its attributes
  (`streaming: true`), then again when it's complete, with its content as
  HTML (its own words, then buttons that ask) and its words as text.
- New words fade in as an answer streams; nothing moves under reduced
  motion.
- `connectAgent` for agents that speak AG-UI 1.0, with the agent build of
  the core.
- Themes from a W3C Design Tokens file (`@morphscreen/web/theme`).
- Pictures only from the hosts an app lists, map tiles only from its own
  provider key; the SDK sends nothing of its own.
- Installs and draws with npm, pnpm, Yarn (PnP and node_modules) and bun,
  under Vite, Next.js (App Router), webpack, Angular, Nuxt and SvelteKit.
