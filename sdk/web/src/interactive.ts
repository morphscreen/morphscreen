// The interactive pack on the web (roadmap Q7): the core's HTML already
// works with no script (radio buttons, an answer behind a disclosure, cards
// that open, checkboxes, starting results). This marks answers, flips cards,
// counts progress and works results out live, and reports what the reader
// did: a quiz's score and a vote ask for the model's next turn; ticks and
// known cards are state the app keeps.
//
// Each component's state also goes out as plain JSON and can be set from
// outside (an agent's shared state, roadmap Q9), the same shape on every
// platform: Quiz {answers: [choice index or null]}, Flashcards {known:
// [card index]}, Poll {vote: option or null}, Checklist {done: [item
// index]}, WhatIf {values: {slider name: number}}. Setting it reports no
// action: the reader didn't act.

import { animate } from "motion/mini";
import type { Action } from "./actions";
import { CHECK, CROSS, lerp, mark, morph, play, point, reduced, reveal } from "./morph";

/** A choice's key turning into a check or a cross (an SVG the SDK adds over the letter). */
function keyMark(label: Element | null | undefined, shape: typeof CHECK) {
  if (!label || label.querySelector(":scope > svg[data-ms-added]")) return;
  const m = mark(point(shape), "ms-mark");
  label.append(m.svg);
  morph(m.path, point(shape), shape, { duration: 0.26, bounce: 0.3 });
}
const shake = (el: Element | null | undefined) => {
  if (el && !reduced()) animate(el, { transform: ["translateX(0)", "translateX(-5px)", "translateX(4px)", "translateX(-2px)", "translateX(0)"] }, { duration: 0.32 }).finished.then(() => (el as HTMLElement).style.removeProperty("transform"));
};

type Report = (a: Action) => void;
/** A component's state, as it changes. */
export type StateOut = (value: Record<string, unknown>) => void;
/** A live component: undo it, or set its state. */
export interface Live {
  off: () => void;
  set?: (value: any) => void;
}

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** A What-if formula's value, from the core's postfix tokens. */
export function evaluate(rpn: string[], value: (name: string) => number | undefined): number | undefined {
  const st: number[] = [];
  for (const t of rpn) {
    if (["+", "-", "*", "/", "^", "%", "min", "max"].includes(t)) {
      const b = st.pop(), a = st.pop();
      if (a === undefined || b === undefined) return undefined;
      if ((t === "/" || t === "%") && b === 0) return undefined;
      st.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : t === "/" ? a / b : t === "%" ? a % b : t === "^" ? a ** b : t === "min" ? Math.min(a, b) : Math.max(a, b));
    } else if (["neg", "round", "floor", "ceil", "abs", "sqrt"].includes(t)) {
      const a = st.pop();
      if (a === undefined) return undefined;
      st.push(t === "neg" ? -a : t === "round" ? Math.round(a) : t === "floor" ? Math.floor(a) : t === "ceil" ? Math.ceil(a) : t === "abs" ? Math.abs(a) : Math.sqrt(a));
    } else {
      const n = Number(t);
      const v = Number.isFinite(n) && t.trim() !== "" ? n : value(t);
      if (v === undefined) return undefined;
      st.push(v);
    }
  }
  const v = st.pop();
  return st.length === 0 && v !== undefined && Number.isFinite(v) ? v : undefined;
}

/** A Result's number as the core writes it. */
export function resultText(v: number | undefined, unit: string, decimals?: number): string {
  if (v === undefined) return "—";
  const d = Math.min(decimals ?? (Math.floor(v) === v ? 0 : 2), 6);
  const [int, frac] = Math.abs(v).toFixed(d).split(".");
  const num = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? `.${frac}` : "");
  const sign = v < 0 ? "−" : "";
  const u = unit.trim();
  if (!u) return sign + num;
  if (["$", "€", "£", "₹", "¥"].includes(u)) return sign + u + num;
  return u === "%" ? `${sign}${num}%` : `${sign}${num} ${u}`;
}

/** A slider's value as its label shows it: with its unit as a Result shows
 * one, or as it is without one. */
