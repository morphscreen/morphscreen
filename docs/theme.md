# The web theme

`morphscreen.css` (in `@morphscreen/web`'s `dist`) is the faces, then the
tokens, then the theme. Load it once on the page that shows answers.

## On your page

It styles answers and nothing else. The SDK puts `ms-answer` on the
element it draws an answer into (and `ms-thread` on an agent's), and
every rule is inside one of them, so the rest of your page looks the same
with or without it. Every class an answer uses starts with `ms-`
(`ms-card`, `ms-btn`), so Bootstrap's or daisyUI's `.card` and `.btn` never
reach an answer, and ours never reach your page. Each of our selectors
carries one `.ms-answer` more than it needs, which keeps your page's own
element rules (a reset's `h1`, `p`, `table`) off answers whichever
stylesheet loads first. Your own components inside an answer
(`.ms-custom`) are left to your styles; they inherit only the answer's font
and colour.

To change the look, set the tokens below. To change one of our rules
itself, write yours with `.ms-answer.ms-answer` in front and load it after
ours.

A page that is just one answer (one rendered on a server, say) also loads
`morphscreen-page.css`, for the page's background and the answer's column:

```html
<link rel="stylesheet" href="morphscreen.css">
<link rel="stylesheet" href="morphscreen-page.css">
<main class="ms-answer"><!-- the answer's HTML --></main>
```

## Palettes

Light and dark follow the reader's system setting. Pin one with
`data-theme="light"` or `data-theme="dark"` on `<html>`; `data-theme="mono"`
is the greyscale palette (tones become ink on light grey). Every colour is a
token (`--ms-accent`, `--ms-ink`, `--ms-surface`, `--ms-c1` to `--ms-c8` and
so on, listed in `render/tokens.css`), so an app can set its own on `:root`.
Each starts `--ms-`, so an app's own (shadcn/ui's `--accent`, say) and ours
never overwrite each other. The token test
checks every text colour against its grounds at 4.5:1 in all three palettes;
an app that changes colours should keep to that.

## Faces

Answers are set in IBM Plex Sans, with IBM Plex Mono for code and keys. They
ship in `dist/fonts` (SIL Open Font License, `dist/fonts/LICENSE`) and load
from there, never from a font host; each script's file (Latin, Latin
Extended, Greek, Cyrillic, Vietnamese) loads only when an answer uses it, so a
typical English answer fetches about 60 KB once. `loadCore` starts them
loading alongside the core. Until they arrive, text is set in Arial or Menlo
sized to Plex's widths, so it barely moves when Plex takes over.

To use the app's own faces instead (its chrome's, say):

```css
:root {
  --ms-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --ms-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

Nothing from `dist/fonts` is fetched then.

## Controls

The core's HTML works with no script: native selects, date and time inputs,
file inputs, audio and video with the browser's controls, details that open,
tabs that switch with radio buttons. The web SDK lays its own over them: a
select's list, a month to pick a date from, a list of times, a stepper's
minus and plus, a drop zone for files, players for audio and video, a
carousel's arrows, a copy button on code. The native control stays on the
page, hidden (`data-ms-hidden`), and is still what a form submits and what the
component's state is read from. What the SDK adds is marked `data-ms-added`
(or `data-ms-wrap` where it wraps something of the core's), so a page compares
equal to the core's HTML with those left out.

## Motion

Components arrive and answer with short morphs on motion.dev springs: a
chart grows as its rows stream in and re-flows when a legend item switches a
series off; a quiz choice's key turns into a check or a cross; details turn
their plus into a minus; play turns into pause; copy turns into a check;
numbers count up, bars rise, arcs sweep. The marks they morph between are in
`spec/marks.json`, shared with the native SDKs. With
`prefers-reduced-motion: reduce` nothing moves: each state is set at once.
