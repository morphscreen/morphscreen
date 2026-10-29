// Scores bench/raw/<label>: our format with validator/validate.ts (lenient and
// strict), OpenUI Lang with generative-ui-bench's own validator. Writes
// bench/results/<label>.json and prints the summary.
//
//   node bench/score.ts deepseekflash
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate as evalOurs } from "../validator/validate.ts";
import { buildCatalog } from "../spec/catalog.ts";

const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, ".vendor");
const { SCENARIOS } = await import(join(vendor, "briefs/briefs.ts"));
const { evaluate: evalOpenui } = await import(join(vendor, "protocols/openui/validator.ts"));
// generative-ui-bench counts output tokens on the answer text with o200k, which
// keeps a model's reasoning out of the format comparison; API usage includes it.
const { get_encoding } = createRequire(join(vendor, "package.json"))("tiktoken");
const enc = get_encoding("o200k_base");
const label = process.argv[2];
if (!label) {
  console.error("usage: node bench/score.ts <label>");
  process.exit(2);
}
const dir = join(here, "raw", label);
const reqs = new Map<string, number>(SCENARIOS.map((s: { name: string; reqs: number }) => [s.name, s.reqs]));
const meta = new Map<string, { truncated: boolean; outputTokens: number | null; promptTokens: number | null; cost: number | null; model: string; packs?: string[] }>();
if (existsSync(join(dir, "meta.jsonl"))) {
  for (const line of readFileSync(join(dir, "meta.jsonl"), "utf8").split("\n").filter(Boolean)) {
    const m = JSON.parse(line);
    meta.set(m.id, m);
  }
}

type Row = { fmt: string; scenario: string; repeat: number; complete: boolean; strict?: boolean; renderable: boolean; blank: boolean; classes: string[]; n: number; textTokens: number; tokens: number | null; cost: number | null };
const rows: Row[] = [];
for (const f of readdirSync(dir).sort()) {
  const m = f.match(/^(ours|openui)__(.+)__r(\d+)\.txt$/);
  if (!m) continue;
  const [, fmt, scenario, r] = m;
  const id = f.replace(/\.txt$/, "");
  const text = readFileSync(join(dir, f), "utf8");
  const info = meta.get(id);
  const opts = { truncated: info?.truncated ?? false, reqs: reqs.get(scenario) ?? 0 };
  // Ours is judged against the packs it was asked with (BENCH_PACKS, kept in meta.jsonl).
  const catalog = info?.packs?.length ? buildCatalog({ packs: info.packs }) : undefined;
  const v = fmt === "ours" ? evalOurs(text, { ...opts, catalog }) : evalOpenui(text, opts);
  const strict = fmt === "ours" ? evalOurs(text, { ...opts, catalog, strict: true }).complete : undefined;
  rows.push({
    fmt,
    scenario,
    repeat: Number(r),
    complete: v.complete,
    ...(strict !== undefined ? { strict } : {}),
    renderable: v.renderable,
    blank: !v.renderable || text.trim() === "",
    classes: [...new Set(v.errs.map((e: { cls: string }) => e.cls))],
    n: v.n,
    textTokens: enc.encode(text).length,
    tokens: info?.outputTokens ?? null,
    cost: info?.cost ?? null,
  });
}
writeFileSync(join(here, "results", `${label}.json`), JSON.stringify(rows, null, 1));

const pct = (a: number, b: number) => `${a}/${b} (${((100 * a) / Math.max(b, 1)).toFixed(1)}%)`;
for (const fmt of ["ours", "openui"]) {
  const r = rows.filter((x) => x.fmt === fmt);
  if (!r.length) continue;
  const complete = r.filter((x) => x.complete).length;
  const tokens = r.map((x) => x.tokens).filter((t): t is number => t !== null);
  const cost = r.map((x) => x.cost ?? 0).reduce((a, b) => a + b, 0);
  const classes = new Map<string, number>();
  for (const x of r) for (const c of x.classes) classes.set(c, (classes.get(c) ?? 0) + 1);
  const everyTime = new Map<string, boolean>();
  for (const x of r) everyTime.set(x.scenario, (everyTime.get(x.scenario) ?? true) && x.complete);
  console.log(`\n${fmt}: complete ${pct(complete, r.length)}`);
  if (fmt === "ours") console.log(`  strict (coercions count as errors): ${pct(r.filter((x) => x.strict).length, r.length)}`);
  console.log(`  every time (all repeats of a brief complete): ${pct([...everyTime.values()].filter(Boolean).length, everyTime.size)}`);
  console.log(`  blank screens: ${r.filter((x) => x.blank).length}`);
  const text = r.map((x) => x.textTokens);
  console.log(`  answer tokens (o200k, the benchmark's method): mean ${Math.round(text.reduce((a, b) => a + b, 0) / text.length)}`);
  if (tokens.length) console.log(`  API output tokens incl. reasoning: mean ${Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length)} over ${tokens.length}`);
  if (cost) console.log(`  cost: $${cost.toFixed(4)}`);
  console.log(`  failing runs by class: ${[...classes].sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c} ${k}`).join(", ") || "none"}`);
}
