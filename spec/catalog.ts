// The catalog: every component a model may write, built from packs
// (spec/packs/<name>.json) plus a customer's own components. The prompt, the
// validator and the renderers all take a Catalog, so they always agree on what
// exists.
//
// A pack, or a customer's set of components, is JSON:
//
//   { "name": "acme", "version": "1.0.0", "about": "…",
//     "components": { "ProductCard": { "about": "…", "attrs": {…}, "content": "none" } },
//     "aliases": { "Product": { "as": "ProductCard" } } }
//
// Attribute types: string, number, boolean, url, list (values separated by
// " | "), or an enum given as an array; { type, required, default } adds the
// rest. content says what goes between the tags: any (Markdown and tags), text
// (inline text, a label), table (a Markdown table), images (Markdown images),
// list (a Markdown list), only:<Tag> (just those tags), or none (self-closing).
// "columns": "numeric" on a table component means the columns after the first
// hold numbers, as a chart's do. "actions": true on a text component lets
// Buttons go inside it, drawn as its actions (a Product's "Add to cart").
// Aliases are names models write on their own: each is read as a component, or
// as "group" (a plain container), reported as a note and never taught.
//
// One rule across every pack: an attribute name means the same thing
// everywhere. tone is always neutral, info, success, warning or danger.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export type AttrSpec = string | string[] | { type: string | string[]; required?: boolean; default?: unknown };
export type Component = {
  about: string;
  attrs: Record<string, AttrSpec>;
  content: string;
  parent?: string;
  /** With content "table": "numeric" means every column after the first holds numbers (a chart's series). */
  columns?: "numeric";
  /** With content "text": Buttons may go inside, drawn as its actions. */
  actions?: true;
};
export type Alias = { as: string; about?: string };
export type Pack = { name: string; version: string; about?: string; components: Record<string, Component>; aliases?: Record<string, Alias> };
export type Catalog = {
  /** Packs in prompt order, core first, then the customer's sets. */
  packs: { name: string; version: string }[];
  components: Record<string, Component>;
  aliases: Record<string, Alias>;
  /** Which pack each component and alias came from. */
  origin: Record<string, string>;
  /** Changes whenever anything a model could see or the validator checks changes. */
  hash: string;
};

const NAME = /^[A-Z][A-Za-z0-9]*$/;
const SCALARS = new Set(["string", "number", "boolean", "url", "list", "icon"]);
const CONTENT = new Set(["any", "text", "table", "images", "list", "code", "none"]);
const TONES = ["neutral", "info", "success", "warning", "danger"];

export function attrSpec(raw: AttrSpec): { type: string | string[]; required?: boolean; default?: unknown } {
  return typeof raw === "object" && !Array.isArray(raw) ? raw : { type: raw };
}

export function loadPack(name: string): Pack {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`no pack named "${name}"`);
  return JSON.parse(readFileSync(join(here, "packs", `${name}.json`), "utf8"));
}

/** Everything wrong with one component's definition, as messages. */
function problems(name: string, c: Component, where: string): string[] {
  const out: string[] = [];
  const at = `${where}: ${name}`;
  if (!NAME.test(name)) out.push(`${at}: a component name starts with an uppercase letter and has only letters and digits`);
  if (!c.about?.trim()) out.push(`${at}: needs "about", the one line the model reads`);
  const only = c.content?.startsWith("only:") ? c.content.slice(5) : null;
  if (!CONTENT.has(c.content) && !(only && NAME.test(only))) out.push(`${at}: unknown content "${c.content}"`);
  if (c.columns !== undefined && (c.columns !== "numeric" || c.content !== "table")) out.push(`${at}: columns is "numeric", and only on a table`);
  if (c.actions !== undefined && (c.actions !== true || c.content !== "text")) out.push(`${at}: actions is true, and only on a text component`);
  for (const [attr, raw] of Object.entries(c.attrs ?? {})) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(attr)) out.push(`${at}.${attr}: attribute names are camelCase`);
    const s = attrSpec(raw);
    if (Array.isArray(s.type)) {
      if (!s.type.length) out.push(`${at}.${attr}: an enum needs values`);
      if (s.default !== undefined && !s.type.includes(String(s.default))) out.push(`${at}.${attr}: default "${s.default}" isn't one of the values`);
      if (attr === "tone" && s.type.some((v) => !TONES.includes(v))) out.push(`${at}.tone: tone is always ${TONES.join(", ")}`);
    } else if (!SCALARS.has(s.type)) out.push(`${at}.${attr}: unknown type "${s.type}"`);
  }
  return out;
}

/**
 * Core, then the named packs, then the customer's own sets, in that order. A
 * name defined twice is an error, never a silent override: a customer can't
 * replace a built-in component by accident.
 */
