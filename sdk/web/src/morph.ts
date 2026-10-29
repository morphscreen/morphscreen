// Morphs (roadmap Q11): one shape becomes another, point by point, on a
// motion.dev spring that settles in 120 to 280 ms. Shapes are polylines with
// matching point counts, so any two blend; a filled shape closes its lines.
// Under reduced motion the end state is set at once. Phase M draws the same
// shapes in SwiftUI and Compose.

import { spring } from "motion";

/** Polylines of [x, y] points on a 24-unit grid. */
export type Shape = [number, number][][];

export const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const running = new WeakMap<object, { stop: () => void }>();

/**
 * Runs `frame(v)` as v goes from 0 to 1 on a spring that looks settled after
 * `duration` seconds (it may overshoot a little with `bounce`). A new run on
 * the same `key` stops the one before it. Resolves when it has settled.
 */
export function play(frame: (v: number) => void, { duration = 0.24, bounce = 0.12, key }: { duration?: number; bounce?: number; key?: object } = {}): Promise<void> {
  if (key) running.get(key)?.stop();
  if (reduced() || typeof requestAnimationFrame !== "function") {
    frame(1);
    return Promise.resolve();
  }
  const gen = spring({ keyframes: [0, 1], visualDuration: duration, bounce });
  return new Promise((done) => {
    let raf = 0;
    let t0 = -1;
    const stop = () => {
      cancelAnimationFrame(raf);
      done();
    };
    if (key) running.set(key, { stop });
    const step = (now: number) => {
      if (t0 < 0) t0 = now;
      const s = gen.next(now - t0);
      frame(s.done ? 1 : s.value);
      if (s.done) {
        if (key && running.get(key)?.stop === stop) running.delete(key);
        done();
      } else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const blend = (a: Shape, b: Shape, t: number): Shape => a.map((line, i) => line.map(([x, y], j) => [lerp(x, b[i][j][0], t), lerp(y, b[i][j][1], t)] as [number, number]));
const f = (n: number) => (Math.round(n * 100) / 100).toString();
/** A shape as path data; closed shapes are filled. */
export const d = (shape: Shape, closed = false) => shape.map((l) => "M" + l.map(([x, y]) => `${f(x)} ${f(y)}`).join("L") + (closed ? "Z" : "")).join("");

/** Morphs a path from one shape to another. */
export function morph(path: SVGPathElement, from: Shape, to: Shape, opts: { duration?: number; bounce?: number; closed?: boolean } = {}) {
  return play((t) => path.setAttribute("d", d(blend(from, to, t), opts.closed)), { ...opts, key: path });
}

/** A shape collapsed to one point (what a mark grows out of). */
export const point = (shape: Shape, x = 12, y = 12): Shape => shape.map((l) => l.map(() => [x, y] as [number, number]));

// The marks (spec/marks.json, shared with phase M's native morphs).
export { CHECK, CROSS, PLUS, MINUS, SHEET, ARC, PLAY, PAUSE } from "./marks";

const NS = "http://www.w3.org/2000/svg";
/** An SVG mark the SDK adds (left out when the page is compared with the core's HTML). */
export function mark(shape: Shape, cls?: string, closed = false): { svg: SVGSVGElement; path: SVGPathElement } {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset.msAdded = "1";
  if (cls) svg.setAttribute("class", cls);
  const path = svg.appendChild(document.createElementNS(NS, "path"));
  path.setAttribute("d", d(shape, closed));
  return { svg, path };
}

/** Counts a number up (or down) to `to`, writing it with `format`. */
export function count(el: Element, from: number, to: number, format: (v: number) => string, opts: { duration?: number } = {}) {
  return play((t) => (el.textContent = format(lerp(from, to, t))), { duration: opts.duration ?? 0.5, bounce: 0, key: el });
}

/** Opens or closes an element's height smoothly (it ends at auto). */
export function reveal(el: HTMLElement, open: boolean, opts: { duration?: number } = {}) {
  if (reduced()) {
    el.style.removeProperty("height");
    return Promise.resolve();
  }
  const full = el.scrollHeight;
  el.style.overflow = "hidden";
  return play((t) => (el.style.height = `${(open ? t : 1 - t) * full}px`), { duration: opts.duration ?? 0.24, bounce: 0, key: el }).then(() => {
    el.style.removeProperty("height");
    el.style.removeProperty("overflow");
  });
}
