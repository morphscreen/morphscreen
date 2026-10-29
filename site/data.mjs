// What the site says, read from the repository at build time (roadmap N1):
// the plans from the API's own price sheet, every benchmark number from
// bench/scoreboard.jsonl, the component families from spec/packs. A number
// the site needs and can't find stops the build, so none can go stale.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const repo = join(import.meta.dirname, "..");

/** The plans, as rust/api/src/plans.rs sets them. */
export function plans() {
  const src = readFileSync(join(repo, "rust/api/src/plans.rs"), "utf8");
  const rows = [...src.matchAll(/Plan \{ name: "(\w+)",([^}]+)\}/g)];
  if (rows.length !== 3) throw new Error(`plans.rs: expected 3 plans, found ${rows.length}`);
  return rows.map(([, name, body]) => {
    const field = (k) => {
      const v = body.match(new RegExp(`\\b${k}: ([^,]+),?`))?.[1].trim();
      if (v === undefined) throw new Error(`plans.rs: ${name} has no ${k}`);
      if (v === "None") return null;
      const n = Number((v.match(/^Some\((.+)\)$/)?.[1] ?? v).replaceAll("_", ""));
      if (Number.isNaN(n)) throw new Error(`plans.rs: ${name}.${k} is ${v}`);
      return n;
    };
    const keys = ["monthly", "daily", "per_minute", "streams", "renders", "usd_month", "usd_year", "included", "extra", "inr_month", "inr_year", "inr_extra"];
    return { name, ...Object.fromEntries(keys.map((k) => [k, field(k)])) };
  });
}

/** The newest scoreboard: its rows by axis, and a lookup that fails loudly. */
export function scoreboard() {
  const lines = readFileSync(join(repo, "bench/scoreboard.jsonl"), "utf8").trim().split("\n");
  const last = JSON.parse(lines.at(-1));
  const row = (axis) => {
    const r = last.rows.find((r) => r.axis === axis);
    if (!r) throw new Error(`bench/scoreboard.jsonl (${last.date}) has no row "${axis}"`);
    return r;
  };
  const tally = { ours: 0, openui: 0, tie: 0, unmeasured: 0 };
  for (const r of last.rows) {
    if (r.winner === "ours") tally.ours++;
    else if (r.winner === "OpenUI") tally.openui++;
    else if (r.winner === "tie") tally.tie++;
    else tally.unmeasured++;
  }
  const how = readFileSync(join(repo, "bench/SCOREBOARD.md"), "utf8");
  // The method of each row, from the generated Markdown (the JSON keeps only the numbers).
  const method = new Map();
  for (const l of how.split("\n")) {
    const cells = l.split(" | ");
    if (cells.length === 5 && l.startsWith("| ")) method.set(cells[0].slice(2), cells[4].replace(/ \|$/, ""));
  }
  return { date: last.date, commit: last.commit, prompt: last.prompt, rows: last.rows, row, tally, method };
}

/** The component families: core first, then each pack, with its components. */
export function packs() {
  const dir = join(repo, "spec/packs");
  const all = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
    .map((p) => ({ name: p.name, about: p.about, components: Object.keys(p.components) }));
  return all.sort((a, b) => (a.name === "core" ? -1 : b.name === "core" ? 1 : a.name.localeCompare(b.name)));
}

/** A saved answer drawn by the core as HTML (mscore html), exactly as the API's render serves it. */
export function answerHtml(file) {
  return execFileSync("cargo", ["run", "--quiet", "--release", "-p", "morphscreen-cli", "--", "html", join(repo, file), "--packs", "all"], {
    cwd: join(repo, "rust"),
    encoding: "utf8",
    maxBuffer: 16 << 20,
  });
}

let mscore = null;
/** Any answer text drawn by the core as HTML, with these packs (the docs' live previews). */
export function coreHtml(text, packs = "all") {
  if (!mscore) {
    execFileSync("cargo", ["build", "--quiet", "--release", "-p", "morphscreen-cli"], { cwd: join(repo, "rust"), stdio: "inherit" });
    mscore = join(repo, "rust/target.nosync/release/mscore");
  }
  const f = join(tmpdir(), `morphscreen-docs-${process.pid}.md`);
  writeFileSync(f, text);
  // A preview in the docs must be an answer the core finds valid.
  const verdict = execFileSync(mscore, ["verdict", f, "--packs", packs], { encoding: "utf8" });
  if (!verdict.startsWith("complete=true") || !verdict.includes("errs=[]")) throw new Error(`a docs preview isn't valid (${verdict.trim()}):\n${text}`);
  return execFileSync(mscore, ["html", f, "--packs", packs], { encoding: "utf8", maxBuffer: 16 << 20 });
}

/** The model and timing a saved everyday answer was made with (its run's meta.jsonl). */
export function answerMeta(file) {
  const id = file.split("/").pop().replace(/\.txt$/, "");
  const meta = readFileSync(join(repo, file, "..", "meta.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .find((m) => m.id === id);
  if (!meta) throw new Error(`no meta for ${id}`);
  return meta;
}
