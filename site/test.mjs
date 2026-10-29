// morphscreen.com in a browser (roadmap N1, N6, V5): every page at 390, 760
// and 1280 px with nothing scrolling sideways, no layout defects
// (bench/quality/check.js), axe at 0, and no coloured words outside the
// answer the core drew; every link inside the site going to a page that
// exists; nothing the security policy Caddy sends would block; the live
// demo streaming into both frames (N2); the visit counted (N6); and Clarity
// asked for nothing until the visitor says yes, then loaded (V5).
// Screenshots go to site/out/.
//
//   node site/build.mjs && node site/test.mjs     (BROWSER=firefox for Firefox)

import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { browserName, launch } from "../sdk/web/browser.mjs";

const here = import.meta.dirname;
const dist = join(here, "dist.nosync");
const out = join(here, "out");
mkdirSync(out, { recursive: true });
const require = createRequire(join(process.env.WEB_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web"), "package.json"));
const puppeteer = require("puppeteer-core");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const checker = readFileSync(join(here, "../bench/quality/check.js"), "utf8");

// The site as Caddy serves it: /pricing is pricing.html, /v1/visit is msapi's,
// and each page with the security policy ops/site/Caddyfile.block gives its
// path (less the https upgrade, as this server is plain http).
const visits = [];
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain", ".wasm": "application/wasm", ".json": "application/json" };
// The public repository has no ops/: tools/export-oss.mjs writes the same policies there as site/headers.json.
const caddy = join(here, "../ops/site/Caddyfile.block");
const policy = existsSync(caddy)
  ? Object.fromEntries([...readFileSync(caddy, "utf8").matchAll(/header @(\w+) \{\s*X-Frame-Options (\w+)\s*Content-Security-Policy "([^"]+)"/g)].map(([, name, frame, csp]) => [name, { "x-frame-options": frame, "content-security-policy": csp.replace("; upgrade-insecure-requests", "") }]))
  : JSON.parse(readFileSync(join(here, "headers.json"), "utf8"));
if (!policy.pages || !policy.frames || !policy.openui || !policy.book) throw new Error("ops/site/Caddyfile.block: the pages', frames', OpenUI frame's and booking page's policies weren't all found");
const headers = (path) => (path === "/demo/frames/openui.html" ? policy.openui : path.startsWith("/demo/frames/") ? policy.frames : path === "/book" ? policy.book : policy.pages);
const file = (path) => {
  const f = join(dist, decodeURIComponent(path));
  if (existsSync(f) && extname(f) && statSync(f).isFile()) return f;
  if (existsSync(`${f}.html`)) return `${f}.html`;
  if (path === "/") return join(dist, "index.html");
  return null;
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/v1/visit") {
    let raw = "";
    for await (const c of req) raw += c;
    visits.push(JSON.parse(raw));
    return res.writeHead(204).end();
  }
  const f = file(url.pathname);
  if (!f) return res.writeHead(404, { "content-type": types[".html"], ...policy.pages }).end(readFileSync(join(dist, "404.html")));
  res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream", ...headers(url.pathname) }).end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// Every page in the sitemap, and one that isn't there.
const PAGES = [...readFileSync(join(dist, "sitemap.xml"), "utf8").matchAll(/<loc>https:\/\/morphscreen\.com([^<]*)<\/loc>/g)].map((m) => m[1] || "/").concat("/nowhere");
const allowed = ["rgb(244, 244, 246)", "rgb(185, 185, 193)", "rgb(134, 134, 143)", "rgb(5, 5, 6)", "rgb(255, 255, 255)"];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = [];
const browser = await launch(puppeteer);

async function look(page, name, width) {
  await page.evaluate(() => document.fonts.ready.then(() => true));
  // Every section where it settles once it has arrived: the arrival's motion
  // turned off, as headless Firefox can leave a transition half way.
  // Sections far down are drawn only when near (content-visibility), so they're drawn here to be checked.
  await page.evaluate(() => {
    for (const s of document.querySelectorAll("[data-reveal]")) s.classList.add("is-in");
    document.documentElement.classList.remove("motion");
    for (const s of document.querySelectorAll(".section")) s.style.contentVisibility = "visible";
  });
  await wait(300);
  const where = `${name} at ${width} px`;
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (wide > 0) {
    const what = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && e.checkVisibility() && !e.closest(".table-scroll, .answer-frame, .code")).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`));
    problems.push(`${where}: scrolls sideways by ${wide} px (${what.join(", ")})`);
  }
  // Words are white or grey, or ink on a white button; the answer keeps its own theme.
  const coloured = await page.evaluate((allowed) => {
    const bad = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el.checkVisibility() || el.closest(".ms-answer")) continue;
      const c = getComputedStyle(el).color.replace(/rgba\((\d+), (\d+), (\d+), 1\)/, "rgb($1, $2, $3)");
      if (!allowed.includes(c)) bad.push(`"${n.textContent.trim().slice(0, 30)}" in ${c}`);
    }
    return bad.slice(0, 5);
  }, allowed);
  for (const c of coloured) problems.push(`${where}: coloured text ${c}`);
  // The layout checker the answers are held to, on the page around them.
  await page.evaluate(checker);
  // The page around the answers; an answer's own layout is the SDK's tests' to judge.
  const defects = await page.evaluate(() => {
    const answers = [...document.querySelectorAll("main .ms-answer")];
    for (const a of answers) a.style.visibility = "hidden";
    const found = window.layoutCheck(document.querySelector("main")).filter((d) => !d.at.includes("ms-"));
    for (const a of answers) a.style.visibility = "";
    return found;
  });
  for (const d of defects.slice(0, 5)) problems.push(`${where}: layout ${d.kind} at ${d.at}${d.detail ? ` (${d.detail})` : ""}`);
  await page.evaluate(axeSource);
  const axe = await page.evaluate(async () => (await window.axe.run(document)).violations.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes[0].target}`));
  for (const v of axe) problems.push(`${where}: axe ${v}`);
  await page.screenshot({ path: join(out, `${name.replaceAll("/", "_") || "home"}-${width}.png`), fullPage: true });
}

const outside = [];
for (const width of [390, 760, 1280]) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  await page.setRequestInterception(true);
  // Nothing leaves this machine; what would have is noted.
  page.on("request", (r) => (r.url().startsWith(base) ? r.continue() : (outside.push(r.url()), r.abort())));
  const errors = [];
  page.on("console", (m) => /Content.Security.Policy/i.test(m.text()) && errors.push(`${m.text().slice(0, 160)} (${m.location()?.url || page.url()})`));
  // Firefox reports a font whose load was cut short by the next page as an error; one that's really missing still counts.
  page.on("pageerror", (e) => {
    const font = e.message.match(/^downloadable font: download failed .*source: \S+?(\/fonts\/[^\s]+)/);
    if (!(font && existsSync(join(dist, font[1])))) errors.push(e.message);
  });
  for (const path of PAGES) {
    await page.goto(`${base}${path}`, { waitUntil: "networkidle0" });
    // The banner shows on a first visit; the checks look at the page under it, then it's answered below.
    await page.evaluate(() => document.getElementById("consent")?.setAttribute("hidden", ""));
    if (await page.$eval("#consent", (b) => b.checkVisibility())) problems.push(`${path} at ${width} px: the recording question shows while hidden`);
    // Every page at phone and desktop widths; the 760 px pass covers the site's own pages and the docs' main ones.
    if (width === 760 && path.startsWith("/docs/") && !["/docs/quickstart", "/docs/components/core", "/docs/reference/api/chat-completions"].includes(path)) continue;
    await look(page, path === "/" ? "home" : path.slice(1), width);
  }
  for (const e of errors) problems.push(`at ${width} px: script error ${e}`);
  await page.close();
}

// Every link within the site goes somewhere.
{
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url().startsWith(base) ? r.continue() : r.abort()));
  const seen = new Set();
  for (const path of PAGES.slice(0, -1)) {
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    for (const href of await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")))) {
      if (!href.startsWith("/") || seen.has(href)) continue;
      seen.add(href);
      const [p, hash] = href.split("#");
      if (!file(p || "/")) problems.push(`${path}: link to ${href} goes nowhere`);
      if (hash) {
        await page.goto(`${base}${href}`, { waitUntil: "domcontentloaded" });
        if (!(await page.$(`#${hash}`))) problems.push(`${path}: link to ${href}: no #${hash} there`);
      }
    }
  }
  await page.close();
}

