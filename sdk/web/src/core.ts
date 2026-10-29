// The core in the browser: the same Rust parser, validator and HTML renderer,
// compiled to WASM. A Session reads one answer; push() returns the ops.

export type Attrs = Record<string, string | true>;

export type Span =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong" | "em" | "s" | "u" | "small" | "sub" | "sup" | "mark" | "kbd"; c: Span[] }
  | { t: "link"; href: string; c: Span[] }
  | { t: "img"; src: string; alt: string; credit?: Span[] }
  | { t: "br" }
  | { t: "el"; type: string; attrs: Attrs; c: Span[] };

export type Op =
  /** The parent is the id up to its last dot ("" for the root). */
  | { op: "open"; id: string; type: string; attrs?: Attrs; icon?: string }
  | { op: "spans"; id: string; spans: Span[] | string }
  | { op: "close"; id: string; data?: any }
  /** A leaf that opened and finished within one chunk: open, spans and close in one. */
  | { op: "node"; id: string; type: string; attrs?: Attrs; spans?: Span[] | string; data?: any; icon?: string }
  | { op: "diag"; line: number; cls: string; detail: string; severity: "error" | "note" }
  | { op: "end"; complete: boolean; truncated: boolean };

/** A pack of the app's own components (the JSON the custom components docs describe). */
export type Pack = { name: string; version: string; components: Record<string, unknown>; aliases?: Record<string, unknown> };

interface Exports {
  memory: WebAssembly.Memory;
  ms_alloc(len: number): number;
  ms_dealloc(ptr: number, len: number): void;
  ms_out_len(): number;
  ms_new(pp: number, pl: number, cp: number, cl: number): number;
  ms_push(s: number, p: number, l: number): void;
  ms_finish(s: number, truncated: number): void;
  ms_take_ops(s: number): number;
  ms_allow_images(s: number, hp: number, hl: number): void;
  ms_html(s: number): number;
  ms_node_html(s: number, p: number, l: number): number;
  ms_node_html_without(s: number, p: number, l: number): number;
  ms_tree(s: number): number;
  ms_verdict(s: number, truncated: number, reqs: number, strict: number): number;
  ms_free(s: number): void;
  ms_prompt(pp: number, pl: number, cp: number, cl: number): number;
  ms_error(): number;
  ms_agent_new(): number;
  ms_agent_feed(a: number, p: number, l: number): number;
  ms_agent_call(a: number, p: number, l: number): number;
  ms_agent_free(a: number): void;
  ms_action_message(p: number, l: number): number;
}

/** What a conversation with an AG-UI agent reports. */
export type Update =
  | { t: "run"; threadId: string; runId: string }
  | { t: "message"; id: string; role: string; index: number }
  | { t: "text"; id: string; delta: string }
  | { t: "end"; id: string; truncated?: boolean }
  | { t: "reset" | "removed" | "changed"; id: string }
  | { t: "tool"; id: string; name: string; arguments: string; parentMessageId: string }
  | { t: "state" }
  | { t: "step"; name: string; started: boolean }
  | { t: "custom"; name: string; value: unknown }
  | { t: "finished"; outcome: "success" | "interrupt" | "cancelled"; pending?: string[]; interrupts?: unknown[]; result?: unknown }
  | { t: "error"; message: string; code?: string }
  | { t: "rejected"; message: string }
  | { t: "truncated" }
  | { t: "warn"; message: string };

/** An AG-UI message (protocol 1.0). */
export type Message = { id: string; role: string; content?: unknown; [k: string]: unknown };

const enc = new TextEncoder();
const dec = new TextDecoder();

export class Core {
  private x: Exports;
  constructor(x: Exports) {
    this.x = x;
  }

  /** Writes a string into WASM memory; the caller frees it. */
  private put(s: string): [number, number] {
    if (!s) return [0, 0];
    const b = enc.encode(s);
    const p = this.x.ms_alloc(b.length);
    new Uint8Array(this.x.memory.buffer, p, b.length).set(b);
    return [p, b.length];
  }

