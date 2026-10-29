---
title: Theming
description: Answers look right in your page without touching it. Change their colours, faces and corners with tokens, or a W3C Design Tokens file.
---

`morphscreen.css`, in the web SDK, styles answers and nothing else. Load it once on the page that shows them.

## In your page

The SDK puts `ms-answer` on the element it draws into, and every rule sits inside it, so the rest of your page looks the same with or without it. Every class an answer uses starts with `ms-` (`ms-card`, `ms-btn`), so Bootstrap's or daisyUI's `.card` and `.btn` never reach an answer, and ours never reach your page. Your own components inside an answer keep your styles.

We check this before every release: 73 answers in pages built with Tailwind and shadcn/ui, Bootstrap and MUI, light and dark, compared element by element with and without the answer.

## Light, dark and mono

Answers follow the reader's system setting. Pin one with `data-theme="light"` or `data-theme="dark"` on `<html>`; `data-theme="mono"` is a greyscale palette.

## Your colours

Every colour is a token starting `--ms-`, so yours and ours never collide. Set them on `:root`, in a stylesheet loaded after `morphscreen.css`:

```css title="app.css"
:root {
  --ms-accent: #2f6fde;
  --ms-ink: #1b1d22;
}
```

Your brand colour on primary buttons, a chosen time slot and the open tab goes in `--ms-primary`, with the colour of text on it in `--ms-primary-ink`. They're ink and the page's colour until you set them:

```css title="app.css"
:root {
  --ms-primary: #6c3fd1;
  --ms-primary-ink: #ffffff;
}
```

A plain `:root` rule wins in light and dark alike: the SDK's own palettes weigh no more than `:root` does. To change a colour in one mode only, put it under `:root[data-theme="dark"]`, or in a `@media (prefers-color-scheme: dark)` block for readers who follow their system.

Keep text at 4.5:1 against its ground: our tokens are checked against that in all three palettes, and `checkTheme` checks yours ([the theme reference](/docs/reference/theme)).

## Every token

| Token | What it is |
|---|---|
| `--ms-page`, `--ms-surface`, `--ms-tile` | grounds: the page's, a card's, a tile's or a field's |
| `--ms-ink`, `--ms-ink-2`, `--ms-ink-3` | text: main, secondary, faint |
| `--ms-line`, `--ms-line-2` | borders: a hairline, a stronger one |
| `--ms-focus` | the focus ring |
| `--ms-accent`, `--ms-accent-ink`, `--ms-accent-bg` | the accent; the accent where it's text or a thin mark, dark enough to read; its light tint |
| `--ms-primary`, `--ms-primary-ink` | a primary button, a chosen time slot and the open tab's line (your brand colour; ink by default); text on it |
| `--ms-good`, `--ms-warn`, `--ms-bad`, `--ms-info`, each with a `-bg` tint | tones, for badges, changes and alerts |
| `--ms-star` | rating stars |
| `--ms-c1` to `--ms-c8` | chart series, in order |
| `--ms-heat-max` | how strong a heat map's strongest cell is, as a share of `--ms-c1` |
| `--ms-shadow-1`, `--ms-shadow-2` | a card at rest, and lifted |
| `--ms-font`, `--ms-mono` | the faces |
| `--ms-t-STEP`, `--ms-lh-STEP` | size and line height for each type step: `body`, `callout`, `footnote`, `caption`, `headline`, `title3`, `title2`, `title`, `mono`, `display` |
| `--ms-s1` to `--ms-s6` | spacing, smallest to largest |
| `--ms-r`, `--ms-r-ctl`, `--ms-r-sm` | corners: cards, controls, small things |
| `--ms-dur-fast`, `--ms-dur`, `--ms-dur-slow`, `--ms-ease`, `--ms-spring` | motion |
| `--ms-scheme` | the `color-scheme` answers take: `normal`, `dark` or `light` |
| `--ms-numeric` | how numbers' figures are set (below) |

In a theme file (`@morphscreen/web/theme`) the colour roles are named in camelCase: `accentInk` is `--ms-accent-ink`, `ink2` is `--ms-ink-2`, `goodBg` is `--ms-good-bg`.

## Numbers

Stats, tables, scores, progress and numbered lists set their figures as `tabular-nums`, so digits line up in a column. Some faces widen their full stops and commas with it too ("c. 1831" looks typed). Set `--ms-numeric` to `normal` (or `proportional-nums`) to turn it off:

```css title="app.css"
:root { --ms-numeric: normal; }
```

## Your faces

Answers are set in IBM Plex Sans, with IBM Plex Mono for code, served from the package, never from a font host. To use your app's own:

```css title="app.css"
:root {
  --ms-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --ms-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

## A whole theme

`@morphscreen/web/theme` applies a W3C Design Tokens file, light and dark, to every component: colours, faces, sizes and corners ([its reference](/docs/reference/theme)).

## Motion

Components arrive with short morphs: a chart grows as its rows stream in, a quiz choice turns into a check or a cross, numbers count up. With `prefers-reduced-motion: reduce`, nothing moves.
