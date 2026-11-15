// /try's page: a conversation with the playground (/v1/playground), drawn by
// the web SDK the way an app uses it. What the playground turns down (the
// day's quota full, a visitor's prompts used, too busy, too long) comes back
// as an HTTP error; this page says it in its own words and takes the
// prompt back out of the thread, so nothing half-sent stays on screen.
import { connectAgent, loadCore } from "@morphscreen/web";

const root = document.getElementById("try");
const thread = document.getElementById("try-thread");
const start = document.getElementById("try-start");
const form = document.getElementById("try-form");
const box = document.getElementById("try-prompt");
const send = document.getElementById("try-send");
const meta = document.getElementById("try-meta");
const restart = document.getElementById("try-restart");
const notice = document.getElementById("try-notice");
const noticeTitle = document.getElementById("try-notice-title");
const noticeText = document.getElementById("try-notice-text");
const noticeCtas = document.getElementById("try-notice-ctas");

const core = await loadCore(root.dataset.core);
let closed = false;
let refused = null;
// A run this page started (a prompt), not one an answer started (a button, a form, a quiz).
let asking = false;

const at = (seconds) => new Date(Date.now() + seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function say(title, text, ctas) {
  noticeTitle.textContent = title;
  noticeText.textContent = text;
  noticeCtas.hidden = !ctas;
  notice.hidden = false;
}

function close(title, text) {
  closed = true;
  say(title, text, true);
  box.disabled = true;
  send.disabled = true;
  for (const b of document.querySelectorAll(".try__example")) b.disabled = true;
}

function left(n) {
  meta.textContent = n === 1 ? "1 free prompt left today." : `${n} free prompts left today.`;
}

async function status() {
  try {
    const r = await fetch("/v1/playground/status", { cache: "no-store" });
    if (!r.ok) return close("The playground is closed for now", "Sign up free to try it in your own app instead: 100 calls a month with the model included, no card.");
    const s = await r.json();
    const until = Math.max(0, (Date.parse(s.resets_at) - Date.now()) / 1000);
    if (!s.open) return close("Today's free quota is full", `It opens again at ${at(until)} your time. Or sign up free: 100 calls a month with the model included, no card.`);
    if (s.left === 0) return close("That's today's 5 free prompts", `You get 5 more at ${at(until)} your time. To keep going now, sign up free: 100 calls a month with the model included, no card.`);
    left(s.left);
  } catch {
    // The status is a courtesy: the prompt itself says if it can't run.
  }
}

/** What the playground said when it turned a prompt down, in this page's words. */
function refusal({ code, message, retry }) {
  const when = retry ? at(Number(retry)) : null;
  switch (code) {
    case "playground_full":
      return close("Today's free quota is full", `It opens again at ${when ?? "midnight UTC"} your time. Or sign up free: 100 calls a month with the model included, no card.`);
    case "playground_prompts_used":
      return close("That's today's 5 free prompts", `You get 5 more at ${when ?? "midnight UTC"} your time. To keep going now, sign up free: 100 calls a month with the model included, no card.`);
    case "conversation_too_long":
      restart.hidden = false;
      return say("This conversation is as long as the playground goes", "Start over to ask something new.", false);
    case "playground_busy":
      return say("A few people are trying it right now", "Try again in a moment.", false);
    default:
      return say("That didn't go through", message || "Try again in a moment.", false);
  }
}

// The SDK reads the stream; a refusal is read here first, then undone once the run has ended.
async function playgroundFetch(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    let body = {};
    try {
      body = await res.clone().json();
    } catch {}
    refused = { code: body?.error?.type, message: body?.error?.message, retry: res.headers.get("retry-after") };
  }
  // A run an answer started: once it ends, undo a refusal, or count the prompt.
  if (!asking) {
    const wait = () => (chat.running ? setTimeout(wait, 50) : refused ? undo(null) : status());
    setTimeout(wait, 0);
  }
  return res;
}

/** A refused prompt taken back out of the thread (and put back in the box), and the refusal said. */
function undo(text) {
  const r = refused;
  refused = null;
  const kept = chat.messages().slice(0, -1);
  // A new conversation with what came before: the thread is drawn again without the refused prompt.
  begin();
  if (kept.length) {
    chat.load(kept);
    thread.hidden = false;
  }
  if (!kept.length) start.hidden = false;
  if (text && !closed) box.value = text;
  refusal(r);
}

let chat = null;
function begin() {
  chat?.destroy();
  thread.textContent = "";
  chat = connectAgent(thread, { core, url: "/v1/playground", fetch: playgroundFetch });
  thread.hidden = true;
}
begin();

async function ask(text) {
  if (closed || chat.running || !text.trim()) return;
  notice.hidden = true;
  start.hidden = true;
  thread.hidden = false;
  box.value = "";
  send.disabled = true;
  refused = null;
  asking = true;
  try {
    await chat.send(text);
  } finally {
    asking = false;
    send.disabled = closed;
  }
  if (refused) return undo(text);
  restart.hidden = false;
  await status();
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  ask(box.value);
});
box.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    ask(box.value);
  }
});
for (const b of document.querySelectorAll(".try__example")) b.addEventListener("click", () => ask(b.dataset.prompt));
restart.addEventListener("click", () => {
  begin();
  restart.hidden = true;
  notice.hidden = true;
  start.hidden = false;
  box.focus();
});

await status();
