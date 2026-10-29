// Runs nativebench once per brief and side, each in its own process, and
// writes results-<raw dir name>.json here (screenshots go to the out dir). A process that crashes or times out is that
// side's render error for the brief; the other rows still count.
//   node run.mjs [rawdir] [outdir]
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";

const raw = process.argv[2] ?? "../raw/nemotron-v03";
const out = process.argv[3] ?? "out";
const bin = join(import.meta.dirname, ".build/release/nativebench");
const briefs = readdirSync(raw)
  .filter((f) => f.startsWith("ours__") && f.endsWith(".txt"))
  .map((f) => f.slice(6, -4))
  .sort();

const rows = [];
for (const brief of briefs) {
  const row = { brief };
  // Briefs OpenUI has no answer for (the device briefs) run on our side only.
  const sides = existsSync(join(raw, `openuichat__${brief}.txt`)) ? ["ours", "openui"] : ["ours"];
  for (const side of sides) {
    const r = spawnSync(bin, [raw, out, brief, side], { encoding: "utf8", timeout: 120_000 });
    const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("RESULT "));
    if (line && r.status === 0) {
      const v = JSON.parse(line.slice(7));
      // Memory the renderer added over the process's own baseline: at its peak
      // (both passes) and what's still held at the end (two answers on screen).
      row[side] = { cold: v.cold, warm: v.warm, chunks: v.chunks, peakMB: +(v.peakMB - v.baseMB).toFixed(1), endMB: +(v.endMB - v.baseMB).toFixed(1) };
    } else {
      const why = r.error?.code === "ETIMEDOUT" ? "timeout" : r.signal ?? /signal (\d+)|Trace\/BPT trap|Illegal instruction/.exec(r.stderr ?? "")?.[0] ?? `exit ${r.status}`;
      row[side] = { error: String(why) };
    }
  }
  rows.push(row);
  const fmt = (s) => (!s ? "-".padEnd(26) : s.error ? `CRASH (${s.error})`.padEnd(26) : `${s.warm.toFixed(1)} ms warm, ${s.peakMB} MB`.padEnd(26));
  console.log(`${brief.padEnd(22)} ours ${fmt(row.ours)} OpenUI ${fmt(row.openui)}`);
}

const ok = (side) => rows.filter((r) => r[side] && !r[side].error);
const both = rows.filter((r) => r.openui && !r.ours.error && !r.openui.error);
const summary = {
  answers: rows.length,
  crashes: { ours: rows.length - ok("ours").length, openui: rows.filter((r) => r.openui).length - ok("openui").length },
  // Totals over the answers both sides rendered, so a crash doesn't make a side look faster.
  bothRendered: both.length,
  warmMs: { ours: +both.reduce((a, r) => a + r.ours.warm, 0).toFixed(1), openui: +both.reduce((a, r) => a + r.openui.warm, 0).toFixed(1) },
  coldMs: { ours: +both.reduce((a, r) => a + r.ours.cold, 0).toFixed(1), openui: +both.reduce((a, r) => a + r.openui.cold, 0).toFixed(1) },
  medianPeakMB: { ours: median(both.map((r) => r.ours.peakMB)), openui: median(both.map((r) => r.openui.peakMB)) },
  medianEndMB: { ours: median(both.map((r) => r.ours.endMB)), openui: median(both.map((r) => r.openui.endMB)) },
  machine: "Apple silicon Mac, macOS, offscreen NSHostingController window 760 pt wide, 32-char chunks",
};
writeFileSync(join(import.meta.dirname, `results-${basename(raw)}.json`), JSON.stringify({ summary, rows }, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}
