// `morphscreen doctor`: what's set up and what isn't, each with its fix.
// Reads the app's files and environment; online, it also asks the API
// whether it's up and whether the key is one of ours (a render of one line,
// which is free).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { envFile, project, readJson, sdkVersion } from "./project.mjs";

const API = "https://api.morphscreen.com/v1";
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** Every file under `dir` with one of `exts`, skipping dependencies and builds. */
function sources(dir, exts, depth = 0) {
  if (depth > 6 || !existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "dist", "build", "out", ".vercel"].includes(name)) continue;
    const at = join(dir, name);
    const s = statSync(at);
    if (s.isDirectory()) out.push(...sources(at, exts, depth + 1));
    else if (exts.some((e) => name.endsWith(e))) out.push(at);
  }
  return out;
}

export async function doctor(dir, { offline = false, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const checks = [];
  const add = (id, status, message, fix) => checks.push({ id, status, message, ...(fix ? { fix } : {}) });

  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 18) add("node", "ok", `Node.js ${process.versions.node}`);
  else add("node", "fail", `Node.js ${process.versions.node} is too old`, "use Node.js 18 or later");

  const p = project(dir);
  if (!p.pkg) {
    add("project", "fail", p.error, "run this in your app's folder");
    return { ok: false, checks };
  }
  if (p.framework === "next" && p.router === "app") add("framework", "ok", `Next.js with the App Router (${p.app}/), ${p.typescript ? "TypeScript" : "JavaScript"}, ${p.manager}`);
  else add("framework", "warn", p.error ?? "framework not recognised", "the SDK works in any page: https://morphscreen.com/docs/quickstart");

  const version = sdkVersion(dir);
  if (!version) add("sdk", "fail", "@morphscreen/web isn't installed", `${p.manager} ${p.manager === "npm" ? "install" : "add"} @morphscreen/web, or npx morphscreen init`);
  else {
    let latest = null;
    if (!offline) latest = await fetchImpl("https://registry.npmjs.org/@morphscreen/web/latest").then((r) => (r.ok ? r.json() : null)).then((j) => j?.version ?? null, () => null);
    if (latest && latest !== version) add("sdk", "warn", `@morphscreen/web ${version} is installed; ${latest} is out`, `${p.manager} ${p.manager === "npm" ? "install" : "add"} @morphscreen/web@${latest}`);
    else add("sdk", "ok", `@morphscreen/web ${version}${latest ? " (the latest)" : ""}`);
  }

  // The core the page loads: served from public/, the same build as the package's.
  const served = join(dir, "public/morphscreen-agent.wasm");
  const packaged = join(dir, "node_modules/@morphscreen/web/dist/morphscreen-agent.wasm");
  const code = sources(dir, [".ts", ".tsx", ".js", ".jsx", ".mjs"]).filter((f) => !f.includes(`${join(dir, "public")}`));
  const loads = code.filter((f) => /loadCore\(/.test(readFileSync(f, "utf8")));
  if (!existsSync(served)) add("core", loads.length ? "fail" : "warn", "public/morphscreen-agent.wasm isn't there, so loadCore can't fetch it", "run node scripts/copy-morphscreen-core.mjs (dev and build do it after init), or copy it from node_modules/@morphscreen/web/dist/");
  else if (existsSync(packaged) && sha(served) !== sha(packaged)) add("core", "fail", "public/morphscreen-agent.wasm isn't the installed package's build", "copy it again: node scripts/copy-morphscreen-core.mjs");
  else add("core", "ok", "public/morphscreen-agent.wasm matches the package");
  if (loads.some((f) => /loadCore\(\s*["'`][^"'`]*morphscreen\.wasm["'`]/.test(readFileSync(f, "utf8")))) add("core-kind", "fail", "loadCore loads morphscreen.wasm, which has no AG-UI client, but connectAgent needs one", "load morphscreen-agent.wasm instead");

  // The answers' stylesheet: without it they're drawn as bare HTML.
  const styled = sources(dir, [".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".scss"]).some((f) => /@morphscreen\/web\/morphscreen(-page)?\.css|morphscreen\.css/.test(readFileSync(f, "utf8")) && !f.includes("node_modules"));
  if (styled) add("styles", "ok", "the answers' stylesheet is imported");
  else add("styles", "fail", "nothing imports @morphscreen/web/morphscreen.css, so answers are drawn unstyled", 'add import "@morphscreen/web/morphscreen.css"; to app/layout or the page with the chat');

  // The route that keeps the key on the server.
  const routes = code.filter((f) => /api\.morphscreen\.com|MORPHSCREEN_API/.test(readFileSync(f, "utf8")) && /X-MorphScreen-Key/i.test(readFileSync(f, "utf8")));
  if (routes.length) add("route", "ok", `a server route sends the key: ${routes.map((f) => f.slice(dir.length + 1)).join(", ")}`);
  else add("route", "fail", "no server route sends X-MorphScreen-Key to the API", "npx morphscreen init writes one; or see https://morphscreen.com/docs/integrations/nextjs");
  const leaky = code.filter((f) => !routes.includes(f) && /["'`]use client["'`]/.test(readFileSync(f, "utf8")) && /X-MorphScreen-Key|MORPHSCREEN_KEY/.test(readFileSync(f, "utf8")));
  if (leaky.length) add("key-in-browser", "fail", `the key is used in browser code: ${leaky.map((f) => f.slice(dir.length + 1)).join(", ")}`, "send it from a server route only");

  // The key: set for the server, never public.
  const files = Object.assign({}, envFile(join(dir, ".env")), envFile(join(dir, ".env.local")));
  const all = { ...files, ...env };
  const publicKey = Object.keys(all).find((k) => /^(NEXT_PUBLIC_|VITE_|PUBLIC_)/.test(k) && /MORPHSCREEN.*KEY/.test(k));
  if (publicKey) add("key-public", "fail", `${publicKey} would be bundled into the page for anyone to read`, "rename it MORPHSCREEN_KEY and use it in the server route only");
  const key = all.MORPHSCREEN_KEY;
  if (!key) add("key", "fail", "MORPHSCREEN_KEY isn't set (.env.local or the environment)", "get a free key at https://app.morphscreen.com and put it in .env.local");
  else if (!/^ms_live_[0-9a-f]{48}$/.test(key)) add("key", "fail", "MORPHSCREEN_KEY doesn't look like a MorphScreen key (ms_live_ and 48 hex digits)", "copy it again from https://app.morphscreen.com");
  else add("key", "ok", "MORPHSCREEN_KEY is set");

  // A content security policy has to let the core start.
  const config = ["next.config.js", "next.config.mjs", "next.config.ts", "middleware.ts", "middleware.js", "proxy.ts", "proxy.js"].map((f) => join(dir, f)).filter(existsSync);
  const csp = config.find((f) => /Content-Security-Policy/i.test(readFileSync(f, "utf8")));
  if (csp && !/wasm-unsafe-eval/.test(readFileSync(csp, "utf8"))) add("csp", "fail", `${csp.slice(dir.length + 1)} sets a Content-Security-Policy without 'wasm-unsafe-eval', so the core won't start`, "add 'wasm-unsafe-eval' to script-src");
  else if (csp) add("csp", "ok", "the Content-Security-Policy lets WebAssembly run");

  if (!offline) {
    const base = all.MORPHSCREEN_API ?? API;
    const up = await fetchImpl(`${base}/health`).then((r) => r.ok, () => false);
    if (!up) add("api", "fail", `${base} can't be reached from here`, "check the network, or https://status.morphscreen.com");
    else {
      add("api", "ok", `${base} is up`);
      if (key && /^ms_live_/.test(key)) {
        const r = await fetchImpl(`${base}/render`, { method: "POST", headers: { "Content-Type": "application/json", "X-MorphScreen-Key": key }, body: JSON.stringify({ text: "# ok\n", packs: [] }) }).then((r) => r.status, () => 0);
        if (r === 200) add("key-valid", "ok", "the API takes the key");
        else if (r === 401) add("key-valid", "fail", "the API doesn't know this key, or it was revoked", "make a new one at https://app.morphscreen.com");
        else if (r === 403) add("key-valid", "fail", "the account is suspended", "write to support@morphscreen.com");
        else add("key-valid", "warn", `the API answered ${r || "nothing"} to a check of the key`);
      }
    }
  }
  return { ok: !checks.some((c) => c.status === "fail"), checks };
}

export { readJson };
