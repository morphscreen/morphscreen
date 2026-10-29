// Designed controls (roadmap Q11), laid over the core's native ones. The
// native control stays on the page, hidden (data-ms-hidden), and stays what a
// form submits and what the reader's state is read from; what the SDK draws
// is marked data-ms-added, so the page compares equal to the core's HTML.
// Without script the native controls work as they are.
//
// Here: a select's list, a date's month, a time's list, a stepper's minus and
// plus, a drop zone for files, players for audio and video, a carousel's
// arrows, details that open with their plus turning into a minus, tabs whose
// underline slides, a copy button on code, and how numbers, bars and arcs
// arrive as an answer streams.

import { animate } from "motion/mini";
import { ARC, CHECK, MINUS, PAUSE, PLAY, PLUS, SHEET, count, lerp, mark, morph, play, point, reduced } from "./morph";

type Off = () => void;
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  e.dataset.msAdded = "1";
  return e;
};
let uid = 0;
const id = (p: string) => `ms-${p}-${++uid}`;
const hide = (el: HTMLElement) => (el.dataset.msHidden = "1");
/** Sets a native control's value the way a reader would, so forms and state see it. */
function setValue(el: HTMLInputElement | HTMLSelectElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
/** Closes a popover when the reader clicks elsewhere or presses Escape. */
function dismiss(root: HTMLElement, close: () => void): Off {
  const down = (e: PointerEvent) => !root.contains(e.target as Node) && close();
  const key = (e: KeyboardEvent) => e.key === "Escape" && close();
  document.addEventListener("pointerdown", down);
  root.addEventListener("keydown", key);
  return () => {
    document.removeEventListener("pointerdown", down);
    root.removeEventListener("keydown", key);
  };
}
const pop = (menu: HTMLElement) => {
  if (!reduced()) animate(menu, { opacity: [0, 1], transform: ["translateY(-4px)", "translateY(0)"] }, { duration: 0.16 });
};
const chevron = () => {
  const m = mark([[[6, 9], [12, 15], [18, 9]]], "ms-chev");
  return m.svg;
};

// ---------- Select: our own list ----------
function select(sel: HTMLSelectElement): Off {
  const wrap = h("div", "ms-pick");
  const btn = h("button", "ms-control");
  btn.type = "button";
  btn.setAttribute("role", "combobox");
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  const label = (sel.closest("label")?.querySelector(":scope > span")?.textContent ?? sel.getAttribute("aria-label") ?? "").trim();
  const shown = h("span");
  btn.append(shown, chevron());
  const list = h("div", "ms-menu");
  list.setAttribute("role", "listbox");
  list.id = id("list");
  list.hidden = true;
  btn.setAttribute("aria-controls", list.id);
  wrap.append(btn, list);
  sel.after(wrap);
  hide(sel);
  const opts = () => [...sel.options];
  const draw = () => {
    const o = sel.selectedOptions[0];
    shown.textContent = o?.textContent || "";
    shown.classList.toggle("ms-placeholder", !o || o.value === "");
    // Its name holds what it shows, after the field's own (WCAG label in name).
    btn.setAttribute("aria-label", [label, shown.textContent].filter(Boolean).join(": "));
    list.replaceChildren(
      ...opts()
        .filter((x) => x.value !== "" || x.textContent?.trim())
        .map((x, k) => {
          const b = h("div", "ms-opt", x.textContent ?? "");
          b.setAttribute("role", "option");
          b.id = `${list.id}-${k}`;
          b.setAttribute("aria-selected", String(x.selected && x.value !== ""));
          b.dataset.value = x.value;
          b.addEventListener("click", () => {
            setValue(sel, x.value);
            close();
            btn.focus();
          });
          return b;
        }),
    );
  };
  let active = -1;
  const items = () => [...list.querySelectorAll<HTMLElement>(".ms-opt")];
  const move = (k: number) => {
    const all = items();
    active = Math.max(0, Math.min(all.length - 1, k));
    all.forEach((x, i) => x.classList.toggle("ms-active", i === active));
    all[active]?.scrollIntoView({ block: "nearest" });
    if (all[active]) btn.setAttribute("aria-activedescendant", all[active].id);
  };
  let offDismiss: Off | null = null;
  const open = () => {
    draw();
    list.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    wrap.dataset.open = "1";
    pop(list);
    move(Math.max(0, items().findIndex((x) => x.getAttribute("aria-selected") === "true")));
    offDismiss = dismiss(wrap, close);
  };
  function close() {
    list.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    btn.removeAttribute("aria-activedescendant");
    delete wrap.dataset.open;
    offDismiss?.();
    offDismiss = null;
  }
  btn.addEventListener("click", () => (list.hidden ? open() : close()));
  btn.addEventListener("keydown", (e) => {
    if (list.hidden && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      open();
      return;
    }
    if (list.hidden) return;
    if (e.key === "ArrowDown") move(active + 1);
    else if (e.key === "ArrowUp") move(active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(items().length - 1);
    else if (e.key === "Enter" || e.key === " ") items()[active]?.click();
    else if (e.key === "Tab") close();
    else if (e.key.length === 1) {
      const k = items().findIndex((x, i) => i > active && x.textContent?.toLowerCase().startsWith(e.key.toLowerCase()));
      if (k >= 0) move(k);
      return;
    } else return;
    e.preventDefault();
  });
  sel.addEventListener("change", draw);
  draw();
  return () => {
    close();
    wrap.remove();
    delete sel.dataset.msHidden;
  };
}

// ---------- Combobox: the answer's suggestions in a list of ours, filtered as you type ----------
function combobox(input: HTMLInputElement): Off | void {
  const listId = input.getAttribute("list");
  const data = listId ? input.ownerDocument.getElementById(listId) : null;
  if (!listId || !(data instanceof HTMLDataListElement)) return;
  const values = [...data.options].map((o) => o.value).filter(Boolean);
  if (!values.length) return;
  // The browser's own list goes (it can't be styled); the input stays the field the form sends.
  input.dataset.msList = listId;
  input.removeAttribute("list");
  const wrap = h("div", "ms-pick ms-combo");
  delete wrap.dataset.msAdded;
  wrap.dataset.msWrap = "1";
  input.before(wrap);
  const menu = h("div", "ms-menu");
  menu.setAttribute("role", "listbox");
  menu.id = id("list");
  menu.hidden = true;
  wrap.append(input, chevron(), menu);
  const aria = { role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": menu.id };
  Object.entries(aria).forEach(([k, v]) => input.setAttribute(k, v));
  let active = -1;
  const items = () => [...menu.querySelectorAll<HTMLElement>(".ms-opt")];
  const move = (k: number) => {
    const all = items();
    if (!all.length) return;
    active = Math.max(0, Math.min(all.length - 1, k));
    all.forEach((x, i) => x.classList.toggle("ms-active", i === active));
    all[active].scrollIntoView({ block: "nearest" });
    input.setAttribute("aria-activedescendant", all[active].id);
  };
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const hits = values.filter((v) => !q || v.toLowerCase().includes(q));
    menu.replaceChildren(
      ...hits.map((v, k) => {
        const o = h("div", "ms-opt");
        o.setAttribute("role", "option");
        o.id = `${menu.id}-${k}`;
        o.setAttribute("aria-selected", String(v === input.value));
        // The part that matched what was typed, in bold.
        const at = q ? v.toLowerCase().indexOf(q) : -1;
        const word = h("span");
        if (at >= 0) word.append(v.slice(0, at), h("b", undefined, v.slice(at, at + q.length)), v.slice(at + q.length));
        else word.textContent = v;
        o.append(word);
        o.addEventListener("pointerdown", (e) => e.preventDefault());
        o.addEventListener("click", () => {
          setValue(input, v);
          close();
        });
        return o;
      }),
    );
    active = -1;
    input.removeAttribute("aria-activedescendant");
    return hits.length;
  };
  let offDismiss: Off | null = null;
  const open = () => {
    if (!draw()) return close();
    if (!menu.hidden) return;
    menu.hidden = false;
    input.setAttribute("aria-expanded", "true");
    wrap.dataset.open = "1";
    pop(menu);
    offDismiss = dismiss(wrap, close);
  };
  function close() {
    menu.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    delete wrap.dataset.open;
    offDismiss?.();
    offDismiss = null;
  }
  const onInput = () => open();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (menu.hidden) open();
      move(e.key === "ArrowDown" ? active + 1 : active - 1);
    } else if (e.key === "Enter" && !menu.hidden && active >= 0) {
      e.preventDefault();
      items()[active]?.click();
    } else if (e.key === "Escape" || e.key === "Tab") close();
  };
  const onFocus = () => open();
  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKey);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", () => setTimeout(() => !wrap.contains(document.activeElement) && close(), 0));
  return () => {
    close();
    input.removeEventListener("input", onInput);
    input.removeEventListener("keydown", onKey);
    input.removeEventListener("focus", onFocus);
    for (const k of Object.keys(aria)) input.removeAttribute(k);
    input.setAttribute("list", listId);
    delete input.dataset.msList;
    wrap.replaceWith(input);
  };
}

