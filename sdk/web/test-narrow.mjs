// An answer in a chat widget's width (404 px), and an app's brand colour (what
// a prospect demo found): a four-plan comparison with long feature names fits
// without scrolling; a wider one that doesn't fades out on the side there's
// more to see and keeps its feature names in place; a time slot's label keeps
// to one line; primary buttons and the chosen slot take --ms-primary; and the
// buttons inside an app's own component look like buttons, come with their
// asks as data (actions), and ask when tapped. And a code block's empty line
// keeps its height, so no line number sits on another's.
//
//   node sdk/web/build.mjs && node sdk/web/test-narrow.mjs     (BROWSER=firefox for Firefox)

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { browserName, launch } from "./browser.mjs";

const here = import.meta.dirname;
const dist = join(here, "dist");
const require = createRequire(join(process.env.WEB_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web"), "package.json"));
const puppeteer = require("puppeteer-core");

const plans = `<Compare title="Plans">
| Feature | Starter | Team | Business |
|---|---|---|---|
| Price per staff a month | $3 | $6 | $9 |
| Staff limit | Up to 10 | Up to 50 | Unlimited |
| Time clock with GPS check-in | no | yes | yes |
| Payroll export (Gusto, QuickBooks, Xero) | no | yes | yes |
| Named account manager | no | no | yes |
</Compare>
`;
const six = `<Compare title="Six plans">
| Feature | Free | Starter | Team | Business | Scale | Enterprise |
|---|---|---|---|---|---|---|
| Seats | 1 | 3 | 10 | 50 | 200 | Unlimited |
| Price | $0 | $29 | $79 | $199 | $499 | Talk to us |
</Compare>
`;
const slots = `<Form name="book" submit="Book">
<TimeSlots label="Pick a time" options="Mon 9:30 am | Tue 2:00 pm | Wed 11:00 am | Thu 4:30 pm" name="slot" value="Wed 11:00 am" />
</Form>

<Button ask="Talk to sales">Talk to sales</Button>
`;
const handoff = `<Handoff team="Sales">
Someone from sales can pick this up.
<Button ask="Connect me to sales">Connect me</Button>
<Button variant="secondary" ask="Keep chatting">Not now</Button>
</Handoff>
`;
const code = "<Code file=\"verify.py\">\n```python\nimport hmac\n\ndef verify(sig, body):\n    return hmac.compare_digest(sig, body)\n```\n</Code>\n";
const pack = { name: "demo", version: "1.0.0", components: { Handoff: { about: "a handoff to a person", attrs: { team: { type: "string", required: true } }, content: "text", actions: true } } };

const page = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8">
<link rel="stylesheet" href="/morphscreen.css">
<style>body { margin: 0; padding: 16px; } .box { width: 404px; margin-bottom: 24px; } .brand { --ms-primary: #6c3fd1; --ms-primary-ink: #ffffff; }</style>
</head><body>
<div class="box"><div id="plans" class="ms-answer"></div></div>
<div class="box"><div id="six" class="ms-answer"></div></div>
<div class="box"><div id="slots" class="ms-answer brand"></div></div>
<div class="box"><div id="plain" class="ms-answer"></div></div>
<div class="box"><div id="handoff" class="ms-answer brand"></div></div>
<div class="box"><div id="code" class="ms-answer"></div></div>
<script type="module">
import { loadCore, createAnswer } from "/index.js";
const core = await loadCore("/morphscreen.wasm");
window.actions = [];
window.props = null;
const draw = (id, text, opts = {}) => {
  const a = createAnswer(document.getElementById(id), { core, packs: ["commerce", "scheduling"], onAction: (x) => window.actions.push(x), ...opts });
  a.push(text);
  a.end();
};
draw("plans", ${JSON.stringify(plans)});
draw("six", ${JSON.stringify(six)});
draw("slots", ${JSON.stringify(slots)});
draw("plain", ${JSON.stringify(slots)});
draw("code", ${JSON.stringify(code)}, { packs: ["docs"] });
draw("handoff", ${JSON.stringify(handoff)}, {
  custom: [${JSON.stringify(pack)}],
  components: { Handoff: (el, props) => { if (!props.streaming) window.props = props; el.innerHTML = "<strong>" + props.attrs.team + "</strong>" + props.html; } },
});
window.ready = true;
</script></body></html>`;
const TYPES = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/") return res.writeHead(200, { "content-type": "text/html" }).end(page);
  const f = join(dist, path);
  if (!existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));

const browser = await launch(puppeteer);
const tab = await browser.newPage();
const problems = [];
tab.on("pageerror", (e) => problems.push(`script error: ${e.message}`));
await tab.setViewport({ width: 480, height: 900 });
await tab.goto(`http://127.0.0.1:${server.address().port}/`);
await tab.waitForFunction(() => window.ready);
// The arrival fades end before anything is measured.
await new Promise((r) => setTimeout(r, 900));

const r = await tab.evaluate(async () => {
  const box = (id) => document.querySelector(`#${id} .ms-table`);
  const plans = box("plans");
  const six = box("six");
  const before = six?.dataset.more;
  six.scrollLeft = six.scrollWidth;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const after = six.dataset.more;
  const wed = [...document.querySelectorAll("#slots .ms-chips span")].find((s) => s.textContent.includes("Wed"));
  const css = (sel, k) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[k] : null; };
  const own = document.querySelector("#handoff .ms-custom a.ms-btn");
  return {
    plans: [plans?.scrollWidth, plans?.clientWidth, plans?.dataset.more ?? null],
    six: [before, after, css("#six tbody th", "position")],
    wed: wed && { height: wed.getBoundingClientRect().height, over: wed.scrollWidth - wed.clientWidth },
    picked: css("#slots .ms-chips input:checked + span", "backgroundColor"),
    button: [css("#slots .ms-btn", "backgroundColor"), css("#slots .ms-btn", "color")],
    plain: css("#plain .ms-btn", "backgroundColor"),
    own: own && { bg: getComputedStyle(own).backgroundColor, height: own.getBoundingClientRect().height, underline: getComputedStyle(own).textDecorationLine },
    actions: window.props?.actions,
    lines: [...document.querySelectorAll("#code code > span")].map((l) => Math.round(l.getBoundingClientRect().height)),
  };
});
const brand = "rgb(108, 63, 209)";
if (r.plans[0] > r.plans[1] || r.plans[2]) problems.push(`four plans don't fit 404 px: table ${r.plans[0]} px in ${r.plans[1]} px (data-more ${r.plans[2]})`);
if (r.six[0] !== "right" || r.six[1] !== "left") problems.push(`six plans don't say there's more: data-more ${r.six[0]}, then ${r.six[1]} once scrolled to the end`);
if (r.six[2] !== "sticky") problems.push(`the feature names don't stay put while six plans scroll: ${r.six[2]}`);
if (!r.wed || r.wed.height > 40 || r.wed.over > 0) problems.push(`"Wed 11:00 am" doesn't keep to one line: ${JSON.stringify(r.wed)}`);
if (r.picked !== brand) problems.push(`the chosen slot isn't the brand colour: ${r.picked}`);
if (r.button[0] !== brand || r.button[1] !== "rgb(255, 255, 255)") problems.push(`the primary button isn't the brand colour with its ink: ${r.button}`);
if (r.plain === brand || !r.plain) problems.push(`without --ms-primary the button isn't ink: ${r.plain}`);
if (!r.own || r.own.bg !== brand || Math.round(r.own.height) !== 36 || r.own.underline !== "none") problems.push(`the app's component's button isn't drawn as a button: ${JSON.stringify(r.own)}`);
const want = [{ label: "Connect me", ask: "Connect me to sales", variant: "primary" }, { label: "Not now", ask: "Keep chatting", variant: "secondary" }];
if (JSON.stringify(r.actions) !== JSON.stringify(want)) problems.push(`the app's component got actions ${JSON.stringify(r.actions)}`);
if (r.lines.length !== 4 || Math.min(...r.lines) < Math.max(...r.lines)) problems.push(`a code block's empty line has no height, so its number sits on the next: heights ${r.lines.join(", ")}`);
await tab.click("#handoff .ms-custom a.ms-btn");
const asked = await tab.evaluate(() => window.actions);
if (asked.length !== 1 || asked[0].type !== "ask" || asked[0].text !== "Connect me to sales") problems.push(`tapping its button asked ${JSON.stringify(asked)}`);
await browser.close();
server.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`narrow: ok in ${browserName} (four plans fit 404 px; six fade out where there's more, feature names held; a slot keeps to one line; --ms-primary on buttons and the chosen slot; an app's component's buttons drawn, as data and asking; an empty code line keeps its place)`);
