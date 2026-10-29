// MorphScreenUI (roadmap Z1): writes ui/dist/morphscreenui.css and its fonts from
// ui/morphscreenui.tokens.json and ui/theme.css, then checks them. The site, the
// dashboard, the admin and the status page all load that one stylesheet.
//   node ui/build.mjs           build, then check; exits 1 if a check fails
//   node ui/build.mjs check     check only
// The checks: every text and surface pair meets WCAG AA; the chart order passes
// the colour-blindness and contrast rules on black; marks stand out from their
// surface; and no stylesheet or component of ours colours text with anything but
// white, the three greys, or ink on a light fill.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const tokens = JSON.parse(readFileSync(join(here, "morphscreenui.tokens.json"), "utf8"));
const dist = join(here, "dist");

const color = tokens.color;
const hex = (t) => t.$value.hex;
const rgba = (t) => {
  const v = t.$value;
  if (v.alpha === undefined) return v.hex;
  const [r, g, b] = v.components.map((c) => Math.round(c * 255));
  return `rgb(${r} ${g} ${b} / ${v.alpha})`;
};
// The files whose text colours the lint holds to the rule.
const LINTED = ["ui/theme.css", "dashboard/src", "admin/src", "ops/status/ms-status.py", "site/src", "site/pages"];
const kebab = (s) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const pastels = Object.keys(color.pastel);

// ---- the stylesheet ---------------------------------------------------------

const latin = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const latinExt = "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF";

function fonts() {
  const face = (family, file, weight, range, extra = "") =>
    `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${weight};${extra} font-display: swap; src: url("fonts/${file}") format("woff2"); unicode-range: ${range}; }`;
  return [
    "/* Archivo (c) The Archivo Project Authors and IBM Plex Mono (c) IBM Corp., both SIL Open Font License 1.1 (fonts/*-OFL.txt). */",
    face("Archivo", "archivo-latin.woff2", "100 900", latin, " font-stretch: 62% 125%;"),
    face("Archivo", "archivo-latin-ext.woff2", "100 900", latinExt, " font-stretch: 62% 125%;"),
    ...["400", "500"].flatMap((w) => [face("IBM Plex Mono", `ibm-plex-mono-latin-${w}-normal.woff2`, w, latin), face("IBM Plex Mono", `ibm-plex-mono-latin-ext-${w}-normal.woff2`, w, latinExt)]),
    // Fallbacks sized to the real faces, so text hardly moves when they arrive: Archivo
    // sets 98.1% as wide as Arial at 400 (measured in Chrome on a line of our copy).
    `@font-face { font-family: "Archivo Fallback"; src: local("Arial"), local("Helvetica"), local("Liberation Sans"), local("Arimo"); size-adjust: 98%; ascent-override: 89.6%; descent-override: 21.4%; line-gap-override: 0%; }`,
    `@font-face { font-family: "IBM Plex Mono Fallback"; src: local("Menlo"), local("DejaVu Sans Mono"), local("Courier New"), local("Liberation Mono"); size-adjust: 99.7%; ascent-override: 102.8%; descent-override: 27.6%; line-gap-override: 0%; }`,
  ].join("\n");
}

