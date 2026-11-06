---
title: We ran OpenUI's own benchmark. Here's where we lose.
description: MorphScreen against the open-source OpenUI library on the benchmark OpenUI publishes: the same briefs, models and rules, 64 measures, and the four where OpenUI is ahead.
date: 2026-11-06
keywords: generative UI, OpenUI, benchmark, LLM, accessibility, prompt tokens
---

On OpenUI's own public benchmark, MorphScreen is ahead on 37 of 64 measures, even on 23 and behind on 4. All four losses are answer length: our answers run about 39% longer (1,268 tokens against 913). The biggest wins are small models (66.3% valid answers against 31.5% for Nemotron 3 Nano 30B), prompt size (2,954 tokens against 14,041) and accessibility (0 axe violations against 599).

:::figure 64 measures, with the same briefs, models, providers and rules for both. Drawn by MorphScreen from the table in this post.
<Chart type="donut" title="64 measures against OpenUI">
| Result | Measures |
|---|---|
| MorphScreen ahead | 37 |
| Even | 23 |
| OpenUI ahead | 4 |
</Chart>
:::

## Why their benchmark

When you build something in a space that already has a known project, the obvious question is "why not just use that?" For generative UI, that project is OpenUI. So instead of writing my own benchmark, I ran theirs.

Thesys publishes generative-ui-bench for OpenUI. I used the same briefs, the same models and providers, and the same rules for what counts as valid, and ran MorphScreen next to the open-source OpenUI library. Everything is on [morphscreen.com/benchmark](https://morphscreen.com/benchmark): the method, every raw answer and every row.

One thing up front: this is the open-source library, not Thesys's hosted OpenUI Cloud. I haven't measured that, so nothing here says anything about it.

## How a row counts

A lead only counts when it isn't chance. Where a row counts answers, a two-proportion test has to put the gap below p = 0.05, and timings within 10% of each other are even.

## What each format looks like

The same brief, a newsletter sign-up card, answered by DeepSeek V4 Flash in each format. These are the raw answers from the benchmark, unedited.

```markdown title="MorphScreen: Markdown with a few tags"
<Card title="The Week in Product" subtitle="One email, every Friday, with the best product thinking.">
  <Form name="newsletter-signup">
    <Input label="Email address" name="email" type="email" placeholder="you@example.com" required="true" hint="We'll never share your email" />
    <Button>Subscribe</Button>
    <Button variant="tertiary">No thanks</Button>
  </Form>
</Card>
```

```text title="OpenUI: OpenUI Lang"
root = Card([header, form])
header = CardHeader("The Weekly Build", "One email every Friday — a short rundown of the best product, design, and engineering reads we found this week. No fluff, no spam, unsubscribe anytime.")
form = Form("newsletter-signup", formButtons, [emailField])
emailField = FormControl("Email address", emailInput, "We'll only send you the newsletter, never anything else.")
emailInput = Input("email", "you@example.com", "email")
formButtons = Buttons([subscribeBtn])
subscribeBtn = Button("Subscribe", null, "primary")
```

:::figure The MorphScreen answer above, drawn by MorphScreen's core.
<Card title="The Week in Product" subtitle="One email, every Friday, with the best product thinking.">
  <Form name="newsletter-signup">
    <Input label="Email address" name="email" type="email" placeholder="you@example.com" required="true" hint="We'll never share your email" />
    <Button>Subscribe</Button>
    <Button variant="tertiary">No thanks</Button>
  </Form>
</Card>
:::

OpenUI Lang names each piece and wires them together, so a component can be used before it's written. MorphScreen nests tags in the order they're drawn, so each line can go on the page as soon as it's finished. [The demo](https://morphscreen.com/demo) draws both from the same answers side by side.

## Where we lose

All four of OpenUI's wins are answer length. With reasoning off and every component on, our answers run longer. Markdown with tags is less compact than OpenUI Lang, which was designed to be short, and you pay for that in output tokens on every answer.

:::figure Output tokens per answer, DeepSeek V4 Flash with reasoning off and every component on. Lower is better.
<Chart type="horizontal" title="Answer length, tokens">
| | Tokens |
|---|---|
| MorphScreen | 1268 |
| OpenUI | 913 |
</Chart>
:::

## Where it's even

Validity before repair, on the default setup (DeepSeek V4 Flash, reasoning off, every component): 87.0% each. On a capable model, both formats come out right most of the time.

## Where we're ahead

Small models. Nemotron 3 Nano 30B wrote a valid MorphScreen answer 66.3% of the time and a valid OpenUI one 31.5%, on the 46 briefs twice each. Models already know Markdown, so there's less to learn.

:::figure Nemotron 3 Nano 30B on the benchmark's 46 briefs, twice each. Higher is better.
<Chart type="horizontal" title="Valid answers from a 30B model, %">
| | Valid |
|---|---|
| MorphScreen | 66.3 |
| OpenUI | 31.5 |
</Chart>
:::

The prompt. With every component on both sides (our 75, the 63 in OpenUI's chat library), ours is a fifth the size. It goes with every call, so this is a cost on every answer.

:::figure The system prompt with every component, in tokens. Lower is better.
<Chart type="horizontal" title="System prompt, tokens">
| | Tokens |
|---|---|
| MorphScreen | 2954 |
| OpenUI | 14041 |
</Chart>
:::

After repair, 100% valid (184 of 184) against 84.8%. OpenUI's open-source SDK has no repair step, so this row is really "with repair against without".

Accessibility: 0 axe violations across 20 answers in Chrome, against 599. And in the browser, less work:

:::figure 20 answers streamed and drawn in Chrome. Lower is better on both.
<Columns>
<Chart type="horizontal" title="CPU to stream and draw, ms">
| | ms |
|---|---|
| MorphScreen | 1052 |
| OpenUI | 5566 |
</Chart>
<Chart type="horizontal" title="Time to first text, ms">
| | ms |
|---|---|
| MorphScreen | 71 |
| OpenUI | 138 |
</Chart>
</Columns>
:::

## Which to pick

If your answers are short and your model is big, the difference is small and OpenUI is a fine choice, especially if you want everything self-hosted. MorphScreen pulls ahead with small or cheap models, long prompts with many components, and pages that have to pass an accessibility check. [Generative UI SDKs compared](https://morphscreen.com/docs/comparison) puts both next to CopilotKit, the Vercel AI SDK, A2UI and others.

## Check it yourself

The benchmark code and every raw answer are in [the repository](https://github.com/morphscreen/morphscreen), and the [benchmark page](https://morphscreen.com/benchmark) has each row with its method. If you think a row is measured unfairly, open an issue and I'll rerun it.
