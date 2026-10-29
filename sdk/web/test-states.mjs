// Every component in every state it can be put in (roadmap Q11): each sample
// in test/fixtures/components.json drawn by the SDK, at 1280, 760 and 390 px,
// light and dark, and each interactive state driven (pickers open, a quiz
// marked, a card turned, a chart hovered while it streams and after). After
// each, the page is checked for what the eye catches first: something past
// its box or the screen, text clipped or wrapped where it should be one line,
// a label off the middle of its button, fields in a row that don't line up,
// a popover off screen, a tooltip that speaks for data that hasn't arrived.
//   node sdk/web/test-states.mjs            (needs node sdk/web/build.mjs first)
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { browserName, launch } from "./browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const path = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!path.startsWith(repo) || !existsSync(path)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" }).end(readFileSync(path));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/sdk/web/example/components.html`;
const browser = await launch(puppeteer);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = (p) => p.evaluate(async () => {
  await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  for (let k = 0, last = ""; k < 30; k++) {
    const now = document.getElementById("app").innerHTML;
    if (now === last) break;
    last = now;
    await new Promise((r) => setTimeout(r, 80));
  }
});

// What is checked, in the page.
function check(state) {
  const out = [];
  const nm = (el) => (el.id ? "#" + el.id : el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : "")) + (el.textContent?.trim() ? ` "${el.textContent.trim().replace(/\s+/g, " ").slice(0, 22)}"` : "");
  // Shown: has a box, isn't hidden, isn't the inside of a closed disclosure (a card not turned over).
  const seen = (el) => { const r = el.getBoundingClientRect(); const shut = el.closest("details:not([open])"); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[hidden], [data-ms-hidden]") && !(shut && !el.closest("summary")); };
  const text = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); return [...rg.getClientRects()].filter((r) => r.width > 0.5); };
  const lines = (el) => { let n = 0, bottom = -Infinity; for (const r of text(el).sort((a, b) => a.top - b.top)) { if (r.top > bottom - Math.min(4, r.height / 2)) { n++; bottom = r.bottom; } else bottom = Math.max(bottom, r.bottom); } return n; };
  const scrolls = ".ms-table, pre, .ms-tablist, .ms-carousel > div, .ms-menu, .ms-chart-fit, .ms-gallery";
  // Inside its box.
  const boxes = ".ms-card, .ms-group, .ms-stat, .ms-spark, .ms-product, .ms-plan, .ms-event, .ms-countdown, .ms-callout, .ms-btn, .ms-control, .ms-menu, .ms-step, .ms-chips span, .ms-question label, .ms-poll label, .ms-flashcards details.ms-card, .ms-drop, .ms-audio, .ms-embed a, .ms-qr, .ms-tag, .ms-cal, .ms-citation";
  for (const box of document.querySelectorAll(boxes)) {
    if (!seen(box)) continue;
    const c = box.getBoundingClientRect();
    for (const el of box.querySelectorAll("*")) {
      const sc = el.closest(scrolls);
      if (sc && sc !== el && box.contains(sc)) continue;
      if (el.closest(".ms-menu") && !box.matches(".ms-menu") && box.contains(el.closest(".ms-menu"))) continue;
      if (!seen(el) || el.matches(".ms-mark, .ms-chart-tip, .ms-chart-tip *")) continue;
      // Folded away on purpose (inside something clipped to no height).
      let folded = false;
      for (let a = el.parentElement; a && a !== box; a = a.parentElement) if (getComputedStyle(a).overflow !== "visible" && a.getBoundingClientRect().height < 1) folded = true;
      if (folded) continue;
      const r = el.getBoundingClientRect();
      const over = Math.max(r.right - c.right, c.left - r.left, r.bottom - c.bottom, c.top - r.top);
      if (over > 1) out.push(`${nm(el)} sticks out of ${nm(box)} by ${Math.round(over)}px`);
    }
  }
  // Text clipped where it shouldn't be, or run past its box on one line.
  for (const el of document.querySelectorAll("#app *")) {
    // A star rating's filled share is clipped on purpose.
    if (!seen(el) || el.closest(scrolls + ", svg, .ms-stars")) continue;
    const cs = getComputedStyle(el);
    if ((cs.overflowX === "hidden" || cs.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && !el.matches(".ms-control > span, .ms-title, .ms-chips span")) out.push(`${nm(el)} clips its text (${el.scrollWidth} > ${el.clientWidth})`);
    if (cs.whiteSpace === "nowrap" && el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && cs.display !== "inline") out.push(`${nm(el)} text runs past its box`);
  }
  // Text that can't wrap runs out of its own box into its neighbour's (a
  // time like "12:30–1:00pm" in a column narrower than it).
  for (const el of document.querySelectorAll("#app *")) {
    if (!seen(el) || el.closest(scrolls + ", svg, .ms-stars") || getComputedStyle(el).display === "inline") continue;
    if ([...el.children].some((k) => getComputedStyle(k).display !== "inline")) continue;
    const c = el.getBoundingClientRect();
    const over = Math.max(0, ...text(el).map((r) => Math.max(r.right - c.right, c.left - r.left)));
    if (over > 1) out.push(`${nm(el)} text runs out of its box by ${Math.round(over)}px`);
  }
  // One line where it should be.
  for (const el of document.querySelectorAll("#app :is(.ms-btn.ms-small, .ms-tag, .ms-chips span, .ms-opt, .ms-cal-head > span, .ms-stat .ms-change, thead th, .ms-tablist label, .ms-time, .ms-control > span, .ms-rating)")) if (seen(el) && lines(el) > 1) out.push(`${nm(el)} wraps onto ${lines(el)} lines`);
  // Labels in the middle of their buttons.
  for (const b of document.querySelectorAll("#app :is(.ms-btn, .ms-chips span, .ms-day, .ms-icon-btn, .ms-play, .ms-copy, .ms-step button)")) {
    if (!seen(b)) continue;
    const r = b.getBoundingClientRect(), t = text(b);
    if (!t.length || b.closest(".ms-step") && !b.matches("button")) continue;
    // A mark drawn before the label (a calendar or share icon) is part of what's centred.
    const pre = getComputedStyle(b, "::before");
    const lead = pre.content !== "none" && pre.position !== "absolute" ? (parseFloat(pre.width) || 0) + (parseFloat(pre.marginRight) || 0) : 0;
    const l = Math.min(...t.map((x) => x.left)) - lead, rr = Math.max(...t.map((x) => x.right));
    const off = (l + rr) / 2 - (r.left + r.right) / 2;
    if (Math.abs(off) > 2 && lines(b) === 1) out.push(`${nm(b)} label is off-centre by ${Math.round(off)}px`);
  }
  // Fields side by side start at the same height.
  for (const cols of document.querySelectorAll("#app .ms-cols")) {
    const rows = new Map();
    for (const cell of cols.children) {
      const f = cell.querySelector(":scope > .ms-field > :is(input, select, textarea, .ms-pick, .ms-step), :scope > .ms-field > span > .ms-step");
      if (!f || !seen(f)) continue;
      const k = Math.round(cell.getBoundingClientRect().top);
      rows.set(k, [...(rows.get(k) ?? []), Math.round(f.getBoundingClientRect().top)]);
    }
    for (const [, ts] of rows) if (Math.max(...ts) - Math.min(...ts) > 1) out.push(`fields in one row start ${Math.max(...ts) - Math.min(...ts)}px apart`);
  }
  // A month's days under their weekdays.
  for (const cal of document.querySelectorAll(".ms-cal:not([hidden])")) {
    const heads = [...cal.querySelectorAll(".ms-dow")].map((h) => { const t = text(h)[0]; return t ? (t.left + t.right) / 2 : null; });
    const grid = cal.querySelector(".ms-cal-grid").getBoundingClientRect();
    for (const b of cal.querySelectorAll(".ms-day")) {
      const t = text(b)[0], r = b.getBoundingClientRect();
      const col = Math.round((r.left - grid.left) / (grid.width / 7));
      if (t && heads[col] != null && Math.abs((t.left + t.right) / 2 - heads[col]) > 2) out.push(`day ${b.textContent} is off its weekday`);
    }
  }
  // Popovers on the screen.
  for (const m of document.querySelectorAll(".ms-menu:not([hidden])")) {
    const r = m.getBoundingClientRect();
    if (r.left < -1 || r.right > innerWidth + 1) out.push(`${nm(m)} runs off the screen (${Math.round(r.left)} to ${Math.round(r.right)} of ${innerWidth})`);
  }
  // A chart's tooltip speaks only for what is drawn, and stays in its chart.
  for (const tip of document.querySelectorAll(".ms-chart-tip.ms-on")) {
    const fig = tip.closest("figure.ms-chart");
    const tr = tip.getBoundingClientRect(), fr = fig.getBoundingClientRect();
    if (tr.left < fr.left - 1 || tr.right > fr.right + 1) out.push("a chart tooltip leaves its chart");
  }
  if (state.startsWith("chart hover") && !document.querySelector(".ms-chart-tip.ms-on")) out.push("no tooltip under the pointer");
  // A choice's key shows one thing: its letter, or the check or cross it turned into.
  for (const l of document.querySelectorAll("#app label:has(> .ms-mark)")) {
    const b = getComputedStyle(l, "::before");
    if (seen(l) && b.content.includes("counter") && b.color !== "rgba(0, 0, 0, 0)") out.push(`${nm(l)} shows its letter under its mark`);
  }
  // A marked answer in its own colour: right in the good tone, wrong in the bad, whatever was chosen.
  const tone = (v) => { const x = document.createElement("i"); x.style.color = `var(${v})`; document.body.append(x); const c = getComputedStyle(x).color; x.remove(); return c; };
  for (const [cls, v] of [["right", "--ms-good-bg"], ["wrong", "--ms-bad-bg"]])
    for (const l of document.querySelectorAll(`#app .ms-question label.ms-${cls}`)) if (seen(l) && getComputedStyle(l).backgroundColor !== tone(v)) out.push(`${nm(l)} is marked ${cls} but not in its colour`);
  // Cards in one grid share a height, turned over or not, so a row stays even.
  for (const list of document.querySelectorAll("#app .ms-flashcards ol")) {
    // (A closed card is itself a closed disclosure, so it counts as shown when it has a box.)
    const hs = [...list.querySelectorAll(":scope > li > details.ms-card, :scope > details.ms-card")].map((c) => Math.round(c.getBoundingClientRect().height)).filter((h) => h > 0);
    if (hs.length > 1 && Math.max(...hs) - Math.min(...hs) > 1) out.push(`flashcards differ in height (${Math.min(...hs)} to ${Math.max(...hs)}px)`);
  }
  // A step's connector is a thin line; the last step has none (a done last step once filled its row).
  for (const li of document.querySelectorAll("#app .ms-steps > li:last-child")) if (seen(li) && getComputedStyle(li).backgroundImage !== "none") out.push(`${nm(li)} paints its whole row`);
  // A carousel's two arrows sit together.
  for (const nav of document.querySelectorAll("#app .ms-rail-nav")) {
    const [a, b] = [...nav.querySelectorAll("button")].map((x) => x.getBoundingClientRect());
    if (a && b && b.left - a.right > 24) out.push(`a carousel's arrows sit ${Math.round(b.left - a.right)}px apart`);
  }
  if (document.documentElement.scrollWidth > innerWidth) out.push("the page scrolls sideways");
  return out;
}

