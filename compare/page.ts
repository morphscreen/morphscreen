// The comparison page, written in our own format and rendered by our own
// renderer: summary numbers, a per-brief table, and every brief's screenshots
// (ours left, OpenUI right) in light and dark.
//
//   node compare/page.ts nemotron-v02b   (after build.ts, shoot.sh and metrics.ts)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../render/html.ts";

const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] ?? "nemotron-v02b";
const out = join(here, "out", label);
const m = JSON.parse(readFileSync(join(out, "metrics.json"), "utf8"));
const { SCENARIOS } = await import(join(here, "../bench/.vendor/briefs/briefs.ts"));
const briefText = new Map<string, string>(SCENARIOS.map((s: { name: string; prompt: string }) => [s.name, s.prompt]));

type Side = { tokens: number; errors: number; errorDetail: string[]; payload: { brotli: number } };
type Row = { brief: string; reqs: number; ours: Side; openui: Side };
const rows: Row[] = m.rows;
const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
const n = (x: number) => x.toLocaleString("en-US");
const kb = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(2)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} KB` : `${b} B`);
const cell = (s: string) => s.replace(/\|/g, "/");
// "orphaned statement: a", "orphaned statement: b" read as "orphaned statement: a, b"; tags as code.
const errors = (list: string[]) => {
  const groups = new Map<string, string[]>();
  for (const e of new Set(list)) {
    const k = e.lastIndexOf(": ");
    const [head, tail] = k > 0 ? [e.slice(0, k), e.slice(k + 2)] : [e, ""];
    groups.set(head, [...(groups.get(head) ?? []), tail].filter(Boolean));
  }
  return cell([...groups].map(([h, t]) => (t.length ? `${h}: ${t.join(", ")}` : h)).join("; ").replace(/<\/?[A-Z]\w*>/g, "`$&`"));
};
const nb = (s: string) => s.replace(/-/g, "\u2011");

// Screenshots for the page: JPEG at 1400px wide keeps it light.
mkdirSync(join(out, "shots/web"), { recursive: true });
for (const r of rows)
  for (const theme of ["light", "dark"])
    execFileSync("magick", [join(out, "shots", `${r.brief}-${theme}.png`), "-resize", "1400x", "-quality", "82", join(out, "shots/web", `${r.brief}-${theme}.jpg`)]);

const oursTokens = sum((r) => r.ours.tokens);
const theirTokens = sum((r) => r.openui.tokens);
const oursShared = m.shared.ours.css.brotli + m.shared.ours.js.brotli;
const theirShared = m.shared.openui.css.brotli + m.shared.openui.js.brotli;
const oursBad = rows.filter((r) => r.ours.errors).length;
const theirBad = rows.filter((r) => r.openui.errors).length;

const doc = `<Card title="MorphScreen vs OpenUI" subtitle="Same model (${m.model}), same ${rows.length} briefs from generative-ui-bench, one answer each. Ours on the left, OpenUI on the right.">
<Columns>
<Stat label="Answer tokens, all briefs" value="${n(oursTokens)}" change="-${Math.round((1 - oursTokens / theirTokens) * 100)}% vs ${n(theirTokens)}" tone="success" />
<Stat label="System prompt" value="${m.prompts.oursCurrent ? `${n(m.prompts.ours)} tokens` : "earlier version"}" note="OpenUI chat library: ${n(m.prompts.openui)}" />
<Stat label="Download to show any answer" value="${kb(oursShared)}" note="OpenUI: ${kb(theirShared)} (brotli)" />
<Stat label="Answers with errors" value="${oursBad} of ${rows.length}" note="OpenUI: ${theirBad} of ${rows.length}" />
</Columns>

Ours is checked with our validator, OpenUI with lang-core's parser against its chat library, counting what generative-ui-bench counts (prop errors, unresolved and orphaned statements). Download is what a browser fetches besides the answer: for us one stylesheet and no JavaScript, for OpenUI the React renderer bundle and react-ui's stylesheet. Our renderer runs on the server, so the browser gets finished HTML.

| Brief | Requirements | Tokens, ours | Tokens, OpenUI | Answer HTML, ours | Errors, ours | Errors, OpenUI |
|---|---|---|---|---|---|---|
${rows.map((r) => `| ${nb(r.brief)} | ${r.reqs} | ${n(r.ours.tokens)} | ${n(r.openui.tokens)} | ${kb(r.ours.payload.brotli)} | ${r.ours.errors ? errors(r.ours.errorDetail) : "none"} | ${r.openui.errors ? errors(r.openui.errorDetail) : "none"} |`).join("\n")}
</Card>

## Every brief

${rows
  .map(
    (r) => `<Details title="${r.brief}: ${n(r.ours.tokens)} vs ${n(r.openui.tokens)} tokens">
${briefText.get(r.brief)?.replace(/\s+/g, " ").trim() ?? ""}

[Ours, light](${r.brief}-ours-light.html) · [OpenUI, light](${r.brief}-openui-light.html) · [Ours, dark](${r.brief}-ours-dark.html) · [OpenUI, dark](${r.brief}-openui-dark.html)

<Tabs>
<Tab title="Light">
![${r.brief}, light: ours left, OpenUI right](shots/web/${r.brief}-light.jpg)
</Tab>
<Tab title="Dark">
![${r.brief}, dark: ours left, OpenUI right](shots/web/${r.brief}-dark.jpg)
</Tab>
</Tabs>
</Details>`,
  )
  .join("\n\n")}
`;

writeFileSync(join(out, "index.md"), doc);
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MorphScreen vs OpenUI</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="page.css"><style>body>.ms-answer{max-width:1240px}.ms-answer img{border:1px solid var(--ms-line)}.ms-answer.ms-answer td{vertical-align:top}</style></head><body><main class="ms-answer">${render(doc)}</main></body></html>`,
);
console.log(`wrote ${join(out, "index.html")}`);
