---
title: Checking a model's UI line by line while it streams
description: How MorphScreen reads a model's answer as it arrives, checks every line against the components an app allows, and sends only the broken lines back to the model.
date: 2026-11-06
keywords: generative UI, LLM, streaming, validation, repair, Rust, WebAssembly
---

MorphScreen checks a model's UI one line at a time while the answer is still streaming. A small Rust core reads each finished line against the components the app allows, the page draws the good lines straight away, and only the broken ones go back to the same model to be rewritten. On OpenUI's benchmark briefs, that took DeepSeek V4 Flash from 87.0% valid answers to 184 of 184.

<figure class="doc-video">
<video data-src="/docs/media/intro.mp4" poster="/docs/media/intro.jpg" muted loop playsinline preload="none" aria-label="An answer about the planets streaming into a page with photos, a chart, products, a quiz and a form"></video>
<figcaption>A saved DeepSeek V4 Flash answer streaming through the web SDK at the pace the model wrote it, unedited.</figcaption>
</figure>

## The problem with waiting for the end

When a model answers with UI instead of text, drawing it isn't the hard part. The hard part is what to do with the bits that are wrong while the answer is still arriving.

And models get UI wrong all the time. They invent a component your app doesn't have, add an attribute that doesn't exist, or close a tag with its parent's name. With a JSON format you usually find out at the end, when the whole thing fails to parse, and the reader has been looking at a spinner the whole time.

## Why one line at a time

The model writes Markdown with a few tags. Here's a short answer, and what the reader sees:

:::preview
## Weekend in Lisbon

<Columns>
<Stat label="Budget" value="$330" />
<Stat label="Per day" value="$165" />
</Columns>

<Chart type="bar" title="Where it goes">
| Item | USD |
|---|---|
| Stay | 180 |
| Food | 90 |
| Trams | 60 |
</Chart>
:::

Models already write Markdown well, and a tag per line is easy for them to get right. It also means half an answer is always a valid start of the whole one. There's no closing bracket to wait for, so the page draws the heading and the first stat before the model has written the second.

## What happens to each line

:::figure Every finished line takes one of two paths. This figure, like the others in the post, is MorphScreen drawing the Markdown it was written in.
<Steps>
<Step title="The model finishes a line" status="done">A heading, a table row, or one tag such as a Stat.</Step>
<Step title="The core checks it" status="done">Against the components the app allows: their names, their attributes, the values each takes and where each may go.</Step>
<Step title="A good line is drawn at once" status="done">The page updates while the model keeps writing.</Step>
<Step title="A broken line is repaired" status="done">Only that line goes back to the same model, with what's wrong with it.</Step>
</Steps>
:::

The checking happens in a small Rust core, `no_std`, compiled to WebAssembly for the browser (about 219 KB compressed) and linked natively for SwiftUI and Compose. It knows the app's catalog: 75 built-in components in packs, plus whatever the app registers itself.

## Lenient where the intent is clear

Plenty of mistakes have an obvious meaning, and the core reads them that way instead of failing. Here a model wrote `tone="error"` where the component says `danger`, and `type="column"` where it says `bar`:

:::preview
<Callout tone="error" title="Payment failed">
The card was declined. Try another one.
</Callout>

<Chart type="column" title="Sign-ups this week">
| Day | Sign-ups |
|---|---|
| Mon | 12 |
| Tue | 18 |
| Wed | 9 |
</Chart>
:::

The core reads `error` as `danger` and `column` as `bar`, and notes both. The answer is still valid, so nothing goes back to the model.

## Strict where it isn't

When the intent isn't clear, the line gets a diagnostic with a class, tied to the line it's on. A made-up `<Weather city="Lisbon">` is a `hallucinated-component`: it's sent for repair, and until then its words are drawn as plain text, so nothing the model said disappears.

| Class | What it means |
|---|---|
| `hallucinated-component` | a component that isn't in the app's catalog |
| `signature-mismatch` | an attribute the component doesn't have, or of the wrong kind |
| `required-field` | a required attribute left out |
| `enum-mismatch` | a value outside an attribute's list, with no default to fall back on |
| `placement` | content where its parent doesn't take it |
| `malformed-syntax` | a tag that doesn't close, or closes the wrong thing |
| `unreadable-tag` | a line that opens like a component but isn't a tag the core can read |
| `unsafe-url` | an address that could run code, like `javascript:` |

None of what the model writes ever runs: no scripts, no inline styles, and pictures only from hosts the app allows.

## Repair, only where it's needed

When a line breaks a rule, the API sends the model just the broken lines with what's wrong with each and asks for those lines again. Everything else stays as it streamed. Broken nesting is mended with no model at all, and the most common problem, an answer that left its tags open, gets its closing lines appended in place, so nothing on the page is swapped.

:::figure DeepSeek V4 Flash with reasoning off and every component on, the benchmark's 46 briefs four times each.
<Chart type="horizontal" title="Valid answers, %">
| | Valid |
|---|---|
| Before repair | 87.0 |
| After repair | 100 |
</Chart>
:::

## Testing it

Streaming bugs tend to live exactly at chunk boundaries. So every recorded answer we have, 3,371 of them, is fed to the core split at every possible point, and each split has to give the same tree as the whole answer.

A parser that reads untrusted text from a model should never panic either, so the core runs under a fuzzer for 24 hours at a time:

:::figure The 24-hour fuzz runs that found something, and the last two, on the core as it is now.
<Timeline title="24-hour fuzz runs">
- 18 to 19 Oct: 187.3 million mutated answers and 3 panics from one bug, a chart nested so deep it got a negative width. Fixed, with a test.
- 19 to 20 Oct: One more panic at 131.2 million, a code block whose first line began with a narrow no-break space. Fixed, with a test.
- 31 Oct to 1 Nov: 93.7 million, no failures.
- 3 to 4 Nov: 88.3 million, no failures.
</Timeline>
:::

## Try it

The web SDK is one package:

```sh
npm install @morphscreen/web
```

Or start from a working React chat, with the server route and the page already wired:

```sh
gh repo create my-chat --template morphscreen/starter-react --private --clone
```

The core, the format and the SDKs are open source under Apache-2.0 at [github.com/morphscreen/morphscreen](https://github.com/morphscreen/morphscreen). [Validation and repair](https://morphscreen.com/docs/format/validation) in the docs has every rule, and the [benchmark](https://morphscreen.com/benchmark) has the numbers above with every raw answer.

If you're building something where a model answers with UI, I'd like to hear what breaks for you.