// ---------- Date: a month to pick from ----------
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseIso = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};
function date(input: HTMLInputElement): Off {
  const wrap = h("div", "ms-pick");
  const btn = h("button", "ms-control");
  btn.type = "button";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-expanded", "false");
  const label = input.closest("label")?.querySelector(":scope > span")?.textContent ?? "Date";
  const shown = h("span");
  const icon = mark([[[4, 10], [20, 10]], [[8.5, 3.5], [8.5, 7.5]], [[15.5, 3.5], [15.5, 7.5]]], "ms-cal-icon");
  const box = icon.svg.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "rect"));
  Object.entries({ x: 4, y: 5.5, width: 16, height: 14.5, rx: 2 }).forEach(([k, v]) => box.setAttribute(k, String(v)));
  btn.append(shown, icon.svg);
  const pane = h("div", "ms-menu ms-cal");
  pane.setAttribute("role", "dialog");
  pane.setAttribute("aria-label", `Choose ${label.toLowerCase()}`);
  pane.hidden = true;
  wrap.append(btn, pane);
  input.after(wrap);
  hide(input);
  const min = parseIso(input.min), max = parseIso(input.max);
  let month = parseIso(input.value) ?? new Date();
  month = new Date(month.getFullYear(), month.getMonth(), 1);
  let focus: Date | null = null;
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  const show = () => {
    const v = parseIso(input.value);
    shown.textContent = v ? fmt(v) : input.placeholder || "Pick a date";
    shown.classList.toggle("ms-placeholder", !v);
    btn.setAttribute("aria-label", `${label}: ${shown.textContent}`);
  };
  const out = (d: Date) => (min && d < min) || (max && d > max);
  const draw = () => {
    const picked = input.value;
    const today = iso(new Date());
    const head = h("div", "ms-cal-head");
    const prev = h("button", "ms-icon-btn");
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous month");
    prev.append(mark([[[15, 6], [9, 12], [15, 18]]]).svg);
    const next = h("button", "ms-icon-btn");
    next.type = "button";
    next.setAttribute("aria-label", "Next month");
    next.append(mark([[[9, 6], [15, 12], [9, 18]]]).svg);
    const title = h("span", undefined, `${MONTHS[month.getMonth()]} ${month.getFullYear()}`);
    title.setAttribute("aria-live", "polite");
    head.append(prev, title, next);
    prev.addEventListener("click", () => turn(-1));
    next.addEventListener("click", () => turn(1));
    const grid = h("div", "ms-cal-grid");
    grid.setAttribute("role", "grid");
    for (const w of ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]) grid.append(h("span", "ms-dow", w));
    const lead = (month.getDay() + 6) % 7;
    for (let k = 0; k < lead; k++) grid.append(h("span"));
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let n = 1; n <= days; n++) {
      const day = new Date(month.getFullYear(), month.getMonth(), n);
      const b = h("button", "ms-day", String(n));
      b.type = "button";
      b.dataset.day = iso(day);
      b.setAttribute("aria-label", day.toDateString());
      if (iso(day) === today) b.classList.add("ms-today");
      if (iso(day) === picked) b.setAttribute("aria-pressed", "true");
      b.tabIndex = -1;
      if (out(day)) b.disabled = true;
      b.addEventListener("click", () => {
        setValue(input, iso(day));
        show();
        close();
        btn.focus();
      });
      grid.append(b);
    }
    pane.replaceChildren(head, grid);
  };
  const turn = (by: number) => {
    month = new Date(month.getFullYear(), month.getMonth() + by, 1);
    draw();
    if (!reduced()) animate(pane.querySelector(".ms-cal-grid")!, { opacity: [0.4, 1], transform: [`translateX(${by * 8}px)`, "translateX(0)"] }, { duration: 0.18 });
  };
  const focusDay = (d: Date) => {
    if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) {
      month = new Date(d.getFullYear(), d.getMonth(), 1);
      draw();
    }
    focus = d;
    const b = pane.querySelector<HTMLButtonElement>(`[data-day="${iso(d)}"]`);
    pane.querySelectorAll<HTMLButtonElement>(".ms-day").forEach((x) => (x.tabIndex = x === b ? 0 : -1));
    b?.focus();
  };
  pane.addEventListener("keydown", (e) => {
    if (!focus) return;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) {
      e.preventDefault();
      focusDay(new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() + step));
    }
  });
  let offDismiss: Off | null = null;
  const open = () => {
    const v = parseIso(input.value);
    if (v) month = new Date(v.getFullYear(), v.getMonth(), 1);
    draw();
    pane.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    wrap.dataset.open = "1";
    pop(pane);
    focusDay(v ?? new Date());
    offDismiss = dismiss(wrap, () => {
      close();
      btn.focus();
    });
  };
  function close() {
    pane.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    delete wrap.dataset.open;
    offDismiss?.();
    offDismiss = null;
    focus = null;
  }
  btn.addEventListener("click", () => (pane.hidden ? open() : close()));
  input.addEventListener("change", show);
  show();
  return () => {
    close();
    wrap.remove();
    delete input.dataset.msHidden;
  };
}

