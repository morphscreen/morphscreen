// Numbers for the side-by-side comparison, per brief: answer tokens, whether
// the answer parsed cleanly, what a browser downloads to show it, and how long
// the page is. Ours is checked with validator/validate.ts; OpenUI's chat
// answers with lang-core's own parser against the chat library, the same check
// its Renderer runs before drawing anything.
//
//   node compare/metrics.ts nemotron-visual   (after build.ts and shoot.sh)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { render } from "../render/html.ts";
import { evaluate } from "../validator/validate.ts";

const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] ?? "nemotron-visual";
const raw = join(here, "../bench/raw", label);
const out = join(here, "out", label);
const openuiRepo = process.env.OPENUI_REPO ?? join(process.env.HOME ?? "", "openui");
const vendor = join(here, "../bench/.vendor");

const { SCENARIOS } = await import(join(vendor, "briefs/briefs.ts"));
const reqs = new Map<string, number>(SCENARIOS.map((s: { name: string; reqs: number }) => [s.name, s.reqs]));
const { get_encoding } = createRequire(join(vendor, "package.json"))("tiktoken");
const enc = get_encoding("o200k_base");
const ui = await import(join(openuiRepo, "packages/react-ui/dist/genui-lib/index.mjs"));
const lang = await import(join(openuiRepo, "packages/lang-core/dist/index.mjs"));
const parser = lang.createParser(ui.openuiChatLibrary.toJSONSchema(), ui.openuiChatLibrary.root);

const meta = new Map<string, { outputTokens: number | null; ms: number }>();
for (const l of readFileSync(join(raw, "meta.jsonl"), "utf8").split("\n").filter(Boolean)) {
  const m = JSON.parse(l);
  meta.set(m.id, m);
}

const size = (b: Buffer | string) => {
  const buf = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return {
    raw: buf.length,
    gzip: gzipSync(buf, { level: 9 }).length,
    brotli: brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length,
  };
};
const height = (png: string) =>
  existsSync(png) ? Number(execFileSync("magick", ["identify", "-format", "%h", png], { encoding: "utf8" })) : null;

// What every page loads besides the answer itself.
const shared = {
  ours: { js: size(""), css: size(readFileSync(join(here, "../render/theme.css"))) },
  openui: { js: size(readFileSync(join(out, "openui.js"))), css: size(readFileSync(join(out, "react-ui.css"))) },
};
const ourPrompt = await import("../prompt/prompt.ts");
// Our answers record the hash of the prompt they were made with; the size is
// only reported for the prompt in this checkout.
const usedHashes = new Set([...meta].filter(([id]) => id.startsWith("ours__")).map(([, v]) => (v as { prompt?: string }).prompt));
const prompts = {
  ours: enc.encode(ourPrompt.systemPrompt()).length,
  oursCurrent: usedHashes.size === 1 && usedHashes.has(ourPrompt.promptHash()),
  openui: enc.encode(ui.openuiChatLibrary.prompt(ui.openuiChatPromptOptions)).length,
};

const briefs = JSON.parse(readFileSync(join(out, "briefs.json"), "utf8")) as string[];
const rows = briefs.map((brief) => {
  const oursText = readFileSync(join(raw, `ours__${brief}__r1.txt`), "utf8");
  const theirText = readFileSync(join(raw, `openuichat__${brief}__r1.txt`), "utf8");
  const v = evaluate(oursText, { reqs: reqs.get(brief) ?? 0 });
  const p = parser.parse(theirText);
  const html = render(oursText);
  return {
    brief,
    reqs: reqs.get(brief) ?? 0,
    ours: {
      tokens: enc.encode(oursText).length,
      apiTokens: meta.get(`ours__${brief}__r1`)?.outputTokens ?? null,
      ms: meta.get(`ours__${brief}__r1`)?.ms ?? null,
      errors: v.errs.length,
      errorDetail: [...new Set(v.errs.map((e: { cls: string; detail: string }) => `${e.cls}: ${e.detail}`))],
      elements: v.n,
      // The server sends rendered HTML; the answer text never reaches the browser.
      payload: size(html),
      height: height(join(out, "shots/raw", `${brief}-ours-light.png`)),
    },
    openui: {
      tokens: enc.encode(theirText).length,
      apiTokens: meta.get(`openuichat__${brief}__r1`)?.outputTokens ?? null,
      ms: meta.get(`openuichat__${brief}__r1`)?.ms ?? null,
      // generative-ui-bench counts orphaned statements as errors too (reference-graph).
      errors: p.meta.errors.length + p.meta.unresolved.length + p.meta.orphaned.length + (p.root ? 0 : 1),
      errorDetail: [
        ...p.meta.errors.map((e: { component: string; path: string; message: string }) => `${e.component}${e.path}: ${e.message}`),
        ...p.meta.unresolved.map((u: string) => `unresolved reference: ${u}`),
        ...p.meta.orphaned.map((o: string) => `orphaned statement: ${o}`),
        ...(p.root ? [] : ["no root"]),
      ],
      orphaned: p.meta.orphaned.length,
      statements: p.meta.statementCount,
      // The browser gets the answer text and renders it with the bundle.
      payload: size(theirText),
      height: height(join(out, "shots/raw", `${brief}-openui-light.png`)),
    },
  };
});

const result = { label, model: [...meta.values()][0] && JSON.parse(readFileSync(join(raw, "meta.jsonl"), "utf8").split("\n")[0]).model, prompts, shared, rows };
writeFileSync(join(out, "metrics.json"), JSON.stringify(result, null, 1));

const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
console.log(`prompt tokens: ours ${prompts.oursCurrent ? prompts.ours : `(answers made with an earlier prompt: ${[...usedHashes].join(", ")})`}, openui ${prompts.openui}`);
console.log(`answer tokens (o200k), total over ${rows.length} briefs: ours ${sum((r) => r.ours.tokens)}, openui ${sum((r) => r.openui.tokens)}`);
console.log(`answers with errors: ours ${rows.filter((r) => r.ours.errors).length}, openui ${rows.filter((r) => r.openui.errors).length}`);
console.log(`shared download (brotli): ours ${shared.ours.css.brotli + shared.ours.js.brotli} B, openui ${shared.openui.css.brotli + shared.openui.js.brotli} B`);
console.log(`page height, total px: ours ${sum((r) => r.ours.height ?? 0)}, openui ${sum((r) => r.openui.height ?? 0)}`);
for (const r of rows)
  console.log(`${r.brief.padEnd(12)} tokens ${String(r.ours.tokens).padStart(5)} vs ${String(r.openui.tokens).padStart(5)}  errors ${r.ours.errors} vs ${r.openui.errors}  height ${r.ours.height} vs ${r.openui.height}`);
