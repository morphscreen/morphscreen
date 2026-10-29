// A theme: everything an answer's look depends on (faces and type scale,
// colour roles in light, dark and mono, corners, spacing, depth, motion), read
// from and written to the W3C Design Tokens format (DTCG, 2025.10). Our own
// theme is spec/theme.tokens.json; applyTheme here, SwiftUI's Theme.use and
// Compose's MorphTheme read the same file. spec/tokens.ts uses this file to
// generate the platforms' default themes, so it imports nothing.

export type Mode = "light" | "dark" | "mono";
export const modes: Mode[] = ["light", "dark", "mono"];

/** The colour roles, in the order every platform lists them. */
export const roles = [
  "page", "surface", "tile", "ink", "ink2", "ink3", "line", "line2", "focus",
  "accent", "accentInk", "accentBg", "primary", "primaryInk", "good", "goodBg", "warn", "warnBg", "bad", "badBg", "info", "infoBg", "star",
] as const;
/** Roles a theme may leave out, and the role each takes instead: a primary button
 *  and a chosen slot are filled with the brand colour when the theme names one,
 *  in ink otherwise (themes written before these roles keep their look). */
export const optionalRoles: Partial<Record<Role, Role>> = { primary: "ink", primaryInk: "page" };
export type Role = (typeof roles)[number];

/** The type steps. Sizes and line heights in px (pt on Apple, sp on Android). */
export const steps = ["body", "callout", "footnote", "caption", "headline", "title3", "title2", "title", "mono", "display"] as const;
export type StepName = (typeof steps)[number];
export type Step = { family: "sans" | "mono"; size: number; line: number; weight: number; tracking: number; apple: string };

export type Shadow = { x: number; y: number; blur: number; spread: number; rgb: string; alpha: number };
export type Palette = { color: Record<Role, string>; series: string[]; shadow: { rest: Shadow[]; lifted: Shadow[] }; heat: number };

export type Theme = {
  font: { sans: string[]; mono: string[] };
  type: Record<StepName, Step>;
  space: { s1: number; s2: number; s3: number; s4: number; s5: number; s6: number };
  radius: { card: number; control: number; small: number };
  motion: { fast: number; base: number; slow: number; ease: number[]; spring: number[] };
  modes: Record<Mode, Palette>;
};

// ---------- Reading DTCG ----------

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = { [k: string]: Json };
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export class ThemeError extends Error {}

/** A token's value with aliases ("{color.light.accent}") followed, at any depth. */
function resolver(root: Obj) {
  const at = (path: string): Json => {
    let node: Json = root;
    for (const part of path.split(".")) {
      if (!isObj(node) || !(part in node)) throw new ThemeError(`no token at ${path}`);
      node = node[part];
    }
    if (!isObj(node) || !("$value" in node)) throw new ThemeError(`${path} is a group, not a token`);
    return node.$value;
  };
  const resolve = (v: Json, seen: string[] = []): Json => {
    if (typeof v === "string") {
      const m = /^\{([^{}]+)\}$/.exec(v);
      if (!m) return v;
      if (seen.includes(m[1])) throw new ThemeError(`alias loop: ${[...seen, m[1]].join(" -> ")}`);
      return resolve(at(m[1]), [...seen, m[1]]);
    }
    if (Array.isArray(v)) return v.map((x) => resolve(x, seen));
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, seen)]));
    return v;
  };
  return (path: string) => resolve(at(path), [path]);
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

/** A colour value: a DTCG colour object (srgb components or hex) or, as older files write it, a hex string. */
function color(v: Json, where: string): { hex: string; alpha: number } {
  if (typeof v === "string") {
    const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v);
    if (!m) throw new ThemeError(`${where}: not a colour: ${v}`);
    return { hex: `#${m[1].toLowerCase()}`, alpha: m[2] ? parseInt(m[2], 16) / 255 : 1 };
  }
  if (isObj(v)) {
    const alpha = typeof v.alpha === "number" ? v.alpha : 1;
    if (typeof v.hex === "string") return { hex: color(v.hex, where).hex, alpha };
    const c = v.components;
    if ((v.colorSpace ?? "srgb") === "srgb" && Array.isArray(c) && c.length === 3 && c.every((x) => typeof x === "number"))
      return { hex: `#${(c as number[]).map((x) => hex2(x * 255)).join("")}`, alpha };
  }
  throw new ThemeError(`${where}: not an sRGB colour`);
}

