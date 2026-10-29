---
title: Security
description: Nothing a model writes ever runs, nothing loads from a host you didn't choose, and nothing of the conversation is kept. What runs, what loads, what's kept, and the content security policy to use.
---

A model can be talked into writing anything: a prompt injection in a page it read, or a reader asking it to. So nothing in an answer is trusted.

## Nothing a model wrote runs

The core reads the answer into a tree of the components your catalog knows, and the SDK draws that tree. There's no `eval`, no `new Function` and no script from an answer.

- **Text is text.** Raw HTML is never drawn as HTML; the few tags models write anyway (`<strong>`, `<br>`) are read as formatting, with their attributes dropped.
- **Components never run code.** When the reader acts, your app gets an action and decides what happens ([Actions and state](/docs/format/actions)).
- **A what-if formula** is compiled by the core into a short list of numbers, the sliders' names and a few operators, run by a ten-line stack machine as the sliders move. Nothing else can run.
- **Links and pictures** never go to `javascript:`, `vbscript:` or `file:`, and to `data:` only for an image. The address is read the way a browser reads it, so `java<tab>script:` is caught too.
- **No style attributes.** The core's HTML draws amounts as SVG and classes, so a strict `style-src` holds.

A test fills every attribute of every component with 17 attacks and puts raw `<script>`, `<iframe>`, `<style>` and handlers in the text, and the HTML must come out with none of them. It runs on every change.

## Nothing loads that you didn't choose

- **Pictures** load only from the hosts you list, or as `data:` images. Any other address, a model-written one included, shows the picture's description instead ([Pictures, icons and maps](/docs/format/media)).
- **Map tiles** come only from your own map provider, on your key. Without one, a map is its pins on a plain ground and nothing loads.
- **Video and audio** fetch nothing until the reader presses play.
- **An embed** (YouTube through youtube-nocookie.com, Vimeo, Spotify) is a link until the reader taps it, then loads in a sandboxed frame.
- **The camera, location, signatures and files** start only when the reader uses them, and the browser asks first.
- **The SDK sends nothing of its own:** no analytics, no telemetry. It fetches the core from wherever you say, and `connectAgent` talks only to the address you give it.

## A content security policy

A page that draws answers with the web SDK works under this policy, which we test with every component:

```http title="Content-Security-Policy"
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self';
img-src 'self' data: <your image hosts> <your map provider>;
media-src <your video and audio hosts>;
font-src 'self';
connect-src 'self';
frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com;
object-src 'none';
base-uri 'none'
```

`'wasm-unsafe-eval'` lets the core's WebAssembly start; it doesn't allow JavaScript `eval`. A theme applied with `@morphscreen/web/theme` adds a `<style>` element, so allow it with a nonce. A live map with MapLibre needs `worker-src 'self'`, and Google's tiles need `connect-src https://tile.googleapis.com`.

## What we keep

No prompt, no answer, no IP address, no API key.

- **Each call leaves one line:** when, how long, the endpoint, the model asked for and the one that answered, how it ended, whether the answer was valid and repaired, its error classes by component, the system prompt's version, and what the model cost. None of the conversation.
- **Debug logs** are the one exception, and they're opt-in per project: prompts and answers, deleted after 7 days.
- **Your MorphScreen keys** are kept as a <span class="nb">SHA-256</span> hash and their first 12 characters, so a key can be checked and shown as `ms_live_ab12...`, never read back.
- **Your OpenRouter key** goes to OpenRouter and nowhere else: never stored, never logged, and taken out of any error text before it's passed on.
- **The model in your plan** runs on our OpenRouter key, only through providers that keep no prompts.

The [privacy notice](/privacy) and the [sub-processors](/subprocessors) have the rest. Found a problem? See [reporting a security problem](/security).
