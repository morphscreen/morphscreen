// The page's route in Hono: each AG-UI run goes on to MorphScreen with your
// key, and the events stream straight back. Shown on Node.js; on Bun, Deno or
// Cloudflare Workers, export the app instead of calling serve.
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const API = process.env.MORPHSCREEN_API ?? "https://api.morphscreen.com/v1";
const MODEL = process.env.MODEL ?? "deepseek/deepseek-v4.1-flash";

const app = new Hono();

app.post("/api/agent", async (c) => {
  const run = await c.req.json();
  run.forwardedProps = { ...run.forwardedProps, model: MODEL };
  const upstream = await fetch(`${API}/ui`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MorphScreen-Key": process.env.MORPHSCREEN_KEY },
    body: JSON.stringify(run),
    // The reader leaving stops the call too.
    signal: c.req.raw.signal,
  });
  return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream" } });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
