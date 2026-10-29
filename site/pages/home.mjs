// The landing page (roadmap N1): the first screen is the promise over a
// real answer streaming through the web SDK (2026-10-28, after the
// composition the user sent: one headline, one line under it, two ways in,
// the install line, measured facts along the bottom). Under it, redrawn the
// same day after three section prompts the user sent (a morph-reveal poster,
// a results section of tall stat cards, a cloth to grab), each section one
// idea you can see or touch: one real answer as the text the model wrote
// and as drawn, wiped from one to the other; the measurements as cards; the
// same answer streaming live beside the call that made it; the families,
// each drawn; pricing; questions; a way in.

import { API, APP, DEMO, MAIL, count, esc, pricing } from "./shared.mjs";
import { coreHtml } from "../data.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Along the bottom of the first screen: four facts from the scoreboard,
// none repeating the proof section, each linking to where it's shown.
const STRIP = [
  ["Valid after repair, DeepSeek V4 Flash, reasoning off, 46 briefs x 4", (r) => figure(r.ours)[0].replace(/\.0%$/, "%"), "valid after repair, DeepSeek V4 Flash", "/benchmark"],
  // Like for like: our every component (the API's default) against OpenUI's chat library.
  ["System prompt with every component, tokens", (r) => figure(r.ours)[0], (r) => `prompt tokens for every component; OpenUI's chat library ${figure(r.openui)[0]}`, "/docs/format/system-prompt"],
  ["Accessibility (axe violations)", (r) => r.ours, (r) => `accessibility violations; OpenUI ${r.openui}`, "/compare/openui"],
];

// The answer shown as text and as drawn, and streamed beside its call: a
// saved answer from the everyday briefs, as DeepSeek V4 Flash wrote it. The
// page carries only its top, as far as the window shows (to the card named
// here); the stream fetches the whole of it from /answers.
const ANSWER = "bench/raw/deepseek-everyday-final/ours__ev10-sales__r1.txt";
const BRIEF = "Make me a sales dashboard for my shop for this year.";
const SHOWN_TO = '<Card title="Sales by Category">';
const WHOLE = "answers/sales-dashboard.txt";

// The families in the board's colour order; core is white. Each drawn with a
// sample the SDK's own tests use (test/fixtures/components.json).
const FAMILY = [
  ["core", "Core", "text", "core-chart-bar"],
  ["data", "Data", "sky", "data-gauge"],
  ["commerce", "Commerce", "peach", "commerce-plan"],
  ["device", "Device", "aqua", "device-camera"],
  ["docs", "Docs", "butter", "docs-diff"],
  ["media", "Media", "rose", "media-carousel"],
  ["inputs", "Inputs", "lime", "inputs-togglegroup"],
  ["interactive", "Interactive", "lilac", "interactive-quiz-question"],
  ["scheduling", "Scheduling", "mint", "scheduling-calendar"],
];

// The four measurements, one card each in its pastel: the scoreboard axis,
// what it measures, the card's colour, and how its plate draws the numbers.
const PROOF = [
  ["Valid answers, small model (Nemotron 3 Nano 30B-A3B), 46 x 2", "Small models", "Valid answers from Nemotron 3 Nano 30B", "mint", "dots", "The benchmark's 46 briefs, twice each; each dot is one answer, filled when it was valid."],
  ["Layout shift while streaming", "Steady while it streams", "How far the page jumps as the answer arrives", "sky", "bars", "Cumulative layout shift over 20 answers streamed in Chrome; lower is steadier."],
  ["CPU to stream and render in the browser", "Light on the phone", "CPU time to stream and draw", "lilac", "bars", "20 answers in Chrome, the page laid out after every chunk; lower is better."],
  ["Download for streaming in the browser (brotli)", "Small to ship", "What a browser downloads to stream", "butter", "bars", "JavaScript, WASM and CSS, brotli; lower is better."],
];

