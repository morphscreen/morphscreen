// The page's AG-UI runs go on to MorphScreen with your key, and the events
// stream straight back. The key never reaches the browser, and the server
// picks the model.
export async function POST(req: Request) {
  const run = await req.json();
  run.forwardedProps = { ...run.forwardedProps, model: "deepseek/deepseek-v4.1-flash" };
  const upstream = await fetch("https://api.morphscreen.com/v1/ui", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MorphScreen-Key": process.env.MORPHSCREEN_KEY ?? "" },
    body: JSON.stringify(run),
  });
  return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream" } });
}
