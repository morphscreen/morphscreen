// Charts that grow as they stream (roadmap Q11). The core draws a chart from
// the rows complete so far; each new drawing replaces the last on the page (so
// the page always ends as the core's HTML) and its shapes morph from where the
// last drawing had them: lines keep their points and grow a segment from their
// end, bars rise from the baseline, the axis rescales with its gridlines
// sliding, new ones fading in, old ones fading out. Before any row, the
// placeholder holds a dashed outline of the chart's kind.

import { lerp, play, reduced } from "./morph";

const NS = "http://www.w3.org/2000/svg";
/** Samples per category along a line, for the morph. */
const PER = 4;

/** Takes off what an animation wrote inline; an element left with no style loses the attribute. */
function unstyle(el: Element, ...props: string[]) {
  const st = (el as HTMLElement).style;
  for (const p of props) st.removeProperty(p);
  if (!el.getAttribute("style")) el.removeAttribute("style");
}
/** An element's attributes as the core wrote them, to put back exactly once it has moved. */
function keep(el: Element, names: string[]) {
  const was = names.map((n) => [n, el.getAttribute(n)] as const);
  return () => was.forEach(([n, v]) => (v === null ? el.removeAttribute(n) : el.setAttribute(n, v)));
}

type Pt = [number, number];
interface Geometry {
  kind: string;
  l: number;
  t: number;
  pw: number;
  ph: number;
  lo: number;
  hi: number;
  n: number;
  lines: Map<string, Pt[]>;
  rects: Map<string, { x: number; y: number; w: number; h: number }>;
  dots: Map<string, { x: number; y: number }>;
  ticks: Map<string, number>;
  cats: Map<string, number>;
}

const num = (e: Element | SVGElement, k: string) => parseFloat(e.getAttribute(k) ?? "NaN");
const seriesOf = (e: Element) => (e.getAttribute("class") ?? "").split(/\s+/).find((c) => /^ms-s\d+$/.test(c)) ?? "ms-s1";

/** The chart drawing that is showing (a chart comes drawn at up to three widths). */
export function visibleSvg(root: Element): SVGSVGElement | null {
  const all = [...root.querySelectorAll<SVGSVGElement>("figure.ms-chart svg[data-kind]")];
  return all.find((s) => (s as unknown as HTMLElement).getClientRects().length > 0) ?? all[0] ?? null;
}

/** A series' values from the chart's data table (as the core reads them: NaN where not a number). */
function columns(table: Element | null): number[][] {
  if (!table) return [];
  const rows = [...table.querySelectorAll("tbody tr")].map((r) => [...r.children].slice(1).map((c) => parseFloat((c.textContent ?? "").replace(/[^0-9.\-]/g, ""))));
  const n = Math.max(0, ...rows.map((r) => r.length));
  return Array.from({ length: n }, (_, j) => rows.map((r) => r[j] ?? NaN));
}

/** Points along the core's curve through `pts` (html.rs curve: monotone cubic), PER to a segment. */
function along(pts: Pt[]): Pt[] {
  const n = pts.length;
  if (n < 2) return pts.slice();
  if (n < 3) {
    const out: Pt[] = [];
    for (let k = 0; k <= PER; k++) out.push([lerp(pts[0][0], pts[1][0], k / PER), lerp(pts[0][1], pts[1][1], k / PER)]);
    return out;
  }
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const sl = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / (dx[i] || 1));
  const m = new Array(n).fill(0);
  m[0] = sl[0];
  for (let i = 1; i < n - 1; i++) m[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / sl[i - 1] + (dx[i] + 2 * dx[i - 1]) / sl[i]);
  m[n - 1] = sl[n - 2];
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    const p0 = pts[i], p3 = pts[i + 1], p1: Pt = [p0[0] + h, p0[1] + m[i] * h], p2: Pt = [p3[0] - h, p3[1] - m[i + 1] * h];
    for (let k = 1; k <= PER; k++) {
      const t = k / PER, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
  }
  return out;
}

