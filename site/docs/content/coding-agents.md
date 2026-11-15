---
title: Coding agent setup
description: Point Claude Code, Cursor, Codex or any coding agent at MorphScreen's docs, written for agents to read.
---

Every page of these docs is also plain Markdown, and the whole set is one file. Give your coding agent either, and it can write MorphScreen code from the real reference instead of guessing.

## The MorphScreen skill

A skill that knows how to add MorphScreen to an app: when it fits, the pieces, the recipes for Next.js and React with Vite, your own components, and every mistake we've seen with its fix. In Claude Code:

```sh title="Terminal"
claude plugin marketplace add morphscreen/skills
claude plugin install morphscreen@morphscreen
```

For Codex, copy `plugins/morphscreen/skills/morphscreen` from [github.com/morphscreen/skills](https://github.com/morphscreen/skills) into `~/.codex/skills/`. Then ask for what you want, like "add a chat to this app whose answers come back as charts and tables".

## The docs, for agents

| What | Where |
|---|---|
| An index of every page, with links | [morphscreen.com/llms.txt](/llms.txt) |
| Every page in one file | [morphscreen.com/llms-full.txt](/llms-full.txt) |
| One page | its address with `.md` added, like [/docs/quickstart.md](/docs/quickstart.md) |

Every page also has **Copy Markdown** under its title, for pasting into a chat.

## A rule for your project

Add this to your agent's instructions file (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules`):

```markdown title="AGENTS.md"
## MorphScreen

This app draws model answers with MorphScreen (@morphscreen/web).
- Docs: https://morphscreen.com/llms.txt (read the page you need as .md).
- Keep the MorphScreen key on the server; the page talks to our own route.
- Components and their attributes: https://morphscreen.com/docs/components.md
- Never render model text as HTML yourself; the SDK or /v1/render draws it.
```

## Asking for UI

The model your app uses is told about the components by the system prompt the API builds. Your coding agent doesn't need to know them to build the app, only to write [your own components](/docs/format/custom-components) or to check an answer by hand.