  private putBytes(b: Uint8Array): [number, number] {
    if (!b.length) return [0, 0];
    const p = this.x.ms_alloc(b.length);
    new Uint8Array(this.x.memory.buffer, p, b.length).set(b);
    return [p, b.length];
  }

  private get(p: number): string {
    return p ? dec.decode(new Uint8Array(this.x.memory.buffer, p, this.x.ms_out_len())) : "";
  }

  /** Runs `f` with strings (or bytes) in WASM memory, freeing them afterwards. */
  call<T>(args: (string | Uint8Array)[], f: (...ptrs: number[]) => T): T {
    const parts = args.map((a) => (typeof a === "string" ? this.put(a) : this.putBytes(a)));
    try {
      return f(...parts.flat());
    } finally {
      for (const [p, l] of parts) if (p) this.x.ms_dealloc(p, l);
    }
  }

  result(p: number): string {
    return this.get(p);
  }

  error(): string {
    return this.get(this.x.ms_error());
  }

  get exports(): Exports {
    return this.x;
  }

  /** A parser for one answer. Core is always in; `packs` adds others: every one ("all") unless named, `[]` for core alone. */
  session(packs: string[] = ["all"], custom: Pack[] = []): Session {
    const h = this.call([packs.join(","), custom.length ? JSON.stringify(custom) : ""], (pp, pl, cp, cl) => this.x.ms_new(pp, pl, cp, cl));
    if (!h) throw new Error(this.error());
    return new Session(this, h);
  }

  /** A conversation with an AG-UI agent (the protocol in the core; load morphscreen-agent.wasm). */
  agent(): AgentCore {
    if (!this.x.ms_agent_new) throw new Error("this core has no AG-UI client: load morphscreen-agent.wasm instead of morphscreen.wasm");
    return new AgentCore(this, this.x.ms_agent_new());
  }

  /** The user message an action starts, or "" when it starts none (a Checklist tick, a card marked known). */
  actionMessage(action: unknown): string {
    const p = this.call([JSON.stringify(action)], (ap, al) => this.x.ms_action_message(ap, al));
    if (!p) throw new Error(this.error());
    return this.get(p);
  }

  /** The system prompt for this catalog (servers usually build it, but it's here too). */
  prompt(packs: string[] = ["all"], custom: Pack[] = []): string {
    const p = this.call([packs.join(","), custom.length ? JSON.stringify(custom) : ""], (pp, pl, cp, cl) => this.x.ms_prompt(pp, pl, cp, cl));
    if (!p) throw new Error(this.error());
    return this.get(p);
  }
}

export class Session {
  private h: number;
  private core: Core;
  constructor(core: Core, handle: number) {
    this.core = core;
    this.h = handle;
  }

  private ops(): Op[] {
    const text = this.core.result(this.core.exports.ms_take_ops(this.h));
    if (!text) return [];
    return text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Op);
  }

  /** Feeds the next chunk of the model's text; returns the ops it produced. */
  push(text: string): Op[] {
    this.core.call([text], (p, l) => this.core.exports.ms_push(this.h, p, l));
    return this.ops();
  }

  /** The answer is over; returns the last ops (ending with `end`). */
  finish(truncated = false): Op[] {
    this.core.exports.ms_finish(this.h, truncated ? 1 : 0);
    return this.ops();
  }

  /** Pictures in the HTML load only from these hosts, as on the page. */
  allowImages(hosts: string[] = []) {
    this.core.call([hosts.join(",")], (hp, hl) => this.core.exports.ms_allow_images(this.h, hp, hl));
  }

  /** A finished node's HTML, exactly as it appears in the whole page. */
  nodeHtml(id: string): string {
    return this.core.call([id], (p, l) => this.core.result(this.core.exports.ms_node_html(this.h, p, l)));
  }

  /** A chart as nodeHtml draws it, leaving out the series in `hidden` (0 is the first). */
  nodeHtmlWithout(id: string, hidden: number[]): string {
    return this.core.call([`${id}\0${hidden.join(",")}`], (p, l) => this.core.result(this.core.exports.ms_node_html_without(this.h, p, l)));
  }

  html(): string {
    return this.core.result(this.core.exports.ms_html(this.h));
  }

  tree(): unknown {
    return JSON.parse(this.core.result(this.core.exports.ms_tree(this.h)));
  }

  verdict(opts: { truncated?: boolean; reqs?: number; strict?: boolean } = {}): { complete: boolean; n: number; errs: { cls: string; detail: string }[]; notes: string[] } {
    return JSON.parse(this.core.result(this.core.exports.ms_verdict(this.h, opts.truncated ? 1 : 0, opts.reqs ?? 0, opts.strict ? 1 : 0)));
  }

  free(): void {
    if (this.h) this.core.exports.ms_free(this.h);
    this.h = 0;
  }
}

