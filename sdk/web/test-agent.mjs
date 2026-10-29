// AG-UI on the web (roadmap Q9): the example chat page (example/agent.html)
// against a scripted agent on this test's server, used the way a reader
// would. The answer streams in as chunks; a finished quiz goes back as the
// next user message with the ticks in the shared state; the agent's state
// patches tick boxes, mark cards and fill a form; a snapshot rewrites an
// answer; a cut-off stream and a failed run say so; a reload brings the
// conversation back with its components as they were. axe must find nothing.
//   node sdk/web/build.mjs && node sdk/web/test-agent.mjs
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
mkdirSync(join(here, "example/build"), { recursive: true });
await esbuild.build({ entryPoints: [join(here, "example/agent.ts")], outfile: join(here, "example/build/agent.js"), bundle: true, format: "esm", minify: true, target: "es2022", logLevel: "warning" });

const form = `\n\n<Form name="rsvp">\n<Input label="Your name" name="name" />\n<Select label="Meal" name="meal" options="Veg | Fish" />\n<Switch label="Bringing a guest" name="guest" />\n<Button>Send</Button>\n</Form>\n`;
const lesson = readFileSync(join(repo, "test/fixtures/interactive.md"), "utf8") + form;

// The scripted agent: what each run sends back, by how many runs came before.
const requests = [];
const ids = {};
const frame = (e) => `data: ${JSON.stringify(e)}\n\n`;
const chunks = (s, n) => Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, i * n + n));
function reply(input) {
  const run = { threadId: input.threadId, runId: input.runId };
  const start = { type: "RUN_STARTED", ...run, protocolVersion: "1.0" };
  const end = { type: "RUN_FINISHED", ...run };
  switch (requests.length) {
    case 1:
      // The lesson as chunks (the compact spelling), and the agent's own state.
      return [start, { type: "STATE_SNAPSHOT", snapshot: { ...input.state, lesson: "photosynthesis" } }, ...chunks(lesson, 41).map((delta, i) => ({ type: "TEXT_MESSAGE_CHUNK", ...(i === 0 ? { messageId: "m1", role: "assistant" } : {}), delta })), end];
    case 2: {
      // After the quiz: tick everything, mark the second card, fill the form in.
      const m = (node, rest) => `/morphscreen/m1/${node}${rest}`;
      const delta = [
        { op: "replace", path: m(ids.checklist, "/done"), value: [0, 1, 2] },
        { op: "add", path: m(ids.flashcards, ""), value: { known: [1] } },
        { op: "add", path: m(ids.form, ""), value: { fields: { name: "Ana", meal: "Fish", guest: true } } },
      ];
      // An agent-side tool call and its result first: messages the page doesn't show.
      const tool = [{ type: "TOOL_CALL_START", toolCallId: "c1", toolCallName: "grade" }, { type: "TOOL_CALL_ARGS", toolCallId: "c1", delta: '{"score":1}' }, { type: "TOOL_CALL_END", toolCallId: "c1" }, { type: "TOOL_CALL_RESULT", messageId: "t1", toolCallId: "c1", content: "graded" }];
      return [start, { type: "STATE_DELTA", delta }, ...tool, { type: "TEXT_MESSAGE_START", messageId: "m2", role: "assistant" }, ...chunks("Nice work. **Respiration** is next.", 9).map((d) => ({ type: "TEXT_MESSAGE_CONTENT", messageId: "m2", delta: d })), { type: "TEXT_MESSAGE_END", messageId: "m2" }, end];
    }
    case 3:
      // A snapshot rewrites m2, then the stream breaks off mid-answer.
      return [start, { type: "MESSAGES_SNAPSHOT", messages: [...input.messages.filter((x) => x.id !== "m2"), { id: "m2", role: "assistant", content: "Good work. Respiration is next." }] }, { type: "TEXT_MESSAGE_START", messageId: "m3" }, { type: "TEXT_MESSAGE_CONTENT", messageId: "m3", delta: "<Card title=\"Respiration\">\nCells break gluc" }];
    default:
      return [start, { type: "RUN_ERROR", message: "the model is overloaded", code: "overloaded" }];
  }
}

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/agent") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", async () => {
      const input = JSON.parse(body);
      requests.push(input);
      res.writeHead(200, { "content-type": "text/event-stream" });
      // Comments and other fields the binding says to read past.
      res.write(": keep-alive\n\nevent: ignored\nid: 1\n\n");
      for (const e of reply(input)) {
        res.write(frame(e));
        await new Promise((r) => setTimeout(r, 2));
      }
      res.end();
    });
    return;
  }
  const p = join(here, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(here) || !existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await launch(puppeteer);
const failures = [];
const want = (ok, what) => ok || failures.push(what);
const page = await browser.newPage();
page.on("pageerror", (e) => failures.push(e.message));
page.on("console", (m) => m.type() === "error" && !m.location()?.url?.endsWith("/favicon.ico") && failures.push(`console: ${m.text()} ${m.location()?.url ?? ""}`));
await page.setViewport({ width: 760, height: 1000 });
await page.goto(`${origin}/example/agent.html?fresh`);
await page.waitForFunction("window.ready === true", { timeout: 10000 }).catch(() => {
  console.error(failures.join("\n"));
  process.exit(1);
});
const idle = () => page.waitForFunction("!window.chat.running && !document.querySelector('#send').disabled");

// 1. The lesson streams in as one answer.
await page.type("#say", "Quiz me on photosynthesis");
await page.keyboard.press("Enter");
await idle();
const first = await page.evaluate(() => ({
  turns: [...document.querySelectorAll("#chat > .ms-turn")].map((t) => `${t.classList[1]}:${t.dataset.msMessage}`),
  user: document.querySelector("#chat > .ms-turn.ms-user")?.textContent,
  parts: ["quiz", "flashcards", "poll", "checklist", "whatif", "form"].map((c) => !!document.querySelector(`.ms-turn.ms-answer .ms-${c}`)),
  ids: {
    checklist: document.querySelector(".ms-checklist")?.closest("[data-ms-id]")?.dataset.msId,
    flashcards: document.querySelector(".ms-flashcards")?.closest("[data-ms-id]")?.dataset.msId,
  },
}));
want(first.turns.length === 2 && first.turns[1] === "ms-assistant:m1", `turns ${first.turns}`);
want(first.user === "Quiz me on photosynthesis", `user turn ${first.user}`);
want(first.parts.every(Boolean), `answer parts ${first.parts}`);
want(requests[0]?.protocolVersion === "1.0" && requests[0].messages.length === 1, `first request ${JSON.stringify(requests[0])}`);
Object.assign(ids, first.ids);

// 2. Tick a box and type a name: kept as state, not a new turn. (A form is
// built as it streams, so its node id comes from the state it reports.)
await page.click(".ms-checklist li:nth-child(2) input");
await page.type("form.ms-form input[name=name]", "A");
const kept = await page.evaluate(() => window.chat.state());
want(JSON.stringify(kept?.morphscreen?.m1?.[ids.checklist]) === '{"done":[0,1]}', `checklist state ${JSON.stringify(kept)}`);
want(kept?.lesson === "photosynthesis", "the agent's own state is kept");
const formId = Object.entries(kept?.morphscreen?.m1 ?? {}).find(([, v]) => v && v.fields)?.[0];
want(formId && kept.morphscreen.m1[formId].fields.name === "A", `form state ${JSON.stringify(kept?.morphscreen?.m1)}`);
ids.form = formId;
want(requests.length === 1, "a tick starts no run");

// 3. Finish the quiz: the next user message, with the state, starts run 2.
await page.click(".ms-question:nth-child(1) label:nth-of-type(2) input");
await page.click(".ms-question:nth-child(2) label:nth-of-type(1) input");
await page.waitForFunction("document.querySelectorAll('#chat > .ms-turn').length >= 4");
await idle();
const second = requests[1];
const said = second?.messages.at(-1);
want(said?.role === "user" && said.content.startsWith("I finished the quiz: 1 of 2 right."), `quiz message ${JSON.stringify(said)}`);
want(JSON.stringify(second?.state?.morphscreen?.m1?.[ids.checklist]) === '{"done":[0,1]}', "ticks go with the run");
want(second?.messages.some((m) => m.id === "m1" && m.content.startsWith("# Photosynthesis")), "the answer goes back as the assistant's message");

// 4. The agent's patch: all ticked, the second card known, the form filled.
const set = await page.evaluate(() => ({
  ticks: [...document.querySelectorAll(".ms-checklist input")].map((i) => i.checked),
  line: document.querySelector(".ms-checklist .ms-progress-line span")?.textContent,
  known: [...document.querySelectorAll(".ms-flashcards details.ms-card")].map((c) => c.classList.contains("ms-known")),
  name: document.querySelector("form.ms-form input[name=name]")?.value,
  meal: document.querySelector("form.ms-form select[name=meal]")?.value,
  guest: document.querySelector("form.ms-form input[name=guest]")?.checked,
  m2: document.querySelector('[data-ms-message="m2"]')?.textContent?.trim(),
}));
want(set.ticks.join() === "true,true,true" && set.line === "3 of 3 done", `ticks ${set.ticks} ${set.line}`);
want(set.known.join() === "false,true,false", `known ${set.known}`);
want(set.name === "Ana" && set.meal === "Fish" && set.guest === true, `form ${set.name} ${set.meal} ${set.guest}`);
want(set.m2 === "Nice work. Respiration is next.", `m2 ${set.m2}`);
const order = await page.evaluate(() => [...document.querySelectorAll("#chat > .ms-turn:not([hidden])")].map((t) => t.dataset.msMessage));
want(order.length === 4 && order[1] === "m1" && order[3] === "m2", `turn order ${order}`);
const actions = await page.evaluate(() => window.chat.messages().filter((m) => m.role === "user").length);
want(actions === 2, `setting state sent nothing (${actions} user messages)`);

// 5. A snapshot rewrites m2; then the stream breaks off.
await page.type("#say", "What's next?");
await page.keyboard.press("Enter");
await idle();
const third = await page.evaluate(() => ({
  m2: document.querySelector('[data-ms-message="m2"]')?.textContent?.trim(),
  m3: document.querySelector('[data-ms-message="m3"]')?.textContent?.trim(),
  note: document.querySelector(".ms-run-note:not([hidden])")?.textContent,
}));
want(third.m2 === "Good work. Respiration is next.", `snapshot ${third.m2}`);
want(third.m3?.startsWith("Respiration") && third.m3.includes("Cells break gluc"), `cut-off answer ${third.m3}`);
want(third.note === "The reply was cut off.", `note ${third.note}`);

// 6. A failed run says so.
await page.type("#say", "Again");
await page.keyboard.press("Enter");
await idle();
const failed = await page.evaluate(() => document.querySelector(".ms-run-note:not([hidden])")?.textContent);
want(failed === "The agent stopped: the model is overloaded", `error note ${failed}`);

if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
// axe reads colours as they are: text still fading in reads as low contrast.
await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))));
await page.addScriptTag({ content: axeSource });
const axe = await page.evaluate(async () => (await window.axe.run(document.querySelector("#chat"))).violations.map((v) => `${v.id}: ${v.nodes.length}`));
want(axe.length === 0, `axe: ${axe.join(", ")}`);

// 7. A reload: the conversation comes back, components as they were, no run.
const before = requests.length;
await page.goto(`${origin}/example/agent.html`);
await page.waitForFunction("window.ready === true");
const back = await page.evaluate(() => ({
  turns: document.querySelectorAll("#chat > .ms-turn:not([hidden])").length,
  ticks: [...document.querySelectorAll(".ms-checklist input")].map((i) => i.checked).join(),
  quiz: document.querySelector(".ms-quiz .ms-score")?.textContent,
  disabled: [...document.querySelectorAll(".ms-question input")].every((i) => i.disabled),
  name: document.querySelector("form.ms-form input[name=name]")?.value,
}));
want(back.turns === 7, `turns after reload ${back.turns}`);
want(back.ticks === "true,true,true", `ticks after reload ${back.ticks}`);
want(back.quiz === "1 of 2 right" && back.disabled, `quiz after reload ${back.quiz} ${back.disabled}`);
want(back.name === "Ana", `form after reload ${back.name}`);
want(requests.length === before, "a reload runs nothing");

await browser.close();
server.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("agent: ok (stream, actions as messages, state both ways, snapshot, cut off, error, reload; axe)");
