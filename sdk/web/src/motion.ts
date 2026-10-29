// How things arrive (roadmap Q8): a component fades in over the motion
// tokens' fast duration when it's drawn, a section rises 4 px into place as
// it opens. Short and the same everywhere; nothing moves when the reader
// asks for reduced motion. Built on motion.dev's small animate (the Web
// Animations API), so it runs off the main thread where the browser can.

import { animate } from "motion/mini";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The tokens' fast duration and easing (render/tokens.css). */
function tokens(el: Element) {
  const cs = getComputedStyle(el);
  const ms = parseFloat(cs.getPropertyValue("--ms-dur")) || 180;
  const ease = (cs.getPropertyValue("--ms-ease").match(/[\d.]+/g) ?? ["0.2", "0", "0", "1"]).map(Number) as [number, number, number, number];
  return { duration: ms / 1000, ease };
}

/** Takes off the inline styles an animation leaves, so the page ends as the server's HTML.
 *  motion writes each property's last frame inline as that property finishes,
 *  which can come after the group's finished promise, so this waits a frame.
 *  Chrome copies script-made styles to the attribute lazily, and removing the
 *  attribute before that copy brings it back as style="", so it's read first. */
function settle(el: Element, props: string[]) {
  requestAnimationFrame(() => {
    const s = (el as HTMLElement).style;
    el.getAttribute("style");
    if (Array.from(s).every((p) => props.includes(p))) el.removeAttribute("style");
    else for (const p of props) s.removeProperty(p);
  });
}

/** A component drawn in place of its placeholder: it fades in. */
export function fadeIn(el: Element) {
  if (reduced() || !el.isConnected) return;
  animate(el, { opacity: [0, 1] }, tokens(el)).finished.then(() => settle(el, ["opacity"]));
}

/** A section as it opens: it fades in and rises 4 px (transform only: nothing around it moves). */
export function rise(el: Element) {
  if (reduced() || !el.isConnected) return;
  animate(el, { opacity: [0, 1], transform: ["translateY(4px)", "translateY(0)"] }, tokens(el)).finished.then(() => settle(el, ["opacity", "transform"]));
}
