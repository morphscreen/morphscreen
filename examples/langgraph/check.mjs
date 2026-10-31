// The LangGraph example agent (agent.py) streaming into the web SDK, end to
// end: the server is started here, the example chat page is the one it
// serves. A lesson streams in; a tick is kept; the finished quiz goes back as
// the next turn and LangGraph answers it, with the tick still in the state it
// returns; a reload brings it all back. With RECORD=1 it also saves two
// runs' raw responses in test/agui/langgraph/ for the native SDKs' tests.
//   MORPHSCREEN_AGENT_MODEL=script node examples/langgraph/check.mjs
// (any other model id runs the real model on OpenRouter; SHOT=file.png saves a screenshot)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const esbuild = require("esbuild");
const puppeteer = require("puppeteer-core");
const python = process.env.PYTHON ?? join(process.env.HOME, ".cache/morphscreen-agent/venv/bin/python");
const port = Number(process.env.PORT ?? 8124);
const live = (process.env.MORPHSCREEN_AGENT_MODEL ?? "script") !== "script";

await esbuild.build({ entryPoints: [join(repo, "sdk/web/example/agent.ts")], outfile: join(repo, "sdk/web/example/build/agent.js"), bundle: true, format: "esm", minify: true, target: "es2022", logLevel: "warning" });
const server = spawn(python, [join(here, "agent.py")], { env: { ...process.env, PORT: String(port), MORPHSCREEN_AGENT_MODEL: process.env.MORPHSCREEN_AGENT_MODEL ?? "script" }, stdio: ["ignore", "inherit", "inherit"] });
const origin = `http://127.0.0.1:${port}`;
for (let i = 0; ; i++) {
  try {
    if ((await fetch(`${origin}/agent/health`)).ok) break;
  } catch {}
  if (i > 60) throw new Error("the agent didn't start");
  await new Promise((r) => setTimeout(r, 500));
}

const failures = [];
const want = (ok, what) => ok || failures.push(what);
try {
  if (process.env.RECORD) {
    // Two runs' raw responses, as the native tests replay them.
    const out = join(repo, "test/agui/langgraph");
    mkdirSync(out, { recursive: true });
    const post = (input) => fetch(`${origin}/agent`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(input) }).then((r) => r.text());
    const user = { id: "u1", role: "user", content: "Quiz me on photosynthesis" };
    const first = await post({ threadId: "recorded", runId: "r1", protocolVersion: "1.0", state: {}, messages: [user], tools: [], context: [] });
    writeFileSync(join(out, "run1.sse"), first);
    const answer = JSON.parse(first.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).find((l) => l.includes('"MESSAGES_SNAPSHOT"'))).messages.at(-1);
    const quiz = { id: "u2", role: "user", content: 'I finished the quiz: 1 of 2 right.\n1. What absorbs light in a leaf? I answered "B. Chlorophyll" (right).\n2. Which gas do plants take in? I answered "Oxygen" (wrong).' };
    const state = { morphscreen: { [answer.id]: { "4": { done: [0, 1] } } } };
    writeFileSync(join(out, "run2.sse"), await post({ threadId: "recorded", runId: "r2", protocolVersion: "1.0", state, messages: [user, answer, quiz], tools: [], context: [] }));
  }

  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true, protocolTimeout: 600000 });
  const page = await browser.newPage();
  page.on("pageerror", (e) => failures.push(e.message));
  const step = (s) => process.env.VERBOSE && console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`);
  if (process.env.VERBOSE) page.on("console", (m) => console.log(`  page: ${m.text()}`));
  await page.setViewport({ width: 760, height: 1000 });
  await page.goto(`${origin}/example/agent.html?fresh`);
  await page.waitForFunction("window.ready === true");
  const idle = (timeout) => page.waitForFunction("!window.chat.running && !document.querySelector('#send').disabled", { timeout });

  await page.type("#say", live ? "Quiz me on photosynthesis: a short quiz, a few flashcards and a revision checklist." : "Quiz me on photosynthesis");
  await page.keyboard.press("Enter");
  step("sent the first message");
  await idle(live ? 240000 : 30000);
  step("first run over");
  const first = await page.evaluate(() => ({
    turns: [...document.querySelectorAll("#chat > .ms-turn")].map((t) => t.classList[1]),
    quiz: !!document.querySelector(".ms-turn.ms-answer .ms-quiz"),
    checklist: !!document.querySelector(".ms-turn.ms-answer .ms-checklist"),
    note: document.querySelector(".ms-run-note:not([hidden])")?.textContent ?? "",
  }));
  want(first.turns.join() === "ms-user,ms-assistant", `turns ${first.turns}`);
  want(!first.note, `note ${first.note}`);
  if (!live) want(first.quiz && first.checklist, `the lesson's components ${JSON.stringify(first)}`);

  if (first.checklist) {
    await page.click(".ms-checklist li:nth-child(2) input");
  }
  if (first.quiz) {
    // Answer every question: the quiz goes back as the next turn.
    const n = await page.evaluate(() => document.querySelectorAll(".ms-question").length);
    for (let k = 1; k <= n; k++) await page.click(`.ms-question:nth-child(${k}) label:nth-of-type(1) input`);
    step(`answered ${n} questions; ${await page.evaluate(() => document.querySelectorAll("#chat > .ms-turn").length)} turns`);
    await page.waitForFunction("document.querySelectorAll('#chat > .ms-turn').length >= 4", { timeout: live ? 240000 : 30000 });
    await idle(live ? 240000 : 30000);
    const second = await page.evaluate(() => ({
      user: document.querySelectorAll("#chat > .ms-turn.ms-user")[1]?.textContent ?? "",
      reply: document.querySelectorAll("#chat > .ms-turn.ms-answer")[1]?.textContent ?? "",
      ticks: [...document.querySelectorAll(".ms-checklist input")].map((i) => i.checked).join(),
      state: window.chat.state(),
    }));
    want(second.user.startsWith("I finished the quiz:"), `quiz turn ${second.user}`);
    want(second.reply.trim().length > 0, "the agent answered the quiz");
    if (!live) want(second.reply.includes("Nice work"), `reply ${second.reply}`);
    // LangGraph's snapshot carries the components' state back; the tick stands.
    const kept = Object.values(second.state?.morphscreen ?? {}).flatMap((m) => Object.values(m)).some((v) => v?.done?.includes?.(1));
    if (first.checklist) {
      want(kept, `the tick in the agent's state ${JSON.stringify(second.state?.morphscreen)}`);
      want(second.ticks.split(",")[1] === "true", `ticks after the agent's snapshot ${second.ticks}`);
    }
  }
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });

  // A reload: the conversation and its components come back.
  const turns = await page.evaluate(() => document.querySelectorAll("#chat > .ms-turn").length);
  await page.goto(`${origin}/example/agent.html`);
  await page.waitForFunction("window.ready === true");
  const back = await page.evaluate(() => ({ turns: document.querySelectorAll("#chat > .ms-turn").length, score: document.querySelector(".ms-quiz .ms-score")?.textContent ?? "" }));
  want(back.turns === turns, `turns after reload ${back.turns} of ${turns}`);
  if (first.quiz) want(/of \d+ right/.test(back.score), `quiz after reload ${back.score}`);
  await browser.close();
} finally {
  server.kill();
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`langgraph: ok (${live ? process.env.MORPHSCREEN_AGENT_MODEL : "scripted model"}: streamed, quiz back as a turn, state round trip, reload)`);