const lines = (text: string): Update[] => (text ? text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Update) : []);

/** The core's AG-UI client: response bytes in, updates out; the conversation and the shared state. */
export class AgentCore {
  private h: number;
  private core: Core;
  constructor(core: Core, handle: number) {
    this.core = core;
    this.h = handle;
  }

  private run(op: string, ...args: string[]): string {
    const p = this.core.call([[op, ...args].join("\0")], (ap, al) => this.core.exports.ms_agent_call(this.h, ap, al));
    if (!p) throw new Error(this.core.error());
    return this.core.result(p);
  }

  /** Bytes of the response body as they arrive. */
  feed(bytes: Uint8Array): Update[] {
    return lines(this.core.call([bytes], (p, l) => this.core.result(this.core.exports.ms_agent_feed(this.h, p, l))));
  }
  /** One event, for an app with its own transport. */
  event(e: unknown): Update[] {
    return lines(this.run("event", typeof e === "string" ? e : JSON.stringify(e)));
  }
  /** The response ended. */
  close(): Update[] {
    return lines(this.run("close"));
  }
  /** The reader's message, or a tool's answer. */
  add(message: Message): Update[] {
    return lines(this.run("add", JSON.stringify(message)));
  }
  /** The next run's request body. */
  input(threadId: string, runId: string, extra?: object): string {
    return this.run("input", threadId, runId, extra ? JSON.stringify(extra) : "");
  }
  /** A saved conversation. */
  load(messages: Message[], state?: unknown): Update[] {
    return lines(this.run("load", JSON.stringify(messages), state === undefined ? "" : JSON.stringify(state)));
  }
  messages(): Message[] {
    return JSON.parse(this.run("messages"));
  }
  state(): unknown {
    return JSON.parse(this.run("state"));
  }
  setState(v: unknown) {
    this.run("setState", JSON.stringify(v));
  }
  /** An answer's components' state, by node id. */
  components(messageId: string): Record<string, unknown> {
    return JSON.parse(this.run("components", messageId));
  }
  setComponent(messageId: string, node: string, value: unknown) {
    this.run("setComponent", messageId, node, JSON.stringify(value));
  }
  free() {
    if (this.h) this.core.exports.ms_agent_free(this.h);
    this.h = 0;
  }
}

/** Loads the WASM core: a URL, the bytes, or a fetch Response. */
export async function loadCore(src: string | URL | ArrayBuffer | Uint8Array | Response): Promise<Core> {
  warmFonts();
  let instance: WebAssembly.Instance;
  if (src instanceof ArrayBuffer || src instanceof Uint8Array) {
    instance = (await WebAssembly.instantiate(src as BufferSource, {})).instance;
  } else {
    const res = src instanceof Response ? src : await fetch(src);
    instance =
      typeof WebAssembly.instantiateStreaming === "function" && res.headers.get("content-type")?.includes("wasm")
        ? (await WebAssembly.instantiateStreaming(res, {})).instance
        : (await WebAssembly.instantiate(await res.arrayBuffer(), {})).instance;
  }
  return new Core(instance.exports as unknown as Exports);
}

/**
 * Starts the answer faces loading (morphscreen.css declares them) while the core
 * loads, so the first answer usually draws in Plex rather than swapping to it.
 * Does nothing where the stylesheet isn't on the page or the app set its own faces.
 */
function warmFonts() {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  for (const face of ['400 15px "IBM Plex Sans"', '600 15px "IBM Plex Sans"', '400 13px "IBM Plex Mono"']) document.fonts.load(face).catch(() => {});
}
