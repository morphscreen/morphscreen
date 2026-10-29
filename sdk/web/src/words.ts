// How new words arrive (with motion.ts and patch.ts): text added to a block
// fades in over a short beat, so an answer flows in rather than landing a
// piece at a time. While they fade, new words sit in an <ms-word> of their
// own (an element no style rule knows, so nothing about them changes but
// their opacity), and only it repaints. Before a block is patched its words
// come out of those wrappers, so the patcher compares it with the core's
// HTML as ever; after, every fade still running is wrapped again where it
// left off, by its character offsets in the block. A wrapper unwraps itself
// when its fade ends, so the page still ends exactly as the core's HTML.
// Nothing fades under reduced motion.

const DURATION = 300;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

type Fade = { from: number; to: number; t0: number; skip: Element[] };

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const fading = new Map<Element, Fade[]>();

/** Takes the fading words in `el` out of their wrappers. */
function unwrap(el: Element) {
  const words = el.getElementsByTagName("ms-word");
  if (!words.length) return;
  for (const w of Array.from(words)) w.replaceWith(...Array.from(w.childNodes));
  el.normalize();
}

/** Before `el` is patched or redrawn: it holds only the core's HTML again. Its text's length, for wordsAfter. */
export function wordsBefore(el: Element): number {
  unwrap(el);
  return (el.textContent ?? "").length;
}

/**
 * After `el` was patched or redrawn: its text past the first `before`
 * characters fades in (text inside `skip`, elements that fade in whole,
 * doesn't), and the words still fading in it and around it are wrapped
 * again where their fades are.
 */
export function wordsAfter(el: Element, before: number, skip: Element[] = []) {
  if (!el.isConnected) return;
  const now = performance.now();
  const length = (el.textContent ?? "").length;
  if (length > before && !reduced() && typeof el.animate === "function") {
    const list = fading.get(el) ?? [];
    list.push({ from: before, to: length, t0: now, skip });
    fading.set(el, list);
  }
  // Outer blocks first, so a word is wrapped once, by the block that holds it.
  const near = [...fading.keys()].filter((b) => b.isConnected && (b.contains(el) || el.contains(b)));
  near.sort((a, b) => (a.contains(b) ? -1 : b.contains(a) ? 1 : 0));
  for (const b of near) unwrap(b);
  for (const b of near) wrap(b, now);
  for (const [b, fades] of fading) if (!b.isConnected || fades.every((f) => now - f.t0 >= DURATION)) fading.delete(b);
}

/** Wraps `block`'s running fades, each continuing from where it is. */
function wrap(block: Element, now: number) {
  const fades = (fading.get(block) ?? []).filter((f) => now - f.t0 < DURATION);
  if (!fades.length) return;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const pieces: [Text, number, number, number][] = [];
  let at = 0;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const start = at;
    at += n.length;
    if (n.parentElement?.closest("ms-word")) continue;
    for (const f of fades) {
      const a = Math.max(f.from, start);
      const b = Math.min(f.to, at);
      if (a < b && !f.skip.some((s) => s.contains(n))) pieces.push([n, a - start, b - start, now - f.t0]);
    }
  }
  // From the last piece back, so splitting one leaves the offsets of the pieces before it in place.
  for (const [n, a, b, elapsed] of pieces.reverse()) {
    if (!n.isConnected || !n.data.slice(a, b).trim()) continue;
    if (b < n.length) n.splitText(b);
    const piece = a > 0 ? n.splitText(a) : n;
    const word = document.createElement("ms-word");
    piece.replaceWith(word);
    word.appendChild(piece);
    const run = word.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURATION, easing: EASE });
    run.currentTime = elapsed;
    run.finished.then(
      () => {
        if (!word.isConnected) return;
        const parent = word.parentNode;
        word.replaceWith(...Array.from(word.childNodes));
        parent?.normalize();
      },
      () => {},
    );
  }
}
