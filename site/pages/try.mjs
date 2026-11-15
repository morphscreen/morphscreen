// /try (decided 2026-11-15): anyone types a prompt and sees the answer drawn
// as it streams, with no account. The page runs the web SDK as an app would
// (connectAgent on an AG-UI endpoint); the endpoint is msapi's
// /v1/playground (rust/api/src/playground.rs), on our key within $0.50 a
// day for everyone and 5 prompts a day each. Its own security policy
// (ops/site/Caddyfile.block, @try) is the pages' with WebAssembly allowed,
// for the SDK's core.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repo } from "../data.mjs";
import { esc } from "./shared.mjs";

const TOOLS = process.env.SITE_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-site");
const hashName = (name, content) => name.replace(/(\.\w+)$/, `.${createHash("sha256").update(content).digest("hex").slice(0, 10)}$1`);

// What people ask chat apps, each of which an answer shows better than text.
export const EXAMPLES = [
  "Plan 3 days in Lisbon on $600",
  "Compare three phones under $400",
  "Quiz me on the solar system",
  "A sign-up form for a yoga class",
  "My monthly budget on $3,200",
  "How do I make a sourdough starter?",
];

export async function tryPage({ dist, app }) {
  const out = join(dist, "try");
  mkdirSync(out, { recursive: true });
  const put = (name, content) => {
    const f = hashName(name, content);
    writeFileSync(join(out, f), content);
    return `/try/${f}`;
  };
  const { build } = await import("esbuild");
  const res = await build({
    entryPoints: [join(repo, "site/try/try.js")],
    bundle: true,
    format: "esm",
    minify: true,
    legalComments: "eof",
    target: "es2022",
    alias: { "@morphscreen/web": join(repo, "sdk/web/dist/index.js") },
    nodePaths: [join(TOOLS, "node_modules")],
    write: false,
    logLevel: "error",
  });
  const script = put("try.js", res.outputFiles[0].contents);
  const core = put("morphscreen-agent.wasm", readFileSync(join(repo, "sdk/web/dist/morphscreen-agent.wasm")));

  const body = `
<header class="page-head">
  <h1 class="title1">Try it</h1>
  <p class="lead">Ask what you'd ask a chat app. The answer comes back as UI, drawn while it streams, checked line by line and fixed by the model when a line breaks a rule. No account needed.</p>
</header>
<section class="try" id="try" data-core="${core}" aria-label="The playground">
  <div class="try__thread" id="try-thread" hidden></div>
  <div class="try__start" id="try-start">
    <p class="try__hint">Pick one, or write your own.</p>
    <div class="try__examples">
      ${EXAMPLES.map((e) => `<button type="button" class="try__example" data-prompt="${esc(e)}">${esc(e)}</button>`).join("\n      ")}
    </div>
  </div>
  <div class="try__notice" id="try-notice" role="status" hidden>
    <p class="try__notice-title" id="try-notice-title"></p>
    <p class="try__notice-text" id="try-notice-text"></p>
    <div class="try__notice-ctas" id="try-notice-ctas" hidden>
      <a class="btn btn--primary btn--small" href="${app}/signin">Get a free key</a>
      <a class="btn btn--small" href="/docs/quickstart">Read the quickstart</a>
    </div>
  </div>
  <form class="try__form" id="try-form">
    <textarea id="try-prompt" aria-label="Your prompt" name="prompt" rows="2" maxlength="1000" placeholder="Ask anything" autocomplete="off" required></textarea>
    <div class="try__bar">
      <p class="small try__meta" id="try-meta">5 free prompts a day.</p>
      <button type="button" class="btn btn--small try__restart" id="try-restart" hidden>Start over</button>
      <button type="submit" class="btn btn--primary btn--small" id="try-send">Send</button>
    </div>
  </form>
</section>
<section class="section prose" aria-labelledby="try-how">
  <div class="section__head"><h2 id="try-how" class="title">What's running</h2></div>
  <ul>
    <li><strong>The model:</strong> DeepSeek V4.1 Flash with reasoning off, the model included on our paid plans, with all 75 built-in components on. In your app you pick the model, and add your own components beside these.</li>
    <li><strong>The page:</strong> the web SDK from npm, <code>connectAgent</code> on an AG-UI endpoint, as in <a href="/docs/quickstart">the quickstart</a>. Forms, buttons and quizzes in an answer send what you pick as the next message.</li>
    <li><strong>The limits:</strong> 5 prompts a day each, up to 1,000 characters, no photos (your app shows its own). Everyone here shares a small daily budget on our key; when it's spent, the playground opens again at midnight UTC.</li>
    <li><strong>What's kept:</strong> nothing you type. The server keeps how many prompts ran today and what they cost, and no address.</li>
  </ul>
  <p>For your own app, <a href="${app}/signin">a free key</a> gives you 100 calls a month on this model and up to 3,000 on your own OpenRouter key. No card.</p>
</section>`;

  return {
    path: "/try",
    title: "Try MorphScreen: a prompt in, real UI out | MorphScreen",
    description: "Type a prompt and watch the answer come back as cards, charts, forms and quizzes, drawn while it streams. Free, no account.",
    step: "try",
    answer: true,
    module: script,
    body,
  };
}
