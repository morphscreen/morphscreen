---
title: "@morphscreen/web/theme"
description: Apply a W3C Design Tokens file to every component, light, dark and mono, and check its contrast before you ship it.
---

```ts
import { applyTheme } from "@morphscreen/web/theme";
import tokens from "./brand.tokens.json";

applyTheme(tokens);                         // every answer on the page
applyTheme(tokens, { scope: "#support" });  // only answers inside #support
```

A theme is a [W3C Design Tokens](https://www.designtokens.org) file: the colours of each role in light, dark and mono, the faces, the type steps and the corners. A file that leaves a role out is an error, so a theme is always complete. The page's `data-theme` still picks the mode. Applying again with the same scope replaces the earlier theme.

## Functions

| Function | What it does |
|---|---|
| `applyTheme(tokens, { scope?, document? })` | puts the theme on the page after the SDK's stylesheet, as a `<style>` element, and returns it; throws `ThemeError`, naming the token, when the file is incomplete or a value is the wrong type |
| `readTheme(file)` | the theme in a tokens file |
| `writeTheme(theme, description?)` | the theme as a tokens file |
| `themeCss(theme, root?)` | the theme as CSS custom properties, to ship in your own stylesheet |
| `checkTheme(theme)` | every text colour against every ground it's drawn on, in each mode, at 4.5:1; what fails |

Under a content security policy, `applyTheme`'s `<style>` element needs a nonce. To avoid that, write `themeCss(theme)` into your own stylesheet at build time.
