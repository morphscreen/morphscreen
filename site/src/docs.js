// The docs' script; every page reads fine without it. Tabs (a package
// manager picked once is picked everywhere), copy buttons, Copy Markdown,
// the contents list following the page, and search ("/" or Ctrl/Cmd K).

(() => {
  const store = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  const get = (k) => {
    try {
      return store?.getItem(k) ?? null;
    } catch {
      return null;
    }
  };
  const set = (k, v) => {
    try {
      store?.setItem(k, v);
    } catch {}
  };

  // Tabs.
  const pick = (box, name) => {
    for (const b of box.querySelectorAll('[role="tab"]')) b.setAttribute("aria-selected", String(b.dataset.tab === name));
    for (const p of box.querySelectorAll(".tabs__panel")) p.classList.toggle("on", p.dataset.tab === name);
  };
  for (const box of document.querySelectorAll(".tabs")) {
    const group = box.dataset.tabs;
    const first = box.querySelector('[role="tab"]').dataset.tab;
    const saved = group === "pm" ? get("ms-docs-pm") : null;
    pick(box, saved && box.querySelector(`[role="tab"][data-tab="${saved}"]`) ? saved : first);
    box.classList.add("ready");
    box.addEventListener("click", (e) => {
      const b = e.target.closest('[role="tab"]');
      if (!b) return;
      if (group === "pm") {
        set("ms-docs-pm", b.dataset.tab);
        for (const other of document.querySelectorAll('.tabs[data-tabs="pm"]')) pick(other, b.dataset.tab);
      } else pick(box, b.dataset.tab);
    });
  }

  // Copying.
  const copy = async (text, button) => {
    try {
      await navigator.clipboard.writeText(text);
      const was = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => (button.textContent = was), 1400);
    } catch {
      button.textContent = "Select and copy";
    }
  };
  document.addEventListener("click", (e) => {
    const code = e.target.closest("[data-copy]");
    if (code) copy(code.closest(".cb").querySelector("pre").innerText, code);
    const md = e.target.closest("[data-copy-md]");
    if (md)
      fetch(md.dataset.copyMd)
        .then((r) => r.text())
        .then((t) => copy(t, md));
  });

  // The contents list follows the heading in view.
  const links = new Map([...document.querySelectorAll(".toc a")].map((a) => [a.getAttribute("href").slice(1), a]));
  if (links.size && "IntersectionObserver" in window) {
    const seen = new Set();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) en.isIntersecting ? seen.add(en.target.id) : seen.delete(en.target.id);
        const first = [...links.keys()].find((id) => seen.has(id));
        if (first) for (const [id, a] of links) a.classList.toggle("on", id === first);
      },
      { rootMargin: "-140px 0px -60% 0px" },
    );
    for (const id of links.keys()) {
      const h = document.getElementById(id);
      if (h) io.observe(h);
    }
  }

  // A page's video loads once the page has, and plays while it's in view; with reduced
  // motion it waits, with its controls, for the reader to start it.
  for (const v of document.querySelectorAll("video[data-src]")) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = () => {
      v.src = v.dataset.src;
      if (still) return void (v.controls = true);
      const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()));
      io.observe(v);
    };
    if (document.readyState === "complete") start();
    else addEventListener("load", start, { once: true });
  }

  // Search.
  const dialog = document.getElementById("search");
  if (!dialog) return;
  const input = dialog.querySelector(".search__input");
  const list = dialog.querySelector(".search__results");
  let index = null;
  let opener = null;
  const load = () => (index ??= fetch("/docs/search.json").then((r) => r.json()));
  const words = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);
  const snippet = (text, ws) => {
    const at = Math.max(0, text.toLowerCase().indexOf(ws[0]) - 60);
    return (at ? "..." : "") + text.slice(at, at + 160).trim() + "...";
  };
  const show = async () => {
    const q = input.value.trim();
    list.textContent = "";
    if (!q) return;
    const ws = words(q);
    const pages = await load();
    const hits = [];
    for (const p of pages) {
      const t = p.t.toLowerCase();
      const x = p.x.toLowerCase();
      if (!ws.every((w) => t.includes(w) || x.includes(w))) continue;
      let score = ws.reduce((n, w) => n + (t.includes(w) ? 10 : 0) + (x.includes(w) ? 1 : 0), 0);
      const h = p.h.find(([, ht]) => ws.every((w) => ht.toLowerCase().includes(w)));
      if (h) score += 5;
      hits.push({ p, h, score });
    }
    hits.sort((a, b) => b.score - a.score);
    for (const [i, { p, h }] of hits.slice(0, 12).entries()) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = h ? `${p.u}#${h[0]}` : p.u;
      a.setAttribute("aria-selected", String(i === 0));
      for (const [cls, text] of [["search__where", p.s], ["search__title", h ? `${p.t}: ${h[1]}` : p.t], ["search__snip", snippet(p.x, ws)]]) {
        const s = document.createElement("span");
        s.className = cls;
        s.textContent = text;
        a.append(s);
      }
      li.append(a);
      list.append(li);
    }
    if (!hits.length) {
      const li = document.createElement("li");
      li.className = "search__snip";
      li.textContent = "Nothing in the docs matches that.";
      list.append(li);
    }
  };
  const open = () => {
    opener = document.activeElement;
    dialog.hidden = false;
    input.focus();
    input.select();
    load();
  };
  const close = () => {
    dialog.hidden = true;
    opener?.focus?.();
  };
  for (const b of document.querySelectorAll("[data-search-open]")) b.addEventListener("click", open);
  input.addEventListener("input", show);
  dialog.addEventListener("click", (e) => e.target === dialog && close());
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
    if (dialog.hidden && ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"))) {
      e.preventDefault();
      open();
    } else if (!dialog.hidden && e.key === "Escape") close();
    else if (!dialog.hidden && e.key === "Enter") {
      const first = list.querySelector("a");
      if (first) location.href = first.href;
    }
  });
})();
