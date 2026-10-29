// morphscreen.com, built (roadmap N1): static HTML in MorphScreenUI, every
// number read from the repository (data.mjs), each page with its title,
// description, canonical address, Open Graph card and structured data (N5),
// assets named by their hash, and brotli and gzip copies beside each file
// for Caddy to serve as they are (N4).
//
//   node ui/build.mjs && node sdk/web/build.mjs   (MorphScreenUI; the answers' stylesheet)
//   node site/build.mjs                           writes site/dist.nosync

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { coreHtml, packs, plans, repo, scoreboard } from "./data.mjs";
import { docs } from "./docs.mjs";
import { benchmarkPage } from "./pages/benchmark.mjs";
import { compareOpenUI } from "./pages/compare.mjs";
import { demoPage } from "./pages/demo.mjs";
import { home } from "./pages/home.mjs";
import { pricingPage } from "./pages/pricing.mjs";
import { APP, DEMO, MAIL, ORIGIN, STATUS, esc } from "./pages/shared.mjs";

const here = import.meta.dirname;
// ".nosync": the repository may sit in a folder iCloud syncs, which keeps a
// conflict copy ("terms 4.html") of a file rewritten quickly and loses the file.
const dist = join(here, "dist.nosync");

const ui = join(repo, "ui/dist/morphscreenui.css");
const answers = join(repo, "sdk/web/dist/morphscreen.css");
for (const [f, how] of [[ui, "node ui/build.mjs"], [answers, "node sdk/web/build.mjs"]]) {
  if (!existsSync(f)) throw new Error(`${relative(repo, f)} is missing: run ${how} first`);
}
if (statSync(answers).mtimeMs < statSync(join(repo, "render/theme.css")).mtimeMs) throw new Error("sdk/web/dist/morphscreen.css is older than render/theme.css: run node sdk/web/build.mjs");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "fonts"), { recursive: true });

/** Writes an asset under its content's hash: name.1a2b3c4d.ext. */
function hashed(name, content) {
  const h = createHash("sha256").update(content).digest("hex").slice(0, 10);
  const out = name.replace(/(\.\w+)$/, `.${h}$1`);
  writeFileSync(join(dist, out), content);
  return `/${out}`;
}

// The faces: MorphScreenUI's (Archivo, Plex Mono) and the answers' (Plex Sans).
for (const dir of [join(repo, "ui/dist/fonts"), join(repo, "sdk/web/dist/fonts")]) {
  for (const f of readdirSync(dir)) copyFileSync(join(dir, f), join(dist, "fonts", f === "LICENSE" ? "IBMPlexSans-OFL.txt" : f));
}
const css = {
  ui: hashed("morphscreenui.css", readFileSync(ui)),
  site: hashed("site.css", readFileSync(join(here, "src/site.css"))),
  answer: hashed("answer.css", readFileSync(answers)),
  docs: hashed("docs.css", readFileSync(join(here, "src/docs.css"))),
};
const js = hashed("site.js", readFileSync(join(here, "src/site.js")));
const docsJs = hashed("docs.js", readFileSync(join(here, "src/docs.js")));
const demoJs = hashed("demo.js", readFileSync(join(here, "src/demo.js")));
for (const f of readdirSync(join(here, "static"), { recursive: true })) {
  const from = join(here, "static", f);
  if (statSync(from).isDirectory()) continue;
  mkdirSync(dirname(join(dist, f)), { recursive: true });
  copyFileSync(from, join(dist, f));
}

const all = plans();
const board = scoreboard();
const families = packs();

const MARK = `<svg viewBox="0 0 280 200" aria-hidden="true" focusable="false"><path d="M20,20 L100,20 L140,104 L180,20 L260,20 L260,180 L20,180 Z" fill="currentColor"/></svg>`;

const NAV = [
  ["/docs", "Docs", true],
  ["/pricing", "Pricing"],
  ["/benchmark", "Benchmark"],
  [`${STATUS}`, "Status"],
];

