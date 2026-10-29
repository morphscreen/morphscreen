// The docs at morphscreen.com/docs (roadmap H1), built like OpenUI's docs: three
// tabs of pages in a sidebar (Docs, Integrations, Components, API reference),
// a contents list per page, search, Markdown to copy for every page and
// llms.txt for coding agents. Pages are Markdown in site/docs/content, with a
// few blocks of our own:
//
//   ```ts file="sdk/web/install/templates/vite/src/main.ts" title="src/main.ts"
//   ```                              a file from the repository, as it is (the
//                                    integrations are the install test's apps)
//   ```sh pm                         one install line, as npm, pnpm, Yarn and bun tabs
//   :::note Title  ...  :::          a callout (note, tip, warning)
//   :::preview  ...  :::             an answer in our format, drawn live by the core
//   :::cards  - [Title](href): text  :::   links as cards
//   :::steps  ### One  ### Two  :::  numbered steps
//
// The component reference and the HTTP reference are generated from the
// catalog and the API's own description (site/docs/components.mjs and
// reference.mjs), so they can't drift from the product.

import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { coreHtml, repo } from "./data.mjs";
import { componentPages } from "./docs/components.mjs";
import { NAV } from "./docs/nav.mjs";
import { referencePages } from "./docs/reference.mjs";
import { esc, ORIGIN } from "./pages/shared.mjs";

const here = import.meta.dirname;
const tools = process.env.SITE_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-site");
if (!existsSync(join(here, "node_modules"))) symlinkSync(join(tools, "node_modules"), join(here, "node_modules"));
const { Marked, Renderer } = await import("marked");
const { createHighlighter } = await import("shiki");

// Code in three greys and two weights: words stay white or grey (MorphScreenUI).
const THEME = {
  name: "morphscreenui",
  type: "dark",
  colors: { "editor.background": "#0e0e10", "editor.foreground": "#b9b9c1" },
  tokenColors: [
    { settings: { foreground: "#b9b9c1" } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#86868f", fontStyle: "italic" } },
    { scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "keyword.operator.new", "keyword.operator.expression", "keyword.operator.logical"], settings: { foreground: "#f4f4f6", fontStyle: "bold" } },
    { scope: ["string", "string.quoted", "string.template", "markup.inline.raw"], settings: { foreground: "#f4f4f6" } },
    { scope: ["entity.name.function", "support.function", "entity.name.tag", "entity.name.type", "support.class", "support.type", "entity.other.attribute-name", "meta.object-literal.key", "support.type.property-name", "variable.other.property", "markup.heading"], settings: { foreground: "#f4f4f6" } },
    { scope: ["constant", "constant.numeric", "constant.language", "variable.other.constant"], settings: { foreground: "#f4f4f6" } },
    { scope: ["punctuation", "meta.brace", "keyword.operator", "punctuation.separator", "punctuation.terminator", "punctuation.definition.tag"], settings: { foreground: "#86868f" } },
  ],
};
const GREY = { "#F4F4F6": "t1", "#B9B9C1": "t2", "#86868F": "t3" };
const LANGS = ["ts", "tsx", "js", "jsx", "json", "bash", "html", "css", "vue", "svelte", "python", "markdown", "diff", "yaml", "http", "swift", "kotlin", "rust", "text"];
const ALIAS = { sh: "bash", shell: "bash", typescript: "ts", javascript: "js", md: "markdown", py: "python", morphscreen: "markdown", txt: "text", "": "text" };
const LABEL = { bash: "Terminal", ts: "TypeScript", tsx: "TSX", js: "JavaScript", jsx: "JSX", json: "JSON", html: "HTML", css: "CSS", vue: "Vue", svelte: "Svelte", python: "Python", markdown: "Markdown", diff: "Diff", yaml: "YAML", http: "HTTP", swift: "Swift", kotlin: "Kotlin", rust: "Rust", text: "Text" };
const highlighter = await createHighlighter({ themes: [THEME], langs: LANGS });

/** Code as spans with our grey classes: no inline style, so a strict CSP holds. */
function highlight(code, lang) {
  const l = ALIAS[lang] ?? lang;
  const use = LANGS.includes(l) ? l : "text";
  const lines = highlighter.codeToTokensBase(code.replace(/\n$/, ""), { lang: use, theme: "morphscreenui" });
  const html = lines
    .map((line) =>
      line
        .map((t) => {
          const cls = [GREY[(t.color ?? "").toUpperCase()] ?? "t2"];
          if (t.fontStyle & 1) cls.push("ti");
          if (t.fontStyle & 2) cls.push("tb");
          return `<span class="${cls.join(" ")}">${esc(t.content)}</span>`;
        })
        .join(""),
    )
    .join("\n");
  return [html, use];
}

