// Two routes for the page in Express 5: /api/agent carries connectAgent's
// runs on to /v1/ui, and /api/chat streams /v1/chat/completions for a chat
// UI of your own. The key stays on the server, and the server picks the model.
import express from "express";
import { Readable } from "node:stream";

const API = process.env.MORPHSCREEN_API ?? "https://api.morphscreen.com/v1";
const MODEL = process.env.MODEL ?? "deepseek/deepseek-v4.1-flash";
const HEADERS = { "Content-Type": "application/json", "X-MorphScreen-Key": process.env.MORPHSCREEN_KEY };

const app = express();
app.use(express.json({ limit: "1mb" }));

// Sends the body on and streams the answer back. When the reader leaves, the
// call to MorphScreen stops too, so no model keeps writing for nobody.
async function relay(req, res, path, body) {
  const stop = new AbortController();
  res.on("close", () => stop.abort());
  const upstream = await fetch(`${API}${path}`, { method: "POST", headers: HEADERS, body: JSON.stringify(body), signal: stop.signal });
  res.status(upstream.status).type(upstream.headers.get("content-type") ?? "text/event-stream");
  Readable.fromWeb(upstream.body).pipe(res);
}

app.post("/api/agent", (req, res) => relay(req, res, "/ui", { ...req.body, forwardedProps: { ...req.body.forwardedProps, model: MODEL } }));

app.post("/api/chat", (req, res) => relay(req, res, "/chat/completions", { model: MODEL, stream: true, messages: req.body.messages }));

app.listen(process.env.PORT ?? 3000);
