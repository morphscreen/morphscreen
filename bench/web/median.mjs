// Several runs of the browser benchmark as one: each answer's median CPU,
// first text, layout shift and heap over the runs (the scoreboard reads the
// result like a single run's). Copy each run's results file aside first.
//   node bench/web/median.mjs <label> run1.json run2.json run3.json
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [label, ...files] = process.argv.slice(2);
if (!label || files.length < 2) throw new Error("usage: median.mjs <label> run1.json run2.json ...");
const runs = files.map((f) => JSON.parse(readFileSync(f, "utf8")));
if (runs.some((r) => r.length !== runs[0].length || r.some((row, k) => row.brief !== runs[0][k].brief))) throw new Error("the runs aren't of the same answers");
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const rows = runs[0].map((row, k) => {
  const out = structuredClone(row);
  for (const side of ["ours", "openui"]) for (const key of ["busy", "first", "cls", "heap"]) out[side][key] = median(runs.map((r) => r[k][side][key]));
  return { ...out, runs: runs.length };
});
writeFileSync(join(import.meta.dirname, `results-${label}.json`), JSON.stringify(rows, null, 1));
const sum = (side) => rows.reduce((a, r) => a + r[side].busy, 0).toFixed(0);
console.log(`results-${label}.json: median of ${runs.length} runs, CPU ours ${sum("ours")} ms, OpenUI ${sum("openui")} ms`);
