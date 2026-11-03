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

// A form whose fields are all required, one of them signed on the pad: every
// required field shows the mark, and what was drawn goes with the form as a
// PNG under <name>-drawing (the typed name stays under <name>), worded in the
// message as the file it is.
await page.evaluate(() => (window.actions = []));
const consent = `<Form name="consent">
<Input label="Full name" name="fullname" required="true" />
<Input label="Address" name="address" required="true" />
<File label="ID document" name="doc" required="true" />
<Signature label="Sign here" name="sig" required="true" />
<Button>Sign</Button>
</Form>
`;
await page.evaluate((t) => window.run(t, { chunk: 40, packs: ["inputs", "device"] }), consent);
const marks = await page.evaluate(() =>
  [...document.querySelectorAll("form .field > span:first-child, form .field > legend, form [data-ms-type] > span:first-child")].map((s) => s.textContent.trim()).filter(Boolean),
);
for (const l of ["Full name", "Address", "ID document", "Sign here"]) want(marks.includes(`${l} *`), `required "${l}" should show the mark: labels ${JSON.stringify(marks)}`);
await page.type('input[name="fullname"]', "Ana Lima");
await page.type('input[name="address"]', "Rua Augusta 10, Lisbon");
await page.evaluate(() => {
  const i = document.querySelector('input[name="doc"]');
  const t = new DataTransfer();
  t.items.add(new File(["%PDF-1.4"], "id.pdf", { type: "application/pdf" }));
  i.files = t.files;
  i.dispatchEvent(new Event("change", { bubbles: true }));
});
const pad = await page.evaluate(() => {
  const c = document.querySelector("form canvas");
  c.scrollIntoView({ block: "center" });
  const r = c.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});
await page.mouse.move(pad.x + pad.w * 0.15, pad.y + pad.h * 0.6);
await page.mouse.down();
for (let k = 1; k <= 12; k++) await page.mouse.move(pad.x + pad.w * (0.15 + k * 0.05), pad.y + pad.h * (0.6 - Math.sin(k / 2) * 0.25));
await page.mouse.up();
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Sign").click());
await new Promise((r) => setTimeout(r, 200));
const signed = await page.evaluate(async () => {
  const a = window.actions.filter((x) => x.type === "submit").pop();
  if (!a) return null;
  const d = a.fields["sig-drawing"]?.[0];
  const head = d ? [...new Uint8Array(await d.slice(0, 8).arrayBuffer())] : [];
  const { loadCore } = await import("/sdk/web/dist/index.js");
  const core = await loadCore("/sdk/web/dist/morphscreen.wasm");
  return { name: a.fields.fullname, typed: a.fields.sig, file: d && { name: d.name, type: d.type, size: d.size, png: head.join() === "137,80,78,71,13,10,26,10" }, label: a.labels["sig-drawing"], said: core.actionMessage(a) };
});
want(signed, "the signed form wasn't sent (a required field held it back?)");
want(signed?.name === "Ana Lima" && signed?.typed === "", `the typed fields: ${JSON.stringify(signed && { name: signed.name, typed: signed.typed })}`);
want(signed?.file?.name === "sig.png" && signed.file.type === "image/png" && signed.file.png && signed.file.size > 500, `the drawing should come as a PNG under sig-drawing: ${JSON.stringify(signed?.file)}`);
want(signed?.label === "Sign here (drawing)", `the drawing's label: ${signed?.label}`);
want(signed?.said?.includes("\n- Sign here (drawing): sig.png (image/png)") && !signed.said.includes("base64"), `the message names the drawing as a file: ${JSON.stringify(signed?.said)}`);

await browser.close();
server.close();
if (failures.length) {
  console.error(`forms: ${failures.length} problems\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("forms: ok (time slot, toggles, level, stars and combobox send what was picked, with their labels; required fields marked; a drawn signature sent as a PNG)");
