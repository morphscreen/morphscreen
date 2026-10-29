"""An AG-UI agent on LangGraph that answers in MorphScreen.

The graph is one node: the model, with MorphScreen's system prompt (from the
core: `mscore prompt`) and what the reader has done in earlier answers. The
protocol's own LangGraph adapter (ag-ui-langgraph) serves it over AG-UI, and
the same server hands out the web SDK's example chat page, so

    python examples/langgraph/agent.py

and http://127.0.0.1:8123/example/agent.html is a conversation that streams
into the web SDK; the SwiftUI and Compose SDKs connect to
http://127.0.0.1:8123/agent the same way.

The reader's quiz answers, ticks and typed fields come back with every run as
the shared state's `morphscreen` key (by message and node); LangGraph keeps it
in the graph state and sends it back with each STATE_SNAPSHOT.

Environment:
  MORPHSCREEN_AGENT_MODEL   an OpenRouter model id (default: Nemotron 3 Ultra,
                            free), or "script" for a scripted model that needs
                            no network (the tests use it)
  OPENROUTER_API_KEY        or ~/.config/openrouter/env with that line
  MSCORE                    the core's CLI (default: rust/target.nosync/release/mscore)
  PORT                      default 8123
"""

import json
import os
import subprocess
from pathlib import Path
from typing import Any, Optional, TypedDict

import uvicorn
from ag_ui_langgraph import LangGraphAgent, add_langgraph_fastapi_endpoint
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from langchain_core.language_models.fake_chat_models import GenericFakeChatModel
from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, MessagesState, StateGraph

REPO = Path(__file__).resolve().parents[2]
PACKS = "interactive,inputs,data"
MODEL = os.environ.get("MORPHSCREEN_AGENT_MODEL", "nvidia/nemotron-3-ultra-550b-a55b:free")


def system_prompt() -> str:
    mscore = os.environ.get("MSCORE", str(REPO / "rust/target.nosync/release/mscore"))
    return subprocess.run([mscore, "prompt", "--packs", PACKS], check=True, capture_output=True, text=True).stdout


def api_key() -> str:
    if os.environ.get("OPENROUTER_API_KEY"):
        return os.environ["OPENROUTER_API_KEY"]
    for line in (Path.home() / ".config/openrouter/env").read_text().splitlines():
        k, _, v = line.partition("=")
        if k.strip().removeprefix("export ").strip() == "OPENROUTER_API_KEY":
            return v.strip().strip("'\"")
    raise SystemExit("no OPENROUTER_API_KEY")


# What the scripted model says: a lesson the first time, then a short reply
# that shows it read the quiz result.
LESSON = (REPO / "test/fixtures/interactive.md").read_text()
FOLLOW_UP = '<Callout tone="success" title="Nice work">\nYou got the quiz back to me. **Respiration** is next.\n</Callout>\n'


def model(messages):
    if MODEL == "script":
        last = next((m.content for m in reversed(messages) if m.type == "human"), "")
        return GenericFakeChatModel(messages=iter([AIMessage(FOLLOW_UP if str(last).startswith("I finished the quiz") else LESSON)]))
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(model=MODEL, base_url="https://openrouter.ai/api/v1", api_key=api_key(), streaming=True, temperature=0.4, max_tokens=4000)


class State(MessagesState):
    # The components' state, kept by the app and sent with every run.
    morphscreen: Optional[dict[str, Any]]


class Shared(TypedDict, total=False):
    morphscreen: Optional[dict[str, Any]]


PROMPT = system_prompt()


async def answer(state: State, config: RunnableConfig):
    prompt = PROMPT
    done = state.get("morphscreen")
    if done:
        prompt += (
            "\n\nWhat the reader has done in your earlier answers, by message id and component node id "
            "(Quiz answers and Checklist done are indices into its items, Flashcards known are card indices):\n"
            + json.dumps(done, separators=(",", ":"))
        )
    reply = await model(state["messages"]).ainvoke([SystemMessage(prompt), *state["messages"]], config)
    return {"messages": [reply]}


# The shared state the app sees is the components' state; the messages
# travel as messages.
graph_builder = StateGraph(State, output_schema=Shared)
graph_builder.add_node("answer", answer)
graph_builder.add_edge(START, "answer")
graph_builder.add_edge("answer", END)
graph = graph_builder.compile(checkpointer=MemorySaver())

app = FastAPI()
# Without the raw LangGraph events riding along, an answer's stream is its text.
add_langgraph_fastapi_endpoint(app, LangGraphAgent(name="morphscreen", graph=graph, emit_raw_events=False), "/agent")
# The web SDK and its example page, from the same origin.
app.mount("/", StaticFiles(directory=REPO / "sdk/web"), name="web")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8123")), log_level="warning")
