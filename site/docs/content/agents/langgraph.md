---
title: LangGraph
description: A LangGraph agent that answers in MorphScreen, served over AG-UI with the protocol's own LangGraph adapter, and drawn in the page with connectAgent.
---

A LangGraph graph answers in our format when its model gets MorphScreen's system prompt, and the protocol's own adapter (`ag-ui-langgraph`) serves it over AG-UI for `connectAgent`. The code below is condensed from the example we run in CI, where a scripted model stands in so it needs no network.

## The agent

```python title="agent.py"
import json, os, urllib.request
from typing import Any, Optional, TypedDict

from ag_ui_langgraph import LangGraphAgent, add_langgraph_fastapi_endpoint
from fastapi import FastAPI
from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, MessagesState, StateGraph

PACKS = ["interactive", "inputs", "data"]
# MorphScreen's system prompt for those packs, fetched once at start (not counted as a call).
_ask = urllib.request.Request(
    "https://api.morphscreen.com/v1/prompt",
    data=json.dumps({"packs": PACKS}).encode(),
    headers={"X-MorphScreen-Key": os.environ["MORPHSCREEN_KEY"], "Content-Type": "application/json"},
)
PROMPT = json.load(urllib.request.urlopen(_ask))["prompt"]


class State(MessagesState):
    # What the reader did in earlier answers, by message and node: the page sends it with every run.
    morphscreen: Optional[dict[str, Any]]


class Shared(TypedDict, total=False):
    morphscreen: Optional[dict[str, Any]]


model = ChatOpenAI(model="deepseek/deepseek-v4-flash", base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"], streaming=True)


async def answer(state: State, config):
    prompt = PROMPT
    if state.get("morphscreen"):
        prompt += "\n\nWhat the reader has done in your earlier answers, by message id and node id:\n" + json.dumps(state["morphscreen"])
    reply = await model.ainvoke([SystemMessage(prompt), *state["messages"]], config)
    return {"messages": [reply]}


builder = StateGraph(State, output_schema=Shared)
builder.add_node("answer", answer)
builder.add_edge(START, "answer")
builder.add_edge("answer", END)
graph = builder.compile(checkpointer=MemorySaver())

app = FastAPI()
add_langgraph_fastapi_endpoint(app, LangGraphAgent(name="morphscreen", graph=graph, emit_raw_events=False), "/agent")
```

With `emit_raw_events=False` an answer's stream is just its text, which is what the page reads.

```text title="requirements.txt"
ag-ui-langgraph[fastapi]==0.0.47
ag-ui-protocol==1.0.0
langgraph==1.2.16
langchain-core==1.6.12
langchain-openai==1.7.2
fastapi==0.143.3
uvicorn==0.54.0
```

## The page

```ts title="main.ts"
const core = await loadCore("/morphscreen-agent.wasm");
const chat = connectAgent(document.querySelector<HTMLElement>("#chat")!, { core, url: "/agent", packs: ["interactive", "inputs", "data"] });
await chat.send("Quiz me on photosynthesis");
```

## What we check

The check sends a message, ticks a box, answers the quiz, checks that the tick arrives in LangGraph's state, and reloads to see the conversation come back.
