// The DOM renderer: applies ops to the page as they stream. Containers (Card,
// Columns, Tabs, Form...) are built as they open, so their content appears
// in place; text is drawn from the core's own HTML as it arrives, and every
// other component as soon as its first complete line is there (the core draws
// what is complete so far), each newer drawing patched into the last so what
// is shown stays put and only what's new fades in. When a node closes it's
// patched to the core's final HTML, so the page ends up identical to the
// server-rendered HTML. Finished nodes are never touched again.

import { enhanceCharts } from "./charts";
import { chartOutline, growChart } from "./chartmorph";
import { arrive, details, enhanceControls, stepDone, tabs } from "./controls";
import { keepIds, withPair } from "./text";
import { fadeIn, rise } from "./motion";
import { wordsAfter, wordsBefore } from "./words";
import type { Attrs, Op, Session, Span } from "./core";
import { enhance } from "./device";
import { enhanceInteractive } from "./interactive";
import { fieldState, fill, serialize, type Action } from "./actions";
import { allowedImage, guardImages, imageTile, type MediaOptions } from "./media";
import { appear, glide, patch } from "./patch";
import type { MapTiles } from "./maps";

/** Mounts an app's own component into `el`; may return a cleanup. */
/**
 * Draws one of the app's own components into `el`. It's called when the
 * component opens, with its attributes and `streaming: true`, so something
 * shows while the rest arrives, then again when it's complete, into the same
 * element emptied, after the cleanup it returned (if any) has run. `html` is
 * its content as the core draws it: its own text, then its Buttons, drawn as
 * ours (a tap on one inside the answer sends its ask to onAction by itself).
 * `text` is its own words, and `actions` its Buttons as data, for an app that
 * draws them its own way and sends them with its onAction.
 */
export type Mount = (el: HTMLElement, props: { attrs: Attrs; html: string; text: string; actions: ActionButton[]; streaming: boolean }) => void | (() => void);

/** A Button the model put in an app's own component: it asks (a message to send) or links. */
export type ActionButton = { label: string; ask?: string; href?: string; variant: "primary" | "secondary" | "tertiary" | "danger" };
const VARIANTS = ["secondary", "tertiary", "danger"] as const;

export interface RenderOptions extends MediaOptions {
  /** Called when the user asks (a Button, a follow-up) or submits a form. */
  onAction?: (a: Action) => void;
  /** The app's own components, by name. */
  components?: Record<string, Mount>;
  /** MapLibre GL (the module, or a function that loads it) for live maps; they need `maps` too. */
  maplibre?: unknown;
  /**
   * The app's own map provider and key: tiles under a Map's pins load from
   * it, with its credit. Without one a map is its pins on a plain ground.
   */
  maps?: MapTiles;
  /**
   * An interactive component's state changed because the reader acted,
   * keyed by its node id. Give it back to `applyState` to restore the answer
   * as the reader left it.
   */
  onComponentState?: (node: string, state: unknown) => void;
}

interface Entry {
  id: string;
  type: string;
  attrs: Attrs;
  parent: Entry | null;
  /** Where this node's children go. */
  el: HTMLElement;
  /** The node's own element (null for a group: its children sit in its parent's). */
  own: HTMLElement | null;
  cards: number;
  leaf: boolean;
  closed?: boolean;
  /** Columns: charts and maps waiting for the final cell width. */
  waiting?: { e: Entry; data: any }[];
  /** A chart while it streams: how many rows its drawing has. */
  rows?: number;
  /** A component drawn while it streams: the last drawing, so an unchanged one isn't patched again. */
  drawn?: string;
  /** A block's spans so far, for when the core has no drawing of it on its own. */
  text?: Span[] | string;
  /** A row of columns streaming: how many slots it has, fixed once a second cell shows. */
  slots?: number;
  /** An app's own component: what its last drawing returned to undo itself. */
  off?: () => void;
}

const CONTAINERS = new Set(["root", "Card", "Columns", "Tabs", "Tab", "Details", "Steps", "Step", "Callout", "Form", "group"]);
const BLOCK_LEAVES = new Set(["p", "h", "quote", "code", "li", "cell"]);

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * A picture that doesn't load (blocked, gone, offline) shows what it stood
 * for: a person's initials in an avatar, a tile with the description
 * elsewhere, never the browser's broken-image icon.
 */
