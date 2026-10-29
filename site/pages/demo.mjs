// /demo (roadmap N2): one brief's answers from the same model, streamed
// into MorphScreen's web SDK and OpenUI's React renderer side by side, each
// in a frame of its own, at the same pace, measured in the reader's browser.
// The answers are the Nemotron 3 Ultra run on the benchmark page, where the
// model wrote OpenUI Lang for OpenUI's chat library, the library its
// renderer draws here.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo } from "../data.mjs";
import { esc } from "./shared.mjs";

const RUN = "nemotron-full-v09";
// The briefs shown, described in our words (generative-ui-bench's own briefs aren't ours to copy).
export const BRIEFS = [
  ["b3-clinic", "A clinic's day"],
  ["b2-budget", "A monthly budget"],
  ["b3-server", "Service health"],
  ["b4-bank", "A bank account"],
];
// The benchmark's chunk, at a pace near a fast model's.
const PACE = { chunk: 32, every: 30 };
const TOOLS = process.env.SITE_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-site");

const hashName = (name, content) => name.replace(/(\.\w+)$/, `.${createHash("sha256").update(content).digest("hex").slice(0, 10)}$1`);

/** Builds the two frames and the answers into dist/demo, and returns the page. */
export async function demoPage({ dist, css }) {
  const out = join(dist, "demo/frames");
  mkdirSync(out, { recursive: true });
  const put = (name, content) => {
    const f = hashName(name, content);
    writeFileSync(join(out, f), content);
    return `/demo/frames/${f}`;
  };
  const { build } = await import("esbuild");
  const res = await build({
    entryPoints: { ours: join(repo, "site/demo/ours.js"), openui: join(repo, "site/demo/openui.jsx") },
    bundle: true,
    format: "esm",
    jsx: "automatic",
    minify: true,
    legalComments: "eof",
    metafile: true,
    target: "es2022",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@morphscreen/web": join(repo, "sdk/web/dist/index.js") },
    nodePaths: [join(TOOLS, "node_modules")],
    outdir: out,
    write: false,
    logLevel: "error",
  });
  const files = Object.fromEntries(res.outputFiles.map((f) => [f.path.slice(out.length + 1), f.contents]));
  const wasm = readFileSync(join(repo, "sdk/web/dist/morphscreen.wasm"));
  const frameCss = put("frame.css", readFileSync(join(repo, "site/demo/frame.css")));
  // Every package bundled into the frames, with its licence, as the MIT and similar licences ask.
  const pkgs = new Map();
  for (const input of Object.keys(res.metafile.inputs)) {
    const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g);
    if (!m) continue;
    const dir = join(TOOLS, input.slice(input.indexOf("node_modules"), input.lastIndexOf(m.at(-1)) + m.at(-1).length));
    if (pkgs.has(dir) || !existsSync(join(dir, "package.json"))) continue;
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
    pkgs.set(dir, `${pkg.name} ${pkg.version} (${pkg.license ?? "see below"})\n\n${file ? readFileSync(join(dir, file), "utf8").trim() : `No licence file in the package; its package.json says ${pkg.license}.`}`);
  }
  const licences = put("licences.txt", `The code bundled into morphscreen.com/demo's frames, besides MorphScreen's own SDK (whose notices are in its package), and each package's licence.\n\n${[...pkgs.values()].sort().join("\n\n----------------------------------------\n\n")}\n`);
  const frame = (side, title, styles, body, script) => `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>${side === "ours" ? `\n<link rel="preload" href="/fonts/ibm-plex-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>` : ""}