// ---------- Time: a list of times ----------
const minutes = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? +m[1] * 60 + +m[2] : NaN;
};
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function time(input: HTMLInputElement): Off {
  const sel = document.createElement("select");
  // Every quarter hour in range (the input's own step if it gives one), as a list.
  const step = Math.max(5, Math.round((Number(input.step) || 900) / 60));
  const lo = Number.isFinite(minutes(input.min)) ? minutes(input.min) : 0;
  const hi = Number.isFinite(minutes(input.max)) ? minutes(input.max) : 24 * 60 - step;
  const have = minutes(input.value);
  const times: number[] = [];
  for (let m = lo; m <= hi; m += step) times.push(m);
  if (Number.isFinite(have) && !times.includes(have)) times.push(have), times.sort((a, b) => a - b);
  const place = new Option(input.placeholder || "Pick a time", "");
  sel.append(place, ...times.map((m) => new Option(hhmm(m), hhmm(m), false, m === have)));
  if (!Number.isFinite(have)) place.selected = true;
  // A stand-in select (never submitted: no name) drives the input.
  sel.dataset.msAdded = "1";
  sel.setAttribute("aria-label", (input.closest("label")?.querySelector(":scope > span")?.textContent ?? "Time").trim());
  sel.addEventListener("change", () => setValue(input, sel.value));
  input.after(sel);
  hide(input);
  const off = select(sel);
  hide(sel);
  return () => {
    off();
    sel.remove();
    delete input.dataset.msHidden;
  };
}

