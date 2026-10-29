// Safari for the web tests (roadmap C3): a Puppeteer-shaped browser over
// Safari's own WebDriver (safaridriver), for what the tests use: pages,
// evaluate and waiting, clicks, typing, keys and the mouse as real pointer
// and key actions, the viewport, screenshots. What WebDriver can't do
// (request interception, emulated media features, the console) throws
// `Unsupported`, so a test leaves that part to Chrome and Firefox. Page errors
// are collected by a handler the page gets once it has loaded.
// Safari needs "Allow remote automation" (safaridriver --enable) and runs one
// automated session at a time, in a window of its own.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";

export class Unsupported extends Error {}

const ELEMENT = "element-6066-11e4-a52e-4f735466cecf";
const KEYS = {
  Enter: "", Tab: "", Escape: "", Backspace: "", Delete: "", Space: " ", " ": " ",
  ArrowUp: "", ArrowDown: "", ArrowLeft: "", ArrowRight: "", Home: "", End: "", PageUp: "", PageDown: "", Shift: "",
};

const freePort = () =>
  new Promise((r) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => r(port));
    });
  });

// Runs a function (or an expression) in the page with its arguments; returns
// its value and the page errors since the last call.
const RUN = `
const done = arguments[arguments.length - 1];
const [src, isFn, args] = [arguments[0], arguments[1], Array.prototype.slice.call(arguments, 2, -1)];
if (!window.__msErrors) {
  window.__msErrors = [];
  addEventListener("error", (e) => window.__msErrors.push(String(e.message || e.error)));
  addEventListener("unhandledrejection", (e) => window.__msErrors.push(String(e.reason && e.reason.message || e.reason)));
}
// The value as JSON, as Puppeteer returns it (an Animation or a node isn't sent as itself).
const json = (v) => {
  try {
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  } catch (e) {
    return null;
  }
};
const out = (v, e) => done({ v: json(v), e, errs: window.__msErrors.splice(0) });
try {
  const f = isFn ? (0, eval)("(" + src + ")") : null;
  Promise.resolve(isFn ? f.apply(null, args) : (0, eval)(src)).then((v) => out(v), (e) => out(null, String(e && e.stack || e)));
} catch (e) {
  out(null, String(e && e.stack || e));
}`;

class Driver {
  constructor(port, session) {
    this.base = `http://127.0.0.1:${port}/session/${session}`;
  }
  async call(method, path, body) {
    const r = await fetch(this.base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json();
    if (j.value && j.value.error) throw new Error(`safaridriver ${path}: ${j.value.error}: ${j.value.message}`);
    return j.value;
  }
}

class Element {
  constructor(page, id) {
    this.page = page;
    this.id = id;
  }
  toJSON() {
    return { [ELEMENT]: this.id };
  }
  evaluate(fn, ...args) {
    return this.page.evaluate(fn, this, ...args);
  }
  boundingBox() {
    return this.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return r.width || r.height ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    });
  }
  async click() {
    await this.evaluate((e) => e.scrollIntoView({ block: "center", inline: "center" }));
    const b = await this.boundingBox();
    if (!b) throw new Error("the element has no box to click");
    await this.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
  async hover() {
    await this.evaluate((e) => e.scrollIntoView({ block: "center", inline: "center" }));
    const b = await this.boundingBox();
    if (b) await this.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  }
  async screenshot({ path } = {}) {
    await this.page.focus();
    const png = Buffer.from(await this.page.d.call("GET", `/element/${this.id}/screenshot`), "base64");
    if (path) writeFileSync(path, png);
    return png;
  }
}