// The docs' own parts: search, tabs that remember the package manager, the phone's page menu.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url().startsWith(base) ? r.continue() : r.abort()));
  await page.goto(`${base}/docs/quickstart`, { waitUntil: "networkidle0" });
  await page.keyboard.press("/");
  await page.waitForSelector("#search:not([hidden])", { timeout: 3000 }).catch(() => problems.push("docs: / doesn't open search"));
  await page.type(".search__input", "repair");
  await page.waitForFunction(() => [...document.querySelectorAll(".search__results a")].some((a) => a.getAttribute("href").startsWith("/docs/format/validation")), { timeout: 5000 }).catch(() => problems.push("docs: searching repair doesn't find Validation and repair"));
  await page.keyboard.press("Escape");
  const pm = await page.$('.tabs[data-tabs="pm"] [role="tab"][data-tab="pnpm"]');
  if (!pm) problems.push("docs: no package-manager tabs on the quick start");
  else {
    await pm.click();
    const shown = await page.$$eval('.tabs[data-tabs="pm"] .tabs__panel.on', (ps) => ps.map((p) => p.dataset.tab));
    if (!shown.length || shown.some((t) => t !== "pnpm")) problems.push(`docs: picking pnpm shows ${shown}`);
    await page.goto(`${base}/docs/integrations/react`, { waitUntil: "networkidle0" });
    const kept = await page.$eval('.tabs[data-tabs="pm"] .tabs__panel.on', (p) => p.dataset.tab).catch(() => "");
    if (kept !== "pnpm") problems.push(`docs: the package manager isn't remembered (${kept})`);
  }
  await page.setViewport({ width: 390, height: 800 });
  await page.goto(`${base}/docs/format`, { waitUntil: "networkidle0" });
  if (await page.$eval(".side", (e) => e.checkVisibility())) problems.push("docs: the page list shows open on a phone");
  await page.click(".side-toggle__label");
  if (!(await page.$eval(".side", (e) => e.checkVisibility()))) problems.push("docs: Pages doesn't open the page list on a phone");
  await page.close();
}

