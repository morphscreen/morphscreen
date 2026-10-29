// Renders every answer in bench/raw/<label> written in our format into
// bench/gallery/<label>: one page per run plus an index, to look at what the
// model actually built. node render/gallery.ts deepseekflash
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "./html.ts";
import { evaluate } from "../validator/validate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] ?? "deepseekflash";
// THEME=light|dark|mono pins the scheme (for screenshots); default follows the system.
const THEME = process.env.THEME ? ` data-theme="${process.env.THEME}"` : "";
const raw = join(here, "../bench/raw", label);
const out = join(here, "../bench/gallery", label);
mkdirSync(out, { recursive: true });
for (const f of ["tokens.css", "theme.css", "page.css"]) copyFileSync(join(here, f), join(out, f));

const { SCENARIOS } = await import(join(here, "../bench/.vendor/briefs/briefs.ts"));
type Brief = { name: string; band: string; reqs: number; prompt: string };
const briefs = new Map<string, Brief>(SCENARIOS.map((b: Brief) => [b.name, b]));
const meta = new Map<string, { truncated: boolean }>();
if (existsSync(join(raw, "meta.jsonl")))
  for (const l of readFileSync(join(raw, "meta.jsonl"), "utf8").split("\n").filter(Boolean)) {
    const m = JSON.parse(l);
    meta.set(m.id, m);
  }
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PAGE_CSS = `.meta{max-width:800px;margin:0 auto;padding:20px 24px 0;display:flex;flex-wrap:wrap;gap:6px 16px;align-items:baseline;font-size:13px;color:var(--ms-ink-3)}
.meta a{color:var(--ms-ink-2);text-decoration:none}.meta .ok{color:var(--ms-good)}.meta .no{color:var(--ms-bad)}
.brief{max-width:800px;margin:12px auto 0;padding:0 24px;font-size:13px;color:var(--ms-ink-2)}
.brief summary{font-weight:500;color:var(--ms-ink-2)}.brief pre{margin-top:8px;white-space:pre-wrap;font:13px/1.6 var(--ms-font);background:none;padding:0}
.brief details{border:0;padding:0}.raw{max-width:800px;margin:0 auto 48px;padding:0 24px;font-size:13px}.raw pre{white-space:pre-wrap;font-size:12px}`;

const rows: string[] = [];
const files = readdirSync(raw).filter((f) => /^ours__.+__r\d+\.txt$/.test(f)).sort();
for (const f of files) {
  const [, scenario, r] = f.match(/^ours__(.+)__r(\d+)\.txt$/)!;
  const brief = briefs.get(scenario);
  const text = readFileSync(join(raw, f), "utf8");
  const id = f.replace(/\.txt$/, "");
  const v = evaluate(text, { truncated: meta.get(id)?.truncated, reqs: brief?.reqs ?? 0 });
  const body = text.trim() ? render(text) : `<p><em>The model returned nothing (it used its whole budget reasoning).</em></p>`;
  const bytes = Buffer.byteLength(body);
  const verdict = v.complete
    ? `complete, ${v.n} elements`
    : `not complete: ${[...new Set(v.errs.map((e) => `${e.cls} (${e.detail})`))].slice(0, 4).join("; ")}`;
  writeFileSync(
    join(out, `${id}.html`),
    `<!doctype html><html lang="en"${THEME}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(scenario)} run ${r}</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="page.css"><style>${PAGE_CSS}</style></head><body>
<div class="meta"><a href="index.html">All runs</a><span>${esc(scenario)}, run ${r}</span><span>${(bytes / 1000).toFixed(1)} KB of HTML, no JavaScript</span><span class="${v.complete ? "ok" : "no"}">${esc(verdict)}</span></div>
<div class="brief"><details><summary>Brief, ${brief?.reqs ?? 0} requirements</summary><pre>${esc(brief?.prompt ?? "")}</pre></details></div>
<main class="ms-answer">${body}</main>
<div class="raw"><details><summary>What the model wrote</summary><pre>${esc(text)}</pre></details></div>
</body></html>`,
  );
  rows.push(
    `<tr><td>${esc(scenario)}</td><td>${brief?.reqs ?? ""}</td><td><a href="${id}.html">run ${r}</a></td><td>${v.complete ? "complete" : esc(v.errs[0]?.cls ?? "")}</td><td>${bytes.toLocaleString()}</td></tr>`,
  );
}
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html lang="en"${THEME}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MorphScreen: ${esc(label)} runs</title><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="page.css"></head><body><main class="ms-answer">
<h1>${esc(label)}: ${files.length} answers in the MorphScreen format</h1>
<p>Each run is the model's real output for one of generative-ui-bench's briefs, rendered by the prototype HTML renderer. Plain HTML and CSS, no JavaScript. Sizes are the rendered answer without the shared stylesheet.</p>
<div class="ms-table"><table><thead><tr><th>Brief</th><th>Requirements</th><th>Run</th><th>Validator</th><th>Bytes</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
</main></body></html>`,
);
console.log(`wrote ${files.length} pages to ${out}`);
