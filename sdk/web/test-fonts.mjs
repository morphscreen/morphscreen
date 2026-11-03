// The answer faces load only when an answer is set in them (docs/theme.md):
// with the stylesheet's own --ms-font and --ms-mono an answer brings IBM
// Plex in from dist/fonts; an app that set its own faces, on :root or scoped
// to its chat, fetches nothing from dist/fonts at all, though the stylesheet
// declares the faces and the answer has text and code to draw.
//
//   node sdk/web/build.mjs && node sdk/web/test-fonts.mjs     (BROWSER=firefox for Firefox)

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { browserName, launch } from "./browser.mjs";

const here = import.meta.dirname;
const dist = join(here, "dist");
const require = createRequire(join(process.env.WEB_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web"), "package.json"));
const puppeteer = require("puppeteer-core");

const answer = "## Refund policy\n\nYou can ask for a refund **within 30 days**.\n\n<Code file=\"refund.sh\">\n```bash\ncurl -X POST /refunds\n```\n</Code>\n";
const own = "--ms-font: Georgia, serif; --ms-mono: \"Courier New\", monospace;";
const cases = {
  // The stylesheet's faces: Plex comes in.
  plex: { style: "", wrap: "" },
  // The app's faces for the whole page.
  root: { style: `:root { ${own} }`, wrap: "" },
  // The app's faces for its chat only, the rest of the page untouched.
  scoped: { style: `.chat { ${own} }`, wrap: "chat" },
};
const page = (c) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="/morphscreen.css"><style>${cases[c].style}</style>
</head><body><div class="${cases[c].wrap}"><div id="a"></div></div>
<script type="module">
import { loadCore, createAnswer } from "/index.js";
const core = await loadCore("/morphscreen.wasm");
const a = createAnswer(document.getElementById("a"), { core, packs: ["docs"] });
a.push(${JSON.stringify(answer)});
a.end();
await document.fonts.ready;
window.ready = true;
</script></body></html>`;
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") return res.writeHead(200, { "content-type": "text/html" }).end(page(url.searchParams.get("case")));
  const f = join(dist, url.pathname);
  if (!existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const browser = await launch(puppeteer);
const problems = [];
const fetched = {};
for (const c of Object.keys(cases)) {
  // A fresh context each time, so no face is already in the cache.
  const context = await browser.createBrowserContext();
  const tab = await context.newPage();
  const fonts = [];
  tab.on("request", (r) => r.url().includes("/fonts/") && fonts.push(r.url().split("/fonts/")[1]));
  tab.on("pageerror", (e) => problems.push(`${c}: script error: ${e.message}`));
  await tab.goto(`http://127.0.0.1:${server.address().port}/?case=${c}`);
  await tab.waitForFunction(() => window.ready, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 500));
  if (!(await tab.evaluate(() => !!document.querySelector("#a h2") && !!document.querySelector("#a code")))) problems.push(`${c}: the answer didn't draw`);
  fetched[c] = fonts;
  await context.close();
}
await browser.close();
server.close();

if (!fetched.plex.some((f) => f.startsWith("ibm-plex-sans"))) problems.push(`with the stylesheet's faces, Plex Sans wasn't loaded (${fetched.plex.join(", ") || "nothing"})`);
for (const c of ["root", "scoped"]) if (fetched[c].length) problems.push(`with the app's own faces (${c}), dist/fonts was still fetched: ${fetched[c].join(", ")}`);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`fonts: ok in ${browserName} (the stylesheet's faces load Plex: ${fetched.plex.length} files; the app's own faces, page-wide or scoped, load nothing from dist/fonts)`);
