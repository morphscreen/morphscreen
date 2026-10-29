// The interactive pack on the web (roadmap Q7): test/fixtures/interactive.md
// rendered, then used the way a reader would. A quiz marks each answer and
// reports the score; a card flips and counts as known; a vote and a tick
// report; a slider moves the results. axe must find nothing.
//   node sdk/web/build.mjs && node sdk/web/test-interactive.mjs
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
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  const p = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(repo) || !existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await launch(puppeteer);
const failures = [];
const want = (ok, what) => ok || failures.push(what);
const page = await browser.newPage();
page.on("pageerror", (e) => failures.push(e.message));
await page.setViewport({ width: 760, height: 900 });
await page.goto(`http://127.0.0.1:${server.address().port}/bench/web/ours.html`);
await page.waitForFunction("window.ready === true");
// The bench page reports actions on window.actions.
await page.evaluate(() => (window.actions = []));
// A plain Card after the pack, to check the pack's styles stay inside it.
const plain = '\n\n<Card title="Plain card">\nA paragraph in an ordinary Card.\n</Card>\n';
// A What-if laid out in Columns, as a real answer had it (#239).
const columns = '\n<WhatIf title="Mortgage">\n<Columns>\n<Slider label="Rate" name="rate" min="3" max="9" step="0.25" value="6.5" unit="%" />\n<Slider label="Price" name="price" min="100000" max="900000" step="1000" value="320000" unit="$" />\n<Slider label="Property tax (annual %)" name="tax" min="0.5" max="3" step="0.25" value="1.2" />\n</Columns>\n<Columns>\n<Result label="A month" value="round(price*(rate/100/12)/(1-(1+rate/100/12)^-360))" unit="$" decimals="0" />\n<Result label="A year" value="12*round(price*(rate/100/12)/(1-(1+rate/100/12)^-360))" unit="$" decimals="0" />\n<Result label="Tax a month" value="400000*tax/100/12" unit="$" decimals="0" />\n</Columns>\n</WhatIf>\n';
// A product card with its Buttons, as a shopping answer writes it.
const product = '\n<Product name="Brooks Ghost 16" price="$119" rating="4.6" count="2140">\nPlush and smooth for easy miles.\n<Button ask="Add the Brooks Ghost 16 to my cart">Add to cart</Button>\n<Button variant="secondary" ask="Tell me more about the Brooks Ghost 16">Tell me more</Button>\n</Product>\n';
await page.evaluate((t) => window.run(t, { chunk: 48, packs: ["interactive", "commerce"] }), readFileSync(join(repo, "test/fixtures/interactive.md"), "utf8") + plain + columns + product);
const actions = () => page.evaluate(() => window.actions);

// Quiz: the wrong choice on the first, the right one on the second.
await page.click(".ms-question:nth-child(1) label:nth-of-type(1) input");
await page.click(".ms-question:nth-child(2) label:nth-of-type(2) input");
const quiz = await page.evaluate(() => ({
  first: [...document.querySelectorAll(".ms-question:nth-child(1) label")].map((l) => l.className),
  open: [...document.querySelectorAll(".ms-question details.ms-explain")].map((d) => d.open),
  score: document.querySelector(".ms-quiz .ms-score")?.textContent,
  disabled: [...document.querySelectorAll(".ms-question input")].every((i) => i.disabled),
}));
want(quiz.first.join() === "ms-wrong,ms-right,", `quiz marks ${quiz.first.join()}`);
want(quiz.open.every(Boolean), "explanations open once answered");
want(quiz.score === "1 of 2 right", `score ${quiz.score}`);
want(quiz.disabled, "answers can't change");
const qa = (await actions()).find((a) => a.type === "quiz");
want(qa?.score === 1 && qa.total === 2 && qa.answers[0].right === false && qa.answers[1].choice === "Carbon dioxide", `quiz action ${JSON.stringify(qa)}`);
want(qa?.title === "Quick check", `the quiz action names its quiz: ${qa?.title}`);

// Flashcards: turn the first over, mark it known.
await page.click(".ms-card summary");
await page.click(".ms-card .ms-card-actions .ms-btn");
const cards = await page.evaluate(() => ({ line: document.querySelector(".ms-flashcards .ms-progress-line span")?.textContent, known: document.querySelector(".ms-card")?.classList.contains("ms-known") }));
want(cards.line === "1 of 3 known" && cards.known, `cards ${JSON.stringify(cards)}`);
want((await actions()).some((a) => a.type === "state" && a.name === "known" && a.value[0] === "Chlorophyll"), "known cards reported");

