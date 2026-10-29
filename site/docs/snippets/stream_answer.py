# An answer's text as it streams, and a finished answer as HTML, with nothing
# but the standard library. Run it on your server: the key stays there.
import json
import os
import urllib.request

API = os.environ.get("MORPHSCREEN_API", "https://api.morphscreen.com/v1")
HEADERS = {"Content-Type": "application/json", "X-MorphScreen-Key": os.environ.get("MORPHSCREEN_KEY", "")}


def stream_answer(messages, model="deepseek/deepseek-v4.1-flash"):
    """Yields the answer's text, piece by piece, as the model writes it."""
    body = json.dumps({"model": model, "stream": True, "messages": messages}).encode()
    req = urllib.request.Request(f"{API}/chat/completions", data=body, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req) as res:
        for line in res:
            line = line.decode().strip()
            if not line.startswith("data: ") or line == "data: [DONE]":
                continue
            for choice in json.loads(line[6:]).get("choices", []):
                text = (choice.get("delta") or {}).get("content")
                if text:
                    yield text


def render_html(text):
    """A finished answer drawn by the core as HTML, with its verdict."""
    req = urllib.request.Request(f"{API}/render", data=json.dumps({"text": text}).encode(), headers=HEADERS, method="POST")
    with urllib.request.urlopen(req) as res:
        out = json.load(res)
    return out["html"], out["morphscreen"]
