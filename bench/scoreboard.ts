// The scoreboard: every axis we compete with OpenUI on, measured from what's in
// the repo, with the winner per row. Axes we can't measure yet are listed as
// such, never guessed. Run it after every step: it rewrites bench/SCOREBOARD.md
// and appends one line to bench/scoreboard.jsonl, so the history shows whether
// each step moved anything.
//
//   node bench/scoreboard.ts
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";
import { buildCatalog, defaultCatalog } from "../spec/catalog.ts";
import { DEVICE_BRIEFS } from "./briefs/device.ts";
import { promptHash, systemPrompt } from "../prompt/prompt.ts";
import { evaluate } from "../validator/validate.ts";
import { PACK_BRIEFS } from "./briefs/packs.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const vendor = join(here, ".vendor");
const openuiRepo = process.env.OPENUI_REPO ?? join(process.env.HOME ?? "", "openui");
const { get_encoding } = createRequire(join(vendor, "package.json"))("tiktoken");
const enc = get_encoding("o200k_base");
const tokens = (s: string) => enc.encode(s).length;
const { systemPrompt: openuiBenchPrompt } = await import(join(vendor, "protocols/openui/prompt.ts"));
const ui = await import(join(openuiRepo, "packages/react-ui/dist/genui-lib/index.mjs"));
const lang = await import(join(openuiRepo, "packages/lang-core/dist/index.mjs"));
const schema = ui.openuiChatLibrary.toJSONSchema();
const theirParser = lang.createParser(schema, ui.openuiChatLibrary.root);

