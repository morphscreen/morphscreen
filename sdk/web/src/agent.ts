// AG-UI on the web (roadmap Q9): a conversation with any agent that speaks
// AG-UI (protocol 1.0) over HTTP + Server-Sent Events, its answers drawn as
// they stream. The protocol itself is the core's (rust/core/src/agui.rs):
// response bytes go in, and what to draw comes out, so every platform reads
// a stream the same way. This file is the page's side: the requests, the
// turns on the page, and the reader's actions going back.
//
//   const chat = connectAgent(el, { core, url: "/agent", packs: ["interactive"] });
//   await chat.send("Quiz me on photosynthesis");
//
// What the reader does in an answer goes back to the agent: a Button, a
// follow-up, a form, a finished quiz or a vote becomes the next user message
// (worded by the core, the same everywhere); ticks, known cards, slider
// positions and typed fields are the shared state (`morphscreen` in AG-UI's
// state, by message and node), sent with the next run, and an agent can set
// them with STATE_SNAPSHOT or STATE_DELTA.

import type { Action } from "./actions";
import { createAnswer, type Answer, type AnswerOptions } from "./answer";
import type { AgentCore, Message, Update } from "./core";

export interface ToolCall {
  id: string;
  name: string;
  /** The arguments as the agent wrote them (usually JSON; check before trusting). */
  arguments: string;
}

export interface AgentOptions extends Omit<AnswerOptions, "onOps"> {
  /** The agent's endpoint: POST a run's input, read the events back. */
  url: string;
  /** Request headers (auth), or a function that makes them for each run. */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
  /** The conversation's id; a new one when left out. */
  threadId?: string;
  /** The app's own tools, context and pass-through props, sent with every run. */
  tools?: { name: string; description: string; parameters?: unknown }[];
  context?: { description: string; value: string }[];
  forwardedProps?: unknown;
  /**
   * A tool of the app's own that the agent called. Return its result (text,
   * or AG-UI content parts) to answer it; the conversation then goes on.
   */
  onToolCall?: (call: ToolCall) => unknown | Promise<unknown>;
  /** Every update from the core (steps, custom events, warnings...). */
  onUpdate?: (u: Update) => void;
  /** The shared state changed (the agent's or the reader's doing). */
  onState?: (state: unknown) => void;
  /** Send the reader's actions on as user messages (default true). */
  sendActions?: boolean;
  /** For tests and other transports. */
  fetch?: typeof fetch;
}

export interface RunResult {
  /** The run finished as the agent said: success, interrupt or cancelled. */
  outcome?: "success" | "interrupt" | "cancelled";
  /** The agent reported a failure (RUN_ERROR), or the request failed. */
  error?: string;
  /** The stream broke the protocol and was stopped. */
  rejected?: string;
  /** The stream ended before the run did. */
  truncated?: boolean;
  /** Tool calls left for the app. */
  pending?: string[];
}

export interface Conversation {
  /** The reader says something (text, or AG-UI content parts); runs the agent. `id` is the message's own, if the app keeps one. */
  send(content: string | unknown[], id?: string): Promise<RunResult>;
  /** Runs the agent on the conversation as it is. */
  run(): Promise<RunResult>;
  /** Stops the run in progress (the run is then truncated, not cancelled). */
  stop(): void;
  readonly threadId: string;
  readonly running: boolean;
  messages(): Message[];
  state(): unknown;
  setState(state: unknown): void;
  /** Starts from a saved conversation. */
  load(messages: Message[], state?: unknown): void;
  /** The low-level client, to feed events from a transport of the app's own. */
  readonly agent: AgentCore;
  destroy(): void;
}

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 3) | 8).toString(16);
      });

/** An action as JSON: uploads become their name, type and size. */
function plain(a: Action): unknown {
  if (a.type !== "submit") return a;
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a.fields)) fields[k] = Array.isArray(v) && v.some((x) => x instanceof File) ? (v as File[]).map((f) => ({ name: f.name, type: f.type, size: f.size })) : v;
  return { ...a, fields };
}

/** A file as an AG-UI media part, its bytes inline. */
async function part(f: File): Promise<unknown> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const mimeType = f.type || "application/octet-stream";
  const type = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("audio/") ? "audio" : mimeType.startsWith("video/") ? "video" : "document";
  return { type, source: { type: "data", value: btoa(bin), mimeType }, metadata: { filename: f.name } };
}

interface Turn {
  el: HTMLElement;
  role: string;
  answer?: Answer;
}