/** Where a drawing has its shapes: lines from its data on its scale, the rest read off the page. */
function read(svg: SVGSVGElement, table: Element | null): Geometry {
  const ds = svg.dataset;
  const g: Geometry = {
    kind: ds.kind ?? "bar",
    l: +(ds.l ?? 0),
    t: +(ds.t ?? 0),
    pw: +(ds.pw ?? 0),
    ph: +(ds.ph ?? 0),
    lo: +(ds.lo ?? 0),
    hi: +(ds.hi ?? 1),
    n: +(ds.n ?? 0),
    lines: new Map(),
    rects: new Map(),
    dots: new Map(),
    ticks: new Map(),
    cats: new Map(),
  };
  const bw = g.pw / Math.max(1, g.n);
  const cols = columns(table);
  for (const p of svg.querySelectorAll<SVGPathElement>("path.ms-line")) {
    const s = seriesOf(p);
    const vals = cols[Number(s.slice("ms-s".length)) - 1] ?? [];
    // The core leaves out values that aren't numbers; a line with gaps isn't morphed.
    if (!vals.length || vals.some((v) => !Number.isFinite(v))) continue;
    g.lines.set(s, along(vals.map((v, i) => [g.l + bw * i + bw / 2, yOf(g, v)] as Pt)));
  }
  for (const r of svg.querySelectorAll<SVGRectElement>("rect[data-i]")) g.rects.set(`${seriesOf(r)}|${r.dataset.i}`, { x: num(r, "x"), y: num(r, "y"), w: num(r, "width"), h: num(r, "height") });
  for (const c of svg.querySelectorAll<SVGCircleElement>("circle[data-i]")) g.dots.set(`${seriesOf(c)}|${c.dataset.i}`, { x: num(c, "cx"), y: num(c, "cy") });
  for (const tx of svg.querySelectorAll<SVGTextElement>(":scope > text")) {
    const key = tx.textContent ?? "";
    if (tx.getAttribute("text-anchor") === "end") g.ticks.set(key, num(tx, "y"));
    else if (tx.getAttribute("text-anchor") === "middle" && g.kind !== "horizontal") g.cats.set(key, num(tx, "x"));
  }
  return g;
}