// The live demo: each brief streams into both frames and both report what it cost; our frame
// under the strict policy, nothing blocked in either, and no script error on our side.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url().startsWith(base) ? r.continue() : r.abort()));
  const errors = [];
  page.on("console", (m) => {
    const where = m.location()?.url ?? "";
    if (/Content.Security.Policy/i.test(m.text()) || (m.type() === "error" && !where.includes("/demo/frames/openui") && !/\/v1\/visit/.test(where + m.text()))) errors.push(`${m.text().slice(0, 160)} (${where})`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/demo`, { waitUntil: "load" });
  const briefs = await page.$$eval("[data-brief]", (bs) => bs.map((b) => b.dataset.brief));
  for (const [i, brief] of briefs.entries()) {
    if (i) {
      await page.waitForFunction(() => !document.getElementById("demo-replay").disabled, { timeout: 120_000 });
      await page.click(`[data-brief="${brief}"]`);
    }
    await page.waitForFunction(() => document.getElementById("demo-replay").disabled, { timeout: 60_000 }).catch(() => {});
    const done = await page.waitForFunction(() => !document.getElementById("demo-replay").disabled && document.querySelectorAll(".demo__stats dd").length >= 8, { timeout: 120_000 }).then(() => true, () => false);
    if (!done) {
      problems.push(`demo: ${brief} didn't finish in both frames`);
      continue;
    }
    const stats = await page.$$eval(".demo__stats", (ds) => Object.fromEntries(ds.map((d) => [d.dataset.side, [...d.querySelectorAll("dt")].map((dt) => dt.textContent)])));
    if (stats.ours.includes("Stopped") || stats.openui.includes("Stopped")) problems.push(`demo: ${brief} stopped: ${await page.$$eval(".demo__stats dd", (dd) => dd.map((d) => d.textContent).join(" | "))}`);
    const drawn = await Promise.all(page.frames().slice(1).map((f) => f.evaluate(() => [location.pathname, document.body.innerText.trim().length])));
    for (const [path, n] of drawn) if (n < 200) problems.push(`demo: ${brief}: ${path} drew ${n} characters`);
  }
  for (const e of errors) problems.push(`demo: ${e}`);
  await page.screenshot({ path: join(out, "demo-played.png") });
  await page.close();
}

