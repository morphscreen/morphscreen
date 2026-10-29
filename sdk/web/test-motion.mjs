// Motion (roadmap Q8): components fade in, sections rise and new words fade
// in as an answer streams, and with reduced motion nothing animates at all.
// Nothing the animations write is left behind (no word still in its fade's
// wrapper once it lands), and a table waits for its first row.
//   node sdk/web/build.mjs && node sdk/web/test-motion.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { browserName, launch, launchOptions } from "./browser.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  const p = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(repo) || !existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await launch(puppeteer);
const answer = readFileSync(join(repo, "test/fixtures/interactive.md"), "utf8") + "\n\n| Line | Rate (units/hr) | Last changeover |\n|---|---|---|\n| Line A – Injection | 1,420 | 2h 14m ago |\n| Line B – Extrusion | 890 | 5h 02m ago |\n\n\n<Card title=\"Notes\">\nA section that rises.\n</Card>\n\n<Chart type=\"bar\" title=\"Signups\">\n| Month | Signups |\n|---|---|\n| Jan | 120 |\n| Feb | 180 |\n</Chart>\n";
const failures = [];

async function streamed(motion) {
  // Firefox can't switch reduced motion per page: a browser of its own, with the preference set.
  const own = browserName === "firefox" ? await puppeteer.launch(launchOptions([], { "ui.prefersReducedMotion": motion === "reduce" ? 1 : 0 })) : null;
  const page = await (own ?? browser).newPage();
  page.on("pageerror", (e) => failures.push(e.message));
  // Safari can't switch it at all: it runs with the Mac's own setting (motion on).
  if (!own && browserName === "chrome") await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: motion }]);
  await page.setViewport({ width: 760, height: 900 });
  await page.goto(`http://127.0.0.1:${server.address().port}/bench/web/ours.html`);
  await page.waitForFunction("window.ready === true");
  // Count every animation that starts while the answer streams, and note
  // any table shown before it has a body row (its columns would then move).
  await page.evaluate(() => {
    window.bare = 0;
    new MutationObserver(() => {
      for (const t of document.querySelectorAll("#answer .ms-table:not([hidden])")) if (!t.querySelector("tbody tr")) window.bare++;
    }).observe(document, { subtree: true, childList: true, attributes: true });
    window.seen = new Set();
    window.words = 0;
    const fading = () => document.querySelectorAll("#answer ms-word").length;
    window.fading = fading;
    const watch = () => {
      for (const a of document.getAnimations()) window.seen.add(a);
      window.words = Math.max(window.words, fading());
      window.watching = requestAnimationFrame(watch);
    };
    watch();
  });
  await page.evaluate((t) => window.run(t, { chunk: 24, delay: 8, packs: ["interactive"] }), answer);
  await new Promise((r) => setTimeout(r, 400));
  const n = await page.evaluate(() => {
    cancelAnimationFrame(window.watching);
    for (const a of document.getAnimations()) window.seen.add(a);
    const kinds = new Set([...window.seen].map((a) => (a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? "").split(" ")[0]));
    return { count: window.seen.size, kinds: [...kinds], bare: window.bare, words: window.words, still: window.fading() };
  });
  // Once it all lands, nothing the animations wrote is left on the page.
  n.left = await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
    // Morphs run on animation frames, not as Web Animations: wait until the page stops changing (at most 3 s).
    const shot = () => [...document.querySelectorAll("#answer [style], #answer path")].map((e) => e.getAttribute("style") + (e.getAttribute("d") ?? "")).join("|");
    for (let k = 0, last = ""; k < 30; k++) {
      const now = shot();
      if (now === last) break;
      last = now;
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return [...document.querySelectorAll('#answer :is([style=""], [style*="opacity"], [style*="transform"])')].map((e) => `${e.tagName.toLowerCase()}.${e.className} style="${e.getAttribute("style")}"`);
  });
  await page.close();
  await own?.close();
  return n;
}

const moving = await streamed("no-preference");
const still = browserName === "safari" ? { count: 0 } : await streamed("reduce");
if (!(moving.count > 0 && moving.kinds.includes("ms-card"))) failures.push(`with motion, sections and components animate: ${JSON.stringify(moving)}`);
if (!(moving.words > 0)) failures.push(`with motion, new words fade in: ${JSON.stringify(moving)}`);
if (moving.still) failures.push(`${moving.still} words still in their fade's wrapper 400 ms after the answer ended`);
if (moving.bare) failures.push(`a table was shown with only its header (${moving.bare} times)`);
if (moving.left.length) failures.push(`styles left after the animations: ${moving.left.slice(0, 3).join(", ")}`);
if (still.count !== 0 || still.words) failures.push(`reduced motion animates nothing: ${JSON.stringify(still)}`);
await browser.close();
server.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`motion: ok (${moving.count} animations as it streams, up to ${moving.words} pieces of text fading in at once; ${browserName === "safari" ? "reduced motion left to Chrome and Firefox" : "none with reduced motion"})`);
