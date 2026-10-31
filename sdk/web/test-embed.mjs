// Answers inside other people's pages (roadmap C6): every sample in
// test/fixtures/components.json drawn into a page built with Tailwind and
// shadcn/ui, one built with Bootstrap and one built with MUI, at 390 and
// 1280 px, light and dark. Two things must hold:
//   - the host keeps its look: every element of the page outside the
//     answers has the same computed style with the SDK's stylesheet and
//     answers in it as without them;
//   - the answers keep theirs: every element of every answer has the same
//     computed style, and the same size, as on our own page (plain.html,
//     nothing but the SDK), at the same width.
//   node sdk/web/test-embed.mjs            (needs node sdk/web/build.mjs first)
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { browserName, launch } from "./browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const esbuild = require("esbuild");
const embed = join(here, "example/embed");
const out = join(here, "example/build/embed");
mkdirSync(out, { recursive: true });

// The hosts' own builds: Tailwind compiled over its page with shadcn/ui's
// theme, Bootstrap's stylesheet, the MUI app bundled.
const twIn = join(out, "tailwind.in.css");
writeFileSync(twIn, `@import "${join(tools, "node_modules/tailwindcss/index.css")}";\n@source "${join(embed, "tailwind.html")}";\n${readFileSync(join(embed, "shadcn.css"), "utf8")}`);
execFileSync(join(tools, "node_modules/.bin/tailwindcss"), ["-i", twIn, "-o", join(out, "tailwind.css")], { stdio: "pipe" });
copyFileSync(require.resolve("bootstrap/dist/css/bootstrap.min.css"), join(out, "bootstrap.min.css"));
await esbuild.build({
  entryPoints: [join(embed, "mui.tsx")],
  outfile: join(out, "mui.js"),
  bundle: true, format: "esm", jsx: "automatic", minify: true, target: "es2022",
  nodePaths: [join(tools, "node_modules")], define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning",
});

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const path = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!path.startsWith(repo) || !existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/sdk/web/example/embed`;
// With reduced motion, which the SDK honours (test-motion.mjs): every chart
// and transition at its end, so what's compared is styling, not a frame.
const browser = await launch(puppeteer, [], { "ui.prefersReducedMotion": 1 });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

// Read in the page: the computed style of each element, by its place in the tree.
function snapshot(which) {
  const LOOK = [
    "display", "position", "float", "box-sizing", "visibility", "opacity",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
    "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    "border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius",
    "color", "background-color", "background-image", "box-shadow",
    "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
    "text-align", "text-transform", "text-decoration-line", "text-indent", "white-space", "vertical-align",
    "list-style-type", "list-style-position", "cursor", "outline-style", "outline-width", "outline-color",
    "gap", "grid-template-columns", "flex-direction", "flex-wrap", "align-items", "justify-content",
    "overflow-x", "overflow-y", "fill", "stroke", "stroke-width", "max-width", "min-width",
    "appearance", "accent-color", "caret-color", "table-layout", "border-collapse", "border-spacing",
  ];
  const sides = ["top", "right", "bottom", "left"];
  /** One element's look; a border's colour and style only where it's drawn, an outline's only where there is one. */
  const look = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo);
    const o = {};
    for (const p of LOOK) o[p] = cs.getPropertyValue(p);
    for (const s of sides) {
      if (o[`border-${s}-width`] === "0px" || o[`border-${s}-style`] === "none") {
        delete o[`border-${s}-color`];
        delete o[`border-${s}-style`];
      }
    }
    if (o["outline-style"] === "none") {
      delete o["outline-color"];
      delete o["outline-width"];
    }
    return o;
  };
  const skip = (el) => ["SCRIPT", "STYLE", "LINK", "NOSCRIPT", "META", "TITLE", "HEAD"].includes(el.tagName);
  const ours = (el) => [...el.classList].some((c) => c.startsWith("ms-")) || el.closest("[data-sample]");
  const walk = (root, keep, path, out, sized) => {
    out[path] = look(root);
    if (root.id === "slot") delete out[path]["grid-template-columns"];
    if (sized) {
      const r = root.getBoundingClientRect();
      out[path].size = `${Math.round(r.width)}x${Math.round(r.height)}`;
      for (const pseudo of ["::before", "::after"]) {
        const c = getComputedStyle(root, pseudo).content;
        if (c && c !== "none" && c !== "normal") out[`${path}${pseudo}`] = look(root, pseudo);
      }
    }
    const counts = {};
    for (const child of root.children) {
      if (skip(child) || !keep(child)) continue;
      const tag = child.tagName.toLowerCase();
      counts[tag] = (counts[tag] ?? 0) + 1;
      walk(child, keep, `${path} > ${tag}:${counts[tag]}`, out, sized);
    }
  };
  const result = {};
  if (which === "host") {
    // The page outside the slot's answers, leaving out anything the SDK put
    // elsewhere; the slot's own tracks are its answers' to set.
    walk(document.documentElement, (el) => !ours(el), "html", result, false);
  } else {
    // An answer's own element is the app's: its box is the app's to set, its type ours.
    const appOwns = /^(display|position|float|box-sizing|min-width|max-width|margin-|padding-|border-|background-|box-shadow|overflow-|gap|grid-|flex-|align-|justify-)/;
    for (const a of document.querySelectorAll("[data-sample]")) {
      walk(a, () => true, a.dataset.sample, result, true);
      for (const p of Object.keys(result[a.dataset.sample])) if (appOwns.test(p) || p === "size") delete result[a.dataset.sample][p];
    }
  }
  return result;
}

const load = async (file, query) => {
  await page.goto(`${base}/${file}?${query}`, { waitUntil: "load" });
  // The scrollbar's room held open, with answers or without: where scrollbars
  // take space (Firefox on Linux) a page grown taller by its answers would
  // otherwise narrow, and a centred host move, with no style of it changed.
  await page.addStyleTag({ content: "html { overflow-y: scroll; }" });
  await page.waitForFunction(() => window.ready === true, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  // Charts and the rest settle after their first frame.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
  await new Promise((r) => setTimeout(r, 300));
};

/** Where two snapshots differ, grouped by what changed. */
function compare(a, b) {
  const found = new Map();
  for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!(path in a) || !(path in b)) {
      const k = `${path in a ? "missing" : "extra"} element`;
      found.set(k, [...(found.get(k) ?? []), path]);
      continue;
    }
    for (const p of new Set([...Object.keys(a[path]), ...Object.keys(b[path])])) {
      const [x, y] = [a[path][p], b[path][p]];
      if (x === y) continue;
      if (p === "size") {
        const [[w1, h1], [w2, h2]] = [x, y].map((s) => s.split("x").map(Number));
        if (Math.abs(w1 - w2) <= 1 && Math.abs(h1 - h2) <= 1) continue;
      }
      const k = `${p}: ${x ?? "(none)"} -> ${y ?? "(none)"}`;
      found.set(k, [...(found.get(k) ?? []), path]);
    }
  }
  return [...found].sort((x, y) => y[1].length - x[1].length);
}

const hosts = ["tailwind", "bootstrap", "mui"];
const failures = [];
let checked = 0;
for (const [width, height] of [[390, 844], [1280, 900]]) {
  // Firefox's driver can't switch the scheme, so there it's light only.
  for (const scheme of browserName === "chrome" ? ["light", "dark"] : ["light"]) {
    await page.setViewport({ width, height });
    if (browserName === "chrome") await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }]);
    for (const host of hosts) {
      const where = `${host} at ${width} px, ${scheme}`;
      await load(`${host}.html`, "sdk=0");
      const slot = await page.evaluate(() => document.getElementById("slot").clientWidth);
      const before = await page.evaluate(snapshot, "host");
      await load("plain.html", `sdk=1&width=${slot}`);
      const ours = await page.evaluate(snapshot, "answers");
      await load(`${host}.html`, `sdk=1&width=${slot}`);
      const after = await page.evaluate(snapshot, "host");
      const theirs = await page.evaluate(snapshot, "answers");
      checked += Object.keys(before).length + Object.keys(ours).length;
      for (const [what, paths] of compare(before, after)) failures.push(`${where}: the host changed, ${what} (${paths.length}: ${paths.slice(0, 2).join(" | ")})`);
      for (const [what, paths] of compare(ours, theirs)) failures.push(`${where}: answers differ from our page, ${what} (${paths.length}: ${paths.slice(0, 2).join(" | ")})`);
    }
  }
}
await browser.close();
server.close();
if (errors.length) failures.push(...errors.map((e) => `page error: ${e}`));
if (failures.length) {
  console.log(failures.slice(0, Number(process.env.SHOW ?? 120)).join("\n"));
  if (failures.length > Number(process.env.SHOW ?? 120)) console.log(`... and ${failures.length - Number(process.env.SHOW ?? 120)} more`);
  console.log(`embed: FAILED (${failures.length})`);
  process.exit(1);
}
console.log(`embed: ok (73 answers in Tailwind with shadcn/ui, Bootstrap and MUI pages, 2 widths x ${browserName === "chrome" ? "2 schemes" : "light"}; ${checked.toLocaleString("en-US")} elements compared, host and answers both unchanged)`);
