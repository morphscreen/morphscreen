// A form filled in the way a reader would, then sent: every field must report
// what was picked. Choices drawn as radios or checkboxes (TimeSlots,
// ToggleGroup, RatingInput) once sent their first option whatever was picked;
// the combobox lists the answer's suggestions in the SDK's own menu.
//   node sdk/web/build.mjs && node sdk/web/test-forms.mjs
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
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".woff2": "font/woff2" };
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
await page.setViewport({ width: 760, height: 900 });
await page.goto(`http://127.0.0.1:${server.address().port}/bench/web/ours.html`);
await page.waitForFunction("window.ready === true");
await page.evaluate(() => (window.actions = []));
const form = `<Form name="trip">
<TimeSlots label="Time" name="slot" options="09:00 | 09:30 | 10:00 | 14:30" required="true" />
<ToggleGroup label="Days" name="days" options="Mon | Tue | Wed | Thu | Fri" value="Mon | Wed" multiple="true" />
<ToggleGroup label="Level" name="level" options="Easy | Hard" value="Easy" />
<RatingInput label="How was it?" name="stars" value="4" />
<Combobox label="Airport" name="airport" options="LIS Lisbon | OPO Porto | MAD Madrid" placeholder="Type to search" />
<Button>Send</Button>
</Form>
`;
await page.evaluate((t) => window.run(t, { chunk: 40, packs: ["scheduling", "inputs"] }), form);
// A choice is clicked by its label: around the input, or pointing at it (RatingInput's stars).
const pick = (name, value) =>
  page.evaluate((name, value) => {
    const i = document.querySelector(`input[name="${name}"][value="${value}"]`);
    (i.closest("label") ?? document.querySelector(`label[for="${i.id}"]`)).click();
  }, name, value);
await pick("slot", "10:00");
await pick("days", "Mon"); // off
await pick("days", "Thu"); // on
await pick("level", "Hard");
await pick("stars", "2");

// The combobox: our menu, not the browser's; typed, then picked with the keyboard.
const combo = await page.evaluate(() => {
  const i = document.querySelector('input[name="airport"]');
  return { list: i.hasAttribute("list"), role: i.getAttribute("role"), chevron: !!i.parentElement.querySelector(".ms-chev") };
});
want(!combo.list && combo.role === "combobox" && combo.chevron, `the combobox should use the SDK's menu: ${JSON.stringify(combo)}`);
await page.click('input[name="airport"]');
await page.keyboard.type("por");
const shown = await page.evaluate(() => [...document.querySelectorAll(".ms-combo .ms-menu:not([hidden]) .ms-opt")].map((o) => o.textContent));
want(JSON.stringify(shown) === JSON.stringify(["OPO Porto"]), `typing "por" should list only OPO Porto, got ${JSON.stringify(shown)}`);
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
const typed = await page.evaluate(() => document.querySelector('input[name="airport"]').value);
want(typed === "OPO Porto", `Enter should pick the suggestion, got "${typed}"`);

await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Send").click());
await new Promise((r) => setTimeout(r, 200));
const sent = await page.evaluate(() => window.actions.filter((a) => a.type === "submit").pop()?.fields);
const expect = { slot: "10:00", days: ["Wed", "Thu"], level: "Hard", stars: "2", airport: "OPO Porto" };
for (const [k, v] of Object.entries(expect)) want(JSON.stringify(sent?.[k]) === JSON.stringify(v), `${k}: sent ${JSON.stringify(sent?.[k])}, picked ${JSON.stringify(v)}`);
// Each field's label as the reader saw it (the required mark left off), and the message worded with them.
const labels = await page.evaluate(() => window.actions.filter((a) => a.type === "submit").pop()?.labels);
const seen = { slot: "Time", days: "Days", level: "Level", stars: "How was it?", airport: "Airport" };
for (const [k, v] of Object.entries(seen)) want(labels?.[k] === v, `${k}'s label: sent ${JSON.stringify(labels?.[k])}, shown ${JSON.stringify(v)}`);
const said = await page.evaluate(async () => {
  const { loadCore } = await import("/sdk/web/dist/index.js");
  const core = await loadCore("/sdk/web/dist/morphscreen.wasm");
  return core.actionMessage(window.actions.filter((a) => a.type === "submit").pop());
});
want(said.includes("\n- Time: 10:00\n") && said.includes("\n- How was it?: 2"), `the message names the labels: ${JSON.stringify(said)}`);

await browser.close();
server.close();
if (failures.length) {
  console.error(`forms: ${failures.length} problems\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("forms: ok (time slot, toggles, level, stars and combobox send what was picked, with their labels)");