export function sliderText(i: HTMLInputElement): string {
  const unit = i.dataset.unit;
  if (unit === undefined) return i.value;
  const v = Number(i.value), places = Number(i.dataset.places ?? 0);
  let d = 0;
  while (d < places && Math.abs(v * 10 ** d - Math.round(v * 10 ** d)) >= 1e-9 * Math.max(Math.abs(v * 10 ** d), 1)) d++;
  return resultText(v, unit, d);
}

function quiz(el: HTMLElement, report: Report, out: StateOut): Live {
  const qs = Array.from(el.querySelectorAll<HTMLElement>("li.ms-question"));
  const score = el.querySelector<HTMLElement>(".ms-score");
  const answers: ({ question: string; choice: string; right: boolean | null } | undefined)[] = [];
  const picked: (number | null)[] = qs.map(() => null);
  const offs: (() => void)[] = [];
  // The answer stays out of sight until a choice is made.
  qs.forEach((q) => (q.dataset.msUnanswered = "1"));
  const mark = (q: HTMLElement, k: number, input: HTMLInputElement) => {
    q.dataset.answered = "1";
    delete q.dataset.msUnanswered;
    input.checked = true;
    const right = q.dataset.answer;
    const ok = right === undefined ? null : input.value === right;
    q.querySelectorAll<HTMLInputElement>("input").forEach((i) => {
      i.disabled = true;
      const label = i.closest("label");
      if (right !== undefined && i.value === right) {
        label?.classList.add("ms-right");
        keyMark(label, CHECK);
      } else if (i === input) {
        label?.classList.add("ms-wrong");
        keyMark(label, CROSS);
        shake(label);
      }
    });
    q.classList.add(ok === null ? "ms-answered" : ok ? "ms-is-right" : "ms-is-wrong");
    const why = q.querySelector<HTMLDetailsElement>("details.ms-explain");
    if (why) {
      why.open = true;
      why.dataset.msShown = "1";
      reveal(why, true);
    }
    answers[k] = { question: text(q.querySelector("legend")), choice: text(input.closest("label")), right: ok };
    picked[k] = Number(input.value);
  };
  const unmark = (q: HTMLElement, k: number) => {
    delete q.dataset.answered;
    q.dataset.msUnanswered = "1";
    q.classList.remove("ms-answered", "ms-is-right", "ms-is-wrong");
    q.querySelectorAll<HTMLInputElement>("input").forEach((i) => {
      i.disabled = false;
      i.checked = false;
      i.closest("label")?.classList.remove("ms-right", "ms-wrong");
    });
    q.querySelectorAll(".ms-mark").forEach((x) => x.remove());
    const why = q.querySelector<HTMLDetailsElement>("details.ms-explain");
    if (why) {
      why.open = false;
      delete why.dataset.msShown;
    }
    answers[k] = undefined;
    picked[k] = null;
  };
  /** The score once every question is answered; true when that just happened. */
  const tally = () => {
    const all = answers.filter(Boolean).length === qs.length;
    if (score) {
      const got = answers.filter((a) => a?.right).length;
      score.hidden = !all;
      if (!all) score.replaceChildren();
      else if (score.dataset.msScore !== `${got}/${qs.length}`) {
        // A ring that fills to the score, the count running up beside it.
        score.dataset.msScore = `${got}/${qs.length}`;
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 56 56");
        svg.setAttribute("aria-hidden", "true");
        svg.dataset.msAdded = "1";
        const ring = svg.appendChild(document.createElementNS(NS, "circle"));
        const fill = svg.appendChild(document.createElementNS(NS, "circle"));
        for (const c of [ring, fill]) {
          c.setAttribute("cx", "28");
          c.setAttribute("cy", "28");
          c.setAttribute("r", "24");
        }
        ring.setAttribute("class", "ms-ring");
        fill.setAttribute("class", "ms-fill");
        fill.setAttribute("transform", "rotate(-90 28 28)");
        const L = 2 * Math.PI * 24;
        fill.setAttribute("stroke-dasharray", `${L}`);
        // The words say the score at once (screen readers, tests); the ring fills to it.
        const words = document.createElement("span");
        words.textContent = `${got} of ${qs.length} right`;
        score.replaceChildren(svg, words);
        fill.setAttribute("stroke-dashoffset", String(L));
        play((v) => fill.setAttribute("stroke-dashoffset", String(L * (1 - (got / qs.length) * v))), { duration: 0.6, bounce: 0, key: score });
      }
    }
    return all;
  };
  qs.forEach((q, k) => {
    const set = q.querySelector("fieldset");
    const onChange = (ev: Event) => {
      const input = ev.target as HTMLInputElement;
      if (input.type !== "radio" || q.dataset.answered) return;
      mark(q, k, input);
      out({ answers: [...picked] });
      if (tally()) report({ type: "quiz", node: el.dataset.msId ?? "", title: el.querySelector(":scope > .ms-caption")?.textContent?.trim() || undefined, score: answers.filter((a) => a?.right).length, total: qs.length, answers: answers as { question: string; choice: string; right: boolean | null }[] });
    };
    set?.addEventListener("change", onChange);
    offs.push(() => set?.removeEventListener("change", onChange));
  });
  return {
    off: () => offs.forEach((f) => f()),
    set: (v: { answers?: (number | null)[] }) => {
      qs.forEach((q, k) => {
        const want = v?.answers?.[k];
        if (typeof want !== "number") {
          if (picked[k] !== null) unmark(q, k);
          return;
        }
        if (picked[k] === want) return;
        if (picked[k] !== null) unmark(q, k);
        const input = q.querySelector<HTMLInputElement>(`input[value="${want}"]`);
        if (input) mark(q, k, input);
      });
      tally();
    },
  };
}

