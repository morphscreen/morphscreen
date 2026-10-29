// A chat page over any AG-UI agent: ?agent=URL (default /agent on this
// origin). The conversation is kept in this browser, so a reload brings it
// back with the quiz answers and ticks where they were. Built by
// sdk/web/test-agent.mjs.
import { connectAgent, loadCore, type Conversation, type Message } from "../dist/index.js";

const params = new URLSearchParams(location.search);
const url = params.get("agent") ?? "/agent";
const media = params.get("media") ?? undefined;
const key = `morphscreen-agent:${url}`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
$("where").textContent = url;

const core = await loadCore(new URL("../../dist/morphscreen-agent.wasm", import.meta.url));

function saved(): { threadId?: string; messages?: Message[]; state?: unknown } {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
}

function save(chat: Conversation) {
  try {
    localStorage.setItem(key, JSON.stringify({ threadId: chat.threadId, messages: chat.messages(), state: chat.state() }));
  } catch {}
}

let chat: Conversation;
function start(from: ReturnType<typeof saved>) {
  const say = $<HTMLTextAreaElement>("say");
  chat = connectAgent($("chat"), {
    core,
    url,
    media,
    threadId: from.threadId,
    packs: ["interactive", "inputs", "data", "media"],
    onState: () => save(chat),
    onUpdate: (u) => {
      if (u.t === "message") $("empty").hidden = true;
      if (u.t === "finished" || u.t === "error" || u.t === "truncated" || u.t === "rejected") {
        save(chat);
        $<HTMLButtonElement>("send").disabled = false;
        say.focus();
      }
    },
  });
  if (from.messages?.length) {
    chat.load(from.messages, from.state);
    $("empty").hidden = true;
  }
  (window as any).chat = chat;
}
start(params.has("fresh") ? {} : saved());

$("composer").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const say = $<HTMLTextAreaElement>("say");
  const text = say.value.trim();
  if (!text || chat.running) return;
  say.value = "";
  $<HTMLButtonElement>("send").disabled = true;
  void chat.send(text).then(() => save(chat));
});
$("say").addEventListener("keydown", (ev) => {
  // Enter sends; Shift+Enter is a new line; nothing while composing (IME).
  if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    $<HTMLFormElement>("composer").requestSubmit();
  }
});
$("fresh").addEventListener("click", () => {
  try {
    localStorage.removeItem(key);
  } catch {}
  chat.destroy();
  $("empty").hidden = false;
  start({});
});
(window as any).ready = true;
