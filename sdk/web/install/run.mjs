// The web SDK installed the way an app installs it (roadmap H4): `npm pack`,
// then a fresh project per case under each package manager and framework,
// built with its own tools and opened in Chrome, where a saved answer must
// stream into the page and draw: its heading, its two stats and its chart,
// with no error. The apps in templates/ are the docs' integration snippets
// (H1), so every snippet there is built and run.
//
//   node sdk/web/build.mjs && node sdk/web/install/run.mjs [case ...]
//
// Projects go to ~/.cache/morphscreen-install (INSTALL_DIR), outside the repo.

import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { launch } from "../browser.mjs";

const here = import.meta.dirname;
const sdk = join(here, "..");
const root = process.env.INSTALL_DIR ?? join(process.env.HOME, ".cache/morphscreen-install");
const require = createRequire(join(process.env.WEB_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web"), "package.json"));
const puppeteer = require("puppeteer-core");
const YARN = ["npx", "-y", "-p", "@yarnpkg/cli-dist@4.18.1", "yarn"];

// Where each template keeps the sample answer, and where its build lands.
const TEMPLATES = {
  vite: { sample: "src/sample.ts", out: "dist" },
  "vite-react": { sample: "src/sample.ts", out: "dist" },
  webpack: { sample: "src/sample.js", out: "dist" },
  next: { sample: "app/sample.ts", serve: "start" },
  angular: { sample: "src/sample.ts", out: "dist/browser" },
  nuxt: { sample: "app/sample.ts", out: ".output/public" },
  sveltekit: { sample: "src/lib/sample.ts", out: "build" },
};

// Every package manager under Vite; every framework under npm (Next.js under pnpm too).
const CASES = [
  ["vite", "npm"],
  ["vite", "pnpm"],
  ["vite", "yarn"],
  ["vite", "yarn-pnp"],
  ["vite", "bun"],
  ["vite-react", "npm"],
  ["webpack", "npm"],
  ["next", "npm"],
  ["next", "pnpm"],
  ["angular", "npm"],
  ["nuxt", "npm"],
  ["sveltekit", "npm"],
];

const only = process.argv.slice(2);
const cases = only.length ? CASES.filter(([t, pm]) => only.includes(`${t}-${pm}`) || only.includes(t)) : CASES;

mkdirSync(root, { recursive: true });
const tgz = join(root, execFileSync("npm", ["pack", "--pack-destination", root, "--silent"], { cwd: sdk, encoding: "utf8" }).trim().split("\n").at(-1));
const sample = readFileSync(join(here, "sample.md"), "utf8");
// Some frameworks need a newer Node than the machine's (Angular CLI 22: 22.22.3 or 24.15).
const NODE = { angular: "24.15.0" };
function nodeBin(version) {
  const dir = join(root, `node-v${version}`);
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const bin = join(dir, `node-v${version}-${os}-${arch}`, "bin");
  if (!existsSync(join(bin, "node"))) {
    mkdirSync(dir, { recursive: true });
    const tgz = join(dir, "node.tar.gz");
    execFileSync("curl", ["-fsSL", "-o", tgz, `https://nodejs.org/dist/v${version}/node-v${version}-${os}-${arch}.tar.gz`]);
    execFileSync("tar", ["-xzf", tgz, "-C", dir]);
  }
  return bin;
}
let PATH_FOR = process.env.PATH;
const run = (cmd, args, cwd, env = {}) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, PATH: PATH_FOR, CI: "1", NEXT_TELEMETRY_DISABLED: "1", NUXT_TELEMETRY_DISABLED: "1", ...env }, maxBuffer: 64 << 20 });

function install(dir, pm) {
  if (pm === "npm") return run("npm", ["install", "--no-audit", "--no-fund"], dir);
  if (pm === "pnpm") return run("pnpm", ["install"], dir);
  if (pm === "bun") return run("bun", ["install"], dir);
  writeFileSync(join(dir, ".yarnrc.yml"), `nodeLinker: ${pm === "yarn-pnp" ? "pnp" : "node-modules"}\nenableTelemetry: false\n`);
  writeFileSync(join(dir, "yarn.lock"), "");
  return run(YARN[0], [...YARN.slice(1), "install"], dir, { YARN_ENABLE_IMMUTABLE_INSTALLS: "false" });
}