// ---------- Stepper: minus and plus around the number ----------
function stepper(input: HTMLInputElement): Off {
  const box = document.createElement("span");
  box.className = "ms-step";
  box.dataset.msWrap = "1";
  const minus = h("button");
  minus.type = "button";
  minus.setAttribute("aria-label", "Less");
  const plus = h("button");
  plus.type = "button";
  plus.setAttribute("aria-label", "More");
  input.before(box);
  box.append(minus, input, plus);
  const sync = () => {
    const v = Number(input.value);
    minus.disabled = input.min !== "" && v <= Number(input.min);
    plus.disabled = input.max !== "" && v >= Number(input.max);
  };
  const by = (k: number) => {
    if (k < 0) input.stepDown();
    else input.stepUp();
    setValue(input, input.value);
    sync();
    if (!reduced()) animate(input, { transform: [`translateY(${k < 0 ? 3 : -3}px)`, "translateY(0)"], opacity: [0.5, 1] }, { duration: 0.16 });
  };
  minus.addEventListener("click", () => by(-1));
  plus.addEventListener("click", () => by(1));
  input.addEventListener("input", sync);
  sync();
  return () => {
    box.replaceWith(input);
  };
}

// ---------- Files: a drop zone ----------
function dropZone(input: HTMLInputElement): Off {
  const zone = h("div", "ms-drop");
  const what = input.accept.includes("audio") ? "a voice note" : input.accept.includes("image") ? (input.multiple ? "photos" : "a photo") : input.multiple ? "files" : "a file";
  const pick = h("button", "ms-btn ms-secondary ms-small", input.hasAttribute("capture") ? (what === "a voice note" ? "Record" : "Take a photo") : "Choose");
  pick.type = "button";
  const icon = mark(input.accept.includes("audio") ? [[[12, 3.5], [12, 14.5]], [[5.5, 11.5], [12, 18], [18.5, 11.5]]] : [[[12, 15.5], [12, 4.5]], [[7.5, 9], [12, 4.5], [16.5, 9]]], "ms-drop-icon");
  const words = h("span", "ms-drop-text", `Drop ${what} here, or`);
  const list = h("ul", "ms-drop-list");
  zone.append(icon.svg, words, pick, list);
  input.after(zone);
  hide(input);
  pick.addEventListener("click", () => input.click());
  const show = () => {
    const files = [...(input.files ?? [])];
    list.replaceChildren(...files.map((f) => h("li", undefined, `${f.name} · ${f.size < 1e6 ? Math.max(1, Math.round(f.size / 1e3)) + " KB" : (f.size / 1e6).toFixed(1) + " MB"}`)));
    zone.classList.toggle("ms-has", files.length > 0);
  };
  const over = (e: DragEvent) => {
    e.preventDefault();
    zone.classList.add("ms-over");
  };
  const leave = () => zone.classList.remove("ms-over");
  const drop = (e: DragEvent) => {
    e.preventDefault();
    leave();
    const dt = e.dataTransfer;
    if (!dt?.files.length) return;
    const keep = new DataTransfer();
    for (const f of [...dt.files].slice(0, input.multiple ? undefined : 1)) keep.items.add(f);
    input.files = keep.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  zone.addEventListener("dragover", over);
  zone.addEventListener("dragleave", leave);
  zone.addEventListener("drop", drop);
  input.addEventListener("change", show);
  return () => {
    zone.remove();
    delete input.dataset.msHidden;
  };
}

// ---------- Players ----------
const clock = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");
function player(media: HTMLMediaElement, fig: HTMLElement): Off {
  const video = media instanceof HTMLVideoElement;
  fig.dataset.msPlayer = "1";
  media.controls = false;
  const bar = h("div", video ? "ms-player ms-video-bar" : "ms-player ms-audio-bar");
  const toggle = h("button", "ms-play");
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Play");
  const icon = mark(PLAY, undefined, true);
  toggle.append(icon.svg);
  const track = h("input", "ms-seek") as HTMLInputElement;
  track.type = "range";
  track.min = "0";
  track.max = "1000";
  track.value = "0";
  track.setAttribute("aria-label", "Position");
  const at = h("span", "ms-time", "0:00");
  // The caption above says what it is; the bar is only the controls.
  const title = fig.querySelector("figcaption")?.textContent?.trim();
  bar.append(toggle, track, at);
  if (video) {
    // A big play over the picture until it starts (a poster's frame, or a quiet tile without one).
    const big = h("button", "ms-big");
    big.type = "button";
    big.setAttribute("aria-label", `Play ${title ?? "video"}`);
    big.append(mark(PLAY, undefined, true).svg);
    const stage = h("div", "ms-stage");
    stage.dataset.msWrap = "1";
    media.before(stage);
    stage.append(media, big, bar);
    if (!media.poster) stage.classList.add("ms-no-poster");
    big.addEventListener("click", () => media.play().catch(() => {}));
  } else (fig.querySelector("audio") ?? media).after(bar);
  let playing = false;
  const sync = () => {
    const now = !media.paused && !media.ended;
    if (now !== playing) {
      playing = now;
      morph(icon.path, now ? PLAY : PAUSE, now ? PAUSE : PLAY, { closed: true, duration: 0.18 });
      toggle.setAttribute("aria-label", now ? "Pause" : "Play");
      fig.classList.toggle("ms-playing", now || media.currentTime > 0);
    }
  };
  const tick = () => {
    if (media.duration) track.value = String(Math.round((media.currentTime / media.duration) * 1000));
    track.style.setProperty("--ms-p", `${(Number(track.value) / 10).toFixed(1)}%`);
    at.textContent = media.duration ? `${clock(media.currentTime)} / ${clock(media.duration)}` : clock(media.currentTime);
  };
  toggle.addEventListener("click", () => (media.paused ? media.play().catch(() => {}) : media.pause()));
  track.addEventListener("input", () => {
    if (media.duration) media.currentTime = (Number(track.value) / 1000) * media.duration;
    tick();
  });
  for (const ev of ["play", "pause", "ended"]) media.addEventListener(ev, sync);
  for (const ev of ["timeupdate", "durationchange", "loadedmetadata"]) media.addEventListener(ev, tick);
  return () => {
    media.controls = true;
    delete fig.dataset.msPlayer;
    fig.querySelectorAll("[data-ms-added]").forEach((x) => x.remove());
    fig.querySelector(".ms-stage")?.replaceWith(media);
  };
}

// ---------- Carousel: arrows that page ----------
function carousel(fig: HTMLElement): Off | void {
  const rail = fig.querySelector<HTMLElement>(":scope > div");
  if (!rail || rail.children.length < 2) return;
  const nav = h("div", "ms-rail-nav");
  const prev = h("button", "ms-icon-btn");
  prev.type = "button";
  prev.setAttribute("aria-label", "Previous");
  prev.append(mark([[[15, 6], [9, 12], [15, 18]]]).svg);
  const next = h("button", "ms-icon-btn");
  next.type = "button";
  next.setAttribute("aria-label", "Next");
  next.append(mark([[[9, 6], [15, 12], [9, 18]]]).svg);
  nav.append(prev, next);
  fig.append(nav);
  const card = () => (rail.firstElementChild as HTMLElement).offsetWidth + parseFloat(getComputedStyle(rail).columnGap || "12");
  const page = () => Math.max(1, Math.floor((rail.clientWidth + 12) / card())) * card();
  const sync = () => {
    prev.disabled = rail.scrollLeft < 4;
    next.disabled = rail.scrollLeft + rail.clientWidth > rail.scrollWidth - 4;
  };
  prev.addEventListener("click", () => rail.scrollBy({ left: -page(), behavior: reduced() ? "auto" : "smooth" }));
  next.addEventListener("click", () => rail.scrollBy({ left: page(), behavior: reduced() ? "auto" : "smooth" }));
  rail.addEventListener("scroll", sync, { passive: true });
  sync();
  return () => nav.remove();
}

// ---------- Tables: a table wider than its box says so ----------
// data-more names the side (right, left, both) there's more to scroll to;
// theme.css fades that edge. Kept current as it scrolls and as its box resizes.
function scrollEdges(box: HTMLElement): Off {
  const sync = () => {
    const over = box.scrollWidth - box.clientWidth;
    const left = over > 1 && box.scrollLeft > 1;
    const right = over > 1 && box.scrollLeft < over - 1;
    if (left || right) box.dataset.more = left && right ? "both" : left ? "left" : "right";
    else delete box.dataset.more;
  };
  box.addEventListener("scroll", sync, { passive: true });
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(sync) : null;
  ro?.observe(box);
  const table = box.querySelector("table");
  if (table) ro?.observe(table);
  sync();
  return () => {
    box.removeEventListener("scroll", sync);
    ro?.disconnect();
    delete box.dataset.more;
  };
}

// ---------- Details: the plus turns into a minus, the body opens ----------
export function details(d: HTMLDetailsElement): Off | void {
  const summary = d.querySelector(":scope > summary");
  if (!summary || summary.querySelector("[data-ms-added]") || d.matches(".ms-explain, .ms-card")) return;
  const m = mark(d.open ? MINUS : PLUS);
  summary.append(m.svg);
  const click = (e: Event) => {
    e.preventDefault();
    const opening = !d.open;
    morph(m.path, opening ? PLUS : MINUS, opening ? MINUS : PLUS, { duration: 0.22 });
    if (reduced()) {
      d.open = opening;
      return;
    }
    const closed = (summary as HTMLElement).offsetHeight + parseFloat(getComputedStyle(d).paddingTop) + parseFloat(getComputedStyle(d).paddingBottom);
    const from = d.offsetHeight;
    if (opening) d.open = true;
    const to = opening ? d.scrollHeight + (d.offsetHeight - d.clientHeight) : closed;
    d.style.overflow = "hidden";
    play((v) => (d.style.height = `${lerp(from, to, v)}px`), { duration: 0.24, bounce: 0, key: d }).then(() => {
      if (!opening) d.open = false;
      d.style.removeProperty("height");
      d.style.removeProperty("overflow");
      if (!d.getAttribute("style")) d.removeAttribute("style");
    });
  };
  summary.addEventListener("click", click);
  return () => {
    summary.removeEventListener("click", click);
    m.svg.remove();
  };
}

// ---------- Tabs: the underline slides to the chosen tab ----------
export function tabs(el: HTMLElement): Off | void {
  const list = el.querySelector<HTMLElement>(":scope > .ms-tablist");
  if (!list || list.querySelector("[data-ms-added]")) return;
  const line = h("span");
  list.append(line);
  const radios = [...el.querySelectorAll<HTMLInputElement>(":scope > input[type=radio]")];
  const labels = [...list.querySelectorAll<HTMLLabelElement>(":scope > label")];
  const at = () => labels[Math.max(0, radios.findIndex((r) => r.checked))];
  const put = (l: HTMLElement | undefined) => {
    if (!l) return;
    line.style.left = `${l.offsetLeft}px`;
    line.style.width = `${l.offsetWidth}px`;
  };
  put(at());
  const change = () => {
    const l = at();
    const from = [line.offsetLeft, line.offsetWidth];
    play((v) => {
      line.style.left = `${lerp(from[0], l.offsetLeft, v)}px`;
      line.style.width = `${lerp(from[1], l.offsetWidth, v)}px`;
    }, { duration: 0.26, bounce: 0.15, key: line });
    const panel = el.querySelector<HTMLElement>(`:scope > .ms-panels > div:nth-child(${labels.indexOf(l) + 1})`);
    if (panel && !reduced()) animate(panel, { opacity: [0, 1], transform: ["translateY(3px)", "translateY(0)"] }, { duration: 0.18 }).finished.then(() => panel.removeAttribute("style"));
  };
  radios.forEach((r) => r.addEventListener("change", change));
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => put(at())) : null;
  ro?.observe(list);
  return () => {
    ro?.disconnect();
    line.remove();
  };
}

