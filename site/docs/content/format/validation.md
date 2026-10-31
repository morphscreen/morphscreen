---
title: Validation and repair
description: Every line is checked against your app's components as it streams, and the API asks the same model to rewrite only the lines that break a rule.
---

A model gets things wrong: an attribute that doesn't exist, a value outside its list, a component it made up. The core catches each one on its line, as the answer streams, and the API repairs only those lines.

## Lenient where the intent is clear

- **Values match without case, and a few synonyms count:** `error` means `danger`, `column` means `bar`. These are reported as notes, not errors.
- **A bad value is fixed at its edge:** the default if there is one, or an optional attribute is dropped. A bad table row drops only that row.
- **An unknown component is dropped** and its content kept as text, so nothing the model said is lost.
- **Names models use on their own** (`<Table>`, `<Column>`, `<Buttons>`) are read as what they mean.

## Strict where it isn't

Each problem is a diagnostic on its line, with a class:

| Class | What it means |
|---|---|
| `hallucinated-component` | a component that isn't in your catalog |
| `signature-mismatch` | an attribute the component doesn't have, or of the wrong kind |
| `required-field` | a required attribute left out |
| `enum-mismatch` | a value outside an attribute's list, with no default to fall back on |
| `placement` | content where its parent doesn't take it: text directly inside a `Quiz`, a `Question` outside one |
| `malformed-syntax` | a tag that doesn't close, or closes the wrong thing |
| `unreadable-tag` | a line that opens like a component but isn't a tag the core can read |
| `unsafe-url` | an address that could run code, like `javascript:` |

A cut-off answer is reported as truncated, never passed off as whole.

## Repair

When an answer has errors, the API sends the model the broken lines with what's wrong with each and asks for those lines again, with nothing else rewritten. Broken nesting, like a tab closed with its parent's tag, is mended with no model at all.

- It's on by default. `"repair": false` in the options turns it off.
- A blank answer gets one fresh try.
- A repair runs on the same model and key as the answer, and counts as part of the same call.
- It can take a few rounds: each asks again for the lines still broken. It stops after 30 seconds and keeps the best version it has.

A repair takes a second or two for a line or two, and up to that limit for an answer with many errors; on `/v1/chat/completions` a chunk tells you when one starts, so the page can say a fix is on its way.

## What you see

**Through `/v1/ui`** (what `connectAgent` reads), a `morphscreen.repairing` event says a repair has started, then the repaired answer replaces the one that streamed and a `morphscreen.repair` event says what changed. You don't need to do anything.

**Through `/v1/chat/completions`**, when the answer has errors, a chunk comes right after its text:

```json
{ "choices": [{ "index": 0, "delta": {}, "finish_reason": null }], "morphscreen": { "repairing": { "errors": 2 } } }
```

Then the last chunk's `morphscreen` field carries the core's verdict on the answer to draw, and when a repair kept one, the repaired text:

```json
{
  "morphscreen": {
    "valid": true,
    "truncated": false,
    "components": 12,
    "diagnostics": [],
    "repair": { "repaired": true, "errors_before": 2, "rounds": 1, "nesting": false, "ms": 1840, "lines": [7, [12, 14]], "text": "...", "valid": true }
  }
}
```

Draw `repair.text` in place of what streamed (with the web SDK, `destroy()` the answer and draw a new one in the same element). A repair that only closed what the model left open, the commonest kind, needs none of that: its closing lines arrive as ordinary content before the last chunk, `repair.appended` is `true` and there's no `repair.text`, so pushing every chunk's content as usual finishes the answer where it is. `valid` is about that text: the repaired one when there is one, otherwise what streamed; `repair.errors_before` counts what the streamed one had. A repair that couldn't fix everything says `errors_left` and `why`, and its text is still the best version. Without streaming, the answer you get is already the repaired one.

In the op stream (`/v1/ui` with `output: "ops"`), a diagnostic's class is the `cls` field; everywhere else it's `class`.

## On the dashboard

Every call's line shows whether its answer was valid, which components had errors, and what repair did: the [dashboard](/docs/production/dashboard).
