// Generates answers for generative-ui-bench's 46 briefs in our format and/or
// OpenUI Lang, under that benchmark's condition: OpenRouter, temperature 0.7,
// 16,384-token ceiling, no reasoning setting, 4 runs per brief. Unlike its
// runner, this records each call's token usage and the model that answered.
//
//   OPENROUTER_API_KEY=... BENCH_MODEL=~deepseek/deepseek-v4-flash-latest \
//   BENCH_LABEL=deepseekflash node bench/run.ts ours openui
//
// Raws land in bench/raw/<label>/<format>__<brief>__r<n>.txt with one line per
// call in bench/raw/<label>/meta.jsonl. Existing raws are skipped, so an
// interrupted run resumes by running the same command again.
//
// BENCH_PROVIDER is OpenRouter's provider preferences as JSON, the same for
// every format; BENCH_REASONING its reasoning setting ({"effort":"none"} for
// reasoning off), left out by default as the benchmark's condition has it;
// BENCH_BUDGET stops new calls once the dollars recorded in meta.jsonl reach
// it (calls already under way still finish).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promptHash, systemPrompt as oursPrompt } from "../prompt/prompt.ts";
import { buildCatalog } from "../spec/catalog.ts";
import { DEVICE_BRIEFS } from "./briefs/device.ts";
import { EVERYDAY_BRIEFS } from "./briefs/everyday.ts";
import { PACK_BRIEFS } from "./briefs/packs.ts";
import { VISUAL_BRIEFS } from "./briefs/visual.ts";

const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, ".vendor");
if (!existsSync(join(vendor, "briefs/briefs.ts"))) {
  console.error("run bench/setup.sh first");
  process.exit(1);
}
const { SCENARIOS } = await import(join(vendor, "briefs/briefs.ts"));
const { systemPrompt: openuiPrompt } = await import(join(vendor, "protocols/openui/prompt.ts"));

const MODEL = process.env.BENCH_MODEL;
const LABEL = process.env.BENCH_LABEL;
const KEY = process.env.OPENROUTER_API_KEY;
if (!MODEL || !LABEL || !KEY) {
  console.error("BENCH_MODEL, BENCH_LABEL and OPENROUTER_API_KEY are required");
  process.exit(1);
}
const MAX_TOKENS = 16384;
const TEMPERATURE = 0.7;
const REPEATS = Number(process.env.BENCH_REPEATS) || 4;
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY) || 6;
const ONLY = process.env.BENCH_ONLY?.split(",").map((s) => s.trim());
const PROVIDER = process.env.BENCH_PROVIDER ? JSON.parse(process.env.BENCH_PROVIDER) : undefined;
const REASONING = process.env.BENCH_REASONING ? JSON.parse(process.env.BENCH_REASONING) : undefined;
const BUDGET = process.env.BENCH_BUDGET ? Number(process.env.BENCH_BUDGET) : Infinity;
// BENCH_PACKS=device adds packs to our catalog; BENCH_BRIEFS=device runs our
// own device briefs instead of generative-ui-bench's (or both: bench,device);
// BENCH_BRIEFS=pack:data runs a pack's eight briefs (bench/briefs/packs.ts),
// BENCH_BRIEFS=visual the photo briefs (bench/briefs/visual.ts), and
// BENCH_BRIEFS=everyday questions as a person types them (bench/briefs/everyday.ts).
const PACKS = process.env.BENCH_PACKS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
const SOURCES = (process.env.BENCH_BRIEFS ?? "bench").split(",").map((s) => s.trim());
type Brief = { name: string; reqs: number; prompt: string };
const ALL: Brief[] = [
  ...(SOURCES.includes("bench") ? SCENARIOS : []),
  ...(SOURCES.includes("device") ? DEVICE_BRIEFS : []),
  ...(SOURCES.includes("visual") ? VISUAL_BRIEFS : []),
  ...(SOURCES.includes("everyday") ? EVERYDAY_BRIEFS : []),
  ...SOURCES.filter((s) => s.startsWith("pack:")).flatMap((s) => PACK_BRIEFS[s.slice(5)] ?? []),
];
const BRIEFS: Brief[] = ONLY ? ALL.filter((s) => ONLY.includes(s.name)) : ALL;
const catalog = buildCatalog({ packs: PACKS });

