// The API reference (docs/api.md), written from the API's description
// (rust/api/openapi.json) so the two can't drift: every operation, its
// request, its responses, and every schema. The docs site (roadmap H1) shows
// this file; --check fails when it no longer matches the description.
//   node tools/api-reference.mjs [--check]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(join(repo, "rust/api/openapi.json"), "utf8"));
const out = join(repo, "docs/api.md");

const name = (ref) => ref.split("/").pop();
const anchor = (n) => n.toLowerCase();
const link = (ref) => `[${name(ref)}](#${anchor(name(ref))})`;
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");

/** A schema's type in a few words, its references linked. */
function type(s) {
  if (!s || !Object.keys(s).length) return "any";
  if (s.$ref) return link(s.$ref);
  if (s.oneOf) return s.oneOf.map(type).join(" or ");
  if (s.enum) return s.enum.map((v) => (v === null ? "null" : `\`${v}\``)).join(", ");
  const t = [].concat(s.type ?? []).join(" or ");
  if (t === "array" && s.items) return `array of ${type(s.items)}`;
  return t || "any";
}

/** A table of an object schema's fields. */
function fields(s) {
  const props = Object.entries(s.properties ?? {});
  if (!props.length) return "";
  const required = new Set(s.required ?? []);
  const rows = props.map(([k, v]) => `| \`${k}\` | ${cell(type(v))} | ${required.has(k) ? "yes" : ""} | ${cell(v.description ?? (v.$ref ? "" : v.default !== undefined ? `Default ${JSON.stringify(v.default)}.` : ""))} |`);
  return ["| Field | Type | Required | What it is |", "|---|---|---|---|", ...rows].join("\n");
}

const lines = [
  "<!-- Written by tools/api-reference.mjs from rust/api/openapi.json; edit those, not this. -->",
  "",
  `# ${spec.info.title} reference`,
  "",
  `Version ${spec.info.version}, at ${spec.servers.map((s) => s.url).join(", ")}. The description itself is served at \`GET /v1/openapi.json\`.`,
  "",
  spec.info.description,
  "",
  "## Keys",
  "",
  ...Object.entries(spec.components.securitySchemes).map(([k, v]) => `- \`${v.in === "header" ? v.name : "Authorization: Bearer ..."}\` (${k}): ${v.description}`),
  "",
  "## Operations",
];
for (const [path, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    lines.push("", `### ${method.toUpperCase()} ${path}`, "", `${op.summary}.`);
    // Each alternative is the keys sent together: [{a, b}, {b}] reads "a and b, or b".
    const keys = (op.security ?? []).map((s) => Object.keys(s).map((k) => `\`${k}\``).join(" and ")).filter(Boolean);
    if (keys.length) lines.push("", `Keys: ${keys.join(", or ")}.`);
    if (op.parameters?.length) {
      lines.push("", "| Parameter | In | Type | What it is |", "|---|---|---|---|", ...op.parameters.map((p) => `| \`${p.name}\` | ${p.in} | ${cell(type(p.schema))} | ${cell(p.description)} |`));
    }
    const body = op.requestBody?.content?.["application/json"]?.schema;
    if (body) lines.push("", `Body: ${type(body)}.`);
    lines.push("", "| Status | What comes back |", "|---|---|");
    for (const [status, r0] of Object.entries(op.responses)) {
      const r = r0.$ref ? spec.components.responses[name(r0.$ref)] : r0;
      const kinds = Object.entries(r.content ?? {}).map(([k, c]) => (k === "text/event-stream" ? `events, each ${type(c["x-event-schema"])}` : c.schema && type(c.schema) !== "string" ? type(c.schema) : k));
      lines.push(`| ${status} | ${cell(r.description)}${kinds.length ? ` (${kinds.join("; ")})` : ""} |`);
    }
  }
}
lines.push("", "## Schemas");
for (const [n, s] of Object.entries(spec.components.schemas)) {
  lines.push("", `### ${n}`);
  if (s.description) lines.push("", s.description);
  const f = fields(s);
  lines.push("", f || `${type(s)}.`);
}
const text = lines.join("\n") + "\n";

if (process.argv.includes("--check")) {
  let now = "";
  try {
    now = readFileSync(out, "utf8");
  } catch {}
  if (now !== text) {
    console.error("docs/api.md doesn't match rust/api/openapi.json: run node tools/api-reference.mjs");
    process.exit(1);
  }
  console.log("docs/api.md matches the description");
} else {
  writeFileSync(out, text);
  console.log(`docs/api.md: ${Object.keys(spec.paths).length} paths, ${Object.keys(spec.components.schemas).length} schemas`);
}
