---
title: Questions and answers
description: Short answers about MorphScreen: what it is, which models and frameworks it works with, what it costs, how it compares, and what happens when a model gets the format wrong.
---

## What is MorphScreen?

MorphScreen lets a language model answer with UI instead of only text: charts, tables, cards, forms, quizzes and buttons. The model writes Markdown with a few tags, MorphScreen checks every line against the components your app allows as it streams, repairs lines that break a rule, and the web SDK draws the answer in your page.

## What is generative UI?

Generative UI is UI that a model composes for each answer, instead of a fixed screen a developer built ahead of time. Ask for a sales summary and get a dashboard; ask to book a table and get a form. [Rendering LLM output as UI](/docs/guides/llm-output-as-ui) compares the five common ways to build it.

## Which models work with it?

Any chat model on OpenRouter, with your own OpenRouter key, and the model included in every plan, which needs no model key. With your own code you can also give MorphScreen's system prompt to any model and draw its answer with the web SDK ([LangChain.js](/docs/agents/langchain) shows how).

## Which frameworks does it work with?

Any web framework, through one npm package, `@morphscreen/web`: React, Next.js, Vue and Nuxt, Svelte and SvelteKit, Angular, and plain JavaScript, with npm, pnpm, Yarn or bun ([Integrations](/docs/integrations)). On the server: Node.js, Express, Hono, Python, or any language that can make an HTTP request.

## Does it work in iOS and Android apps?

Not yet as released SDKs. The web SDK is the one we ship; SwiftUI and Jetpack Compose SDKs run on the same core in our tests and come after the web.

## Is it open source?

The core, the format and the SDKs are open source under Apache-2.0, at [github.com/morphscreen/morphscreen](https://github.com/morphscreen/morphscreen). The API, which adds repairs, the included model and metering, is a hosted service.

## What does it cost?

The free plan has {{plan:free:monthly}} calls a month, {{plan:free:included}} of them on our model. Build is ${{plan:build:usd_month}} a month for {{plan:build:monthly}} calls, and Scale is ${{plan:scale:usd_month}} a month for {{plan:scale:monthly}} ([Pricing](/pricing)).

## How is it different from OpenUI?

OpenUI's model writes OpenUI Lang, a language of its own; MorphScreen's writes Markdown with a few tags, which models already know, and every line is checked and repaired as it streams. We measured both on the benchmark OpenUI publishes, with the same briefs and models; the [benchmark page](/benchmark) has every number, including the rows where OpenUI is ahead.

## How is it different from CopilotKit?

CopilotKit connects an agent to your app's state and tools and draws what it does with your components. MorphScreen gives the model a format to compose UI in, answer by answer, from {{components:all}} components and your own ([MorphScreen vs CopilotKit](/docs/comparison/copilotkit)).

## What happens when the model gets the format wrong?

The core reads each line as it arrives. Where the intent is clear it's lenient: an unknown component becomes plain text and a bad value falls back to its default. Where it isn't, the line gets a diagnostic, and the API asks the same model to rewrite only the broken lines ([Validation and repair](/docs/format/validation)).

## Can a model run code in my page?

No. An answer can't carry scripts, inline styles or `javascript:` addresses, and pictures load only from hosts you allow ([Security](/docs/production/security)).

## Can the model use my own components?

Yes. Describe a component once, its name, attributes and what it's for, and the model can use it like the built-in ones; the core checks those uses too ([Your own components](/docs/format/custom-components)).

## Does it work with agent frameworks?

Yes. `connectAgent` in the page speaks AG-UI, so it works with an AG-UI agent such as LangGraph's ([AG-UI agents](/docs/agents/ag-ui), [LangGraph](/docs/agents/langgraph)), and the API speaks OpenAI's chat completions for any client written for OpenAI or OpenRouter ([OpenAI-compatible clients](/docs/agents/openai-compatible)).
