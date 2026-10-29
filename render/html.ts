// Prototype HTML renderer: a finished answer in, HTML out. No JavaScript, no
// inline styles (so it passes a strict CSP), charts as SVG drawn with
// attributes. The real one will live in the core and stream; this one exists
// to look at what models actually write.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultCatalog, type Catalog } from "../spec/catalog.ts";
import { safeUrl, stripEmoji } from "../spec/text.ts";
import { synonym } from "../spec/synonyms.ts";

export { stripEmoji };

const here = dirname(fileURLToPath(import.meta.url));

/**
 * How a customer's own component renders: its attributes (a bare attribute is
 * true) and its content, both as rendered HTML and as the text the model wrote.
 * It returns HTML and escapes what it prints (escapeHtml is exported for that).
 */
export type CustomRenderer = (attrs: Record<string, string | true>, content: { html: string; text: string }) => string;

// The render() call in progress: its catalog and the customer's renderers.
let catalog: Catalog = defaultCatalog;
let custom: Record<string, CustomRenderer> = {};

type Node = { name: string; attrs: Record<string, string | true>; children: Child[] };
type Child = Node | string;

const INLINE = new Set(["Badge", "Button"]);
const SENTINEL = "\u0001";

// ---------- parsing (same rules as validator/validate.ts) ----------

function unwrap(src: string): string {
  const s = src.includes("</think>") ? src.replace(/^[\s\S]*?<\/think>\s*/, "") : src;
  const m = s.trim().match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  return m ? m[1] : s;
}

/** Components inside a table row, and Badge or Button inside a sentence,
 * stay in the text, so the Markdown around them survives; inline() renders them. */
function protectInline(src: string): string {
  // Code spans are left alone: `<Card>` there is text.
  const outsideCode = (line: string, f: (part: string) => string) =>
    line.split(/(`[^`\n]*`)/).map((part, k) => (k % 2 ? part : f(part))).join("");
  return src
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (t.startsWith("|")) return outsideCode(line, (p) => p.replace(/<(\/?)([A-Z][A-Za-z0-9]*)\b/g, `${SENTINEL}$1$2`));
      // A line holding nothing but Badges and Buttons is a row of them; anywhere
      // else they sit inside the sentence.
      const elements = /<(Badge|Button)\b[^>]*\/>|<(Badge|Button)\b[^>]*>[^<]*<\/\2>/g;
      if (/^<(Badge|Button)\b/.test(t) && !t.replace(elements, "").trim()) return line;
      return outsideCode(line, (p) => p.replace(/<(\/?)(Badge|Button)\b/g, `${SENTINEL}$1$2`));
    })
    .join("\n");
}

function readOpenTag(src: string, start: number) {
  let i = start + 1;
  const nm = src.slice(i).match(/^[A-Z][A-Za-z0-9]*/);
  if (!nm) return null;
  const name = nm[0];
  i += name.length;
  const attrs: Record<string, string | true> = {};
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) return null;
    if (src.startsWith("/>", i)) return { name, attrs, selfClosing: true, end: i + 2 };
    if (src[i] === ">") return { name, attrs, selfClosing: false, end: i + 1 };
    const key = src.slice(i).match(/^[A-Za-z_][\w-]*/);
    if (!key) return null;
    i += key[0].length;
    while (src[i] === " ") i++;
    if (src[i] !== "=") {
      attrs[key[0]] = true;
      continue;
    }
    i++;
    while (src[i] === " ") i++;
    const q = src[i];
    if (q === '"' || q === "'") {
      // A quote escaped JSON-style (12\" for inches) belongs to the value.
      let end = i + 1;
      while (end < src.length && !(src[end] === q && src[end - 1] !== "\\")) end++;
      if (end >= src.length) return null;
      attrs[key[0]] = src.slice(i + 1, end).replaceAll(`\\${q}`, q);
      i = end + 1;
    } else if (q === "{") {
      const end = src.indexOf("}", i + 1);
      if (end < 0) return null;
      attrs[key[0]] = src.slice(i + 1, end).trim().replace(/^["']|["']$/g, "");
      i = end + 1;
    } else {
      const bare = src.slice(i).match(/^[^\s/>]+/);
      if (!bare) return null;
      attrs[key[0]] = bare[0];
      i += bare[0].length;
    }
  }
}

function parse(src: string): Node {
  const root: Node = { name: "#root", attrs: {}, children: [] };
  const stack: Node[] = [root];
  let text = "";
  const flush = () => {
    if (text) stack[stack.length - 1].children.push(text);
    text = "";
  };
  let i = 0;
  let lineStart = true;
  while (i < src.length) {
    if (lineStart && src.startsWith("```", i)) {
      const end = src.indexOf("\n```", i + 3);
      const stop = end < 0 ? src.length : (src.indexOf("\n", end + 4) + 1 || src.length);
      text += src.slice(i, stop);
      i = stop;
      lineStart = true;
      continue;
    }
    const c = src[i];
    // A code span is text, tags and all.
    if (c === "`") {
      const end = src.indexOf("`", i + 1);
      const nl = src.indexOf("\n", i + 1);
      if (end > 0 && (nl < 0 || end < nl)) {
        text += src.slice(i, end + 1);
        i = end + 1;
        lineStart = false;
        continue;
      }
    }
    if (c === "<" && src[i + 1] === "/" && /[A-Z]/.test(src[i + 2] ?? "")) {
      const end = src.indexOf(">", i);
      if (end > 0) {
        flush();
        const name = src.slice(i + 2, end).trim();
        const d = stack.map((n) => n.name).lastIndexOf(name);
        if (d > 0) stack.length = d;
        i = end + 1;
        lineStart = false;
        continue;
      }
    }
    if (c === "<" && /[A-Z]/.test(src[i + 1] ?? "")) {
      const tag = readOpenTag(src, i);
      if (tag) {
        flush();
        const node: Node = { name: tag.name, attrs: tag.attrs, children: [] };
        stack[stack.length - 1].children.push(node);
        const isVoid = tag.selfClosing || catalog.components[tag.name]?.content === "none";
        if (!isVoid) stack.push(node);
        i = tag.end;
        lineStart = false;
        continue;
      }
    }
    text += c;
    lineStart = c === "\n";
    i++;
  }
  flush();
  return root;
}