function variables() {
  const v = [];
  const put = (name, value) => v.push(`  --msui-${name}: ${value};`);
  put("font-sans", tokens.font.sans.$value.map((f) => (/\s/.test(f) && !f.startsWith("ui-") ? `"${f}"` : f)).join(", "));
  put("font-mono", tokens.font.mono.$value.map((f) => (/\s/.test(f) && !f.startsWith("ui-") ? `"${f}"` : f)).join(", "));
  for (const [k, t] of Object.entries(color.ink)) if (!k.startsWith("$")) put(k, hex(t));
  put("text", hex(color.text.primary));
  put("text-2", hex(color.text.secondary));
  put("text-3", hex(color.text.tertiary));
  put("on-light", hex(color.text.onLight));
  for (const [k, t] of Object.entries(color.line)) put(kebab(k), rgba(t));
  for (const p of pastels) {
    put(p, hex(color.pastel[p].light));
    put(`${p}-tint`, hex(color.pastel[p].tint));
    put(`${p}-chart`, hex(color.pastel[p].chart));
  }
  for (const [i, t] of Object.entries(color.chart)) if (!i.startsWith("$")) put(`chart-${i}`, `var(--msui-${t.$value.match(/pastel\.(\w+)\.chart/)[1]}-chart)`);
  for (const [k, t] of Object.entries(tokens.space)) if (!k.startsWith("$")) put(`space-${k}`, `${t.$value.value}px`);
  for (const [k, t] of Object.entries(tokens.radius)) if (!k.startsWith("$")) put(`r-${k}`, `${t.$value.value}px`);
  for (const [k, t] of Object.entries(tokens.type)) {
    if (k.startsWith("$")) continue;
    const s = t.$value;
    const x = t.$extensions["com.morphscreen"];
    const size = s.fontSize.value;
    // Display steps grow with the viewport between their phone and desktop sizes.
    const fluid = x.fluidMin ? `clamp(${x.fluidMin}px, ${(x.fluidMin * 0.62).toFixed(1)}px + ${(((size - x.fluidMin) / 9.6) * 1.3).toFixed(2)}vw, ${size}px)` : `${size}px`;
    put(`${kebab(k)}-size`, fluid);
    put(`${kebab(k)}-line`, x.fluidMin ? `${s.lineHeight}` : `${Math.round(size * s.lineHeight)}px`);
    put(`${kebab(k)}-weight`, `${s.fontWeight}`);
    put(`${kebab(k)}-tracking`, s.letterSpacing.unit === "em" ? `${s.letterSpacing.value}em` : "0");
    put(`${kebab(k)}-width`, `${x.width}`);
  }
  for (const [k, t] of Object.entries(tokens.motion)) {
    if (t.$type === "duration") put(`dur-${k}`, `${t.$value.value}ms`);
    if (t.$type === "cubicBezier") put(kebab(k), `cubic-bezier(${t.$value.join(", ")})`);
  }
  for (const [k, t] of Object.entries(tokens.shadow)) {
    if (k.startsWith("$")) continue;
    put(`shadow-${k}`, t.$value.map((s) => `${s.offsetX.value}px ${s.offsetY.value}px ${s.blur.value}px ${s.spread.value}px rgb(0 0 0 / ${s.color.alpha})`).join(", "));
  }
  const squircle = Object.entries(tokens.radius)
    .filter(([, t]) => t.$extensions)
    .map(([k, t]) => `    --msui-r-${k}: ${t.$extensions["com.morphscreen"].squircle}px;`);
  const motion = Object.entries(tokens.motion)
    .filter(([, t]) => t.$type === "duration")
    .map(([k]) => `    --msui-dur-${k}: 0ms;`);
  return [
    "@layer msui.tokens {",
    ":root {",
    "  color-scheme: dark;",
    ...v,
    "}",
    "/* Continuous corners where the browser has them: the same visual radius takes a larger number. */",
    "@supports (corner-shape: squircle) {",
    "  :root {",
    ...squircle,
    "  }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  :root {",
    ...motion,
    "  }",
    "}",
    "}",
  ].join("\n");
}

function build() {
  mkdirSync(join(dist, "fonts"), { recursive: true });
  for (const f of readdirSync(join(here, "fonts"))) copyFileSync(join(here, "fonts", f), join(dist, "fonts", f));
  const css = [
    "/* MorphScreenUI. Generated by `node ui/build.mjs` from ui/morphscreenui.tokens.json and ui/theme.css: edit those, not this. */",
    // Ours come after hosanna-ui's layers, so the theme wins over the library and an app's own unlayered rules still win over both.
    "@layer hosanna.reset, hosanna.tokens, hosanna.base, hosanna.components, hosanna.utilities, msui.tokens, msui.theme;",
    fonts(),
    variables(),
    readFileSync(join(here, "theme.css"), "utf8"),
  ].join("\n");
  writeFileSync(join(dist, "morphscreenui.css"), css);
  console.log(`ui/dist/morphscreenui.css: ${(css.length / 1024).toFixed(1)} KB`);
}

// ---- the checks -------------------------------------------------------------

