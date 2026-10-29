---
title: Introduction
description: MorphScreen lets a model answer with real UI. It reads the answer as it streams, checks every line against the components your app allows, and draws it on the page.
---

<figure class="doc-video">
<video data-src="/docs/media/intro.mp4" poster="/docs/media/intro.jpg" muted loop playsinline preload="none" aria-label="An answer about the planets streaming into a page with photos, a chart, products, a quiz, flashcards and a form, then a reader answering the quiz and turning a flashcard"></video>
<figcaption>A saved answer from DeepSeek V4 Flash to "Tell me about the planets in our solar system", unedited, streaming through the web SDK at the pace the model wrote it, then a reader using it; the scrolls between are cut. The photos it asked for are NASA's, public domain, put in for this video and credited under each.</figcaption>
</figure>

A model writes its answer as Markdown with a few tags, like `<Card>`, `<Chart>`, `<Quiz>` and `<Form>`. MorphScreen's core reads that text as it arrives, checks each line against the components your app allows, and hands your page something it can draw at once. When a line breaks a rule, the API asks the same model to fix only that line.

[Get a key and make a first call](/docs/quickstart), or [see every component](/docs/components) drawn live.

## How it works

<div class="doc-figure" tabindex="0" role="region" aria-label="How it works: your server sends the conversation to the MorphScreen API, which runs the model, checks and repairs the answer as it streams, and your page draws it with the web SDK.">
<svg viewBox="0 0 720 150" fill="none" aria-hidden="true" focusable="false">
<rect x="1" y="35" width="170" height="80" rx="14" class="dg-box"/>
<text x="86" y="70" text-anchor="middle" class="dg-title">Your server</text>
<text x="86" y="92" text-anchor="middle" class="dg-text">the conversation</text>
<rect x="275" y="15" width="170" height="120" rx="14" class="dg-box dg-box--on"/>
<text x="360" y="48" text-anchor="middle" class="dg-title">MorphScreen API</text>
<text x="360" y="72" text-anchor="middle" class="dg-text">runs the model</text>
<text x="360" y="92" text-anchor="middle" class="dg-text">checks every line</text>
<text x="360" y="112" text-anchor="middle" class="dg-text">repairs what breaks</text>
<rect x="549" y="35" width="170" height="80" rx="14" class="dg-box"/>
<text x="634" y="70" text-anchor="middle" class="dg-title">Your page</text>
<text x="634" y="92" text-anchor="middle" class="dg-text">draws it as it streams</text>
<path d="M175 75h94" class="dg-line"/><path d="M262 69l8 6-8 6" class="dg-line"/>
<path d="M449 75h94" class="dg-line"/><path d="M536 69l8 6-8 6" class="dg-line"/>
</svg>
</div>

:::steps
### Get a key

Sign up with your email or GitHub. The account comes with a project and its first key.

### Send the chat call you already make

The API speaks OpenAI's chat completions. Point your server's call at `https://api.morphscreen.com/v1`, add the `X-MorphScreen-Key` header, and keep the key on your server.

### Draw what comes back

The web SDK draws the answer while it streams, with plain DOM or React. On a server, `/v1/render` turns a finished answer into HTML that needs no JavaScript.

### Let the reader act

Buttons, forms, quizzes and polls come back to your app as actions. You decide what happens next, usually the model's next turn.
:::

## What's in MorphScreen

:::cards
- [The format](/docs/format): Markdown with tags, written so half an answer is always a valid start of the whole one.
- [75 components](/docs/components): layout, charts, forms and buttons in the core, and eight packs for data, shopping, scheduling, media, docs, inputs, interaction and the device.
- [Validation and repair](/docs/format/validation): every line checked against your app's catalog, and only the broken lines sent back to the model.
- [Your own components](/docs/format/custom-components): describe them once, and the model, the checks and the renderer all know them.
- [Agents](/docs/agents): the API speaks AG-UI, and `connectAgent` holds a whole conversation with any AG-UI agent.
- [Production](/docs/production): plans and limits, errors you can act on, a dashboard of every call, and nothing of the conversation kept.
:::

## Integrations

The web SDK works with any framework: [React](/docs/integrations/react), [Next.js](/docs/integrations/nextjs), [Vue and Nuxt](/docs/integrations/vue), [Svelte and SvelteKit](/docs/integrations/svelte), [Angular](/docs/integrations/angular), [webpack](/docs/integrations/webpack) and [plain JavaScript](/docs/integrations/vanilla). Each page's code is a small app we install, build and run in Chrome before every release, so the snippets work as written. Your server can be [Node.js](/docs/integrations/node), [Python](/docs/integrations/python) or anything that speaks HTTP.