${styles.map((s) => `<link rel="stylesheet" href="${s}">`).join("\n")}
<link rel="stylesheet" href="${frameCss}">
<script type="module" src="${script}"></script>
</head>
<body class="${side}">${body}</body>
</html>
`;
  writeFileSync(join(out, "ours.html"), frame("ours", "MorphScreen's web SDK", [css.answer], `<main id="answer" data-core="${put("morphscreen.wasm", wasm)}"></main>`, put("ours.js", files["ours.js"])));
  writeFileSync(join(out, "openui.html"), frame("openui", "OpenUI's React renderer", [put("openui.css", files["openui.css"])], `<main id="root"></main>`, put("openui.js", files["openui.js"])));

  const read = (fmt, brief) => readFileSync(join(repo, "bench/raw", RUN, `${fmt}__${brief}__r1.txt`), "utf8");
  const answers = { model: "Nemotron 3 Ultra", pace: PACE, briefs: BRIEFS.map(([id, label]) => ({ id, label, ours: read("ours", id), openui: read("openuichat", id) })) };
  writeFileSync(join(dist, "demo/answers.json"), JSON.stringify(answers));

  const version = (p) => JSON.parse(readFileSync(join(TOOLS, "node_modules", p, "package.json"), "utf8")).version;
  const body = `
<header class="page-head">
  <h1 class="title1">Two renderers, one model</h1>
  <p class="lead">A brief from the benchmark OpenUI publishes, answered by the same model in each format, streamed into each renderer at the same pace, side by side. Watch how each one draws while the answer arrives.</p>
</header>
<section class="demo" aria-labelledby="demo-title">
  <h2 id="demo-title" class="sr-only">The demo</h2>
  <div class="demo__controls">
    <div class="demo__briefs" role="radiogroup" aria-label="The answer to stream">
      ${BRIEFS.map(([id, label], i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-brief="${id}">${esc(label)}</button>`).join("")}
    </div>
    <button type="button" class="btn btn--small" id="demo-replay" disabled>Replay</button>
  </div>
  <div class="demo__panes">
    <figure class="demo__pane">
      <figcaption class="demo__head"><span class="demo__name">MorphScreen</span><span class="small">the web SDK</span></figcaption>
      <iframe src="/demo/frames/ours.html" title="MorphScreen's web SDK drawing the answer"></iframe>
      <dl class="demo__stats" data-side="ours"></dl>
    </figure>
    <figure class="demo__pane">
      <figcaption class="demo__head"><span class="demo__name">OpenUI</span><span class="small">its React renderer and chat library</span></figcaption>
      <iframe src="/demo/frames/openui.html" title="OpenUI's React renderer drawing the answer"></iframe>
      <dl class="demo__stats" data-side="openui"></dl>
    </figure>
  </div>
  <p class="small demo__note" id="demo-note" aria-live="polite">Loading both renderers.</p>
</section>
<section class="section prose" aria-labelledby="how-title">
  <div class="section__head"><h2 id="how-title" class="title">What you're seeing</h2></div>
  <ul>
    <li><strong>The same model, the same brief.</strong> Nemotron 3 Ultra answered each of the 46 briefs in <a href="/benchmark">OpenUI's benchmark</a> in our format and in OpenUI Lang, written for OpenUI's chat library with its own prompt. These are that run's first answers, as the model wrote them.</li>
    <li><strong>The same pace.</strong> Both arrive ${PACE.chunk} characters every ${PACE.every} ms, so the longer answer takes longer, as it would from the model.</li>
    <li><strong>Each renderer the way its apps use it.</strong> MorphScreen's SDK gets each new piece; OpenUI's renderer gets the response so far and renders it again. Each runs in a frame of its own, so neither one's styles touch the other. Ours runs under a strict content security policy; OpenUI's frame allows the inline styles and eval its renderer uses, as its apps do.</li>
    <li><strong>Measured here, in your browser.</strong> When the first words showed, how much the part you're watching moved while it drew (cumulative layout shift, lower is steadier; only Chrome and Edge measure it), the time spent drawing and laying out the page after every piece, and when the last piece was drawn.</li>
  </ul>
  <p class="small">OpenUI's side is @openuidev/react-lang ${version("@openuidev/react-lang")} and @openuidev/react-ui ${version("@openuidev/react-ui")} from npm, MIT licence, by Thesys (<a href="${licences}">the licences of everything in the frames</a>). The benchmark measures the same things over 20 answers: <a href="/compare/openui">every row</a>.</p>
</section>`;
  return {
    path: "/demo",
    title: "Live demo: MorphScreen and OpenUI side by side | MorphScreen",
    description: "The same model's answer streamed into MorphScreen's web SDK and OpenUI's React renderer side by side, measured live in your browser.",
    step: "demo",
    demo: true,
    body,
  };
}
