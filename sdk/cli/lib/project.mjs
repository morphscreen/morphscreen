// What kind of app a folder holds: its framework, router, language, package
// manager and where MorphScreen's pieces go. Read from its files only.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** The app in `dir`, or why it isn't one we can set up. */
export function project(dir) {
  const pkg = readJson(join(dir, "package.json"));
  if (!pkg) return { dir, error: "no package.json here: run this in your app's folder" };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const typescript = existsSync(join(dir, "tsconfig.json"));
  const manager = existsSync(join(dir, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(dir, "yarn.lock")) ? "yarn" : existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock")) ? "bun" : "npm";
  const base = { dir, pkg, deps, typescript, manager };
  if (deps.next) {
    const app = ["app", "src/app"].find((a) => existsSync(join(dir, a)));
    if (!app) return { ...base, framework: "next", router: "pages", error: "this Next.js app uses the pages router: init sets up the App Router for now. The guide for either: https://morphscreen.com/docs/integrations/nextjs" };
    return { ...base, framework: "next", router: "app", app };
  }
  if (deps.vite) return { ...base, framework: "vite", error: "a Vite app: init sets up Next.js for now. Vite with a small server of your own: https://morphscreen.com/docs/guides/generative-ui-react" };
  for (const [dep, name, guide] of [
    ["nuxt", "Nuxt", "vue"],
    ["vue", "Vue", "vue"],
    ["@sveltejs/kit", "SvelteKit", "svelte"],
    ["svelte", "Svelte", "svelte"],
    ["@angular/core", "Angular", "angular"],
    ["react", "React", "react"],
  ]) {
    if (deps[dep]) return { ...base, framework: dep, error: `a ${name} app: init sets up Next.js for now. The ${name} guide: https://morphscreen.com/docs/integrations/${guide}` };
  }
  return { ...base, framework: null, error: "no framework init knows (Next.js with the App Router). Any page can use the SDK: https://morphscreen.com/docs/quickstart" };
}

/** The installed @morphscreen/web's version, or null. */
export function sdkVersion(dir) {
  return readJson(join(dir, "node_modules/@morphscreen/web/package.json"))?.version ?? null;
}

/** KEY=value lines of an env file, as an object (no expansion, no quotes kept). */
export function envFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}
