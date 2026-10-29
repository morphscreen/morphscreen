// Builds the system prompt from a catalog (spec/catalog.ts) and the worked
// examples. Changing anything here changes what models see, so benchmark raws
// record the prompt's hash.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attrSpec, defaultCatalog, type Catalog, type Component } from "../spec/catalog.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** `<Slider label! min=number! max=number! step=number />`: one line per component. */
export function signature(name: string, c: Component): string {
  const parts = Object.entries(c.attrs).map(([attr, spec]) => {
    const s = attrSpec(spec);
    const req = s.required ? "!" : "";
    if (Array.isArray(s.type)) {
      // The default goes first so "first is the default" holds.
      const values = s.default ? [String(s.default), ...s.type.filter((v) => v !== s.default)] : s.type;
      return `${attr}=${values.join("|")}${req}`;
    }
    if (s.type === "number") return `${attr}=number${req}`;
    if (s.type === "boolean") return `${attr}=true|false${req}`;
    if (s.type === "list") return `${attr}="A | B"${req}`;
    return `${attr}${req}`;
  });
  const open = `<${[name, ...parts].join(" ")}`;
  const content =
    c.content === "none"
      ? " />"
      : c.content === "text"
        ? c.actions ? `>label, then Buttons</${name}>` : `>label</${name}>`
        : c.content === "table"
          ? `>Markdown table</${name}>`
          : c.content === "images"
            ? `>Markdown images</${name}>`
            : c.content === "list"
              ? `>Markdown list</${name}>`
              : c.content.startsWith("only:")
                ? `><${c.content.slice(5)}>…</${name}>`
                : `>…</${name}>`;
  return `${open}${content}: ${c.about}${c.parent ? ` (only inside ${c.parent})` : ""}`;
}

// The rules the model reads first, shared with the Rust core.
const RULES = readFileSync(join(here, "rules.md"), "utf8").trimEnd();

export function systemPrompt(catalog: Catalog = defaultCatalog): string {
  const components = Object.entries(catalog.components)
    .map(([name, c]) => signature(name, c))
    .join("\n");
  const examples = ["example-1.md", "example-2.md"]
    .map((f, i) => `Example ${i + 1}:\n${readFileSync(join(here, "examples", f), "utf8").trim()}`)
    .join("\n\n");
  return `${RULES}\n\nComponents:\n${components}\n\n${examples}\n`;
}

export function promptHash(catalog: Catalog = defaultCatalog): string {
  return createHash("sha256").update(systemPrompt(catalog)).digest("hex").slice(0, 12);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(systemPrompt());
}
