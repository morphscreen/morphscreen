// Streams the every-pack answer (test/fixtures/packs-all.md) through the web
// SDK in headless Chrome and checks what the browser adds on top of the
// core's HTML: the countdown ticks, an embed loads only when clicked, the
// signature pad draws into the form, and nothing else loads from outside.
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { browserName, launch } from "../browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".md": "text/plain" };
const server = createServer((req, res) => {
  const p = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(repo) || !existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await launch(puppeteer);
const page = await browser.newPage();
await page.setViewport({ width: 860, height: 1200 });
const errors = [];
const outside = [];
page.on("pageerror", (e) => errors.push(String(e)));
// What loads from outside is seen by intercepting requests, which Safari's WebDriver can't: Chrome and Firefox check it.
if (browserName !== "safari") {
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    if (r.url().startsWith(base)) return r.continue();
    outside.push(r.url());
    r.abort();
  });
}
await page.goto(`${base}/sdk/web/example/packs.html`);
await page.waitForFunction("window.ready === true", { timeout: 15000 });
const before = await page.evaluate(() => ({
  countdown: document.querySelector(".ms-countdown time")?.textContent,
  classes: ["kv", "timeline", "gauge", "heatmap", "funnel", "spark", "tree", "product", "plan", "cart", "stars", "compare", "price", "calendar", "event", "chips", "agenda", "countdown", "video", "audio", "embed", "carousel", "codefile", "diff", "math", "filetree", "citation", "star-input", "stepper", "signature", "contact", "share", "voice", "qr"].filter((c) => !document.querySelector(".ms-" + c)),
  iframes: document.querySelectorAll("iframe").length,
  canvas: !!document.querySelector(".ms-signature canvas"),
}));
// What loaded from outside before anyone clicked: the images and media are the model's URLs (the example.com placeholders).
const beforeClick = outside.filter((u) => !u.startsWith("https://example.com/") && !u.startsWith("data:"));
await new Promise((r) => setTimeout(r, 1100));
const ticked = await page.evaluate(() => document.querySelector(".ms-countdown time")?.textContent);
await page.click(".ms-embed a");
const iframe = await page.evaluate(() => document.querySelector(".ms-embed iframe")?.getAttribute("src"));
const box = await page.evaluate(() => {
  const c = document.querySelector(".ms-signature canvas");
  c.scrollIntoView({ block: "center" });
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
await page.mouse.move(box.x + 20, box.y + 30);
await page.mouse.down();
await page.mouse.move(box.x + 120, box.y + 80, { steps: 8 });
await page.mouse.up();
const signed = await page.evaluate(() => (document.querySelector(".ms-signature input[type=hidden]")?.value ?? "").slice(0, 22));
await page.evaluate(axeSource);
const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`));
await browser.close();
server.close();
const result = { missing: before.classes, countdownBefore: before.countdown, countdownAfter: ticked, iframesBeforeClick: before.iframes, iframeAfterClick: iframe, signed, outsideBeforeClick: beforeClick, axe, errors };
console.log(JSON.stringify(result, null, 1));
const ok =
  !before.classes.length && /\d+d \d+h/.test(ticked ?? "") && before.iframes === 0 && iframe?.startsWith("https://www.youtube-nocookie.com/embed/") &&
  before.canvas && signed === "data:image/png;base64," && !beforeClick.length && !axe.length && !errors.length;
console.log(ok ? "packs: ok" : "packs: FAILED");
process.exit(ok ? 0 : 1);
