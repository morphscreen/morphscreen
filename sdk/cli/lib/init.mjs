// `morphscreen init`: MorphScreen in a Next.js App Router app, with nothing
// asked. Installs @morphscreen/web, writes a route, a chat page at
// /morphscreen and the core's copy script, wires the script into dev and
// build, and leaves a place for the key. Never overwrites a file: one that's
// already there is left as it is and said so.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { project } from "./project.mjs";
import { CHAT, COPY_CORE, PAGE, ROUTE, typed } from "./templates.mjs";

const COPY = "node scripts/copy-morphscreen-core.mjs";

/** Sets the app in `dir` up; returns what it did, file by file. */
export function init(dir, { install = true, log = () => {} } = {}) {
  const p = project(dir);
  if (p.error) return { ok: false, framework: p.framework ?? null, error: p.error, steps: [] };
  const steps = [];
  const step = (what, status, detail) => {
    steps.push({ what, status, ...(detail ? { detail } : {}) });
    log(`${status === "written" || status === "done" ? "+" : status === "kept" ? "=" : "!"} ${what}${detail ? `: ${detail}` : ""}`);
  };

  if (install) {
    const args = { npm: ["install", "@morphscreen/web"], pnpm: ["add", "@morphscreen/web"], yarn: ["add", "@morphscreen/web"], bun: ["add", "@morphscreen/web"] }[p.manager];
    log(`${p.manager} ${args.join(" ")}`);
    const r = spawnSync(p.manager, args, { cwd: dir, stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) return { ok: false, framework: "next", error: `${p.manager} ${args.join(" ")} failed`, steps };
    step("@morphscreen/web", "done", "installed");
  }

  const ext = p.typescript ? "ts" : "js";
  const files = [
    [join(p.app, `api/morphscreen/route.${ext}`), typed(ROUTE, p.typescript)],
    [join(p.app, `morphscreen/chat.${ext}x`), typed(CHAT, p.typescript)],
    [join(p.app, `morphscreen/page.${ext}x`), PAGE],
    ["scripts/copy-morphscreen-core.mjs", COPY_CORE],
  ];
  for (const [rel, text] of files) {
    const at = join(dir, rel);
    if (existsSync(at)) {
      step(rel, "kept", "already there");
      continue;
    }
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, text);
    step(rel, "written");
  }

  // The core copied before dev and build (pre-scripts don't run everywhere, pnpm's by default).
  const pkgPath = join(dir, "package.json");
  const raw = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  pkg.scripts ??= {};
  let changed = false;
  for (const s of ["dev", "build"]) {
    const cmd = pkg.scripts[s];
    if (cmd?.includes(COPY)) continue;
    pkg.scripts[s] = cmd ? `${COPY} && ${cmd}` : `${COPY} && next ${s}`;
    changed = true;
  }
  if (changed) {
    const indent = raw.match(/^\{\n([ \t]+)"/)?.[1] ?? "  ";
    writeFileSync(pkgPath, JSON.stringify(pkg, null, indent) + "\n");
    step("package.json", "written", "dev and build copy the core first");
  } else step("package.json", "kept", "dev and build already copy the core");

  // A place for the key, in the env file Next.js keeps out of git.
  const env = join(dir, ".env.local");
  const has = existsSync(env) && /^\s*MORPHSCREEN_KEY\s*=/m.test(readFileSync(env, "utf8"));
  if (has) step(".env.local", "kept", "MORPHSCREEN_KEY already there");
  else {
    const lead = existsSync(env) && !readFileSync(env, "utf8").endsWith("\n") ? "\n" : "";
    appendFileSync(env, `${lead}# MorphScreen: your key, from https://app.morphscreen.com (free, no card). Server only: never NEXT_PUBLIC_.\nMORPHSCREEN_KEY=\n`);
    step(".env.local", "written", "MORPHSCREEN_KEY= is waiting for your key");
  }

  // The copied core is a build output: kept out of git.
  const ignore = join(dir, ".gitignore");
  if (existsSync(ignore) && !readFileSync(ignore, "utf8").includes("morphscreen-agent.wasm")) {
    const lead = readFileSync(ignore, "utf8").endsWith("\n") ? "" : "\n";
    appendFileSync(ignore, `${lead}# MorphScreen's core, copied from node_modules before dev and build\npublic/morphscreen-agent.wasm\n`);
    step(".gitignore", "written", "public/morphscreen-agent.wasm");
  }

  // The core in place now, so the page works before the next build.
  if (existsSync(join(dir, "node_modules/@morphscreen/web"))) {
    const r = spawnSync(process.execPath, ["scripts/copy-morphscreen-core.mjs"], { cwd: dir, encoding: "utf8" });
    if (r.status === 0) step("public/morphscreen-agent.wasm", "written", "copied from the package");
    else step("public/morphscreen-agent.wasm", "failed", r.stderr.trim().split("\n").pop());
  }

  return { ok: !steps.some((s) => s.status === "failed"), framework: "next", router: "app", typescript: p.typescript, manager: p.manager, page: "/morphscreen", steps };
}
