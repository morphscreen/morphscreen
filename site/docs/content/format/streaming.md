---
title: How streaming works
description: Why an answer can be drawn line by line without ever redrawing what's done, and what the page shows while a component is still arriving.
---

The format is built so the core only ever reads the new text, never re-reads what it has already seen, and the page never redraws what's finished.

## One rule: a value counts once it's whole

- A component appears when its opening tag is complete (its `>` arrived), with every attribute final.
- Text streams word by word.
- A table row counts at its line's end.
- A number, a choice from a list or an address is only ever read whole: `max` never shows as "800" on its way to "8000".

## What's done never changes

A closed component is final, so the page never draws it twice. Each part of the answer is known by its place in the tree (`"3"`, `"3.0"`, `"3.0.2"`), never by a position in a list that could shift, because parts only ever arrive after the ones before them.

## While a component arrives

A component still streaming is drawn from its complete lines so far, and the newer lines are patched in: a chart grows as its rows come, a table fills row by row. It becomes interactive when it closes.

## One parser

Reading a whole answer is streaming it in one piece. Our tests check that every split of every recorded answer gives the same tree. The core has also been fuzzed with hundreds of millions of mutated answers, and every crash that turned up was fixed with a test of its own.

## What it costs

Streaming through the core is fast enough not to matter: on our benchmark, Chrome spends {{score:CPU to stream and render in the browser:ours}} in all to stream and draw 20 answers, against {{score:CPU to stream and render in the browser:openui}} for OpenUI's renderer, and the first text shows in {{score:Time to first text on screen:ours}} against {{score:Time to first text on screen:openui}} ([the benchmark](/benchmark)).

[The op stream](/docs/reference/ops) is what the core hands a renderer, for drawing answers yourself.
