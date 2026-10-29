---
title: The format
description: What a model writes for MorphScreen: Markdown with a few components written like JSX, designed so half an answer is always a valid start of the whole one.
---

An answer is Markdown with components written like JSX. Models already write both, so the format needs little teaching, and the prompt that teaches it is short.

:::preview
## Weekend in Lisbon

Two days is enough for the old town and Belém, if you take the trams for the hills.

<Columns>
<Stat label="Budget" value="$330" note="for one, two nights" />
<Stat label="Per day" value="$165" />
</Columns>

<Chart type="bar" title="Where the money goes">
| Item | USD |
|---|---|
| Stay | 180 |
| Food | 90 |
| Trams | 60 |
</Chart>

<FollowUps>
- Where should I stay?
- What should I eat?
</FollowUps>
:::

## Components

```markdown
<Name attr="value" other=42 flag>content</Name>
<Name attr="value" />
```

- A component's name starts with a capital letter. `<div>` or `<br>` is text.
- Values are quoted; numbers and `true` or `false` may go without quotes, and a bare attribute (`required`) means `true`.
- A list of values is split by ` | `: `options="S | M | L"`.
- A component with nothing inside closes itself, like `<Stat ... />`.
- An attribute means the same on every component: `tone` is always `neutral`, `info`, `success`, `warning` or `danger`.

Each component says what goes between its tags: Markdown and other components, a Markdown table (a chart's data), a list (follow-up questions), images or nothing. The [component reference](/docs/components) has each one's attributes.

## Markdown

Text between components is Markdown: headings, paragraphs, emphasis, inline code, links, lists, quotes, code blocks, rules and tables. Raw HTML is never drawn as HTML. The few tags models slip in anyway, like `<strong>` and `<br>`, are read as formatting, and the rest shows as written.

## Why it streams well

- **There's no root to forget.** The answer is the root, and a component's place in the tree is where it's written.
- **A value counts only once it's whole.** A component appears when its opening tag is complete, so its attributes never change after it shows. A number or an address is never read half-written.
- **What's finished never changes.** A closed component is final, so the page never draws it twice.

[How streaming works](/docs/format/streaming) has the detail.

## What the core does with it

The core is the same Rust code everywhere: WebAssembly in the browser, inside the API on the server. As the text arrives it builds the tree, checks every line against the components your app allows, and reports each problem on its line. The API repairs those lines with the same model ([Validation and repair](/docs/format/validation)), and the SDK draws the tree.

The full grammar is the [format specification](/docs/reference/specification).
