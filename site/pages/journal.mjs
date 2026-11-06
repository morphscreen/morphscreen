// The changelog and the blog (roadmap N7), each with an RSS feed.
//
// /changelog is the web SDK's CHANGELOG.md, one section a version, dated by
// its release tag (web-vX.Y.Z) where git has the tags. The blog is
// site/blog/*.md, each with a front matter of title, description and date;
// a post marked `draft: true` isn't built, and with no post published there
// is no /blog at all.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { coreHtml, repo } from "../data.mjs";
import { plainMarkdown, render } from "../docs.mjs";
import { esc, ORIGIN } from "./shared.mjs";

const { Marked } = await import("marked");
const md = (text) => new Marked({ gfm: true }).parse(text);
const xml = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
const rfc822 = (iso) => new Date(iso).toUTCString();

function feed({ title, path, description, items }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${xml(title)}</title>
<link>${ORIGIN}${path}</link>
<description>${xml(description)}</description>
<language>en</language>
<atom:link href="${ORIGIN}${path}.xml" rel="self" type="application/rss+xml"/>
${items.map((i) => `<item>
<title>${xml(i.title)}</title>
<link>${i.link}</link>
<guid isPermaLink="true">${i.link}</guid>
${i.date ? `<pubDate>${rfc822(i.date)}</pubDate>\n` : ""}<description><![CDATA[${i.html.replaceAll("]]>", "]]]]><![CDATA[>")}]]></description>
</item>`).join("\n")}
</channel>
</rss>
`;
}

/** When each web SDK version was tagged, from git; empty where the tags aren't there. */
function tagDates() {
  try {
    const out = execFileSync("git", ["for-each-ref", "--format=%(refname:short) %(creatordate:iso-strict)", "refs/tags/web-v*"], { cwd: repo, encoding: "utf8" });
    return Object.fromEntries(out.trim().split("\n").filter(Boolean).map((l) => [l.split(" ")[0].replace("web-v", ""), l.split(" ")[1]]));
  } catch {
    return {};
  }
}

export function changelogPage() {
  const text = readFileSync(join(repo, "sdk/web/CHANGELOG.md"), "utf8");
  const dates = tagDates();
  const sections = text.split(/^## /m).slice(1).map((part) => {
    const [version, ...rest] = part.split("\n");
    const v = version.trim();
    return { version: v, id: `v${v.replace(/\W+/g, "-")}`, date: dates[v], html: md(rest.join("\n")) };
  });
  const day = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const body = `<header class="page-head">
<h1 class="title1">Changelog</h1>
<p class="lead">Every version of the web SDK we've published, newest first. <a href="/changelog.xml">RSS</a></p>
</header>
<div class="prose">
${sections.map((s) => `<h2 id="${s.id}">${esc(s.version)}${s.date ? ` <span class="small">${day(s.date)}</span>` : ""}</h2>\n${s.html}`).join("\n")}
</div>`;
  return {
    path: "/changelog",
    title: "Changelog | MorphScreen",
    description: "Every published version of the MorphScreen web SDK, @morphscreen/web, with what changed and why.",
    step: "legal",
    body,
    feed: { file: "changelog.xml", title: "MorphScreen web SDK changelog" },
    files: {
      "changelog.xml": feed({
        title: "MorphScreen web SDK changelog",
        path: "/changelog",
        description: "Every published version of @morphscreen/web.",
        items: sections.map((s) => ({ title: `@morphscreen/web ${s.version}`, link: `${ORIGIN}/changelog#${s.id}`, date: s.date, html: s.html })),
      }),
    },
  };
}

/** The blog's pages: its posts and the list of them, or none while nothing is
 * published. A post is Markdown with the docs' blocks (`:::figure` draws an
 * answer as a figure), drawn like a docs page without the sidebar: its
 * contents list, Copy Markdown, the post as Markdown beside it for agents,
 * and BlogPosting structured data. */