// ---------- Code: a copy button that turns into a check ----------
function copyButton(fig: HTMLElement): Off | void {
  const code = fig.querySelector("pre code");
  if (!code) return;
  const b = h("button", "ms-copy");
  b.type = "button";
  b.setAttribute("aria-label", "Copy code");
  const m = mark(SHEET);
  const back = document.createElementNS("http://www.w3.org/2000/svg", "path");
  back.setAttribute("d", "M15 5H6.5A1.5 1.5 0 0 0 5 6.5V15");
  m.svg.append(back);
  b.append(m.svg);
  const bar = fig.querySelector(":scope > figcaption");
  if (bar) bar.append(b);
  else {
    fig.classList.add("ms-has-copy");
    fig.append(b);
  }
  let t = 0;
  b.addEventListener("click", async () => {
    const text = [...code.children].length ? [...code.children].map((l) => l.textContent).join("\n") : code.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
    b.classList.add("ms-ok");
    b.setAttribute("aria-label", "Copied");
    morph(m.path, SHEET, CHECK, { duration: 0.24, bounce: 0.25 });
    play((v) => (back.style.opacity = String(1 - v)), { duration: 0.14, bounce: 0, key: back });
    clearTimeout(t);
    t = window.setTimeout(() => {
      b.classList.remove("ms-ok");
      b.setAttribute("aria-label", "Copy code");
      morph(m.path, CHECK, SHEET, { duration: 0.22 });
      play((v) => (back.style.opacity = String(v)), { duration: 0.2, bounce: 0, key: back });
    }, 1600);
  });
  return () => b.remove();
}