function flashcards(el: HTMLElement, report: Report, out: StateOut): Live {
  const cards = Array.from(el.querySelectorAll<HTMLDetailsElement>("details.ms-card"));
  const known = new Set<number>();
  const line = document.createElement("p");
  line.className = "ms-progress-line";
  line.dataset.msAdded = "1";
  const bar = document.createElement("progress");
  bar.max = cards.length;
  const words = document.createElement("span");
  line.append(bar, words);
  el.querySelector("ol")?.before(line);
  const show = () => {
    bar.value = known.size;
    words.textContent = `${known.size} of ${cards.length} known`;
    cards.forEach((c, k) => c.classList.toggle("ms-known", known.has(k)));
  };
  show();
  const offs: (() => void)[] = [];
  const flip = (ev: Event) => {
    const card = ev.target as HTMLElement;
    if (!reduced()) animate(card, { transform: ["perspective(700px) rotateY(-80deg)", "perspective(700px) rotateY(0deg)"], opacity: [0.6, 1] }, { duration: 0.26, ease: [0.2, 0.9, 0.25, 1] }).finished.then(() => card.removeAttribute("style"));
  };
  cards.forEach((c) => c.addEventListener("toggle", flip));
  offs.push(() => cards.forEach((c) => c.removeEventListener("toggle", flip)));
  cards.forEach((card, k) => {
    // Once turned over, the card asks whether the reader knew it.
    const row = document.createElement("div");
    row.className = "ms-card-actions";
    row.dataset.msAdded = "1";
    for (const [label, knew] of [["Got it", true], ["Again", false]] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ms-btn ms-secondary ms-small";
      b.textContent = label;
      const on = () => {
        if (knew) known.add(k);
        else known.delete(k);
        card.open = false;
        show();
        const list = [...known].sort((a, b) => a - b);
        out({ known: list });
        report({ type: "state", node: el.dataset.msId ?? "", name: "known", value: list.map((i) => text(cards[i].querySelector("summary"))) });
      };
      b.addEventListener("click", on);
      offs.push(() => b.removeEventListener("click", on));
      row.appendChild(b);
    }
    card.appendChild(row);
  });
  // Every card as tall as the tallest one turned over, so turning one moves nothing
  // and a row stays even. Measured on copies, off to the side, once the cards have a width.
  const fit = () => {
    const w = cards[0]?.getBoundingClientRect().width;
    if (!w) return;
    const probe = document.createElement("div");
    probe.dataset.msAdded = "1";
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = `position:absolute;left:0;top:0;width:${w}px;visibility:hidden;pointer-events:none`;
    el.appendChild(probe);
    let tall = 0;
    for (const c of cards) {
      const copy = c.cloneNode(true) as HTMLDetailsElement;
      copy.removeAttribute("id");
      copy.classList.remove("ms-known");
      copy.open = true;
      copy.style.minHeight = "0";
      probe.appendChild(copy);
      tall = Math.max(tall, copy.getBoundingClientRect().height);
    }
    probe.remove();
    if (tall) el.style.setProperty("--ms-card-h", `${Math.ceil(tall)}px`);
  };
  fit();
  let soon = 0;
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => (cancelAnimationFrame(soon), (soon = requestAnimationFrame(fit)))) : null;
  const list = el.querySelector("ol");
  if (list) ro?.observe(list);
  document.fonts?.ready.then(fit);
  offs.push(() => {
    ro?.disconnect();
    el.style.removeProperty("--ms-card-h");
    if (!el.getAttribute("style")) el.removeAttribute("style");
  });
  return {
    off: () => {
      offs.forEach((f) => f());
      el.querySelectorAll("[data-ms-added]").forEach((x) => x.remove());
    },
    set: (v: { known?: number[] }) => {
      known.clear();
      for (const k of v?.known ?? []) if (Number.isInteger(k) && k >= 0 && k < cards.length) known.add(k);
      show();
    },
  };
}

