// /benchmark: how the comparison with OpenUI is run, every run's raw answers
// and verdicts to download (roadmap J2), and each row where OpenUI is ahead
// with its reason written down (J1). A row OpenUI wins that has no reason
// here stops the build.
//
// The briefs are generative-ui-bench's (thesysdev), which has no license, so
// they're linked at the commit we use, never copied; the answers and verdicts
// are ours to publish.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { repo } from "../data.mjs";
import { count, esc } from "./shared.mjs";

const BENCH = "https://github.com/thesysdev/generative-ui-bench/tree/fcca05af68dc3acc5b04660531509b4aed861c7e";

// Each run behind a validity row, newest model first; OpenUI's answers come
// from another run where only our prompt changed.
const RUNS = [
  { run: "deepseek-v4-flash-noreason-all", axis: "Valid answers, DeepSeek V4 Flash, reasoning off, answers to use (Q13), every pack (the API's default), 46 x 2", what: "DeepSeek V4 Flash, reasoning off, every pack (the API's default)", openuiFrom: "deepseek-v4-flash-noreason" },
  { run: "deepseek-v4-flash-noreason-v011b", axis: "Valid answers, DeepSeek V4 Flash, reasoning off, prompt v0.11, core alone, 46 x 2", what: "DeepSeek V4 Flash, reasoning off, core components only", openuiFrom: "deepseek-v4-flash-noreason" },
  { run: "deepseek-v4-flash-noreason", axis: "Valid answers, DeepSeek V4 Flash, reasoning off, 46 briefs x 4", what: "DeepSeek V4 Flash, reasoning off" },
  { run: "deepseek-v4-flash", axis: "Valid answers, DeepSeek V4 Flash, 46 briefs x 4", what: "DeepSeek V4 Flash, its reasoning on, as the benchmark runs it" },
  { run: "nemotron-full-v09", axis: "Valid answers, Nemotron 3 Ultra, 46 briefs x 4", what: "Nemotron 3 Ultra" },
  { run: "nano30-v05", axis: "Valid answers, small model (Nemotron 3 Nano 30B-A3B), 46 x 2", what: "Nemotron 3 Nano 30B, a small open model" },
];

// Why OpenUI is ahead on a row, by the start of its axis (J1).
const REASONS = [
  [
    "Answer tokens, DeepSeek V4 Flash, reasoning off",
    "Longer answers with reasoning off",
    "With reasoning off, our answers run longer than OpenUI's. Ours carry their prose as Markdown around the components, and since prompt v0.11 the model is asked for more to use: a button under each option, quizzes, forms. With reasoning on, ours are the shorter ones. Not closed yet: it needs a prompt change and a new run.",
  ],
];

