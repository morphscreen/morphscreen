// An answer's text as it streams, and a finished answer as HTML. Run it on
// your server (Node 18 or later): the key stays there.
const API = process.env.MORPHSCREEN_API ?? "https://api.morphscreen.com/v1";
const HEADERS = { "Content-Type": "application/json", "X-MorphScreen-Key": process.env.MORPHSCREEN_KEY };

/** Yields the answer's text, piece by piece, as the model writes it. */
export async function* streamAnswer(messages, model = "deepseek/deepseek-v4.1-flash") {
  const res = await fetch(`${API}/chat/completions`, { method: "POST", headers: HEADERS, body: JSON.stringify({ model, stream: true, messages }) });
  if (!res.ok) throw new Error(`MorphScreen ${res.status}: ${await res.text()}`);
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let end;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      for (const choice of JSON.parse(line.slice(6)).choices ?? []) if (choice.delta?.content) yield choice.delta.content;
    }
  }
}

/** A finished answer drawn by the core as HTML, with its verdict. */
export async function renderHtml(text) {
  const res = await fetch(`${API}/render`, { method: "POST", headers: HEADERS, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`MorphScreen ${res.status}: ${await res.text()}`);
  const { html, morphscreen } = await res.json();
  return { html, verdict: morphscreen };
}
