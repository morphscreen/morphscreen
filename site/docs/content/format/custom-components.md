---
title: Your own components
description: Teach the model your product's own components. Describe one once, give it to the API and the page, and say how to draw it.
---

Next to the built-in components, an app can add its own: a shop's product card, a booking's seat map, a support ticket. It takes three steps, and the same description serves all three: the model learns it from the prompt, the core checks answers against it, and your page draws it.

:::steps
## Describe it

A component lives in a pack: a name, one line on what it's for, its attributes, and what goes between its tags.

```json title="shop.json"
{
  "name": "shop",
  "version": "1.0.0",
  "components": {
    "ProductCard": {
      "about": "a product with its price",
      "attrs": {
        "name": { "type": "string", "required": true },
        "price": { "type": "string", "required": true },
        "stock": ["in", "low", "out"]
      },
      "content": "none"
    }
  }
}
```

Attribute types are `string`, `number`, `boolean`, `url`, `list` (values split by ` | `), or a list of the values allowed, the first being the default. Content is `none`, `text`, `table`, `list`, `images` or `any` (Markdown and other components). One attribute, one meaning: `stock="low"`, not `style="color: orange"`.

A `text` component can take `"actions": true`. The model may then put `Button`s inside it, each with `ask` (the message a tap sends) or `href`, drawn under it as what the reader can do, like "Add to cart".

## Give it to the API

The API puts the pack's components in the system prompt and checks the answer against them. Send it from your server with every call:

```js title="POST /v1/chat/completions"
{ "model": "deepseek/deepseek-v4.1-flash", "messages": [...], "morphscreen": { "components": [shop] } }
```

```js title="In your /v1/ui route"
run.forwardedProps = { ...run.forwardedProps, model: MODEL, components: [shop] };
```

## Draw it

Give the page the same pack, and a function that draws the component into an element. It's called as soon as the component opens, with its attributes and `streaming: true`, so the reader sees it while the rest arrives, then again when it's complete, into the same element emptied. The second time it also gets its content: `html` is the component's own words then its buttons, and `text` is its words alone. It may return a cleanup, which runs before the next drawing.

Its buttons come three ways, so use whichever suits:

- In `html`, as links in MorphScreen's button style: `<a class="ms-btn ms-primary" href="?ask=...">`. Put `html` in your element and a tap on one sends its ask to your `onAction`, like any other button in the answer. Nothing to wire.
- In `actions`, as data: `{ label, ask, variant }`, or `href` instead of `ask` for a link. Draw them your own way and send the ask yourself with `onAction({ type: "ask", text: ask })`.
- Restyled: `.ms-custom .ms-btn` in your stylesheet beats ours.

```ts title="main.ts"
import { createAnswer } from "@morphscreen/web";
import shop from "./shop.json";

createAnswer(el, {
  core,
  custom: [shop],
  components: {
    ProductCard: (el, { attrs }) => {
      el.textContent = `${attrs.name}: ${attrs.price}`;
    },
  },
});
```

With React, pass components:

```tsx title="App.tsx"
import { Answer, type CustomProps } from "@morphscreen/web/react";
import shop from "./shop.json";

function ProductCard({ attrs }: CustomProps) {
  return (
    <div className="product">
      <strong>{attrs.name}</strong> {attrs.price}
    </div>
  );
}

<Answer core={core} text={text} custom={[shop]} components={{ ProductCard }} />;
```

`connectAgent` takes `custom` and `components` the same way.
:::

## Your styles, untouched

Your component is drawn in a `<div class="ms-custom">` inside the answer. MorphScreen's stylesheet leaves everything in it to yours, apart from the buttons it drew there: it only inherits the answer's font and colour.

## When something's missing

A component your page doesn't draw still shows: its attributes as a list, then its content. Nothing an answer holds is dropped without a word.

## Names

A name defined twice is an error, never an override, so your pack can't replace a built-in component by accident. The one exception: when you leave `packs` out (every pack), your own `Product` or `Map` replaces the pack's. Name the pack outright and the two clash.