function poll(el: HTMLElement, report: Report, out: StateOut): Live {
  const name = el.dataset.name ?? "";
  const status = document.createElement("p");
  status.className = "ms-poll-status";
  status.dataset.msAdded = "1";
  status.hidden = true;
  el.appendChild(status);
  const change = document.createElement("button");
  change.type = "button";
  change.className = "ms-btn ms-tertiary ms-small";
  change.textContent = "Change vote";
  const inputs = () => Array.from(el.querySelectorAll<HTMLInputElement>("input[type=radio]"));
  const voted = (i: HTMLInputElement) => {
    i.checked = true;
    el.querySelectorAll(".ms-mark").forEach((x) => x.remove());
    keyMark(i.closest("label"), CHECK);
    inputs().forEach((x) => (x.disabled = true));
    status.replaceChildren(`You voted for ${text(i.closest("label"))}. `, change);
    status.hidden = false;
  };
  const open = () => {
    el.querySelectorAll(".ms-mark").forEach((x) => x.remove());
    inputs().forEach((x) => {
      x.disabled = false;
      x.checked = false;
    });
    status.hidden = true;
  };
  const onChange = (ev: Event) => {
    const i = ev.target as HTMLInputElement;
    if (i.type !== "radio") return;
    voted(i);
    out({ vote: i.value });
    report({ type: "vote", node: el.dataset.msId ?? "", name, question: el.querySelector("legend")?.textContent?.trim() || undefined, choice: i.value });
  };
  const onAgain = () => {
    open();
    out({ vote: null });
  };
  el.addEventListener("change", onChange);
  change.addEventListener("click", onAgain);
  return {
    off: () => {
      el.removeEventListener("change", onChange);
      status.remove();
    },
    set: (v: { vote?: string | null }) => {
      const i = typeof v?.vote === "string" ? inputs().find((x) => x.value === v.vote) : undefined;
      if (i) voted(i);
      else open();
    },
  };
}

function checklist(el: HTMLElement, report: Report, out: StateOut): Live {
  const name = el.dataset.name ?? "";
  const boxes = () => Array.from(el.querySelectorAll<HTMLInputElement>("input[type=checkbox]"));
  const bar = el.querySelector("progress");
  const words = el.querySelector(".ms-progress-line span");
  const show = () => {
    const all = boxes();
    const done = all.filter((b) => b.checked);
    if (bar) {
      const from = bar.value, to = done.length;
      play((v) => (bar.value = lerp(from, to, v)), { duration: 0.3, bounce: 0, key: bar }).then(() => (bar.value = to));
    }
    if (words) words.textContent = `${done.length} of ${all.length} done`;
    return all;
  };
  const onChange = (ev: Event) => {
    const box = ev.target as HTMLInputElement;
    if (box.checked && !reduced()) animate(box, { transform: ["scale(.75)", "scale(1)"] }, { duration: 0.22, ease: [0.2, 0.9, 0.25, 1] }).finished.then(() => box.removeAttribute("style"));
    const all = show();
    out({ done: all.flatMap((b, k) => (b.checked ? [k] : [])) });
    report({ type: "state", node: el.dataset.msId ?? "", name, value: all.filter((b) => b.checked).map((b) => text(b.closest("label"))) });
  };
  el.addEventListener("change", onChange);
  return {
    off: () => el.removeEventListener("change", onChange),
    set: (v: { done?: number[] }) => {
      const done = new Set(v?.done ?? []);
      boxes().forEach((b, k) => (b.checked = done.has(k)));
      show();
    },
  };
}

