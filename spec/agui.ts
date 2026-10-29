// AG-UI 1.0's schema (spec/agui/schema.json, the protocol's frozen copy) as
// the core's table, so the core judges every event against the protocol's own
// definition. Run it after updating the schema; test/agui.test.ts fails while
// the file is stale.
//   node spec/agui.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const out = join(here, "../rust/core/src/agui/schema.rs");
const schema = JSON.parse(readFileSync(join(here, "agui/schema.json"), "utf8"));
const defs: Record<string, any> = schema.$defs;
const refName = (r: string) => r.split("/").pop()!;

// Definitions that are a plain type in disguise are written inline.
const isAlias = (name: string) => !(defs[name].oneOf || defs[name].properties || defs[name].allOf);
function alias(name: string): string | undefined {
  return isAlias(name) ? ty(defs[name]) : undefined;
}

/** The table's type for a property's schema. */
function ty(p: any): string {
  if (p.$ref) {
    const name = refName(p.$ref);
    const inline = alias(name);
    if (inline !== undefined) return p.not ? (inline === "Any" ? "AnyNonNull" : inline) : inline;
    return `Def(${index(name)})`;
  }
  if (p.const !== undefined) return `Const(${JSON.stringify(p.const)})`;
  if (p.enum) return `Enum(&[${p.enum.map((v: string) => JSON.stringify(v)).join(", ")}])`;
  if (p.oneOf) return `Either(&[${p.oneOf.map(ty).join(", ")}])`;
  if (p.not) return "AnyNonNull";
  switch (p.type) {
    case "string":
      return p.pattern ? "Pointer" : "Str";
    case "integer":
      return `Int(${p.minimum ?? 0}i64)`;
    case "boolean":
      return "Bool";
    case "array":
      return `Arr(&${ty(p.items ?? {})})`;
    case "object":
      if (p.properties) throw new Error("an inline object with properties");
      return "OpenObj";
    case undefined:
      return "Any";
  }
  throw new Error(`no table type for ${JSON.stringify(p)}`);
}

// The definitions an event or a run input can reach, in the schema's order;
// mixins are folded into the definitions that compose them.
const reached = new Set<string>();
const walk = (x: any) => {
  if (Array.isArray(x)) return x.forEach(walk);
  if (!x || typeof x !== "object") return;
  if (typeof x.$ref === "string" && !reached.has(refName(x.$ref))) {
    reached.add(refName(x.$ref));
    walk(defs[refName(x.$ref)]);
  }
  Object.values(x).forEach(walk);
};
walk({ $ref: "#/$defs/Event" });
walk({ $ref: "#/$defs/RunAgentInput" });
const shaped = Object.keys(defs).filter((n) => reached.has(n) && !isAlias(n) && !["BaseEvent", "Attributable", "BaseMessage"].includes(n));
const index = (n: string) => {
  const i = shaped.indexOf(n);
  if (i < 0) throw new Error(`unknown definition ${n}`);
  return i;
};

function fields(d: any): { props: Record<string, any>; req: Set<string> } {
  const props: Record<string, any> = {};
  const req = new Set<string>();
  for (const part of d.allOf ?? []) {
    const f = fields(defs[refName(part.$ref)]);
    Object.assign(props, f.props);
    f.req.forEach((r) => req.add(r));
  }
  Object.assign(props, d.properties ?? {});
  (d.required ?? []).forEach((r: string) => req.add(r));
  return { props, req };
}

const lines: string[] = [];
for (const name of shaped) {
  const d = defs[name];
  if (d.oneOf) {
    const arms = d.oneOf.map((o: any) => refName(o.$ref));
    // The discriminator: the property every arm fixes to its own constant.
    const tags = Object.keys(fields(defs[arms[0]]).props).filter((k) => arms.every((a: string) => fields(defs[a]).props[k]?.const !== undefined));
    if (tags.length !== 1) throw new Error(`${name}: no single discriminator`);
    const tag = tags[0];
    lines.push(`    // ${index(name)}\n    Union { name: "${name}", tag: "${tag}", arms: &[${arms.map((a: string) => `(${JSON.stringify(fields(defs[a]).props[tag].const)}, ${index(a)})`).join(", ")}] },`);
    continue;
  }
  const { props, req } = fields(d);
  const closed = d.unevaluatedProperties === false || d.additionalProperties === false;
  const body = Object.entries(props)
    .map(([k, p]) => `        Field { name: "${k}", ty: ${ty(p)}, req: ${req.has(k)} },`)
    .join("\n");
  lines.push(`    // ${index(name)}\n    Obj { name: "${name}", closed: ${closed}, fields: &[\n${body}\n    ] },`);
}

export const source = `// AG-UI 1.0's schema as a table. Generated from spec/agui/schema.json by
// spec/agui.ts; don't edit.

use super::strip::Def::{self, *};
use super::strip::Field;
use super::strip::Ty::*;

/** An event (the union of every event type). */
pub const EVENT: usize = ${index("Event")};
/** RunAgentInput, the request body. */
pub const RUN_AGENT_INPUT: usize = ${index("RunAgentInput")};
/** Message, any role. */
pub const MESSAGE: usize = ${index("Message")};

pub static DEFS: &[Def] = &[
${lines.join("\n")}
];
`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(out, source);
  console.log("wrote rust/core/src/agui/schema.rs");
}