// The landing page's live parts: the answer turns from its text to its
// drawing and back, the trail opens a hole under the pointer, and the same
// answer streams into the SDK's frame by itself once in view, then again.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url().startsWith(base) ? r.continue() : r.abort()));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => /Content.Security.Policy/i.test(m.text()) && errors.push(m.text().slice(0, 160)));
  await page.goto(`${base}/`, { waitUntil: "load" });
  if (!(await page.$eval("#morph", (s) => s.classList.contains("is-live")))) problems.push("landing: the morph section never went live");
  await page.$eval("#morph", (s) => s.scrollIntoView());
  const stage = await (await page.$("[data-morph]")).boundingBox();
  for (let i = 0; i < 24; i++) await page.mouse.move(stage.x + 200 + i * 20, stage.y + 200 + i * 6), await wait(16);
  const masked = await page.$eval(".morph__layer--ui", (e) => getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage);
  if (!/^url\("data:image\/png/.test(masked)) problems.push(`landing: the trail drew no mask (${String(masked).slice(0, 40)})`);
  await page.mouse.move(5, 5);
  await page.click(".morph__toggle");
  await wait(1200);
  if (!(await page.$eval("#morph", (s) => s.classList.contains("is-drawn")))) problems.push("landing: Show it drawn didn't turn the answer over");
  await page.click(".morph__toggle");
  await wait(1200);
  if (await page.$eval("#morph", (s) => s.classList.contains("is-drawn"))) problems.push("landing: Show the text didn't turn it back");
  await page.$eval("[data-stream]", (f) => f.scrollIntoView());
  const streamed = await page.waitForFunction(() => /^In your browser/.test(document.getElementById("live-note").textContent), { timeout: 60_000 }).then(() => true, () => false);
  if (!streamed) problems.push(`landing: the answer didn't stream (${await page.$eval("#live-note", (n) => n.textContent)})`);
  else {
    const drawn = await page.frames().find((f) => f.url().includes("/demo/frames/ours"))?.evaluate(() => document.body.innerText.trim().length);
    if (!(drawn > 500)) problems.push(`landing: the stream drew ${drawn} characters`);
    await page.click("#live-replay");
    if (!(await page.waitForFunction(() => /^In your browser/.test(document.getElementById("live-note").textContent), { timeout: 60_000 }).then(() => true, () => false))) problems.push("landing: Stream it again didn't");
  }
  for (const e of errors) problems.push(`landing: ${e}`);
  await page.close();
}

// The visit is counted, with where it came from; nothing went to Clarity before a yes.
{
  visits.length = 0;
  outside.length = 0;
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 390, height: 800 });
  await page.setRequestInterception(true);
  page.on("request", (r) => (r.url().startsWith(base) ? r.continue() : (outside.push(r.url()), r.abort())));
  await page.goto(`${base}/pricing?utm_source=launch&ref=hn`, { waitUntil: "networkidle0" });
  await wait(300);
  if (!visits.some((v) => v.path === "/pricing" && v.source === "launch")) problems.push(`the visit wasn't counted with its source: ${JSON.stringify(visits)}`);
  const signup = await page.$eval(`a[href^="https://app.morphscreen.com/signin"]`, (a) => a.href);
  if (!signup.includes("utm_source=launch") || !signup.includes("ref=hn")) problems.push(`the sign-up link doesn't carry the visit's source: ${signup}`);
  const shown = () => page.$eval("#consent", (b) => b.checkVisibility());
  if (!(await shown())) problems.push("the recording question isn't asked on a first visit");
  await look(page, "consent", 390);
  await wait(2500);
  if (outside.some((u) => u.includes("clarity"))) problems.push(`Clarity was asked for before a yes: ${outside.join(", ")}`);
  const cookies = await page.cookies();
  if (cookies.length) problems.push(`cookies set before a yes: ${cookies.map((c) => c.name)}`);
  await page.click("#consent-yes");
  await wait(4500);
  if (!outside.includes("https://www.clarity.ms/tag/z48i0099gs")) problems.push(`Clarity didn't load after a yes: ${outside.join(", ")}`);
  if (await shown()) problems.push("the question stays after it's answered");
  // A second page remembers the answer, and a no is a no.
  await page.goto(`${base}/`, { waitUntil: "networkidle0" });
  if (await shown()) problems.push("the question comes back after a yes");
  await page.click("#recording-choices");
  await page.click("#consent-no");
  outside.length = 0;
  await page.goto(`${base}/terms`, { waitUntil: "networkidle0" });
  await wait(2500);
  if (outside.some((u) => u.includes("clarity"))) problems.push("Clarity loaded after a no");
  // Dollars by the month for everyone, India's time zone too; rupees and yearly a click
  // away, and kept for the next page.
  const lead = () => page.$eval(".plan--lead .plan__figure", (e) => e.innerText);
  await page.emulateTimezone("Asia/Kolkata");
  await page.goto(`${base}/pricing`, { waitUntil: "networkidle0" });
  const inIndia = await lead();
  await page.emulateTimezone("America/New_York");
  await page.goto(`${base}/pricing`, { waitUntil: "networkidle0" });
  const abroad = await lead();
  if (inIndia !== "$49" || abroad !== "$49") problems.push(`prices open as ${inIndia} in India and ${abroad} in New York, not $49`);
  await page.click("label[for=cur-inr]");
  await page.click("label[for=cyc-year]");
  const picked = await lead();
  if (picked !== "₹47,990") problems.push(`rupees by the year show ${picked}, not ₹47,990`);
  await page.goto(`${base}/`, { waitUntil: "networkidle0" });
  await page.$eval("#pricing", (s) => s.scrollIntoView());
  await wait(300);
  const kept = await lead();
  if (kept !== "₹47,990") problems.push(`the next page forgets the pick: ${kept}`);
  await page.click("label[for=cur-usd]");
  await page.click("label[for=cyc-month]");
  await context.close();
}

await browser.close();
server.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`the site passes in ${browserName} at 390, 760 and 1280 px: ${PAGES.length} pages, axe 0, no layout defects, every word white or grey, every link landing, the visit counted, Clarity only after a yes`);