/** A dimension in px: { value, unit: "px" | "rem" } or a "16px" string. */
function dimension(v: Json, where: string): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = /^(-?[\d.]+)(px|rem)?$/.exec(v.trim());
    if (m) return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
  }
  if (isObj(v) && typeof v.value === "number") return v.unit === "rem" ? v.value * 16 : v.value;
  throw new ThemeError(`${where}: not a dimension`);
}

function duration(v: Json, where: string): number {
  if (typeof v === "string") {
    const m = /^([\d.]+)(ms|s)$/.exec(v.trim());
    if (m) return m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1]);
  }
  if (isObj(v) && typeof v.value === "number") return v.unit === "s" ? v.value * 1000 : v.value;
  throw new ThemeError(`${where}: not a duration`);
}

function bezier(v: Json, where: string): number[] {
  if (Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === "number")) return v as number[];
  throw new ThemeError(`${where}: not a cubic Bézier`);
}

function shadows(v: Json, where: string): Shadow[] {
  return (Array.isArray(v) ? v : [v]).map((s, i) => {
    if (!isObj(s)) throw new ThemeError(`${where}[${i}]: not a shadow`);
    const c = color(s.color, `${where}[${i}].color`);
    return { x: dimension(s.offsetX, where), y: dimension(s.offsetY, where), blur: dimension(s.blur, where), spread: dimension(s.spread ?? 0, where), rgb: c.hex, alpha: c.alpha };
  });
}

/** The theme in a DTCG file. Roles a file leaves out are an error, so a theme is always complete. */
export function readTheme(file: unknown): Theme {
  if (!isObj(file)) throw new ThemeError("a theme is a JSON object");
  const get = resolver(file);
  const fam = (k: string): string[] => {
    const v = get(`font.${k}`);
    return Array.isArray(v) ? v.map(String) : [String(v)];
  };
  const font = { sans: fam("sans"), mono: fam("mono") };
  const type = {} as Record<StepName, Step>;
  for (const k of steps) {
    const v = get(`type.${k}`);
    if (!isObj(v)) throw new ThemeError(`type.${k}: not a typography value`);
    const family = JSON.stringify(v.fontFamily) === JSON.stringify(font.mono) ? "mono" : "sans";
    const size = dimension(v.fontSize, `type.${k}.fontSize`);
    const lh = v.lineHeight;
    const line = typeof lh === "number" ? Math.round(size * lh) : dimension(lh, `type.${k}.lineHeight`);
    const weight = typeof v.fontWeight === "number" ? v.fontWeight : ({ regular: 400, normal: 400, medium: 500, "semi-bold": 600, semibold: 600, bold: 700 } as Record<string, number>)[String(v.fontWeight)] ?? 400;
    const tracking = v.letterSpacing === undefined ? 0 : dimension(v.letterSpacing, `type.${k}.letterSpacing`);
    const ext = (((file.type as Obj)?.[k] as Obj)?.$extensions as Obj)?.["com.morphscreen"] as Obj | undefined;
    type[k] = { family, size, line, weight, tracking, apple: typeof ext?.apple === "string" ? ext.apple : "body" };
  }
  const n = (path: string) => dimension(get(path), path);
  const space = { s1: n("space.s1"), s2: n("space.s2"), s3: n("space.s3"), s4: n("space.s4"), s5: n("space.s5"), s6: n("space.s6") };
  const radius = { card: n("radius.card"), control: n("radius.control"), small: n("radius.small") };
  const d = (path: string) => duration(get(path), path);
  const motion = { fast: d("motion.fast"), base: d("motion.base"), slow: d("motion.slow"), ease: bezier(get("motion.ease"), "motion.ease"), spring: bezier(get("motion.spring"), "motion.spring") };
  const palette = (m: Mode): Palette => {
    const c = {} as Record<Role, string>;
    const named = ((file.color as Obj)?.[m] ?? {}) as Obj;
    for (const r of roles) if (!(r in optionalRoles) || r in named) c[r] = color(get(`color.${m}.${r}`), `color.${m}.${r}`).hex;
    for (const [r, from] of Object.entries(optionalRoles) as [Role, Role][]) c[r] ??= c[from];
    const group = ((file.color as Obj)?.[m] as Obj)?.series;
    if (!isObj(group)) throw new ThemeError(`color.${m}.series: missing`);
    const series = Object.keys(group).filter((k) => !k.startsWith("$")).sort((a, b) => Number(a) - Number(b)).map((k) => color(get(`color.${m}.series.${k}`), `color.${m}.series.${k}`).hex);
    if (series.length < 2) throw new ThemeError(`color.${m}.series: at least two colours`);
    const heat = get(`heat.${m}`);
    if (typeof heat !== "number") throw new ThemeError(`heat.${m}: not a number`);
    return { color: c, series, shadow: { rest: shadows(get(`shadow.${m}.rest`), `shadow.${m}.rest`), lifted: shadows(get(`shadow.${m}.lifted`), `shadow.${m}.lifted`) }, heat };
  };
  return { font, type, space, radius, motion, modes: { light: palette("light"), dark: palette("dark"), mono: palette("mono") } };
}