// Poll and checklist.
await page.click(".ms-poll label:nth-of-type(2) input");
want((await actions()).some((a) => a.type === "vote" && a.name === "next" && a.choice === "Transpiration" && a.question === "Which topic next?"), "vote reported, with its poll's question");
// The standard core words an action too (it was only in the agent build).
const voted = await page.evaluate(async () => {
  const { loadCore } = await import("/sdk/web/dist/index.js");
  const core = await loadCore("/sdk/web/dist/morphscreen.wasm");
  return core.actionMessage(window.actions.find((a) => a.type === "vote"));
});
want(voted === 'I voted for "Transpiration" in the poll "Which topic next?".', `vote message ${voted}`);
await page.click(".ms-checklist li:nth-child(2) input");
const check = await page.evaluate(() => document.querySelector(".ms-checklist .ms-progress-line span")?.textContent);
want(check === "2 of 3 done", `checklist ${check}`);
want((await actions()).some((a) => a.type === "state" && a.name === "revision" && a.value.length === 2), "ticks reported");

// What-if: quantity 3 to 5 gives 20 * 5 * 0.9 = 90.
await page.evaluate(() => {
  const s = document.querySelectorAll(".ms-whatif")[0].querySelectorAll("input[type=range]")[1];
  s.value = "5";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
const results = (k) => page.evaluate((k) => [...document.querySelectorAll(".ms-whatif")[k].querySelectorAll(".ms-result output")].map((o) => o.textContent).join(), k);
want((await results(0)) === "$90.00,$10.00", `results ${await results(0)}`);
const shown = await page.evaluate(() => document.querySelectorAll(".ms-whatif")[0].querySelectorAll(".ms-range output")[1]?.textContent);
want(shown === "5", `slider shows ${shown}`);
// Results and sliders in Columns: worked out at the start, and as the rate moves to 7%.
want((await results(1)) === "$2,023,$24,276,$417", `results in Columns ${await results(1)}`);
await page.evaluate(() => {
  const s = document.querySelectorAll(".ms-whatif")[1].querySelector("input[type=range]");
  s.value = "7";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
want((await results(1)) === "$2,129,$25,548,$417", `results in Columns at 7% ${await results(1)}`);
// A value off its step (1.2 on 0.5 + k * 0.25) starts on it, so moving another slider changes nothing else (#240).
const tax = await page.evaluate(() => { const w = document.querySelectorAll(".ms-whatif")[1]; return `${w.querySelectorAll("input[type=range]")[2].value} ${w.querySelectorAll(".ms-range output")[2].textContent}`; });
want(tax === "1.25 1.25", `tax slider and its label ${tax}`);
// A slider with a unit shows its numbers the way a Result does, as it moves too (#241).
const labels = () => page.evaluate(() => [...document.querySelectorAll(".ms-whatif")[1].querySelectorAll(".ms-range")].slice(0, 2).map((r) => r.textContent).join(" | "));
want((await labels()) === "3%7%9% | $100,000$320,000$900,000", `slider labels ${await labels()}`);
await page.evaluate(() => {
  const s = document.querySelectorAll(".ms-whatif")[1].querySelectorAll("input[type=range]")[1];
  s.value = "450000";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
want((await labels()) === "3%7%9% | $100,000$450,000$900,000", `slider labels moved ${await labels()}`);

// A product's Button carries the conversation on.
await page.click(".ms-product .ms-actions a.ms-btn.ms-primary");
want((await actions()).some((a) => a.type === "ask" && a.text === "Add the Brooks Ghost 16 to my cart"), `product button ${JSON.stringify((await actions()).filter((a) => a.type === "ask"))}`);

// Flashcards center their backs; an ordinary Card's paragraphs stay as they are.
const para = await page.evaluate(() => {
  const p = [...document.querySelectorAll("section.ms-card p")].find((x) => x.textContent.includes("ordinary Card"));
  const s = p && getComputedStyle(p);
  return s ? `${s.textAlign} ${s.paddingLeft}` : "missing";
});
want(para === "start 0px", `plain Card paragraph is ${para}`);

await page.addScriptTag({ content: axeSource });
const axe = await page.evaluate(async () => (await window.axe.run(document.querySelector("#answer"))).violations.map((v) => `${v.id}: ${v.nodes.length}`));
want(axe.length === 0, `axe: ${axe.join(", ")}`);

// destroy() empties the element, so a new answer drawn there stands alone.
const left = await page.evaluate(() => {
  window.last.destroy();
  return document.getElementById("answer").childNodes.length;
});
want(left === 0, `destroy left ${left} nodes in the element`);

await browser.close();
server.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("interactive: ok (quiz, flashcards, poll, checklist, what-if; actions and their words; axe; destroy)");