/** A code block, with its title (a file name) or language, and a copy button. */
function codeBlock(code, lang, title) {
  const [html, use] = highlight(code, lang);
  return `<figure class="cb" data-lang="${use}"><figcaption class="cb__head"><span class="cb__title">${esc(title || LABEL[use] || use)}</span><button type="button" class="cb__copy" data-copy>Copy</button></figcaption><pre tabindex="0"><code>${html}</code></pre></figure>`;
}

/** One install line as each package manager writes it. */
function packageTabs(line) {
  const m = line.trim().match(/^npm (install|i)( -D| --save-dev)? (.+)$/);
  if (!m) throw new Error(`a pm block takes one npm install line: ${line}`);
  const [, , dev, pkgs] = m;
  const rows = [
    ["npm", `npm install${dev ? " -D" : ""} ${pkgs}`],
    ["pnpm", `pnpm add${dev ? " -D" : ""} ${pkgs}`],
    ["yarn", `yarn add${dev ? " -D" : ""} ${pkgs}`],
    ["bun", `bun add${dev ? " -d" : ""} ${pkgs}`],
  ];
  return tabs("pm", rows.map(([name, cmd]) => [name, codeBlock(cmd, "bash", "Terminal")]));
}

let tabsCount = 0;
/** Tabs (a package manager, preview and source): all panels shown without script. */
function tabs(group, panels) {
  const n = ++tabsCount;
  return `<div class="tabs" data-tabs="${group}"><div class="tabs__list" role="tablist">${panels
    .map(([name], i) => `<button type="button" role="tab" id="tab-${n}-${i}" aria-controls="panel-${n}-${i}" aria-selected="${i === 0}" data-tab="${esc(name)}">${esc(name)}</button>`)
    .join("")}</div>${panels.map(([, html], i) => `<div class="tabs__panel" role="tabpanel" id="panel-${n}-${i}" aria-labelledby="tab-${n}-${i}" data-tab="${esc(panels[i][0])}">${html}</div>`).join("")}</div>`;
}

/** An answer in our format, drawn by the core, with its source beside it. */
export function preview(md, packs = "all") {
  // A sample's media at example.com is a placeholder: the player is drawn without it, so nothing asks for a file that isn't there.
  const html = coreHtml(md, packs).replace(/(<(?:video|audio)\b[^>]*?) src="https:\/\/example\.com\/[^"]*"/g, "$1");
  return tabs("preview", [
    ["Preview", `<div class="preview"><div class="ms-answer">${html}</div></div>`],
    ["Source", codeBlock(md, "markdown", "The model's answer")],
  ]);
}

/** What a docs page's share card shows beside its title: its first live
 * examples drawn by the core (up to three, stacked), else its code samples
 * until the panel is full, else nothing. */
function cardVisual(md) {
  const previews = [...md.matchAll(/^:::preview[ \t]*(\S*)\n([\s\S]*?)^:::[ \t]*$/gm)].slice(0, 3);
  if (previews.length) return { type: "answer", html: previews.map((p) => coreHtml(p[2], p[1] || "all").replace(/(<(?:video|audio)\b[^>]*?) src="https:\/\/example\.com\/[^"]*"/g, "$1")).join("\n") };
  const lines = [];
  let title = null;
  for (const m of md.matchAll(/^```(\w*)([^\n]*)\n([\s\S]*?)^```\s*$/gm)) {
    if (/\bpm\b/.test(m[2]) || !m[3].trim()) continue;
    title ??= m[2].match(/title="([^"]+)"/)?.[1] ?? "";
    if (lines.length) lines.push("");
    lines.push(...m[3].replace(/\n+$/, "").split("\n"));
    if (lines.length >= 10) break;
  }
  if (!lines.length) return { type: "none" };
  return { type: "code", title, code: lines.slice(0, 15).map((l) => (l.length > 60 ? `${l.slice(0, 59)}…` : l)).join("\n") };
}

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Front matter (title, description) and the body. */
function readPage(file) {
  const src = readFileSync(file, "utf8");
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error(`${file}: no front matter`);
  // A value may be quoted, YAML-style ("@morphscreen/web"): the quotes aren't part of it.
  const meta = Object.fromEntries(m[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim().replace(/^"(.*)"$/, "$1")]));
  return { meta, body: src.slice(m[0].length) };
}