// Who we are, as search engines read it: the organisation, the product and its prices.
function structured(page) {
  const org = {
    "@type": "Organization",
    "@id": `${ORIGIN}/#org`,
    name: "MorphScreen",
    url: ORIGIN,
    logo: `${ORIGIN}/icon-512.png`,
    email: MAIL,
    founder: { "@type": "Person", name: "Nandishwar Singh" },
    address: { "@type": "PostalAddress", streetAddress: "Ward number 5", addressLocality: "Hiranagar", addressRegion: "Jammu and Kashmir", postalCode: "184142", addressCountry: "IN" },
  };
  const graph = [org, { "@type": "WebSite", "@id": `${ORIGIN}/#site`, name: "MorphScreen", url: ORIGIN, publisher: { "@id": `${ORIGIN}/#org` } }];
  if (page.og) {
    const url = `${ORIGIN}${page.path}`;
    graph.push({ "@type": page.docs ? "TechArticle" : "WebPage", "@id": url, url, name: page.og.title, description: page.description, isPartOf: { "@id": `${ORIGIN}/#site` }, primaryImageOfPage: { "@type": "ImageObject", url: page.og.url, width: 1200, height: 630 } });
  }
  if (page.path === "/" || page.path === "/pricing") {
    graph.push({
      "@type": "SoftwareApplication",
      name: "MorphScreen",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: ORIGIN,
      description: page.description,
      publisher: { "@id": `${ORIGIN}/#org` },
      offers: all.flatMap((p) => [
        { "@type": "Offer", name: `${p.name[0].toUpperCase()}${p.name.slice(1)}, monthly`, price: String(p.usd_month), priceCurrency: "USD", url: `${ORIGIN}/pricing` },
        { "@type": "Offer", name: `${p.name[0].toUpperCase()}${p.name.slice(1)}, monthly`, price: String(p.inr_month), priceCurrency: "INR", url: `${ORIGIN}/pricing` },
      ]),
    });
  }
  // A closing tag can't hide in it: "<" is written as its escape.
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll("<", "\\u003c");
}

function layout(page) {
  const url = `${ORIGIN}${page.path === "/" ? "/" : page.path}`;
  const current = (href) => (href === page.path || (href === "/docs" && page.docs) ? ` aria-current="page"` : "");
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
${page.noindex ? `<meta name="robots" content="noindex">` : `<link rel="canonical" href="${url}">`}
<meta name="theme-color" content="#050506">
<meta name="color-scheme" content="dark">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preload" href="/fonts/archivo-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${css.ui}">
<link rel="stylesheet" href="${css.site}">
${page.answer ? `<link rel="stylesheet" href="${css.answer}">\n` : ""}${page.lazyAnswer ? `<noscript><link rel="stylesheet" href="${css.answer}"></noscript>\n` : ""}${page.poster ? `<link rel="preload" as="image" href="${page.poster}" fetchpriority="high">\n` : ""}${page.docs ? `<link rel="stylesheet" href="${css.docs}">\n<script src="${docsJs}" defer></script>\n` : ""}${page.demo ? `<script src="${demoJs}" defer></script>\n` : ""}<meta property="og:type" content="website">
<meta property="og:site_name" content="MorphScreen">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${page.og?.url ?? `${ORIGIN}/og.png`}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(page.og?.alt ?? "MorphScreen: let your model answer with real UI")}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${page.og?.url ?? `${ORIGIN}/og.png`}">
<meta name="twitter:image:alt" content="${esc(page.og?.alt ?? "MorphScreen: let your model answer with real UI")}">
<script type="application/ld+json">${structured(page)}</script>
<script src="${js}" defer></script>
</head>
<body data-step="${page.step}">
<a class="skip" href="#main">Skip to the content</a>
<header class="top">
  <div class="wrap">
    <nav class="bar msui-glass" aria-label="Main">
      <a class="brand" href="/">${MARK}<span>MorphScreen</span></a>
      <ul class="bar__links">${NAV.map(([href, label, keep]) => `<li${keep ? ` class="bar__keep"` : ""}><a href="${href}"${current(href)}>${label}</a></li>`).join("")}</ul>
      <a class="bar__signin" href="${APP}/signin">Sign in</a>
      <a class="btn btn--primary btn--small" href="${APP}/signin">Get a free key</a>
    </nav>
  </div>
</header>
${page.stage ? `<main id="main">\n${page.stage}\n<div class="wrap">\n${page.body}\n</div>\n</main>` : `<main id="main" class="wrap">\n${page.body}\n</main>`}
<footer class="foot">
  <div class="wrap foot__cols">
    <div class="foot__who">
      <a class="brand" href="/">${MARK}<span>MorphScreen</span></a>
      <p>Generative UI for any model, checked as it streams.</p>
      <p>&copy; 2026 Nandishwar Singh, trading as MorphScreen. Hiranagar, Jammu and Kashmir, India.</p>
    </div>
    <nav aria-labelledby="foot-product"><h2 id="foot-product">Product</h2><ul>
      <li><a href="/docs">Docs</a></li><li><a href="/#how">How it works</a></li><li><a href="/docs/components">Components</a></li><li><a href="/pricing">Pricing</a></li><li><a href="/benchmark">Benchmark</a></li><li><a href="/compare/openui">Against OpenUI</a></li><li><a href="https://github.com/morphscreen/morphscreen">GitHub</a></li><li><a href="${STATUS}">Status</a></li>
    </ul></nav>
    <nav aria-labelledby="foot-account"><h2 id="foot-account">Account</h2><ul>
      <li><a href="${APP}/signin">Get a free key</a></li><li><a href="${APP}/signin">Sign in</a></li><li><a href="${DEMO}">Book a demo</a></li><li><a href="/contact">Contact</a></li>
    </ul></nav>
    <nav aria-labelledby="foot-legal"><h2 id="foot-legal">Legal</h2><ul>
      <li><a href="/terms">Terms of service</a></li><li><a href="/privacy">Privacy notice</a></li><li><a href="/refunds">Cancellation and refunds</a></li><li><a href="/delivery">Shipping and delivery</a></li><li><a href="/subprocessors">Sub-processors</a></li><li><a href="/security">Security</a></li><li><button type="button" class="linkish" id="recording-choices">Recording choices</button></li>
    </ul></nav>
  </div>
