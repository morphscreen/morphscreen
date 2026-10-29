// Streaming (roadmap Q8): an answer streamed at a model's pace keeps showing
// what has arrived. A component is drawn from its complete lines as they come
// rather than breathing as a placeholder until it closes, a row of columns
// fills in cell by cell, a photo keeps the element it first got (so it isn't
// fetched and decoded again when its block closes), and the page still ends
// as the core's HTML.
//   node sdk/web/build.mjs && node sdk/web/test-stream.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { samePage } from "./same-page.mjs";
import { launch } from "./browser.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" };
const server = createServer((req, res) => {
  const p = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(repo) || !existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await launch(puppeteer);
const { samples, packs } = JSON.parse(readFileSync(join(repo, "test/fixtures/components.json"), "utf8"));

// The samples that sat longest behind a placeholder before (each 450 to 950 ms),
// and the ones with photos.
const ids = [
  "interactive-whatif-result", "interactive-quiz-question", "data-sparkline", "commerce-plan", "core-columns",
  "commerce-product", "core-stat", "commerce-compare", "interactive-flashcards", "device-map", "data-gauge",
  "core-gallery", "scheduling-agenda", "data-heatmap", "media-carousel", "core-markdown",
  "charts-in-columns",
];
// A dashboard's charts side by side (#243): each waited behind its placeholder
// until the whole row closed, about 1.3 s, a placeholder on screen most of the time.
const chart = (t) => `<Chart type="bar" title="${t}" y="$">\n| Month | Sales |\n|---|---|\n${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => `| ${m} | ${1000 + 137 * i} |\n`).join("")}</Chart>\n`;
const extra = [{ id: "charts-in-columns", md: `# Sales this year\n\n<Columns>\n${chart("Revenue by month")}${chart("Orders by month")}</Columns>\n` }];
// A model's pace: 12 characters every 30 ms. A photo written into the answer as data: arrives whole.
const per = 12, tick = 30;
// The longest the page may show a placeholder without anything new on it.
const stuckMax = 400;
const failures = [];

for (const id of ids) {
  const sample = samples.find((s) => s.id === id) ?? extra.find((s) => s.id === id);
  if (!sample) {
    failures.push(`${id}: no such sample in test/fixtures/components.json`);
    continue;
  }
  const page = await browser.newPage();
  page.on("pageerror", (e) => failures.push(`${id}: ${e.message}`));
  await page.setViewport({ width: 760, height: 900 });
  await page.goto(`http://127.0.0.1:${server.address().port}/bench/web/ours.html`);
  await page.waitForFunction("window.ready === true");
  const r = await page.evaluate(
    async (md, packs, per, tick) => {
      const { loadCore, createAnswer } = await import("/sdk/web/dist/index.js");
      const core = await loadCore("/sdk/web/dist/morphscreen.wasm");
      const el = document.getElementById("answer");
      // Every photo the page gets, and every placeholder while it's on screen.
      const photos = new Set();
      const shown = new Set();
      const mo = new MutationObserver((recs) => {
        for (const rec of recs)
          for (const n of rec.addedNodes)
            if (n.nodeType === 1) {
              for (const i of [n, ...n.querySelectorAll("img")]) if (i.tagName === "IMG") photos.add(i);
              for (const p of [n, ...n.querySelectorAll(".ms-pending")]) if (p.classList.contains("ms-pending")) shown.add(p);
            }
      });
      mo.observe(el, { childList: true, subtree: true });
      // Each frame: has the text on the page changed, or is no placeholder showing?
      let last = performance.now(), len = 0, stuck = 0, done = false;
      const watch = () => {
        const now = performance.now();
        const n = el.innerText.length;
        const waiting = [...shown].some((p) => p.isConnected);
        if (n !== len || !waiting) {
          len = n;
          last = now;
        } else stuck = Math.max(stuck, now - last);
        if (!done) requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
      const a = createAnswer(el, { core, packs, onAction: () => {} });
      const wait = () => new Promise((r) => setTimeout(r, tick));
      for (const part of md.split(/(data:[^)"\s]+)/)) {
        if (part.startsWith("data:")) {
          a.push(part);
          await wait();
        } else
          for (let i = 0; i < part.length; i += per) {
            a.push(part.slice(i, i + per));
            await wait();
          }
      }
      a.end();
      // Let the motion finish: until the page stops changing (at most 3 s).
      await Promise.all(document.getAnimations().map((x) => x.finished.catch(() => {})));
      for (let k = 0, before = ""; k < 30; k++) {
        if (el.innerHTML === before) break;
        before = el.innerHTML;
        await new Promise((r) => setTimeout(r, 100));
      }
      done = true;
      mo.disconnect();
      window.answer = a;
      return { stuck: Math.round(stuck), photos: photos.size, dropped: [...photos].filter((i) => !el.contains(i)).length };
    },
    sample.md,
    packs.filter((p) => p !== "core"),
    per,
    tick,
  );
  const same = await page.evaluate(`(${samePage})(document.getElementById("answer").innerHTML, window.answer.html())`);
  if (r.stuck > stuckMax) failures.push(`${id}: a placeholder showed with nothing new for ${r.stuck} ms (at most ${stuckMax})`);
  if (r.dropped) failures.push(`${id}: ${r.dropped} of ${r.photos} photos were replaced by new elements while streaming`);
  if (!same) failures.push(`${id}: the page doesn't end as the core's HTML`);
  console.log(`${id.padEnd(26)} stuck ${String(r.stuck).padStart(4)} ms  photos ${r.photos - r.dropped}/${r.photos} kept  ${same ? "same" : "DIFFERENT"}`);
  await page.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error(`\n${failures.length} failures:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`\n${ids.length} samples streamed: nothing stuck behind a placeholder over ${stuckMax} ms, every photo kept, every page the core's HTML.`);
