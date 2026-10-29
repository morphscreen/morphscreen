"use client";

import { useEffect, useState } from "react";
import { loadCore, type Core } from "@morphscreen/web";
import { Answer } from "@morphscreen/web/react";
import { SAMPLE } from "./sample";

export function LiveAnswer() {
  const [core, setCore] = useState<Core | null>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    loadCore("/morphscreen.wasm").then(setCore);
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
