// The component reference, generated from the catalog (spec/packs) and drawn
// from the samples the SDK's own tests use (test/fixtures/components.json):
// each component's attributes as the validator reads them, and a live preview
// the core draws at build time, with its source.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repo } from "../data.mjs";
import { PACK_NAMES, PACKS } from "./nav.mjs";

const pack = (name) => JSON.parse(readFileSync(join(repo, "spec/packs", `${name}.json`), "utf8"));
const samples = JSON.parse(readFileSync(join(repo, "test/fixtures/components.json"), "utf8")).samples;

const KIND = {
  any: "Markdown and other components",
  text: "inline text: its label",
  table: "a Markdown table (first column labels, the others series)",
  images: "Markdown images, one a line",
  list: "a Markdown list",
  code: "code, as written",
  none: "nothing: it closes itself (`<Name ... />`)",
};

/** An attribute's type, whether it's required, and its values or default. */
function attrRow(name, t) {
  let type;
  let required = false;
  let values = "";
  const spec = typeof t === "object" && !Array.isArray(t) ? t : { type: t };
  required = !!spec.required;
  if (Array.isArray(spec.type)) {
    type = "one of";
    // The first value is the default unless the pack names another.
    const def = spec.default ?? spec.type[0];
    values = spec.type.map((v) => `\`${v}\`${v === def ? " (default)" : ""}`).join(", ");
  } else {
    type = { string: "text", number: "number", boolean: "true or false", url: "address", list: "values split by ` | `", icon: "icon name" }[spec.type] ?? spec.type;
    if (spec.default !== undefined) values = `default \`${spec.default}\``;
  }
  return `| \`${name}\` | ${type} | ${required ? "yes" : ""} | ${values} |`;
}

function component(name, c, packName) {
  const lines = [`## ${name}`, "", `${c.about[0].toUpperCase()}${c.about.slice(1)}.`, ""];
  const content = typeof c.content === "string" && c.content.startsWith("only:") ? `only \`${c.content.slice(5)}\` components` : KIND[c.content] ?? c.content;
  lines.push(`Between its tags: ${content}.${c.parent ? ` It goes inside \`${c.parent}\`.` : ""}${c.actions ? " It also takes `Button`s, drawn under it as what the reader can do." : ""}`, "");
  const attrs = Object.entries(c.attrs ?? {});
  if (attrs.length) lines.push("| Attribute | Type | Required | Values |", "|---|---|---|---|", ...attrs.map(([a, t]) => attrRow(a, t)), "");
  const mine = samples.filter((s) => s.pack === packName && new RegExp(`<${name}[\\s/>]`).test(s.md));
  // Show a component's own samples first (a Chart's nine types), then one that uses it.
  const own = mine.filter((s) => s.name === name || s.name.startsWith(`${name}:`) || s.name.startsWith(`${name} `));
  for (const s of (own.length ? own : mine.slice(0, 1))) {
    if (own.length > 1) lines.push(`### ${s.name.replace(`${name}: `, "")}`, "");
    lines.push(":::preview", s.md.replace(/\n+$/, ""), ":::", "");
  }
  return lines.join("\n");
}

export function componentPages() {
  const packs = PACKS.map((p) => [p, pack(p)]);
  const total = packs.reduce((n, [, p]) => n + Object.keys(p.components).length, 0);
  const overview = {
    path: "/docs/components",
    title: "All components",
    description: `The ${total} components a model can use, in ${packs.length} packs: what each is for, its attributes, and a live preview drawn by the core.`,
    md: [
      "Every answer can use the `core` pack. The others are added by default; an app that names the packs it wants (`packs` in the API and the SDKs) gets core and those, and the model is told about only those. Fewer packs make a shorter system prompt: core alone is {{prompt:core}} tokens, every pack {{prompt:all}}.",
      "",
      "| Pack | Components | What it's for |",
      "|---|---|---|",
      ...packs.map(([n, p]) => `| [${PACK_NAMES[n]}](/docs/components/${n}) | ${Object.keys(p.components).length} | ${p.about} |`),
      "",
      "## Names models use on their own",
      "",
      "A few names models reach for without being told are read as the component they mean, and reported as a note, never taught:",
      "",
      "| They write | It's read as |",
      "|---|---|",
      ...Object.entries(pack("core").aliases ?? {}).map(([a, v]) => `| \`<${a}>\` | ${v.as === "group" ? "a plain group" : `\`<${v.as}>\``}: ${v.about} |`),
      "",
      "## Every component",
      "",
      ...packs.map(([n, p]) => `- **${PACK_NAMES[n]}:** ${Object.keys(p.components).map((c) => `[${c}](/docs/components/${n}#${c.toLowerCase()})`).join(", ")}`),
    ].join("\n"),
  };
  const pages = packs.map(([n, p]) => {
    const intro = [n === "core" ? "Core comes with every answer, whichever packs an app names." : `Add it with \`packs: ["${n}"]\`, or leave \`packs\` out for every pack.`, ""];
    const markdown = n === "core" ? samples.find((s) => s.name === "Markdown") : null;
    if (markdown) intro.push("## Markdown", "", "Text between components is Markdown: headings, lists, tables, emphasis, links, code and images from the hosts an app allows.", "", ":::preview", markdown.md.replace(/\n+$/, ""), ":::", "");
    return {
      path: `/docs/components/${n}`,
      title: `${PACK_NAMES[n]} components`,
      description: `The ${PACK_NAMES[n].toLowerCase()} pack's ${Object.keys(p.components).length} components: ${p.about.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())}.`,
      md: [...intro, ...Object.entries(p.components).map(([name, c]) => component(name, c, n))].join("\n"),
    };
  });
  return [overview, ...pages];
}
