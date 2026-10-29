// Requests to hosts the app didn't choose (roadmap Q6): every answer pair
// rendered once in Chrome, ours and OpenUI's chat library, with nothing from
// outside the page allowed through; each request either renderer starts for
// another host is counted (and stopped). A model-written image URL that a
// renderer loads tells that host who is reading.
//   node bench/quality/hosts.mjs      writes hosts.json, which the scoreboard reads
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const labels = ["nemotron-v03", "nemotron-full-v06", ...["data", "commerce", "scheduling", "media", "docs", "inputs", "device"].map((p) => `packs-${p}`)].filter((l) => existsSync(join(repo, "bench/raw", l)));

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!path.startsWith(repo) || !existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

async function hosts(side, text, opts) {
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 900 });
  const seen = [];
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = r.url();
    if (u.startsWith(base) || u.startsWith("data:")) return r.continue();
    seen.push(new URL(u).host);
    r.abort();
  });
  await page.goto(`${base}/bench/web/${side === "ours" ? "ours" : "openui"}.html`);
  await page.waitForFunction("window.ready === true");
  try {
    await page.evaluate((t, o) => window.run(t, o), text, { ...opts, chunk: 64 });
  } catch {}
  // Images below the fold load too, as when the reader scrolls.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise((r) => setTimeout(r, 600));
  await page.close();
  return seen;
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
  for (const b of pairs) {
    const ours = await again(() => hosts("ours", readFileSync(join(raw, `ours__${b}.txt`), "utf8"), { packs: packsOf.get(`ours__${b}`) ?? [] }));
    const openui = await again(() => hosts("openui", readFileSync(join(raw, `openuichat__${b}.txt`), "utf8"), {}));
    rows.push({ label, brief: b, ours, openui });
    if (ours.length || openui.length) console.log(`${label}/${b}: ours ${ours.length}, OpenUI ${openui.length} (${[...new Set(openui)].join(", ")})`);
  }
}
await browser.close();
server.close();
// A host cut off mid-stream ("images.unspla"): the renderer asked for an
// image while its URL was still arriving. Counted, but listed apart.
const count = (side) => {
  const all = [...new Set(rows.flatMap((r) => r[side]))];
  const cut = (h) => !h.includes(".") || all.some((o) => o !== h && o.startsWith(h));
  return {
    answers: rows.filter((r) => r[side].length).length,
    requests: rows.reduce((a, r) => a + r[side].length, 0),
    partial: rows.reduce((a, r) => a + r[side].filter(cut).length, 0),
    hosts: all.filter((h) => !cut(h)).sort(),
  };
};
const summary = { answers: rows.length, ours: count("ours"), openui: count("openui") };
writeFileSync(join(here, "hosts.json"), JSON.stringify({ summary, rows }, null, 1) + "\n");
console.log(JSON.stringify(summary));