type Row = { axis: string; ours: string; openui: string; winner: "ours" | "OpenUI" | "tie" | "not measured"; how: string };
const rows: Row[] = [];
const n = (x: number) => x.toLocaleString("en-US");
const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}% (${a}/${b})`;
const lower = (a: number, b: number): Row["winner"] => (a < b ? "ours" : a > b ? "OpenUI" : "tie");
const higher = (a: number, b: number): Row["winner"] => lower(b, a);
// For a noisy measure: within `share` of each other is even.
const lowerBeyond = (a: number, b: number, share: number): Row["winner"] => (Math.abs(a - b) <= share * Math.max(a, b) ? "tie" : lower(a, b));
const brotli = (b: Buffer) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// ---- Prompt ----
const packNamesAllFirst = ["data", "commerce", "scheduling", "media", "docs", "inputs", "device", "interactive"];
// Two pairs, each like for like: what each format's model saw in the
// benchmark (our core components, OpenUI Lang's benchmark prompt), and each
// side's whole component library (every pack, the API's default; OpenUI's
// chat library, what its apps send).
const ourPrompt = tokens(systemPrompt());
const allCatalog = buildCatalog({ packs: packNamesAllFirst });
const ourAll = tokens(systemPrompt(allCatalog));
const theirChat = tokens(ui.openuiChatLibrary.prompt(ui.openuiChatPromptOptions));
const theirBench = tokens(openuiBenchPrompt());
rows.push({ axis: "System prompt in the benchmark, tokens", ours: `${n(ourPrompt)} (core components)`, openui: `${n(theirBench)} (the benchmark's prompt)`, winner: lower(ourPrompt, theirBench), how: "o200k on the prompt each format's model sees in the benchmark runs" });
rows.push({ axis: "System prompt with every component, tokens", ours: `${n(ourAll)} (${Object.keys(allCatalog.components).length} components, every pack: the API's default)`, openui: `${n(theirChat)} (its chat library, 63 components)`, winner: lower(ourAll, theirChat), how: "o200k on each side's whole component library as its apps send it" });

// ---- Correctness: generative-ui-bench, scored by bench/score.ts ----
type Result = { fmt: string; scenario: string; repeat: number; complete: boolean; strict?: boolean; blank: boolean; textTokens: number };
const results = (label: string): Result[] | null => (existsSync(join(here, `results/${label}.json`)) ? JSON.parse(readFileSync(join(here, `results/${label}.json`), "utf8")) : null);
const key = (r: Result) => `${r.scenario}#${r.repeat}`;
/** The runs both formats have, so a gap in one side's data can't flatter it. */
function matched(rs: Result[]) {
  const both = new Set(rs.filter((r) => r.fmt === "openui").map(key));
  const has = new Set(rs.filter((r) => r.fmt === "ours").map(key));
  return [rs.filter((r) => r.fmt === "ours" && both.has(key(r))), rs.filter((r) => r.fmt === "openui" && has.has(key(r)))];
}
const share = (rs: Result[], f: (r: Result) => boolean) => rs.filter(f).length;
/** `openuiFrom`: OpenUI's answers from another run, when only our prompt changed since. */
function benchRows(label: string, model: string, note: string, openuiFrom?: string) {
  const mine = results(label);
  const theirs = openuiFrom ? results(openuiFrom) : mine;
  if (!mine || !theirs) return;
  const all = [...mine.filter((r) => r.fmt === "ours"), ...theirs.filter((r) => r.fmt === "openui")];
  const [o, t] = matched(all);
  if (!o.length) return;
  const every = (rs: Result[]) => {
    const m = new Map<string, boolean>();
    for (const r of rs) m.set(r.scenario, (m.get(r.scenario) ?? true) && r.complete);
    return [[...m.values()].filter(Boolean).length, m.size];
  };
  const [oe, on] = every(o), [te, tn] = every(t);
  rows.push({ axis: `Valid answers, ${model}`, ours: pct(share(o, (r) => r.complete), o.length), openui: pct(share(t, (r) => r.complete), t.length), winner: higher(share(o, (r) => r.complete) / o.length, share(t, (r) => r.complete) / t.length), how: note });
  rows.push({ axis: `Briefs valid every time, ${model}`, ours: `${oe} of ${on}`, openui: `${te} of ${tn}`, winner: higher(oe / on, te / tn), how: "all repeats of a brief complete" });
  rows.push({ axis: `Blank answers, ${model}`, ours: n(share(o, (r) => r.blank)), openui: n(share(t, (r) => r.blank)), winner: lower(share(o, (r) => r.blank), share(t, (r) => r.blank)), how: "the model wrote nothing usable" });
  const mean = (rs: Result[]) => Math.round(rs.reduce((a, r) => a + r.textTokens, 0) / rs.length);
  rows.push({ axis: `Answer tokens, ${model} (mean)`, ours: n(mean(o)), openui: n(mean(t)), winner: lower(mean(o), mean(t)), how: "o200k on the answer text" });
}
const latest = ["nemotron-full-v09", "nemotron-full-v06", "nemotron-full-v05", "nemotron-full-v04"].find((l) => existsSync(join(here, `results/${l}.json`)))!;
benchRows(latest, "Nemotron 3 Ultra, 46 briefs x 4", `generative-ui-bench rules; ours prompt ${latest.slice(-3)}, OpenUI's benchmark prompt (its answers from the v05 run; its prompt didn't change)`);
const small = existsSync(join(here, "results/nano30-v05.json")) ? "nano30-v05" : "nano30-v04";
benchRows(small, "small model (Nemotron 3 Nano 30B-A3B), 46 x 2", "the closest free model to Gemma 4 26B (Gemma's free endpoint was rate-limited upstream)");
benchRows("deepseek-v4-flash", "DeepSeek V4 Flash, 46 briefs x 4", "generative-ui-bench rules, the model's own reasoning left on as the benchmark has it; both formats through OpenRouter on the same providers (GMI Cloud first, then Relace, then Baidu), 2026-10-23");
benchRows("deepseek-v4-flash-noreason", "DeepSeek V4 Flash, reasoning off, 46 briefs x 4", "the same, with reasoning off for both formats (roadmap A2: whether reasoning off should be the API's default for this model)");
benchRows("deepseek-v4-flash-noreason-q12", "DeepSeek V4 Flash, reasoning off, our Q12 prompt, 46 x 4", "ours with the prompt of 2026-10-24 (photos where people want to see things, specific and never linked from another site; maps with coordinates; sliders with units), OpenUI's answers from the run above (its prompt didn't change)", "deepseek-v4-flash-noreason");

benchRows("deepseek-v4-flash-noreason-v011b", "DeepSeek V4 Flash, reasoning off, prompt v0.11, core alone, 46 x 2", "ours with prompt v0.11 (2026-10-26: answers to use, a Button with ask under each option, photos asked for only when the app gives a photo key), the core's components only, served by Baidu; OpenUI's answers from the reasoning-off run (its prompt didn't change)", "deepseek-v4-flash-noreason");
benchRows("deepseek-v4-flash-noreason-all", "DeepSeek V4 Flash, reasoning off, answers to use (Q13), every pack (the API's default), 46 x 2", "the same prompt with every pack, as the API and the SDKs now load unless an app names its packs: more components to use, more ways to slip (chart data, tabs left open); repair takes them on", "deepseek-v4-flash-noreason");

// ---- Media in answers to everyday questions (Q12; bench/media-use.ts) ----
// ---- Answers to use, not just read (Q13; the same questions and four more) ----
for (const [label, when] of [["deepseek-everyday-final+deepseek-everyday-rich-before", "before Q13"], ["deepseek-everyday-rich", "Q13, every pack"]]) {
  const f = join(here, `results/media-${label}.json`);
  if (!existsSync(f)) continue;
  const m = JSON.parse(readFileSync(f, "utf8"));
  const how = `DeepSeek V4 Flash, reasoning off, every pack, ${m.answers} answers to 14 everyday questions (bench/briefs/everyday.ts), ${when}`;
  rows.push({ axis: `Answers with something to use, ${when}`, ours: `${m.something_to_use}; ${m.responding_components_mean} such components an answer`, openui: "not measured", winner: "not measured", how: `${how}; a quiz, flashcards, a map, a carousel, a button, a form or a what-if (follow-ups, tabs and details counted apart)` });
  rows.push({ axis: `The component a question calls for, ${when}`, ours: m.the_fitting_component, openui: "not measured", winner: "not measured", how: `${how}; Products for shoes to buy, a Quiz or Flashcards for a lesson or phrases, a Compare for two phones` });
  rows.push({ axis: `Valid answers to everyday questions, ${when}`, ours: m.valid, openui: "not measured", winner: "not measured", how });
}

for (const [label, when] of [["deepseek-everyday-before", "before Q12"], ["deepseek-everyday-final", "the Q12 prompt"]]) {
  const f = join(here, `results/media-${label}.json`);
  if (!existsSync(f)) continue;
  const m = JSON.parse(readFileSync(f, "utf8"));
  const how = `DeepSeek V4 Flash, reasoning off, every pack, ${m.answers} answers to 10 questions as people type them (bench/briefs/everyday.ts), ${when}`;
  rows.push({ axis: `Photos where a person would want them, ${when}`, ours: m.photos_where_wanted, openui: "not measured", winner: "not measured", how });
  rows.push({ axis: `Maps for places to go, with coordinates, ${when}`, ours: `${m.map_where_wanted}; ${m.maps_with_coordinates} with Lat and Lng`, openui: "not measured", winner: "not measured", how });
  rows.push({ axis: `Photos linked from another site, ${when}`, ours: n(m.hotlinked_photos), openui: "not measured", winner: "not measured", how: `${how}; such a photo never loads in our SDKs, and the API asks for it by its alt text instead` });
}

// ---- The current format against OpenUI's chat library (side-by-side run) ----
const label = "nemotron-v03";
const raw = join(here, "raw", label);
const runs = readdirSync(raw).map((f) => f.match(/^ours__(.+__r\d+)\.txt$/)?.[1]).filter((b): b is string => !!b && existsSync(join(raw, `openuichat__${b}.txt`))).sort();
const ours = runs.map((b) => readFileSync(join(raw, `ours__${b}.txt`), "utf8"));
const theirs = runs.map((b) => readFileSync(join(raw, `openuichat__${b}.txt`), "utf8"));
const theirErrors = (t: string) => {
  const p = theirParser.parse(t);
  return p.meta.errors.length + p.meta.unresolved.length + p.meta.orphaned.length + (p.root ? 0 : 1);
};
const oursBad = ours.filter((t) => evaluate(t).errs.length).length;
const theirBad = theirs.filter((t) => theirErrors(t) > 0).length;
const briefCount = new Set(runs.map((r) => r.split("__")[0])).size;
rows.push({ axis: `Answers with errors against OpenUI's chat library, ${briefCount} briefs x ${runs.length / briefCount}`, ours: `${oursBad} of ${runs.length}`, openui: `${theirBad} of ${runs.length}`, winner: lower(oursBad, theirBad), how: "the library OpenUI's apps use (14k-token prompt); lang-core's parser, counting what the benchmark counts" });
const tOurs = ours.reduce((a, t) => a + tokens(t), 0);
const tTheirs = theirs.reduce((a, t) => a + tokens(t), 0);
rows.push({ axis: "Answer tokens against the chat library, total", ours: n(tOurs), openui: n(tTheirs), winner: lower(tOurs, tTheirs), how: "fewer tokens is less cost and less waiting" });

// ---- What a browser downloads ----
const dist = join(root, "sdk/web/dist");
// What a page that is one server-rendered answer loads: the SDK's stylesheet and the page around it, as shipped.
const ourCss = brotli(readFileSync(join(dist, "morphscreen.css"))) + brotli(readFileSync(join(dist, "morphscreen-page.css")));
const bundle = join(root, "compare/build/openui.js");
if (existsSync(bundle)) {
  const theirsKb = brotli(readFileSync(bundle)) + brotli(readFileSync(join(openuiRepo, "packages/react-ui/dist/styles/index.css")));
  rows.push({ axis: "Download for a server-rendered answer (brotli)", ours: `${(ourCss / 1000).toFixed(1)} KB, no JavaScript`, openui: `${(theirsKb / 1000).toFixed(0)} KB`, winner: lower(ourCss, theirsKb), how: "our HTML needs only the stylesheet; OpenUI always needs its renderer bundle" });
  if (existsSync(join(dist, "index.js"))) {
    const oursKb = brotli(readFileSync(join(dist, "index.js"))) + brotli(readFileSync(join(dist, "morphscreen.wasm"))) + ourCss;
    rows.push({ axis: "Download for streaming in the browser (brotli)", ours: `${(oursKb / 1000).toFixed(0)} KB (JS, WASM core, CSS)`, openui: `${(theirsKb / 1000).toFixed(0)} KB`, winner: lower(oursKb, theirsKb), how: "sdk/web/dist against OpenUI's React renderer bundle and stylesheet" });
  }
}

// ---- CPU: the core (WASM, in Node like lang-core) against OpenUI's parser ----
function time(f: () => void, runs = 50): number {
  for (let i = 0; i < 5; i++) f();
  const xs: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    f();
    xs.push(performance.now() - t0);
  }
  return median(xs);
}
const { loadCore } = await import("../sdk/web/src/core.ts");
const core = existsSync(join(dist, "morphscreen.wasm")) ? await loadCore(readFileSync(join(dist, "morphscreen.wasm"))) : null;
const parseTheirs = time(() => theirs.forEach((t) => theirParser.parse(t)));
const streamers = theirs.map(() => lang.createStreamingParser(schema, ui.openuiChatLibrary.root));
const streamTheirs = time(() => theirs.forEach((t, k) => {
  streamers[k].set("");
  for (let i = 0; i < t.length; i += 32) streamers[k].push(t.slice(i, i + 32));
}), 5);
if (core) {
  const parseOurs = time(() => ours.forEach((t) => {
    const s = core.session();
    s.push(t);
    s.finish();
    s.free();
  }));
  rows.push({ axis: "Parse and validate a finished answer, all briefs", ours: `${parseOurs.toFixed(2)} ms`, openui: `${parseTheirs.toFixed(2)} ms`, winner: lower(parseOurs, parseTheirs), how: "median of 50; the WASM core and lang-core, both in Node, each on its own answers to the same briefs" });
  const streamOurs = time(() => ours.forEach((t) => {
    const s = core.session();
    for (let i = 0; i < t.length; i += 32) s.push(t.slice(i, i + 32));
    s.finish();
    s.free();
  }), 5);
  rows.push({ axis: "Stream all briefs, 32-char chunks", ours: `${streamOurs.toFixed(1)} ms`, openui: `${streamTheirs.toFixed(1)} ms`, winner: lower(streamOurs, streamTheirs), how: "median of 5, same setup; ours reads each byte once" });
}
// Memory: the core's peak (mscore bench, native) against what OpenUI's parser keeps.
const mscore = join(root, "rust/target.nosync/release/mscore");
if (existsSync(mscore)) {
  const out = execFileSync(mscore, ["bench", raw], { encoding: "utf8" });
  const m = out.match(/peak memory median-ish ([\d.]+)x, worst ([\d.]+)x/);
  const theirMem = JSON.parse(execFileSync(process.execPath, ["--expose-gc", join(here, "memory-openui.mjs"), label], { encoding: "utf8" }).trim().split("\n").pop()!);
  if (m) rows.push({ axis: "Memory while parsing, per byte of answer", ours: `${(+m[1]).toFixed(0)}x (worst ${(+m[2]).toFixed(0)}x)`, openui: `${theirMem.median.toFixed(0)}x (worst ${theirMem.max.toFixed(0)}x)`, winner: lower(+m[1], theirMem.median), how: "ours: the core's peak heap (native); OpenUI: what lang-core's streaming parser keeps after the answer (Node, after GC)" });
}

