// The same look on every platform (roadmap M1 and M3): every component sample
// (test/fixtures/components.json) drawn by the web SDK, SwiftUI and Compose,
// then put side by side, one sheet per sample, for review.
//   node bench/look/run.mjs [--theme=light,dark,mono] [--width=760,390] [--only=id,id] [--skip=web,swift,compose]
// Needs the web build (node sdk/web/build.mjs), `swift build -c release` in
// bench/native and the Compose bench (sdk/android). Writes bench/look/out.
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

const here = import.meta.dirname;
const repo = join(here, "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const themes = arg("theme", "light").split(",");
const widths = arg("width", "760").split(",").map(Number);
const only = arg("only", "");
const skip = arg("skip", "").split(",");
const fixtures = join(repo, "test/fixtures/components.json");
const { samples } = JSON.parse(readFileSync(fixtures, "utf8"));
const ids = only ? only.split(",") : samples.map((s) => s.id);
const out = join(here, "out");
// The Compose SDK builds with JDK 21 (Homebrew's openjdk@21 unless JAVA_HOME says otherwise).
const javaHome = process.env.JAVA_HOME ?? "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home";

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".woff2": "font/woff2", ".json": "application/json", ".png": "image/png" };
const server = createServer((req, res) => {
  const p = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });

for (const theme of themes) {
  for (const width of widths) {
    const tag = `${theme}-${width}`;
    const dirs = Object.fromEntries(["web", "swift", "compose", "sheet"].map((k) => [k, join(out, k, tag)]));
    for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
    if (!skip.includes("web")) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 900, deviceScaleFactor: 2 });
      await page.goto(`${base}/sdk/web/example/components.html?theme=${theme}&only=${ids.join(",")}`);
      await page.waitForFunction("window.ready === true");
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 900)); // arrival motion settles
      for (const id of ids) {
        const el = await page.$(`section[id="${id}"] > .ms-answer`);
        await el?.screenshot({ path: join(dirs.web, `${id}.png`) });
      }
      await page.close();
      console.log(`web ${tag}: ${ids.length}`);
    }
    if (!skip.includes("swift")) {
      const r = spawnSync(join(repo, "bench/native/.build/release/nativelook"), [fixtures, dirs.swift, String(width), theme, ...(only ? [only] : [])], { encoding: "utf8", timeout: 600_000 });
      console.log(`swift ${tag}: ${(r.stdout.match(/^SHOT /gm) ?? []).length}${r.status ? ` (exit ${r.status}: ${r.stderr.slice(-400)})` : ""}`);
    }
    if (!skip.includes("compose")) {
      const r = spawnSync(join(repo, "sdk/android/gradlew"), ["-q", "-p", join(repo, "sdk/android"), ":bench:look", `--args=${fixtures} ${dirs.compose} ${width} ${theme}${only ? ` ${only}` : ""}`], { encoding: "utf8", timeout: 900_000, env: { ...process.env, JAVA_HOME: javaHome } });
      console.log(`compose ${tag}: ${(r.stdout.match(/^SHOT /gm) ?? []).length}${r.status ? ` (exit ${r.status}: ${r.stderr.slice(-600)})` : ""}`);
    }
    // One sheet per sample: web, SwiftUI and Compose at the same scale.
    const page = await browser.newPage();
    await page.setViewport({ width: width * 3 + 64, height: 900, deviceScaleFactor: 1 });
    const bg = theme === "dark" ? "#0b0c0f" : "#fbfbfc";
    const fg = theme === "dark" ? "#a8adb8" : "#4a505d";
    for (const id of ids) {
      const img = (k) => (existsSync(join(dirs[k], `${id}.png`)) ? `<img src="${base}/bench/look/out/${k}/${tag}/${id}.png" style="width:${width}px">` : `<div style="width:${width}px;color:${fg}">missing</div>`);
      const cols = ["web", "swift", "compose"].map((k) => `<figure style="margin:0;display:grid;gap:6px;align-content:start"><figcaption style="font:12px ui-monospace,monospace;color:${fg}">${k} · ${id}</figcaption>${img(k)}</figure>`).join("");
      await page.setContent(`<body style="margin:0;padding:16px;background:${bg}"><div id="s" style="display:flex;gap:16px;align-items:start">${cols}</div></body>`);
      await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r))))));
      await (await page.$("#s")).screenshot({ path: join(dirs.sheet, `${id}.png`) });
    }
    await page.close();
    console.log(`sheets ${tag}: ${ids.length} in ${dirs.sheet}`);
  }
}
await browser.close();
server.close();
