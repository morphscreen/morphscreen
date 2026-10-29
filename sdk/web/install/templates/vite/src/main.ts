import { createAnswer, loadCore } from "@morphscreen/web";
import "@morphscreen/web/morphscreen.css";
import wasm from "@morphscreen/web/morphscreen.wasm?url";
import { SAMPLE } from "./sample";

const core = await loadCore(wasm);
const answer = createAnswer(document.querySelector<HTMLElement>("#answer")!, { core });

// Your server's stream goes here; this feeds a saved answer in pieces.
for (let i = 0; i < SAMPLE.length; i += 24) {
  answer.push(SAMPLE.slice(i, i + 24));
  await new Promise((r) => setTimeout(r, 10));
}
answer.end();
