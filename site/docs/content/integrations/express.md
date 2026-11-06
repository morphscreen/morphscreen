---
title: Express
description: Two Express routes for MorphScreen, one for connectAgent's runs and one that streams chat completions for a chat UI of your own, with the key kept on the server.
---

```sh pm
npm install express
```

Express 5 on Node 18 or later. Keep `MORPHSCREEN_KEY` in the server's environment; it never goes to the page.

## The routes

```js file="site/docs/snippets/express-proxy.mjs" title="server.mjs"
```

- **`/api/agent`** is for [`connectAgent`](/docs/quickstart#draw-the-conversation): the page sends each run, the route sets the model and passes the run to `/v1/ui`, and the AG-UI events stream back as they come.
- **`/api/chat`** is for a chat UI of your own: it sends the conversation to `/v1/chat/completions` and passes the server-sent events through. Draw each answer with `createAnswer` or [`<Answer>`](/docs/integrations/react), and read the last chunk for the verdict and a repair ([Validation and repair](/docs/format/validation)).

You only need the one your page uses.

## Notes

- **The page's body limit.** A run carries the conversation so far, so `express.json` gets a 1 MB limit; raise it for long conversations.
- **Stopping.** When the reader closes the tab, `res` closes and the call to MorphScreen is aborted, so the model stops writing.
- **Errors pass through.** MorphScreen's status and its JSON error reach the page unchanged: a 401 for a wrong key, a 429 with its wait ([Limits and errors](/docs/production/limits)).

We run this file in CI against a recorded answer: a page with `connectAgent` draws it through `/api/agent`, and `/api/chat` streams it back whole.
