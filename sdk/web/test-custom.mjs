// An app's own components (roadmap H1, and what a prospect demo found): a
// text component with buttons is drawn by the app as soon as it opens, from
// its attributes, then again when it's complete with its own words and real
// buttons that ask when clicked; the first drawing's cleanup runs before the
// second; no fading word's wrapper is left inside it; nothing throws.
//
//   node sdk/web/build.mjs && node sdk/web/test-custom.mjs     (BROWSER=firefox for Firefox)

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { browserName, launch } from "./browser.mjs";

const here = import.meta.dirname;
const dist = join(here, "dist");
const require = createRequire(join(process.env.WEB_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web"), "package.json"));
const puppeteer = require("puppeteer-core");

// The demo's SkillCard, as an app defines it.
const pack = {
  name: "tutor",
  version: "1.0.0",
  components: {
    SkillCard: {
      about: "the skill a question tests and what to practise next",
      attrs: { skill: { type: "string", required: true }, mastery: "number" },
      content: "text",
      actions: true,
    },
    // A list component (what a docs demo found: its links arrived empty unless it was "any").
    Sources: { about: "where the answer comes from", attrs: {}, content: "list" },
  },
};
const answer = `Here's where you stand.

<SkillCard skill="Systems of two linear equations" mastery=62>
You can solve a system when one equation is already solved for y. Next: mixed sets.
<Button ask="Give me 5 practice problems">Practice rearranging</Button>
<Button ask="Show me elimination">Teach me elimination</Button>
</SkillCard>

Keep going.

<Sources>
1. [Install guide](https://docs.example.com/install)
2. [API keys](https://docs.example.com/keys)
</Sources>
`;

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Custom</title><link rel="stylesheet" href="/morphscreen.css"></head><body><main id="answer"></main>
<script type="module">
import { createAnswer, loadCore } from "/index.js";
const core = await loadCore("/morphscreen.wasm");
window.calls = [];
window.cleaned = 0;
window.actions = [];
window.errors = [];
window.sources = [];
addEventListener("error", (e) => window.errors.push(e.message));
const handle = createAnswer(document.getElementById("answer"), {
  core,
  custom: [${JSON.stringify(pack)}],
  onAction: (a) => window.actions.push(a),
  components: {
    SkillCard: (el, props) => {
      window.calls.push({ ...props, at: window.pushed });
      const h = document.createElement("article");
      h.className = "skill";
      h.innerHTML = "<strong></strong>" + props.html;
      h.firstChild.textContent = props.attrs.skill + (props.streaming ? " (arriving)" : "");
      el.appendChild(h);
      return () => window.cleaned++;
    },
    Sources: (el, props) => {
      window.sources.push(props);
      el.innerHTML = props.html;
    },
  },
});
window.play = async (text) => {
  window.pushed = 0;
  for (let i = 0; i < text.length; i += 12) {
    handle.push(text.slice(i, i + 12));
    window.pushed = i + 12;
    await new Promise((r) => setTimeout(r, 4));
  }
  handle.end();
};
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
await tab.goto(`http://127.0.0.1:${server.address().port}/`);
await tab.waitForFunction(() => window.ready);
await tab.evaluate((t) => window.play(t), answer);
await new Promise((r) => setTimeout(r, 600));
const r = await tab.evaluate(() => ({
  calls: window.calls,
  cleaned: window.cleaned,
  errors: window.errors,
  shown: document.querySelectorAll('#answer .ms-custom[data-type="SkillCard"]').length,
  words: document.querySelectorAll("#answer .ms-custom ms-word").length,
  card: document.querySelector('#answer .ms-custom[data-type="SkillCard"]')?.textContent ?? "",
}));
const opened = answer.indexOf("<SkillCard");
const closed = answer.indexOf("</SkillCard>");
const [first, last] = [r.calls[0], r.calls.at(-1)];
if (r.calls.length !== 2) problems.push(`drawn ${r.calls.length} times, not twice (on opening, then complete)`);
if (!first?.streaming || first.attrs.skill !== "Systems of two linear equations" || first.at > closed) problems.push(`not drawn from its attributes while it streamed: ${JSON.stringify(first)}`);
if (first && first.at > opened + 80) problems.push(`drawn ${first.at - opened} characters after it opened`);
if (last?.streaming !== false) problems.push("the last drawing still says it's streaming");
if (!last?.text.startsWith("You can solve a system") || last.text.includes("Practice rearranging")) problems.push(`its text is wrong: "${last?.text}"`);
if (!/<a class="ms-btn[^"]*" href="\?ask=Give%20me%205%20practice%20problems">Practice rearranging<\/a>/.test(last?.html ?? "")) problems.push(`its buttons aren't real asks: ${last?.html}`);
if (/ms-pending|pending/.test(last?.html ?? "")) problems.push("a placeholder is left in its html");
if (r.cleaned !== 1) problems.push(`the first drawing's cleanup ran ${r.cleaned} times, not once`);
if (r.shown !== 1 || r.card.includes("(arriving)")) problems.push(`the page shows ${r.shown} cards: "${r.card.slice(0, 80)}"`);
if (r.words) problems.push(`${r.words} fading words' wrappers inside the app's component`);
// A button in the app's drawing asks, like any other.
const button = await tab.$("#answer .ms-custom a.ms-btn");
if (button) await button.click();
else problems.push("no button in the app's drawing to click");
const asked = await tab.evaluate(() => window.actions);
if (button && asked.length !== 1 || asked[0].type !== "ask" || asked[0].text !== "Give me 5 practice problems" || asked[0].node !== "1") problems.push(`clicking its button asked ${JSON.stringify(asked)}`);
const sources = (await tab.evaluate(() => window.sources)).at(-1);
if (!sources || sources.streaming || !/<ol>[\s\S]*<a href="https:\/\/docs\.example\.com\/install"[^>]*>Install guide<\/a>[\s\S]*API keys/.test(sources.html) || !sources.text.includes("Install guide")) problems.push(`a list component got html ${JSON.stringify(sources?.html)} and text ${JSON.stringify(sources?.text)}`);
for (const e of r.errors) problems.push(`error: ${e}`);
await browser.close();
server.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`custom: ok in ${browserName} (drawn from its attributes on opening, then complete with its words and asking buttons; cleanup once; nothing left fading in it)`);
