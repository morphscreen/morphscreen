// Calls every WASM export once: node ffi/tests/smoke.mjs path/to/morphscreen.wasm
import { readFileSync } from "node:fs";
const { instance } = await WebAssembly.instantiate(readFileSync(process.argv[2]), {});
const x = instance.exports;
const enc = new TextEncoder(), dec = new TextDecoder();
const put = (s) => { const b = enc.encode(s); const p = x.ms_alloc(b.length); new Uint8Array(x.memory.buffer, p, b.length).set(b); return [p, b.length]; };
const get = (p) => dec.decode(new Uint8Array(x.memory.buffer, p, x.ms_out_len()));
const [pp, pl] = put("device");
const s = x.ms_new(pp, pl, 0, 0);
for (const c of ["# Plan\n\n<Card title=\"Trip\">\nPack ", "light.\n<Camera label=\"Ticket\" />\n</Card>\n"]) { const [p, l] = put(c); x.ms_push(s, p, l); x.ms_dealloc(p, l); }
x.ms_finish(s, 0);
const ops = get(x.ms_take_ops(s)), html = get(x.ms_html(s)), tree = get(x.ms_tree(s));
const [ip, il] = put("1.1");
const node = get(x.ms_node_html(s, ip, il)), verdict = get(x.ms_verdict(s, 0, 0, 0)), prompt = get(x.ms_prompt(pp, pl, 0, 0));
const ok = ops.includes('"op":"end"') && html.includes('capture="environment"') && node.includes("Ticket") && verdict.includes('"complete":true') && prompt.includes("<Camera");
console.log(`ops ${ops.length}, html ${html.length}, tree ${tree.length}, node ${node.length}, verdict ${verdict}, prompt ${prompt.length}: ${ok ? "ok" : "FAILED"}`);
const [bp, bl] = put("nope");
console.log("unknown pack:", x.ms_new(bp, bl, 0, 0) ? "accepted?" : "refused", "(" + get(x.ms_error()) + ")");
x.ms_free(s);
process.exit(ok ? 0 : 1);