export function connectAgent(el: HTMLElement, opts: AgentOptions): Conversation {
  const core = opts.core;
  const agent = core.agent();
  const threadId = opts.threadId ?? uuid();
  const turns = new Map<string, Turn>();
  const doFetch = opts.fetch ?? fetch.bind(globalThis);
  let running = false;
  let ctrl: AbortController | null = null;
  let toolAnswers: Promise<boolean>[] = [];
  el.classList.add("ms-thread");
  const note = document.createElement("p");
  note.className = "ms-run-note";
  note.setAttribute("role", "status");
  note.hidden = true;

  // While the agent works and nothing shows yet, a small mark breathes where its
  // answer will be; when the answer's first words come it travels to where they
  // start, shrinking into them, and goes.
  let working: HTMLElement | null = null;
  const startWorking = () => {
    if (working) return;
    working = document.createElement("div");
    working.className = "ms-working";
    working.dataset.msAdded = "1";
    working.setAttribute("role", "status");
    working.setAttribute("aria-label", "Working on it");
    el.appendChild(working);
  };
  const stopWorking = (into?: HTMLElement) => {
    const w = working;
    working = null;
    if (!w) return;
    const target = into?.querySelector(":scope > * :is(.ms-icon, h1, h2, h3, p, li, span), :scope > *") as HTMLElement | null;
    if (!target || reduce()) return w.remove();
    const a = w.getBoundingClientRect(), b = target.getBoundingClientRect();
    w.animate([{ transform: "translate(0, 0) scale(1)", opacity: 1 }, { transform: `translate(${b.left - a.left}px, ${b.top + Math.min(b.height, 22) / 2 - (a.top + a.height / 2)}px) scale(.4)`, opacity: 0 }], { duration: 260, easing: "cubic-bezier(.2, .9, .25, 1)" }).finished.then(() => w.remove(), () => w.remove());
  };
  const reduce = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const say = (text: string, tone: "bad" | "neutral") => {
    note.textContent = text;
    note.dataset.tone = tone;
    note.hidden = false;
    el.appendChild(note);
  };

  const answerFor = (id: string, t: Turn): Answer => {
    const a = createAnswer(t.el, {
      ...opts,
      onAction: (act) => act && onAction(act),
      onComponentState: (node, value) => {
        agent.setComponent(id, node, value);
        opts.onComponentState?.(node, value);
        opts.onState?.(agent.state());
      },
    });
    a.applyState(agent.components(id));
    return a;
  };

  const place = (u: { id: string; role: string; index: number }) => {
    const t: Turn = { el: document.createElement("div"), role: u.role };
    // An assistant's turn is an answer, with the answer's own spacing.
    t.el.className = u.role === "assistant" ? "ms-turn ms-assistant ms-answer" : "ms-turn ms-user";
    t.el.dataset.msMessage = u.id;
    // Only what a reader reads is shown; an assistant turn waits for its text.
    t.el.hidden = true;
    // After the last shown turn that comes before it among the core's messages
    // (which also hold tool, reasoning and activity messages, never shown).
    const before = new Set(agent.messages().slice(0, u.index).map((m) => m.id));
    const prev = [...el.querySelectorAll<HTMLElement>(":scope > .ms-turn")].filter((x) => before.has(x.dataset.msMessage!)).at(-1);
    if (prev) prev.after(t.el);
    else el.insertBefore(t.el, el.querySelector(":scope > .ms-turn") ?? (note.parentElement === el ? note : null));
    turns.set(u.id, t);
  };

  const handle = (updates: Update[]) => {
    for (const u of updates) {
      opts.onUpdate?.(u);
      switch (u.t) {
        case "message":
          if (u.role === "user" || u.role === "assistant") place(u);
          break;
        case "text": {
          const t = turns.get(u.id);
          if (!t) break;
          t.el.hidden = false;
          if (t.role === "user") t.el.textContent += u.delta;
          else {
            (t.answer ??= answerFor(u.id, t)).push(u.delta);
            if (working) stopWorking(t.el);
          }
          break;
        }
        case "end":
          turns.get(u.id)?.answer?.end(u.truncated);
          break;
        case "reset": {
          const t = turns.get(u.id);
          if (!t) break;
          t.answer?.destroy();
          t.answer = undefined;
          t.el.textContent = "";
          break;
        }
        case "removed": {
          const t = turns.get(u.id);
          t?.answer?.destroy();
          t?.el.remove();
          turns.delete(u.id);
          break;
        }
        case "state":
          for (const [id, t] of turns) t.answer?.applyState(agent.components(id));
          opts.onState?.(agent.state());
          break;
        case "tool":
          if (opts.onToolCall) {
            const call = { id: u.id, name: u.name, arguments: u.arguments };
            toolAnswers.push(
              Promise.resolve(opts.onToolCall(call)).then((result) => {
                if (result === undefined) return false;
                handle(agent.add({ id: uuid(), role: "tool", toolCallId: u.id, content: typeof result === "string" ? result : Array.isArray(result) ? result : JSON.stringify(result) }));
                return true;
              }),
            );
          }
          break;
        case "error":
          say(`The agent stopped: ${u.message}`, "bad");
          break;
        case "rejected":
          say("The agent's reply broke off (it didn't follow the protocol).", "bad");
          console.warn(`[morphscreen] AG-UI stream rejected: ${u.message}`);
          break;
        case "truncated":
          say("The reply was cut off.", "neutral");
          break;
        case "warn":
          console.warn(`[morphscreen] AG-UI: ${u.message}`);
          break;
      }
    }
  };

  async function runOnce(): Promise<RunResult> {
    if (running) throw new Error("a run is already going");
    running = true;
    note.hidden = true;
    startWorking();
    const result: RunResult = {};
    const watch = (us: Update[]) => {
      for (const u of us) {
        if (u.t === "finished") Object.assign(result, { outcome: u.outcome, pending: u.pending });
        else if (u.t === "error") result.error = u.message;
        else if (u.t === "rejected") result.rejected = u.message;
        else if (u.t === "truncated") result.truncated = true;
      }
      handle(us);
    };
    try {
      const extra: Record<string, unknown> = {};
      if (opts.tools?.length) extra.tools = opts.tools;
      if (opts.context?.length) extra.context = opts.context;
      if (opts.forwardedProps !== undefined) extra.forwardedProps = opts.forwardedProps;
      const body = agent.input(threadId, uuid(), extra);
      const headers = typeof opts.headers === "function" ? await opts.headers() : (opts.headers ?? {});
      ctrl = new AbortController();
      let res: Response;
      try {
        res = await doFetch(opts.url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...headers }, body, signal: ctrl.signal });
      } catch (e) {
        result.error = `the agent couldn't be reached (${(e as Error).message})`;
        say(`The agent couldn't be reached.`, "bad");
        return result;
      }
      if (!res.ok || !res.body) {
        result.error = `the agent answered ${res.status}`;
        say(`The agent answered ${res.status} ${res.statusText}.`.trim(), "bad");
        return result;
      }
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.length) watch(agent.feed(value));
        }
      } catch {
        // Aborted, or the connection dropped: what came stays; close() says it's truncated.
      }
      watch(agent.close());
      return result;
    } finally {
      stopWorking();
      running = false;
      ctrl = null;
    }
  }

  /** Runs, and runs again while the app answered tool calls the agent left. */
  async function run(): Promise<RunResult> {
    for (;;) {
      toolAnswers = [];
      const r = await runOnce();
      const answered = (await Promise.all(toolAnswers)).some(Boolean);
      if (!answered || r.error || r.rejected || r.truncated || r.outcome !== "success") return r;
    }
  }

  async function send(content: string | unknown[], id = uuid()): Promise<RunResult> {
    handle(agent.add({ id, role: "user", content }));
    return run();
  }

  function onAction(a: Action) {
    opts.onAction?.(a);
    if (a.type === "state" || opts.sendActions === false) return;
    const text = core.actionMessage(plain(a));
    if (!text) return;
    const files = a.type === "submit" ? Object.values(a.fields).flatMap((v) => (Array.isArray(v) ? v.filter((x): x is File => x instanceof File) : [])) : [];
    const go = async () => {
      if (running) return;
      if (!files.length) return send(text);
      return send([{ type: "text", text }, ...(await Promise.all(files.map(part)))]);
    };
    void go();
  }

  return {
    send,
    run,
    stop: () => ctrl?.abort(),
    threadId,
    get running() {
      return running;
    },
    messages: () => agent.messages(),
    state: () => agent.state(),
    setState: (s) => {
      agent.setState(s);
      handle([{ t: "state" }]);
    },
    load: (messages, state) => handle(agent.load(messages, state)),
    agent,
    destroy() {
      ctrl?.abort();
      for (const t of turns.values()) t.answer?.destroy();
      turns.clear();
      el.textContent = "";
      el.classList.remove("ms-thread");
      agent.free();
    },
  };
}