/** The box of the first match that shows (a chart comes drawn at up to three widths; one shows). */
const shown = (p, sel) => p.evaluate((sel) => {
  const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}, sel);
const hover = (sel, fx) => async (p) => { const b = await shown(p, sel); await p.mouse.move(b.x + b.width * fx, b.y + b.height * 0.5); await wait(200); };

// The states: [name, samples to draw, what to do].
const click = (sel) => async (p) => { await p.click(sel); await wait(250); };
const states = [
  ["at rest", null, async () => {}],
  ["select open", ["core-form-fields"], click("#core-form-fields .ms-pick:has([aria-haspopup=listbox]) > .ms-control")],
  ["date open", ["core-form-fields"], click("#core-form-fields .ms-pick:has([aria-haspopup=dialog]) > .ms-control")],
  ["date next month", ["core-form-fields"], async (p) => { await click("#core-form-fields .ms-pick:has([aria-haspopup=dialog]) > .ms-control")(p); await click("#core-form-fields .ms-cal [aria-label='Next month']")(p); }],
  ["date picked", ["core-form-fields"], async (p) => { await click("#core-form-fields .ms-pick:has([aria-haspopup=dialog]) > .ms-control")(p); await click("#core-form-fields .ms-day:not(:disabled):nth-of-type(20)")(p); }],
  ["time open", ["inputs-time"], click("#inputs-time .ms-control")],
  ["stepper up", ["inputs-stepper"], click("#inputs-stepper .ms-step button[aria-label='More']")],
  ["quiz wrong", ["interactive-quiz-question"], click("#interactive-quiz-question li.ms-question label")],
  ["quiz done", ["interactive-quiz-question"], async (p) => { for (const q of [1, 2]) await click(`#interactive-quiz-question li.ms-question:nth-child(${q}) label:nth-of-type(2)`)(p); }],
  ["card turned", ["interactive-flashcards"], click("#interactive-flashcards details.ms-card > summary")],
  ["card known", ["interactive-flashcards"], async (p) => { await click("#interactive-flashcards details.ms-card > summary")(p); await click("#interactive-flashcards details.ms-card[open] .ms-card-actions button")(p); }],
  ["combobox typed", ["inputs-combobox"], async (p) => { await p.click("#inputs-combobox input"); await p.keyboard.type("o"); await wait(250); }],
  ["poll voted", ["interactive-poll"], click("#interactive-poll .ms-poll label")],
  ["checklist ticked", ["interactive-checklist"], click("#interactive-checklist label:nth-child(1)")],
  ["details open", ["core-details"], click("#core-details details:not([open]) > summary")],
  ["tab two", ["core-tabs-tab"], click("#core-tabs-tab .ms-tablist label:nth-child(2)")],
  ["code copied", ["docs-code"], click("#docs-code .ms-copy")],
  ["carousel next", ["media-carousel"], async (p) => { await click("#media-carousel .ms-rail-nav [aria-label='Next']")(p); await wait(600); }],
  ["slot picked", ["scheduling-timeslots"], click("#scheduling-timeslots .ms-chips label:nth-child(2)")],
  ["stars picked", ["inputs-ratinginput"], click("#inputs-ratinginput label")],
  ["chart hover", ["core-chart-line"], hover("#core-chart-line figure.ms-chart svg", 0.6)],
  ["chart hover at the edge", ["core-chart-line"], hover("#core-chart-line figure.ms-chart svg", 0.99)],
  ["chart while streaming", ["core-chart-bar"], async (p) => { p.evaluate(() => window.draw("core-chart-bar", true)); await wait(700); }],
];

