// Your server's one route for the page: each AG-UI run goes on to MorphScreen
// with your key, and the events stream straight back. The key never reaches
// the browser, and the server, not the page, picks the model.
import { createServer } from "node:http";

const API = process.env.MORPHSCREEN_API ?? "https://api.morphscreen.com/v1";
const MODEL = process.env.MODEL ?? "deepseek/deepseek-v4.1-flash";

createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/api/agent") return res.writeHead(404).end();
  let body = "";
  for await (const chunk of req) body += chunk;
  const run = JSON.parse(body);
  run.forwardedProps = { ...run.forwardedProps, model: MODEL };
  const upstream = await fetch(`${API}/ui`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MorphScreen-Key": process.env.MORPHSCREEN_KEY },
    body: JSON.stringify(run),
  });
  res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream" });
  for await (const chunk of upstream.body) res.write(chunk);
  res.end();
}).listen(process.env.PORT ?? 3000);