/** Every pack in spec/packs, as "all" names them (the core's NAMES, sorted). */
export const ALL_PACKS: string[] = readdirSync(join(here, "packs")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();

export function buildCatalog(opts: { packs?: string[]; custom?: Pack[] } = {}): Catalog {
  const named = [...new Set((opts.packs ?? []).flatMap((p) => (p === "all" ? ALL_PACKS : [p])))].filter((p) => p !== "core");
  // A pack that comes in only through "all" gives way to the app's own: a
  // component or alias the app defines too is left out of it (as the core).
  const own = new Set((opts.custom ?? []).flatMap((s) => [...Object.keys(s.components ?? {}), ...Object.keys(s.aliases ?? {})]));
  const givesWay = (p: Pack): Pack => ({
    ...p,
    components: Object.fromEntries(Object.entries(p.components ?? {}).filter(([n]) => !own.has(n))),
    ...(p.aliases ? { aliases: Object.fromEntries(Object.entries(p.aliases).filter(([n]) => !own.has(n))) } : {}),
  });
  const sets = [loadPack("core"), ...named.map((n) => ((opts.packs ?? []).includes(n) ? loadPack(n) : givesWay(loadPack(n)))), ...(opts.custom ?? [])];
  const cat: Catalog = { packs: [], components: {}, aliases: {}, origin: {}, hash: "" };
  const errors: string[] = [];
  for (const set of sets) {
    if (cat.packs.some((p) => p.name === set.name)) errors.push(`"${set.name}" is included twice`);
    cat.packs.push({ name: set.name, version: set.version });
    for (const [name, c] of Object.entries(set.components ?? {})) {
      errors.push(...problems(name, c, set.name));
      if (cat.origin[name]) errors.push(`${set.name}: ${name} is already defined by ${cat.origin[name]}`);
      else {
        cat.components[name] = c;
        cat.origin[name] = set.name;
      }
    }
    for (const [name, a] of Object.entries(set.aliases ?? {})) {
      if (cat.origin[name]) errors.push(`${set.name}: alias ${name} is already defined by ${cat.origin[name]}`);
      else {
        cat.aliases[name] = a;
        cat.origin[name] = set.name;
      }
    }
  }
  for (const [name, c] of Object.entries(cat.components)) {
    if (c.parent && !cat.components[c.parent]) errors.push(`${cat.origin[name]}: ${name}'s parent ${c.parent} doesn't exist`);
    const only = c.content.startsWith("only:") ? c.content.slice(5) : null;
    if (only && !cat.components[only]) errors.push(`${cat.origin[name]}: ${name} holds only ${only}, which doesn't exist`);
  }
  for (const [name, a] of Object.entries(cat.aliases))
    if (a.as !== "group" && !cat.components[a.as]) errors.push(`${cat.origin[name]}: alias ${name} points to ${a.as}, which doesn't exist`);
  if (errors.length) throw new Error(`invalid catalog:\n  ${errors.join("\n  ")}`);
  cat.hash = createHash("sha256")
    .update(JSON.stringify([cat.packs, cat.components, cat.aliases]))
    .digest("hex")
    .slice(0, 12);
  return cat;
}

/** The catalog used when none is given: core only. */
export const defaultCatalog = buildCatalog();

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  format?: string;
  default?: unknown;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  anyOf?: JsonSchema[];
};

/**
 * A component from a JSON Schema of its props, for customers who already
 * describe their components with one (Zod 4: z.toJSONSchema(schema)). Strings,
 * numbers, booleans, string enums, URLs and arrays of strings map across;
 * anything else is reported, since a model can't write it in an attribute.
 */
export function fromJsonSchema(name: string, about: string, schema: JsonSchema, content = "none"): Component {
  const attrs: Record<string, AttrSpec> = {};
  const errors: string[] = [];
  const required = new Set(schema.required ?? []);
  for (const [attr, raw] of Object.entries(schema.properties ?? {})) {
    // Optional values in Zod come out as anyOf [T, null].
    const p = raw.anyOf?.find((s) => s.type !== "null") ?? raw;
    const t = Array.isArray(p.type) ? p.type.find((x) => x !== "null") : p.type;
    let type: string | string[] | undefined;
    if (p.enum && p.enum.every((v) => typeof v === "string")) type = p.enum as string[];
    else if (t === "string") type = p.format === "uri" || p.format === "url" ? "url" : "string";
    else if (t === "number" || t === "integer") type = "number";
    else if (t === "boolean") type = "boolean";
    else if (t === "array" && p.items?.type === "string") type = "list";
    if (!type) {
      errors.push(`${name}.${attr}: ${t ?? "this"} can't be written in an attribute; pass it as content or split it into attributes`);
      continue;
    }
    const spec: { type: string | string[]; required?: boolean; default?: unknown } = { type };
    if (required.has(attr)) spec.required = true;
    if (p.default !== undefined) spec.default = p.default;
    attrs[attr] = Object.keys(spec).length === 1 ? type : spec;
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return { about, attrs, content };
}
