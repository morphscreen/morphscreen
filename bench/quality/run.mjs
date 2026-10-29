// Quality audit (roadmap Q1, Q2): every answer pair (ours and OpenUI's chat
// library, same brief) rendered in Chrome at phone and chat-column widths,
// checked by check.js and axe's contrast rule, and screenshotted.
//   node bench/quality/run.mjs [--shots] [raw labels...]
// With no labels it runs every recorded pair set and writes results.json,
// which the scoreboard reads; with labels, results-<labels>.json.
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const checkSource = readFileSync(join(here, "check.js"), "utf8");
const given = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const standard = ["nemotron-v03", "nemotron-full-v06", ...["data", "commerce", "scheduling", "media", "docs", "inputs", "device"].map((p) => `packs-${p}`)];
const labels = given.length ? given : standard.filter((l) => existsSync(join(repo, "bench/raw", l)));
const widths = [390, 760];
const shots = process.argv.includes("--shots");
// --theme=dark or --theme=mono: our answers alone, in that palette (the theme
// review, Q4); writes results-<theme>.json.
const theme = process.argv.find((a) => a.startsWith("--theme="))?.slice(8);
const out = join(here, "out");

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!path.startsWith(repo) || !existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

async function render(side, text, width, opts, shot) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  // Charts draw in; full-page screenshots resize the page and restart that, so
  // the audit sees them still (the layout is the same either way).
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  // Nothing loads from outside: the same for both, and what a privacy-respecting app would do by default.
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url().startsWith(base) || r.url().startsWith("data:") ? r.continue() : r.abort()));
  await page.goto(`${base}/bench/web/${side === "ours" ? "ours" : "openui"}.html`);
  if (side === "ours" && theme) await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  await page.waitForFunction("window.ready === true");
  let error = null;
  try {
    await page.evaluate((t, o) => window.run(t, o), text, { ...opts, chunk: 1e7 });
  } catch (e) {
    error = String(e).slice(0, 200);
  }
  await new Promise((r) => setTimeout(r, 700));
  const sel = side === "ours" ? "#answer" : "#root";
  await page.addScriptTag({ content: checkSource });
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async (sel) => {
    const root = document.querySelector(sel);
    const defects = window.layoutCheck(root);
    const axe = await window.axe.run(root, { runOnly: ["color-contrast"] });
    for (const v of axe.violations) for (const n of v.nodes) defects.push({ kind: "contrast", at: n.target.join(" "), detail: n.any[0]?.message?.slice(0, 80) ?? "" });
    return { defects, height: root.getBoundingClientRect().height, text: root.innerText.trim().length };
  }, sel);
  if (shot) await page.screenshot({ path: shot, fullPage: true });
  await page.close();
  return { ...result, error };
}

// A page that dies under load (its frame detached, a navigation timing out)
// is drawn once more, so one bad moment doesn't lose the whole run.
async function again(draw) {
  try {
    return await draw();
  } catch (e) {
    console.log(`  (drawn again after: ${String(e).split("\n")[0].slice(0, 80)})`);
    return draw();
  }
}

const rows = [];
for (const label of labels) {
  const raw = join(repo, "bench/raw", label);
  const packsOf = new Map();
  if (existsSync(join(raw, "meta.jsonl")))
    for (const l of readFileSync(join(raw, "meta.jsonl"), "utf8").split("\n").filter(Boolean)) {
      const m = JSON.parse(l);
      packsOf.set(m.id, m.packs ?? []);
    }
  const pairs = readdirSync(raw).map((f) => f.match(/^ours__(.+)\.txt$/)?.[1]).filter((b) => b && existsSync(join(raw, `openuichat__${b}.txt`))).sort();
  mkdirSync(join(out, theme ?? "", label), { recursive: true });
  for (const b of pairs) {
    const ours = readFileSync(join(raw, `ours__${b}.txt`), "utf8");
    const theirs = readFileSync(join(raw, `openuichat__${b}.txt`), "utf8");
    const packs = packsOf.get(`ours__${b}`) ?? [];
    for (const width of widths) {
      const shot = (side) => (shots ? join(out, theme ?? "", label, `${b}-${side}-${width}.png`) : null);
      const o = await again(() => render("ours", ours, width, { packs }, shot("ours")));
      const t = theme ? { defects: [], text: 0, height: 0, error: null } : await again(() => render("openui", theirs, width, {}, shot("openui")));
      rows.push({ label, brief: b, width, ours: o, openui: t });
      const n = (x) => x.defects.length;
      console.log(`${label}/${b} @${width}: ours ${n(o)} defects, OpenUI ${n(t)}${t.error ? " (OpenUI error)" : ""}${t.text < 20 ? " (OpenUI drew nothing)" : ""}`);
    }
  }
}
await browser.close();
server.close();

// Summary: defects per answer by kind, for each side and width.
const kinds = [...new Set(rows.flatMap((r) => [...r.ours.defects, ...r.openui.defects].map((d) => d.kind)))].sort();
const summary = {};
for (const width of widths) {
  const rs = rows.filter((r) => r.width === width);
  summary[width] = { answers: rs.length, openuiBlank: rs.filter((r) => r.openui.text < 20).length };
  // Contrast is its own measure (it's accessibility, and one theme colour can make hundreds).
  const layout = (r, side) => r[side].defects.filter((d) => d.kind !== "contrast");
  for (const side of ["ours", "openui"]) {
    const by = Object.fromEntries(kinds.map((k) => [k, rs.reduce((a, r) => a + r[side].defects.filter((d) => d.kind === k).length, 0)]));
    const total = rs.reduce((a, r) => a + layout(r, side).length, 0);
    summary[width][side] = { layoutPerAnswer: +(total / rs.length).toFixed(2), cleanLayout: rs.filter((r) => !layout(r, side).length).length, contrastAnswers: rs.filter((r) => r[side].defects.some((d) => d.kind === "contrast")).length, by };
  }
}
// Rows keep each layout defect; contrast, which runs to thousands of elements, is a count.
const slim = rows.map((r) => ({ ...r, ...Object.fromEntries(["ours", "openui"].map((side) => [side, { ...r[side], defects: r[side].defects.filter((d) => d.kind !== "contrast"), contrast: r[side].defects.filter((d) => d.kind === "contrast").length }])) }));
writeFileSync(join(here, theme ? `results-${theme}.json` : given.length ? `results-${labels.join("+")}.json` : "results.json"), JSON.stringify({ summary, rows: slim }, null, 1));
console.log(JSON.stringify(summary, null, 1));