/** ```lang file="path" blocks filled from the repository. */
function includeFiles(md) {
  return md.replace(/^```(\w*)([^\n]*?)file="([^"]+)"([^\n]*)\n```$/gm, (_, lang, a, path, b) => {
    const text = readFileSync(join(repo, path), "utf8").replace(/\n$/, "");
    return "```" + lang + a + b + "\n" + text + "\n```";
  });
}

/** Our blocks (:::name ... :::) turned into HTML, code fences left alone. */
function directives(md, render) {
  const out = [];
  const lines = md.split("\n");
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(/^(`{3,})/);
    if (f) fence = fence === null ? f[1] : line.startsWith(fence) && line.trim() === fence ? null : fence;
    const open = fence === null && line.match(/^:::(note|tip|warning|preview|cards|steps)\s*(.*)$/);
    if (!open) {
      out.push(line);
      continue;
    }
    const body = [];
    let inner = null;
    let depth = 0;
    for (i++; i < lines.length; i++) {
      const l = lines[i];
      const g = l.match(/^(`{3,})/);
      if (g) inner = inner === null ? g[1] : l.trim() === inner ? null : inner;
      if (inner === null && /^:::(note|tip|warning|preview|cards|steps)\b/.test(l)) depth++;
      else if (inner === null && l.trim() === ":::") {
        if (depth === 0) break;
        depth--;
      }
      body.push(l);
    }
    const [kind, arg] = [open[1], open[2].trim()];
    const text = body.join("\n");
    let html;
    if (kind === "preview") html = preview(text, arg || "all");
    else if (kind === "cards") {
      const items = [...text.matchAll(/^- \[([^\]]+)\]\(([^)]+)\):?\s*(.*)$/gm)];
      html = `<div class="cards">${items.map(([, t, href, d]) => `<a class="card-link" href="${esc(href)}"><span class="card-link__title">${esc(t)}</span><span class="card-link__text">${render.inline(d)}</span></a>`).join("")}</div>`;
    } else if (kind === "steps") html = `<div class="steps-doc">${render.block(text)}</div>`;
    else html = `<div class="callout" data-tone="${kind}"><p class="callout__title"><span class="callout__dot" aria-hidden="true"></span>${esc(arg || { note: "Note", tip: "Tip", warning: "Careful" }[kind])}</p>${render.block(text)}</div>`;
    out.push("", html, "");
  }
  return out.join("\n");
}

/** The page as Markdown for people and agents to copy: our blocks written plainly. */
function plainMarkdown(title, description, md) {
  const body = md
    .replace(/^:::preview.*\n([\s\S]*?)^:::\s*$/gm, (_, a) => "```markdown\n" + a.replace(/\n$/, "") + "\n```")
    .replace(/^:::(note|tip|warning)\s*(.*)\n([\s\S]*?)^:::\s*$/gm, (_, k, t, a) => a.trim().split("\n").map((l, i) => (i === 0 ? `> **${t || { note: "Note", tip: "Tip", warning: "Careful" }[k]}:** ${l}` : `> ${l}`)).join("\n"))
    .replace(/^:::(cards|steps)\s*\n?/gm, "")
    .replace(/^:::\s*$/gm, "")
    .replace(/^```(\w+)[^\n]*$/gm, "```$1");
  return `# ${title}\n\n> ${description}\n\n${body.trim()}\n`;
}

/** Renders one page's Markdown: its HTML, the h2 and h3 for the contents. */
function render(md) {
  const toc = [];
  const used = new Set();
  let tables = 0;
  const marked = new Marked({ gfm: true });
  const api = { block: (t) => marked.parse(directives(t, api)), inline: (t) => marked.parseInline(t) };
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        let id = slug(text);
        while (used.has(id)) id += "-2";
        used.add(id);
        if (depth === 2 || depth === 3) toc.push({ depth, id, text: inner.replace(/<[^>]+>/g, "") });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const [l, ...meta] = (lang ?? "").split(/\s+/);
        const m = meta.join(" ");
        if (/\bpm\b/.test(m)) return packageTabs(text);
        const title = m.match(/title="([^"]+)"/)?.[1];
        return codeBlock(text, l, title);
      },
      table(token) {
        // Each scrolling table named by its columns, so no two regions share a name.
        tables++;
        const label = `Table ${tables}: ${token.header.map((h) => h.text.replace(/[`*|]/g, "")).join(", ")}`;
        return `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(label)}">${Renderer.prototype.table.call(this, token)}</div>`;
      },
    },
  });
  const html = marked.parse(directives(md, api));
  return { html, toc };
}