/** A round chart's slices as [start, end] angles, from its data table (as the core works them out). */
function sliceAngles(root: Element): [number, number][] | null {
  const table = root.querySelector("table.ms-chart-data");
  if (!table) return null;
  const vals = [...table.querySelectorAll("tbody tr")].map((r) => {
    const v = parseFloat((r.children[1]?.textContent ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  let a = -Math.PI / 2;
  return vals.map((v) => [a, (a += (2 * Math.PI * v) / total)] as [number, number]);
}

/** A slice's path, the way the core draws it (html.rs, round charts). */
function slicePath(w: number, h: number, donut: boolean, a0: number, a1: number) {
  const r = Math.min(w, h) / 2 - 8, ri = donut ? r * 0.6 : 0, cx = w / 2, cy = h / 2;
  const p = (rad: number, ang: number) => `${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return donut ? `M${p(r, a0)}A${r},${r} 0 ${large} 1 ${p(r, a1)}L${p(ri, a1)}A${ri},${ri} 0 ${large} 0 ${p(ri, a0)}Z` : `M${cx},${cy}L${p(r, a0)}A${r},${r} 0 ${large} 1 ${p(r, a1)}Z`;
}

/** Where value v sat on a drawing's value axis. */
const yOf = (g: Geometry, v: number) => g.t + g.ph - ((v - g.lo) / (g.hi - g.lo || 1)) * g.ph;

/**
 * Replaces `current` (a chart, or its placeholder) with the core's next drawing
 * and morphs the shapes from where they were. Returns the element now on the page.
 */
export function growChart(current: HTMLElement, html: string): HTMLElement | null {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const next = tpl.content.firstElementChild as HTMLElement | null;
  if (!next) return null;
  const oldSvg = visibleSvg(current);
  const old = oldSvg && (oldSvg as unknown as HTMLElement).getClientRects().length ? read(oldSvg, current.querySelector("table.ms-chart-data")) : null;
  const oldSlices = old && (old.kind === "pie" || old.kind === "donut") ? sliceAngles(current) : null;
  current.replaceWith(next);
  // The SDK moves these charts itself: the theme's draw-in (for pages without script) stays off.
  for (const f of [next, ...next.querySelectorAll<HTMLElement>("figure.ms-chart")]) if (f.matches("figure.ms-chart")) f.dataset.msMorph = "1";
  const svg = visibleSvg(next);
  if (!svg || reduced() || !(svg as unknown as HTMLElement).getClientRects().length) return next;
  const now = read(svg, next.querySelector("table.ms-chart-data"));
  const kind = now.kind;
  if ((kind === "pie" || kind === "donut") && oldSlices?.length) {
    // Slices re-split: each turns from its old angles to its new ones; a new one grows out of the end.
    const now = sliceAngles(next);
    const vb = svg.viewBox.baseVal;
    const end = oldSlices[oldSlices.length - 1][1];
    const paths = [...svg.querySelectorAll<SVGPathElement>("path.ms-slice[data-i]")];
    const ends = paths.map((p) => p.getAttribute("d") ?? "");
    if (now) {
      play((v) => paths.forEach((p, k) => {
        const [b0, b1] = now[k] ?? [end, end];
        const [a0, a1] = oldSlices[k] ?? [end, end];
        p.setAttribute("d", slicePath(vb.width, vb.height, kind === "donut", lerp(a0, b0, v), lerp(a1, b1, v)));
      }), { duration: 0.42, bounce: 0, key: svg }).then(() => paths.forEach((p, k) => p.setAttribute("d", ends[k])));
    }
    return next;
  }
  if (kind === "pie" || kind === "donut" || kind === "radar") {
    // Round charts settle in as a whole: they open out from a little smaller.
    if (!old) {
      const s = svg as unknown as SVGElement & { style: CSSStyleDeclaration };
      s.style.transformOrigin = "50% 50%";
      play((v) => {
        s.style.opacity = String(v);
        s.style.transform = `scale(${lerp(0.94, 1, v)})`;
      }, { duration: 0.28, bounce: 0.1, key: svg }).then(() => unstyle(s, "opacity", "transform", "transform-origin"));
    }
    return next;
  }
  const base = yOf(now, Math.max(now.lo, Math.min(0, now.hi)));
  const finals: (() => void)[] = [];
  const frames: ((v: number) => void)[] = [];

  // Lines (and the areas under them): points move; a new segment grows from the old end.
  for (const p of svg.querySelectorAll<SVGPathElement>("path.ms-line")) {
    const s = seriesOf(p);
    const to = now.lines.get(s);
    if (!to?.length) continue;
    const from = old?.lines.get(s);
    // Points it had move to their new places; points it gains carry on level from its old end at the
    // old spacing (no further than the plot's edge), so every point keeps its order and the line never folds.
    const right = (old?.l ?? now.l) + (old?.pw ?? now.pw);
    const step = from && from.length > 1 ? from[1][0] - from[0][0] : 0;
    const start: Pt[] = to.map(([x], k) => {
      if (!from?.length) return [x, base];
      if (k < from.length) return from[k];
      const end = from[from.length - 1];
      return [Math.min(end[0] + (k - from.length + 1) * step, right), end[1]];
    });
    const fill = svg.querySelector<SVGPathElement>(`path.ms-fill.${s}`);
    const endD = p.getAttribute("d") ?? "";
    const endFill = fill?.getAttribute("d") ?? "";
    const poly = (pts: Pt[]) => "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L");
    p.removeAttribute("pathLength");
    frames.push((v) => {
      const pts = to.map(([x, y], k) => [lerp(start[k][0], x, v), lerp(start[k][1], y, v)] as Pt);
      p.setAttribute("d", poly(pts));
      if (fill) fill.setAttribute("d", `${poly(pts)}L${pts[pts.length - 1][0].toFixed(1)},${base.toFixed(1)}L${pts[0][0].toFixed(1)},${base.toFixed(1)}Z`);
    });
    finals.push(() => {
      p.setAttribute("d", endD);
      p.setAttribute("pathLength", "1");
      if (fill) fill.setAttribute("d", endFill);
    });
  }
  // Bars: from where they were, or up from the baseline.
  const horizontal = kind === "horizontal";
  for (const r of svg.querySelectorAll<SVGRectElement>("rect[data-i]")) {
    const key = `${seriesOf(r)}|${r.dataset.i}`;
    const to = now.rects.get(key)!;
    const zero = horizontal ? now.l + ((0 - now.lo) / (now.hi - now.lo || 1)) * now.pw : base;
    const from = old?.rects.get(key) ?? (horizontal ? { x: zero, y: to.y, w: 0, h: to.h } : { x: to.x, y: zero, w: to.w, h: 0 });
    const back = keep(r, ["x", "y", "width", "height"]);
    frames.push((v) => {
      r.setAttribute("x", lerp(from.x, to.x, v).toFixed(1));
      r.setAttribute("y", lerp(from.y, to.y, v).toFixed(1));
      r.setAttribute("width", Math.max(0, lerp(from.w, to.w, v)).toFixed(1));
      r.setAttribute("height", Math.max(0, lerp(from.h, to.h, v)).toFixed(1));
    });
    finals.push(back);
  }
  // Points of a scatter: from where they were, or up from the baseline.
  for (const c of svg.querySelectorAll<SVGCircleElement>("circle[data-i]")) {
    const key = `${seriesOf(c)}|${c.dataset.i}`;
    const to = now.dots.get(key)!;
    const from = old?.dots.get(key);
    const r0 = c.getAttribute("r") ?? "4.5";
    const back = keep(c, ["cx", "cy", "r"]);
    frames.push((v) => {
      c.setAttribute("cx", lerp(from?.x ?? to.x, to.x, v).toFixed(1));
      c.setAttribute("cy", lerp(from?.y ?? base, to.y, v).toFixed(1));
      if (!from) c.setAttribute("r", (v * +r0).toFixed(2));
    });
    finals.push(back);
  }
  // The value axis: gridlines and their numbers slide to the new scale; new
  // ones come in from where they'd have been on the old scale, fading in.
  if (!horizontal && old) {
    const kids = [...svg.children];
    kids.forEach((tx, k) => {
      if (!(tx instanceof SVGTextElement) || tx.getAttribute("text-anchor") !== "end") return;
      const line = kids[k - 1] instanceof SVGLineElement ? (kids[k - 1] as SVGLineElement) : null;
      const value = parseFloat((tx.textContent ?? "").replace(/[^0-9.\-]/g, ""));
      const to = num(tx, "y");
      const was = old.ticks.get(tx.textContent ?? "");
      const inPlot = (y: number) => Math.max(now.t + 4, Math.min(now.t + now.ph + 4, y));
      const from = was ?? (Number.isFinite(value) ? inPlot(yOf(old, value) + 4) : to);
      const fresh = was === undefined;
      const backT = keep(tx, ["y"]), backL = line ? keep(line, ["y1", "y2"]) : () => {};
      frames.push((v) => {
        const y = lerp(from, to, v);
        tx.setAttribute("y", y.toFixed(1));
        if (line) {
          line.setAttribute("y1", (y - 4).toFixed(1));
          line.setAttribute("y2", (y - 4).toFixed(1));
        }
        if (fresh) {
          tx.style.opacity = String(v);
          if (line) line.style.opacity = String(v);
        }
      });
      finals.push(() => {
        backT();
        backL();
        unstyle(tx, "opacity");
        if (line) unstyle(line, "opacity");
      });
    });
    // Old gridlines the new scale dropped: they move with it and fade out.
    for (const [label, y] of old.ticks) {
      if (now.ticks.has(label)) continue;
      const value = parseFloat(label.replace(/[^0-9.\-]/g, ""));
      if (!Number.isFinite(value)) continue;
      const to = Math.max(now.t + 4, Math.min(now.t + now.ph + 4, yOf(now, value) + 4));
      const g = document.createElementNS(NS, "g");
      g.dataset.msAdded = "1";
      const line = g.appendChild(document.createElementNS(NS, "line"));
      line.setAttribute("class", "ms-grid");
      line.setAttribute("x1", String(now.l));
      line.setAttribute("x2", String(now.l + now.pw));
      const tx = g.appendChild(document.createElementNS(NS, "text"));
      tx.setAttribute("x", String(now.l - 8));
      tx.setAttribute("text-anchor", "end");
      tx.textContent = label;
      svg.insertBefore(g, svg.firstChild);
      frames.push((v) => {
        const yy = lerp(y, to, v);
        tx.setAttribute("y", yy.toFixed(1));
        line.setAttribute("y1", (yy - 4).toFixed(1));
        line.setAttribute("y2", (yy - 4).toFixed(1));
        g.style.opacity = String(1 - v);
      });
      finals.push(() => g.remove());
    }
    // Category names: slide along; new ones fade in.
    for (const tx of svg.querySelectorAll<SVGTextElement>(":scope > text[text-anchor='middle']")) {
      const to = num(tx, "x");
      const was = old.cats.get(tx.textContent ?? "");
      const back = keep(tx, ["x"]);
      frames.push((v) => {
        if (was !== undefined) tx.setAttribute("x", lerp(was, to, v).toFixed(1));
        else tx.style.opacity = String(v);
      });
      finals.push(() => {
        back();
        unstyle(tx, "opacity");
      });
    }
  }
  if (old) {
    const gone = document.createElementNS(NS, "g");
    gone.dataset.msAdded = "1";
    for (const [s, pts] of old.lines) {
      if (now.lines.has(s)) continue;
      const p = gone.appendChild(document.createElementNS(NS, "path"));
      p.setAttribute("class", `ms-line ${s}`);
      p.setAttribute("d", "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L"));
    }
    for (const [key, r] of old.rects) {
      if (now.rects.has(key)) continue;
      const e = gone.appendChild(document.createElementNS(NS, "rect"));
      e.setAttribute("class", key.split("|")[0]);
      Object.entries({ x: r.x, y: r.y, width: r.w, height: r.h, rx: 2 }).forEach(([k, v]) => e.setAttribute(k, String(v)));
    }
    if (gone.childNodes.length) {
      svg.appendChild(gone);
      frames.push((v) => (gone.style.opacity = String(Math.max(0, 1 - v * 2.5))));
      finals.push(() => gone.remove());
    }
  }
  frames.forEach((fr) => fr(0));
  play((v) => frames.forEach((fr) => fr(v)), { duration: 0.42, bounce: 0, key: svg }).then(() => finals.forEach((fn) => fn()));
  return next;
}

/** A placeholder's outline of what's coming: dashed lines, or grey bars, by the chart's kind. */
export function chartOutline(ph: HTMLElement, kind: string) {
  if (ph.querySelector("svg[data-ms-added]")) return;
  const w = 700,
    h = 276;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.dataset.msAdded = "1";
  const stroke = "var(--ms-line-2)";
  if (kind === "pie" || kind === "donut") {
    const c = svg.appendChild(document.createElementNS(NS, "circle"));
    c.setAttribute("cx", "120");
    c.setAttribute("cy", String(h / 2));
    c.setAttribute("r", "92");
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", stroke);
    c.setAttribute("stroke-width", kind === "donut" ? "36" : "92");
    c.setAttribute("opacity", ".5");
  } else if (kind === "line" || kind === "area" || kind === "scatter" || kind === "radar") {
    for (let k = 0; k < 2; k++) {
      const p = svg.appendChild(document.createElementNS(NS, "path"));
      const pts = Array.from({ length: 6 }, (_, i) => `${48 + i * 124},${h - 52 - i * (22 - k * 8) - k * 18}`);
      p.setAttribute("d", "M" + pts.join("L"));
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", stroke);
      p.setAttribute("stroke-width", "2.25");
      p.setAttribute("stroke-dasharray", "3 6");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("vector-effect", "non-scaling-stroke");
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const r = svg.appendChild(document.createElementNS(NS, "rect"));
      const bh = 40 + ((i * 37) % 120);
      if (kind === "horizontal") {
        r.setAttribute("x", "150");
        r.setAttribute("y", String(20 + i * 40));
        r.setAttribute("width", String(120 + ((i * 97) % 380)));
        r.setAttribute("height", "22");
      } else {
        r.setAttribute("x", String(70 + i * 105));
        r.setAttribute("y", String(h - 30 - bh));
        r.setAttribute("width", "36");
        r.setAttribute("height", String(bh));
      }
      r.setAttribute("rx", "3");
      r.setAttribute("fill", stroke);
      r.setAttribute("opacity", ".55");
    }
  }
  ph.appendChild(svg);
}