const watched = new WeakSet<HTMLImageElement>();
function fallbackImages(root: HTMLElement) {
  for (const img of Array.from(root.querySelectorAll("img"))) {
    // Drawn again as it streams: each picture is watched once.
    if (watched.has(img)) continue;
    watched.add(img);
    const fail = () => {
      const avatar = img.parentElement?.classList.contains("ms-avatar") ? img.parentElement : null;
      if (avatar) {
        const name = avatar.querySelector("strong")?.textContent ?? "";
        const s = document.createElement("span");
        s.textContent = name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
        img.replaceWith(s);
      } else (img.closest(".ms-pic") ?? img).replaceWith(imageTile(img.alt, !!img.closest(".ms-product")));
    };
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) fail();
    else img.addEventListener("error", fail, { once: true });
  }
}

function fromHtml(html: string): HTMLElement | null {
  const t = document.createElement("template");
  t.innerHTML = html;
  return t.content.firstElementChild as HTMLElement | null;
}

const str = (v: string | true | undefined) => (typeof v === "string" ? v : "");

/** An icon (its path on Phosphor's 256-unit grid, from the core), as the core's HTML draws it. */
function iconSvg(path: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ms-icon");
  svg.setAttribute("viewBox", "0 0 256 256");
  svg.setAttribute("aria-hidden", "true");
  const p = svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "path"));
  p.setAttribute("d", path);
  return svg;
}

const parentOf = (id: string) => (id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : "");

/** Spans while a block is still streaming (the core's HTML replaces them when it closes). */
function spans(target: HTMLElement, raw: Span[] | string, media: MediaOptions) {
  const list: Span[] = typeof raw === "string" ? [{ t: "text", v: raw }] : raw;
  target.textContent = "";
  const add = (parent: Node, s: Span) => {
    switch (s.t) {
      case "text":
        parent.appendChild(document.createTextNode(s.v));
        break;
      case "code":
        parent.appendChild(h("code", undefined, s.v));
        break;
      case "br":
        parent.appendChild(h("br"));
        break;
      case "img": {
        if (!allowedImage(s.src, media)) {
          parent.appendChild(imageTile(s.alt));
          break;
        }
        const i = h("img");
        i.referrerPolicy = "no-referrer";
        i.src = s.src;
        i.alt = s.alt;
        parent.appendChild(i);
        break;
      }
      case "link": {
        const a = h("a");
        a.href = s.href;
        s.c.forEach((c) => add(a, c));
        parent.appendChild(a);
        break;
      }
      case "el": {
        const e = s.type === "Badge" ? h("span", `ms-badge ms-${str(s.attrs.tone) || "neutral"}`) : h("span");
        s.c.forEach((c) => add(e, c));
        parent.appendChild(e);
        break;
      }
      default: {
        const e = document.createElement(s.t);
        s.c.forEach((c) => add(e, c));
        parent.appendChild(e);
      }
    }
  };
  list.forEach((s) => add(target, s));
}

export class Renderer {
  private entries = new Map<string, Entry>();
  private tabs = 0;
  private cleanups: (() => void)[] = [];
  /** Whether we put ms-answer on the root, to take it off again. */
  private marked = false;
  /** Components whose state can be set, by node id. */
  private live = new Map<string, (v: any) => void>();
  /** The state each component last showed, as JSON, so setting it again is a no-op. */
  private shown = new Map<string, string>();
  /** State that came before its component finished streaming. */
  private early = new Map<string, unknown>();

  constructor(
    private root: HTMLElement,
    private session: Session,
    private opts: RenderOptions = {},
  ) {
    this.entries.set("", { id: "", type: "root", attrs: {}, parent: null, el: root, own: root, cards: 0, leaf: false });
    // The stylesheet styles answers only, inside this class (theme.css, roadmap C5).
    this.marked = !root.classList.contains("ms-answer");
    root.classList.add("ms-answer");
    root.addEventListener("click", this.onClick);
    root.addEventListener("submit", this.onSubmit, true);
  }

