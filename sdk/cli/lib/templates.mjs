// The files init writes into a Next.js App Router app: a route that keeps
// the key on the server, a chat page at /morphscreen, and the script that
// copies the core where the browser can fetch it. The same shape as the
// starter (github.com/morphscreen/starter-nextjs), which runs end to end.

export const ROUTE = `// MorphScreen: the page's AG-UI runs go on to the API with your key, and the
// events stream straight back. The key never reaches the browser, and the
// server picks the model.
const API = process.env.MORPHSCREEN_API ?? "https://api.morphscreen.com/v1";
const MODEL = process.env.MORPHSCREEN_MODEL ?? "deepseek/deepseek-v4.1-flash";

export async function POST(req__TYPE__) {
  const run = await req.json();
  run.forwardedProps = { ...run.forwardedProps, model: MODEL };
  const upstream = await fetch(\`\${API}/ui\`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MorphScreen-Key": process.env.MORPHSCREEN_KEY ?? "" },
    body: JSON.stringify(run),
    // The reader leaving stops the call too.
    signal: req.signal,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream", "X-Accel-Buffering": "no" },
  });
}
`;

export const CHAT = `"use client";

import { useEffect, useRef, useState } from "react";
import { connectAgent, loadCore__CONVERSATION_IMPORT__ } from "@morphscreen/web";

// MorphScreen: connectAgent holds the conversation, draws each answer as it
// streams, and sends buttons and forms in an answer back as the next turn.
// The core runs in the browser only, so it loads in an effect.
export function MorphScreenChat() {
  const element = useRef__DIV__(null);
  const [chat, setChat] = useState__CONVERSATION__(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live;
    let gone = false;
    loadCore("/morphscreen-agent.wasm").then((core) => {
      if (gone) return;
      live = connectAgent(element.current__BANG__, { core, url: "/api/morphscreen" });
      setChat(live);
    });
    return () => {
      gone = true;
      live?.destroy();
    };
  }, []);

  async function send(e__FORM__) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("message")__AS_INPUT__;
    const text = input.value;
    input.value = "";
    setBusy(true);
    try {
      await chat?.send(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div ref={element} />
      <form onSubmit={send}>
        <input name="message" placeholder="Ask anything" aria-label="Your message" required />
        <button disabled={!chat || busy}>Send</button>
      </form>
    </div>
  );
}
`;

export const PAGE = `import "@morphscreen/web/morphscreen.css";
import { MorphScreenChat } from "./chat";

// MorphScreen's chat, at /morphscreen. Move <MorphScreenChat /> wherever your
// app wants it, and the stylesheet's import with it (or into app/layout).
export default function Page() {
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
      <MorphScreenChat />
    </main>
  );
}
`;

export const COPY_CORE = `// MorphScreen: copies the core out of the package into public/, where the app
// serves it and loadCore("/morphscreen-agent.wasm") fetches it. Runs before
// dev and build.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
mkdirSync("public", { recursive: true });
copyFileSync(require.resolve("@morphscreen/web/morphscreen-agent.wasm"), "public/morphscreen-agent.wasm");
`;

/** The template in TypeScript or JavaScript. */
export function typed(text, ts) {
  const t = {
    __TYPE__: ts ? ": Request" : "",
    __CONVERSATION_IMPORT__: ts ? ", type Conversation" : "",
    __DIV__: ts ? "<HTMLDivElement>" : "",
    __CONVERSATION__: ts ? "<Conversation | null>" : "",
    __BANG__: ts ? "!" : "",
    __FORM__: ts ? ": React.FormEvent<HTMLFormElement>" : "",
    __AS_INPUT__: ts ? " as HTMLInputElement" : "",
  };
  let out = text;
  for (const [k, v] of Object.entries(t)) out = out.replaceAll(k, v);
  if (ts) out = out.replace("    let live;\n", "    let live: Conversation | undefined;\n");
  return out;
}
