---
title: Going to production
description: What to have in place before real readers use it: the key on your server, limits you've planned for, errors you handle, and the dashboard to watch.
---

## Before you launch

- **The key stays on your server.** Your page talks to your own route, and the route adds `X-MorphScreen-Key`. A key in a page is a key anyone can copy. If one leaks, revoke it on the dashboard and make another.
- **Your server picks the model and the packs.** Don't pass them through from the page as they come, or a reader can choose a model that costs you more.
- **Plan for the limits.** Each plan has calls a month, requests a minute and answers at once ([Limits and errors](/docs/production/limits)). Paid plans carry on past the month as extra calls; the free plan stops.
- **Handle each error by its type.** A 429 says how long to wait. A 402 says what ran out. Show the reader something useful, not a stack trace.
- **Allow what the page loads.** A content security policy needs `'wasm-unsafe-eval'` for the core, and the hosts your pictures, maps and media come from ([Security](/docs/production/security)).
- **Watch the first days.** The dashboard shows every call: how it ended, how long it took, whether the answer was valid, and what repair did.

## What we keep

A line for each call: when, which key, how long, the model, how it ended, whether the answer was valid and what repair did. Never the prompt or the answer, unless you turn on debug logs for a project, which keeps them for 7 days. [Security](/docs/production/security) has the whole list.

## When something's wrong

The [status page](https://status.morphscreen.com) shows whether the API answers, checked every minute, with its uptime and answer times. Write to [support@morphscreen.com](mailto:support@morphscreen.com); [Troubleshooting](/docs/production/troubleshooting) covers the usual problems.
