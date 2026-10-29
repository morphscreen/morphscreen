// The web SDK's bill of materials and its licence check (roadmap H6): every
// third-party piece inside @morphscreen/web, which is the JavaScript esbuild
// bundled (sdk/web/.build-inputs.json, written by sdk/web/build.mjs), the
// Rust crates compiled into the WASM cores, the fonts and the icons. Each
// must be under a licence on the list below and credited in
// THIRD_PARTY_NOTICES.md. Writes sdk/web/dist/sbom.cdx.json (CycloneDX 1.6),
// which ships in the package.
//
//   node sdk/web/build.mjs && node tools/sbom.mjs

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const repo = join(import.meta.dirname, "..");
const tools = process.env.WEB_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const notices = readFileSync(join(repo, "THIRD_PARTY_NOTICES.md"), "utf8");
const sdk = JSON.parse(readFileSync(join(repo, "sdk/web/package.json"), "utf8"));

// Licences a piece of the SDK may be under: permissive, compatible with any licence the SDK takes.
const ALLOWED = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Zlib", "OFL-1.1", "Unicode-3.0", "CC0-1.0"]);

// The heading in THIRD_PARTY_NOTICES.md that credits a piece, by package.
const CREDITED_AS = { motion: "Motion", "framer-motion": "Motion", "motion-dom": "Motion", "motion-utils": "Motion", libm: "libm", "@fontsource-variable/ibm-plex-sans": "IBM Plex", "@fontsource/ibm-plex-mono": "IBM Plex", "@phosphor-icons/core": "Phosphor Icons" };

const components = [];
const add = (c) => components.find((x) => x.name === c.name && x.version === c.version) || components.push(c);

// JavaScript bundled into dist/*.js.
const inputs = JSON.parse(readFileSync(join(repo, "sdk/web/.build-inputs.json"), "utf8"));
for (const input of inputs) {
  const m = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  if (!m) continue;
  const at = input.slice(0, input.indexOf(m[0]) + m[0].length);
  const dir = [join(tools, at.replace(/^.*?node_modules\//, "node_modules/")), join(repo, "sdk/web", at)].find((d) => existsSync(join(d, "package.json")));
  if (!dir) throw new Error(`can't find the package behind ${input}`);
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  add({ type: "library", name: pkg.name, version: pkg.version, license: pkg.license, purl: `pkg:npm/${pkg.name.replace("@", "%40")}@${pkg.version}`, part: "dist/index.js" });
}

// Rust crates compiled into the WASM cores (morphscreen-ffi, built for wasm32).
const meta = JSON.parse(execFileSync("cargo", ["metadata", "--format-version", "1", "--filter-platform", "wasm32-unknown-unknown"], { cwd: join(repo, "rust"), maxBuffer: 64 << 20 }).toString());
const byId = new Map(meta.packages.map((p) => [p.id, p]));
const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
const seen = new Set();
const walk = (id) => {
  if (seen.has(id)) return;
  seen.add(id);
  const node = nodes.get(id);
  for (const d of node.deps) if (d.dep_kinds.some((k) => k.kind === null)) walk(d.pkg);
};
walk(meta.packages.find((p) => p.name === "morphscreen-ffi").id);
for (const id of seen) {
  const p = byId.get(id);
  if (!p.source) continue; // our own crates
  add({ type: "library", name: p.name, version: p.version, license: p.license, purl: `pkg:cargo/${p.name}@${p.version}`, part: "dist/*.wasm" });
}

// Fonts and icons.
for (const name of ["@fontsource-variable/ibm-plex-sans", "@fontsource/ibm-plex-mono"]) {
  const pkg = JSON.parse(readFileSync(join(tools, "node_modules", name, "package.json"), "utf8"));
  add({ type: "file", name, version: pkg.version, license: pkg.license, purl: `pkg:npm/${name.replace("@", "%40")}@${pkg.version}`, part: "dist/fonts" });
}
add({ type: "library", name: "@phosphor-icons/core", version: "2.1.1", license: "MIT", purl: "pkg:npm/%40phosphor-icons/core@2.1.1", part: "dist/*.wasm (icon paths)" });

// The check.
const problems = [];
for (const c of components) {
  const spdx = String(c.license ?? "").replace(/^\((.*)\)$/, "$1");
  const ok = spdx.split(/\s+OR\s+/).some((l) => ALLOWED.has(l.trim())) || spdx.split(/\s+AND\s+/).every((l) => ALLOWED.has(l.trim()));
  if (!ok) problems.push(`${c.name} ${c.version}: licence "${c.license}" isn't on the allowed list`);
  const heading = CREDITED_AS[c.name];
  if (!heading) problems.push(`${c.name} ${c.version}: no notice named for it in tools/sbom.mjs (CREDITED_AS) or THIRD_PARTY_NOTICES.md`);
  else if (!notices.includes(`## ${heading}`)) problems.push(`${c.name}: THIRD_PARTY_NOTICES.md has no "## ${heading}"`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const sha = (f) => createHash("sha256").update(readFileSync(join(repo, "sdk/web/dist", f))).digest("hex");
const bom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: { type: "library", name: sdk.name, version: sdk.version, purl: `pkg:npm/%40morphscreen/web@${sdk.version}`, licenses: [{ expression: "Apache-2.0" }], hashes: ["index.js", "morphscreen.wasm", "morphscreen-agent.wasm", "morphscreen.css"].map((f) => ({ alg: "SHA-256", content: sha(f), name: f })).map(({ alg, content }) => ({ alg, content })) },
    tools: { components: [{ type: "application", name: "tools/sbom.mjs" }] },
  },
  components: components.map((c) => ({ type: c.type, name: c.name, version: c.version, purl: c.purl, licenses: [{ expression: c.license }], properties: [{ name: "morphscreen:part", value: c.part }] })),
};
writeFileSync(join(repo, "sdk/web/dist/sbom.cdx.json"), JSON.stringify(bom, null, 2) + "\n");
console.log(`sdk/web/dist/sbom.cdx.json: ${components.length} components, every one under an allowed licence and credited in THIRD_PARTY_NOTICES.md (${components.map((c) => `${c.name} ${c.version}`).join(", ")})`);
