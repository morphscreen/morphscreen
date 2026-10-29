// The icon set (spec/icons.json) as the core's table. Run it after changing
// the list; test/icons.test.ts fails while the file is stale.
//   PHOSPHOR=<@phosphor-icons/core 2.1.1 package dir> node spec/icons.ts
//
// Each path is normalised to M, L, C and Z (arcs become cubic curves, H and
// V lines, S and Q full cubics), so SwiftUI and Compose need only those four,
// in whole units of Phosphor's 256-unit grid, relative after each subpath's
// start (still plain SVG path data).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
export const set: { names: string[]; aliases: Record<string, string> } = JSON.parse(readFileSync(join(here, "icons.json"), "utf8"));
export const out = join(root, "rust/core/src/icons.rs");

type Pt = [number, number];

/** An SVG path's commands: letter and numbers, arc flags read one digit each. */
function tokens(d: string): [string, number[]][] {
  const cmds: [string, number[]][] = [];
  let i = 0;
  const ws = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
  };
  const num = (): number => {
    ws();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i));
    if (!m) throw new Error(`number expected at ${i}: ${d.slice(i, i + 12)}`);
    i += m[0].length;
    return Number(m[0]);
  };
  const flag = (): number => {
    ws();
    const c = d[i++];
    if (c !== "0" && c !== "1") throw new Error(`flag expected at ${i}`);
    return Number(c);
  };
  const arity: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  while (true) {
    ws();
    if (i >= d.length) break;
    const c = d[i++];
    const n = arity[c.toLowerCase()];
    if (n === undefined) throw new Error(`command expected, got ${c}`);
    if (n === 0) {
      cmds.push([c, []]);
      continue;
    }
    // A command repeats while numbers follow; pairs after a move are lines.
    let k = 0;
    do {
      const args = c.toLowerCase() === "a" ? [num(), num(), num(), flag(), flag(), num(), num()] : Array.from({ length: n }, num);
      cmds.push([k++ > 0 && c === "M" ? "L" : k > 1 && c === "m" ? "l" : c, args]);
      ws();
    } while (i < d.length && /[-+.\d]/.test(d[i]));
  }
  return cmds;
}

/** An arc as cubic curves (SVG 1.1 F.6.5, then quarter turns at most). */
function arc(p0: Pt, rx: number, ry: number, phi: number, large: number, sweep: number, p: Pt): [Pt, Pt, Pt][] {
  if (rx === 0 || ry === 0) return [[p0, p, p]];
  const r = (phi * Math.PI) / 180;
  const [cos, sin] = [Math.cos(r), Math.sin(r)];
  const dx = (p0[0] - p[0]) / 2, dy = (p0[1] - p[1]) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const k = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0[0] + p[0]) / 2, cy = sin * cx1 + cos * cy1 + (p0[1] + p[1]) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / segs;
  const kk = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): Pt => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const der = (t: number): Pt => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out: [Pt, Pt, Pt][] = [];
  for (let s = 0; s < segs; s++) {
    const a = t1 + s * step, b = a + step;
    const [pa, pb, da, db] = [at(a), at(b), der(a), der(b)];
    out.push([[pa[0] + kk * da[0], pa[1] + kk * da[1]], [pb[0] - kk * db[0], pb[1] - kk * db[1]], s === segs - 1 ? p : pb]);
  }
  return out;
}

type Seg = { t: "M" | "L" | "C" | "Z"; pts: Pt[] };

/** Compact SVG path text: whole units, relative after each subpath's start,
 * no repeated letters, a space only where a number would run into the next. */
function encode(segs: Seg[]): string {
  let out = "";
  let last = "";
  let cur: Pt = [0, 0], start: Pt = [0, 0];
  const nums = (ns: number[]) => {
    for (const n of ns) {
      const t = String(Object.is(n, -0) ? 0 : n);
      if (out.length && /\d$/.test(out) && !t.startsWith("-")) out += " ";
      out += t;
    }
  };
  for (const s of segs) {
    const pts = s.pts.map(([x, y]): Pt => [Math.round(x), Math.round(y)]);
    if (s.t === "M") {
      out += "M";
      nums(pts[0]);
      cur = start = pts[0];
      last = "M";
    } else if (s.t === "Z") {
      out += "z";
      cur = start;
      last = "z";
    } else {
      const c = s.t === "L" ? "l" : "c";
      // (After "M" more pairs would be absolute lines, so "l" is always written there.)
      if (c !== last) out += c;
      nums(pts.flatMap(([x, y]) => [x - cur[0], y - cur[1]]));
      cur = pts[pts.length - 1];
      last = c;
    }
  }
  return out;
}

