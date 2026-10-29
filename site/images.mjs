// The site's pictures, drawn in Chrome from HTML with the site's own faces:
// the Open Graph card (1200 x 630) and the icons. They're kept in
// site/static; run this again after changing the headline or the mark.
//
//   node site/build.mjs && node site/images.mjs

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { launch } from "../sdk/web/browser.mjs";

const here = import.meta.dirname;
const require = createRequire(join(process.env.WEB_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web"), "package.json"));
const puppeteer = require("puppeteer-core");
const font = (f) => `data:font/woff2;base64,${readFileSync(join(here, "dist/fonts", f)).toString("base64")}`;
const MARK = `<svg viewBox="0 0 280 200"><path d="M20,20 L100,20 L140,104 L180,20 L260,20 L260,180 L20,180 Z" fill="#f4f4f6"/></svg>`;
const DOTS = ["#f4f4f6", "#abdaff", "#fec7a9", "#98e3ec", "#e7d39c", "#fdc0d7", "#c9dda8", "#dbcaff", "#a9e4c3"];
const base = `<style>
@font-face { font-family: Archivo; font-weight: 100 900; font-stretch: 62% 125%; src: url(${font("archivo-latin.woff2")}) format("woff2"); }
html, body { margin: 0; background: #050506; }
body { font-family: Archivo, sans-serif; color: #f4f4f6; -webkit-font-smoothing: antialiased; }
</style>`;

const og = `${base}<div style="box-sizing:border-box;width:1200px;height:630px;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between">
  <div style="display:flex;align-items:center;gap:16px;font-size:34px;font-weight:650;letter-spacing:-0.01em"><span style="width:50px;height:36px;display:inline-block">${MARK}</span>MorphScreen</div>
  <div style="font-size:104px;line-height:0.98;font-weight:640;letter-spacing:-0.035em;font-stretch:112%;max-width:1000px">Let your model answer with real UI.</div>
  <div style="display:flex;align-items:center;justify-content:space-between;font-size:28px;color:#b9b9c1">
    <span>75 components, checked as they stream</span>
    <span style="display:flex;gap:12px">${DOTS.map((c) => `<span style="width:16px;height:16px;border-radius:50%;background:${c}"></span>`).join("")}</span>
  </div>
</div>`;

// The mark on black, its corners as the favicon's.
const icon = (size) => `${base}<div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:#050506"><span style="width:${size * 0.68}px;height:${size * 0.49}px;display:block">${MARK}</span></div>`;

const browser = await launch(puppeteer);
const page = await browser.newPage();
for (const [name, html, w, h] of [["og.png", og, 1200, 630], ["icon-512.png", icon(512), 512, 512], ["apple-touch-icon.png", icon(180), 180, 180], ["favicon-32.png", icon(32), 32, 32]]) {
  await page.setViewport({ width: w, height: h });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(here, "static", name), clip: { x: 0, y: 0, width: w, height: h } });
}
await browser.close();
console.log("site/static: og.png, icon-512.png, apple-touch-icon.png, favicon-32.png");