// ---------- Markdown (the format's subset) ----------

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const esc = escapeHtml;
/** A dash between words never starts a line. */
const dashes = (s: string) => s.replace(/ ([-–—]) /g, " $1 ");
const title = (v: unknown) => dashes(esc(String(v ?? "")));

// Models write some HTML for formatting even when told not to. Line breaks and
// paragraphs become Markdown, inline formatting tags are kept without their
// attributes, and other tags are dropped. Nothing else of HTML is rendered.
const BR = "\u0003";
const FORMAT: Record<string, string> = {
  strong: "strong", b: "strong", em: "em", i: "em", u: "u", s: "s", del: "s", code: "code",
  small: "small", sub: "sub", sup: "sup", mark: "mark", kbd: "kbd",
};

function fromHtml(text: string): string {
  let fence = false;
  return text
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("```")) fence = !fence;
      if (fence || line.trim().startsWith("```")) return line;
      const row = line.trim().startsWith("|");
      return line
        .replace(/<br\s*\/?>/gi, BR)
        .replace(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/gi, (_m, n, t) => (row ? `**${t}**${BR}` : `\n\n${"#".repeat(Number(n))} ${t}\n\n`))
        .replace(/<\/?(p|div|li|ul|ol)\b[^>]*>/gi, row ? BR : "\n\n")
        .replace(/<\/?(span|font|center|section|article|header|footer|label|a)\b[^>]*>/gi, "");
    })
    .join("\n");
}

/** Turns escaped formatting tags back into tags, balanced so none leaks out. */
function formatTags(html: string): string {
  const open: string[] = [];
  const out = html.replace(/&lt;(\/?)([a-zA-Z]+)(?:\s(?:(?!&gt;).)*?)?\/?&gt;/g, (m, close, t) => {
    const tag = FORMAT[t.toLowerCase()];
    if (!tag) return m;
    if (!close) {
      open.push(tag);
      return `<${tag}>`;
    }
    const k = open.lastIndexOf(tag);
    if (k < 0) return "";
    return open.splice(k).reverse().map((x) => `</${x}>`).join("");
  });
  return out + open.reverse().map((x) => `</${x}>`).join("");
}