// ---- In the browser: sdk/web against OpenUI's React renderer (bench/web/run.mjs) ----
const web = join(here, "web/results-nemotron-v03.json");
if (existsSync(web)) {
  const w = JSON.parse(readFileSync(web, "utf8")) as any[];
  const sum = (f: (r: any) => number) => w.reduce((a, r) => a + f(r), 0);
  const med = (f: (r: any) => number) => median(w.map(f));
  const how = `Chrome, ${w.length} answers, 32-character chunks`;
  const runs = w[0].runs ? `; each answer's median of ${w[0].runs} runs` : "";
  rows.push({ axis: "CPU to stream and render in the browser", ours: `${sum((r) => r.ours.busy).toFixed(0)} ms`, openui: `${sum((r) => r.openui.busy).toFixed(0)} ms`, winner: lower(sum((r) => r.ours.busy), sum((r) => r.openui.busy)), how: `${how}, layout forced after every chunk in both${runs}` });
  rows.push({ axis: "Time to first text on screen", ours: `${med((r) => r.ours.first).toFixed(0)} ms`, openui: `${med((r) => r.openui.first).toFixed(0)} ms`, winner: lower(med((r) => r.ours.first), med((r) => r.openui.first)), how: `${how} every 30 ms; median${runs}` });
  rows.push({ axis: "Layout shift while streaming", ours: sum((r) => r.ours.cls).toFixed(3), openui: sum((r) => r.openui.cls).toFixed(3), winner: lower(sum((r) => r.ours.cls), sum((r) => r.openui.cls)), how: `${how}; cumulative layout shift, all answers${runs}` });
  rows.push({ axis: "Memory after the answer, in the browser", ours: `${(med((r) => r.ours.heap) / 1024).toFixed(0)} KB JS + ${(w[0].ours.wasm / 1048576).toFixed(1)} MB WASM`, openui: `${(med((r) => r.openui.heap) / 1048576).toFixed(1)} MB JS`, winner: lower(med((r) => r.ours.heap) + w[0].ours.wasm, med((r) => r.openui.heap)), how: `${how}; median JS heap after GC, plus our WASM memory${runs}` });
  const v = (side: string) => sum((r) => r[side].violations.reduce((a: number, x: any) => a + x.nodes, 0));
  rows.push({ axis: "Accessibility (axe violations)", ours: n(v("ours")), openui: n(v("openui")), winner: lower(v("ours"), v("openui")), how: `${how}; axe-core on the finished answer, light theme` });
  const crashes = w.filter((r) => r.openui.error).length;
  rows.push({ axis: "Render errors while streaming", ours: "0", openui: `${crashes} of ${w.length}`, winner: lower(0, crashes), how: "OpenUI throws React's 'maximum update depth exceeded' (its #990) when each chunk renders synchronously; fine with normal batched updates" });
  rows.push({ axis: "Browser page equals the server HTML", ours: `${w.filter((r) => r.ours.same).length} of ${w.length}`, openui: "no server HTML", winner: "ours", how: "the same answer rendered on a server needs no JavaScript and looks the same" });
}

