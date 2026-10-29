// MorphScreen's side: the web SDK, as an app uses it. Each piece goes to the
// answer as it arrives; the core reads only the new text.
import { createAnswer, loadCore } from "@morphscreen/web";
import { streams } from "./frame.js";

const el = document.getElementById("answer");
const core = await loadCore(el.dataset.core);
// An app's fonts are in before its answers stream, and so are this frame's,
// so a font arriving isn't counted as the answer moving. (OpenUI's theme
// names Inter without shipping it, so its side draws in the system's font.)
await Promise.all(["400 1em 'IBM Plex Sans'", "600 1em 'IBM Plex Sans'", "400 1em 'IBM Plex Mono'"].map((f) => document.fonts.load(f)));
let answer = null;
let fed = 0;
streams("ours", (text, done) => {
  if (text === null) {
    answer?.destroy();
    el.textContent = "";
    answer = createAnswer(el, { core });
    fed = 0;
    return;
  }
  answer.push(text.slice(fed));
  fed = text.length;
  if (done) answer.end();
});