// ---------- Writing DTCG ----------

const round = (x: number, d = 4) => Number(x.toFixed(d));
const colorValue = (hex: string, alpha = 1): Obj => ({
  colorSpace: "srgb",
  components: [1, 3, 5].map((i) => round(parseInt(hex.slice(i, i + 2), 16) / 255)),
  ...(alpha === 1 ? {} : { alpha }),
  hex,
});
const px = (value: number): Obj => ({ value, unit: "px" });
const shadowValue = (s: Shadow[]): Json => s.map((x) => ({ color: colorValue(x.rgb, x.alpha), offsetX: px(x.x), offsetY: px(x.y), blur: px(x.blur), spread: px(x.spread) }));

/** The theme as a DTCG file; readTheme gives the same theme back. */
export function writeTheme(t: Theme, description = ""): Obj {
  const tokens = (o: Record<string, Json>): Obj => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { $value: v }]));
  const palette = (m: Mode): Obj => ({
    ...Object.fromEntries(roles.map((r) => [r, { $value: colorValue(t.modes[m].color[r]) }])),
    series: tokens(Object.fromEntries(t.modes[m].series.map((c, i) => [String(i + 1), colorValue(c)]))),
  });
  return {
    ...(description ? { $description: description } : {}),
    font: { $type: "fontFamily", ...tokens({ sans: t.font.sans, mono: t.font.mono }) },
    type: {
      $type: "typography",
      ...Object.fromEntries(steps.map((k) => {
        const s = t.type[k];
        return [k, {
          $value: { fontFamily: `{font.${s.family}}`, fontSize: px(s.size), fontWeight: s.weight, lineHeight: round(s.line / s.size), letterSpacing: px(s.tracking) },
          $extensions: { "com.morphscreen": { apple: s.apple } },
        }];
      })),
    },
    space: { $type: "dimension", ...tokens(Object.fromEntries(Object.entries(t.space).map(([k, v]) => [k, px(v)]))) },
    radius: { $type: "dimension", ...tokens({ card: px(t.radius.card), control: px(t.radius.control), small: px(t.radius.small) }) },
    motion: {
      fast: { $type: "duration", $value: { value: t.motion.fast, unit: "ms" } },
      base: { $type: "duration", $value: { value: t.motion.base, unit: "ms" } },
      slow: { $type: "duration", $value: { value: t.motion.slow, unit: "ms" } },
      ease: { $type: "cubicBezier", $value: t.motion.ease },
      spring: { $type: "cubicBezier", $value: t.motion.spring },
    },
    color: { $type: "color", light: palette("light"), dark: palette("dark"), mono: palette("mono") },
    shadow: { $type: "shadow", ...Object.fromEntries(modes.map((m) => [m, tokens({ rest: shadowValue(t.modes[m].shadow.rest), lifted: shadowValue(t.modes[m].shadow.lifted) })])) },
    heat: { $type: "number", ...tokens(Object.fromEntries(modes.map((m) => [m, t.modes[m].heat]))) },
  };
}