// ---- How answers look: layout defects, both renderers in Chrome (bench/quality/run.mjs) ----
const quality = join(here, "quality/results.json");
if (existsSync(quality)) {
  const { summary: q } = JSON.parse(readFileSync(quality, "utf8"));
  for (const [width, place] of [["390", "phone"], ["760", "chat column"]]) {
    const s = q[width];
    if (!s) continue;
    const top = (side: string) => Object.entries(s[side].by as Record<string, number>).filter(([k, v]) => k !== "contrast" && v).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ");
    rows.push({ axis: `Layout defects per answer, ${place} (${width} px)`, ours: `${s.ours.layoutPerAnswer} (${s.ours.cleanLayout} of ${s.answers} clean)`, openui: `${s.openui.layoutPerAnswer} (${s.openui.cleanLayout} of ${s.answers} clean)`, winner: lower(s.ours.layoutPerAnswer, s.openui.layoutPerAnswer), how: `${s.answers} answer pairs, same briefs, bench/quality/check.js on the finished answer: overflow, clipped or broken words and IDs, tiny or cramped text, stranded words, lone or uneven cards, chart labels drawn over each other; most common, ours: ${top("ours") || "none"}; OpenUI: ${top("openui") || "none"}` });
  }
  const s = q["390"] ?? q["760"];
  rows.push({ axis: "Answers with low-contrast text", ours: `${s.ours.contrastAnswers} of ${s.answers}`, openui: `${s.openui.contrastAnswers} of ${s.answers}`, winner: lower(s.ours.contrastAnswers, s.openui.contrastAnswers), how: "axe-core's color-contrast rule on the same renders, light theme" });
}

