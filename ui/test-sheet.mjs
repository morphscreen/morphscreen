// Checks MorphScreenUI's dress on hosanna-ui's parts (roadmap Z2) in a real
// browser: the parts sheet (ui/sheet) at 390 and 1280 px, with axe; every
// word on it white or grey; each part's colours in each state as the board has
// them; the glass a lens in Chrome and a plain capsule elsewhere. Screenshots
// land in ui/out/ for a look.
//   node ui/build.mjs && node ui/test-sheet.mjs        (BROWSER=firefox for Firefox)
// Needs the dashboard's packages (react, hosanna-ui; see dashboard/build.mjs)
// and the web SDK's tools (esbuild, puppeteer-core, axe-core).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { browserName, launch } from "../sdk/web/browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webTools = process.env.WEB_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const modules = join(process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-dashboard"), "node_modules");
const require = createRequire(join(webTools, "package.json"));
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const out = join(here, "out/sheet");
mkdirSync(join(out, "fonts"), { recursive: true });
await esbuild.build({
  entryPoints: [join(here, "sheet/sheet.tsx")],
  outdir: out,
  entryNames: "sheet",
  bundle: true,
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  nodePaths: [modules],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});
for (const f of ["index.html", "sheet-layout.css"]) copyFileSync(join(here, "sheet", f), join(out, f));
copyFileSync(join(here, "dist/morphscreenui.css"), join(out, "morphscreenui.css"));
for (const f of readdirSync(join(here, "dist/fonts"))) copyFileSync(join(here, "dist/fonts", f), join(out, "fonts", f));

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const path = join(out, decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/\/$/, "/index.html"));
  if (!path.startsWith(out) || !existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await launch(puppeteer);
const problems = [];
const fail = (what) => problems.push(`${browserName}: ${what}`);
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const C = { text: rgb("#f4f4f6"), text2: rgb("#b9b9c1"), text3: rgb("#86868f"), ink: rgb("#050506"), sky: rgb("#abdaff"), mint: rgb("#a9e4c3"), lilac: rgb("#dbcaff"), rose: rgb("#cc7598"), roseTint: rgb("#341f27") };

for (const width of [390, 1280]) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await new Promise((r) => setTimeout(r, 400));

  // Nothing wider than the screen.
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (wide > 0) fail(`${width} px: the page scrolls sideways by ${wide} px`);

  // The faces arrived.
  const faces = await page.evaluate(() => [document.fonts.check('16px "Archivo"'), document.fonts.check('13px "IBM Plex Mono"')]);
  if (!faces[0]) fail(`${width} px: Archivo didn't load`);

  // Every word on the page is white, a grey, or ink on a light fill.
  const coloured = await page.evaluate((allowed) => {
    const bad = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el.checkVisibility()) continue;
      const c = getComputedStyle(el).color.replace(/rgba\((\d+), (\d+), (\d+), 1\)/, "rgb($1, $2, $3)");
      if (!allowed.includes(c)) bad.push(`"${n.textContent.trim().slice(0, 30)}" in ${c}`);
    }
    return bad;
  }, [C.text, C.text2, C.text3, C.ink]);
  for (const c of coloured) fail(`${width} px: coloured text ${c}`);

  await page.screenshot({ path: join(here, `out/sheet-${width}-${browserName}.png`), fullPage: true });
  await page.addScriptTag({ content: axeSource });
  const axe = await page.evaluate(async () => (await window.axe.run(document)).violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target}`));
  for (const v of axe) fail(`${width} px: axe ${v}`);

  if (width === 1280) {
    // Each part's colours, at rest and in its states.
    const style = (sel, prop) => page.evaluate((sel, prop) => getComputedStyle(document.querySelector(sel))[prop], sel, prop);
    const expect = async (what, got, want) => {
      if (got !== want) fail(`${what}: ${got}, want ${want}`);
    };
    await expect("primary button", await style("#b-primary", "backgroundColor"), C.text);
    await expect("primary button's words", await style("#b-primary", "color"), C.ink);
    await expect("button corners", await style("#b-primary", "borderTopLeftRadius"), "999px");
    await expect("switch on", await style("#s-on + .hos-switch__track", "backgroundColor"), C.mint);
    await expect("checkbox on", await style("#c-on + .hos-checkbox__box", "backgroundColor"), C.lilac);
    await expect("invalid field", await style(".hos-input:has([data-sheet=limit])", "borderTopColor"), C.rose);
    await expect("field error's words", await style(".hos-field__error", "color"), C.text2);
    await expect("danger button", await style(".hos-button[data-variant='danger']", "backgroundColor"), C.roseTint);
    await expect("danger button's words", await style(".hos-button[data-variant='danger']", "color"), C.text);
    // Keyboard focus and hover: Chrome and Firefox (Safari's WebDriver has no Shift+Tab).
    if (browserName !== "safari") {
      await page.focus("[data-sheet=name]");
      await page.keyboard.press("Tab");
      await page.keyboard.down("Shift");
      await page.keyboard.press("Tab");
      await page.keyboard.up("Shift");
      await expect("focused field's ring", await style(".hos-input:has([data-sheet=name])", "outlineColor"), C.sky);
      await page.hover("#b-primary");
      await new Promise((r) => setTimeout(r, 300));
      await expect("primary button, hovered", await style("#b-primary", "backgroundColor"), rgb("#ffffff"));
      await page.screenshot({ path: join(here, "out/sheet-states-1280.png") });
    }

    // Liquid glass: a lens where the browser can, a plain capsule where it can't.
    const filter = await style(".sheet-nav", "backdropFilter");
    if (browserName === "chrome" && !filter.includes("url(")) fail(`the glass has no lens in Chrome: ${filter}`);
    if (browserName !== "chrome" && filter.includes("url(")) fail(`the glass asks ${browserName} for a lens it can't draw: ${filter}`);

    await page.click("#open-dialog");
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: join(here, `out/sheet-dialog-${browserName}.png`) });
  }
  await page.close();
}

await browser.close();
server.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`the parts sheet passes in ${browserName} at 390 and 1280 px: axe 0, every word white or grey, each state as the board has it`);
