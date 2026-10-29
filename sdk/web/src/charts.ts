// Charts that answer the pointer: hover or tap shows the values at that spot
// in a tooltip (taken from the chart's data table, as the answer wrote them),
// with a crosshair and a dot on each series for lines and areas, a band over
// bars, and the slice for pies. Legend items switch a series on and off.
// Without script the chart is the same picture and the table is what a screen
// reader reads; nothing here is needed to understand the chart.

const SVG = "http://www.w3.org/2000/svg";

type Data = { head: string[]; rows: string[][] };

const num = (s: string) => {
  const v = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(v) ? v : NaN;
};

function readTable(fig: HTMLElement): Data | null {
  const table = (fig.closest(".ms-chart-fit") ?? fig).querySelector<HTMLTableElement>("table.ms-chart-data");
  if (!table?.tHead || !table.tBodies[0]) return null;
  const head = Array.from(table.tHead.rows[0].cells, (c) => c.textContent ?? "");
  const rows = Array.from(table.tBodies[0].rows, (r) => Array.from(r.cells, (c) => c.textContent ?? ""));
  return { head, rows };
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export interface ChartOptions {
  /**
   * Draws the chart again without the series in `hidden` and morphs to it
   * (the renderer asks the core); returns what's on the page now. Without it,
   * a switched-off series just fades.
   */
  redraw?: (hidden: number[]) => void;
  /** Series switched off already (a chart drawn again keeps the reader's choice). */
  off?: number[];
}

/** Makes every chart under `root` respond; returns a function that undoes it. */
export function enhanceCharts(root: ParentNode, opts: ChartOptions = {}): () => void {
  const offs: (() => void)[] = [];
  // The root itself may be the chart (a chart drawn alone in a narrow cell).
  const figs = [...(root instanceof HTMLElement && root.matches("figure.ms-chart") ? [root] : []), ...root.querySelectorAll<HTMLElement>("figure.ms-chart")];
  for (const fig of figs) {
    if (fig.dataset.live) continue;
    const off = enhance(fig, opts);
    if (off) offs.push(off);
  }
  return () => offs.forEach((f) => f());
}

/** Charts whose axis fits the series still shown: switching one off re-flows the rest. */
const REFLOW = new Set(["bar", "stacked", "horizontal", "line", "area", "scatter"]);

function enhance(fig: HTMLElement, opts: ChartOptions): (() => void) | null {
  const found = fig.querySelector<SVGSVGElement>("svg[data-kind]");
  const table = readTable(fig);
  if (!found || !table || !table.rows.length) return null;
  const svg: SVGSVGElement = found;
  const data: Data = table;
  fig.dataset.live = "1";
  const kind = svg.dataset.kind ?? "bar";
  const d = svg.dataset;
  const [l, t, pw, ph, lo, hi, n, xlo, xhi] = ["l", "t", "pw", "ph", "lo", "hi", "n", "xlo", "xhi"].map((k) => parseFloat(d[k] ?? "NaN"));
  // A scatter of numbers has an x axis of its own: rows sit where their first column says.
  const numericX = Number.isFinite(xlo) && Number.isFinite(xhi) && xhi > xlo;
  const xOf = (i: number) => (numericX ? l + ((num(data.rows[i]?.[0] ?? "") - xlo) / (xhi - xlo)) * pw : l + (pw / n) * i + pw / n / 2);
  const series = data.head.slice(1);
  const off = new Set<number>(opts.off ?? []);
  const reflow = !!opts.redraw && REFLOW.has(kind);

  // What this adds isn't in the core's HTML; marked so a page can be compared with it.
  const layer = svgEl("g", { class: "hover", "aria-hidden": "true", "data-ms-added": "1" });
  svg.appendChild(layer);
  const tip = document.createElement("div");
  tip.className = "ms-chart-tip";
  tip.dataset.msAdded = "1";
  tip.setAttribute("aria-hidden", "true");
  fig.appendChild(tip);

  const vb = svg.viewBox.baseVal;
  const toSvg = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const k = vb.width / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  };
  const y = (v: number) => t + ph - ((v - lo) / (hi - lo || 1)) * ph;

  function hide() {
    layer.replaceChildren();
    tip.classList.remove("ms-on");
    svg.querySelectorAll("path.ms-slice.ms-on").forEach((x) => x.classList.remove("ms-on"));
  }

  /** The tooltip for category `i`: its label, then each shown series' value as written. */
  function show(i: number, at: { x: number; y: number }) {
    const row = data.rows[i];
    if (!row) return hide();
    layer.replaceChildren();
    const round = kind === "pie" || kind === "donut";
    let items = round
      ? [{ j: i, name: row[0], value: row[1] ?? "" }]
      : series.map((name, j) => ({ j, name, value: row[j + 1] ?? "" })).filter((s) => !off.has(s.j) && s.value !== "");
    // Several lines: highest first, the way the eye reads them on the chart.
    if (items.length > 1 && (kind === "line" || kind === "area")) items = [...items].sort((a, b) => num(b.value) - num(a.value));
    if (round) {
      const total = data.rows.reduce((a, r) => a + Math.max(0, num(r[1] ?? "") || 0), 0);
      const share = total ? Math.round((Math.max(0, num(row[1] ?? "")) / total) * 100) : 0;
      items = [{ ...items[0], value: `${items[0].value} · ${share}%` }];
      svg.querySelector(`path.ms-slice[data-i="${i}"]`)?.classList.add("ms-on");
    } else if (kind === "horizontal") {
      const bh = ph / n;
      layer.appendChild(svgEl("rect", { class: "band", x: l, y: t + bh * i, width: pw, height: bh }));
    } else if (kind === "line" || kind === "area" || kind === "scatter") {
      const cx = xOf(i);
      layer.appendChild(svgEl("line", { class: "cross", x1: cx, x2: cx, y1: t, y2: t + ph }));
      for (const s of items) {
        const v = num(s.value);
        if (Number.isFinite(v)) layer.appendChild(svgEl("circle", { class: `dot s${s.j + 1}`, cx, cy: y(v), r: 4 }));
      }
    } else if (kind !== "radar") {
      const bw = pw / n;
      layer.appendChild(svgEl("rect", { class: "band", x: l + bw * i, y: t, width: bw, height: ph }));
    }
    tip.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = round ? "" : row[0];
    if (title.textContent) tip.appendChild(title);
    for (const s of items) {
      const line = document.createElement("div");
      const dot = document.createElement("i");
      dot.className = `ms-s${s.j + 1}`;
      const name = document.createElement("span");
      name.textContent = s.name;
      const value = document.createElement("b");
      value.textContent = s.value;
      line.append(dot, name, value);
      tip.appendChild(line);
    }
    tip.classList.add("ms-on");
    // Beside the pointer, kept inside the figure.
    const fr = fig.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    const k = sr.width / vb.width;
    const px = sr.left - fr.left + at.x * k;
    const py = sr.top - fr.top + at.y * k;
    const w = tip.offsetWidth;
    const left = px + 14 + w > fr.width ? Math.max(0, px - 14 - w) : px + 14;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, Math.min(py - tip.offsetHeight / 2, fr.height - tip.offsetHeight))}px`;
  }

  /** Which category is under the pointer, if any. */
  function pick(e: PointerEvent): number | null {
    const p = toSvg(e);
    const target = e.target as Element;
    const i = target.closest?.("[data-i]")?.getAttribute("data-i");
    if (i != null) return Number(i);
    if (!Number.isFinite(n) || n < 1) return null;
    if (kind === "radar") {
      // The spoke nearest the pointer's angle from the centre.
      const a = Math.atan2(p.y - vb.height / 2, p.x - vb.width / 2) + Math.PI / 2;
      return ((Math.round((a / (2 * Math.PI)) * n) % n) + n) % n;
    }
    if (kind === "horizontal") {
      if (p.x < l - 120 || p.x > l + pw || p.y < t || p.y > t + ph) return null;
      return Math.min(n - 1, Math.max(0, Math.floor((p.y - t) / (ph / n))));
    }
    // Anywhere over the plot, its edges and margins included, reads the nearest category.
    if (p.x < l - 16 || p.x > vb.width || p.y < t - 8 || p.y > t + ph + 24) return null;
    if (numericX) {
      // The row whose x is nearest the pointer.
      let best = 0;
      for (let i = 1; i < data.rows.length; i++) if (Math.abs(xOf(i) - p.x) < Math.abs(xOf(best) - p.x)) best = i;
      return best;
    }
    return Math.min(n - 1, Math.max(0, Math.floor((p.x - l) / (pw / n))));
  }

  const move = (e: PointerEvent) => {
    const i = pick(e);
    if (i == null) return hide();
    svg.querySelectorAll("path.ms-slice.ms-on").forEach((s) => s.classList.remove("ms-on"));
    show(i, toSvg(e));
  };
  // Touch: a tap shows it, a tap elsewhere hides it.
  const down = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") move(e);
  };
  const leave = (e: PointerEvent) => {
    if (e.pointerType === "mouse") hide();
  };
  const outside = (e: PointerEvent) => {
    if (!fig.contains(e.target as Node)) hide();
  };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerdown", down);
  svg.addEventListener("pointerleave", leave);
  document.addEventListener("pointerdown", outside);

  // Legend items switch their series on and off: each gets a real button
  // (the list stays a list for screen readers).
  const toggles: (() => void)[] = [];
  fig.querySelectorAll<HTMLLIElement>(".ms-legend li").forEach((li) => {
    const j = Number((li.querySelector("i")?.className.match(/\bms-s(\d+)\b/) ?? [])[1]) - 1;
    if (!(j >= 0) || li.querySelector("button")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(!off.has(j)));
    button.dataset.msWrap = "1";
    button.append(...li.childNodes);
    li.appendChild(button);
    const flip = () => {
      if (off.has(j)) off.delete(j);
      else if (off.size + 1 < series.length || !reflow) off.add(j);
      else return; // The last series shown stays: a chart of nothing says nothing.
      const on = !off.has(j);
      button.setAttribute("aria-pressed", String(on));
      hide();
      if (reflow) {
        // The core draws it again without the series; the rest morph to fill the room.
        opts.redraw!([...off].sort((a, b) => a - b));
        return;
      }
      fig.classList.toggle(`ms-off-s${j + 1}`, !on);
    };
    button.addEventListener("click", flip);
    toggles.push(() => button.removeEventListener("click", flip));
  });

  return () => {
    svg.removeEventListener("pointermove", move);
    svg.removeEventListener("pointerdown", down);
    svg.removeEventListener("pointerleave", leave);
    document.removeEventListener("pointerdown", outside);
    toggles.forEach((f) => f());
    layer.remove();
    tip.remove();
    delete fig.dataset.live;
  };
}