// ---- Privacy: hosts contacted that the app didn't choose (bench/quality/hosts.mjs) ----
const hostsFile = join(here, "quality/hosts.json");
if (existsSync(hostsFile)) {
  const { summary: h } = JSON.parse(readFileSync(hostsFile, "utf8"));
  const list = (x: { hosts: string[] }) => (x.hosts.length ? `: ${x.hosts.slice(0, 4).join(", ")}${x.hosts.length > 4 ? ", ..." : ""}` : "");
  rows.push({ axis: "Answers that contact a host the app didn't choose", ours: `${h.ours.answers} of ${h.answers}`, openui: `${h.openui.answers} of ${h.answers} (${h.openui.requests} requests${list(h.openui)}; ${h.openui.partial} while the URL was still arriving)`, winner: lower(h.ours.answers, h.openui.answers), how: "the same answer pairs in Chrome, every request to another host counted; a model-written image URL that loads tells its host who is reading. Ours loads images only from the API's media origin and the app's hosts (photos the API found, credited); none here" });
}

// Compose: the same defects read from the semantics tree (bench/compose/src/main/kotlin/Check.kt).
const composeQuality = join(here, "quality/compose-results.json");
if (existsSync(composeQuality)) {
  const { summary: q } = JSON.parse(readFileSync(composeQuality, "utf8"));
  const parts = ["390", "760"].filter((w) => q[w]).map((w) => `${q[w].ours.layoutPerAnswer} at ${w} dp (${q[w].ours.cleanLayout} of ${q[w].answers} clean)`);
  rows.push({ axis: "Layout defects per answer, Compose", ours: parts.join(", "), openui: "no Compose renderer", winner: "ours", how: "desktop Compose on the JVM, the answers in the web rows, checked from the semantics tree and each text's layout; chart labels are drawn on a canvas and not checked" });
}

// SwiftUI: both renderers' screenshots read by bench/native nativecheck (Vision OCR).
const swiftQuality = join(here, "quality/swiftui-results.json");
if (existsSync(swiftQuality)) {
  const { summary: q } = JSON.parse(readFileSync(swiftQuality, "utf8"));
  const side = (s: string) => ["390", "760"].filter((w) => q[w]).map((w) => `${q[w][s].layoutPerAnswer} at ${w} pt (${q[w][s].cleanLayout} of ${q[w].answers - q[w][s].renderErrors} clean)`).join(", ");
  const crashes = q["390"]?.openui.renderErrors + q["760"]?.openui.renderErrors;
  const mean = (s: string) => ["390", "760"].filter((w) => q[w]).reduce((a, w) => a + q[w][s].layoutPerAnswer, 0);
  rows.push({ axis: "Layout defects per answer, SwiftUI", ours: side("ours"), openui: `${side("openui")}${crashes ? `; ${crashes} render${crashes > 1 ? "s" : ""} crashed` : ""}`, winner: lower(mean("ours"), mean("openui")), how: "macOS, offscreen window, our SwiftUI view against OpenUI's Swift port on the same answers; text found by Apple's Vision in each screenshot and checked against the answer's own text: split IDs and words, ellipses the answer didn't write, text cut at the window edge, paragraphs under 16 characters a line" });
}

// ---- Natively: sdk/swift against OpenUI's Swift port (bench/native/run.mjs) ----
const nat = join(here, "native/results-nemotron-v03.json");
if (existsSync(nat)) {
  const { summary: s, rows: nr } = JSON.parse(readFileSync(nat, "utf8"));
  const how = `macOS on Apple silicon (no iPhone or simulator here), offscreen SwiftUI window, ${s.answers} answers, 32-character chunks, layout after every chunk`;
  rows.push({ axis: "Main-thread time to stream and render, SwiftUI", ours: `${s.warmMs.ours.toFixed(0)} ms`, openui: `${s.warmMs.openui.toFixed(0)} ms`, winner: lower(s.warmMs.ours, s.warmMs.openui), how: `${how}; the ${s.bothRendered} answers both rendered, warm pass` });
  rows.push({ axis: "Memory added by an answer, SwiftUI", ours: `${s.medianPeakMB.ours} MB`, openui: `${s.medianPeakMB.openui} MB`, winner: lowerBeyond(s.medianPeakMB.ours, s.medianPeakMB.openui, 0.05), how: `${how}; median peak process footprint over the starting footprint; within 5% of each other counts as even (the footprint moves that much between runs)` });
  const crashed = nr.filter((r: any) => r.openui?.error).map((r: any) => r.brief);
  rows.push({ axis: "Crashes while streaming, SwiftUI", ours: `${s.crashes.ours} of ${s.answers}`, openui: `${s.crashes.openui} of ${s.answers}`, winner: lower(s.crashes.ours, s.crashes.openui), how: `each answer in its own process; OpenUI traps inside Swift Charts on ${crashed.join(", ") || "none"}` });
}

// ---- Compose (sdk/android) on the desktop JVM (bench/compose) ----
const comp = join(here, "compose/results-nemotron-v03.json");
if (existsSync(comp)) {
  const r = JSON.parse(readFileSync(comp, "utf8"));
  rows.push({ axis: "Compose renderer streams every bench answer", ours: `${r.rows.length} of ${r.rows.length}, ${(r.warmMs / 1000).toFixed(1)} s in all`, openui: "no Compose renderer", winner: "ours", how: `${r.machine}; Android itself not built here (no Android SDK)` });
}