function whatIf(el: HTMLElement, out: StateOut): Live {
  let vars: string[] = [];
  try {
    vars = JSON.parse(el.dataset.vars ?? "[]");
  } catch {}
  // Its own, wherever they sit in it (in Columns, say), not a What-if's inside it.
  const own = (x: Element) => x.closest(".ms-whatif") === el;
  const sliders = Array.from(el.querySelectorAll<HTMLInputElement>("input[type=range]")).filter(own);
  const results = Array.from(el.querySelectorAll<HTMLElement>(".ms-result")).filter(own).map((r) => {
    let rpn: string[] = [];
    try {
      rpn = JSON.parse(r.dataset.formula ?? "[]");
    } catch {}
    return { r, rpn, out: r.querySelector("output"), unit: r.dataset.unit ?? "", decimals: r.dataset.decimals ? Number(r.dataset.decimals) : undefined };
  });
  const run = () => {
    const value = (name: string) => {
      const k = vars.findIndex((v) => v.toLowerCase() === name.toLowerCase());
      const n = k >= 0 ? Number(sliders[k]?.value) : NaN;
      return Number.isFinite(n) ? n : undefined;
    };
    for (const x of results) if (x.out) x.out.textContent = resultText(evaluate(x.rpn, value), x.unit, x.decimals);
  };
  const onInput = () => {
    run();
    out({ values: Object.fromEntries(vars.map((v, k) => [v, Number(sliders[k]?.value)])) });
  };
  el.addEventListener("input", onInput);
  return {
    off: () => el.removeEventListener("input", onInput),
    set: (v: { values?: Record<string, number> }) => {
      vars.forEach((name, k) => {
        const n = v?.values?.[name];
        const s = sliders[k];
        if (!s || typeof n !== "number" || !Number.isFinite(n)) return;
        s.value = String(n);
        const lo = Number(s.min || 0), hi = Number(s.max || 100);
        if (hi > lo) s.style.setProperty("--ms-p", `${(((n - lo) / (hi - lo)) * 100).toFixed(1)}%`);
        const shown = s.parentElement?.querySelector(".ms-range output");
        if (shown) shown.textContent = sliderText(s);
      });
      run();
    },
  };
}

/** Every slider under `root` shows its value as it moves. */
export function liveSliders(root: HTMLElement) {
  const on = (ev: Event) => {
    const i = ev.target as HTMLInputElement;
    if (i.type !== "range") return;
    const out = i.parentElement?.querySelector(".ms-range output");
    if (out) out.textContent = sliderText(i);
    const lo = Number(i.min || 0), hi = Number(i.max || 100);
    if (hi > lo) i.style.setProperty("--ms-p", `${(((Number(i.value) - lo) / (hi - lo)) * 100).toFixed(1)}%`);
  };
  root.addEventListener("input", on);
  return () => root.removeEventListener("input", on);
}

/** Makes an interactive component respond; returns it live, or nothing for other types. */
export function enhanceInteractive(el: HTMLElement, type: string, report: Report, out: StateOut = () => {}): Live | void {
  switch (type) {
    case "Quiz":
      return quiz(el, report, out);
    case "Flashcards":
      return flashcards(el, report, out);
    case "Poll":
      return poll(el, report, out);
    case "Checklist":
      return checklist(el, report, out);
    case "WhatIf": {
      const a = whatIf(el, out),
        b = liveSliders(el);
      return {
        off: () => {
          a.off();
          b();
        },
        set: a.set,
      };
    }
    case "Slider":
      return { off: liveSliders(el) };
  }
}