</footer>
<div class="consent" id="consent" role="region" aria-label="Recording this visit" hidden>
  <p>Can Microsoft Clarity record how you use this site? It sees clicks and scrolling, never what you type, and sets cookies. Visits are counted either way, without cookies. <a href="/privacy">Privacy notice</a></p>
  <div class="consent__actions"><button type="button" class="btn btn--small" id="consent-no">No</button><button type="button" class="btn btn--primary btn--small" id="consent-yes">Yes, record</button></div>
</div>
</body>
</html>
`;
}

/** A page of text from site/pages/*.html: its settings in the first comment, then its body. */
function textPage(file) {
  const src = readFileSync(join(here, "pages", file), "utf8");
  const m = src.match(/^<!--\s*(\{[\s\S]*?\})\s*-->\n/);
  if (!m) throw new Error(`${file}: no settings comment`);
  return { ...JSON.parse(m[1]), body: src.slice(m[0].length) };
}

const pages = [
  home({ plans: all, board, families, css }),
  pricingPage({ plans: all }),
  compareOpenUI({ board }),
  benchmarkPage({ board, dist }),
  await demoPage({ dist, css }),
  ...["terms.html", "privacy.html", "refunds.html", "delivery.html", "contact.html", "subprocessors.html", "security.html", "book.html", "404.html"].map(textPage),
  ...docs({ dist, board, plans: all }),
];

// The videos and pictures (/media, /docs/media) keep their names but are cached for a week, so each address
// carries its content's version: a new recording reaches everyone at once.
const versions = {};
for (const dir of ["media", "docs/media"]) {
  const at = join(here, "static", dir);
  for (const f of existsSync(at) ? readdirSync(at) : []) versions[`/${dir}/${f}`] = createHash("sha256").update(readFileSync(join(at, f))).digest("hex").slice(0, 10);
}
const versioned = (html) => html.replace(/\/(?:docs\/)?media\/[\w.-]+(?=")/g, (m) => (versions[m] ? `${m}?v=${versions[m]}` : m));

// Each page's share card, drawn by site/cards.mjs: the page's title and
// description, and beside them real UI (an answer the core draws, a code
// sample, a frame of a page's video). A card's file is named by its hash, so
// a changed card is a new address every platform fetches again.
const CARD = 4;
const cards = [];
const answerCard = (md, packs = "all") => ({ type: "answer", html: coreHtml(md, packs) });
const num = (s) => String(s).match(/[\d,.]+/)?.[0] ?? String(s);
function siteVisual(page) {
  if (page.path === "/") return answerCard(readFileSync(join(repo, "bench/raw/deepseek-everyday-final/ours__ev10-sales__r1.txt"), "utf8"));
  if (page.path === "/demo") return answerCard(readFileSync(join(repo, "sdk/web/install/sample.md"), "utf8"));
  if (page.path === "/pricing") {
    const name = (p) => `${p.name[0].toUpperCase()}${p.name.slice(1)}`;
    const calls = (n) => n.toLocaleString("en-US");
    const stat = (p) => `<Stat label="${name(p)}" value="$${p.usd_month}" note="${p.usd_month ? "a month" : "to start"}" />`;
    const table = `| | ${all.map(name).join(" | ")} |\n|---|${all.map(() => "---").join("|")}|\n| Calls a month | ${all.map((p) => calls(p.monthly)).join(" | ")} |\n| On our model | ${all.map((p) => (p.included ? `${p.included} to try` : "every call")).join(" | ")} |\n| A year | ${all.map((p) => (p.usd_year ? `$${calls(p.usd_year)}` : "free")).join(" | ")} |`;
    return answerCard(`## Plans\n\n<Columns>\n${all.map(stat).join("\n")}\n</Columns>\n\n${table}\n`);
  }
  if (page.path === "/benchmark" || page.path === "/compare/openui") {
    const row = (axis) => board.rows.find((r) => r.axis === axis);
    const axe = row("Accessibility (axe violations)");
    const first = row("Time to first text on screen");
    const cpu = row("CPU to stream and render in the browser");
    return answerCard(`<Columns>\n<Stat label="Accessibility issues" value="${num(axe.ours)}" note="OpenUI: ${num(axe.openui)}" />\n<Stat label="First text on screen" value="${num(first.ours)} ms" note="OpenUI: ${num(first.openui)} ms" />\n</Columns>\n\n<Chart type="bar" title="CPU to stream and render, ms, lower is better">\n| Renderer | ms |\n|---|---|\n| MorphScreen | ${num(cpu.ours).replace(/,/g, "")} |\n| OpenUI | ${num(cpu.openui).replace(/,/g, "")} |\n</Chart>\n`);
  }
  if (page.path === "/book") return answerCard('<Card title="A demo, on a call">\n<TimeSlots label="Pick a time, India time" name="slot" options="9:00 PM | 9:30 PM | 10:00 PM | 10:30 PM | 11:00 PM | 11:30 PM" />\n</Card>\n');
  const poster = page.body?.match(/poster="(\/for\/[^"]+)"/)?.[1];
  if (poster) return { type: "image", src: poster };
  return { type: "none" };
}
function shareCard(page) {
  if (page.path === "/404" || page.path.startsWith("/demo/")) return null;
  const title = page.card?.title ?? (page.path === "/" ? "Let your model answer with real UI." : page.title.replace(/ \| MorphScreen.*$/, ""));
  const spec = { v: CARD, docs: !!page.docs, section: page.card?.section ?? null, title, description: page.description, visual: page.card?.visual ?? siteVisual(page) };
  const hash = createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 10);
  const file = `og/${page.path === "/" ? "home" : page.path.slice(1).replace(/\//g, "-")}.${hash}.png`;
  cards.push({ file, spec });
  return { url: `${ORIGIN}/${file}`, title, alt: `${title}: ${page.description}`.slice(0, 300) };
}