// ---- Device features: our device briefs, with the device pack on ----
const devRaw = join(here, "raw", "nemotron-device");
if (existsSync(devRaw)) {
  const devCat = buildCatalog({ packs: ["device"] });
  const devRuns = readdirSync(devRaw).map((f) => f.match(/^ours__(.+__r\d+)\.txt$/)?.[1]).filter((b): b is string => !!b && existsSync(join(devRaw, `openuichat__${b}.txt`))).sort();
  const devOurs = devRuns.map((b) => readFileSync(join(devRaw, `ours__${b}.txt`), "utf8"));
  const devTheirs = devRuns.map((b) => readFileSync(join(devRaw, `openuichat__${b}.txt`), "utf8"));
  const needs = new Map(DEVICE_BRIEFS.map((b) => [b.name, b.needs]));
  let asked = 0, delivered = 0;
  devRuns.forEach((r, k) => {
    for (const c of needs.get(r.split("__")[0]) ?? []) {
      asked++;
      if (new RegExp(`<${c}\\b`).test(devOurs[k])) delivered++;
    }
  });
  rows.push({ axis: "Device features asked for that work (camera, scan, map, location, files)", ours: `${delivered} of ${asked}`, openui: `0 of ${asked}`, winner: lower(asked - delivered, asked), how: `${new Set(devRuns.map((r) => r.split("__")[0])).size} device briefs, ${devRuns.length} answers per format; OpenUI has no such components and asks for typed text instead` });
  const dOurs = devOurs.filter((t) => evaluate(t, { catalog: devCat }).errs.length).length;
  const dTheirs = devTheirs.filter((t) => theirErrors(t) > 0).length;
  rows.push({ axis: "Answers with errors, device briefs", ours: `${dOurs} of ${devRuns.length}`, openui: `${dTheirs} of ${devRuns.length}`, winner: lower(dOurs, dTheirs), how: "ours with the device pack, same rules as above" });
}

// ---- Component packs: eight briefs per pack, each run with its pack ----
const packNamesAll = ["data", "commerce", "scheduling", "media", "docs", "inputs", "device", "interactive"];
{
  let asked = 0, used = 0, total = 0, oValid = 0, tValid = 0, oTok = 0, tTok = 0;
  const per: string[] = [];
  for (const p of packNamesAll) {
    const dir = join(here, "raw", `packs-${p}`);
    if (!existsSync(dir)) continue;
    const cat = buildCatalog({ packs: [p] });
    const briefs = new Map(PACK_BRIEFS[p].map((b) => [b.name, b.needs]));
    const pairs = readdirSync(dir).map((f) => f.match(/^ours__(.+__r\d+)\.txt$/)?.[1]).filter((b): b is string => !!b && existsSync(join(dir, `openuichat__${b}.txt`))).sort();
    let pv = 0, pt = 0;
    for (const b of pairs) {
      const o = readFileSync(join(dir, `ours__${b}.txt`), "utf8");
      const t = readFileSync(join(dir, `openuichat__${b}.txt`), "utf8");
      const ok = evaluate(o, { catalog: cat }).complete;
      oValid += +ok;
      pv += +ok;
      tValid += +(theirErrors(t) === 0);
      pt += +(theirErrors(t) === 0);
      oTok += tokens(o);
      tTok += tokens(t);
      for (const c of briefs.get(b.split("__")[0]) ?? []) {
        asked++;
        if (new RegExp(`<${c}\\b`).test(o)) used++;
      }
    }
    total += pairs.length;
    if (pairs.length) per.push(`${p} ${pv}/${pairs.length} (OpenUI ${pt})`);
  }
  if (total) {
    rows.push({ axis: `Valid answers, pack briefs (${total} answers, ${per.length} of ${packNamesAll.length} packs)`, ours: pct(oValid, total), openui: pct(tValid, total), winner: higher(oValid / total, tValid / total), how: `Nemotron 3 Ultra, the answers both formats have (up to 8 briefs x 2 per pack), ours with that pack, OpenUI with its chat library; ours by pack: ${per.join(", ")}; the pack component each brief calls for was used ${used} of ${asked} times` });
    rows.push({ axis: "Answer tokens, pack briefs (total)", ours: n(oTok), openui: n(tTok), winner: lower(oTok, tTok), how: "o200k on the answer text, same runs" });
  }
}
// The gate: every pack in the prompt must not make the regular briefs worse.
{
  // The gate ran on the v0.5 core prompt, so it's compared with the v0.5 run.
  const gate = results("gate-allpacks");
  const base = results("nemotron-full-v05");
  if (gate && base) {
    const g = gate.filter((r) => r.fmt === "ours");
    const keys = new Set(g.map(key));
    const b = base.filter((r) => r.fmt === "ours" && keys.has(key(r)));
    const t = base.filter((r) => r.fmt === "openui" && keys.has(key(r)));
    const gv = share(g, (r) => r.complete) / g.length;
    const gateRaw = join(here, "raw", "gate-allpacks");
    const packComponents = Object.keys(buildCatalog({ packs: packNamesAll }).components).filter((c) => !defaultCatalog.components[c]);
    const unasked = readdirSync(gateRaw).filter((f) => f.startsWith("ours__")).filter((f) => packComponents.some((c) => new RegExp(`<${c}\\b`).test(readFileSync(join(gateRaw, f), "utf8")))).length;
    rows.push({
      axis: `Valid answers with every pack in the prompt, ${g.length} regular answers`,
      ours: `${pct(share(g, (r) => r.complete), g.length)} (${pct(share(b, (r) => r.complete), b.length)} without packs)`,
      openui: pct(share(t, (r) => r.complete), t.length),
      winner: higher(gv, share(t, (r) => r.complete) / t.length),
      how: `generative-ui-bench briefs, core v0.5 with and without every pack, the same repeats; ${unasked} of ${g.length} answers used a pack component (they can, the briefs don't need one); prompt ${n(tokens(systemPrompt(buildCatalog({ packs: packNamesAll }))))} tokens with every pack`,
    });
  }
}