const problems = new Map();
let runs = 0;
for (const width of [1280, 760, 390]) {
  for (const theme of ["light", "dark"]) {
    for (const [name, only, act] of states) {
      const page = await browser.newPage();
      page.on("pageerror", (e) => problems.set(`error: ${e.message}`, `${name} @${width} ${theme}`));
      await page.setViewport({ width, height: 900 });
      // The page pins its palette with ?theme=; Chrome's controls follow the scheme too (Firefox can't emulate it per page).
      if (browserName === "chrome") await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
      await page.goto(`${base}?theme=${theme}${only ? `&only=${only.join(",")}` : ""}`);
      await page.waitForFunction("window.ready === true", { timeout: 30000 });
      await page.evaluate(() => document.fonts.ready);
      await quiet(page);
      if (only) await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: "start" }), only[0]);
      try {
        await act(page);
      } catch (e) {
        problems.set(`could not do "${name}": ${String(e.message).split("\n")[0]}`, `${name} @${width} ${theme}`);
      }
      if (name !== "chart while streaming") await quiet(page);
      for (const f of await page.evaluate(check, name)) if (!problems.has(f)) problems.set(f, `${name} @${width} ${theme}`);
      runs++;
      await page.close();
    }
  }
}
await browser.close();
server.close();
if (problems.size) {
  for (const [f, at] of problems) console.log(`${f}   [${at}]`);
  console.log(`states: FAILED (${problems.size} problems in ${runs} runs)`);
  process.exit(1);
}
console.log(`states: ok (${states.length} states x 3 widths x 2 palettes, ${runs} runs)`);
