// init and doctor on apps made up in a temporary folder. Nothing is
// installed and nothing goes over the network: doctor's calls go to a
// stand-in fetch. tools/init-e2e.mjs runs init on a real Next.js app, builds
// it and has Chrome draw an answer.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { doctor } from "../lib/doctor.mjs";
import { init } from "../lib/init.mjs";

const bin = join(import.meta.dirname, "../bin/morphscreen.mjs");
const KEY = `ms_live_${"ab".repeat(24)}`;

function app(files) {
  const dir = mkdtempSync(join(tmpdir(), "morphscreen-cli-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const nextApp = (extra = {}) =>
  app({
    "package.json": JSON.stringify({ name: "shop", scripts: { dev: "next dev", build: "next build", start: "next start" }, dependencies: { next: "16.4.1", react: "19.3.1" } }, null, 2) + "\n",
    "app/page.tsx": "export default function Page() { return null; }\n",
    ".gitignore": "node_modules\n.next",
    ...extra,
  });

/** A stand-in for an installed @morphscreen/web. */
function installed(dir, version = "0.1.2") {
  mkdirSync(join(dir, "node_modules/@morphscreen/web/dist"), { recursive: true });
  writeFileSync(join(dir, "node_modules/@morphscreen/web/package.json"), JSON.stringify({ name: "@morphscreen/web", version, exports: { "./morphscreen-agent.wasm": "./dist/morphscreen-agent.wasm" } }));
  writeFileSync(join(dir, "node_modules/@morphscreen/web/dist/morphscreen-agent.wasm"), "\0asm core");
}

test("init sets a TypeScript App Router app up, and a second run changes nothing", () => {
  const dir = nextApp({ "tsconfig.json": "{}" });
  installed(dir);
  const r = init(dir, { install: false });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.page, "/morphscreen");
  const route = readFileSync(join(dir, "app/api/morphscreen/route.ts"), "utf8");
  assert.match(route, /export async function POST\(req: Request\)/);
  assert.match(route, /X-MorphScreen-Key": process\.env\.MORPHSCREEN_KEY/);
  assert.match(route, /signal: req\.signal/);
  const chat = readFileSync(join(dir, "app/morphscreen/chat.tsx"), "utf8");
  assert.match(chat, /^"use client";/);
  assert.match(chat, /loadCore\("\/morphscreen-agent\.wasm"\)/);
  assert.match(chat, /let live: Conversation \| undefined;/);
  assert.match(readFileSync(join(dir, "app/morphscreen/page.tsx"), "utf8"), /^import "@morphscreen\/web\/morphscreen\.css";/, "the answers' styles");
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  assert.equal(pkg.scripts.dev, "node scripts/copy-morphscreen-core.mjs && next dev");
  assert.equal(pkg.scripts.build, "node scripts/copy-morphscreen-core.mjs && next build");
  assert.equal(pkg.scripts.start, "next start");
  assert.match(readFileSync(join(dir, ".env.local"), "utf8"), /^MORPHSCREEN_KEY=$/m);
  assert.equal(readFileSync(join(dir, ".gitignore"), "utf8"), "node_modules\n.next\n# MorphScreen's core, copied from node_modules before dev and build\npublic/morphscreen-agent.wasm\n");
  assert.equal(readFileSync(join(dir, "public/morphscreen-agent.wasm"), "utf8"), "\0asm core", "the core copied once now");

  writeFileSync(join(dir, "app/morphscreen/chat.tsx"), "// mine\n");
  const again = init(dir, { install: false });
  assert.deepEqual(again.steps.filter((s) => s.status === "written").map((s) => s.what), ["public/morphscreen-agent.wasm"], "only the core copied again");
  assert.equal(readFileSync(join(dir, "app/morphscreen/chat.tsx"), "utf8"), "// mine\n", "a file of the app's is never overwritten");
  assert.equal(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts.dev, "node scripts/copy-morphscreen-core.mjs && next dev");
  assert.equal(readFileSync(join(dir, ".env.local"), "utf8").match(/MORPHSCREEN_KEY=/g).length, 1);
});

test("in JavaScript the files carry no types, and src/app is found", () => {
  const dir = app({ "package.json": JSON.stringify({ dependencies: { next: "16.4.1" } }), "src/app/page.jsx": "" });
  const r = init(dir, { install: false });
  assert.equal(r.ok, true);
  const chat = readFileSync(join(dir, "src/app/morphscreen/chat.jsx"), "utf8");
  assert.doesNotMatch(chat, /: React\.FormEvent|as HTMLInputElement|<Conversation|current!|type Conversation/);
  assert.match(readFileSync(join(dir, "src/app/api/morphscreen/route.js"), "utf8"), /export async function POST\(req\)/);
  // With no dev or build of its own, Next's are written.
  assert.equal(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts.dev, "node scripts/copy-morphscreen-core.mjs && next dev");
});

test("what init doesn't set up yet, it says, and writes nothing", () => {
  const pages = app({ "package.json": JSON.stringify({ dependencies: { next: "15.0.0" } }), "pages/index.tsx": "" });
  const r = init(pages, { install: false });
  assert.equal(r.ok, false);
  assert.match(r.error, /pages router/);
  assert.ok(!existsSync(join(pages, ".env.local")));
  const vite = app({ "package.json": JSON.stringify({ devDependencies: { vite: "7.0.0" }, dependencies: { react: "19.0.0" } }) });
  assert.match(init(vite, { install: false }).error, /Vite/);
  const svelte = app({ "package.json": JSON.stringify({ devDependencies: { "@sveltejs/kit": "2.0.0", svelte: "5.0.0" } }) });
  assert.match(init(svelte, { install: false }).error, /SvelteKit guide: https:\/\/morphscreen\.com\/docs\/integrations\/svelte/);
  assert.match(init(mkdtempSync(join(tmpdir(), "empty-")), { install: false }).error, /no package\.json/);
});

test("doctor finds each problem with its fix, offline", async () => {
  const dir = nextApp({ "tsconfig.json": "{}" });
  let r = await doctor(dir, { offline: true, env: {} });
  const by = (id) => r.checks.find((c) => c.id === id);
  assert.equal(r.ok, false);
  assert.equal(by("framework").status, "ok");
  assert.equal(by("sdk").status, "fail");
  assert.equal(by("route").status, "fail");
  assert.equal(by("key").status, "fail");
  assert.equal(by("styles").status, "fail");

  installed(dir);
  init(dir, { install: false });
  writeFileSync(join(dir, ".env.local"), `MORPHSCREEN_KEY=${KEY}\n`);
  r = await doctor(dir, { offline: true, env: {} });
  assert.equal(r.ok, true, JSON.stringify(r.checks.filter((c) => c.status !== "ok")));
  assert.equal(by("core").status, "ok");

  writeFileSync(join(dir, "public/morphscreen-agent.wasm"), "an older core");
  writeFileSync(join(dir, ".env.local"), "NEXT_PUBLIC_MORPHSCREEN_KEY=ms_live_x\nMORPHSCREEN_KEY=sk-or-v1-wrong\n");
  writeFileSync(join(dir, "next.config.mjs"), `export default { headers: async () => [{ source: "/(.*)", headers: [{ key: "Content-Security-Policy", value: "script-src 'self'" }] }] };\n`);
  writeFileSync(join(dir, "app/morphscreen/page.tsx"), "export default function Page() { return null; }\n");
  writeFileSync(join(dir, "app/morphscreen/other.tsx"), `"use client";\nimport { loadCore } from "@morphscreen/web";\nloadCore("/morphscreen.wasm");\nfetch("/x", { headers: { "X-MorphScreen-Key": process.env.MORPHSCREEN_KEY } });\n`);
  r = await doctor(dir, { offline: true, env: {} });
  for (const id of ["core", "core-kind", "key", "key-public", "csp", "key-in-browser", "styles"]) assert.equal(by(id)?.status, "fail", `${id}: ${JSON.stringify(r.checks)}`);
  assert.ok(r.checks.filter((c) => c.status === "fail").every((c) => c.fix), "every failure says how to fix it");
});

test("doctor online: the API up, the key checked with a free render, the SDK against npm's latest", async () => {
  const dir = nextApp();
  installed(dir, "0.1.1");
  init(dir, { install: false });
  const seen = [];
  const stand = (status) => async (url, opts) => {
    seen.push([url, opts?.headers?.["X-MorphScreen-Key"]]);
    if (url.includes("registry.npmjs.org")) return new Response(JSON.stringify({ version: "0.1.2" }), { status: 200 });
    if (url.endsWith("/health")) return new Response("ok", { status: 200 });
    return new Response("{}", { status });
  };
  let r = await doctor(dir, { env: { MORPHSCREEN_KEY: KEY }, fetchImpl: stand(401) });
  assert.equal(r.checks.find((c) => c.id === "key-valid").status, "fail");
  assert.equal(r.checks.find((c) => c.id === "sdk").status, "warn");
  assert.match(r.checks.find((c) => c.id === "sdk").fix, /@morphscreen\/web@0\.1\.2/);
  assert.deepEqual(seen.find(([u]) => u.endsWith("/render")), ["https://api.morphscreen.com/v1/render", KEY]);
  r = await doctor(dir, { env: { MORPHSCREEN_KEY: KEY }, fetchImpl: stand(200) });
  assert.equal(r.checks.find((c) => c.id === "key-valid").status, "ok");
});

test("the command: help, JSON for agents, and its exit codes", () => {
  const dir = nextApp({ "tsconfig.json": "{}" });
  const out = JSON.parse(execFileSync(process.execPath, [bin, "init", "--no-install", "--json"], { cwd: dir, encoding: "utf8" }));
  assert.equal(out.ok, true);
  assert.ok(out.steps.some((s) => s.what === "app/api/morphscreen/route.ts"));
  let code = 0;
  try {
    execFileSync(process.execPath, [bin, "doctor", "--offline", "--json"], { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH } });
  } catch (e) {
    code = e.status;
    assert.equal(JSON.parse(e.stdout).ok, false);
  }
  assert.equal(code, 1, "doctor fails with no SDK and no key");
  assert.match(execFileSync(process.execPath, [bin, "--help"], { encoding: "utf8" }), /npx morphscreen init/);
});