function build(dir, pm) {
  if (pm.startsWith("yarn")) return run(YARN[0], [...YARN.slice(1), "run", "build"], dir);
  return run(pm, ["run", "build"], dir);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".json": "application/json" };
function serveDir(dir) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = join(dir, path);
    if (!existsSync(f) || !extname(f)) f = existsSync(join(f, "index.html")) ? join(f, "index.html") : join(dir, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r([`http://127.0.0.1:${server.address().port}/`, () => server.close()])));
}

function serveNext(dir, pm) {
  const port = 4300 + Math.floor(Math.random() * 500);
  const child = spawn(join(dir, "node_modules/.bin/next"), ["start", "-p", String(port)], { cwd: dir, stdio: "ignore", detached: true });
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = () =>
      fetch(`http://127.0.0.1:${port}/`).then(
        () => resolve([`http://127.0.0.1:${port}/`, () => process.kill(-child.pid)]),
        () => (Date.now() - t0 > 30_000 ? reject(new Error("next start didn't answer")) : setTimeout(poll, 300)),
      );
    poll();
  });
}

const browser = await launch(puppeteer);
const problems = [];
const passed = [];
for (const [template, pm] of cases) {
  const name = `${template}-${pm}`;
  const t = TEMPLATES[template];
  const dir = join(root, name);
  const t0 = Date.now();
  try {
    PATH_FOR = NODE[template] ? `${nodeBin(NODE[template])}:${process.env.PATH}` : process.env.PATH;
    rmSync(dir, { recursive: true, force: true });
    cpSync(join(here, "templates", template), dir, { recursive: true });
    writeFileSync(join(dir, t.sample), `export const SAMPLE = ${JSON.stringify(sample)};\n`);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    pkg.dependencies = { ...pkg.dependencies, "@morphscreen/web": `file:${tgz}` };
    writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 2));
    install(dir, pm);
    build(dir, pm);
    const [url, stop] = t.serve === "start" ? await serveNext(dir, pm) : await serveDir(join(dir, t.out));
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
    // A missing file counts unless it's the favicon, which these bare apps don't have.
    page.on("response", (r) => r.status() >= 400 && !r.url().endsWith("/favicon.ico") && errors.push(`${r.status()} ${r.url()}`));
    try {
      await page.goto(url, { waitUntil: "load" });
      // The answer is in once its heading, both stats and the chart are drawn
      // (the templates are the docs' snippets, so they carry no test hooks).
      await page.waitForFunction(() => document.querySelector(".ms-answer h2")?.textContent === "Weekend in Lisbon" && document.querySelectorAll(".ms-answer .ms-stat").length === 2 && !!document.querySelector(".ms-answer .ms-chart svg"), { timeout: 20_000 });
      const drawn = await page.evaluate(() => ({
        heading: document.querySelector(".ms-answer h2")?.textContent ?? "",
        stats: document.querySelectorAll(".ms-answer .ms-stat").length,
        chart: !!document.querySelector(".ms-answer .ms-chart svg"),
        styled: getComputedStyle(document.querySelector(".ms-answer") ?? document.body).getPropertyValue("--ms-ink").trim() !== "",
      }));
      if (drawn.heading !== "Weekend in Lisbon" || drawn.stats !== 2 || !drawn.chart || !drawn.styled) throw new Error(`drew ${JSON.stringify(drawn)}`);
      if (errors.length) throw new Error(`errors: ${errors.join(" | ")}`);
      passed.push(`${name} ${Math.round((Date.now() - t0) / 1000)}s`);
    } finally {
      await page.close();
      stop();
    }
  } catch (e) {
    const said = (e.stderr?.toString() || e.stdout?.toString() || e.message).trim().split("\n").slice(-12).join("\n");
    problems.push(`${name}: ${said}`);
  }
  console.log(problems.at(-1)?.startsWith(name) ? `${name}: failed` : `${name}: ok`);
}
await browser.close();

if (problems.length) {
  console.error(`\n${problems.join("\n\n")}`);
  process.exit(1);
}
console.log(`the web SDK installs, builds and draws in ${passed.length} fresh projects: ${passed.join(", ")}`);
