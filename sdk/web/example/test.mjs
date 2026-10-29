// Builds the example and checks it in headless Chrome: the answer streams,
// the app's own component mounts, the map goes live (when WebGL is there),
// and tapping a Button sends an ask action. Without WebGL the core's drawn
// map stays, never an empty box.
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");
mkdirSync(join(here, "build"), { recursive: true });
await esbuild.build({
  entryPoints: [join(here, "app.tsx")],
  outdir: join(here, "build"),
  bundle: true, format: "esm", splitting: true, jsx: "automatic", minify: true, target: "es2022",
  nodePaths: [join(tools, "node_modules")], define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning",
});
copyFileSync(require.resolve("maplibre-gl/dist/maplibre-gl.css"), join(here, "build/maplibre-gl.css"));
// MapLibre 6 starts its worker from maplibre-gl-worker.mjs beside the script that loaded it.
copyFileSync(require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs"), join(here, "build/maplibre-gl-worker.mjs"));

const root = join(here, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await launch(puppeteer, ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]);
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errors.push(`${r.status()} ${r.url()}`); });
if (process.argv.includes("--debug")) {
  await page.goto(`http://127.0.0.1:${server.address().port}/example/index.html`);
  await new Promise((r) => setTimeout(r, 4000));
  console.log(errors, (await page.evaluate(() => document.getElementById("app").innerHTML)).slice(0, 1500));
  process.exit(0);
}
await page.goto(`http://127.0.0.1:${server.address().port}/example/index.html`);
await page.waitForSelector(".product", { timeout: 15000 });
await page.waitForSelector("a.ms-btn", { timeout: 15000 });
await page.waitForFunction(() => document.querySelector(".ms-maplive canvas") || document.querySelector(".ms-map svg"), { timeout: 15000 });
await new Promise((r) => setTimeout(r, 1500));
const state = await page.evaluate(() => ({
  product: document.querySelector(".product")?.textContent,
  badge: document.querySelector(".ms-badge.ms-success")?.textContent,
  liveMap: !!document.querySelector(".ms-maplive canvas"),
  pins: document.querySelectorAll(".ms-maplive .ms-pin").length,
  places: document.querySelectorAll(".ms-places li").length,
}));
await page.click("a.ms-btn");
const actions = await page.evaluate(() => window.actions);

// A browser without WebGL (switched off, or a machine without it): MapLibre can't start.
const flat = await browser.newPage();
flat.on("pageerror", (e) => errors.push(String(e)));
await flat.evaluateOnNewDocument(() => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    return /webgl/i.test(kind) ? null : get.call(this, kind, ...rest);
  };
});
await flat.goto(`http://127.0.0.1:${server.address().port}/example/index.html`);
await flat.waitForSelector(".product", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 2500));
const noGl = await flat.evaluate(() => ({ drawnMap: !!document.querySelector(".ms-map svg"), emptyBox: !!document.querySelector(".ms-maplive"), drawnPins: document.querySelectorAll(".ms-map svg circle.ms-pin").length }));
await browser.close();
server.close();
const ok = state.product === "Kettle $40" && state.badge === "Open now" && state.places === 2 && actions[0]?.type === "ask" && actions[0]?.text === "Show more picks" && noGl.drawnMap && !noGl.emptyBox && noGl.drawnPins === 2 && !errors.length;
console.log(JSON.stringify({ ...state, action: actions[0], noGl, errors }, null, 1));
console.log(ok ? "example: ok" : "example: FAILED");
process.exit(ok ? 0 : 1);
