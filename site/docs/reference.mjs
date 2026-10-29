// The HTTP API's pages, generated from the API's own description
// (rust/api/openapi.json), which tests/contract.rs holds the server to: each
// operation's keys, request fields, responses and an example.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repo } from "../data.mjs";

const spec = JSON.parse(readFileSync(join(repo, "rust/api/openapi.json"), "utf8"));
const ref = (r) => r.split("/").slice(1).reduce((o, k) => o[k], spec);
const resolve = (s) => (s?.$ref ? { ...ref(s.$ref), ...Object.fromEntries(Object.entries(s).filter(([k]) => k !== "$ref")) } : s ?? {});

const OPS = [
  ["/docs/reference/api/chat-completions", "/v1/chat/completions", "post"],
  ["/docs/reference/api/ui", "/v1/ui", "post"],
  ["/docs/reference/api/render", "/v1/render", "post"],
  ["/docs/reference/api/prompt", "/v1/prompt", "post"],
  ["/docs/reference/api/health", "/v1/health", "get"],
];

const EXAMPLES = {
  "/v1/chat/completions": [
    "Stream an answer on the model included in your plan:",
    "```bash title=\"Terminal\"",
    'curl https://api.morphscreen.com/v1/chat/completions \\',
    '  -H "X-MorphScreen-Key: $MORPHSCREEN_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"model": "deepseek/deepseek-v4.1-flash", "stream": true,`,
    `       "messages": [{"role": "user", "content": "Plan a weekend in Lisbon"}],`,
    `       "morphscreen": {"packs": ["data"]}}'`,
    "```",
    "",
    "Any other model on OpenRouter runs on your own key, sent as `Authorization: Bearer sk-or-...`. The stream is OpenAI's: `chat.completion.chunk` events whose `delta.content` is the answer in our format, then a last chunk with `finish_reason` and a `morphscreen` field holding the core's verdict on the answer to draw (and the repaired text, when a repair was needed), then `data: [DONE]`. When the answer needs a repair, a chunk whose `morphscreen` is `{\"repairing\": {\"errors\": n}}` comes between the text and the last chunk, so a page can say a fix is on its way. Each chunk names the model that answered and, when OpenRouter says, the `provider` that served it.",
  ],
  "/v1/ui": [
    "An AG-UI run, which `connectAgent` sends for you; the model and the options go in `forwardedProps`:",
    "```bash title=\"Terminal\"",
    'curl -N https://api.morphscreen.com/v1/ui \\',
    '  -H "X-MorphScreen-Key: $MORPHSCREEN_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"threadId": "t1", "runId": "r1", "tools": [], "context": [], "state": {},`,
    `       "messages": [{"id": "m1", "role": "user", "content": "Quiz me on photosynthesis"}],`,
    `       "forwardedProps": {"model": "deepseek/deepseek-v4.1-flash", "packs": ["interactive"]}}'`,
    "```",
  ],
  "/v1/render": [
    "Draw an answer you already have as HTML, with no model called:",
    "```bash title=\"Terminal\"",
    'curl https://api.morphscreen.com/v1/render \\',
    '  -H "X-MorphScreen-Key: $MORPHSCREEN_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"text": "## Budget\\n\\n<Stat label=\\"Per day\\" value=\\"$165\\" />\\n"}'`,
    "```",
    "",
    "The HTML needs no JavaScript and no style attributes, so it passes a strict content security policy. Load `morphscreen.css` from the web SDK on the page that shows it ([HTML without JavaScript](/docs/integrations/html)).",
  ],
  "/v1/prompt": [
    "MorphScreen's system prompt for some packs, for an agent that runs its own model:",
    "```bash title=\"Terminal\"",
    'curl https://api.morphscreen.com/v1/prompt \\',
    '  -H "X-MorphScreen-Key: $MORPHSCREEN_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"packs": ["data"]}'`,
    "```",
    "",
    "It answers `{\"prompt\": \"...\"}`, the text the web SDK's `core.prompt(packs)` gives. Send it as your model's first system message ([The system prompt](/docs/format/system-prompt)). It isn't counted as a call or a render.",
  ],
  "/v1/health": ["```bash title=\"Terminal\"", "curl https://api.morphscreen.com/v1/health", "```"],
};

// What a request costs, where it isn't a call on the plan.
const COUNTED = { "/v1/render": "counted as a render, apart from calls, within its fair-use limit.", "/v1/prompt": "it isn't counted." };

