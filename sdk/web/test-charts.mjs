// Charts answer the pointer (roadmap Q5): every chart type in
// test/fixtures/charts.md, at a phone's width and a chat column's, is hovered
// over a mark; the tooltip must show that mark's category and value as the
// answer wrote them. A legend item must switch its series off, and axe must
// find nothing on the page.
//   node sdk/web/build.mjs && node sdk/web/test-charts.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  const p = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(repo) || !existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await launch(puppeteer);
const answer = readFileSync(join(repo, "test/fixtures/charts.md"), "utf8");
const failures = [];

for (const width of [390, 760]) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => failures.push(`${width}: ${e.message}`));
  await page.setViewport({ width, height: 900 });
  await page.goto(`http://127.0.0.1:${server.address().port}/bench/web/ours.html`);
  await page.waitForFunction("window.ready === true");
  await page.evaluate((t) => window.run(t, { chunk: 64 }), answer);
  await new Promise((r) => setTimeout(r, 1200));
  const kinds = new Set();
  for (const fig of await page.$$("figure.ms-chart")) {
    if (!(await fig.boundingBox())?.width) continue;
    await fig.evaluate((f) => f.scrollIntoView({ block: "center" }));
    // A point inside the first mark: a bar's middle, a point on a line, a slice's inner edge.
    const target = await fig.evaluate((f) => {
      const svg = f.querySelector("svg");
      const kind = svg.dataset.kind;
      const m = f.querySelector("svg rect[data-i], svg path.ms-slice, svg > circle, svg path.ms-line, svg polygon.ms-radar");
      const pt = svg.createSVGPoint();
      if (m.tagName === "rect") {
        const b = m.getBBox();
        pt.x = b.x + b.width / 2;
        pt.y = b.y + b.height / 2;
      } else if (m.tagName === "circle") {
        pt.x = +m.getAttribute("cx");
        pt.y = +m.getAttribute("cy");
      } else if (m.classList.contains("ms-slice")) {
        const q = m.getPointAtLength(m.getTotalLength() * 0.3);
        const c = { x: svg.viewBox.baseVal.width / 2, y: svg.viewBox.baseVal.height / 2 };
        pt.x = q.x + (c.x - q.x) * 0.15;
        pt.y = q.y + (c.y - q.y) * 0.15;
      } else if (kind === "radar") {
        // The first spoke points straight up from the centre.
        pt.x = svg.viewBox.baseVal.width / 2;
        pt.y = svg.viewBox.baseVal.height / 2 - 40;
      } else {
        const l = +svg.dataset.l, pw = +svg.dataset.pw, n = +svg.dataset.n;
        pt.x = l + pw / n / 2;
        pt.y = +svg.dataset.t + +svg.dataset.ph / 2;
      }
      const s = pt.matrixTransform(svg.getScreenCTM());
      return { kind, x: s.x, y: s.y, title: f.querySelector("figcaption span")?.textContent ?? "" };
    });
    await page.mouse.move(target.x, target.y, { steps: 3 });
    await new Promise((r) => setTimeout(r, 200));
    const tip = await fig.evaluate((f) => f.querySelector(".ms-chart-tip.ms-on")?.innerText ?? "");
    // Each fixture's first row: what the tooltip must show.
    const first = { bar: ["Jan", "120"], line: ["1", "25"], area: ["Mon", "1,200"], stacked: ["W1", "12"], horizontal: ["CS 101", "98"], scatter: ["A", "4.1"], pie: ["Search", "5,400"], donut: ["Free", "1,842"], radar: ["Speed", "8"] }[target.kind];
    kinds.add(target.kind);
    if (!first || !first.every((w) => tip.includes(w))) failures.push(`${width} ${target.kind}: tooltip "${tip.replace(/\n/g, " / ")}" lacks ${first}`);
  }
  for (const k of ["bar", "line", "area", "stacked", "horizontal", "scatter", "pie", "donut", "radar"]) if (!kinds.has(k)) failures.push(`${width}: no ${k} chart drawn`);
  // A legend item switches its series off.
  let legend = null;
  for (const b of await page.$$(".ms-chart .ms-legend button")) if ((await b.boundingBox())?.width) { legend = b; break; }
  if (!legend) failures.push(`${width}: no legend buttons`);
  else {
    await legend.evaluate((b) => b.scrollIntoView({ block: "center" }));
    // Which chart it is, so it can be found again: a chart whose axis fits its series is drawn
    // again without the one switched off (the rest re-flow); a round one fades it.
    const at = await legend.evaluate((b) => [[...document.querySelectorAll("figure.ms-chart")].indexOf(b.closest("figure")), b.querySelector("i").className]);
    await legend.click();
    await new Promise((r) => setTimeout(r, 700));
    const off = await page.evaluate(([k, s]) => {
      const fig = [...document.querySelectorAll("figure.ms-chart")][k];
      const b = [...fig.querySelectorAll(".ms-legend button")].find((x) => x.querySelector("i")?.className === s);
      const drawn = fig.querySelectorAll(`svg > .${s}:not([data-ms-added] *)`).length;
      return [b?.getAttribute("aria-pressed"), fig.className, drawn];
    }, at);
    if (off[0] !== "false" || (!/off-s\d/.test(off[1]) && off[2] !== 0)) failures.push(`${width}: legend toggle didn't switch the series off (${off})`);
  }
  await page.addScriptTag({ content: axeSource });
  const v = await page.evaluate(async () => (await window.axe.run(document.querySelector("#answer"))).violations.map((x) => `${x.id} (${x.nodes.length})`));
  if (v.length) failures.push(`${width}: axe ${v.join(", ")}`);
  await page.close();
}
await browser.close();
server.close();
if (failures.length) {
  console.log(failures.join("\n"));
  process.exit(1);
}
console.log("charts: ok (9 types x 2 widths: tooltips, legend toggle, axe)");
