// Builds dist/: the SDK (ESM), the React component, the WASM core and the
// stylesheet. Tools live outside the repo (TOOLS, default ~/.cache/morphscreen-web)
// so node_modules never lands in a synced folder. The versions are pinned in
// sdk/web/tools (the same install CI uses):
//   mkdir -p ~/.cache/morphscreen-web && cp sdk/web/tools/package*.json ~/.cache/morphscreen-web/
//   npm ci --prefix ~/.cache/morphscreen-web && ln -sfn ~/.cache/morphscreen-web/node_modules sdk/web/node_modules
//   node sdk/web/build.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const esbuild = require("esbuild");
const dist = join(here, "dist");
mkdirSync(dist, { recursive: true });

// The WASM core: smallest build, then wasm-opt. Two of them: the core, and
// the core with the AG-UI client (connectAgent) for pages that talk to an agent.
const rust = join(repo, "rust");
for (const [file, features] of [["morphscreen.wasm", ["--no-default-features"]], ["morphscreen-agent.wasm", []]]) {
  execFileSync("cargo", ["build", "-p", "morphscreen-ffi", "--target", "wasm32-unknown-unknown", "--profile", "wasm", ...features], { cwd: rust, stdio: "inherit" });
  execFileSync("wasm-opt", ["-Os", "--enable-bulk-memory", "--enable-nontrapping-float-to-int", "--enable-sign-ext", "--enable-mutable-globals", "-o", join(dist, file), join(rust, "target.nosync/wasm32-unknown-unknown/wasm/morphscreen.wasm")]);
}
// The faces (IBM Plex Sans and Mono, SIL Open Font License) ship in dist/fonts:
// each script's file loads only when an answer uses it, and nothing comes from a
// font host. The fallback faces are the system's Arial and Menlo (or their
// metric twins) sized to Plex's widths, so text barely moves when Plex arrives.
const fonts = join(dist, "fonts");
mkdirSync(fonts, { recursive: true });
const faces = [
  // [package, its CSS, the subsets we ship, our family, weight, style]
  ["@fontsource-variable/ibm-plex-sans", "wght.css", ["latin", "latin-ext", "greek", "cyrillic", "cyrillic-ext", "vietnamese"], "IBM Plex Sans", "100 700", "normal"],
  ["@fontsource-variable/ibm-plex-sans", "wght-italic.css", ["latin", "latin-ext"], "IBM Plex Sans", "100 700", "italic"],
  ["@fontsource/ibm-plex-mono", "400.css", ["latin", "latin-ext"], "IBM Plex Mono", "400", "normal"],
  ["@fontsource/ibm-plex-mono", "600.css", ["latin", "latin-ext"], "IBM Plex Mono", "600", "normal"],
];
let fontCss = "/*! IBM Plex Sans and IBM Plex Mono, (c) IBM Corp., SIL Open Font License 1.1 (fonts/LICENSE). */\n";
for (const [pkg, file, subsets, family, weight, style] of faces) {
  const dir = join(tools, "node_modules", pkg);
  const css = readFileSync(join(dir, file), "utf8");
  for (const block of css.split("@font-face").slice(1)) {
    const subset = block.match(/\/\* [\w-]+?-(latin-ext|latin|greek|cyrillic-ext|cyrillic|vietnamese) \*\//)?.[1] ?? block.match(/files\/[\w-]+?-(latin-ext|latin|greek|cyrillic-ext|cyrillic|vietnamese)-/)?.[1];
    if (!subset || !subsets.includes(subset)) continue;
    const woff2 = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)[1];
    copyFileSync(join(dir, "files", woff2), join(fonts, woff2));
    fontCss += `@font-face { font-family: "${family}"; font-style: ${style}; font-display: swap; font-weight: ${weight}; src: url("fonts/${woff2}") format("woff2"); unicode-range: ${range}; }\n`;
  }
}
copyFileSync(join(tools, "node_modules/@fontsource-variable/ibm-plex-sans/LICENSE"), join(fonts, "LICENSE"));
// The notices for what's in the package (tools/sbom.mjs checks every bundled piece has one),
// out of the repository's THIRD_PARTY_NOTICES.md.
const shipped = ["Phosphor Icons", "Motion", "libm", "IBM Plex", "AG-UI protocol", "Map data", "Photos"];
const notices = readFileSync(join(repo, "THIRD_PARTY_NOTICES.md"), "utf8").split(/^(?=## )/m).filter((s) => shipped.includes(s.slice(3, s.indexOf("\n"))));
if (notices.length !== shipped.length) throw new Error("THIRD_PARTY_NOTICES.md is missing a section the package ships");
writeFileSync(join(dist, "THIRD_PARTY_NOTICES.md"), `# Third-party notices\n\nThe parts of @morphscreen/web made by others, and their licenses.\n\n${notices.join("").trimEnd()}\n`);
fontCss += `@font-face { font-family: "IBM Plex Sans Fallback"; src: local("Arial"), local("Liberation Sans"), local("Arimo"), local("Helvetica"); size-adjust: 100.5%; ascent-override: 102%; descent-override: 27.4%; line-gap-override: 0%; }\n`;
fontCss += `@font-face { font-family: "IBM Plex Mono Fallback"; src: local("Menlo"), local("DejaVu Sans Mono"), local("Courier New"), local("Liberation Mono"); size-adjust: 99.7%; ascent-override: 102.8%; descent-override: 27.6%; line-gap-override: 0%; }\n`;
// The faces, then the tokens (generated from spec/theme.tokens.json), then the theme.
// The comments are notes for this repository, so the package's copy goes
// without them; /*! ones (the fonts' credit) stay.
const bare = (css) => css.replace(/\/\*(?!!)[\s\S]*?\*\/\n?/g, "").replace(/\n{3,}/g, "\n\n");
writeFileSync(join(dist, "morphscreen.css"), bare(fontCss + readFileSync(join(repo, "render/tokens.css"), "utf8") + "\n" + readFileSync(join(repo, "render/theme.css"), "utf8")));
// A page that is one answer (a server-rendered answer, our own pages): its ground and its column.
writeFileSync(join(dist, "morphscreen-page.css"), bare(readFileSync(join(repo, "render/page.css"), "utf8")));

const common = { bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, nodePaths: [join(tools, "node_modules")], logLevel: "warning" };
const metas = [];
metas.push((await esbuild.build({ ...common, metafile: true, entryPoints: [join(here, "src/index.ts")], outfile: join(dist, "index.js") })).metafile);
// Themes (applyTheme and the DTCG reader) on their own: most pages never load one.
metas.push((await esbuild.build({ ...common, metafile: true, entryPoints: [join(here, "src/theme.ts")], outfile: join(dist, "theme.js") })).metafile);
metas.push((await esbuild.build({ ...common, metafile: true, entryPoints: [join(here, "src/react.tsx")], outfile: join(dist, "react.js"), jsx: "automatic", external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client", "./index.js"] })).metafile);
// What went into the bundles, for the SBOM and the licence check (tools/sbom.mjs); not shipped.
writeFileSync(join(here, ".build-inputs.json"), JSON.stringify([...new Set(metas.flatMap((m) => Object.keys(m.inputs)))].sort(), null, 1));
execFileSync(join(tools, "node_modules/.bin/tsc"), ["-p", join(here, "tsconfig.json")], { stdio: "inherit", env: { ...process.env, NODE_PATH: join(tools, "node_modules") } });
// Only the types the package's entry points reach ship; the rest would
// describe modules nobody can import.
const reached = new Set();
const reach = (f) => {
  if (reached.has(f)) return;
  reached.add(f);
  for (const [, to] of readFileSync(join(dist, f), "utf8").matchAll(/from "\.\/([\w-]+)(?:\.js)?"/g)) reach(`${to}.d.ts`);
};
["index.d.ts", "react.d.ts", "theme.d.ts"].forEach(reach);
for (const f of readdirSync(dist)) if (f.endsWith(".d.ts") && !reached.has(f)) rmSync(join(dist, f));

const br = (f) => brotliCompressSync(readFileSync(join(dist, f)), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
for (const f of ["index.js", "react.js", "theme.js", "morphscreen.wasm", "morphscreen-agent.wasm", "morphscreen.css", "morphscreen-page.css"]) console.log(`${f.padEnd(22)} ${String(statSync(join(dist, f)).size).padStart(7)} B, ${String(br(f)).padStart(6)} B brotli`);