// A shape written out inline: `false`, `{"pexels"}`, `{"unsplash": {"key", "app"}}`.
const shape = (s) => {
  s = resolve(s);
  if ("const" in s) return JSON.stringify(s.const);
  if (!s.properties) return typeOf(s);
  return `{${Object.entries(s.properties).map(([k, v]) => (resolve(v).properties ? `"${k}": ${shape(v)}` : `"${k}"`)).join(", ")}}`;
};

const typeOf = (s) => {
  s = resolve(s);
  if (s.oneOf) return s.oneOf.map((v) => `\`${shape(v)}\``).join(" or ");
  if (Array.isArray(s.type)) return s.type.join(" or ");
  if (s.type === "array") return `list of ${typeOf(s.items ?? {})}`;
  if (s.enum) return s.enum.map((v) => `\`${v}\``).join(", ");
  return s.type ?? (s.properties ? "object" : "any");
};

// An image written in our format, in a description, is shown as code, not drawn.
const literal = (t = "") => t.replace(/!\[[^\]]*\]\([^)]*\)/g, (m) => `\`${m}\``);

// A description for a table cell: its pipes escaped, and ids (deepseek/deepseek-v4.1-flash) kept on one line.
const clean = (t = "") =>
  literal(t)
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .replace(/(^|\s)([A-Za-z0-9_.]+[-/][A-Za-z0-9_./-]*[A-Za-z0-9])/g, (_, s, w) => `${s}<span class="nb">${w}</span>`);

/** A schema's fields as a table, and the objects inside it after, once each. */
function fields(name, s, seen = new Set()) {
  s = resolve(s);
  const out = [];
  if (!s.properties) return out;
  const req = new Set(s.required ?? []);
  out.push(`### ${name}`, "", s.description ? `${literal(s.description)}\n` : "", "| Field | Type | Required | What it is |", "|---|---|---|---|");
  const nested = [];
  for (const [k, v] of Object.entries(s.properties)) {
    const r = resolve(v);
    const items = r.type === "array" ? resolve(r.items ?? {}) : null;
    out.push(`| \`${k}\` | ${typeOf(v)} | ${req.has(k) ? "yes" : ""} | ${clean(v.description ?? r.description ?? "")}${r.default !== undefined ? ` Default \`${JSON.stringify(r.default)}\`.` : ""}${r.maxItems !== undefined ? ` At most ${r.maxItems}.` : ""} |`);
    const child = r.properties ? r : items?.properties ? items : null;
    const label = v.$ref?.split("/").pop() ?? (items && r.items?.$ref?.split("/").pop()) ?? k;
    if (child && !seen.has(label)) {
      seen.add(label);
      nested.push([label, child]);
    }
  }
  out.push("");
  for (const [label, child] of nested) out.push(...fields(label, child, seen));
  return out;
}

export function referencePages() {
  return OPS.map(([path, route, method]) => {
    const op = spec.paths[route][method];
    const schemes = new Set((op.security ?? []).flatMap((alt) => Object.keys(alt)));
    const keys = !schemes.size
      ? "None."
      : `Your MorphScreen key in \`X-MorphScreen-Key\`: ${COUNTED[route] ?? "the call counts against your plan."}${schemes.has("openRouterKey") ? " Your own OpenRouter key in `Authorization: Bearer sk-or-...` when you want a model other than the one in your plan: it runs on that key, and goes to OpenRouter and nowhere else. Leave it out to use the model in your plan." : ""}`;
    const md = [
      literal(op.description),
      "",
      "## Keys",
      "",
      keys,
      "",
      "## Example",
      "",
      ...(EXAMPLES[route] ?? []),
      "",
    ];
    const body = op.requestBody?.content?.["application/json"]?.schema;
    if (body) md.push("## Request", "", ...fields(body.$ref?.split("/").pop() ?? "Body", body));
    md.push("## Responses", "", "| Status | What comes back |", "|---|---|");
    for (const [status, r] of Object.entries(op.responses)) md.push(`| ${status} | ${clean(resolve(r).description)} |`);
    md.push("", "Errors come back as `{\"error\": {\"code\", \"message\", \"type\", \"metadata\": {\"error_type\", \"reason\"}}}`: `type` is the reason to act on (`rate_limited`, `plan_quota_reached`...). [Limits and errors](/docs/production/limits) says what to do about each.");
    return { path, title: `${method.toUpperCase()} ${route}`, description: op.summary.replace(/\.$/, "") + ".", md: md.join("\n") };
  });
}
