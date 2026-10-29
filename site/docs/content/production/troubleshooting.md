---
title: Troubleshooting
description: The usual problems and their fixes: nothing draws, pictures don't show, a 401 or a 402, a stream that stops, and answers that keep failing.
---

## Nothing draws

- **The core didn't load.** `loadCore` fetches the `.wasm` file from the address you give it; open that address in the browser. It should be served as `application/wasm`. Each [integration](/docs/integrations) shows where to put it.
- **A content security policy blocks it.** WebAssembly needs `'wasm-unsafe-eval'` in `script-src` ([Security](/docs/production/security)).
- **The stylesheet is missing.** Import `@morphscreen/web/morphscreen.css` once on the page.
- **The packs differ.** Give the page the same `packs` and custom components as the API, or the page can't read what the model was allowed to write.

## A picture shows only its description

That's the SDK refusing a host you didn't list. Add the host to `imageHosts` if you trust it. A picture the model asked for with `find` and that nothing matched shows its description too, on purpose.

## A map is pins on a plain ground

There's no map provider. Pass `maps` with your provider and key ([Pictures, icons and maps](/docs/format/media)).

## 401

`morphscreen_key_invalid` means the key is wrong or revoked; `openrouter_key_invalid` means OpenRouter turned down the key in `Authorization`. Any bearer token is taken as an OpenRouter key, so don't put your MorphScreen key there. With OpenAI's SDK on the included model, turn its `Authorization` header off ([OpenAI-compatible clients](/docs/agents/openai-compatible)).

## 402 or 429

A limit was reached; [Limits and errors](/docs/production/limits) says which one by its `type`, and a 429's `Retry-After` says how long to wait.

## A stream stops part way

A reverse proxy in front of your route may be holding the stream. Turn off buffering for that route (`X-Accel-Buffering: no` for nginx, `flush_interval -1` for Caddy), and don't compress `text/event-stream`. An answer that hit the model's token limit ends as truncated, and the SDK draws it as cut off.

## Answers keep failing

Look at the calls on the dashboard: which components had errors, and what repair did. A small model makes more mistakes; fewer packs make a shorter prompt and fewer ways to slip. Turn on debug logs for a day to see exactly what was written.
