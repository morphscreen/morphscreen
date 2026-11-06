import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { connectAgent, loadCore, type Conversation } from "@morphscreen/web";
import "@morphscreen/web/morphscreen.css";
import coreUrl from "@morphscreen/web/morphscreen-agent.wasm?url";

// Loaded once for the page: the core is about 250 KB compressed.
const core = loadCore(coreUrl);

function Chat() {
  const element = useRef<HTMLDivElement>(null);
  const [chat, setChat] = useState<Conversation | null>(null);
  const [busy, setBusy] = useState(false);

  // connectAgent holds the conversation: what the reader types, each answer
  // as it streams, and buttons and forms sent back as the next turn.
  useEffect(() => {
    let live: Conversation | undefined;
    let gone = false;
    core.then((c) => {
      if (gone) return;
      live = connectAgent(element.current!, { core: c, url: "/api/agent" });
      setChat(live);
    });
    return () => {
      gone = true;
      live?.destroy();
    };
  }, []);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("message") as HTMLInputElement;
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
    <main>
      <div ref={element} />
      <form onSubmit={send}>
        <input name="message" placeholder="Ask anything" aria-label="Your message" required />
        <button disabled={!chat || busy}>Send</button>
      </form>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Chat />);