const results = (run) => JSON.parse(readFileSync(join(repo, "bench/results", `${run}.json`), "utf8"));
const metas = (run) =>
  readFileSync(join(repo, "bench/raw", run, "meta.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

/** Packs a run's raw answers and verdicts as site/dist.nosync/benchmark/<run>.tar.gz; its size. */
function pack(dist, run) {
  mkdirSync(join(dist, "benchmark"), { recursive: true });
  const out = join(dist, "benchmark", `${run}.tar.gz`);
  execFileSync("tar", ["--no-xattrs", "-czf", out, "-C", join(repo, "bench"), `raw/${run}`, `results/${run}.json`], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
  return statSync(out).size;
}

export function benchmarkPage({ board, dist }) {
  const measured = board.tally.ours + board.tally.openui + board.tally.tie;
  const runs = RUNS.map((r) => {
    const row = board.row(r.axis);
    const res = results(r.run);
    const ours = res.filter((x) => x.fmt === "ours").length;
    const model = [...new Set(metas(r.run).map((m) => m.model))].join(", ");
    const size = pack(dist, r.run);
    const from = r.openuiFrom ? `<span class="run-model">its answers from <a class="nb" href="/benchmark/${r.openuiFrom}.tar.gz">${r.openuiFrom}</a></span>` : "";
    return `<tr>
      <th scope="row">${esc(r.what)}<span class="run-model nb">${esc(model)}</span></th>
      <td class="msui-num">${count(ours)}</td>
      <td class="msui-num">${esc(row.ours)}</td>
      <td class="msui-num">${esc(row.openui)}${from}</td>
      <td><a class="nb" href="/benchmark/${r.run}.tar.gz" download>${r.run}.tar.gz</a> <span class="small nb">${Math.round(size / 1024)} KB</span></td>
    </tr>`;
  }).join("");

  const ahead = board.rows.filter((r) => r.winner === "OpenUI");
  for (const r of ahead) {
    if (!REASONS.some(([start]) => r.axis.startsWith(start))) throw new Error(`OpenUI is ahead on "${r.axis}" and the benchmark page has no reason for it: add one to REASONS`);
  }
  // One entry per reason, with the rows it covers.
  const reasons = REASONS.map(([start, title, why]) => [title, why, ahead.filter((r) => r.axis.startsWith(start))])
    .filter(([, , rows]) => rows.length)
    .map(([title, why, rows]) => `<div class="reason">
      <h3 class="reason__title">${title}</h3>
      <p>${why}</p>
      <ul class="reason__rows">${rows.map((r) => `<li>${esc(r.axis)}: ours <span class="msui-num">${esc(r.ours)}</span>, OpenUI <span class="msui-num">${esc(r.openui)}</span></li>`).join("")}</ul>
    </div>`)
    .join("");

  // The scoreboard's own words for a row's method, its ids and hyphenated words kept on one line.
  const how = (axis) =>
    (board.method.get(axis) ?? "")
      .split(/(\s+)/)
      .map((w) => (/[A-Za-z0-9][-/][A-Za-z0-9]/.test(w) ? `<span class="nb">${esc(w)}</span>` : esc(w)))
      .join("");
  const body = `
<header class="page-head">
  <h1 class="title1">The benchmark</h1>
  <p class="lead">How MorphScreen is measured against OpenUI, every answer we scored to download, and the rows where OpenUI is ahead with the reason for each. Of ${measured} rows with numbers for both, MorphScreen is ahead on ${board.tally.ours}, OpenUI on ${board.tally.openui}, and ${board.tally.tie} are even.</p>
  <p class="small">Scoreboard of ${board.date}, commit ${esc(board.commit)}. <a href="/compare/openui">Every row, with how it was measured</a>. <a href="/demo">Both renderers drawing the same answer, live</a>.</p>
</header>

<section class="section prose" aria-labelledby="method-title">
  <div class="section__head"><h2 id="method-title" class="title">How it's run</h2></div>
  <ul>
    <li><strong>The briefs and the rules are OpenUI's own.</strong> We use <a href="${BENCH}">generative-ui-bench</a>, the benchmark thesysdev publishes for OpenUI, at commit fcca05af: its 46 screen briefs, from 2 to 18 numbered requirements each, none naming a component; its condition (temperature 0.7, a 16,384-token ceiling); and its validator for OpenUI Lang. Its briefs aren't ours to copy, so they're linked, not shown.</li>
    <li><strong>The same model, the same providers.</strong> Both formats go through OpenRouter to the same model (for DeepSeek, pinned to the same providers in the same order), four answers a brief, or two in some runs, with the model's reasoning on or off for both alike.</li>
    <li><strong>Each format judged by its own code.</strong> OpenUI Lang by the benchmark's validator and OpenUI's parser; our format by the validator the API runs. Either way an answer counts as valid when its validator finds nothing wrong (it isn't cut off, every component is one the app allows, every setting is of the right kind) and it has at least as many components as the brief has requirements, the benchmark's coverage floor.</li>
    <li><strong>Ahead means past chance.</strong> Where a row counts answers or briefs, one side is ahead only when a two-proportion test puts the gap below p = 0.05. A smaller gap is even, and the row's method gives its p. Timings within a tenth of each other are even too: they move that much between runs.</li>
    <li><strong>Before repair.</strong> The validity rows count the model's first answer. The API then asks the same model to fix only the lines that broke a rule; that's measured apart and not in these rows.</li>
    <li><strong>In the browser.</strong> The speed rows stream 20 answers into Chrome in <span class="nb">32-character</span> chunks with layout forced after each, the same for both renderers: ${how("CPU to stream and render in the browser")}. Time to first text: ${how("Time to first text on screen")}. Layout shift: ${how("Layout shift while streaming")}.</li>
    <li><strong>Sizes</strong> are what a page downloads, brotli-compressed: ${how("Download for streaming in the browser (brotli)")}.</li>
  </ul>
</section>

<section class="section" aria-labelledby="runs-title">
  <div class="section__head">
    <h2 id="runs-title" class="title">The runs</h2>
    <p class="section__note">Each archive holds every raw answer in both formats as the model wrote it, one line per call with its model, tokens, cost and time, and our verdict on each answer.</p>
  </div>
  <div class="table-scroll" tabindex="0" role="region" aria-label="Benchmark runs">
    <table class="board runs">
      <thead><tr><th scope="col">Run</th><th scope="col">Our answers</th><th scope="col">Valid, ours</th><th scope="col">Valid, OpenUI</th><th scope="col">Raw answers and verdicts</th></tr></thead>
      <tbody>${runs}</tbody>
    </table>
  </div>
</section>

<section class="section" aria-labelledby="behind-title">
  <div class="section__head"><h2 id="behind-title" class="title">Where OpenUI is ahead</h2></div>
  <div class="reasons">${reasons}</div>
</section>`;

  return {
    path: "/benchmark",
    title: "The benchmark: MorphScreen against OpenUI | MorphScreen",
    description: `How MorphScreen is measured against OpenUI on OpenUI's own benchmark, every raw answer to download, and the ${board.tally.openui} rows where OpenUI is ahead, with why.`,
    step: "compare",
    body,
  };
}
