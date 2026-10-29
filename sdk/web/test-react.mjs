// The React component as an app uses it: <Answer> draws a quiz, tells the app
// when the reader answers it (onComponentState), and a second <Answer> given
// that state (state) draws the quiz answered, as after a reload.
//   node sdk/web/build.mjs && node sdk/web/test-react.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "./browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const esbuild = require("esbuild");

const quiz = '<Quiz title="Quick check">\n<Question text="Which gas do leaves take in?" answer="B">\n- Oxygen\n- Carbon dioxide\n</Question>\n</Quiz>\n';
const app = `
import { createElement as h, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadCore } from "@morphscreen/web";
import { Answer } from "@morphscreen/web/react";
const quiz = ${JSON.stringify(quiz)};
window.saved = {};
function App() {
  const [core, setCore] = useState(null);
  const [again, setAgain] = useState(null);
  useEffect(() => { loadCore("/sdk/web/dist/morphscreen.wasm").then(setCore); }, []);
  window.again = () => setAgain({ ...window.saved });
  if (!core) return null;
  return h("div", null,
    h(Answer, { core, text: quiz, done: true, className: "first", onComponentState: (node, s) => (window.saved[node] = s) }),
    again && h(Answer, { core, text: quiz, done: true, className: "second", state: again }));
}
createRoot(document.getElementById("root")).render(h(App));
window.ready = true;
`;
const bundle = esbuild.buildSync({
  stdin: { contents: app, resolveDir: here, loader: "js" },
  bundle: true,
  write: false,
  format: "esm",
  nodePaths: [join(tools, "node_modules")],
  alias: { "@morphscreen/web/react": join(here, "dist/react.js"), "@morphscreen/web": join(here, "dist/index.js") },
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "error",
}).outputFiles[0].text;
const page = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="/sdk/web/dist/morphscreen.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`;

const types = { ".css": "text/css", ".wasm": "application/wasm", ".woff2": "font/woff2" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") return res.writeHead(200, { "content-type": "text/html" }).end(page);
  if (path === "/app.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(bundle);
  const p = join(repo, path);
  if (!p.startsWith(repo) || !existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await launch(puppeteer);
const failures = [];
const want = (ok, what) => ok || failures.push(what);
const tab = await browser.newPage();
tab.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
await tab.goto(`http://127.0.0.1:${server.address().port}/`);
await tab.waitForSelector(".first .ms-question input");

await tab.click(".first .ms-question label:nth-of-type(2) input");
const saved = await tab.evaluate(() => window.saved);
const node = Object.keys(saved)[0];
want(node && JSON.stringify(saved[node]) === JSON.stringify({ answers: [1] }), `onComponentState gave ${JSON.stringify(saved)}`);

await tab.evaluate(() => window.again());
await tab.waitForSelector(".second .ms-question input");
await tab.waitForFunction(() => document.querySelector(".second .ms-question")?.dataset.answered === "1", { timeout: 5000 }).catch(() => {});
const restored = await tab.evaluate(() => ({
  answered: document.querySelector(".second .ms-question")?.dataset.answered,
  checked: [...document.querySelectorAll(".second .ms-question input")].map((i) => i.checked),
  marks: [...document.querySelectorAll(".second .ms-question label")].map((l) => l.className),
}));
want(restored.answered === "1" && JSON.stringify(restored.checked) === "[false,true]" && restored.marks[1] === "ms-right", `state restored the quiz: ${JSON.stringify(restored)}`);

await browser.close();
server.close();
if (failures.length) {
  console.error(`react: ${failures.length} problems\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("react: ok (<Answer> reports a quiz answered with onComponentState, and draws it answered again from state)");