// OpenUI as its own apps use it: react-ui's chat library and its prompt
// options, from a built checkout of thesysdev/openui (OPENUI_REPO).
const OPENUI_REPO = process.env.OPENUI_REPO ?? join(process.env.HOME ?? "", "openui");
async function openuiChatPrompt(): Promise<string> {
  const ui = await import(join(OPENUI_REPO, "packages/react-ui/dist/genui-lib/index.mjs"));
  return ui.openuiChatLibrary.prompt(ui.openuiChatPromptOptions);
}

const FORMATS: Record<string, { system: string; hash: string }> = {
  ours: { system: oursPrompt(catalog), hash: promptHash(catalog) },
  openui: { system: openuiPrompt(), hash: "openui-bench-fcca05af" },
  ...(process.argv.includes("openuichat")
    ? { openuichat: { system: await openuiChatPrompt(), hash: "openui-react-ui-chat" } }
    : {}),
};
const fmts = process.argv.slice(2).filter((f) => FORMATS[f]);
if (!fmts.length) {
  console.error(`pass formats: ${Object.keys(FORMATS).join(" ")}`);
  process.exit(1);
}

const dir = join(here, "raw", LABEL);
mkdirSync(dir, { recursive: true });

type Usage = { prompt_tokens?: number; completion_tokens?: number; cost?: number };
async function generate(system: string, user: string) {
  const body = {
    model: MODEL,
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
    usage: { include: true },
    ...(PROVIDER ? { provider: PROVIDER } : {}),
    ...(REASONING ? { reasoning: REASONING } : {}),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(240_000),
      });
      const json = await res.json();
      if (!res.ok || json?.error) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      const choice = json.choices?.[0];
      return {
        text: (choice?.message?.content ?? "") as string,
        finish: choice?.finish_reason as string,
        model: json.model as string,
        usage: (json.usage ?? {}) as Usage,
        ms: Date.now() - started,
      };
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 6000 * (attempt + 1)));
    }
  }
}

const tasks = fmts.flatMap((fmt) =>
  BRIEFS.flatMap((brief) => Array.from({ length: REPEATS }, (_, i) => ({ fmt, brief, r: i + 1 }))),
);
let done = 0;
// What this label has cost so far, from its meta.jsonl, and as calls come back.
let spent = existsSync(join(dir, "meta.jsonl"))
  ? readFileSync(join(dir, "meta.jsonl"), "utf8").split("\n").filter(Boolean).reduce((s, l) => s + (JSON.parse(l).cost ?? 0), 0)
  : 0;
async function worker() {
  for (;;) {
    if (spent >= BUDGET) {
      console.log(`stopping: $${spent.toFixed(4)} spent, the budget is $${BUDGET}`);
      return;
    }
    const t = tasks.shift();
    if (!t) return;
    const id = `${t.fmt}__${t.brief.name}__r${t.r}`;
    const file = join(dir, `${id}.txt`);
    const n = ++done;
    if (existsSync(file) && readFileSync(file, "utf8").trim()) continue;
    try {
      const g = await generate(FORMATS[t.fmt].system, t.brief.prompt);
      spent += g.usage.cost ?? 0;
      writeFileSync(file, g.text);
      appendFileSync(
        join(dir, "meta.jsonl"),
        JSON.stringify({
          id,
          model: g.model,
          finish: g.finish,
          truncated: g.finish === "length",
          promptTokens: g.usage.prompt_tokens ?? null,
          outputTokens: g.usage.completion_tokens ?? null,
          cost: g.usage.cost ?? null,
          ms: g.ms,
          prompt: FORMATS[t.fmt].hash,
          ...(t.fmt === "ours" && PACKS.length ? { packs: PACKS } : {}),
        }) + "\n",
      );
      console.log(`[${n}/${tasks.length + n}] ${id} ${g.text.length} chars, ${g.usage.completion_tokens} tokens, ${g.model}`);
    } catch (e) {
      console.log(`[${n}] ${id} ERROR ${(e as Error).message}`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`done, $${spent.toFixed(4)} spent in all. score with: node bench/score.ts ${LABEL}`);