/** Every page in a tab's sidebar order, for previous and next. */
const order = NAV.flatMap((tab) => tab.groups.flatMap((g) => g.pages.map((p) => ({ ...p, tab: tab.name, group: g.title }))));

function sidebar(current) {
  return NAV.map(
    (tab) =>
      `<div class="side__tab${tab.groups.some((g) => g.pages.some((p) => p.path === current)) ? " side__tab--on" : ""}">${tab.groups
        .map(
          (g) =>
            `<p class="side__group">${esc(g.title)}</p><ul>${g.pages
              .map((p) => `<li><a href="${p.path}"${p.path === current ? ' aria-current="page"' : ""}>${esc(p.title)}</a></li>`)
              .join("")}</ul>`,
        )
        .join("")}</div>`,
  ).join("");
}

function tabBar(current) {
  return `<nav class="docs-tabs" aria-label="Docs sections"><div class="wrap docs-tabs__in">${NAV.map((tab) => {
    const on = tab.groups.some((g) => g.pages.some((p) => p.path === current));
    return `<a href="${tab.groups[0].pages[0].path}"${on ? ' aria-current="true"' : ""}>${esc(tab.name)}</a>`;
  }).join("")}<button type="button" class="docs-search-open" data-search-open aria-label="Search the docs"><span>Search the docs</span><kbd>/</kbd></button></div></nav>`;
}