export function blogPages() {
  const dir = join(repo, "site/blog");
  const posts = (existsSync(dir) ? readdirSync(dir) : [])
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const src = readFileSync(join(dir, f), "utf8");
      const m = src.match(/^---\n([\s\S]*?)\n---\n/);
      if (!m) throw new Error(`site/blog/${f}: no front matter`);
      const meta = Object.fromEntries(m[1].split("\n").map((l) => [l.slice(0, l.indexOf(":")).trim(), l.slice(l.indexOf(":") + 1).trim()]));
      for (const k of ["title", "description", "date"]) if (!meta[k]) throw new Error(`site/blog/${f}: no ${k}`);
      const text = src.slice(m[0].length);
      const { html, toc } = render(text);
      const figure = text.match(/^:::figure[^\n]*\n([\s\S]*?)^:::[ \t]*$/m)?.[1];
      // Reading time from the words people read, at 230 a minute: code and an answer's tags don't count.
      const words = text.replace(/```[\s\S]*?```/g, "").replace(/<[^>]+>/g, "").split(/\s+/).filter(Boolean).length;
      return { slug: f.replace(/\.md$/, ""), ...meta, text, html, toc, figure, minutes: Math.max(1, Math.round(words / 230)) };
    })
    .filter((p) => p.draft !== "true")
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!posts.length) return [];
  const day = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const markdown = Object.fromEntries(posts.map((p) => [`blog/${p.slug}.md`, plainMarkdown(p.title, p.description, p.text).replace(/\n\n/, `\n\n${day(p.date)}, by Nandishwar Singh\n\n`)]));
  const list = {
    path: "/blog",
    title: "Blog | MorphScreen",
    description: "How MorphScreen works and what we measured: write-ups on generative UI, streaming, validation and the benchmark.",
    step: "legal",
    body: `<header class="page-head">
<h1 class="title1">Blog</h1>
<p class="lead">How MorphScreen works and what we measured. <a href="/blog.xml">RSS</a></p>
</header>
<div class="cards cards--posts">
${posts.map((p) => `<a class="card-link" href="/blog/${p.slug}"><span class="card-link__text">${day(p.date)} · ${p.minutes} min read</span><span class="card-link__title">${esc(p.title)}</span><span class="card-link__text">${esc(p.description)}</span></a>`).join("\n")}
</div>`,
    article: true,
    feed: { file: "blog.xml", title: "The MorphScreen blog" },
    files: {
      "blog.xml": feed({ title: "The MorphScreen blog", path: "/blog", description: "How MorphScreen works and what we measured.", items: posts.map((p) => ({ title: p.title, link: `${ORIGIN}/blog/${p.slug}`, date: `${p.date}T00:00:00Z`, html: p.html })) }),
      ...markdown,
    },
  };
  return [
    list,
    ...posts.map((p, i) => ({
      path: `/blog/${p.slug}`,
      title: `${p.title} | MorphScreen`,
      description: p.description,
      step: "legal",
      article: true,
      answer: true,
      post: { headline: p.title, date: p.date, words: p.text.split(/\s+/).length, keywords: p.keywords },
      card: { section: "Blog", title: p.title, visual: p.figure ? { type: "answer", html: coreHtml(p.figure, "all") } : undefined },
      feed: { file: "blog.xml", title: "The MorphScreen blog" },
      body: `<div class="docs docs--post">
  <article class="doc">
    <header class="doc__head">
      <p class="doc__group"><a href="/blog">Blog</a> · ${day(p.date)} · ${p.minutes} min read</p>
      <h1 class="title1">${esc(p.title)}</h1>
      <p class="lead">${esc(p.description)}</p>
      <p class="small">By Nandishwar Singh, who builds MorphScreen</p>
      <div class="doc__tools"><button type="button" class="btn btn--small" data-copy-md="/blog/${p.slug}.md">Copy Markdown</button><a class="btn btn--small" href="/blog/${p.slug}.md">View as Markdown</a></div>
    </header>
    <div class="doc__body">${p.html}</div>
    <nav class="doc__pager" aria-label="More posts">${posts[i + 1] ? `<a class="pager pager--prev" href="/blog/${posts[i + 1].slug}"><span class="pager__dir">Older</span><span class="pager__title">${esc(posts[i + 1].title)}</span></a>` : "<span></span>"}${posts[i - 1] ? `<a class="pager pager--next" href="/blog/${posts[i - 1].slug}"><span class="pager__dir">Newer</span><span class="pager__title">${esc(posts[i - 1].title)}</span></a>` : ""}</nav>
  </article>
  <aside class="toc" aria-label="On this page">${p.toc.length ? `<p class="toc__title">On this page</p><ul>${p.toc.map((h) => `<li class="toc__d${h.depth}"><a href="#${h.id}">${h.text}</a></li>`).join("")}</ul>` : ""}</aside>
</div>`,
    })),
  ];
}

/** What llms.txt and llms-full.txt say about the blog: each post, as Markdown. */
export function blogForAgents() {
  const pages = blogPages().filter((p) => p.post);
  if (!pages.length) return { list: "", full: "" };
  const files = blogPages()[0].files;
  return {
    list: `\n## Blog\n\n${pages.map((p) => `- [${p.post.headline}](${ORIGIN}${p.path}.md): ${p.description}`).join("\n")}\n`,
    full: pages.map((p) => files[`${p.path.slice(1)}.md`]).join("\n\n"),
  };
}