for (const page of pages) {
  page.og = shareCard(page);
  // Files a page fetches beside itself (the landing page's whole answer).
  for (const [f, content] of Object.entries(page.files ?? {})) mkdirSync(dirname(join(dist, f)), { recursive: true }), writeFileSync(join(dist, f), content);
  const out = page.path === "/" ? "index.html" : `${page.path.slice(1)}.html`;
  mkdirSync(dirname(join(dist, out)), { recursive: true });
  writeFileSync(join(dist, out), versioned(layout(page)));
}

const listed = pages.filter((p) => !p.noindex);
writeFileSync(join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${listed.map((p) => `  <url><loc>${ORIGIN}${p.path}</loc></url>`).join("\n")}
</urlset>
`);
writeFileSync(join(dist, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
// The dashboard's and the status page's cards, at addresses that don't change
// (their pages are built elsewhere): drawn again when their words change.
for (const [name, title, description] of [
  ["app", "Your MorphScreen dashboard", "API keys, usage, calls and billing. Sign in with your email or GitHub, and your first key is on the next page."],
  ["status", "MorphScreen status", "Whether the MorphScreen API is answering, its uptime and how fast its answers come."],
]) {
  const spec = { v: CARD, docs: false, section: null, title, description, visual: { type: "none" } };
  cards.push({ file: `og/${name}.png`, cache: `og/${name}.${createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 10)}.png`, spec });
}
// What site/cards.mjs draws, outside dist so it isn't published.
mkdirSync(join(here, "cards.nosync"), { recursive: true });
writeFileSync(join(here, "cards.nosync/manifest.json"), JSON.stringify({ answerCss: css.answer, cards }, null, 1));

// Brotli and gzip beside every text file, for Caddy's precompressed serving.
let raw = 0;
let br = 0;
for (const f of readdirSync(dist, { recursive: true })) {
  const p = join(dist, f);
  if (statSync(p).isDirectory() || !/\.(html|css|js|svg|xml|txt|json|md|wasm)$/.test(f)) continue;
  const data = readFileSync(p);
  const b = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } });
  writeFileSync(`${p}.br`, b);
  writeFileSync(`${p}.gz`, gzipSync(data, { level: 9 }));
  raw += data.length;
  br += b.length;
}
console.log(`site/dist.nosync: ${pages.length} pages, ${(raw / 1024).toFixed(0)} KB of text, ${(br / 1024).toFixed(0)} KB brotli; scoreboard of ${board.date}; ${families.reduce((n, f) => n + f.components.length, 0)} components`);
