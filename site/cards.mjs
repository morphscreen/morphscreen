// Every page's share card (Open Graph and X), 1200 x 630, drawn in Chrome
// from what site/build.mjs wrote to cards.nosync/manifest.json: the page's
// title and description in Archivo, and beside them real UI, tilted a
// little (an answer the core drew, a code sample, a frame of the page's
// video). Cards already drawn are kept in cards.nosync by name, so only a
// changed card is drawn again; all of them are copied into dist/og.
//
//   node site/build.mjs && node site/cards.mjs

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { launch } from "../sdk/web/browser.mjs";

const here = import.meta.dirname;
const dist = join(here, "dist.nosync");
const cache = join(here, "cards.nosync");
const require = createRequire(join(process.env.WEB_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web"), "package.json"));
const puppeteer = require("puppeteer-core");
const { answerCss, cards } = JSON.parse(readFileSync(join(cache, "manifest.json"), "utf8"));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MARK = `<svg viewBox="0 0 280 200" aria-hidden="true"><path d="M20,20 L100,20 L140,104 L180,20 L260,20 L260,180 L20,180 Z" fill="#f4f4f6"/></svg>`;
const DOTS = ["#f4f4f6", "#abdaff", "#fec7a9", "#98e3ec", "#e7d39c", "#fdc0d7", "#c9dda8", "#dbcaff", "#a9e4c3"];

// A title fills its space: shorter titles larger, never under 52px, and its
// longest word (a package name) always fits its line.
const size = (title, wide) => {
  const n = title.length;
  const by = wide ? (n <= 22 ? 112 : n <= 40 ? 96 : n <= 60 ? 80 : 64) : n <= 14 ? 88 : n <= 24 ? 76 : n <= 40 ? 64 : n <= 60 ? 56 : 52;
  const word = Math.max(...title.split(/[\s/]+/).map((w) => w.length));
  return Math.max(40, Math.min(by, Math.floor((wide ? 1056 : 560) / (word * 0.72))));
};

// A description cut to what fits, at a sentence or a clause, never mid-word.
function short(text, max) {
  let out = "";
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if ((out ? `${out} ${s}` : s).length > max) break;
    out = out ? `${out} ${s}` : s;
  }
  if (out) return out;
  const cut = text.slice(0, max);
  // A list after a colon goes whole, so the cut never leaves half of one.
  const at = [": ", "; ", ", "].map((sep) => cut.lastIndexOf(sep)).find((i) => i > max / 2) ?? -1;
  return at > 0 ? cut.slice(0, at) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

function visual(v) {
  if (v.type === "answer") return `<div class="panel answer"><div class="ms-answer">${v.html}</div></div>`;
  if (v.type === "code") return `<div class="panel code">${v.title ? `<div class="code__title">${esc(v.title)}</div>` : ""}<pre>${esc(v.code)}</pre></div>`;
  if (v.type === "image") return `<div class="panel shot"><img src="${esc(v.src)}" alt=""></div>`;
  return "";
}

function card({ spec }) {
  const wide = spec.visual.type === "none";
  return `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8">
<link rel="stylesheet" href="${answerCss}">
<style>
@font-face { font-family: Archivo; font-weight: 100 900; font-stretch: 62% 125%; src: url(/fonts/archivo-latin.woff2) format("woff2"); }
@font-face { font-family: "IBM Plex Mono"; font-weight: 400; src: url(/fonts/ibm-plex-mono-latin-400-normal.woff2) format("woff2"); }
html, body { margin: 0; background: #050506; }
body { width: 1200px; height: 630px; overflow: hidden; position: relative; font-family: Archivo, sans-serif; color: #f4f4f6; -webkit-font-smoothing: antialiased; }
.text { position: absolute; left: 72px; top: 64px; bottom: 60px; width: ${wide ? 1056 : 560}px; display: flex; flex-direction: column; z-index: 2; }
.brand { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 650; letter-spacing: -0.01em; }
.brand svg { width: 44px; height: 32px; display: block; }
.brand span { color: #8d8d96; font-weight: 500; }
.section { margin-top: auto; font-size: 26px; color: #8d8d96; margin-bottom: 14px; }
h1 { margin: 0; font-size: ${size(spec.title, wide)}px; line-height: 1.02; font-weight: 640; letter-spacing: -0.03em; font-stretch: 108%; text-wrap: balance; overflow-wrap: anywhere; }
.section + h1, .brand + h1 { }
.text > h1:first-of-type { ${spec.section ? "" : "margin-top: auto;"} }
p { margin: 22px 0 0; font-size: 26px; line-height: 1.35; color: #b9b9c1; max-width: ${wide ? 900 : 540}px; display: -webkit-box; -webkit-line-clamp: ${wide ? 2 : 3}; -webkit-box-orient: vertical; overflow: hidden; }
.dots { position: absolute; right: 72px; top: 76px; display: flex; gap: 12px; }
.dots span { width: 14px; height: 14px; border-radius: 50%; }
.stage { position: absolute; left: 660px; top: 70px; width: 640px; height: 640px; perspective: 1600px; z-index: 1; }
.panel { width: 640px; height: 640px; overflow: hidden; border: 1px solid #26272c; border-radius: 14px; background: #0b0c0f; transform: rotateY(-16deg) rotateX(7deg) rotateZ(-1.5deg); transform-origin: 0 0; box-shadow: 0 30px 60px rgba(0, 0, 0, 0.55); }
.answer .ms-answer { padding: 28px 30px; font-size: 17px; display: grid; gap: 22px; }
.code { padding: 26px 30px; box-sizing: border-box; }
.code__title { font: 400 17px "IBM Plex Mono", monospace; color: #8d8d96; padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid #26272c; }
.code pre { margin: 0; font: 400 20px/1.55 "IBM Plex Mono", monospace; color: #e4e4ea; white-space: pre; }
.shot { background: #fff; }
.shot img { width: 100%; height: 100%; object-fit: cover; object-position: 0 0; display: block; }
</style></head><body>
<div class="text">
  <div class="brand">${MARK}MorphScreen${spec.docs ? " <span>docs</span>" : ""}</div>
  ${spec.section ? `<div class="section">${esc(spec.section)}</div>` : ""}
  <h1>${esc(spec.title).replace(/\//g, "/<wbr>")}</h1>
  <p>${esc(short(spec.description, wide ? 120 : 128))}</p>
</div>
${wide ? `<div class="dots">${DOTS.map((c) => `<span style="background:${c}"></span>`).join("")}</div>` : `<div class="stage">${visual(spec.visual)}</div>`}
</body></html>`;
}

// The site as it will be served, so the card finds its fonts and stylesheet.
const types = { ".css": "text/css", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };
const pages = new Map(cards.map((c, i) => [`/__card/${i}`, card(c)]));
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (pages.has(path)) return res.writeHead(200, { "content-type": "text/html" }).end(pages.get(path));
  const p = join(dist, path);
  if (!p.startsWith(dist) || !existsSync(p) || statSync(p).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

mkdirSync(join(dist, "og"), { recursive: true });
// A card is kept in the cache under its hashed name (the dashboard's and the
// status page's are served under a fixed one).
const kept = (c) => join(cache, c.cache ?? c.file);
const missing = cards.map((c, i) => [c, i]).filter(([c]) => !existsSync(kept(c)));
if (missing.length) {
  const browser = await launch(puppeteer);
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  // Nothing mid-animation: an answer's components arrive with motion otherwise.
  await tab.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  for (const [c, i] of missing) {
    await tab.goto(`http://127.0.0.1:${server.address().port}/__card/${i}`, { waitUntil: "networkidle0" });
    await tab.evaluate(() => document.fonts.ready);
    const out = kept(c);
    mkdirSync(dirname(out), { recursive: true });
    await tab.screenshot({ path: out, type: "png" });
    // Lossless, smaller: social sites refuse previews much over 300 KB.
    execFileSync("magick", [out, "-strip", "-define", "png:compression-level=9", "-define", "png:compression-filter=5", out]);
  }
  await browser.close();
}
server.close();
for (const c of cards) copyFileSync(kept(c), join(dist, c.file));
// The old single card's address keeps working, as the home page's card.
const home = cards.find((c) => c.file.startsWith("og/home."));
if (home) copyFileSync(kept(home), join(dist, "og.png"));
// Cards no page uses any more leave the cache.
const used = new Set(cards.map((c) => (c.cache ?? c.file).slice(3)));
for (const f of readdirSync(join(cache, "og"))) if (!used.has(f)) rmSync(join(cache, "og", f));
const big = cards.filter((c) => statSync(join(dist, c.file)).size > 300 * 1024).map((c) => c.file);
if (big.length) throw new Error(`share cards over 300 KB: ${big.join(", ")}`);
console.log(`site/dist.nosync/og: ${cards.length} share cards (${missing.length} drawn now)`);