// ---------- The web's CSS ----------

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/([a-z])(\d)/g, "$1-$2");
const family = (names: string[]) => names.map((f) => (/[\s"]/.test(f) ? `"${f.replace(/"/g, '\\"')}"` : f)).join(", ");
const cssPx = (n: number) => (n === 0 ? "0" : `${n}px`);
const alphaText = (a: number) => String(a).replace(/^0\./, ".");
const cssShadow = (s: Shadow[]) =>
  s.map((x) => `${cssPx(x.x)} ${cssPx(x.y)} ${cssPx(x.blur)}${x.spread ? ` ${cssPx(x.spread)}` : ""} rgba(${[1, 3, 5].map((i) => parseInt(x.rgb.slice(i, i + 2), 16)).join(", ")}, ${alphaText(x.alpha)})`).join(", ");

/** A palette's custom properties. */
function paletteVars(p: Palette): string[] {
  return [
    ...roles.map((r) => `--ms-${kebab(r)}: ${p.color[r]};`),
    ...p.series.map((c, i) => `--ms-c${i + 1}: ${c};`),
    `--ms-heat-max: ${Math.round(p.heat * 100)}%;`,
    `--ms-shadow-1: ${cssShadow(p.shadow.rest)};`,
    `--ms-shadow-2: ${cssShadow(p.shadow.lifted)};`,
  ];
}

/**
 * The theme as the web's custom properties: light on :root, dark with the
 * system or data-theme="dark", grayscale with data-theme="mono". `root` scopes
 * it (":root" for a page; a selector to theme one answer's container).
 */
export function themeCss(t: Theme, root = ":root"): string {
  const block = (sel: string, lines: string[], indent = "") => `${indent}${sel} {\n${lines.map((l) => `${indent}  ${l}`).join("\n")}\n${indent}}\n`;
  // On :root every palette weighs what :root alone does (:where adds nothing),
  // so an app's own `:root { --ms-accent: ... }` after this stylesheet wins in
  // light and dark alike.
  const at = (attr: string) => (root === ":root" ? `:root:where(${attr})` : `:root${attr} ${root}, ${root}${attr}`);
  // The scheme is a variable: an answer takes it (theme.css), our own pages too
  // (page.css), and a host page's own colours are left alone.
  const dark = [...paletteVars(t.modes.dark), "--ms-scheme: dark;"];
  const base = [
    `--ms-font: ${family(t.font.sans)};`,
    `--ms-mono: ${family(t.font.mono)};`,
    ...Object.entries(t.space).map(([k, v]) => `--ms-${k}: ${v}px;`),
    `--ms-r: ${t.radius.card}px; --ms-r-ctl: ${t.radius.control}px; --ms-r-sm: ${t.radius.small}px;`,
    ...steps.map((k) => `--ms-t-${k}: ${t.type[k].size}px; --ms-lh-${k}: ${t.type[k].line}px;`),
    `--ms-dur-fast: ${t.motion.fast}ms; --ms-dur: ${t.motion.base}ms; --ms-dur-slow: ${t.motion.slow}ms;`,
    `--ms-ease: cubic-bezier(${t.motion.ease.join(", ")});`,
    `--ms-spring: cubic-bezier(${t.motion.spring.join(", ")});`,
    ...paletteVars(t.modes.light),
    "--ms-scheme: normal;",
  ];
  const notPinned = root === ":root" ? ':root:where(:not([data-theme="light"]):not([data-theme="mono"]))' : `:root:not([data-theme="light"]):not([data-theme="mono"]) ${root}:not([data-theme="light"]):not([data-theme="mono"])`;
  return (
    block(root, base) +
    `@media (prefers-color-scheme: dark) {\n${block(notPinned, dark, "  ")}}\n` +
    block(at('[data-theme="dark"]'), dark) +
    block(at('[data-theme="mono"]'), [...paletteVars(t.modes.mono), "--ms-scheme: light;"])
  );
}

// ---------- Checks any theme must pass ----------

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mix = (a: string, b: string, t: number) => "#" + [1, 3, 5].map((i) => hex2(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t))).join("");

/**
 * Every text colour against every background it's drawn on, in each mode
 * (WCAG AA, 4.5:1): body text on every surface and tint, each tone and the
 * accent as text on its tint and on plain surfaces, the accent's ink on a
 * filled accent (a primary button), and ink on the strongest heatmap cell.
 * Returns what fails; an empty list is a pass.
 */
export function checkTheme(t: Theme): string[] {
  const fails: string[] = [];
  for (const m of modes) {
    const p = t.modes[m].color;
    const grounds: Role[] = ["page", "surface", "tile"];
    const tones = ["good", "warn", "bad", "info", "accent"] as const;
    const check = (fg: Role, bg: Role) => {
      const c = contrast(p[fg], p[bg]);
      if (c < 4.5) fails.push(`${m}: ${fg} on ${bg}: ${c.toFixed(2)}`);
    };
    for (const fg of ["ink", "ink2", "ink3"] as Role[]) for (const bg of [...grounds, ...tones.map((x) => `${x}Bg` as Role)]) check(fg, bg);
    for (const x of tones) for (const bg of [`${x}Bg` as Role, ...grounds]) check(x, bg);
    check("accentInk", "accent");
    check("primaryInk", "primary");
    const heat = mix(t.modes[m].series[0], p.surface, t.modes[m].heat);
    if (contrast(p.ink, heat) < 4.5) fails.push(`${m}: ink on the strongest heatmap cell: ${contrast(p.ink, heat).toFixed(2)}`);
  }
  return fails;
}

/** JSON for a theme file: one token per line where it fits, so a diff shows what changed. */
export function formatTheme(v: unknown, indent = ""): string {
  const inline = (x: unknown): string =>
    Array.isArray(x) ? `[${x.map(inline).join(", ")}]` : typeof x === "object" && x !== null ? `{ ${Object.entries(x).map(([k, y]) => `${JSON.stringify(k)}: ${inline(y)}`).join(", ")} }` : JSON.stringify(x);
  const one = inline(v);
  if (typeof v !== "object" || v === null || indent.length + one.length <= 110) return one;
  const inner = indent + "  ";
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + formatTheme(x, inner)).join(",\n")}\n${indent}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${formatTheme(x, inner)}`).join(",\n")}\n${indent}}`;
}

// ---------- In the page ----------

/**
 * Puts a theme (a DTCG file's JSON) on the page, after the SDK's stylesheet so
 * it wins. `scope` themes only the answers inside that selector; the page's
 * data-theme="dark" | "light" | "mono" still picks the mode. Applying again
 * with the same scope replaces the earlier theme. Throws ThemeError, naming
 * the token, when the file is incomplete or a value has the wrong type.
 */
export function applyTheme(tokens: unknown, options: { scope?: string; document?: Document } = {}): HTMLStyleElement {
  const doc = options.document ?? document;
  const scope = options.scope ?? ":root";
  const text = themeCss(readTheme(tokens), scope);
  let style = [...doc.querySelectorAll<HTMLStyleElement>("style[data-ms-theme]")].find((s) => s.dataset.msTheme === scope);
  if (!style) {
    style = doc.createElement("style");
    style.dataset.msTheme = scope;
  }
  style.textContent = text;
  doc.head.append(style); // last, so it follows the SDK's stylesheet
  return style;
}
