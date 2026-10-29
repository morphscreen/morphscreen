// Retained heap of OpenUI's streaming parser after each answer, per byte of
// answer. Run with --expose-gc: node --expose-gc bench/memory-openui.mjs [label]
// Prints a JSON line { median, max, answers } (the scoreboard runs it).
import fs from "node:fs";
const ui = await import(process.env.HOME + "/openui/packages/react-ui/dist/genui-lib/index.mjs");
const lang = await import(process.env.HOME + "/openui/packages/lang-core/dist/index.mjs");
const schema = ui.openuiChatLibrary.toJSONSchema();
const dir = new URL(`raw/${process.argv[2] ?? "nemotron-v03"}`, import.meta.url).pathname;
const ratios = [];
const keep = [];
for (const f of fs.readdirSync(dir).filter((f) => f.startsWith("openuichat__"))) {
  const t = fs.readFileSync(dir + "/" + f, "utf8");
  globalThis.gc(); globalThis.gc();
  const h0 = process.memoryUsage().heapUsed;
  const sp = lang.createStreamingParser(schema, ui.openuiChatLibrary.root);
  let last;
  for (let i = 0; i < t.length; i += 32) last = sp.push(t.slice(i, i + 32));
  keep.push(sp, last);
  globalThis.gc(); globalThis.gc();
  const retained = process.memoryUsage().heapUsed - h0;
  ratios.push(retained / Buffer.byteLength(t));
}
ratios.sort((a, b) => a - b);
console.log(JSON.stringify({ median: ratios[ratios.length >> 1], max: ratios[ratios.length - 1], answers: ratios.length }));
