// The layout checker (roadmap Q2), run in the page on whatever a renderer
// drew: ours and OpenUI's are judged by the same rules, from the DOM and the
// layout alone. window.layoutCheck(root) returns a list of defects.
window.layoutCheck = (root) => {
  const out = [];
  const seen = new Set();
  const say = (el) => {
    const t = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48);
    const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return `${el.tagName ? el.tagName.toLowerCase() : "#text"}${cls}${t ? ` "${t}"` : ""}`;
  };
  const add = (kind, el, detail) => {
    const key = kind + "|" + say(el);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, at: say(el), detail });
  };
  const styles = new Map();
  const cs = (e) => {
    let s = styles.get(e);
    if (!s) styles.set(e, (s = getComputedStyle(e)));
    return s;
  };
  const shown = (e) => {
    const s = cs(e);
    if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const scroller = (e) => /(auto|scroll)/.test(cs(e).overflowX + " " + cs(e).overflowY);
  const inScroller = (e) => {
    for (let p = e.parentElement; p && p !== root; p = p.parentElement) if (scroller(p)) return true;
    return false;
  };
  // Code, fields and drawings, and anything set in a monospace face (a file name over a diff).
  const inCode = (e) => !!e.closest("pre, code, kbd, textarea, input, select, svg, canvas") || /mono/i.test(cs(e).fontFamily);
  const rootRect = root.getBoundingClientRect();
  // Visually hidden text (a chart's data table for screen readers) isn't on screen.
  const els = [...root.querySelectorAll("*")].filter((e) => shown(e) && !e.closest(".ms-sr"));

  // Page scrolls sideways.
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) add("page-overflow", document.documentElement, `${document.documentElement.scrollWidth - vw}px`);

  // Something sticks out of the answer (and isn't inside a scroll area); only the outermost one counts.
  const over = new Set();
  for (const e of els) {
    const r = e.getBoundingClientRect();
    if ((r.right > rootRect.right + 1 || r.left < rootRect.left - 1) && !inScroller(e)) over.add(e);
  }
  for (const e of over) if (!over.has(e.parentElement)) add("overflow", e, `${Math.round(e.getBoundingClientRect().right - rootRect.right)}px past the edge`);

  // Text cut off by a box that hides overflow (not a scroll area, not a visually hidden label).
  for (const e of els) {
    const s = cs(e);
    // A drawing made of text (a star rating) is clipped on purpose.
    if (!/(hidden|clip)/.test(s.overflowX + " " + s.overflowY) || inCode(e) || e.closest("[role=img]")) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || !e.textContent.trim()) continue;
    if (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 2) add("clipped-text", e, `${e.scrollWidth}x${e.scrollHeight} in ${e.clientWidth}x${e.clientHeight}`);
    else if (s.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth) add("clipped-text", e, "ellipsis");
  }

  // Text nodes: words broken across lines, tiny text, cramped lines.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const lineTops = (range) => {
    const tops = [];
    for (const r of range.getClientRects()) if (r.width > 0 && !tops.some((t) => Math.abs(t - r.top) < 3)) tops.push(r.top);
    return tops;
  };
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !shown(el) || inCode(el) || !n.textContent.trim()) continue;
    const size = parseFloat(cs(el).fontSize);
    if (size < 11) add("tiny-text", el, `${size}px`);
    for (const m of n.textContent.matchAll(/\S{2,}/g)) {
      const range = document.createRange();
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      if (lineTops(range).length < 2) continue;
      // Where it broke: after a hyphen or slash is a softer break than inside a word or number.
      let at = 1;
      const top0 = lineTops((() => { const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + 1); return r; })())[0];
      for (; at < m[0].length; at++) {
        const r = document.createRange();
        r.setStart(n, m.index + at);
        r.setEnd(n, m.index + at + 1);
        const t = lineTops(r)[0];
        if (t !== undefined && Math.abs(t - top0) > 3) break;
      }
      const before = m[0][at - 1];
      const token = m[0].replace(/[.,;:!?)"'\]”’]+$/, "").replace(/^["'(\[“‘]+/, "");
      // IDs, codes and numbers (a digit, or two capitals in a row) should never split;
      // prose may break after a hyphen as typesetting always has.
      // A compound like "ML-powered" may break after its hyphen; a code with a digit may not.
      const id = /\d/.test(token) || (/[A-Z]{2}/.test(token) && before !== "-" && before !== "/");
      // Where the text may hyphenate, the browser drew a hyphen at the break: typeset, not broken.
      // (The hyphen isn't in the DOM, so the split shown can be a letter off.)
      const typeset = cs(el).hyphens === "auto" && /^[\p{L}/-]+$/u.test(token);
      // A URL, path or code may break after its slash or semicolon (where the renderers put break points).
      if (before === "/" || before === ";") continue;
      if (id) add("broken-id", el, `"${m[0].slice(0, at)}|${m[0].slice(at)}"`);
      else if (!typeset && !/[-/–—_.]/.test(before)) add("broken-word", el, `"${m[0].slice(0, at)}|${m[0].slice(at)}"`);
    }
  }
  // Headings and labels that leave one short word alone on their last line.
  for (const e of els) {
    if (!e.matches("h1, h2, h3, h4, h5, h6, strong, b, figcaption, legend, th, button, [role=heading]") || inCode(e)) continue;
    // Bold words inside a sentence wrap with the sentence; only a label on its own counts.
    if (e.matches("strong, b") && e.parentElement.textContent.trim() !== e.textContent.trim()) continue;
    const text = e.textContent.trim();
    const words = text.split(/\s+/);
    if (words.length < 3) continue;
    const range = document.createRange();
    range.selectNodeContents(e);
    const tops = lineTops(range);
    if (tops.length < 2) continue;
    const last = words[words.length - 1];
    const r = document.createRange();
    const tn = [...e.childNodes].reverse().find((c) => c.nodeType === 3 && c.textContent.trim());
    if (!tn) continue;
    const i = tn.textContent.lastIndexOf(last);
    if (i < 0) continue;
    r.setStart(tn, i);
    r.setEnd(tn, i + last.length);
    const lastTop = lineTops(r)[0];
    const prev = words[words.length - 2];
    const j = tn.textContent.lastIndexOf(prev, i - 1);
    if (j < 0) continue;
    const r2 = document.createRange();
    r2.setStart(tn, j);
    r2.setEnd(tn, j + prev.length);
    if (lastTop !== undefined && Math.abs(lineTops(r2)[0] - lastTop) > 3 && last.length <= 12) add("stranded-word", e, `"…${prev} | ${last}"`);
  }
  // Chart and map text drawn smaller than 10px once the SVG is scaled to fit.
  for (const svg of root.querySelectorAll("svg")) {
    if (!shown(svg) || !svg.viewBox || !svg.viewBox.baseVal || !svg.viewBox.baseVal.width) continue;
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    for (const t of svg.querySelectorAll("text")) {
      const size = parseFloat(getComputedStyle(t).fontSize) * scale;
      if (size < 10 && t.textContent.trim()) {
        add("tiny-text", svg.closest("figure") || svg, `chart text drawn at ${size.toFixed(1)}px`);
        break;
      }
    }
  }
  // Chart labels drawn over each other (too many rows for the height, crowded ticks).
  for (const svg of root.querySelectorAll("svg")) {
    if (!shown(svg)) continue;
    const boxes = [...svg.querySelectorAll("text")].filter((t) => t.textContent.trim()).map((t) => t.getBoundingClientRect()).filter((r) => r.width > 0);
    let hit = 0;
    for (let i = 0; i < boxes.length && !hit; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        // More than a sliver: a quarter of the smaller label's height and some width.
        if (w > 2 && h > Math.min(a.height, b.height) * 0.25) { hit = 1; break; }
      }
    if (hit) add("overlapping-text", svg.closest("figure") || svg, "chart labels drawn over each other");
  }
  // Cramped: a block of running text getting fewer than 16 characters a line.
  for (const e of els) {
    if (inCode(e) || ![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    const text = e.textContent.trim();
    if (text.length < 40) continue;
    // Lines of text only: a checkbox or icon beside the text isn't a line.
    const tops = [];
    const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const top of lineTops(range)) if (!tops.some((x) => Math.abs(x - top) < 3)) tops.push(top);
    }
    const lines = tops.length;
    if (lines >= 3 && text.length / lines < 16) add("cramped-text", e, `${lines} lines, ${Math.round(text.length / lines)} characters each`);
  }

  // Boxes: a visible surface (its own background or a border) whose text sits too close to its edge.
  const bg = (e) => cs(e).backgroundColor;
  const transparent = (c) => c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
  const surface = (e) => {
    const s = cs(e);
    const border = ["Top", "Right", "Bottom", "Left"].every((k) => parseFloat(s[`border${k}Width`]) >= 1 && !transparent(s[`border${k}Color`]));
    if (border) return true;
    if (transparent(bg(e))) return false;
    for (let p = e.parentElement; p; p = p.parentElement) if (!transparent(bg(p))) return bg(p) !== bg(e);
    return true;
  };
  const cards = els.filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width >= 120 && r.height >= 48 && surface(e) && !inCode(e) && e.textContent.trim() && !e.matches("input, select, textarea, button, a, progress");
  });
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    // What the eye sees near the edge: text and media, cut to any scroll area
    // they sit in (a wide table scrolls; its hidden part isn't near anything).
    const boxes = [];
    const tw = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (!t.textContent.trim() || !t.parentElement || !shown(t.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(t);
      for (const q of range.getClientRects()) boxes.push([t.parentElement, q]);
    }
    for (const m of c.querySelectorAll("img, svg, video, canvas, iframe, input, select, textarea, progress, button")) if (shown(m) && !m.parentElement.closest("svg")) boxes.push([m, m.getBoundingClientRect()]);
    let gap = Infinity;
    for (const [e, q] of boxes) {
      let { left, right, top, bottom } = q;
      for (let p = e.parentElement; p && p !== c; p = p.parentElement) {
        if (!/(auto|scroll|hidden|clip)/.test(cs(p).overflowX)) continue;
        const pr = p.getBoundingClientRect();
        left = Math.max(left, pr.left);
        right = Math.min(right, pr.right);
      }
      if (right - left <= 0 || bottom - top <= 0) continue;
      gap = Math.min(gap, left - r.left, r.right - right, top - r.top, r.bottom - bottom);
    }
    if (gap < 8 && gap > -1) add("tight-padding", c, `${Math.round(gap)}px to the edge`);
  }

  // Rows of cards: a lone card on the last row, and cards of different heights side by side.
  const parents = new Set(cards.map((c) => c.parentElement));
  for (const p of parents) {
    const kids = [...p.children].filter((k) => shown(k) && cards.includes(k));
    if (kids.length < 3) continue;
    const rows = [];
    for (const k of kids) {
      const top = k.getBoundingClientRect().top;
      let row = rows.find((x) => Math.abs(x.top - top) < 4);
      if (!row) rows.push((row = { top, items: [] }));
      row.items.push(k);
    }
    if (rows.length < 2) {
      const hs = kids.map((k) => k.getBoundingClientRect().height);
      if (Math.max(...hs) - Math.min(...hs) > 8) add("uneven-row", p, `heights ${hs.map(Math.round).join(", ")}`);
      continue;
    }
    rows.sort((a, b) => a.top - b.top);
    const last = rows[rows.length - 1];
    const widest = Math.max(...rows.map((x) => x.items.length));
    if (last.items.length === 1 && widest >= 2 && last.items[0].getBoundingClientRect().width < 0.75 * p.getBoundingClientRect().width) add("lone-last-card", p, `rows of ${rows.map((x) => x.items.length).join(", ")}`);
    for (const row of rows) {
      if (row.items.length < 2) continue;
      const hs = row.items.map((k) => k.getBoundingClientRect().height);
      if (Math.max(...hs) - Math.min(...hs) > 8) add("uneven-row", p, `heights ${hs.map(Math.round).join(", ")}`);
    }
  }
  return out;
};
