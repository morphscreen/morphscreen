// The browser benchmark: our web renderer and OpenUI's React renderer, same
// Chrome, same answers' briefs, same chunk schedule.
//   node bench/web/run.mjs [label]   (after node sdk/web/build.mjs)
// Writes bench/web/results-<label>.json and prints the summary. Also checks
// that our page in the browser equals the server HTML for every answer.
import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { samePage } from "../../sdk/web/same-page.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const label = process.argv[2] ?? "nemotron-v03";
const raw = join(repo, "bench/raw", label);

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!path.startsWith(repo) || !existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--js-flags=--expose-gc", "--enable-precise-memory-info", "--window-size=860,1200"],
});

async function measure(url, text, opts, extra) {
  const page = await browser.newPage();
  await page.setViewport({ width: 860, height: 1200 });
  await page.goto(url);
  await page.waitForFunction("window.ready === true");
  const r = await page.evaluate((t, o) => window.run(t, o), text, opts);
  if (extra) Object.assign(r, await extra(page));
  await page.close();
  return r;
}

const axe = (selector) => async (page) => {
  await page.addScriptTag({ content: axeSource });
  const res = await page.evaluate(async (sel) => {
    const r = await window.axe.run(document.querySelector(sel), { resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  }, selector);
  return { violations: res };
};

// Our page in the browser equals the server HTML (sdk/web/same-page.mjs says what may differ).
const parity = async (page) => ({ same: await page.evaluate(`(${samePage})(document.getElementById("answer").innerHTML, window.last.html())`) });

const files = readdirSync(raw).filter((f) => /^ours__.+\.txt$/.test(f)).sort();
const packsOf = new Map();
if (existsSync(join(raw, "meta.jsonl")))
  for (const l of readFileSync(join(raw, "meta.jsonl"), "utf8").split("\n").filter(Boolean)) {
    const m = JSON.parse(l);
    packsOf.set(m.id, m.packs ?? []);
  }
const rows = [];
for (const f of files) {
  const brief = f.replace(/^ours__/, "");
  const theirFile = join(raw, `openuichat__${brief}`);
  if (!existsSync(theirFile)) continue;
  const ours = readFileSync(join(raw, f), "utf8");
  const theirs = readFileSync(theirFile, "utf8");
  const packs = packsOf.get(f.replace(/\.txt$/, "")) ?? [];
  // The finished page: after the arrival fades (Q8) end, as a reader sees it.
  const settled = (p) => p.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
    // Morphs and count-ups run on animation frames: wait until the answer stops changing (at most 3 s).
    for (let k = 0, last = ""; k < 30; k++) {
      const now = document.getElementById("answer").innerHTML;
      if (now === last) break;
      last = now;
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  const o = await measure(`${base}/bench/web/ours.html`, ours, { chunk: 32, packs }, async (p) => (await settled(p), { ...(await parity(p)), ...(await axe("#answer")(p)) }));
  const t = await measure(`${base}/bench/web/openui.html`, theirs, { chunk: 32 }, axe("#root"));
  const os = await measure(`${base}/bench/web/ours.html`, ours, { chunk: 32, delay: 30, packs });
  const ts = await measure(`${base}/bench/web/openui.html`, theirs, { chunk: 32, delay: 30 });
  rows.push({
    brief,
    ours: { busy: o.busy, heap: o.heap, wasm: o.wasm, violations: o.violations, same: o.same, first: os.first, cls: os.cls },
    openui: { busy: t.busy, heap: t.heap, violations: t.violations, first: ts.first, cls: ts.cls, error: t.error ?? ts.error },
  });
  console.log(`${brief.padEnd(22)} cpu ${o.busy.toFixed(1)} vs ${t.busy.toFixed(1)} ms | first text ${os.first?.toFixed(0)} vs ${ts.first?.toFixed(0)} ms | shift ${os.cls.toFixed(3)} vs ${ts.cls.toFixed(3)} | axe ${o.violations.length} vs ${t.violations.length} | same as server: ${o.same}${t.error || ts.error ? ` | OpenUI error: ${t.error ?? ""} ${ts.error ? "(also when streamed normally)" : "(fine when streamed normally)"}` : ""}`);
}
await browser.close();
server.close();
writeFileSync(join(here, `results-${label}.json`), JSON.stringify(rows, null, 1));
const med = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
console.log(`\n${rows.length} answers. CPU to stream and render (total): ours ${sum(rows.map((r) => r.ours.busy)).toFixed(0)} ms, OpenUI ${sum(rows.map((r) => r.openui.busy)).toFixed(0)} ms`);
console.log(`time to first text (median): ours ${med(rows.map((r) => r.ours.first))?.toFixed(0)} ms, OpenUI ${med(rows.map((r) => r.openui.first))?.toFixed(0)} ms`);
console.log(`layout shift while streaming (total): ours ${sum(rows.map((r) => r.ours.cls)).toFixed(3)}, OpenUI ${sum(rows.map((r) => r.openui.cls)).toFixed(3)}`);
console.log(`JS heap after the answer (median): ours ${(med(rows.map((r) => r.ours.heap)) / 1024).toFixed(0)} KB (+ ${(rows[0]?.ours.wasm / 1024).toFixed(0)} KB WASM memory), OpenUI ${(med(rows.map((r) => r.openui.heap)) / 1024).toFixed(0)} KB`);
console.log(`axe violations (total): ours ${sum(rows.map((r) => r.ours.violations.reduce((a, v) => a + v.nodes, 0)))}, OpenUI ${sum(rows.map((r) => r.openui.violations.reduce((a, v) => a + v.nodes, 0)))}`);
console.log(`our browser page equals the server HTML: ${rows.filter((r) => r.ours.same).length} of ${rows.length}`);
console.log(`OpenUI render errors: ${rows.filter((r) => r.openui.error).length} of ${rows.length}`);