/** The path as M, L, C and Z, compactly encoded. */
export function normalise(d: string): string {
  const parts: Seg[] = [];
  let cur: Pt = [0, 0], start: Pt = [0, 0];
  let lastCtrl: Pt | null = null, lastQ: Pt | null = null;
  const C = (c1: Pt, c2: Pt, p: Pt) => parts.push({ t: "C", pts: [c1, c2, p] });
  for (const [cmd, a] of tokens(d)) {
    const rel = cmd === cmd.toLowerCase();
    const o: Pt = rel ? cur : [0, 0];
    const P = (x: number, y: number): Pt => [o[0] + x, o[1] + y];
    let ctrl: Pt | null = null, q: Pt | null = null;
    switch (cmd.toLowerCase()) {
      case "m": {
        cur = P(a[0], a[1]);
        start = cur;
        parts.push({ t: "M", pts: [cur] });
        break;
      }
      case "l":
      case "h":
      case "v": {
        const c = cmd.toLowerCase();
        cur = c === "l" ? P(a[0], a[1]) : c === "h" ? [(rel ? cur[0] : 0) + a[0], cur[1]] : [cur[0], (rel ? cur[1] : 0) + a[0]];
        parts.push({ t: "L", pts: [cur] });
        break;
      }
      case "c": {
        const [c1, c2, p] = [P(a[0], a[1]), P(a[2], a[3]), P(a[4], a[5])];
        C(c1, c2, p);
        ctrl = c2;
        cur = p;
        break;
      }
      case "s": {
        const c1: Pt = lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
        const [c2, p] = [P(a[0], a[1]), P(a[2], a[3])];
        C(c1, c2, p);
        ctrl = c2;
        cur = p;
        break;
      }
      case "q":
      case "t": {
        const qp: Pt = cmd.toLowerCase() === "q" ? P(a[0], a[1]) : lastQ ? [2 * cur[0] - lastQ[0], 2 * cur[1] - lastQ[1]] : cur;
        const p = cmd.toLowerCase() === "q" ? P(a[2], a[3]) : P(a[0], a[1]);
        C([cur[0] + (2 / 3) * (qp[0] - cur[0]), cur[1] + (2 / 3) * (qp[1] - cur[1])], [p[0] + (2 / 3) * (qp[0] - p[0]), p[1] + (2 / 3) * (qp[1] - p[1])], p);
        q = qp;
        cur = p;
        break;
      }
      case "a": {
        const p = P(a[5], a[6]);
        for (const [c1, c2, e] of arc(cur, a[0], a[1], a[2], a[3], a[4], p)) C(c1, c2, e);
        cur = p;
        break;
      }
      case "z": {
        parts.push({ t: "Z", pts: [] });
        cur = start;
        break;
      }
    }
    lastCtrl = ctrl;
    lastQ = q;
  }
  return encode(parts);
}

/** Phosphor's tags per icon, read from its catalog as text. */
function tags(dir: string): Map<string, string[]> {
  const src = readFileSync(join(dir, "dist/index.mjs"), "utf8");
  const out = new Map<string, string[]>();
  const re = /name: "([a-z0-9-]+)",\s*pascal_name:[^]*?tags: \[([^\]]*)\]/g;
  for (let m; (m = re.exec(src)); ) out.set(m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((t) => t[1]));
  return out;
}

/** The generated Rust table. */
export function rust(dir: string): string {
  const names = [...set.names].sort();
  const paths = names.map((n) => {
    const svg = readFileSync(join(dir, "assets/regular", `${n}.svg`), "utf8");
    return normalise([...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(" "));
  });
  // Aliases: ours first, then each Phosphor tag that only one icon in the set has.
  const alias = new Map<string, string>(Object.entries(set.aliases));
  const byTag = new Map<string, Set<string>>();
  const t = tags(dir);
  for (const n of names) for (const tag of t.get(n) ?? []) {
    const k = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!k || k.startsWith("new")) continue;
    (byTag.get(k) ?? byTag.set(k, new Set()).get(k)!).add(n);
  }
  for (const [k, ns] of byTag) if (ns.size === 1 && !alias.has(k) && !names.includes(k)) alias.set(k, [...ns][0]);
  const aliases = [...alias.entries()].filter(([k]) => !names.includes(k)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const q = (s: string) => JSON.stringify(s);
  return `// Generated from spec/icons.json by \`node spec/icons.ts\`: edit that file, not this one.
//
// Icons: a subset of Phosphor (https://phosphoricons.com), regular weight,
// @phosphor-icons/core 2.1.1. MIT License, Copyright (c) 2023 Phosphor Icons:
// permission is granted, free of charge, to use, copy, modify, merge,
// publish, distribute, sublicense and sell copies, provided this notice is
// included. The full license is in THIRD_PARTY_NOTICES.md.

/// (name, path on a 256-unit grid: M, then relative l, c and z), by name.
pub static ICONS: &[(&str, &str)] = &[
${names.map((n, k) => `    (${q(n)}, ${q(paths[k])}),`).join("\n")}
];

/// (a name models write, the icon it means), by name.
pub static ALIASES: &[(&str, &str)] = &[
${aliases.map(([a, n]) => `    (${q(a)}, ${q(n)}),`).join("\n")}
];
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.env.PHOSPHOR ?? join(process.env.HOME ?? "", ".cache/morphscreen/phosphor-2.1.1/package");
  if (!existsSync(join(dir, "assets/regular"))) {
    console.error("set PHOSPHOR to an unpacked @phosphor-icons/core 2.1.1");
    process.exit(1);
  }
  const text = rust(dir);
  writeFileSync(out, text);
  console.log(`wrote ${out.slice(root.length + 1)}: ${set.names.length} icons, ${text.length} bytes`);
}
