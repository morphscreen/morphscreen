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
import { repo } from "../data.mjs";
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
<p class="lead">Every published version of <code>@morphscreen/web</code>, newest first. <a href="/changelog.xml">RSS</a></p>
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

/** The blog's pages: its posts and the list of them, or none while nothing is published. */
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
      return { slug: f.replace(/\.md$/, ""), ...meta, html: md(src.slice(m[0].length)) };
    })
    .filter((p) => p.draft !== "true")
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!posts.length) return [];
  const day = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const list = {
    path: "/blog",
    title: "Blog | MorphScreen",
    description: "How MorphScreen works and what we measured: write-ups on generative UI, streaming, validation and the benchmark.",
    step: "legal",
    body: `<header class="page-head">
<h1 class="title1">Blog</h1>
<p class="lead">How MorphScreen works and what we measured. <a href="/blog.xml">RSS</a></p>
</header>
<div class="prose">
${posts.map((p) => `<h2><a href="/blog/${p.slug}">${esc(p.title)}</a></h2>\n<p class="small">${day(p.date)}</p>\n<p>${esc(p.description)}</p>`).join("\n")}
</div>`,
    feed: { file: "blog.xml", title: "The MorphScreen blog" },
    files: {
      "blog.xml": feed({ title: "The MorphScreen blog", path: "/blog", description: "How MorphScreen works and what we measured.", items: posts.map((p) => ({ title: p.title, link: `${ORIGIN}/blog/${p.slug}`, date: `${p.date}T00:00:00Z`, html: p.html })) }),
    },
  };
  return [
    list,
    ...posts.map((p) => ({
      path: `/blog/${p.slug}`,
      title: `${p.title} | MorphScreen`,
      description: p.description,
      step: "legal",
      body: `<header class="page-head">
<p class="small">${day(p.date)}, by Nandishwar Singh</p>
<h1 class="title1">${esc(p.title)}</h1>
</header>
<div class="prose">
${p.html}
</div>`,
      feed: { file: "blog.xml", title: "The MorphScreen blog" },
    })),
  ];
}
