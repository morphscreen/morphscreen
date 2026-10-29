// Recording the real web SDK for the site's videos (the docs' intro, the
// home page's hero): a saved answer streams into a page in Chrome at the pace
// the model wrote it, filmed a frame at a time at 60 fps. The page runs on the
// take's clock, not the wall's: its timers, animation frames, Date and
// performance.now, and every Web Animation and CSS transition, move on
// exactly one frame between screenshots, so no frame is dropped or repeated
// however long a screenshot takes (Chrome's screencast did both, and the
// takes juddered). The page follows the answer down with one eased scroll,
// moved every frame, and a drawn cursor taps things with real clicks
// (headless Chrome has none). Every photo is decoded before the stream
// starts, so none arrives late.

import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join } from "node:path";

export const repo = join(import.meta.dirname, "../..");
const require = createRequire(join(process.env.WEB_TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web"), "package.json"));
const puppeteer = require("puppeteer-core");
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The model's recorded time for an answer, from its run's meta.jsonl. */
export function recorded(run, id) {
  return readFileSync(join(repo, run, "meta.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).find((m) => m.id === id);
}

/**
 * Opens the page: `css` lays out `.wrap` (the asked question and the answer)
 * in a viewport of `width` x `height`. Returns the tab and a close().
 */
export async function open({ ask, css, width, height, hosts = [] }) {
  const page = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8">
<script>${CLOCK}</script>
<link rel="stylesheet" href="/ui/morphscreenui.css"><link rel="stylesheet" href="/sdk/morphscreen.css">
<style>
html, body { margin: 0; background: #050506; overflow: hidden; }
body { font-family: var(--msui-font-sans); }
.wrap { display: flex; flex-direction: column; gap: 20px; padding: 32px 24px 120px; }
.ask { align-self: flex-end; margin: 0; padding: 12px 18px; border-radius: 18px 18px 6px 18px; background: #161619; color: #f4f4f6; font-size: 16px; }
.cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: rgba(244, 244, 246, 0.9); box-shadow: 0 0 0 2px rgba(5, 5, 6, 0.6); pointer-events: none; opacity: 0; z-index: 10; }
${css}
</style></head><body><div class="wrap"><p class="ask">${ask}</p><div id="answer"></div></div><div class="cursor"></div>
<script type="module">
import { createAnswer, loadCore } from "/sdk/index.js";
const core = await loadCore("/sdk/morphscreen.wasm");
const answer = createAnswer(document.getElementById("answer"), { core, imageHosts: ${JSON.stringify(hosts)} });
// What the take waits on (film()'s until): a promise begun under a name, busy until it settles.
window.busy = new Set();
window.begin = (name, promise) => (window.busy.add(name), promise.finally(() => window.busy.delete(name)), true);
window.decodePhotos = (urls) => Promise.all(urls.map((u) => { const i = new Image(); i.src = u; return i.decode(); }));
// One follow, moved every frame: the page's bottom is pulled toward the
// answer's end by a critically damped spring, so when a tall piece arrives
// the scroll speeds up and slows down smoothly instead of jumping to speed.
let following = false, y = 0, v = 0, last = null;
const follow = (t) => {
  const dt = last === null ? 1 / 60 : Math.min(0.05, (t - last) / 1000);
  last = t;
  if (following) {
    const target = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    const w = 7;
    v += (w * w * (target - y) - 2 * w * v) * dt;
    y += v * dt;
    if (Math.abs(target - y) < 0.5 && Math.abs(v) < 5) (y = target), (v = 0);
    scrollTo(0, y);
  }
  requestAnimationFrame(follow);
};
requestAnimationFrame(follow);
window.go = async (text, size, every) => {
  following = true;
  y = scrollY;
  v = 0;
  for (let i = 0; i < text.length; i += size) {
    answer.push(text.slice(i, i + size));
    await new Promise((r) => setTimeout(r, every));
  }
  answer.end();
};
window.settle = () => new Promise((r) => { const check = () => { const t = Math.max(0, document.documentElement.scrollHeight - innerHeight); if (Math.abs(t - y) < 1) { following = false; r(); } else setTimeout(check, 50); }; check(); });
// The page's own scroll, eased a frame at a time, to bring an element to the middle.
window.bring = (el, ms = 800) => new Promise((resolve) => {
  following = false;
  const r = el.getBoundingClientRect();
  const from = scrollY;
  const to = Math.max(0, Math.min(from + r.top + r.height / 2 - innerHeight / 2, document.documentElement.scrollHeight - innerHeight));
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    scrollTo(0, from + (to - from) * (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2));
    if (k < 1) requestAnimationFrame(step);
    else requestAnimationFrame(() => requestAnimationFrame(resolve));
  };
  requestAnimationFrame(step);
});
const cursor = document.querySelector(".cursor");
let at = [innerWidth * 0.7, innerHeight * 0.75];
window.glide = (x, y, ms = 450) => {
  cursor.style.opacity = "1";
  // The translate property, not transform: the press's scale then shrinks the dot in place (a scale applies to a transform's translation too).
  const a = cursor.animate([{ translate: \`\${at[0]}px \${at[1]}px\` }, { translate: \`\${x}px \${y}px\` }], { duration: ms, easing: "cubic-bezier(.45, 0, .2, 1)", fill: "forwards" });
  at = [x, y];
  return a.finished;
};
window.press = () => cursor.animate([{ scale: 1 }, { scale: 0.8 }, { scale: 1 }], { duration: 220, easing: "ease-out" }).finished;
window.ready = true;
</script></body></html>`;
  const TYPES = { ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".woff2": "font/woff2" };
  const server = createServer((req, res) => {
    const p = new URL(req.url, "http://x").pathname;
    if (p === "/") return res.writeHead(200, { "content-type": "text/html" }).end(page);
    const f = p.startsWith("/ui/") ? join(repo, "ui/dist", p.slice(4)) : join(repo, "sdk/web/dist", p.slice(5));
    if (!existsSync(f)) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" }).end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const tab = await browser.newPage();
  await tab.setViewport({ width, height, deviceScaleFactor: 1 });
  await tab.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "networkidle0" });
  // Polled from here: the page's own timers and frames wait for the take's clock.
  while (!(await tab.evaluate(() => window.ready === true))) await wait(50);
  await tab.evaluate(() => document.fonts.ready);
  return { tab, close: async () => (await browser.close(), server.close()) };
}

/**
 * Films `act` at `fps` and writes `out` (H.264, no sound), with optional
 * fades in and out (seconds). The page's clock moves one frame at a time
 * between screenshots. `act` gets the take:
 *   mark(name, data)   notes when something happened in the take, for the edit
 *   wait(ms)           films ms of the page as it goes on
 *   until(fn, ...args) films until fn (run in the page) is true
 *   stream(text, size, every), settle()   the answer arriving, then the page at rest
 *   tap(handle, settle, name)            the cursor moving to `handle` and tapping it
 * film returns the take's length and its marks.
 */
export async function film(tab, out, act, { crf = 26, fadeIn = 0, fadeOut = 0, width, fps = 60 } = {}) {
  const cdp = await tab.createCDPSession();
  // Lossless first, so the fades can be timed once the length is known.
  const raw = out.replace(/\.mp4$/, ".raw.mkv");
  const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-", "-c:v", "libx264", "-qp", "0", "-preset", "ultrafast", "-pix_fmt", "yuv444p", raw], { stdio: ["pipe", "inherit", "inherit"] });
  let frames = 0;
  const step = async () => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
    if (!ffmpeg.stdin.write(Buffer.from(data, "base64"))) await once(ffmpeg.stdin, "drain");
    frames++;
    await tab.evaluate((ms) => window.__frame(ms), 1000 / fps);
  };
  const marks = [];
  const mark = (name, data = {}) => marks.push({ name, t: +(frames / fps).toFixed(3), ...data });
  const wait = async (ms) => {
    for (let k = Math.round((ms * fps) / 1000); k > 0; k--) await step();
  };
  const until = async (fn, ...args) => {
    for (let k = 0; !(await tab.evaluate(fn, ...args)); k++) {
      if (k > fps * 120) throw new Error(`film: still waiting after two minutes of the take for ${fn}`);
      await step();
    }
  };
  const idle = (name) => until((n) => !window.busy.has(n), name);
  const take = {
    mark,
    wait,
    until,
    stream: async (text, size, every) => (await tab.evaluate((t, s, e) => window.begin("stream", window.go(t, s, e)), text, size, every), idle("stream")),
    settle: async () => (await tab.evaluate(() => window.begin("settle", window.settle())), idle("settle")),
    // The cursor glides to `handle` (bringing it into view first if it's near an edge) and taps it.
    tap: async (handle, settle = 900, name = "tap") => {
      const box0 = await handle.boundingBox();
      const vh = tab.viewport().height;
      if (box0.y < 60 || box0.y + box0.height > vh - 60) {
        mark(`${name}:scroll`);
        await handle.evaluate((el) => window.begin("bring", window.bring(el)));
        await idle("bring");
        mark(`${name}:scrolled`);
      }
      const box = await handle.boundingBox();
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
      await tab.evaluate((x, y) => window.begin("glide", window.glide(x, y)), x, y);
      await idle("glide");
      mark(name, { x: Math.round(x), y: Math.round(y) });
      await tab.evaluate(() => window.begin("press", window.press()));
      await handle.click();
      await wait(settle);
      mark(`${name}:settled`);
    },
  };
  await act(take);
  ffmpeg.stdin.end();
  await once(ffmpeg, "close");
  const length = frames / fps;
  const filters = [];
  if (width) filters.push(`scale=${width}:-2:flags=lanczos`);
  if (fadeIn) filters.push(`fade=t=in:st=0:d=${fadeIn}`);
  if (fadeOut) filters.push(`fade=t=out:st=${(length - fadeOut).toFixed(2)}:d=${fadeOut}`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, ...(filters.length ? ["-vf", filters.join(",")] : []), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", String(crf), "-preset", "slow", "-r", String(fps), "-movflags", "+faststart", "-an", out]);
  rmSync(raw);
  return { length, marks };
}

// The take's clock, run before anything else in the page. Timers, animation
// frames, Date and performance.now read it; __frame(ms) moves it on, running
// what falls due in order (and whatever those start, between them), then the
// frame's callbacks, then sets every animation to where it is at that time.
const CLOCK = `(() => {
  const perf0 = performance.now(), date0 = Date.now(), RealDate = Date;
  let now = 0, ids = 0, frames = new Map();
  const timers = new Map();
  performance.now = () => perf0 + now;
  window.Date = class Date extends RealDate {
    constructor(...a) { super(...(a.length ? a : [date0 + now])); }
    static now() { return date0 + now; }
  };
  window.setTimeout = (fn, ms = 0, ...args) => (timers.set(++ids, { at: now + Math.max(0, Number(ms) || 0), fn, args }), ids);
  window.setInterval = (fn, ms = 0, ...args) => { const every = Math.max(1, Number(ms) || 0); timers.set(++ids, { at: now + every, fn, args, every }); return ids; };
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  window.requestAnimationFrame = (fn) => (frames.set(++ids, fn), ids);
  window.cancelAnimationFrame = (id) => frames.delete(id);
  window.requestIdleCallback = (fn) => setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 8 }), 1);
  window.cancelIdleCallback = (id) => timers.delete(id);
  // A real task between callbacks, so the promises they settle run before the next.
  const settle = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  const run = (fn, args) => { try { typeof fn === "function" ? fn(...args) : (0, eval)(String(fn)); } catch (e) { reportError(e); } };
  const begun = new WeakMap();
  window.__frame = async (ms) => {
    const end = now + ms;
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      const [id, t] = next;
      now = Math.max(now, t.at);
      if (t.every) t.at += t.every; else timers.delete(id);
      run(t.fn, t.args);
      await settle();
    }
    now = end;
    const due = frames;
    frames = new Map();
    for (const fn of due.values()) run(fn, [perf0 + now]);
    await settle();
    for (const a of document.getAnimations()) {
      if (!begun.has(a)) begun.set(a, now);
      const t = (now - begun.get(a)) * a.playbackRate;
      const last = a.effect?.getComputedTiming().endTime;
      try {
        if (Number.isFinite(last) && t >= last) a.finish();
        else { a.pause(); a.currentTime = t; }
      } catch {}
    }
    await settle();
  };
})();`;
