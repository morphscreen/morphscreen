# MorphScreenUI

The look of everything of ours: morphscreen.com, the dashboard, the admin and
the status page now, and the SDK's answers after the launch (roadmap phase Z).
It's built on hosanna-ui's accessible parts. The direction was chosen on a board in
three rounds: https://claude.ai/artifact/24phdTghjCBXaEssKyGC2m.

The rules:

- Black throughout, each layer one step up: ground, base, raised, control,
  pressed, edge.
- Eight pastels, each with one job. Sky is data, peach commerce, aqua device,
  butter docs and waiting, rose media and failure, lime inputs, lilac
  interactive and the selection, mint scheduling and success. Charts always
  take them in that order (as their mid tones).
- Text is white or one of three greys, or ink on a light fill. The colour goes
  on the mark beside the words: a dot, an icon, a bar, a ring.
- Continuous corners of 10, 16 and 22 px. Capsules only for things you press.
- Liquid glass (a lens, never frost) only on what floats.

## Files

- `morphscreenui.tokens.json`: the tokens, in the W3C Design Tokens format
  that `spec/theme.tokens.json` uses.
- `theme.css`: hosanna-ui's tokens pointed at ours, the parts it can't express
  through tokens, and our own small parts (`.msui-tag`, `.msui-chip`,
  `.msui-dot`, `.msui-meter`, `.msui-panel`, `.msui-glass` and the type steps).
- `glass.ts`: `lens(el)` gives a `.msui-glass` element its displacement map in
  Chrome. Other browsers keep the plain capsule.
- `fonts/`: Archivo (variable, with its width axis) and IBM Plex Mono, both
  under the SIL Open Font License, served from our own origin.

## Build and check

```sh
node ui/build.mjs        # writes ui/dist/morphscreenui.css and fonts, then checks
node ui/test-sheet.mjs   # every part in every state in Chrome (BROWSER=firefox, BROWSER=safari)
```

The build fails if any of these hold:

- a text and surface pair is under WCAG AA;
- the chart order fails the colour-blindness or contrast rules;
- a linted file colours text.

The sheet test needs the dashboard's packages (see `dashboard/build.mjs`). A
page loads `morphscreenui.css` after hosanna-ui's stylesheet, with
`dist/fonts/` beside it.