// The interactive pack's gate (Q7): the regular briefs with it in the prompt,
// against the same prompt version without it (v0.9), the same repeats.
{
  const gate = results("gate-interactive");
  const base = results("nemotron-full-v09");
  if (gate && base) {
    const g = gate.filter((r) => r.fmt === "ours");
    const keys = new Set(g.map(key));
    const b = base.filter((r) => r.fmt === "ours" && keys.has(key(r)));
    const t = base.filter((r) => r.fmt === "openui" && keys.has(key(r)));
    const gateRaw = join(here, "raw", "gate-interactive");
    const own = Object.keys(buildCatalog({ packs: ["interactive"] }).components).filter((c) => !defaultCatalog.components[c]);
    const unasked = readdirSync(gateRaw).filter((f) => f.startsWith("ours__")).filter((f) => own.some((c) => new RegExp(`<${c}\\b`).test(readFileSync(join(gateRaw, f), "utf8")))).length;
    rows.push({
      axis: `Valid answers with the interactive pack in the prompt, ${g.length} regular answers`,
      ours: `${pct(share(g, (r) => r.complete), g.length)} (${pct(share(b, (r) => r.complete), b.length)} without it)`,
      openui: pct(share(t, (r) => r.complete), t.length),
      winner: higher(share(g, (r) => r.complete) / g.length, share(t, (r) => r.complete) / t.length),
      how: `generative-ui-bench briefs, prompt v0.9 with and without the interactive pack, the same repeats; ${unasked} of ${g.length} answers used an interactive component (they can, the briefs don't need one)`,
    });
  }
}