/** Roughly the length of a cell's text once markup is gone (tags, emphasis marks). */
const plainLength = (s: string) => s.replace(/<[^>]*>/g, "").replace(/[*_`]/g, "").trim().length;

function inline(s: string): string {
  // Inline components first, protected from escaping.
  const parts: string[] = [];
  const keep = (html: string) => {
    parts.push(html);
    return `\u0002${parts.length - 1}\u0002`;
  };
  const marked = s
    // <Name ...>body</Name>
    .replace(new RegExp(`${SENTINEL}([A-Z][A-Za-z0-9]*)\\b([^>]*?)(?<!/)>([\\s\\S]*?)${SENTINEL}\\/\\1>`, "g"), (_m, name, attrText, body) => {
      const tag = readOpenTag(`<${name}${attrText}>`, 0);
      return keep(renderNode({ name, attrs: tag?.attrs ?? {}, children: [body] }, 0));
    })
    // <Name ... /> and void components written without the slash
    .replace(new RegExp(`${SENTINEL}([A-Z][A-Za-z0-9]*)\\b([^>]*?)/?>`, "g"), (_m, name, attrText) => {
      const tag = readOpenTag(`<${name}${attrText}/>`, 0);
      return keep(renderNode({ name, attrs: tag?.attrs ?? {}, children: [] }, 0));
    })
    // A stray closing tag left over
    .replace(new RegExp(`${SENTINEL}\\/[A-Z][A-Za-z0-9]*>`, "g"), "");
  let out = formatTags(esc(marked.replace(new RegExp(SENTINEL, "g"), "<")));
  out = dashes(out)
    .replace(new RegExp(`^[\\s${BR}]+|[\\s${BR}]+$`, "g"), "")
    .replace(new RegExp(`\\s*${BR}[\\s${BR}]*`, "g"), "<br>")
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (m, alt, src) => (safeUrl(src, true) ? `<img src="${src}" alt="${alt}" loading="lazy">` : alt))
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, t, href) => (safeUrl(href, false) ? `<a href="${href}">${t}</a>` : t))
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1<em>$2</em>");
  return keepIds(out).replace(/\u0002(\d+)\u0002/g, (_m, k) => parts[Number(k)]);
}

/** A row's cells; a pipe inside a component tag or a code span doesn't split. */
function cells(line: string): string[] {
  const t = line.trim().replace(/^\||\|$/g, "");
  const out: string[] = [];
  let cur = "", tag = false, quote = "", code = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "`" && !tag) code = !code;
    else if (c === "<" && !code && !tag && /[A-Z]/.test(t[i + 1] ?? "")) tag = true;
    else if ((c === '"' || c === "'") && tag) quote = quote === c ? "" : quote || c;
    else if (c === ">" && tag && !quote) tag = false;
    else if (c === "|" && !tag && !code) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function markdown(text: string, depth: number): string {
  const lines = fromHtml(text).split("\n");
  const out: string[] = [];
  let para: string[] = [];
  const endPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const l = raw.trim();
    if (!l) {
      endPara();
      continue;
    }
    if (l.startsWith("```")) {
      endPara();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      endPara();
      const level = Math.min(6, h[1].length + Math.min(depth, 2));
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    if (/^(---|\*\*\*|___)$/.test(l)) {
      endPara();
      out.push("<hr>");
      continue;
    }
    if (l.startsWith("|")) {
      endPara();
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++].trim());
      i--;
      const hasSep = rows.length > 1 && /^\|?\s*:?-{2,}/.test(rows[1]);
      const head = cells(rows[0]);
      const body = rows.slice(hasSep ? 2 : 1).map(cells);
      // A column whose cells are all numbers aligns right, header included.
      const numeric = head.map((_, k) => body.length > 0 && body.every((r) => /^[-+]?[$€£₹¥]?\s?[-+]?\d[\d,.]*\s?(%|[kKmMbB]|ms|s|h|x)?$/.test((r[k] ?? "").trim())));
      const c = (k: number) => (numeric[k] ? ' class="num"' : "");
      out.push(
        `<div class="table"><table><thead><tr>${head.map((h, k) => `<th${c(k)}>${inline(h)}</th>`).join("")}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((v, k) => `<td${c(k) || (plainLength(v) > 32 ? ' class="long"' : "")}>${inline(v)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    const li = l.match(/^([-*+]|\d+[.)])\s+(.*)$/);
    if (li) {
      endPara();
      const ordered = /\d/.test(li[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(/^([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        const task = m[2].match(/^\[( |x|X)\]\s+(.*)$/);
        items.push(task ? `<li class="task${task[1] === " " ? "" : " done"}">${inline(task[2])}</li>` : `<li>${inline(m[2])}</li>`);
        i++;
      }
      i--;
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    if (l.startsWith(">")) {
      endPara();
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) q.push(lines[i++].trim().replace(/^>\s?/, ""));
      i--;
      out.push(`<blockquote>${inline(q.join(" "))}</blockquote>`);
      continue;
    }
    para.push(l);
  }
  endPara();
  return out.join("\n");
}

// ---------- charts (SVG; colors come from the theme through classes) ----------

const num = (v: string) => {
  const t = v.replace(/[$€£₹¥,%\s]/g, "");
  const m = t.match(/^([-+]?\d*\.?\d+)([kKmMbB])?/);
  if (!m) return NaN;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Number(m[1]) * mult;
};
const fmt = (n: number, d = 1) =>
  Math.abs(n) >= 1e6 ? `${+(n / 1e6).toFixed(d)}M` : Math.abs(n) >= 1e3 ? `${+(n / 1e3).toFixed(d)}k` : `${+n.toFixed(Math.max(d, 2))}`;
/** Axis labels with just enough decimals that no two ticks read the same. */
const tickFmt = (ticks: number[]) => {
  for (let d = 1; d < 4; d++) {
    const out = ticks.map((t) => fmt(t, d));
    if (new Set(out).size === out.length) return out;
  }
  return ticks.map((t) => fmt(t, 4));
};
const cls = (k: number) => `s${(k % 8) + 1}`;
const f1 = (n: number) => n.toFixed(1);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** ISO dates on an axis read as "Jan 15", or "Jan" for months. */
function axisLabels(labels: string[]): string[] {
  const month = (l: string) => MONTHS[Number(l.slice(5, 7)) - 1];
  if (labels.length && labels.every((l) => /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(l)))
    return labels.map((l) => `${month(l)} ${Number(l.slice(8, 10))}`);
  if (labels.length && labels.every((l) => /^\d{4}-(0[1-9]|1[0-2])$/.test(l))) {
    const years = new Set(labels.map((l) => l.slice(0, 4))).size;
    return labels.map((l) => (years > 1 ? `${month(l)} ${l.slice(2, 4)}` : month(l)));
  }
  return labels;
}

/** A monotone curve through the points (no overshoot past the data), as d3's monotoneX draws it. */
function curve(pts: number[][]): string {
  const n = pts.length;
  const xy = (x: number, y: number) => `${f1(x)},${f1(y)}`;
  if (n < 3) return pts.map(([x, y], i) => `${i ? "L" : "M"}${xy(x, y)}`).join("");
  const dx: number[] = [], sl: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    sl[i] = (pts[i + 1][1] - pts[i][1]) / (dx[i] || 1);
  }
  const m = [sl[0]];
  for (let i = 1; i < n - 1; i++)
    m[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / sl[i - 1] + (dx[i] + 2 * dx[i - 1]) / sl[i]);
  m[n - 1] = sl[n - 2];
  let d = `M${xy(pts[0][0], pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${xy(pts[i][0] + h, pts[i][1] + m[i] * h)} ${xy(pts[i + 1][0] - h, pts[i + 1][1] - m[i + 1] * h)} ${xy(pts[i + 1][0], pts[i + 1][1])}`;
  }
  return d;
}

/** Round axis ticks: 0 and 4 nice steps up to at least the max. */
function niceTicks(min: number, max: number): number[] {
  const span = max - min || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t < max + step * 0.999; t += step) ticks.push(+t.toFixed(10));
  return ticks;
}

function chart(attrs: Record<string, string | true>, text: string): string {
  const rows = text.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (!rows.length) return "";
  const hasSep = rows.length > 1 && /^\|?\s*:?-{2,}/.test(rows[1]);
  const head = cells(rows[0]);
  const data = rows.slice(hasSep ? 2 : 1).map(cells);
  const labels = data.map((r) => r[0]);
  const series = head.slice(1).map((name, k) => ({ name, values: data.map((r) => num(r[k + 1] ?? "")) }));
  const type = String(attrs.type ?? "bar").toLowerCase();
  const round = type === "pie" || type === "donut";
  // A pie has no axis, so its y label means nothing.
  const axis = attrs.y && !round ? `<span class="axis">${esc(String(attrs.y))}</span>` : "";
  const caption = attrs.title || axis ? `<figcaption><span>${title(attrs.title)}</span>${axis}</figcaption>` : "";
  const vals = round ? (series[0]?.values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0)) ?? []) : [];
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  // A pie's legend carries each slice's share; with room, it sits beside the pie.
  const side = round && chartWidth >= 480;
  const legendNames = round ? labels : series.length > 1 ? series.map((s) => s.name) : [];
  const share = (k: number) => {
    const p = (vals[k] / total) * 100;
    return `<span class="v">${p > 0 && p < 1 ? "<1" : Math.round(p)}%</span>`;
  };
  const legend = legendNames.length
    ? `<ul class="legend">${legendNames.map((n, k) => `<li><i class="${cls(k)}"></i>${esc(n)}${round ? share(k) : ""}</li>`).join("")}</ul>`
    : "";
  // Drawn at about the width it will be shown at, so labels stay legible.
  const W = side ? 240 : chartWidth;
  // Too narrow for axes (a chart in a four-across tile): a sparkline, just the data.
  const spark = !round && type !== "radar" && type !== "horizontal" && W < 170;
  const H = side ? 240 : round || type === "radar" ? Math.round(W * 0.45) + 40 : spark ? Math.round(W * 0.42) : Math.round(W * 0.36) + 24;
  let svg = "";
  if (round) {
    const r = Math.min(W, H) / 2 - 8;
    const cx = W / 2, cy = H / 2, ri = type === "donut" ? r * 0.6 : 0;
    let a0 = -Math.PI / 2;
    const p = (rad: number, ang: number) => `${f1(cx + rad * Math.cos(ang))},${f1(cy + rad * Math.sin(ang))}`;
    svg = vals
      .map((v, k) => {
        const a1 = a0 + (2 * Math.PI * v) / total;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const d = ri
          ? `M${p(r, a0)}A${r},${r} 0 ${large} 1 ${p(r, a1)}L${p(ri, a1)}A${ri},${ri} 0 ${large} 0 ${p(ri, a0)}Z`
          : `M${cx},${cy}L${p(r, a0)}A${r},${r} 0 ${large} 1 ${p(r, a1)}Z`;
        a0 = a1;
        return `<path class="slice ${cls(k)}" d="${d}"/>`;
      })
      .join("");
  } else if (type === "radar") {
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 28, n = labels.length || 1;
    const max = Math.max(...series.flatMap((s) => s.values).filter(Number.isFinite), 1);
    const pt = (k: number, v: number) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * k) / n;
      return `${f1(cx + (r * v * Math.cos(ang)) / max)},${f1(cy + (r * v * Math.sin(ang)) / max)}`;
    };
    svg =
      [1 / 3, 2 / 3, 1].map((f) => `<polygon class="ring" points="${labels.map((_, k) => pt(k, max * f)).join(" ")}"/>`).join("") +
      labels.map((lab, k) => {
        const [x, y] = pt(k, max * 1.18).split(",");
        return `<text x="${x}" y="${(+y + 4).toFixed(1)}" text-anchor="middle">${esc(lab)}</text>`;
      }).join("") +
      series.map((s, j) => `<polygon class="radar ${cls(j)}" points="${s.values.map((v, k) => pt(k, Number.isFinite(v) ? v : 0)).join(" ")}"/>`).join("");
  } else {
    const horizontal = type === "horizontal";
    const stacked = type === "stacked";
    const finite = series.flatMap((s) => s.values).filter(Number.isFinite);
    const sums = labels.map((_, i) => series.reduce((a, s) => a + (Number.isFinite(s.values[i]) ? Math.max(0, s.values[i]) : 0), 0));
    const lineLike = type === "line" || type === "area" || type === "scatter";
    let lo = Math.min(...finite, 0);
    let hi = Math.max(...(stacked ? sums : finite), 0);
    // Lines that never come near zero get an axis fitted to their range.
    if (lineLike && finite.length && Math.min(...finite) > 0 && Math.min(...finite) > (hi - Math.min(...finite)) * 1.5) lo = Math.min(...finite);
    const ticks = niceTicks(lo, hi || 1);
    lo = ticks[0];
    hi = ticks[ticks.length - 1];
    const tl = tickFmt(ticks);
    const L = spark ? 2 : horizontal ? Math.min(120, W * 0.3) : 40, R = spark ? 2 : 8, T = spark ? 4 : 8, B = spark ? 4 : horizontal ? 24 : 28;
    const pw = W - L - R, ph = H - T - B;
    if (horizontal) {
      const x = (v: number) => L + ((v - lo) / (hi - lo || 1)) * pw;
      const bh = ph / Math.max(labels.length, 1);
      svg =
        ticks.map((t, k) => `<line class="grid" x1="${f1(x(t))}" x2="${f1(x(t))}" y1="${T}" y2="${T + ph}"/><text x="${f1(x(t))}" y="${H - 6}" text-anchor="middle">${tl[k]}</text>`).join("") +
        labels.map((lab, i) => {
          const h = Math.min(22, (bh * 0.66) / series.length);
          const top = T + i * bh + (bh - h * series.length) / 2;
          return (
            series.map((s, j) => {
              const v = Number.isFinite(s.values[i]) ? s.values[i] : 0;
              return `<rect class="${cls(j)}" x="${f1(x(Math.min(0, v)))}" y="${f1(top + j * h)}" width="${f1(Math.abs(x(v) - x(0)))}" height="${f1(h - 2)}" rx="2"/>`;
            }).join("") + `<text x="${L - 8}" y="${f1(T + i * bh + bh / 2 + 4)}" text-anchor="end">${esc(lab.length > 16 ? lab.slice(0, 15) + "…" : lab)}</text>`
          );
        }).join("");
    } else {
      const y = (v: number) => T + ph - ((v - lo) / (hi - lo || 1)) * ph;
      const bw = pw / Math.max(labels.length, 1);
      const shown = axisLabels(labels);
      // Every k-th label, as many characters as its share of the axis holds
      // (12px text is up to about 7px a character), kept inside the chart's edges.
      const every = Math.ceil(labels.length / Math.max(3, Math.floor(pw / 70)));
      const room = Math.max(4, Math.floor((bw * every - 10) / 7));
      svg = spark ? "" :
        ticks.map((t, k) => `<line class="${t === 0 ? "base" : "grid"}" x1="${L}" x2="${W - R}" y1="${f1(y(t))}" y2="${f1(y(t))}"/><text x="${L - 8}" y="${f1(y(t) + 4)}" text-anchor="end">${tl[k]}</text>`).join("") +
        shown.map((lab, i) => {
          if (i % every) return "";
          const t = lab.length > room ? lab.slice(0, room - 1) + "…" : lab;
          const half = t.length * 3.5;
          const x = Math.min(Math.max(L + bw * i + bw / 2, half), W - half);
          return `<text x="${f1(x)}" y="${H - 8}" text-anchor="middle">${esc(t)}</text>`;
        }).join("");
      if (lineLike) {
        svg += series.map((s, j) => {
          const pts = s.values.map((v, i) => (Number.isFinite(v) ? [L + bw * i + bw / 2, y(v)] : null)).filter((p): p is number[] => p !== null);
          if (type === "scatter") return pts.map(([px, py]) => `<circle class="${cls(j)}" cx="${f1(px)}" cy="${f1(py)}" r="4"/>`).join("");
          if (!pts.length) return "";
          const d = curve(pts);
          const area = type === "area" ? `<path class="fill ${cls(j)}" d="${d}L${f1(pts[pts.length - 1][0])},${f1(y(lo))}L${f1(pts[0][0])},${f1(y(lo))}Z"/>` : "";
          return `${area}<path class="line ${cls(j)}" d="${d}"/>`;
        }).join("");
      } else {
        svg += labels.map((_, i) => {
          let acc = 0;
          const group = stacked ? 1 : series.length;
          const w = Math.min(36, (bw * 0.64) / group);
          const start = L + bw * i + (bw - w * group) / 2;
          return series.map((s, j) => {
            const v = Number.isFinite(s.values[i]) ? s.values[i] : 0;
            const from = stacked ? acc : 0;
            const to = stacked ? acc + Math.max(0, v) : v;
            if (stacked) acc += Math.max(0, v);
            const xx = stacked ? start : start + j * w;
            return `<rect class="${cls(j)}" x="${f1(xx)}" y="${f1(y(Math.max(from, to)))}" width="${f1(Math.max(w - 2, 1))}" height="${f1(Math.abs(y(from) - y(to)))}" rx="2"/>`;
          }).join("");
        }).join("");
      }
    }
  }
  const label = esc(String(attrs.title ?? `${type} chart`));
  return `<figure class="chart${side ? " side" : ""}">${caption}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${svg}</svg>${legend}</figure>`;
}