const lin = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const luminance = (h) => {
  const [r, g, b] = lin(h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const oklabOf = ([r, g, b]) => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
// Colour blindness as Machado, Oliveira and Fernandes (2009) model it, at full severity.
const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
};
const seen = (h, kind) => {
  const c = lin(h);
  if (!kind) return c;
  return MACHADO[kind].map((row) => Math.max(0, Math.min(1, row[0] * c[0] + row[1] * c[1] + row[2] * c[2])));
};
const deltaE = (a, b, kind) => {
  const [x, y] = [oklabOf(seen(a, kind)), oklabOf(seen(b, kind))];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

function check() {
  const failures = [];
  const need = (ok, what) => {
    if (!ok) failures.push(what);
  };
  const ink = Object.fromEntries(Object.entries(color.ink).map(([k, t]) => [k, hex(t)]));
  const text = Object.fromEntries(Object.entries(color.text).map(([k, t]) => [k, hex(t)]));

  // Text on every surface it sits on: 4.5:1, as WCAG AA asks of body text.
  const onDark = { primary: ["ground", "base", "raised", "control", "pressed"], secondary: ["ground", "base", "raised", "control", "pressed"], tertiary: ["ground", "base", "raised", "control"] };
  let worst = [99, ""];
  for (const [t, surfaces] of Object.entries(onDark))
    for (const s of surfaces) {
      const r = contrast(text[t], ink[s]);
      if (r < worst[0]) worst = [r, `${t} on ${s}`];
      need(r >= 4.5, `text ${t} on ${s}: ${r.toFixed(2)}:1, under 4.5`);
    }
  // Ink on a light fill: the white button and every pastel.
  for (const fill of [text.primary, ...pastels.map((p) => hex(color.pastel[p].light))]) need(contrast(text.onLight, fill) >= 4.5, `ink on ${fill}: under 4.5:1`);
  // White text on each tint, where a badge's words sit.
  for (const p of pastels) need(contrast(text.primary, hex(color.pastel[p].tint)) >= 4.5, `white on the ${p} tint: under 4.5:1`);
  // A mark (a dot, an icon, a ring) in a pastel stands out from every surface and from its own tint: 3:1, as WCAG asks of graphics.
  for (const p of pastels) for (const s of ["ground", "base", "raised", "control", "pressed"]) need(contrast(hex(color.pastel[p].light), ink[s]) >= 3, `the ${p} mark on ${s}: under 3:1`);
  for (const p of pastels) need(contrast(hex(color.pastel[p].light), hex(color.pastel[p].tint)) >= 3, `the ${p} mark on its tint: under 3:1`);

  // The chart order, on a card: lightness in the dark band, enough colour, neighbours apart for every reader, 3:1 against the card.
  const order = Object.entries(color.chart).filter(([k]) => !k.startsWith("$")).map(([, t]) => hex(color.pastel[t.$value.match(/pastel\.(\w+)\.chart/)[1]].chart));
  let cvd = [99, ""];
  let normal = [99, ""];
  for (const [i, c] of order.entries()) {
    const [L, a, b] = oklabOf(lin(c));
    need(L >= 0.48 && L <= 0.67, `chart ${i + 1} ${c}: lightness ${L.toFixed(3)} outside 0.48 to 0.67`);
    need(Math.hypot(a, b) >= 0.1, `chart ${i + 1} ${c}: chroma ${Math.hypot(a, b).toFixed(3)} under 0.10, reads grey`);
    need(contrast(c, ink.base) >= 3, `chart ${i + 1} ${c}: ${contrast(c, ink.base).toFixed(2)}:1 on a card, under 3`);
    if (i === 0) continue;
    for (const kind of ["protan", "deutan"]) {
      const d = deltaE(order[i - 1], c, kind);
      if (d < cvd[0]) cvd = [d, `${order[i - 1]} and ${c} (${kind})`];
    }
    const d = deltaE(order[i - 1], c);
    if (d < normal[0]) normal = [d, `${order[i - 1]} and ${c}`];
  }
  need(cvd[0] >= 8, `chart neighbours ${cvd[1]}: ΔE ${cvd[0].toFixed(1)} for colour-blind readers, under 8`);
  need(normal[0] >= 15, `chart neighbours ${normal[1]}: ΔE ${normal[0].toFixed(1)}, under 15`);

  // No coloured text: every `color:` in our stylesheets and components is white, a grey, or ink on a light fill.
  const allowed = /^(var\(--msui-(text|text-2|text-3|on-light)\)|var\(--hos-fg(-muted|-subtle|-on-accent|-inverted)?\)|inherit|currentcolor|transparent|unset|initial)$/i;
  const literal = new Set([text.primary, text.secondary, text.tertiary, text.onLight].map((h) => h.toLowerCase()));
  // Each surface joins this list as it moves to MorphScreenUI (Z3, Z4, N1).
  const sources = LINTED.flatMap((path) => {
    try {
      return readdirSync(join(repo, path), { recursive: true })
        .filter((f) => /\.(css|tsx|html|py)$/.test(f))
        .map((f) => join(path, f));
    } catch {
      return [path];
    }
  });
  const bad = [];
  for (const file of sources) {
    let src;
    try {
      src = readFileSync(join(repo, file), "utf8");
    } catch {
      continue;
    }
    // CSS `color: x`, and a React style's `color: "x"`.
    for (const m of src.matchAll(/(?<![-\w])color\s*:\s*(?:"([^"]*)"|'([^']*)'|([^;}\n]+))/g)) {
      // A var()'s fallback doesn't count: the variable is what's read.
      const v = (m[1] ?? m[2] ?? m[3]).trim().replace(/,$/, "").replace(/^var\((--[\w-]+),.*\)$/, "var($1)");
      if (allowed.test(v) || literal.has(v.toLowerCase())) continue;
      const line = src.slice(0, m.index).split("\n").length;
      // A colour on an icon or a dot says so at the end of its line.
      if (/(\/\*|\/\/)\s*mark\b/.test(src.split("\n")[line - 1])) continue;
      bad.push(`${file}:${line} color: ${v}`);
    }
  }
  for (const b of bad) need(false, `coloured text at ${b}`);

  const summary = `text contrast at least ${worst[0].toFixed(2)}:1 (${worst[1]}); chart neighbours ΔE ${cvd[0].toFixed(1)} colour-blind, ${normal[0].toFixed(1)} normal; ${sources.length} file${sources.length === 1 ? "" : "s"} free of coloured text`;
  if (failures.length) {
    console.error(failures.map((f) => "FAIL " + f).join("\n"));
    console.error(`${failures.length} failed`);
    process.exit(1);
  }
  console.log("MorphScreenUI checks pass: " + summary);
}

if (process.argv[2] !== "check") build();
check();
