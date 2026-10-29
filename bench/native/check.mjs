// SwiftUI layout check (roadmap Q2): every answer pair rendered by our
// SwiftUI view and by OpenUI's Swift port at 390 and 760 points, each
// screenshot read by nativecheck. Writes ../quality/swiftui-results.json, in
// the shape of the web results, which the scoreboard reads.
//   swift build -c release && node check.mjs [raw labels...]
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;
const raw = join(here, "../raw");
const out = join(here, "out-check");
const bench = join(here, ".build/release/nativebench");
const check = join(here, ".build/release/nativecheck");
const standard = ["nemotron-v03", "nemotron-full-v06", ...["data", "commerce", "scheduling", "media", "docs", "inputs", "device"].map((p) => `packs-${p}`)];
const given = process.argv.slice(2).filter((a) => !a.startsWith("--"));
// --theme=dark or --theme=mono: our renderer alone, in that palette (the theme review, Q4).
const theme = process.argv.find((a) => a.startsWith("--theme="))?.slice(8);
const themeEnv = theme ? { NATIVE_THEME: theme, NATIVE_BG: theme === "dark" ? "101113" : "FFFFFF" } : {};
const labels = given.length ? given : standard.filter((l) => existsSync(join(raw, l)));
const widths = [390, 760];

const run = (cmd, args, env = {}, timeout = 120_000) =>
  new Promise((resolve) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env } });
    let stdout = "";
    p.stdout.on("data", (d) => (stdout += d));
    const t = setTimeout(() => p.kill("SIGKILL"), timeout);
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, stdout });
    });
  });

// One side of one pair at one width: render, then read the screenshot.
async function side(label, brief, s, width) {
  const dir = join(out, theme ?? "", label, String(width));
  mkdirSync(dir, { recursive: true });
  const shot = await run(bench, [join(raw, label), dir, brief, s], { NATIVE_SHOT_ONLY: "1", NATIVE_WIDTH: String(width), ...themeEnv });
  const png = join(dir, `${brief}-${s}.png`);
  if (shot.code !== 0 || !existsSync(png)) return { error: `render exited ${shot.code}`, defects: [] };
  const src = join(raw, label, `${s === "ours" ? "ours" : "openuichat"}__${brief}.txt`);
  const r = await run(check, [png, src, String(width)], themeEnv);
  try {
    return { defects: JSON.parse(r.stdout.trim().split("\n").pop()) };
  } catch {
    return { error: "check failed", defects: [] };
  }
}

const jobs = [];
for (const label of labels) {
  const dir = join(raw, label);
  const pairs = readdirSync(dir).map((f) => f.match(/^ours__(.+)\.txt$/)?.[1]).filter((b) => b && existsSync(join(dir, `openuichat__${b}.txt`))).sort();
  for (const brief of pairs) for (const width of widths) jobs.push({ label, brief, width });
}
const rows = [];
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    const ours = await side(j.label, j.brief, "ours", j.width);
    const openui = theme ? { defects: [] } : await side(j.label, j.brief, "openui", j.width);
    rows.push({ ...j, ours, openui });
    console.log(`${j.label}/${j.brief} @${j.width}: ours ${ours.error ?? ours.defects.length}, OpenUI ${openui.error ?? openui.defects.length}`);
  }
}
await Promise.all(Array.from({ length: 3 }, worker));

const order = (r) => [labels.indexOf(r.label), r.brief, r.width];
rows.sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0));
const summary = {};
for (const width of widths) {
  const rs = rows.filter((r) => r.width === width);
  summary[width] = { answers: rs.length };
  for (const s of ["ours", "openui"]) {
    const ok = rs.filter((r) => !r[s].error);
    const by = {};
    for (const r of ok) for (const d of r[s].defects) by[d.kind] = (by[d.kind] ?? 0) + 1;
    const total = ok.reduce((a, r) => a + r[s].defects.length, 0);
    // Defects per answer it drew; an answer it couldn't draw is counted on its own.
    summary[width][s] = { layoutPerAnswer: +(total / Math.max(1, ok.length)).toFixed(2), cleanLayout: ok.filter((r) => !r[s].defects.length).length, renderErrors: rs.length - ok.length, by };
  }
}
writeFileSync(join(here, theme ? `../quality/swiftui-results-${theme}.json` : "../quality/swiftui-results.json"), JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