// ---- Repair (G4): answers with errors, repaired by the model that wrote them (bench/repair.mjs) ----
for (const file of readdirSync(join(here, "results")).filter((f) => /^repair(-[\w.-]+)?\.json$/.test(f)).sort()) {
  const r = JSON.parse(readFileSync(join(here, "results", file), "utf8"));
  const own = (r.runs as string[]).every((x) => x.startsWith("deepseek"));
  const by = r.label ? `, ${r.model} on ${own ? "its own benchmark answers" : "other models' answers"}` : "";
  const models = Object.entries(r.byModel as Record<string, { tried: number; repaired: number }>).map(([m, v]) => `${m.split("/").pop()!.replace(/:free$/, "")} ${v.repaired} of ${v.tried}`).join(", ");
  const tried = (r.answers as { errors_before: number; repaired?: boolean; why?: string }[]).filter((a) => a.errors_before > 0);
  const late = tried.filter((a) => a.why === "the model took too long" || a.why === "the model couldn't be reached").length;
  const fixedCount = r.valid ?? r.repaired;
  rows.push({ axis: r.valid === undefined ? `Answers with errors repaired by one repair call${by}` : `Answers with errors made valid by repair${by}`, ours: `${fixedCount} of ${r.tried} (${((fixedCount / r.tried) * 100).toFixed(0)}%)${r.valid === undefined ? "" : `; ${r.repaired} improved`}`, openui: "no repair in its open-source SDK; Autofix, in its paid gateway, not measured", winner: "not measured", how: `every recorded answer with errors in ${r.runs.length} runs, repaired ${r.label ? `by ${r.model} through ${r.server}` : `through OpenRouter by the model that wrote it (${models})`}; a repair is kept only when the core finds fewer errors.${late ? ` ${late} stopped at the ${r.limit_s ?? 30} s limit or couldn't reach the model${r.cost === 0 ? ": free models that think at length first, on a slow night" : ""}; of the ${tried.length - late} that replied in time, ${r.repaired} were repaired` : ""}${r.provider ? `; providers ${JSON.stringify(r.provider)}` : ""}; ${r.date}, ${r.commit}` });
  rows.push({ axis: `Time a repair adds${by}`, ours: `${(r.p50_ms / 1000).toFixed(1)} s median, ${(r.p95_ms / 1000).toFixed(1)} s p95`, openui: "not measured", winner: "not measured", how: "the repair call alone, after the answer has streamed; only answers with errors pay it" });
}

// ---- What a developer gets: valid after repair, on a model's own answers ----
if (existsSync(join(here, "results/repair-deepseek-own.json"))) {
  const r = JSON.parse(readFileSync(join(here, "results/repair-deepseek-own.json"), "utf8"));
  for (const [run, name] of [["deepseek-v4-flash", "DeepSeek V4 Flash"], ["deepseek-v4-flash-noreason", "DeepSeek V4 Flash, reasoning off"]]) {
    const all = results(run);
    if (!all) continue;
    const [o, t] = matched(all);
    const fixed = (r.answers as { file: string; errors_before: number; repaired?: boolean; errors_after?: number }[]).filter((a) => a.file.includes(`/${run}/`) && a.errors_before > 0 && a.repaired && a.errors_after === 0).length;
    const ours = share(o, (x) => x.complete) + fixed;
    rows.push({ axis: `Valid after repair, ${name}, 46 briefs x 4`, ours: pct(ours, o.length), openui: `${pct(share(t, (x) => x.complete), t.length)} (no repair in its open-source SDK)`, winner: higher(ours / o.length, share(t, (x) => x.complete) / t.length), how: `the same answers as the row above, each with errors repaired by the same model (${fixed} made valid); an answer cut off at the token limit or left blank isn't repaired (the API gives a blank one a fresh try, not measured here); OpenUI's paid gateway has Autofix, not measured; ${r.date}, ${r.commit}` });
  }
}

// ---- Platforms and components (facts) ----
const platforms = ["HTML without JavaScript", "web (WASM core + DOM, React)"];
if (existsSync(join(root, "sdk/swift/Package.swift"))) platforms.push("SwiftUI (iOS, macOS)");
if (existsSync(join(root, "sdk/android/core/src/androidMain/jniLibs"))) platforms.push("Jetpack Compose (Android)");
else if (existsSync(join(root, "sdk/android/core/build.gradle.kts"))) platforms.push("Compose (desktop JVM; the Android build needs the SDK)");
rows.push({ axis: "Platforms", ours: platforms.join(", "), openui: "React (Swift port in review: #1295)", winner: higher(platforms.length, 1), how: "renderers on the same core and op stream" });
for (const axis of ["Blind preference between screenshots", "Time to first component through the API", "Cost per 1,000 responses, same model"])
  rows.push({ axis, ours: "", openui: "", winner: "not measured", how: "" });
const packNames = readdirSync(join(root, "spec/packs")).map((f) => f.replace(/\.json$/, ""));
const allCat = buildCatalog({ packs: packNames });
const allCount = Object.keys(allCat.components).length;
const ourCount = Object.keys(defaultCatalog.components).length;
const theirNames = Object.keys(ui.openuiChatLibrary.components);
const theirCount = theirNames.length;
// Counted the same way: a part that only lives inside another component isn't one of its own.
// Ours: anything with a parent or named in another's "only:" content (Tab, Step).
// OpenUI's: its item parts (…Item, Col, Point, Series, ScatterSeries, Slice).
const onlyIn = new Set(Object.values(allCat.components).map((c) => (c.content.startsWith("only:") ? c.content.slice(5) : "")).filter(Boolean));
const ourParts = Object.entries(allCat.components).filter(([k, c]) => c.parent || onlyIn.has(k)).length;
const theirParts = theirNames.filter((k) => k.endsWith("Item") || ["Col", "Point", "Series", "ScatterSeries", "Slice"].includes(k)).length;
rows.push({
  axis: "Components available, standalone",
  ours: `${allCount - ourParts} (${allCount} with parts; core ${ourCount}, ${packNames.length - 1} more packs)`,
  openui: `${theirCount - theirParts} (${theirCount} with parts)`,
  winner: higher(allCount - ourParts, theirCount - theirParts),
  how: `parts that only live inside another component left out on both sides (ours: ${ourParts}, like Tab and Step; OpenUI's chat library: ${theirParts} item parts like SelectItem, TabItem, Series); packs add components without adding prompt to apps that don't use them`,
});

// ---- Ahead only past chance ----
// A row that counts (61/92, 34 of 46) can lead by luck on 46 briefs: where a
// two-proportion test can't tell the two apart at p < 0.05, the row is even.
const erf = (x: number) => {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x < 0 ? -y : y;
};
const chance = (a: number, n: number, b: number, m: number) => {
  const p = (a + b) / (n + m);
  const se = Math.sqrt(p * (1 - p) * (1 / n + 1 / m));
  return se ? 1 - erf(Math.abs(a / n - b / m) / se / Math.SQRT2) : 1;
};
// A blank-answer row gives its counts bare; the run's size is in its name (46 briefs x 4).
const counted = (cell: string, axis: string): [number, number] | null => {
  const m = cell.match(/\((\d+)\/(\d+)\)/) ?? cell.match(/^(\d+) of (\d+)/);
  if (m) return [+m[1], +m[2]];
  const size = axis.startsWith("Blank answers") ? axis.match(/(\d+) (?:briefs )?x (\d+)/) : null;
  return size && /^\d+$/.test(cell) ? [+cell, +size[1] * +size[2]] : null;
};
// A timing is a median over runs and still moves up to a tenth between them
// (the parse row went 5% ours, 2% OpenUI's, 10% ours on one day): within 10% is even.
const timed = (cell: string) => cell.match(/^([\d,.]+) (ms|s)\b/);
for (const r of rows) {
  if (r.winner !== "ours" && r.winner !== "OpenUI") continue;
  const [a, b] = [counted(r.ours, r.axis), counted(r.openui, r.axis)];
  if (a && b) {
    const p = chance(a[0], a[1], b[0], b[1]);
    if (p >= 0.05) {
      r.winner = "tie";
      r.how += `; even: a gap this size could be chance (two-proportion test, p = ${p.toFixed(2)})`;
    }
    continue;
  }
  const [x, y] = [timed(r.ours), timed(r.openui)];
  if (x && y && x[2] === y[2]) {
    const [u, v] = [Number(x[1].replace(/,/g, "")), Number(y[1].replace(/,/g, ""))];
    if (Math.abs(u - v) <= 0.1 * Math.max(u, v)) {
      r.winner = "tie";
      r.how += "; even: within 10%, which timings move between runs";
    }
  }
}

// ---- Write ----
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() ? "+changes" : "";
const date = new Date().toISOString().slice(0, 10);
const tally = (w: string) => rows.filter((r) => r.winner === w).length;
const cell = (s: string) => s.replace(/\|/g, "/");
const md = `# Scoreboard

${date}, commit ${commit}${dirty}, prompt ${promptHash()}, catalog ${defaultCatalog.hash}. Generated by \`node bench/scoreboard.ts\`; don't edit by hand.

Ours ahead on ${tally("ours")}, OpenUI ahead on ${tally("OpenUI")}, even on ${tally("tie")}, not measured yet: ${tally("not measured")}.

| Axis | MorphScreen | OpenUI | Ahead | How |
|---|---|---|---|---|
${rows.map((r) => `| ${cell(r.axis)} | ${cell(r.ours)} | ${cell(r.openui)} | ${r.winner} | ${cell(r.how)} |`).join("\n")}
`;
writeFileSync(join(here, "SCOREBOARD.md"), md);
appendFileSync(join(here, "scoreboard.jsonl"), JSON.stringify({ date, commit: commit + dirty, prompt: promptHash(), catalog: defaultCatalog.hash, rows: rows.map(({ axis, ours, openui, winner }) => ({ axis, ours, openui, winner })) }) + "\n");
console.log(md);
