// An app's own theme (roadmap T1): a W3C Design Tokens file put on the page
// with applyTheme takes over faces, corners, spacing and colours in every
// mode; a scoped theme touches only its own answers; a broken file names the
// token that's wrong.
//   node sdk/web/build.mjs && node sdk/web/test-theme.mjs
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
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".woff2": "font/woff2", ".json": "application/json" };
const server = createServer((req, res) => {
  const p = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await launch(puppeteer);
const failures = [];
const want = (ok, what) => ok || failures.push(what);
const page = await browser.newPage();
page.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
await page.goto(`http://127.0.0.1:${server.address().port}/bench/web/ours.html`);
await page.waitForFunction("window.ready === true");
await page.evaluate(() => window.run(`<Card title="Trip budget">\nFlights are booked.\n<Button>Book the hotel</Button>\n</Card>\n`));

const look = () =>
  page.evaluate(() => {
    const card = document.querySelector(".ms-card");
    const cs = getComputedStyle(card);
    const root = getComputedStyle(document.documentElement);
    return { radius: cs.borderRadius, padding: cs.paddingTop, font: getComputedStyle(card.querySelector("p")).fontFamily, accent: root.getPropertyValue("--ms-accent").trim(), button: getComputedStyle(card.querySelector(".ms-btn")).borderRadius };
  });
const before = await look();
const clay = JSON.parse(readFileSync(join(repo, "test/fixtures/themes/clay.tokens.json"), "utf8"));
const standard = JSON.parse(readFileSync(join(repo, "spec/theme.tokens.json"), "utf8"));

await page.evaluate(async (t) => (await import("/sdk/web/dist/theme.js")).applyTheme(t), clay);
const after = await look();
want(after.radius === "2px" && after.button === "2px", `clay's corners: card ${after.radius}, button ${after.button}`);
want(after.font.startsWith("Charter"), `clay's face: ${after.font}`);
want(after.accent === "#a2431c", `clay's accent in light: ${after.accent}`);
await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
want((await look()).accent === "#e98b5f", `clay's accent in dark: ${(await look()).accent}`);
await page.evaluate(() => (document.documentElement.dataset.theme = "light"));

// Applying again replaces it: the default theme gives back the page as it was.
await page.evaluate(async (t) => (await import("/sdk/web/dist/theme.js")).applyTheme(t), standard);
const back = await look();
want(JSON.stringify(back) === JSON.stringify(before), `the default theme again: ${JSON.stringify(back)} vs ${JSON.stringify(before)}`);
want((await page.evaluate(() => document.querySelectorAll("style[data-ms-theme]").length)) === 1, "one theme style for the page");

// Scoped: only the answers inside #b take it.
const scoped = await page.evaluate(async (t) => {
  const b = document.createElement("div");
  b.id = "b";
  b.className = "ms-answer";
  b.innerHTML = `<section class="ms-card"><p>Second</p><a class="ms-btn ms-primary">Go</a></section>`;
  document.body.append(b);
  (await import("/sdk/web/dist/theme.js")).applyTheme(t, { scope: "#b" });
  return { inside: getComputedStyle(b.querySelector(".ms-card")).borderRadius, outside: getComputedStyle(document.querySelector("#answer .ms-card")).borderRadius };
}, clay);
want(scoped.inside === "2px" && scoped.outside === before.radius, `scoped: inside ${scoped.inside}, outside ${scoped.outside}`);

// A broken file says which token.
const broken = structuredClone(clay);
delete broken.color.dark.accentBg;
const err = await page.evaluate(async (t) => {
  try {
    (await import("/sdk/web/dist/theme.js")).applyTheme(t);
    return "no error";
  } catch (e) {
    return `${e.name}: ${e.message}`;
  }
}, broken);
want(/color\.dark\.accentBg/.test(err), `a missing token: ${err}`);

// An app's plain :root colours, after the stylesheet, win in dark too (the
// SDK's palettes weigh no more than :root), and --ms-numeric sets the figures.
const own = await browser.newPage();
own.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
await own.goto(`http://127.0.0.1:${server.address().port}/bench/web/ours.html`);
await own.waitForFunction("window.ready === true");
const plain = await own.evaluate(async () => {
  document.documentElement.dataset.theme = "dark";
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const before = { page: css("--ms-page"), accent: css("--ms-accent") };
  const style = document.createElement("style");
  style.textContent = ":root { --ms-accent: #010203; --ms-numeric: normal; }";
  document.head.append(style);
  await window.run('<Stat label="Painted" value="c. 1831" />\n', { chunk: 400 });
  return { before, accent: css("--ms-accent"), page: css("--ms-page"), figures: getComputedStyle(document.querySelector(".ms-stat .ms-value")).fontVariantNumeric };
});
want(plain.before.page === "#0b0c0f" && plain.before.accent !== "#010203", `dark palette first: ${JSON.stringify(plain.before)}`);
want(plain.accent === "#010203" && plain.page === "#0b0c0f", `an app's :root accent in dark: ${JSON.stringify(plain)}`);
want(plain.figures === "normal", `--ms-numeric: normal sets a stat's figures: ${plain.figures}`);
await own.close();

await browser.close();
server.close();
if (failures.length) {
  console.error(`theme: ${failures.length} problems\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("theme: ok (an app's DTCG theme takes faces, corners and colours in light and dark; scoped; replaced; a broken file named; a plain :root override wins in dark; --ms-numeric)");
