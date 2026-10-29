// The web SDK's download held to a budget (roadmap H4): each file brotli-
// compressed as a CDN serves it, against the most it may weigh. Raising a
// budget is a decision, written down in the commit that raises it.
//
//   node sdk/web/build.mjs && node sdk/web/size.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";

const dist = join(import.meta.dirname, "dist");
// Bytes, brotli. Set 2026-10-28 a little above that day's sizes.
const BUDGET = {
  "index.js": 34_000,
  "react.js": 1_000,
  "theme.js": 4_000,
  "morphscreen.wasm": 225_000,
  "morphscreen-agent.wasm": 262_000,
  "morphscreen.css": 26_000,
};

const over = [];
const rows = [];
for (const [file, most] of Object.entries(BUDGET)) {
  const size = brotliCompressSync(readFileSync(join(dist, file)), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  rows.push(`${file} ${(size / 1000).toFixed(1)} of ${(most / 1000).toFixed(0)} KB`);
  if (size > most) over.push(`${file}: ${size} B brotli, over its ${most} B budget`);
}
if (over.length) {
  console.error(over.join("\n"));
  process.exit(1);
}
console.log(`the web SDK is within its budget: ${rows.join(", ")}`);