// ---------- How numbers, bars and arcs arrive while streaming ----------
/** "$48,210" as its parts, so it can count up and end exactly as written. */
function numberParts(s: string) {
  const m = /^(\D*?)(-?[\d,]*\.?\d+)(.*)$/.exec(s.trim());
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const dec = (m[2].split(".")[1] ?? "").length;
  const commas = m[2].includes(",");
  return { pre: m[1], n, post: m[3], fmt: (v: number) => m[1] + (commas ? v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec)) + m[3] };
}
export function arrive(el: HTMLElement, type: string) {
  if (reduced()) return;
  if (type === "Stat" || type === "Sparkline") {
    const v = el.querySelector(".ms-value");
    const p = v ? numberParts(v.textContent ?? "") : null;
    if (v && p && Math.abs(p.n) > 0) {
      const text = v.textContent!;
      count(v, 0, p.n, p.fmt, { duration: 0.6 }).then(() => (v.textContent = text));
    }
    const line = el.querySelector<SVGPolylineElement>("svg polyline");
    if (line) {
      let L = 0;
      try {
        L = line.getTotalLength();
      } catch {}
      if (L > 0) {
        line.style.strokeDasharray = `${L}`;
        play((t) => (line.style.strokeDashoffset = String((1 - t) * L)), { duration: 0.5, bounce: 0, key: line }).then(() => line.removeAttribute("style"));
      }
    }
  } else if (type === "Progress") {
    const bar = el.querySelector("progress");
    if (bar) {
      const to = bar.value;
      play((t) => (bar.value = to * t), { duration: 0.45, bounce: 0, key: bar }).then(() => (bar.value = to));
    }
  } else if (type === "Gauge") {
    const arc = el.querySelector<SVGPathElement>("path.ms-value");
    const big = el.querySelector("strong");
    let L = 0;
    try {
      L = arc?.getTotalLength() ?? 0;
    } catch {}
    if (arc && L > 0) {
      arc.style.strokeDasharray = `${L} ${L + 10}`;
      play((t) => (arc.style.strokeDashoffset = String((1 - t) * L)), { duration: 0.55, bounce: 0.08, key: arc }).then(() => arc.removeAttribute("style"));
    }
    const first = big?.firstChild;
    const p = first?.nodeType === 3 ? numberParts(first.textContent ?? "") : null;
    if (first && p) {
      const text = first.textContent!;
      play((t) => (first.textContent = p.fmt(lerp(0, p.n, t))), { duration: 0.55, bounce: 0, key: first }).then(() => (first.textContent = text));
    }
  } else if (type === "Funnel") {
    el.querySelectorAll<SVGSVGElement>(".ms-bar > svg").forEach((s, k) => {
      s.style.transformOrigin = "0 50%";
      animate(s, { transform: ["scaleX(0)", "scaleX(1)"] }, { duration: 0.4, delay: k * 0.05, ease: [0.2, 0.9, 0.25, 1] }).finished.then(() => {
        s.style.removeProperty("transform");
        s.style.removeProperty("transform-origin");
      });
    });
  }
}