// ---------- components ----------

/** An enum attribute's value, through the shared synonyms (spec/synonyms.json), or the fallback. */
const tone = (attr: string, v: unknown, allowed: string[], fallback: string) => {
  const s = String(v ?? "").toLowerCase();
  const t = allowed.includes(s) ? s : (synonym(attr, s) ?? s);
  return allowed.includes(t) ? t : fallback;
};
const list = (v: unknown) => String(v ?? "").split("|").map((x) => x.trim()).filter(Boolean);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let tabsCounter = 0;
// Forms the node being rendered is inside: there, Buttons submit.
let formDepth = 0;
// The width a chart will be shown at, so its 12px text stays 12px: the answer's
// content width at the top, a tile's inner width inside Columns.
const CONTENT_WIDTH = 700;
let chartWidth = CONTENT_WIDTH;

/** Whether any stat label would wrap at this column count (about 7px a character at label size). */
function labelsWrap(items: Child[], cols: number): boolean {
  const tile = (720 - (cols - 1) * 12) / cols - 32;
  return items.some((c) => typeof c !== "string" && String(c.attrs.label ?? "").length * 6.6 > tile);
}

/** Widest Markdown table inside a node, in columns. */
const SMALL = ["Stat", "Badge", "Progress", "Avatar", "Button", "Rating", "Price", "Sparkline", "Gauge", "Countdown", "QR"];
const DRAWN = ["Chart", "Map", "Heatmap", "Funnel", "Calendar", "Carousel", "Video", "Embed"];

