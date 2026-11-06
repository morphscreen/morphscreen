// A LangChain.js model answering in MorphScreen's format: any chat model
// LangChain has, given MorphScreen's system prompt. The page draws the text
// with the web SDK, whose core checks each line as it arrives.
import { SystemMessage } from "@langchain/core/messages";

const API = process.env.MORPHSCREEN_API ?? "https://api.morphscreen.com/v1";

/** MorphScreen's system prompt for these packs. Fetch it once at start: it isn't counted as a call. */
export async function morphscreenPrompt(packs = ["data", "inputs", "interactive"]) {
  const res = await fetch(`${API}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MorphScreen-Key": process.env.MORPHSCREEN_KEY },
    body: JSON.stringify({ packs }),
  });
  if (!res.ok) throw new Error(`MorphScreen ${res.status}: ${await res.text()}`);
  return (await res.json()).prompt;
}

/** Yields the answer's text, piece by piece, from any LangChain chat model. */
export async function* streamAnswer(model, prompt, messages) {
  for await (const chunk of await model.stream([new SystemMessage(prompt), ...messages])) {
    if (typeof chunk.content === "string" && chunk.content) yield chunk.content;
  }
}