  apply(ops: Op[]) {
    this.applyOps(ops);
    // Text that changed is drawn now, from the core's HTML for its block.
    for (const e of this.typed) this.drawText(e);
    this.typed.clear();
    // Charts still streaming grow by the rows that have come in, and other
    // components by their complete lines, at most once a frame.
    if ((this.streaming.size || this.drawing.size || this.streamingCols.size) && !this.growSoon) {
      this.growSoon = true;
      const go = () => {
        this.growSoon = false;
        for (const e of this.streaming) this.growing(e);
        for (const e of this.drawing) this.drawLive(e);
        for (const e of this.streamingCols) this.slotPlan(e);
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(go);
      else setTimeout(go, 16);
    }
  }
  private growSoon = false;

  /** Blocks whose text changed in this batch of ops. */
  private typed = new Set<Entry>();
  /** Components on the page drawn as they stream (charts grow on their own). */
  private drawing = new Set<Entry>();
  /** Elements drawn while their component streams (inert until it closes). */
  private provisional = new WeakSet<Element>();

  /** Charts open on the page, drawn again as their rows arrive. */
  private streaming = new Set<Entry>();

  private applyOps(ops: Op[]) {
    for (const op of ops) {
      if (op.op === "open") this.open(op.id, parentOf(op.id), op.type, op.attrs ?? {}, op.icon);
      else if (op.op === "spans") this.spans(op.id, op.spans);
      else if (op.op === "close") this.close(op.id, op.data);
      else if (op.op === "node") {
        this.open(op.id, parentOf(op.id), op.type, op.attrs ?? {}, op.icon);
        if (op.spans !== undefined) this.spans(op.id, op.spans);
        this.close(op.id, op.data);
      }
    }
  }

  /** Sets components' state from outside (an agent's shared state), by node id. */
  applyState(states: Record<string, unknown>) {
    for (const [id, v] of Object.entries(states ?? {})) {
      const json = JSON.stringify(v);
      if (this.shown.get(id) === json) continue;
      const set = this.live.get(id);
      if (!set) {
        this.early.set(id, v);
        continue;
      }
      this.shown.set(id, json);
      set(v);
    }
  }

  private stateOut(id: string, v: unknown) {
    this.shown.set(id, JSON.stringify(v));
    this.opts.onComponentState?.(id, v);
  }

  private settable(id: string, set: (v: any) => void) {
    this.live.set(id, set);
    if (this.early.has(id)) {
      const v = this.early.get(id);
      this.early.delete(id);
      this.shown.set(id, JSON.stringify(v));
      set(v);
    }
  }

  destroy() {
    if (this.marked) this.root.classList.remove("ms-answer");
    this.root.removeEventListener("click", this.onClick);
    this.root.removeEventListener("submit", this.onSubmit, true);
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    this.root.replaceChildren();
  }

  private open(id: string, parentId: string, type: string, attrs: Attrs, icon?: string) {
    const parent = this.entries.get(parentId)!;
    const cards = parent.cards + (parent.type === "Card" ? 1 : 0);
    const e: Entry = { id, type, attrs, parent, el: null!, own: null, cards, leaf: false };
    // Where this node goes in its parent.
    let slot = parent.el;
    if (parent.type === "Columns") {
      slot = h("div", "ms-cell");
      parent.el.appendChild(slot);
      if (!parent.leaf && !parent.closed) this.streamingCols.add(parent);
    }
    const place = (el: HTMLElement) => {
      if (parent.leaf) {
        slot.appendChild(el);
        return;
      }
      if (type === "Button" && parent.type !== "Columns" && parent.type !== "Tabs") {
        const last = slot.lastElementChild as HTMLElement | null;
        let actions = last && last.dataset.actions ? last : null;
        if (!actions) {
          actions = h("div", "ms-actions");
          actions.dataset.actions = "1";
          slot.appendChild(actions);
        }
        actions.appendChild(el);
        return;
      }
      slot.appendChild(el);
    };
    if (parent.leaf) {
      // Inside a component drawn as a whole when it closes: build off-page.
      e.leaf = true;
    }
    switch (type) {
      case "Card": {
        const s = h("section", cards > 0 ? "ms-group" : "ms-card");
        const t = str(attrs.title), sub = str(attrs.subtitle);
        if (t || sub) {
          const head = h("header");
          if (t) {
            const ht = head.appendChild(h(cards > 0 ? "h3" : "h2"));
            ht.innerHTML = withPair(t);
            if (icon) ht.prepend(iconSvg(icon));
          }
          if (sub) head.appendChild(h("p")).innerHTML = keepIds(sub);
          s.appendChild(head);
        }
        e.el = e.own = s;
        // A top-level section rises into place as it opens.
        if (cards === 0) queueMicrotask(() => rise(s));
        break;
      }
      case "Columns": {
        // On the page at once: cells fill slots left to right as they arrive.
        // While the first cell streams, what it holds sets how many slots the
        // row has (the core's cap: one for a wide table, four for small tiles,
        // two for charts, long text or cards); once a second cell shows, the
        // slots are fixed, so no cell moves as the others arrive. When the row
        // closes it takes its final columns (fewer than its slots if fewer
        // cells came), the cells gliding there. Inside a component drawn
        // whole, built off-page.
        const cols = h("div", "ms-cols ms-streaming");
        e.el = e.own = cols;
        if (parent.leaf) {
          e.leaf = true;
          this.entries.set(id, e);
          return;
        }
        place(cols);
        this.entries.set(id, e);
        return;
      }
      case "Tabs": {
        const d = h("div", "ms-tabs");
        d.dataset.tabs = `h${++this.tabs}`;
        d.appendChild(h("div", "ms-tablist"));
        d.appendChild(h("div", "ms-panels"));
        e.el = e.own = d;
        break;
      }
      case "Tab": {
        const tabs = parent.own!;
        const name = tabs.dataset.tabs!;
        const k = tabs.querySelectorAll(":scope > input").length;
        const input = h("input");
        input.type = "radio";
        input.name = name;
        input.id = `${name}-${k}`;
        if (k === 0) input.setAttribute("checked", "");
        const label = h("label");
        label.innerHTML = str(attrs.title) ? withPair(str(attrs.title)) : `Tab ${k + 1}`;
        label.htmlFor = input.id;
        const list = tabs.querySelector(":scope > .ms-tablist")!;
        const panels = tabs.querySelector(":scope > .ms-panels")!;
        tabs.insertBefore(input, list);
        list.appendChild(label);
        const panel = h("div");
        panels.appendChild(panel);
        e.el = e.own = panel;
        this.entries.set(id, e);
        return;
      }
      case "Details": {
        const d = h("details");
        if (attrs.open === true || attrs.open === "true") d.setAttribute("open", "");
        d.appendChild(h("summary")).innerHTML = withPair(str(attrs.title));
        e.el = e.own = d;
        break;
      }
      case "Steps":
        e.el = e.own = h("ol", "ms-steps");
        break;
      case "Step": {
        const li = h("li", `ms-${str(attrs.status) || "todo"}`);
        li.appendChild(h("strong")).innerHTML = withPair(str(attrs.title));
        if (str(attrs.subtitle).trim()) li.appendChild(h("small")).innerHTML = keepIds(str(attrs.subtitle));
        e.el = e.own = li;
        break;
      }
      case "Callout": {
        const a = h("aside", `ms-callout ms-${str(attrs.tone) || "info"}`);
        if (str(attrs.title)) a.appendChild(h("strong")).innerHTML = withPair(str(attrs.title));
        e.el = e.own = a;
        break;
      }
      case "Form": {
        const f = h("form", "ms-form");
        f.method = "post";
        f.enctype = "multipart/form-data";
        e.el = e.own = f;
        // What the reader has typed so far is the form's state.
        const typed = (ev: Event) => {
          if ((ev.target as HTMLInputElement).type !== "file") this.stateOut(id, { fields: fieldState(f) });
        };
        f.addEventListener("input", typed);
        f.addEventListener("change", typed);
        this.cleanups.push(() => {
          f.removeEventListener("input", typed);
          f.removeEventListener("change", typed);
        });
        break;
      }
      case "group":
        // Its children sit where it is (a cell, inside Columns).
        e.el = slot;
        e.own = null;
        break;
      // ---- Markdown blocks ----
      case "p":
        e.el = e.own = h("p");
        break;
      case "h": {
        const level = Math.min(6, Math.max(1, Number(attrs.level || 1)));
        e.el = e.own = h(`h${level}` as "h1");
        break;
      }
      case "quote":
        e.el = e.own = h("blockquote");
        break;
      case "code": {
        const pre = h("pre");
        pre.appendChild(h("code"));
        e.el = e.own = pre;
        break;
      }
      case "hr":
        e.el = e.own = h("hr");
        break;
      case "ul":
      case "ol":
        e.el = e.own = h(type);
        break;
      case "li":
        e.el = e.own = h("li", attrs.task === "done" ? "ms-task ms-done" : attrs.task === "open" ? "ms-task" : undefined);
        break;
      case "table": {
        const wrap = h("div", "ms-table");
        wrap.tabIndex = 0;
        // Shown with its first body row: a header alone takes column widths
        // the rows then change.
        wrap.hidden = true;
        const t = h("table");
        t.appendChild(h("thead"));
        t.appendChild(h("tbody"));
        wrap.appendChild(t);
        e.el = wrap;
        e.own = wrap;
        break;
      }
      case "row": {
        const table = parent.own!.querySelector("table")!;
        const tr = h("tr");
        (attrs.head ? table.tHead! : table.tBodies[0]).appendChild(tr);
        if (!attrs.head) parent.own!.hidden = false;
        e.el = e.own = tr;
        this.entries.set(id, e);
        return;
      }
      case "cell": {
        const head = !!parent.attrs.head;
        e.el = e.own = h(head ? "th" : "td");
        if (!parent.leaf) e.own.dataset.msStreaming = "";
        parent.el.appendChild(e.own);
        this.entries.set(id, e);
        return;
      }
      default: {
        // A component drawn whole when it closes: a placeholder until then;
        // its children (if any) are built off-page.
        const ph = h(type === "Chart" || type === "Map" ? "figure" : "div", "ms-pending");
        ph.dataset.type = type;
        // A chart's placeholder shows its title and axis at once, as the chart
        // will, and outlines its kind under them until its first rows arrive.
        if (type === "Chart") {
          const kind = str(attrs.type).toLowerCase() || "bar";
          const y = kind === "pie" || kind === "donut" ? "" : str(attrs.y);
          if (str(attrs.title) || y) {
            const cap = ph.appendChild(h("figcaption"));
            cap.appendChild(h("span")).innerHTML = withPair(str(attrs.title));
            if (y) cap.appendChild(h("span", "ms-axis", y));
          }
          chartOutline(ph.appendChild(h("div", "ms-plot")), kind);
        }
        if (type === "Chart" && !parent.leaf) this.streaming.add(e);
        // Anything else the core draws is shown from its first complete line (an app's own component waits for its close).
        else if (!parent.leaf && !this.opts.components?.[type]) this.drawing.add(e);
        e.own = ph;
        e.el = h("div");
        e.leaf = true;
        place(ph);
        this.entries.set(id, e);
        // An app's own component is drawn at once from its attributes, and again when it's complete.
        if (this.opts.components?.[type] && !BLOCK_LEAVES.has(type)) this.drawCustom(e, true);
        return;
      }
    }
    if (e.own) place(e.own);
    // While its text arrives a block wraps plainly, so words only ever join
    // the end; its balanced or pretty wrapping comes when it's finished
    // (rebalancing every few words made the words already shown hop lines).
    if (e.own && !e.leaf && BLOCK_LEAVES.has(type)) e.own.dataset.msStreaming = "";
    this.entries.set(id, e);
  }

  private spans(id: string, list: Span[] | string) {
    const e = this.entries.get(id);
    if (!e) return;
    // On the page, drawn from the core's HTML for the block (its keep-together
    // marks and photo markup from the first word, so nothing re-breaks or
    // loads again when it closes); inside a component drawn whole, as spans.
    if (!e.leaf && e.own?.isConnected && BLOCK_LEAVES.has(e.type)) {
      e.text = list;
      this.typed.add(e);
      return;
    }
    this.drawSpans(e, list);
  }

  /** A block's spans drawn by the SDK (inside a component drawn whole, or where the core has no drawing of the block alone). */
  private drawSpans(e: Entry, list: Span[] | string) {
    const target = e.type === "code" ? (e.own!.firstElementChild as HTMLElement) : e.own!;
    if (target) {
      const before = wordsBefore(target);
      spans(target, list, this.opts);
      wordsAfter(target, before);
    }
    // A body cell takes its size classes as its text arrives (the core's cell_class),
    // so nothing re-flows when the cell or its table closes.
    if (e.type === "cell" && target?.tagName === "TD") {
      const n = [...(target.textContent ?? "")].length;
      target.classList.toggle("ms-wide", n > 12);
      target.classList.toggle("ms-long", n > 32);
    }
  }

  private close(id: string, data: any) {
    const e = this.entries.get(id);
    if (!e) return;
    e.closed = true;
    this.streaming.delete(e);
    this.drawing.delete(e);
    this.typed.delete(e);
    if (e.type === "Columns") return this.closeColumns(e);
    // A chart or map is drawn at its cell's width, known when its Columns close.
    if ((e.type === "Chart" || e.type === "Map") && !e.parent?.leaf) {
      for (let a = e.parent; a; a = a.parent)
        if (a.type === "Columns" && !a.closed) {
          (a.waiting ??= []).push({ e, data });
          return;
        }
    }
    if (e.type === "table") {
      e.own!.hidden = false;
      // Body cells came with their column's alignment so far; the final one
      // also covers the header and any column a later row changed.
      const align = (data?.align as string[] | undefined) ?? [];
      e.own!.querySelectorAll("tr").forEach((tr) =>
        [...tr.children].forEach((c, k) => {
          c.classList.toggle("ms-num", align[k] === "right");
          if (!c.classList.length) c.removeAttribute("class");
        }),
      );
      return;
    }
    // A form can be filled in once all its fields are there.
    if (e.type === "Form" && e.own instanceof HTMLFormElement) {
      const f = e.own;
      this.settable(id, (v: { fields?: Record<string, unknown> }) => fill(f, v?.fields ?? {}));
    }
    // Containers get their motion when complete: details open with a morph, tabs slide, a done step draws its check.
    if (e.own && !e.parent?.leaf) {
      const off = e.type === "Details" ? details(e.own as HTMLDetailsElement) : e.type === "Tabs" ? tabs(e.own) : undefined;
      if (off) this.cleanups.push(off);
      if (e.type === "Step") stepDone(e.own);
    }
    // A wide table (four columns or more) takes a row of columns to itself, as the core plans it:
    // a streaming row goes to one slot as soon as such a table's header is in.
    if (e.type === "row" && e.attrs.head && !e.leaf && e.own && e.own.children.length >= 4)
      for (let a = e.parent; a; a = a.parent)
        if (a.type === "Columns" && !a.closed && !a.leaf && a.slots !== 1) this.wideRow(a);
    if (CONTAINERS.has(e.type) || e.type === "ul" || e.type === "ol" || e.type === "row" || e.type === "hr") return;
    if (e.parent?.leaf) return;
    if (BLOCK_LEAVES.has(e.type) || !CONTAINERS.has(e.type)) this.swap(e, data);
  }

  /** A block's text so far, as the core draws it, patched into what's shown. */
  private drawText(e: Entry) {
    if (e.closed || !e.own?.isConnected) return;
    const next = fromHtml(this.session.nodeHtml(e.id));
    if (!next || next.tagName !== e.own.tagName) {
      if (e.text !== undefined) this.drawSpans(e, e.text);
      return;
    }
    guardImages(next, this.opts);
    const before = wordsBefore(e.own);
    const added = patch(e.own, next);
    wordsAfter(e.own, before);
    fallbackImages(e.own);
    // A photo that arrives inside a sentence fades in.
    appear(added.filter((a) => a.tagName === "IMG" || a.classList.contains("ms-pic")));
  }

  /**
   * A component still streaming, drawn from its complete lines so far: the
   * first drawing takes its placeholder's place, and each newer one is
   * patched in, new items fading in. Not interactive until it closes.
   */
  private drawLive(e: Entry) {
    if (e.closed || !e.own) return;
    // A map is drawn at its cell's width, known when its Columns close.
    if (e.type === "Map") for (let a = e.parent; a; a = a.parent) if (a.type === "Columns" && !a.closed) return;
    const html = this.session.nodeHtml(e.id);
    if (!html || html === e.drawn) return;
    const next = fromHtml(html);
    if (!next) return;
    guardImages(next, this.opts);
    // Until something to show has arrived, the placeholder stays.
    if (!next.textContent?.trim() && !next.querySelector("img, svg, video, audio, input, select, textarea, canvas")) return;
    e.drawn = html;
    if (!this.provisional.has(e.own)) {
      next.inert = true;
      this.provisional.add(next);
      e.own.replaceWith(next);
      e.own = next;
      fadeIn(next);
    } else {
      const before = wordsBefore(e.own);
      const added = patch(e.own, next);
      appear(added);
      // New items fade in whole; words added to what was already there fade in one by one.
      wordsAfter(e.own, before, added);
    }
    fallbackImages(e.own);
  }

  /** A streaming row holding a wide table: one slot, the cells gliding into it. */
  private wideRow(cols: Entry) {
    const own = cols.own;
    if (!own?.isConnected) return;
    cols.slots = 1;
    this.streamingCols.delete(cols);
    glide(Array.from(own.children), () => (own.className = "ms-cols ms-streaming ms-up1"));
  }

  /** Rows of columns streaming whose slots may still change (until a second cell shows). */
  private streamingCols = new Set<Entry>();

  /**
   * A streaming row's slots, from the core's plan for what it holds so far:
   * its cap (how many cells a row of this kind holds at most) and how narrow a
   * cell may get. Fixed once a second cell shows, so later cells never move
   * the ones before them; a wide table found later still takes the whole row.
   */
  private slotPlan(cols: Entry) {
    const own = cols.own;
    if (!own?.isConnected || cols.closed) return void this.streamingCols.delete(cols);
    const plan = fromHtml(this.session.nodeHtml(cols.id));
    if (!plan?.classList.contains("ms-cols")) return;
    const c = plan.classList;
    const min = plan.className.match(/\bms-m(\d+)\b/)?.[1];
    // The core's caps (layout.rs): no min is a wide table, one a row; small
    // tiles four. Cards may go three across, but most rows of cards end with
    // two (175 of 233 in the recorded answers), so they stream in two slots.
    const cap = !min ? 1 : min === "140" || (min === "200" && !c.contains("rich")) ? 4 : 2;
    const fixed = own.children.length > 1;
    if (fixed && cap !== 1) return void this.streamingCols.delete(cols);
    if (cap === cols.slots) return;
    cols.slots = cap;
    own.className = `ms-cols ms-streaming ms-up${cap}${min ? ` ms-m${min}` : ""}`;
    if (fixed) this.streamingCols.delete(cols);
  }

  /** A chart still streaming, drawn again when it has more complete rows, its shapes morphing on. */
  private growing(chart: Entry) {
    if (chart.closed || !chart.own) return;
    // In a row of Columns still streaming, the core draws it at the two-across
    // width the row has until it closes; its final width comes when they close.
    const html = this.session.nodeHtml(chart.id);
    const rows = Number(html.match(/data-n="(\d+)"/)?.[1] ?? 0);
    if (!html || rows <= (chart.rows ?? 0)) return;
    chart.rows = rows;
    const el = growChart(chart.own, html);
    if (el) chart.own = el;
  }

  /**
   * An app's own component, drawn by the app into a <div class="ms-custom">:
   * while it streams from its attributes, and once complete with its content
   * as the core draws it (not the half-built tree the SDK keeps while it
   * streams, where its buttons are still placeholders).
   */
  private drawCustom(e: Entry, streaming: boolean) {
    const mount = this.opts.components![e.type];
    e.off?.();
    e.off = undefined;
    let el = e.own;
    if (!el?.classList.contains("ms-custom")) {
      el = h("div", "ms-custom");
      el.dataset.type = e.type;
      el.dataset.msId = e.id;
      if (e.own) e.own.replaceWith(el);
      e.own = el;
      this.cleanups.push(() => e.off?.());
    } else el.textContent = "";
    let html = "";
    let text = "";
    let actions: ActionButton[] = [];
    if (!streaming) {
      const drawn = fromHtml(`<div>${this.session.nodeHtml(e.id)}</div>`);
      if (drawn) {
        guardImages(drawn, this.opts);
        // With no renderer the core lists the attributes first; the app has them as attrs.
        const group = drawn.firstElementChild;
        const content = group?.matches("section.ms-group") && group.firstElementChild?.matches("dl.ms-facts") && drawn.children.length === 1 ? group : drawn;
        content.querySelector(":scope > dl.ms-facts")?.remove();
        html = content.innerHTML;
        actions = [...content.querySelectorAll<HTMLElement>(".ms-btn")].map((b) => {
          const href = b.getAttribute("href") ?? "";
          const variant = VARIANTS.find((v) => b.classList.contains(`ms-${v}`)) ?? "primary";
          const label = (b.textContent ?? "").trim();
          if (href.startsWith("?ask=")) return { label, ask: decodeURIComponent(href.slice(5)), variant };
          return href ? { label, href, variant } : { label, variant };
        });
        const words = content.cloneNode(true) as HTMLElement;
        words.querySelectorAll(".ms-actions").forEach((a) => a.remove());
        text = (words.textContent ?? "").trim();
      }
    }
    const off = mount(el, { attrs: e.attrs, html, text, actions, streaming });
    if (typeof off === "function") e.off = off;
  }

  /** Replaces a finished leaf with the core's HTML for it. */
  private swap(e: Entry, data: any) {
    if (this.opts.components?.[e.type] && !BLOCK_LEAVES.has(e.type)) return this.drawCustom(e, false);
    const html = this.session.nodeHtml(e.id);
    // What's already shown (a block's text, a component drawn while it
    // streamed) is patched to the final drawing in place, so nothing on it
    // blinks or loads again; a placeholder is replaced.
    const shown = !!e.own && !e.own.classList.contains("ms-pending") && e.type !== "Chart";
    // A chart morphs from what it showed while streaming (or rises from its baseline).
    let el = e.type === "Chart" && e.own ? growChart(e.own, html) : fromHtml(html);
    if (!el || !e.own) return;
    const num = e.type === "cell" && e.own.classList.contains("ms-num");
    guardImages(el, this.opts);
    if (shown && el.tagName === e.own.tagName) {
      const before = wordsBefore(e.own);
      patch(e.own, el);
      wordsAfter(e.own, before);
      e.own.removeAttribute("inert");
      e.own.removeAttribute("data-ms-streaming");
      el = e.own;
    }
    if (num) el.classList.add("ms-num");
    el.dataset.msType = e.type;
    el.dataset.msId = e.id;
    const wasPending = e.own.classList.contains("ms-pending");
    if (el !== e.own && !el.isConnected) e.own.replaceWith(el);
    e.own = el;
    // A component that waited behind a placeholder fades in where it stood.
    if (wasPending && e.type !== "Chart") fadeIn(el);
    fallbackImages(el);
    if (el.matches("figure.ms-chart, .ms-chart-fit") || el.querySelector("figure.ms-chart")) this.chartLive(e, el, []);
    // Our controls over the native ones; numbers, bars and arcs arrive moving.
    const controls = enhanceControls(el, e.type);
    if (controls) this.cleanups.push(controls);
    if (wasPending) arrive(el, e.type);
    const live = enhanceInteractive(el, e.type, (a) => this.opts.onAction?.(a), (v) => this.stateOut(e.id, v));
    if (live) {
      this.cleanups.push(live.off);
      if (live.set) this.settable(e.id, live.set);
      return;
    }
    const off = enhance(el, e.type, e.attrs, data, this.opts);
    if (off) this.cleanups.push(off);
  }

  /** A chart answers the pointer; its legend switches series off, the core drawing it again without them. */
  private chartLive(e: Entry, el: HTMLElement, off: number[]) {
    let undo = enhanceCharts(el, {
      off,
      redraw: (hidden) => {
        const html = this.session.nodeHtmlWithout(e.id, hidden);
        if (!html || !e.own) return;
        undo();
        const next = growChart(e.own, html);
        if (!next) return;
        next.dataset.msType = e.type;
        next.dataset.msId = e.id;
        e.own = next;
        this.chartLive(e, next, hidden);
      },
    });
    this.cleanups.push(() => undo());
  }

  /** Columns get their final layout (or become a row of buttons) when they close. */
  private closeColumns(e: Entry) {
    const el = fromHtml(this.session.nodeHtml(e.id));
    if (!el || !e.own) return;
    if (!el.classList.contains("ms-cols")) {
      guardImages(el, this.opts);
      // Buttons side by side: a row of actions, swapped whole.
      e.own.replaceWith(el);
      e.own = el;
      return;
    }
    // Its final columns: the cells glide there from where they streamed in.
    const cells = Array.from(el.children);
    const own = e.own;
    this.streamingCols.delete(e);
    glide(Array.from(own.children), () => {
      own.className = el.className;
      Array.from(own.children).forEach((c, k) => {
        if (cells[k]) c.className = cells[k].className;
      });
    });
    // Charts and maps that waited for their width, unless an outer Columns
    // is still open (then they wait for that one).
    const waiting = e.waiting ?? [];
    e.waiting = [];
    let outer: Entry | null = null;
    for (let a = e.parent; a; a = a.parent)
      if (a.type === "Columns" && !a.closed) {
        outer = a;
        break;
      }
    if (outer) (outer.waiting ??= []).push(...waiting);
    else for (const w of waiting) this.swap(w.e, w.data);
  }

  private onClick = (ev: MouseEvent) => {
    const a = (ev.target as HTMLElement).closest?.("a[href^='?ask=']") as HTMLAnchorElement | null;
    if (!a || !this.root.contains(a)) return;
    ev.preventDefault();
    const node = (a.closest("[data-ms-id]") as HTMLElement | null)?.dataset.msId ?? "";
    this.opts.onAction?.({ type: "ask", text: decodeURIComponent(a.getAttribute("href")!.slice(5)), node });
  };

  private onSubmit = (ev: Event) => {
    const form = ev.target as HTMLFormElement;
    if (!this.root.contains(form)) return;
    ev.preventDefault();
    const submitter = (ev as SubmitEvent).submitter as HTMLElement | null;
    const entry = [...this.entries.values()].find((x) => x.own === form);
    this.opts.onAction?.(serialize(form, { node: entry?.id ?? "", form: str(entry?.attrs.name), button: submitter?.textContent?.trim() ?? "" }));
  };
}
