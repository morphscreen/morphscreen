---
title: Python
description: Call MorphScreen from Python with only the standard library: carry a page's AG-UI runs, stream an answer's text, or render a finished answer as HTML.
---

Nothing to install: these use only Python's standard library. Keep `MORPHSCREEN_KEY` in the server's environment; it never goes to the page.

## A route for the page

The page's `connectAgent` sends its runs to your route, which adds the key and the model and streams the events back:

```python file="site/docs/snippets/agent_proxy.py" title="server.py"
```

In FastAPI, Flask or Django the route does the same: read the run, set `forwardedProps["model"]`, POST it to MorphScreen's `/v1/ui`, and stream the response body back with its status and content type, without buffering it.

## The answer's text, or HTML

```python file="site/docs/snippets/stream_answer.py" title="morphscreen.py"
```

```python title="Using it"
from morphscreen import render_html, stream_answer

text = "".join(stream_answer([{"role": "user", "content": "Make me a sales dashboard"}]))
html, verdict = render_html(text)
```

Both are what our tests run against a recorded answer.

## With OpenAI's SDK

On your own OpenRouter key, OpenAI's Python SDK works with a new `base_url` and the `X-MorphScreen-Key` header ([OpenAI-compatible clients](/docs/agents/openai-compatible)). For the model in your plan, use the functions above: any `Authorization` header is taken as an OpenRouter key.
