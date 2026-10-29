# Your own components

An app can add components the model may use, next to the built-in ones. It
takes three steps on every platform: describe the component, give the
description to the model, and say how to draw it.

## 1. Describe it

A component lives in a pack: a name, one line about what it's for, its
attributes, and what goes between its tags (`none`, `text`, `table`, `list`,
`images`, or `any` for Markdown and other components).

```json
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

Attribute types are `string`, `number`, `boolean`, `url`, `list` (values
separated by ` | `), or an array of allowed values. One attribute, one
meaning: `tone="warning"`, not `style="color: orange"`.

A `text` component can take `"actions": true`: the model may then put
`Button`s inside it, each with `ask` (the message a tap sends) or `href`, and
they come to your renderer as its children. That's a card the reader acts on,
like a shop's product with "Add to cart".

Already have a Zod or JSON Schema for the props? Convert it on the server:

```ts
import { z } from "zod";
import { fromJsonSchema } from "morphscreen/spec/catalog";

const ProductCard = fromJsonSchema("ProductCard", "a product with its price",
  z.toJSONSchema(z.object({ name: z.string(), price: z.string(), stock: z.enum(["in", "low", "out"]).optional() })));
```

Fields that can't be written as an attribute (objects, arrays of objects)
are reported, so the model is never told about props it can't fill.

## 2. Give it to the model

The system prompt is built from the catalog, so the pack's components show
up in it with their attributes. The same pack goes to the parser, which
checks the model's answer against it.

```ts
const prompt = core.prompt(["device"], [shop]);      // web, server (WASM core)
```
```swift
let prompt = try systemPrompt(custom: [shopJSON])    // Swift
```
```kotlin
val prompt = systemPrompt(custom = listOf(shopJson)) // Kotlin
```

## 3. Draw it

React:

```tsx
import { Answer } from "morphscreen/react";

function ProductCard({ attrs }: CustomProps) {
  return <div className="product"><strong>{attrs.name}</strong> {attrs.price}</div>;
}

<Answer core={core} custom={[shop]} components={{ ProductCard }} stream={stream} onAction={send} />
```

Your component is drawn in a `<div class="ms-custom">` inside the answer.
Our stylesheet leaves everything in it to yours, apart from the buttons it
drew there: it only inherits the answer's font and colour.

When it's complete, the function gets the component's `html` (its words,
then its buttons as `<a class="ms-btn ms-primary" href="?ask=...">`, in our
button style; a tap on one inside the answer sends its ask to `onAction` by
itself), `text` (its words alone) and `actions` (its buttons as data:
`{ label, ask, variant }`, or `href` for a link), for an app that draws its
own buttons and sends the ask with its `onAction`.

Without React, a component is a function that fills an element and may
return a cleanup:

```ts
createAnswer(el, { core, custom: [shop], components: {
  ProductCard: (el, { attrs }) => { el.textContent = `${attrs.name} ${attrs.price}`; },
} });
```

SwiftUI:

```swift
let answer = try Answer(custom: [shopJSON])
AnswerView(answer, components: [
  "ProductCard": { p in AnyView(HStack { Text(p.attrs["name"]?.string ?? "").bold(); Text(p.attrs["price"]?.string ?? "") }) },
])
```

Compose:

```kotlin
val answer = Answer(custom = listOf(shopJson))
AnswerView(answer, components = mapOf(
    "ProductCard" to { p -> Text("${p.node.attr("name")} ${p.node.attr("price")}") },
))
```

A component the app doesn't draw still shows: its attributes as a list,
then its content. Nothing an answer contains is ever dropped silently.

## What the app gets back

Buttons and forms inside an answer send actions (spec/format.md,
"Actions"): `ask` with the text to send as the next user turn, or `submit`
with the form's fields, typed (text, numbers, booleans, lists, files,
locations). A custom component can send its own through the same callback.

## Checked

Each platform's tests use a custom pack end to end: `sdk/web/example/test.mjs`
(React, in Chrome), `sdk/swift/Tests/MorphScreenTests` (`CustomComponentTests`)
and `sdk/android/ui/src/jvmTest` (`customComponentRenders`).
