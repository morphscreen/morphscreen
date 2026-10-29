// The Rust core and the TypeScript reference give the same verdict on every
// recorded answer. Needs the CLI: cargo build --release -p morphscreen-cli (in rust/).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { buildCatalog } from "../spec/catalog.ts";
import { evaluate } from "../validator/validate.ts";

const root = join(import.meta.dirname, "..");
const mscore = join(root, "rust/target.nosync/release/mscore");
const raw = join(root, "bench/raw");

test("Rust and TypeScript verdicts match on every recorded answer", { skip: !existsSync(mscore) && "mscore not built" }, () => {
  const dirs = readdirSync(raw).map((d) => join(raw, d)).filter((d) => statSync(d).isDirectory() && readdirSync(d).some((f) => f.startsWith("ours__")));
  // The packs each answer was asked with, from its run's meta.jsonl (as the CLI reads them).
  const packs = new Map<string, string[]>();
  for (const d of dirs) {
    const meta = join(d, "meta.jsonl");
    if (!existsSync(meta)) continue;
    for (const line of readFileSync(meta, "utf8").split("\n").filter(Boolean)) {
      const m = JSON.parse(line);
      if (m.packs) packs.set(join(d, `${m.id}.txt`), m.packs);
    }
  }
  const out = execFileSync(mscore, ["verdicts", ...dirs], { encoding: "utf8", maxBuffer: 1 << 28 });
  const diffs: string[] = [];
  let n = 0;
  for (const line of out.split("\n").filter(Boolean)) {
    const r = JSON.parse(line) as { file: string; complete: boolean; n: number; errs: [string, string][] };
    const v = evaluate(readFileSync(r.file, "utf8"), { catalog: buildCatalog({ packs: packs.get(r.file) ?? [] }) });
    const ts = v.errs.map((e) => `${e.cls}:${e.detail}`).sort();
    const rs = r.errs.map(([c, d]) => `${c}:${d}`).sort();
    n++;
    if (v.complete !== r.complete || ts.join("|") !== rs.join("|")) diffs.push(`${r.file.slice(raw.length + 1)}\n  ts ${v.complete} ${ts.join(", ")}\n  rs ${r.complete} ${rs.join(", ")}`);
  }
  assert.ok(n > 400, `only ${n} answers`);
  assert.equal(diffs.length, 0, `${diffs.length} of ${n} differ:\n${diffs.slice(0, 12).join("\n")}`);
});
