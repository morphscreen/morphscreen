// The web SDK under the strict content security policy the docs recommend
// (site/docs/content/production/security.md): every component from the
// gallery streamed into a page that allows scripts only from itself plus
// 'wasm-unsafe-eval', and styles only from itself. Not one violation may
// fire, and every block must draw.
//
//   node sdk/web/build.mjs && node sdk/web/test-csp.mjs     (BROWSER=firefox for Firefox)

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { browserName, launch } from "./browser.mjs";

const here = import.meta.dirname;
const dist = join(here, "dist");
const require = createRequire(join(process.env.WEB_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web"), "package.json"));
const puppeteer = require("puppeteer-core");
const samples = JSON.parse(readFileSync(join(here, "../../test/fixtures/components.json"), "utf8")).samples;
const text = samples.map((s) => s.md).join("\n\n");

// The policy from the docs, with the gallery's media host as "your video and audio hosts".
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src https://example.com",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

const main = `window.violations = [];
document.addEventListener("securitypolicyviolation", (e) => window.violations.push(e.violatedDirective + " " + e.blockedURI));
import("/index.js").then(async ({ loadCore, createAnswer }) => {
  const core = await loadCore("/morphscreen.wasm");
  const answer = createAnswer(document.getElementById("answer"), { core });
  const text = ${JSON.stringify(text)};
  for (let i = 0; i < text.length; i += 40) {
    answer.push(text.slice(i, i + 40));
    await new Promise((r) => setTimeout(r, 2));
  }
  answer.end();
  document.body.dataset.done = "yes";
});`;
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/") return res.writeHead(200, { "content-type": "text/html", "content-security-policy": CSP }).end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CSP</title><link rel="stylesheet" href="/morphscreen.css"></head><body><main id="answer"></main><script type="module" src="/main.js"></script></body></html>`);
  if (path === "/main.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(main);
  const f = join(dist, path);
  if (!existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const browser = await launch(puppeteer);
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
await page.waitForSelector("body[data-done=yes]", { timeout: 60_000 });
await new Promise((r) => setTimeout(r, 1500));
const { violations, blocks } = await page.evaluate(() => ({ violations: window.violations, blocks: document.querySelectorAll("#answer > *").length }));
await browser.close();
server.close();

const problems = [...new Set(violations)].map((v) => `violation: ${v}`).concat(errors.map((e) => `error: ${e}`));
if (blocks < samples.length) problems.push(`only ${blocks} blocks drawn for ${samples.length} samples`);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`csp: ok in ${browserName} (${samples.length} samples, every component, ${blocks} blocks, no violation under script-src 'self' 'wasm-unsafe-eval' and style-src 'self')`);
