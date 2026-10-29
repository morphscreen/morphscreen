---
title: HTML without JavaScript
description: Render a finished answer as HTML on your server with /v1/render. It needs no script, passes a strict content security policy, and works in mail, feeds and pages without JavaScript.
---

`/v1/render` draws an answer you already have, with no model called. The HTML has no script and no style attributes: tabs switch with radio buttons, details open, selects and date inputs are the browser's own, charts and maps are SVG.

```bash title="Terminal"
curl https://api.morphscreen.com/v1/render \
  -H "X-MorphScreen-Key: $MORPHSCREEN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "## Budget\n\n<Stat label=\"Per day\" value=\"$165\" />\n"}'
```

```json title="The response"
{ "html": "<h2>Budget</h2>\n<div class=\"ms-stat\">...</div>", "morphscreen": { "valid": true, "truncated": false, "components": 1, "diagnostics": [] } }
```

Put it in a page with the stylesheets from the web SDK's package (`dist/morphscreen.css` and its `fonts/`, and `dist/morphscreen-page.css` for a page that is just the answer):

```html title="answer.html"
<link rel="stylesheet" href="/morphscreen.css">
<link rel="stylesheet" href="/morphscreen-page.css">
<main class="ms-answer"><!-- the html from /v1/render --></main>
```

Every component draws this way; the [component reference](/docs/components) is this HTML. `output: "ops"` or `"tree"` returns the core's op stream or tree instead, for drawing it yourself.

Renders are free up to ten times your plan's calls a month. Pictures load only from your images' and photo provider's hosts, and those you list in `image_hosts`.