/** The docs' pages, ready for the site's layout, plus their files. */
export function docs({ dist, board, plans }) {
  // {{score:axis:ours}} or :openui, a number from the newest scoreboard, and
  // {{plan:build:monthly}}, a plan's limit from plans.rs, so none goes stale.
  const scores = (md) =>
    md
      .replace(/\{\{score:(.+?):(ours|openui)\}\}/g, (_, axis, side) => board.row(axis)[side])
      // {{md:spec/format.md}}, a document from the repository, its own title left out.
      // {{md:spec/format.md#Section}} takes one "## Section" and what's under it.
      .replace(/^\{\{md:([^#}]+)(?:#([^}]+))?\}\}$/gm, (_, path, section) => {
        const text = readFileSync(join(repo, path), "utf8").replace(/^# .*\n+/, "");
        if (!section) return text;
        const at = text.indexOf(`\n## ${section}\n`);
        if (at < 0) throw new Error(`${path} has no "## ${section}"`);
        const rest = text.slice(at + 1);
        const end = rest.indexOf("\n## ", 3);
        // Its ### headings become the page's ##, so the headings stay in order.
        return (end < 0 ? rest : rest.slice(0, end)).replace(/^## .*\n+/, "").replace(/^#(#{2,}) /gm, "$1 ");
      })
      // {{prompt:core}}, {{prompt:all}}: the system prompt's tokens, core alone and every pack, from the
      // scoreboard's prompt rows; {{prompt:per}}, what each component a pack adds costs.
      .replace(/\{\{prompt:(core|all|per)\}\}/g, (_, which) => {
        const core = board.row("System prompt in the benchmark, tokens").ours;
        const all = board.row("System prompt with every component, tokens").ours;
        const num = (s) => Number(s.match(/^[\d,]+/)[0].replace(/,/g, ""));
        if (which === "core") return num(core).toLocaleString("en-US");
        if (which === "all") return num(all).toLocaleString("en-US");
        const coreCount = Object.keys(JSON.parse(readFileSync(join(repo, "spec/packs/core.json"), "utf8")).components).length;
        const allCount = Number(all.match(/\((\d+) components/)[1]);
        return String(Math.round((num(all) - num(core)) / (allCount - coreCount)));
      })
      .replace(/\{\{plan:(\w+):(\w+)\}\}/g, (_, name, field) => {
        const p = plans.find((x) => x.name === name);
        if (!p || !(field in p)) throw new Error(`no plan value ${name}.${field}`);
        return p[field] === null ? "none" : p[field].toLocaleString("en-US");
      });
  const generated = new Map([...componentPages({ preview }), ...referencePages()].map((p) => [p.path, p]));
  const pages = [];
  const search = [];
  const full = [];
  for (const [i, entry] of order.entries()) {
    let page;
    // Generated pages take the scoreboard's numbers the same way.
    if (generated.has(entry.path)) page = { ...generated.get(entry.path), md: scores(generated.get(entry.path).md) };
    else {
      const file = join(here, "docs/content", `${entry.path.replace(/^\/docs\/?/, "") || "index"}.md`);
      const { meta, body } = readPage(file);
      page = { title: meta.title, description: meta.description, md: scores(includeFiles(body)) };
    }
    const { html, toc } = render(page.md);
    const prev = order[i - 1];
    const next = order[i + 1];
    const mdPath = `${entry.path === "/docs" ? "/docs/index" : entry.path}.md`;
    const plain = plainMarkdown(page.title, page.description, page.md);
    mkdirSync(dirname(join(dist, mdPath)), { recursive: true });
    writeFileSync(join(dist, mdPath), plain);
    full.push(plain);
    search.push({ u: entry.path, t: page.title, s: entry.group, h: toc.map((h) => [h.id, h.text]), x: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 6000) });
    const body = `${tabBar(entry.path)}
<div class="docs">
  <input type="checkbox" id="side-toggle" class="side-toggle" aria-label="Show the docs' pages">
  <label for="side-toggle" class="side-toggle__label">Pages</label>
  <nav class="side" aria-label="Docs pages">${sidebar(entry.path)}</nav>
  <article class="doc">
    <header class="doc__head">
      <p class="doc__group">${esc(entry.group)}</p>
      <h1 class="title1">${esc(page.title)}</h1>
      <p class="lead">${esc(page.description)}</p>
      <div class="doc__tools"><button type="button" class="btn btn--small" data-copy-md="${mdPath}">Copy Markdown</button><a class="btn btn--small" href="${mdPath}">View as Markdown</a></div>
    </header>
    <div class="doc__body">${html}</div>
    <nav class="doc__pager" aria-label="Previous and next">${prev ? `<a class="pager pager--prev" href="${prev.path}"><span class="pager__dir">Previous</span><span class="pager__title">${esc(prev.title)}</span></a>` : "<span></span>"}${next ? `<a class="pager pager--next" href="${next.path}"><span class="pager__dir">Next</span><span class="pager__title">${esc(next.title)}</span></a>` : ""}</nav>
  </article>
  <aside class="toc" aria-label="On this page">${toc.length ? `<p class="toc__title">On this page</p><ul>${toc.map((h) => `<li class="toc__d${h.depth}"><a href="#${h.id}">${h.text}</a></li>`).join("")}</ul>` : ""}</aside>
</div>
<div class="search" id="search" role="dialog" aria-modal="true" aria-label="Search the docs" hidden>
  <div class="search__box">
    <input type="search" class="search__input" placeholder="Search the docs" aria-label="Search the docs" autocomplete="off">
    <ul class="search__results" role="listbox" aria-label="Results"></ul>
    <p class="search__hint small">Enter opens the first result, Escape closes.</p>
  </div>
</div>`;
    pages.push({ path: entry.path, title: `${page.title} | MorphScreen docs`, description: page.description, step: "docs", docs: true, answer: true, body, card: { section: entry.group, title: page.title, visual: cardVisual(page.md) } });
  }
  writeFileSync(join(dist, "docs/search.json"), JSON.stringify(search));
  writeFileSync(
    join(dist, "llms.txt"),
    `# MorphScreen\n\n> Generative UI for any model: a model answers in Markdown with a few tags, MorphScreen checks every line as it streams and draws it as UI on the web.\n\nEvery docs page is also served as Markdown (add .md to its address). The whole docs in one file: ${ORIGIN}/llms-full.txt\n\n${NAV.map((tab) => tab.groups.map((g) => `## ${tab.name}: ${g.title}\n\n${g.pages.map((p) => `- [${p.title}](${ORIGIN}${p.path === "/docs" ? "/docs/index" : p.path}.md)`).join("\n")}`).join("\n\n")).join("\n\n")}\n`,
  );
  writeFileSync(join(dist, "llms-full.txt"), full.join("\n\n---\n\n"));
  return pages;
}