/** "66.3% (61/92)" as its figure and what's in brackets. */
function figure(s) {
  const m = s.match(/^([^(]+?)\s*\(([^)]+)\)$/);
  return m ? [m[1], m[2]] : [s.split(",")[0].replace(/ \(.*$/, ""), ""];
}
const number = (s) => parseFloat(s.replace(/,/g, ""));

/** A heading in two tones whose lines rise, each from its own mask. */
const heading = (tag, id, first, second) =>
  `<${tag} id="${id}" class="headline"><span class="mask"><span class="line">${first}</span></span> <span class="mask"><span class="line line--soft">${second}</span></span></${tag}>`;

/** The answer's text as it streamed, its tags and table rules quieter than its words. */
function source(text) {
  return esc(text)
    .replace(/(&lt;\/?[A-Z][\w]*(?:\s[^&]*?)?\/?&gt;)/g, '<span class="src__tag">$1</span>')
    .replace(/^(\|[-| ]+\|)$/gm, '<span class="src__tag">$1</span>');
}

/** A measurement drawn on its card's plate: the answers as dots, or the two figures as bars. */
function plate(kind, ours, theirs) {
  if (kind === "dots") {
    const [, a, n] = ours.match(/(\d+)\/(\d+)/).map(Number);
    const [, b] = theirs.match(/(\d+)\/(\d+)/).map(Number);
    const row = (filled, who) => `<div class="plate__row"><span class="plate__who">${who}</span><span class="dots" role="img" aria-label="${filled} of ${n} valid">${'<i class="on"></i>'.repeat(filled)}${"<i></i>".repeat(n - filled)}</span></div>`;
    return row(a, "MorphScreen") + row(b, "OpenUI");
  }
  const x = number(ours);
  const y = number(theirs);
  const max = Math.max(x, y);
  const bar = (v, label, who, mine) => `<div class="plate__row"><span class="plate__who">${who}</span><span class="meter${mine ? " meter--ours" : ""}"><span class="meter__fill meter__fill--${Math.max(1, Math.round((v / max) * 20))}"></span></span><span class="plate__v msui-num">${esc(label)}</span></div>`;
  return bar(x, figure(ours)[0], "MorphScreen", true) + bar(y, figure(theirs)[0], "OpenUI", false);
}

export function home({ plans, board, families, css }) {
  const free = plans.find((p) => p.name === "free");
  const total = families.reduce((n, f) => n + f.components.length, 0);
  const measured = board.tally.ours + board.tally.openui + board.tally.tie;
  const byName = new Map(families.map((f) => [f.name, f]));
  if (FAMILY.length !== families.length || families.some((f) => !FAMILY.find(([n]) => n === f.name))) throw new Error("a pack without its place on the page: update FAMILY");

  const strip = [
    `<li><a href="/benchmark"><strong class="msui-num">${board.tally.ours} of ${measured}</strong><span>measures ahead of OpenUI</span></a></li>`,
    ...STRIP.map(([axis, value, label, href]) => {
      const r = board.row(axis);
      if (r.winner !== "ours") throw new Error(`"${axis}" no longer has us ahead: pick another for the first screen`);
      return `<li><a href="${href}"><strong class="msui-num">${esc(value(r))}</strong><span>${esc(typeof label === "function" ? label(r) : label)}</span></a></li>`;
    }),
  ].join("");
  const stage = `
<section class="stage" aria-labelledby="hero-title">
  <div class="stage__plate" aria-hidden="true">
    <video class="stage__video" muted loop playsinline preload="none" poster="/media/hero.jpg" data-src="/media/hero.mp4"></video>
  </div>
  <div class="wrap stage__body">
    <div class="stage__copy">
      <h1 id="hero-title" class="stage__title"><span>Let your model answer</span> <span>with real UI.</span></h1>
      <p class="stage__sub">Cards, charts, photos, quizzes and forms, drawn while the answer streams. Every line is checked against the components your app allows, and fixed by the same model when it breaks one.</p>
      <div class="stage__ctas">
        <a class="btn btn--primary btn--large" href="${APP}/signin">Get a free key</a>
        <a class="stage__ghost" href="${DEMO}">Book a 30-minute demo</a>
      </div>
      <div class="install">
        <code class="install__cmd"><span class="install__sign" aria-hidden="true">$</span> npm install @morphscreen/web</code>
        <button type="button" class="install__copy" data-copy-text="npm install @morphscreen/web" aria-label="Copy the install command">Copy</button>
      </div>
      <p class="stage__note">The web SDK, on npm now: <a href="/docs/quickstart">from a key to an answer in your page</a> in about ten minutes. Free: ${count(free.included)} calls on our model with no model key, then up to ${count(free.monthly)} a month on your own OpenRouter key. No card.</p>
    </div>
  </div>
  <div class="wrap stage__foot">
    <ul class="strip" aria-label="Measured against OpenUI">${strip}</ul>
    <p class="stage__behind">Behind this: DeepSeek V4 Flash's own answer, drawn by the web SDK as it streamed. Its photos are NASA's.</p>
  </div>
</section>`;

  // One answer, as text and as drawn.
  const text = readFileSync(join(import.meta.dirname, "../..", ANSWER), "utf8");
  const cut = text.indexOf(SHOWN_TO);
  if (cut < 0) throw new Error(`the answer has no ${SHOWN_TO} to stop the window at`);
  const top = `${text.slice(0, cut).trimEnd()}\n`;
  const drawn = coreHtml(top);
  const morph = `
<section class="section morph" id="morph" aria-labelledby="morph-title" data-reveal data-answer-css="${css.answer}">
  <div class="section__head">
    ${heading("h2", "morph-title", "Your model writes text.", "Your users see this.")}
    <p class="section__note fade"><span class="morph__wide">The same answer twice. DeepSeek V4 Flash was asked "${esc(BRIEF)}" and wrote the text on top; MorphScreen drew what's under it, line by line as it arrived. Move or drag across it to wipe one into the other.</span><span class="morph__phone">DeepSeek V4 Flash was asked "${esc(BRIEF)}" and answered in text. This is what MorphScreen drew from that text, line by line as it arrived.</span></p>
  </div>
  <div class="morph__stage" data-morph>
    <div class="morph__layer morph__layer--text" aria-hidden="true"><pre class="src">${source(top)}</pre></div>
    <div class="morph__layer morph__layer--ui"><div class="ms-answer">${drawn}</div></div>
    <button type="button" class="morph__toggle btn btn--small" aria-pressed="false" hidden>Show it drawn</button>
  </div>
</section>`;

  // The measurements, a card each.
  const cards = PROOF.map(([axis, name, what, colour, kind, how]) => {
    const r = board.row(axis);
    if (r.winner !== "ours") throw new Error(`"${axis}" no longer has us ahead: pick another`);
    const [ours] = figure(r.ours);
    const [theirs] = figure(r.openui);
    return `<li class="result result--${colour}">
      <div class="result__top">
        <h3 class="result__name">${name}</h3>
        <p class="result__what">${what}</p>
      </div>
      <div class="result__stats">
        <p class="result__stat"><span class="result__n msui-num">${esc(ours)}</span><span class="result__who">MorphScreen</span></p>
        <p class="result__stat result__stat--them"><span class="result__n msui-num">${esc(theirs)}</span><span class="result__who">OpenUI</span></p>
      </div>
      <div class="result__media">
        <span class="sheet sheet--2" aria-hidden="true"></span>
        <span class="sheet sheet--1" aria-hidden="true"></span>
        <div class="plate">${plate(kind, r.ours, r.openui)}</div>
      </div>
      <p class="result__how">${how}</p>
    </li>`;
  }).join("");
  const proof = `
<section class="section results" id="proof" aria-labelledby="proof-title" data-reveal>
  <div class="results__head">
    ${heading("h2", "proof-title", "Same briefs, same models.", "Measured against OpenUI.")}
    <p class="results__lead fade">Both answered the same ${46} briefs and were judged by the same rules. Of ${measured} things measured, MorphScreen is ahead on ${board.tally.ours}, behind on ${board.tally.openui} and even on ${board.tally.tie}.</p>
    <span class="rule" aria-hidden="true"></span>
  </div>
  <ul class="results__cards">${cards}</ul>
  <div class="results__more fade">
    <a class="btn" href="/benchmark">All ${measured} measurements</a>
    <a class="results__link" href="/demo">Watch both draw the same answer</a>
  </div>
</section>`;

  // The call, and the same answer streaming live through the web SDK.
  const call = `curl ${API}/v1/chat/completions \\
  -H "X-MorphScreen-Key: $MORPHSCREEN_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "deepseek/deepseek-v4.1-flash", "stream": true,
       "messages": [{"role": "user", "content":
         "${BRIEF}"}]}'`;
  const live = `
<section class="section live" id="how" aria-labelledby="how-title" data-reveal>
  <div class="live__copy">
    ${heading("h2", "how-title", "One call to the API.", "The answer draws itself.")}
    <ol class="live__steps fade">
      <li><strong>Get a key.</strong> Sign up with your email or GitHub: the account comes with a project, its first key and a dashboard of every call.</li>
      <li><strong>Send the chat call you already make.</strong> It speaks OpenAI's chat completions, so change the address and add one header. Keep the key on your server.</li>
      <li><strong>Draw what comes back.</strong> The web SDK draws it as it streams; <code>/v1/render</code> turns a finished answer into HTML that needs no JavaScript.</li>
    </ol>
    <pre class="code fade" tabindex="0" aria-label="The call, with curl"><code>${esc(call)}</code></pre>
  </div>
  <figure class="live__screen">
    <iframe class="live__frame" src="/demo/frames/ours.html" title="The web SDK drawing the answer as it streams" loading="lazy" data-stream="/${WHOLE}"></iframe>
    <figcaption class="live__foot">
      <span class="small live__note" id="live-note" aria-live="polite">The answer above, streamed into the web SDK at a fast model's pace.</span>
      <button type="button" class="btn btn--small" id="live-replay" disabled>Stream it again</button>
    </figcaption>
  </figure>
</section>`;

  // The families, each drawn.
  const samples = new Map(JSON.parse(readFileSync(join(import.meta.dirname, "../../test/fixtures/components.json"), "utf8")).samples.map((s) => [s.id, s]));
  const picks = FAMILY.map(([name, label, colour, sample], i) => {
    const f = byName.get(name);
    return `<input type="radio" name="family" id="fam-${name}" value="${name}"${i === 0 ? " checked" : ""}><label for="fam-${name}" class="pick"><span class="pick__dot" data-colour="${colour}" aria-hidden="true"></span><span class="pick__name">${label}</span><span class="pick__n msui-num">${f.components.length}</span></label>`;
  }).join("");
  const panels = FAMILY.map(([name, label, , sample]) => {
    const f = byName.get(name);
    const s = samples.get(sample);
    if (!s || s.pack !== name) throw new Error(`no sample ${sample} in ${name}`);
    return `<div class="fam" data-fam="${name}">
      <p class="fam__about">${esc(f.about.replace(/\.$/, ""))}.</p>
      <div class="fam__preview"><div class="ms-answer">${coreHtml(s.md, name === "core" ? "core" : name)}</div></div>
      <p class="fam__parts">${f.components.map((c) => `<code>${c}</code>`).join(" ")}</p>
    </div>`;
  }).join("");
  const gallery = `
<section class="section gallery" id="components" aria-labelledby="components-title" data-reveal>
  <div class="section__head">
    ${heading("h2", "components-title", `${total} components in ${families.length} families.`, "Your app allows the ones it wants.")}
    <p class="section__note fade">Core comes with every answer. An app names the packs it wants, or takes them all, and the model is told about only those. Pick a family to see it drawn.</p>
  </div>
  <div class="gallery__body">
    <fieldset class="picks fade"><legend class="sr-only">A family of components</legend>${picks}</fieldset>
    <div class="gallery__panels">${panels}</div>
  </div>
</section>`;

  const faq = `
<section class="section faq" id="questions" aria-labelledby="questions-title" data-reveal>
  <div class="faq__head">
    ${heading("h2", "questions-title", "Questions", "people ask first.")}
  </div>
  <div class="faq__list fade">
    <details><summary>Which models can I use?</summary><p>DeepSeek V4.1 Flash is included on every plan and runs on our key; V4 Flash steps in when V4.1 can't serve a call. Any other model on OpenRouter works with your own OpenRouter key, sent with the call and never kept.</p></details>
    <details><summary>Do you keep my users' prompts and answers?</summary><p>No. We keep a line for each call: when, with which key, how long it took and whether the answer was valid. Never what was said, unless you turn on debug logs for a project, which keeps its prompts and answers for 7 days.</p></details>
    <details><summary>What happens at my plan's limit?</summary><p>The free plan stops until its day or month starts again, and the API answers with 402 or 429 and when to try again. Paid plans carry on: calls past the month are extra, billed with the month, up to as many again as the plan includes.</p></details>
    <details><summary>Does it work with my stack?</summary><p>With anything that can make an HTTP request. The API speaks OpenAI's chat completions and AG-UI, and <code>/v1/render</code> returns plain HTML, so a Node, Python or Go backend can serve answers without any SDK of ours.</p></details>
    <details><summary>Can I cancel?</summary><p>Any time, from the dashboard. The plan runs to the end of the period you paid for, then the account moves to the free plan. Payments aren't refunded, except a charge we made by mistake (<a href="/refunds">cancellation and refunds</a>).</p></details>
    <details><summary>Who's behind it?</summary><p>Nandishwar Singh, building it from Hiranagar in Jammu and Kashmir, India. Write to <a href="mailto:${MAIL}">${MAIL}</a>, or <a href="${DEMO}">book a call</a>.</p></details>
  </div>
</section>`;

  const close = `
<section class="section close" aria-labelledby="close-title" data-reveal>
  ${heading("h2", "close-title", "Try it on your own app.", `${count(free.included)} calls on our model, no card.`)}
  <div class="close__ctas fade">
    <a class="btn btn--primary btn--large" href="${APP}/signin">Get a free key</a>
    <a class="stage__ghost" href="${DEMO}">Book a 30-minute demo</a>
  </div>
</section>`;

  return {
    path: "/",
    title: "MorphScreen: let your model answer with real UI",
    description: `Turn a model's reply into cards, charts, forms and quizzes while it streams, checked line by line against your app's components. ${total} components; free plan, no card.`,
    step: "landing",
    poster: "/media/hero.jpg",
    lazyAnswer: true,
    files: { [WHOLE]: text },
    stage,
    body: morph + proof + live + gallery + pricing(plans) + faq + close,
  };
}
