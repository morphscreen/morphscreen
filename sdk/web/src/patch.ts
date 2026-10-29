// Drawing in place while an answer streams: the page's element is made to
// match the core's newer drawing node by node, so what is already on the page
// stays where it is (a photo keeps its decoded picture, a sentence keeps its
// line breaks) and only what is new is added. The core draws the same thing
// whole when the node closes, so the page still ends as its HTML.

import { animate } from "motion/mini";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Attributes the page owns rather than the drawing: an animation's inline style, inert while streaming, the SDK's marks. */
const kept = (name: string) => name === "style" || name === "inert" || name.startsWith("data-ms-");

/** Makes `cur` match `next`: its attributes, then its children. Returns the elements added. */
export function patch(cur: Element, next: Element, added: Element[] = []): Element[] {
  for (const a of Array.from(cur.attributes)) if (!next.hasAttribute(a.name) && !kept(a.name)) cur.removeAttribute(a.name);
  for (const a of Array.from(next.attributes)) if (cur.getAttribute(a.name) !== a.value) cur.setAttribute(a.name, a.value);
  return patchChildren(cur, next, added);
}

/** Makes `cur`'s children match `next`'s, position by position: the same tag is patched, anything else replaced. */
export function patchChildren(cur: Element, next: Element, added: Element[] = []): Element[] {
  const want = Array.from(next.childNodes);
  const have = Array.from(cur.childNodes);
  want.forEach((n, i) => {
    const c = have[i];
    if (!c) {
      cur.appendChild(n);
      if (n instanceof Element) added.push(n);
    } else if (c.nodeType === Node.TEXT_NODE && n.nodeType === Node.TEXT_NODE) {
      if (c.nodeValue !== n.nodeValue) c.nodeValue = n.nodeValue;
    } else if (c instanceof Element && n instanceof Element && c.tagName === n.tagName) {
      patch(c, n, added);
    } else {
      cur.replaceChild(n, c);
      if (n instanceof Element) added.push(n);
    }
  });
  for (let i = want.length; i < have.length; i++) have[i].remove();
  return added;
}

/** Words and marks inside a line: they arrive with the text around them, unanimated. */
const INLINE = new Set(["SPAN", "B", "STRONG", "EM", "I", "S", "U", "A", "CODE", "SMALL", "SUB", "SUP", "KBD", "BR", "TIME", "OUTPUT", "LABEL", "INPUT"]);

/**
 * New items in a drawing (a question, a row, a card in a row, a photo) fade in
 * where they land, a row or a list item also rising 3 px; only the outermost
 * of what was added moves, and nothing does under reduced motion. Inline
 * styles are taken off once settled, so the page still equals the core's HTML.
 */
export function appear(added: Element[]) {
  if (reduced() || !added.length) return;
  const set = new Set(added);
  for (const el of added) {
    if (INLINE.has(el.tagName) || !(el instanceof HTMLElement || el instanceof SVGElement)) continue;
    let up = el.parentElement;
    while (up && !set.has(up)) up = up.parentElement;
    if (up) continue; // its parent arrives with it
    if (!el.isConnected) continue;
    // A list item drawn as display: contents (a funnel's rows) has no box of its own: its parts move instead.
    const parts = getComputedStyle(el).display === "contents" ? Array.from(el.children) : [el];
    for (const p of parts) {
      const row = p.tagName === "TR" || p.tagName === "TD" || p.tagName === "TH";
      const frames = row ? { opacity: [0, 1] } : { opacity: [0, 1], transform: ["translateY(3px)", "translateY(0)"] };
      animate(p, frames, { duration: 0.22, ease: [0.2, 0, 0, 1] }).finished.then(() =>
        requestAnimationFrame(() => {
          const s = (p as HTMLElement).style;
          p.getAttribute("style");
          s.removeProperty("opacity");
          s.removeProperty("transform");
          if (!s.length) p.removeAttribute("style");
        }),
      );
    }
  }
}

/**
 * A row of cells changing its layout (another cell arrived, or the row closed
 * and took its final columns): each cell glides from where it was to where it
 * is now (FLIP, translation only, so its text never stretches).
 */
export function glide(cells: Element[], change: () => void) {
  const before = cells.map((c) => c.getBoundingClientRect());
  change();
  if (reduced()) return;
  cells.forEach((c, k) => {
    const a = before[k];
    if (!c.isConnected || !a.width) return;
    const b = c.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    animate(c, { transform: [`translate(${dx}px, ${dy}px)`, "translate(0, 0)"] }, { duration: 0.26, ease: [0.2, 0.9, 0.25, 1] }).finished.then(() =>
      requestAnimationFrame(() => {
        const s = (c as HTMLElement).style;
        c.getAttribute("style");
        s.removeProperty("transform");
        if (!s.length) c.removeAttribute("style");
      }),
    );
  });
}