/** The longest run of text in one block, all the text, and whether anything is drawn (charts, maps). */
function weigh(c: Child): { longest: number; total: number; drawn: boolean } {
  if (typeof c === "string") {
    const blocks = c.split(/\n\s*\n|\n(?=\s*[-*|#>]|\s*\d+\.)/).map((b) => b.replace(/<[^>]*>/g, "").trim().length);
    return { longest: Math.max(0, ...blocks), total: blocks.reduce((a, b) => a + b, 0), drawn: false };
  }
  const parts = c.children.map(weigh);
  return {
    longest: Math.max(0, ...parts.map((p) => p.longest)),
    total: parts.reduce((a, p) => a + p.total, 0),
    drawn: DRAWN.includes(c.name) || parts.some((p) => p.drawn),
  };
}

/** The core's Columns plan (rust/core/src/layout.rs). */
function columnsPlan(items: Child[]): { per: number; min: number } {
  const k = Math.max(1, items.length);
  const w = items.map(weigh);
  const longest = Math.max(0, ...w.map((x) => x.longest));
  const total = Math.max(0, ...w.map((x) => x.total));
  const small = items.every((c) => typeof c !== "string" && SMALL.includes(c.name));
  const [cap, min] = items.some((c) => maxTableCols(c) >= 4)
    ? [1, 0]
    : small
      ? [k === 5 ? 5 : 4, 140]
      : w.some((x) => x.drawn)
        ? [2, 280]
        : longest >= 90 || total >= 220
          ? [2, 260]
          : [3, 200];
  const per = k <= cap ? k : Math.ceil(k / Math.ceil(k / cap));
  return { per: Math.max(1, per), min };
}

/** Escaped text with IDs, dates, times, versions and codes kept on one line (as the core does). */
function keepIds(html: string): string {
  return html
    .split(/(<[^>]*>)/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/[^\s<>]+/g, (tok) => {
            const core = tok.replace(/^[(\[,;"']+|[)\],;"']+$/g, "");
            const id =
              (core.length >= 3 && core.length <= 32 && /\d/.test(core) && /[-/:._\u2013]/.test(core.replace(/[.:]+$/, "")) && !core.includes("://")) ||
              (core.length <= 40 && core.includes("@") && core.replace(/\.+$/, "").includes(".") && !core.includes("://"));
            // A dash between words: the line may break after it, never before it.
            if (id) return `<span class="nb">${tok}</span>`;
            // A long URL, path or code: it may break after a slash, never inside a part.
            if (tok.length > 32 && /[/;]/.test(tok))
              return tok
                .split(/(?<=[/;])/)
                .map((p) => (p.length > 1 && p.length <= 32 && /[\d\-_.]/.test(p) ? `<span class="nb">${p}</span>` : p))
                .join("<wbr>");
            return tok.replace(/[^\u2013\u2014]+[\u2013\u2014]/g, (w) => `<span class="nb">${w}</span>`);
          }),
    )
    .join("");
}

function maxTableCols(c: Child): number {
  if (typeof c === "string") {
    let max = 0;
    for (const l of c.split("\n")) if (l.trim().startsWith("|")) max = Math.max(max, cells(l).length);
    return max;
  }
  return Math.max(0, ...c.children.map(maxTableCols));
}

/** Longest Stat value inside a node, in characters. */
function longestValue(c: Child): number {
  if (typeof c === "string") return 0;
  return Math.max(c.name === "Stat" ? String(c.attrs.value ?? "").length : 0, ...c.children.map(longestValue));
}

function textOf(n: Node): string {
  return n.children.map((c) => (typeof c === "string" ? c : "")).join("");
}

function children(n: Node, depth: number): string {
  const out: string[] = [];
  let buttons: string[] = [];
  const flush = () => {
    if (buttons.length) out.push(`<div class="actions">${buttons.join("")}</div>`);
    buttons = [];
  };
  for (const c of n.children) {
    if (typeof c === "string") {
      if (!c.trim()) continue;
      flush();
      out.push(markdown(c, depth));
    } else if (c.name === "Button") {
      buttons.push(renderNode(c, depth));
    } else {
      flush();
      out.push(renderNode(c, depth));
    }
  }
  flush();
  return out.join("\n");
}

// ---------- device pack: web fallbacks with no JavaScript ----------

/** File types models name in accept="PDF | Images" as the browser's accept list. */
function acceptList(v: unknown): string {
  const known: Record<string, string> = { pdf: ".pdf,application/pdf", image: "image/*", images: "image/*", photo: "image/*", photos: "image/*", video: "video/*", videos: "video/*", audio: "audio/*" };
  return list(v).map((t) => known[t.toLowerCase()] ?? (/^[.\w-]+(\/[\w.*+-]+)?$/.test(t) ? t : "")).filter(Boolean).join(",");
}

/**
 * Places from the table inside a Map. Native renderers show a real map; the
 * page draws the places it has coordinates for as numbered pins on a plain
 * schematic (no map tiles, so no third-party requests and nothing for a CSP
 * to block) and lists every place with a link that opens it in a map.
 */
function map(attrs: Record<string, string | true>, text: string): string {
  const rows = text.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (!rows.length) return "";
  const head = cells(rows[0]).map((h) => h.toLowerCase());
  const body = rows.slice(rows.length > 1 && /^\|?\s*:?-{2,}/.test(rows[1]) ? 2 : 1).map(cells);
  const col = (re: RegExp) => head.findIndex((h, k) => k > 0 && re.test(h));
  const [latK, lngK, addrK] = [col(/^lat/), col(/^(lng|lon|long)/), col(/address|location|where/)];
  const places = body.map((r) => {
    const lat = latK > 0 ? Number(r[latK]) : NaN, lng = lngK > 0 ? Number(r[lngK]) : NaN;
    const known = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const rest = r.map((v, k) => (k > 0 && k !== latK && k !== lngK && k !== addrK && v ? v : "")).filter(Boolean);
    return { name: r[0] ?? "", address: addrK > 0 ? r[addrK] ?? "" : "", lat, lng, known, rest };
  });
  const link = (p: (typeof places)[number]) => esc(
    p.known
      ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=16/${p.lat}/${p.lng}`
      : `https://www.openstreetmap.org/search?query=${encodeURIComponent([p.name, p.address].filter(Boolean).join(", "))}`);
  const pinned = places.map((p, i) => ({ ...p, i })).filter((p) => p.known);
  let svg = "";
  if (pinned.length) {
    // Equirectangular, longitudes scaled by the latitude so distances look right.
    const W = chartWidth, H = Math.round(W * 0.5), pad = 28;
    const k = Math.cos((pinned.reduce((a, p) => a + p.lat, 0) / pinned.length) * (Math.PI / 180));
    const xs = pinned.map((p) => p.lng * k), ys = pinned.map((p) => -p.lat);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const scale = Math.min((W - 2 * pad) / (x1 - x0 || 1), (H - 2 * pad) / (y1 - y0 || 1));
    const px = (p: (typeof pinned)[number]) => [W / 2 + (p.lng * k - (x0 + x1) / 2) * scale, H / 2 + (-p.lat - (y0 + y1) / 2) * scale];
    const route = attrs.route === true || String(attrs.route) === "true";
    svg =
      `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(String(attrs.title ?? "Map"))}">` +
      (route && pinned.length > 1 ? `<path class="route" d="${pinned.map((p, j) => `${j ? "L" : "M"}${px(p).map(f1).join(",")}`).join("")}"/>` : "") +
      pinned.map((p) => {
        const [x, y] = px(p);
        return `<a href="${link(p)}"><circle class="pin" cx="${f1(x)}" cy="${f1(y)}" r="11"/><text x="${f1(x)}" y="${f1(y + 4)}" text-anchor="middle">${p.i + 1}</text></a>`;
      }).join("") +
      `</svg>`;
  }
  const items = places.map((p) =>
    `<li><a href="${link(p)}">${inline(p.name)}</a>${p.address ? `<small>${inline(p.address)}</small>` : ""}${p.rest.length ? `<small>${p.rest.map(inline).join(" · ")}</small>` : ""}</li>`,
  );
  const caption = attrs.title ? `<figcaption>${title(attrs.title)}</figcaption>` : "";
  return `<figure class="map">${caption}${svg}<ol class="places">${items.join("")}</ol></figure>`;
}

function field(label: string, control: string, hint: unknown) {
  return `<label class="field"><span>${esc(label)}</span>${control}${hint ? `<small>${esc(String(hint))}</small>` : ""}</label>`;
}

function renderNode(n: Node, depth: number): string {
  // Names models write on their own render as the component they mean.
  const alias = catalog.components[n.name] ? undefined : catalog.aliases[n.name]?.as;
  if (alias) return alias === "group" ? children(n, depth) : renderNode({ ...n, name: alias }, depth);
  const a = n.attrs;
  const s = (k: string) => (a[k] === undefined || a[k] === true ? "" : esc(String(a[k])));
  const name = String(a.name ?? slug(String(a.label ?? "field")));
  switch (n.name) {
    case "Card": {
      const h = depth ? 3 : 2;
      const header = a.title || a.subtitle ? `<header>${a.title ? `<h${h}>${title(a.title)}</h${h}>` : ""}${a.subtitle ? `<p>${s("subtitle")}</p>` : ""}</header>` : "";
      return `<section class="${depth ? "group" : "card"}">${header}${children(n, depth + 1)}</section>`;
    }
    case "Columns": {
      const items = n.children.filter((c) => typeof c !== "string" || c.trim());
      // Buttons side by side are a row of actions, not a grid.
      if (items.length && items.every((c) => typeof c !== "string" && c.name === "Button"))
        return `<div class="actions">${items.map((c) => renderNode(c as Node, depth)).join("")}</div>`;
      // The same plan as the core (rust/core/src/layout.rs): the most cells a
      // row holds and the narrowest a cell may get, by what the cells hold.
      const k = items.length;
      const allStats = items.every((c) => typeof c !== "string" && c.name === "Stat");
      const rich = items.some((c) => typeof c === "string" || !["Stat", "Badge", "Progress", "Avatar", "Button"].includes(c.name));
      const { per: perRow, min } = columnsPlan(items);
      const saved = chartWidth;
      if (perRow > 1) chartWidth = Math.round((saved - 12 * (perRow - 1)) / perRow - (rich ? 32 : 0));
      // A button next to a form field lines up with the field's control, not its hint.
      const field = items.some((c) => typeof c !== "string" && ["Input", "Select", "Date", "TextArea"].includes(c.name));
      // A long value ("12,847 / 15,000") makes every number in the row smaller, never cut.
      const longest = Math.max(0, ...items.map(longestValue));
      const classes = [
        "cols",
        `n${perRow}`,
        min && `m${min}`,
        rich && "rich",
        field && "with-field",
        allStats && labelsWrap(items, perRow) && "label2",
        longest > 16 ? "v17" : longest > 13 ? "v14" : longest > 11 ? "v12" : "",
      ].filter(Boolean).join(" ");
      const html = `<div class="${classes}">${items
        .map((c) => `<div class="cell">${typeof c === "string" ? markdown(c, depth) : renderNode(c, depth)}</div>`)
        .join("")}</div>`;
      chartWidth = saved;
      return html;
    }
    case "Column":
      return children(n, depth);
    case "Tabs": {
      const id = `t${++tabsCounter}`;
      const tabs = n.children.filter((c): c is Node => typeof c !== "string" && c.name === "Tab");
      const radios = tabs.map((_, k) => `<input type="radio" name="${id}" id="${id}-${k}"${k ? "" : " checked"}>`).join("");
      const labels = tabs.map((t, k) => `<label for="${id}-${k}">${title(t.attrs.title ?? `Tab ${k + 1}`)}</label>`).join("");
      return `<div class="tabs">${radios}<div class="tablist">${labels}</div><div class="panels">${tabs.map((t) => `<div>${children(t, depth)}</div>`).join("")}</div></div>`;
    }
    case "Tab":
      return children(n, depth);
    case "Details":
      return `<details${a.open === true || String(a.open) === "true" ? " open" : ""}><summary>${title(a.title)}</summary>${children(n, depth)}</details>`;
    case "Steps":
      return `<ol class="steps">${n.children.filter((c): c is Node => typeof c !== "string").map((c) => renderNode(c, depth)).join("")}</ol>`;
    case "Step":
      return `<li class="${tone("status", a.status, ["done", "current", "todo"], "todo")}"><strong>${title(a.title)}</strong>${String(a.subtitle ?? "").trim() ? `<small>${esc(String(a.subtitle))}</small>` : ""}${children(n, depth)}</li>`;
    case "Callout":
      return `<aside class="callout ${tone("tone", a.tone, ["neutral", "info", "success", "warning", "danger"], "info")}">${a.title ? `<strong>${title(a.title)}</strong>` : ""}${children(n, depth)}</aside>`;
    case "Stat": {
      const ch = String(a.change ?? "");
      // tone overrides the sign: a falling churn rate is good news.
      const t = tone("tone", a.tone, ["info", "success", "warning", "danger"], "");
      const dir = t ? t : /^[-−–]/.test(ch) ? "down" : ch ? "up" : "";
      // Always four parts, so a row of stats can align them on a shared grid.
      return `<div class="stat${t && !ch ? ` ${t}` : ""}"><span class="label">${s("label")}</span><span class="value">${s("value")}</span><span class="change ${dir}">${esc(ch)}</span><span class="note">${s("note")}</span></div>`;
    }
    case "Badge": {
      const t = tone("tone", a.tone, ["neutral", "info", "success", "warning", "danger"], "neutral");
      // The badge draws its own dot, so a bullet the model typed would double it.
      const text = textOf(n).trim();
      return `<span class="badge ${t}">${inline(t === "neutral" ? text : text.replace(/^[●○◉◎•■□▪▫◆◇▲△▼▽]\s*/u, ""))}</span>`;
    }
    case "Progress": {
      const max = Number(a.max ?? 100) || 100;
      const value = Number(a.value) || 0;
      const pt = tone("tone", a.tone, ["info", "success", "warning", "danger"], "");
      return `<div class="progress${pt ? ` ${pt}` : ""}">${a.label ? `<span>${s("label")}</span>` : ""}<progress value="${value}" max="${max}"></progress><small>${+((value / max) * 100).toFixed(value / max < 0.1 ? 1 : 0)}%</small></div>`;
    }
    case "Avatar": {
      const nm = String(a.name ?? "");
      const initials = nm.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
      return `<div class="avatar">${a.src ? `<img src="${s("src")}" alt="">` : `<span>${esc(initials)}</span>`}<div><strong>${esc(nm)}</strong>${a.subtitle ? `<small>${s("subtitle")}</small>` : ""}</div></div>`;
    }
    case "Gallery":
      return `<div class="gallery">${markdown(textOf(n), depth)}</div>`;
    case "Chart":
      return chart(a, textOf(n));
    case "FollowUps":
      return `<nav class="followups">${textOf(n).split("\n").map((l) => l.trim().match(/^([-*+]|\d+[.)])\s+(.*)$/)?.[2]).filter(Boolean).map((q) => `<a href="?ask=${encodeURIComponent(q!)}">${inline(q!)}</a>`).join("")}</nav>`;
    case "Form": {
      formDepth++;
      const inner = children(n, depth);
      formDepth--;
      return `<form method="post" enctype="multipart/form-data" class="form">${inner}</form>`;
    }
    case "Map":
      return map(a, textOf(n));
    case "Camera": {
      // capture opens the camera on phones; elsewhere it's a file picker for images.
      const facing = tone("facing", a.facing, ["back", "front"], "back") === "front" ? "user" : "environment";
      return field(String(a.label ?? ""), `<input type="file" name="${esc(name)}" accept="image/*" capture="${facing}"${a.multiple === true || String(a.multiple) === "true" ? " multiple" : ""}${a.required ? " required" : ""}>`, a.hint);
    }
    case "Scan":
      // Scanning needs a script or the app; the page takes the code typed, or a photo of it.
      return field(String(a.label ?? ""), `<input name="${esc(name)}" placeholder="Type the code"${a.required ? " required" : ""}><input type="file" name="${esc(name)}-photo" accept="image/*" capture="environment" aria-label="Or a photo of the code">`, a.hint);
    case "Location":
      // Reading the location needs a script or the app; the page asks for a place instead.
      return field(String(a.label ?? ""), `<input name="${esc(name)}" placeholder="City or address" autocomplete="street-address"${a.required ? " required" : ""}>`, a.hint);
    case "File": {
      const accept = acceptList(a.accept);
      return field(String(a.label ?? ""), `<input type="file" name="${esc(name)}"${accept ? ` accept="${esc(accept)}"` : ""}${a.multiple === true || String(a.multiple) === "true" ? " multiple" : ""}${a.required ? " required" : ""}>`, a.hint);
    }
    case "Input":
      return field(String(a.label ?? ""), `<input name="${esc(name)}" type="${tone("type", a.type, ["text", "email", "number", "password", "url", "tel", "search", "date", "time", "datetime-local"], "text")}"${a.step !== undefined ? ` step="${s("step")}"` : ""}${a.min ? ` min="${s("min")}"` : ""}${a.max ? ` max="${s("max")}"` : ""}${a.placeholder ? ` placeholder="${s("placeholder")}"` : ""}${a.value ? ` value="${s("value")}"` : ""}${a.required ? " required" : ""}>`, a.hint);
    case "TextArea":
      return field(String(a.label ?? ""), `<textarea name="${esc(name)}" rows="${Number(a.rows) || 3}"${a.placeholder ? ` placeholder="${s("placeholder")}"` : ""}${a.required ? " required" : ""}>${s("value")}</textarea>`, a.hint);
    case "Select":
      return field(String(a.label ?? ""), `<select name="${esc(name)}"${a.required ? " required" : ""}>${a.placeholder ? `<option value="">${s("placeholder")}</option>` : ""}${list(a.options).map((o) => `<option${String(a.value) === o ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`, a.hint);
    case "Date":
      return field(String(a.label ?? ""), `<input type="date" name="${esc(name)}"${a.value ? ` value="${s("value")}"` : ""}${a.required ? " required" : ""}>`, a.hint);
    case "Slider":
      return field(`${a.label ?? ""}`, `<input type="range" name="${esc(name)}" min="${s("min")}" max="${s("max")}"${a.step ? ` step="${s("step")}"` : ""}${a.value !== undefined ? ` value="${s("value")}"` : ""}><span class="range"><small>${s("min")}</small><small>${s("max")}</small></span>`, undefined);
    case "Checkboxes":
    case "Radio":
      return `<fieldset class="field"><legend>${s("label")}</legend>${list(a.options).map((o) => `<label class="choice"><input type="${n.name === "Radio" ? "radio" : "checkbox"}" name="${esc(name)}" value="${esc(o)}"${(n.name === "Radio" ? String(a.value) === o : list(a.value).includes(o)) ? " checked" : ""}${n.name === "Radio" && (a.required === true || String(a.required) === "true") ? " required" : ""}>${esc(o)}</label>`).join("")}${a.hint ? `<small>${s("hint")}</small>` : ""}</fieldset>`;
    case "Switch":
      return `<label class="switch"><input type="checkbox" role="switch" name="${esc(name)}"${a.value === true || String(a.value) === "true" ? " checked" : ""}><span>${s("label")}</span></label>`;
    case "Button": {
      const size = tone("size", a.size, ["small", "large"], "");
      const variant = `${tone("variant", a.variant, ["primary", "secondary", "tertiary", "danger"], "primary")}${size ? ` ${size}` : ""}`;
      const label = inline(textOf(n).trim() || (typeof a.label === "string" ? a.label : ""));
      if (a.disabled === true || String(a.disabled) === "true") return `<button class="btn ${variant}" disabled>${label}</button>`;
      if (a.href) return `<a class="btn ${variant}" href="${s("href")}">${label}</a>`;
      // Outside a form a Button asks: its ask text, or its label.
      if ((typeof a.ask === "string" && a.ask) || !formDepth)
        return `<a class="btn ${variant}" href="?ask=${encodeURIComponent(typeof a.ask === "string" && a.ask ? a.ask : textOf(n).trim())}">${label}</a>`;
      return `<button class="btn ${variant}">${label}</button>`;
    }
    default: {
      // The app's own drawing keeps its own classes (see prefixClasses).
      if (custom[n.name]) return `${OWN}${custom[n.name](a, { html: prefixClasses(children(n, depth)), text: textOf(n) })}${OWN_END}`;
      // A component with no renderer here (or no definition at all) still shows
      // what the model wrote: its attributes as a list, then its content.
      const listed = Object.entries(a).filter(([, v]) => v !== true && String(v).trim());
      const facts = catalog.components[n.name] && listed.length
        ? `<dl class="facts">${listed.map(([k, v]) => `<dt>${esc(k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase())}</dt><dd>${esc(String(v))}</dd>`).join("")}</dl>`
        : "";
      return facts ? `<section class="group">${facts}${children(n, depth + 1)}</section>` : children(n, depth);
    }
  }
}

const OWN = "\u0001", OWN_END = "\u0002";

/** Every class with ms- in front, as the core writes them (roadmap C5), outside what the app's own components drew. */
export function prefixClasses(html: string): string {
  return html
    .split(new RegExp(`(${OWN}[^${OWN_END}]*${OWN_END})`))
    .map((part) => (part.startsWith(OWN) ? part.slice(1, -1) : part.replace(/ class="([^"]*)"/g, (_, v: string) => ` class="${v.split(" ").filter(Boolean).map((c) => (c.startsWith("ms-") ? c : `ms-${c}`)).join(" ")}"`)))
    .join("");
}

export function render(answer: string, opts: { catalog?: Catalog; components?: Record<string, CustomRenderer> } = {}): string {
  catalog = opts.catalog ?? defaultCatalog;
  custom = opts.components ?? {};
  tabsCounter = 0;
  formDepth = 0;
  chartWidth = CONTENT_WIDTH;
  return prefixClasses(children(parse(protectInline(stripEmoji(unwrap(answer)))), 0));
}

export const css = readFileSync(join(here, "theme.css"), "utf8");