/** A Step that arrives done: its check draws from a point. */
export function stepDone(li: HTMLElement) {
  if (reduced() || !li.classList.contains("ms-done") || li.querySelector("[data-ms-added]")) return;
  const m = mark(point(CHECK), "ms-step-check");
  li.append(m.svg);
  li.dataset.msDrawn = "1";
  morph(m.path, point(CHECK), CHECK, { duration: 0.3, bounce: 0.3 });
}

/** A form's send button: a dot, a spinner arc while it sends, a check when sent (exported for apps). */
export function sending(btn: HTMLElement) {
  const m = mark(point(ARC), "ms-send");
  btn.prepend(m.svg);
  morph(m.path, point(ARC), ARC, { duration: 0.2 });
  const spin = reduced() ? null : animate(m.svg, { transform: ["rotate(0deg)", "rotate(360deg)"] }, { duration: 0.8, repeat: Infinity, ease: "linear" });
  return {
    done: () => {
      spin?.stop();
      m.svg.style.removeProperty("transform");
      return morph(m.path, ARC, CHECK, { duration: 0.28, bounce: 0.3 });
    },
  };
}

/** Lays our controls over the native ones in a component the core just drew. */
export function enhanceControls(el: HTMLElement, type: string): Off | void {
  const offs: Off[] = [];
  const add = (o: Off | void) => o && offs.push(o);
  if (type === "Video" || type === "Audio") {
    const m = el.querySelector<HTMLMediaElement>("video, audio");
    if (m) add(player(m, el));
  }
  if (type === "Carousel") add(carousel(el));
  if (type === "Code" || type === "Diff") add(copyButton(el));
  for (const s of el.querySelectorAll<HTMLSelectElement>("select:not([data-ms-added])")) add(select(s));
  for (const i of el.querySelectorAll<HTMLInputElement>("input[list]")) add(combobox(i));
  for (const i of el.querySelectorAll<HTMLInputElement>("input[type=date]")) add(date(i));
  for (const i of el.querySelectorAll<HTMLInputElement>("input[type=time]")) add(time(i));
  for (const i of el.querySelectorAll<HTMLInputElement>(".ms-stepper input[type=number]")) add(stepper(i));
  for (const i of el.querySelectorAll<HTMLInputElement>("input[type=file]")) add(dropZone(i));
  for (const d of el.querySelectorAll<HTMLDetailsElement>("details")) add(details(d));
  for (const t of el.matches(".ms-table") ? [el] : el.querySelectorAll<HTMLElement>(".ms-table")) add(scrollEdges(t));
  return offs.length ? () => offs.forEach((f) => f()) : undefined;
}