class Page {
  constructor(browser, handle) {
    this.browser = browser;
    this.d = browser.d;
    this.handle = handle;
    this.handlers = { pageerror: [] };
    this.chrome = 0;
    const page = this;
    this.mouse = {
      x: 0,
      y: 0,
      async move(x, y) {
        await page.focus();
        this.x = Math.round(x);
        this.y = Math.round(y);
        await page.d.call("POST", "/actions", { actions: [{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: this.x, y: this.y, origin: "viewport", duration: 0 }] }] });
      },
      async down() {
        await page.focus();
        await page.d.call("POST", "/actions", { actions: [{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerDown", button: 0 }] }] });
      },
      async up() {
        await page.focus();
        await page.d.call("POST", "/actions", { actions: [{ type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerUp", button: 0 }] }] });
      },
      async click(x, y) {
        await this.move(x, y);
        await this.down();
        await this.up();
      },
    };
    this.keyboard = {
      async press(key) {
        await page.keys([KEYS[key] ?? key]);
      },
      async type(text) {
        await page.keys([...text]);
      },
    };
  }
  async keys(values) {
    await this.focus();
    const actions = values.flatMap((value) => [{ type: "keyDown", value }, { type: "keyUp", value }]);
    await this.d.call("POST", "/actions", { actions: [{ type: "key", id: "keyboard", actions }] });
  }
  /** Makes this page's window the one commands go to. */
  async focus() {
    if (this.browser.current !== this.handle) {
      await this.d.call("POST", "/window", { handle: this.handle });
      this.browser.current = this.handle;
    }
  }
  on(event, fn) {
    // Only page errors are reported (requests are refused by setRequestInterception); any other listener just hears nothing.
    if (event === "pageerror") this.handlers.pageerror.push(fn);
    return this;
  }
  async goto(url) {
    await this.focus();
    await this.d.call("POST", "/url", { url });
  }
  async setViewport({ width, height }) {
    await this.focus();
    if (!this.chrome) {
      const [ih, oh] = await this.evaluate(() => [innerHeight, outerHeight]);
      this.chrome = Math.max(0, oh - ih);
    }
    await this.d.call("POST", "/window/rect", { width, height: height + this.chrome });
  }
  async evaluate(fn, ...args) {
    await this.focus();
    const isFn = typeof fn === "function";
    const r = await this.d.call("POST", "/execute/async", { script: RUN, args: [isFn ? fn.toString() : String(fn), isFn, ...args] });
    for (const e of r.errs ?? []) for (const h of this.handlers.pageerror) h(new Error(e));
    if (r.e) throw new Error(r.e);
    return wrap(this, r.v);
  }
  async waitForFunction(fn, opts = {}, ...args) {
    const until = Date.now() + (opts.timeout ?? 30000);
    for (;;) {
      const v = await this.evaluate(fn, ...args).catch(() => null);
      if (v) return v;
      if (Date.now() > until) throw new Error(`waitForFunction timed out: ${String(fn).slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, opts.polling === "raf" || !opts.polling ? 100 : opts.polling));
    }
  }
  async waitForSelector(selector, opts = {}) {
    await this.waitForFunction((s) => !!document.querySelector(s), opts, selector);
    return this.$(selector);
  }
  async $(selector) {
    await this.focus();
    try {
      const e = await this.d.call("POST", "/element", { using: "css selector", value: selector });
      return new Element(this, e[ELEMENT]);
    } catch {
      return null;
    }
  }
  async $$(selector) {
    await this.focus();
    return (await this.d.call("POST", "/elements", { using: "css selector", value: selector })).map((e) => new Element(this, e[ELEMENT]));
  }
  async must(selector) {
    const e = await this.$(selector);
    if (!e) throw new Error(`No element found for selector: ${selector}`);
    return e;
  }
  async click(selector) {
    await (await this.must(selector)).click();
  }
  async hover(selector) {
    await (await this.must(selector)).hover();
  }
  async type(selector, text) {
    await this.click(selector);
    await this.keyboard.type(text);
  }
  async addScriptTag({ content }) {
    await this.evaluate((c) => {
      const s = document.createElement("script");
      s.textContent = c;
      document.head.append(s);
    }, content);
  }
  async screenshot({ path } = {}) {
    await this.focus();
    const png = Buffer.from(await this.d.call("GET", "/screenshot"), "base64");
    if (path) writeFileSync(path, png);
    return png;
  }
  async emulateMediaFeatures() {
    throw new Unsupported("Safari's WebDriver can't emulate media features");
  }
  async setRequestInterception() {
    throw new Unsupported("Safari's WebDriver can't intercept requests");
  }
  async close() {
    await this.focus();
    await this.d.call("DELETE", "/window");
    // Back to the session's first window: WebDriver needs a current one to open the next.
    await this.d.call("POST", "/window", { handle: this.browser.home });
    this.browser.current = this.browser.home;
  }
}

/** Element references in a returned value become handles. */
function wrap(page, v) {
  if (Array.isArray(v)) return v.map((x) => wrap(page, x));
  if (v && typeof v === "object") {
    if (ELEMENT in v) return new Element(page, v[ELEMENT]);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wrap(page, x)]));
  }
  return v;
}

class Browser {
  constructor(driver, d, home) {
    this.driver = driver;
    this.d = d;
    // The session's first window stays open (closing the last one ends the session).
    this.home = home;
    this.current = home;
  }
  async newPage() {
    const { handle } = await this.d.call("POST", "/window/new", { type: "tab" });
    const page = new Page(this, handle);
    await page.focus();
    return page;
  }
  async close() {
    await this.d.call("DELETE", "").catch(() => {});
    this.driver.kill();
  }
}

/** Starts safaridriver and a session. */
export async function launchSafari() {
  const port = await freePort();
  const driver = spawn("safaridriver", ["-p", String(port)], { stdio: "ignore" });
  // A test that fails half way still lets Safari go: it takes one session at a time.
  process.on("exit", () => driver.kill());
  let last;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capabilities: { alwaysMatch: { browserName: "safari" } } }) });
      const j = await r.json();
      if (j.value?.sessionId) {
        const d = new Driver(port, j.value.sessionId);
        await d.call("POST", "/timeouts", { script: 120000, pageLoad: 60000 });
        return new Browser(driver, d, await d.call("GET", "/window"));
      }
      last = j.value?.message;
      if (/remote automation/i.test(last ?? "")) break;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  driver.kill();
  throw new Error(`Safari didn't start a session: ${last}`);
}
