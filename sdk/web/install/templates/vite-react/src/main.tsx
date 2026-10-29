import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadCore, type Core } from "@morphscreen/web";
import { Answer } from "@morphscreen/web/react";
import "@morphscreen/web/morphscreen.css";
import wasm from "@morphscreen/web/morphscreen.wasm?url";
import { SAMPLE } from "./sample";

function App() {
  const [core, setCore] = useState<Core | null>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    loadCore(wasm).then(setCore);
  }, []);
  // Your server's stream goes here; this grows a saved answer piece by piece.
  useEffect(() => {
    if (!core) return;
    let n = 0;
    const t = setInterval(() => {
      n += 24;
      setText(SAMPLE.slice(0, n));
      if (n >= SAMPLE.length) clearInterval(t);
    }, 10);
    return () => clearInterval(t);
  }, [core]);
  const done = text.length >= SAMPLE.length;
  return core ? <Answer core={core} text={text} done={done} /> : null;
}

createRoot(document.getElementById("root")!).render(<App />);
