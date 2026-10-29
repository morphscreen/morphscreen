// Side-by-side pages: each brief's answer in our format, rendered by our HTML
// renderer, next to the same brief's OpenUI Lang answer rendered the way
// OpenUI's apps render it (react-lang's Renderer, react-ui's chat library,
// react-ui's stylesheet and ThemeProvider).
//
//   node compare/build.ts nemotron-visual   (after building compare/build/openui.js)
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../render/html.ts";
import { buildCatalog } from "../spec/catalog.ts";

const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] ?? "nemotron-visual";
const raw = join(here, "../bench/raw", label);
const out = join(here, "out", label);
mkdirSync(out, { recursive: true });
const openuiRepo = process.env.OPENUI_REPO ?? join(process.env.HOME ?? "", "openui");
copyFileSync(join(here, "build/openui.js"), join(out, "openui.js"));
copyFileSync(join(openuiRepo, "packages/react-ui/dist/styles/index.css"), join(out, "react-ui.css"));
for (const f of ["tokens.css", "theme.css", "page.css"]) copyFileSync(join(here, "../render", f), join(out, f));

// Our answers record the packs their prompt had (bench/run.ts BENCH_PACKS).
const packs = new Set<string>();
if (existsSync(join(raw, "meta.jsonl")))
  for (const l of readFileSync(join(raw, "meta.jsonl"), "utf8").split("\n").filter(Boolean))
    for (const p of JSON.parse(l).packs ?? []) packs.add(p);
const catalog = buildCatalog({ packs: [...packs] });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const briefs = new Set(
  readdirSync(raw)
    .map((f) => f.match(/^(?:ours|openuichat)__(.+)__r1\.txt$/)?.[1])
    .filter((b): b is string => !!b),
);
const pages: string[] = [];
for (const brief of [...briefs].sort()) {
  const ours = join(raw, `ours__${brief}__r1.txt`);
  const theirs = join(raw, `openuichat__${brief}__r1.txt`);
  if (!existsSync(ours) || !existsSync(theirs)) continue;
  for (const theme of ["light", "dark"]) {
    writeFileSync(
      join(out, `${brief}-ours-${theme}.html`),
      `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="theme.css"><link rel="stylesheet" href="page.css"></head><body><main class="ms-answer">${render(readFileSync(ours, "utf8"), { catalog })}</main></body></html>`,
    );
    writeFileSync(
      join(out, `${brief}-openui-${theme}.html`),
      `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="react-ui.css"><style>body{margin:0;background:var(--openui-background)}#root{max-width:800px;margin:0 auto;padding:32px 24px 64px}</style></head><body><div id="root"></div><textarea id="answer" hidden>${esc(readFileSync(theirs, "utf8"))}</textarea><script type="module" src="openui.js"></script></body></html>`,
    );
  }
  pages.push(brief);
}
writeFileSync(join(out, "briefs.json"), JSON.stringify(pages));
console.log(`wrote ${pages.length} briefs x 2 formats x 2 themes to ${out}`);
