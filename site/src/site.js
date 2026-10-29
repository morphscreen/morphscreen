// The site's one script, and nothing on the page needs it to read:
// - where the visit came from (ref, utm_*, or the site that linked here),
//   carried onto the sign-up links so the dashboard records it (N3);
// - the visit, counted by our own API without cookies (N6);
// - the currency and billing period the prices show, kept from the last pick;
// - Microsoft Clarity, loaded only after a yes and once the page is idle (V5);
// - the first screen's video, started once the page has loaded on a screen
//   wider than tall (a phone shows only a strip of it, so it keeps the
//   still), never under reduced motion or Save-Data, paused out of view;
// - copy buttons (data-copy-text);
// - on the landing page: sections arriving once, the answer wiped from its
//   text to its drawing under the pointer, and the same answer streamed live.

(() => {
  const APP = "https://app.morphscreen.com";
  const CLARITY = "z48i0099gs";
  const CHOICE = "ms-recording";
  const store = (kind) => {
    try {
      return window[kind];
    } catch {
      return null;
    }
  };
  const session = store("sessionStorage");
  const local = store("localStorage");
  const get = (s, k) => {
    try {
      return s ? s.getItem(k) : null;
    } catch {
      return null;
    }
  };
  const set = (s, k, v) => {
    try {
      if (s) v === null ? s.removeItem(k) : s.setItem(k, v);
    } catch {}
  };

  // Where the visit came from, kept for the visit as the dashboard keeps it.
  let from = null;
  try {
    from = JSON.parse(get(session, "ms-from") || "null");
  } catch {}
  if (!from || typeof from !== "object") {
    from = {};
    for (const [k, v] of new URLSearchParams(location.search)) if (k === "ref" || k.startsWith("utm_")) from[k] = v.slice(0, 200);
    if (!Object.keys(from).length && document.referrer) {
      try {
        const host = new URL(document.referrer).hostname;
        if (host && !/(^|\.)morphscreen\.com$/.test(host)) from.ref = host;
      } catch {}
    }
    set(session, "ms-from", JSON.stringify(from));
  }
  // The sign-up links carry where the visit came from, and the answer about
  // recording when there is one, so the sign-in page doesn't ask again.
  const carry = () => {
    const rec = get(local, "ms-recording");
    for (const a of document.querySelectorAll(`a[href^="${APP}"]`)) {
      const u = new URL(a.href);
      for (const [k, v] of Object.entries(from)) u.searchParams.set(k, v);
      if (rec === "yes" || rec === "no") u.searchParams.set("rec", rec);
      a.href = u.href;
    }
  };
  carry();

  // The visit: the page and its source; the server counts the visitor once a day.
  const visit = JSON.stringify({ path: location.pathname, source: from.utm_source || from.ref || "" });
  if (!(navigator.sendBeacon && navigator.sendBeacon("/v1/visit", new Blob([visit], { type: "application/json" })))) {
    fetch("/v1/visit", { method: "POST", body: visit, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  }

  // Prices in dollars and by the month for everyone, until a switch is moved;
  // what was picked is kept on this device for the next page.
  for (const name of ["currency", "cycle"]) {
    let kept = null;
    try {
      kept = localStorage.getItem(`ms-${name}`);
    } catch {}
    const radio = kept && document.querySelector(`input[name="${name}"][value="${kept}"]`);
    if (radio) radio.checked = true;
    for (const r of document.querySelectorAll(`input[name="${name}"]`)) {
      r.addEventListener("change", () => {
        try {
          localStorage.setItem(`ms-${name}`, r.value);
        } catch {}
      });
    }
  }

  // Clarity, after a yes. Its consent API (v2) hears the choice before anything loads.
  const step = document.body.dataset.step || "";
  const clarity = (...a) => {
    window.clarity = window.clarity || function () {
      (window.clarity.q = window.clarity.q || []).push(arguments);
    };
    window.clarity(...a);
  };
  let loaded = false;
  const record = () => {
    if (loaded) return;
    loaded = true;
    clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
    clarity("set", "step", step);
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.clarity.ms/tag/${CLARITY}`;
    document.head.append(s);
  };
  const idle = (f) => ("requestIdleCallback" in window ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 2000));
  const banner = document.getElementById("consent");
  const ask = () => banner && (banner.hidden = false);
  const answer = (yes) => {
    set(local, CHOICE, yes ? "yes" : "no");
    carry();
    if (banner) banner.hidden = true;
    if (yes) idle(record);
    else if (loaded) {
      clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
      clarity("consent", false);
    }
  };
  const choice = get(local, CHOICE);
  if (choice === "yes") idle(record);
  else if (choice !== "no") ask();
  document.getElementById("consent-yes")?.addEventListener("click", () => answer(true));
  document.getElementById("consent-no")?.addEventListener("click", () => answer(false));
  document.getElementById("recording-choices")?.addEventListener("click", ask);

  // The video behind the first screen: its poster is the page's picture until then.
  const video = document.querySelector("video[data-src]");
  const still = matchMedia("(prefers-reduced-motion: reduce), (max-aspect-ratio: 11/10)").matches || navigator.connection?.saveData;
  if (video && !still) {
    const start = () => {
      video.src = video.dataset.src;
      video.play().catch(() => {});
      if ("IntersectionObserver" in window)
        new IntersectionObserver(([e]) => (e.isIntersecting ? video.play().catch(() => {}) : video.pause())).observe(video);
    };
    if (document.readyState === "complete") start();
    else addEventListener("load", start, { once: true });
  }

  for (const b of document.querySelectorAll("[data-copy-text]"))
    b.addEventListener("click", async () => {
      const was = b.textContent;
      try {
        await navigator.clipboard.writeText(b.dataset.copyText);
        b.textContent = "Copied";
      } catch {
        b.textContent = "Select it to copy";
      }
      setTimeout(() => (b.textContent = was), 1600);
    });

  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Sections arrive once (their CSS has the choreography): the heading's
  // lines rise, the notes fade up, the cards follow. Nothing waits when
  // motion isn't welcome.
  const arriving = document.querySelectorAll("[data-reveal]");
  if (arriving.length && !calm && "IntersectionObserver" in window) {
    document.documentElement.classList.add("motion");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) (e.target.classList.add("is-in"), io.unobserve(e.target));
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.06 },
    );
    for (const s of arriving) io.observe(s);
  }

  // The answers' own stylesheet, on a page that draws answers under its first
  // screen: fetched once the page has loaded, so the first screen never waits for it.
  const answerCss = document.querySelector("[data-answer-css]")?.dataset.answerCss;
  if (answerCss && !document.querySelector(`link[rel="stylesheet"][href="${answerCss}"]`)) {
    const add = () => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = answerCss;
      document.head.append(l);
    };
    if (document.readyState === "complete") add();
    else addEventListener("load", add, { once: true });
  }

  // One answer as text and as drawn (the landing page). A trail of morphing
  // blobs, drawn into two small canvases that mask the two layers, wipes the
  // text away under the pointer and shows the drawn answer, then closes
  // behind it. The button turns the whole answer over, for touch and keys.
  const morph = document.querySelector("[data-morph]");
  if (morph && "ResizeObserver" in window) {
    const section = morph.closest(".morph");
    const text = morph.querySelector(".morph__layer--text");
    const ui = morph.querySelector(".morph__layer--ui");
    const toggle = morph.querySelector(".morph__toggle");
    const SCALE = 4; // the masks at a quarter size: soft edges, cheap to encode
    const MAX = 60;
    const HEAD = 140;
    const NOISE = 44;
    const PTS = 24;
    const FADE = 0.95;
    const STEP = 8;
    const front = document.createElement("canvas");
    const back = document.createElement("canvas");
    const layers = [
      [front, front.getContext("2d"), text, false],
      [back, back.getContext("2d"), ui, true],
    ];
    let w = 0;
    let h = 0;
    new ResizeObserver(() => {
      w = morph.clientWidth;
      h = morph.clientHeight;
      for (const [c] of layers) (c.width = Math.max(1, Math.ceil(w / SCALE))), (c.height = Math.max(1, Math.ceil(h / SCALE)));
    }).observe(morph);
    for (const [, , el] of layers) {
      el.style.webkitMaskSize = el.style.maskSize = "100% 100%";
      el.style.webkitMaskRepeat = el.style.maskRepeat = "no-repeat";
    }
    section.classList.add("is-live");
    toggle.hidden = false;

    let trail = [];
    let head = 0;
    let over = false;
    let at = null;
    let last = null;
    let time = 0;
    let running = false;
    let hint = null;
    let touched = false;
    let flood = null; // { from, to, start }: the whole answer turning over
    let drawn = false;

    const blob = (ctx, cx, cy, r, t, seed) => {
      if (r < 2) return;
      const pts = [];
      for (let i = 0; i < PTS; i++) {
        const a = (i / PTS) * Math.PI * 2;
        const n = (Math.sin(a * 3 + t * 1.4 + seed) * 0.45 + Math.sin(a * 5 - t * 0.9 + seed * 2.3) * 0.3 + Math.cos(a * 2 + t * 1.8 + seed * 0.7) * 0.25) * NOISE * (r / HEAD);
        pts.push([cx + Math.cos(a) * (r + n), cy + Math.sin(a) * (r + n)]);
      }
      const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      ctx.beginPath();
      const m = mid(pts[PTS - 1], pts[0]);
      ctx.moveTo(m[0], m[1]);
      for (let i = 0; i < PTS; i++) {
        const q = mid(pts[i], pts[(i + 1) % PTS]);
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]);
      }
      ctx.closePath();
      ctx.fill();
    };

    const frame = (now) => {
      time += 0.016;
      // A first look: the pointer's path traced once by itself, until someone moves it.
      if (hint && !touched) {
        const k = (now - hint) / 1700;
        if (k >= 1) (hint = null), (over = false);
        else (over = true), (at = { x: w * (0.12 + 0.76 * k), y: h * (0.4 + 0.16 * Math.sin(k * Math.PI * 2)) });
      }
      head += ((over ? HEAD : 0) - head) * (over ? 0.14 : 0.04);
      if (over && at && head > 5 && (!last || Math.hypot(at.x - last.x, at.y - last.y) > STEP)) {
        trail.push({ x: at.x, y: at.y, r: head, alpha: 1, seed: Math.random() * 100 });
        if (trail.length > MAX) trail.shift();
        last = { ...at };
      }
      // Behind the pointer the blobs shrink rather than fade, so the text and the drawing never show through each other.
      for (const p of trail) (p.r *= FADE), (p.alpha = Math.min(1, p.r / 24));
      trail = trail.filter((p) => p.r > 2);
      let r = 0;
      if (flood) {
        const k = Math.min(1, (now - flood.start) / 760);
        const e = 1 - Math.pow(1 - k, 3);
        r = flood.from + (flood.to - flood.from) * e;
        if (k === 1) {
          section.classList.toggle("is-drawn", drawn);
          flood = null;
          r = 0;
        }
      }
      for (const [c, ctx, el, reveal] of layers) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.fillStyle = "#fff";
        if (!reveal) (ctx.fillRect(0, 0, c.width, c.height), (ctx.globalCompositeOperation = "destination-out"));
        ctx.setTransform(1 / SCALE, 0, 0, 1 / SCALE, 0, 0);
        for (const p of trail) (ctx.globalAlpha = p.alpha), blob(ctx, p.x, p.y, p.r, time, p.seed);
        ctx.globalAlpha = 1;
        if (over && at) blob(ctx, at.x, at.y, head, time, 7);
        if (r > 0) blob(ctx, w / 2, h / 2, r, time, 3);
        const url = `url(${c.toDataURL()})`;
        el.style.webkitMaskImage = el.style.maskImage = url;
      }
      const busy = over || head > 0.5 || trail.length || flood;
      if (busy && !drawn) return requestAnimationFrame(frame);
      if (flood) return requestAnimationFrame(frame);
      running = false;
      // At rest, the layers go back to the stylesheet's masks: the text whole, or the answer drawn.
      for (const [, , el] of layers) el.style.webkitMaskImage = el.style.maskImage = "";
    };
    const run = () => {
      if (!running) (running = true), requestAnimationFrame(frame);
    };
    const spot = (e) => {
      const b = morph.getBoundingClientRect();
      return { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const move = (e) => {
      if (drawn || calm || (e.pointerType === "touch" && e.buttons === 0 && e.type !== "pointerdown")) return;
      touched = true;
      over = true;
      at = spot(e);
      run();
    };
    morph.addEventListener("pointerenter", move);
    morph.addEventListener("pointermove", move);
    morph.addEventListener("pointerdown", move);
    for (const t of ["pointerleave", "pointercancel", "pointerup"])
      morph.addEventListener(t, (e) => {
        if (t === "pointerup" && e.pointerType !== "touch") return;
        over = false;
      });
    if (!calm)
      new IntersectionObserver(
        ([e], o) => {
          if (!e.isIntersecting) return;
          o.disconnect();
          setTimeout(() => {
            if (!touched && !drawn) (hint = performance.now()), run();
          }, 650);
        },
        { threshold: 0.45 },
      ).observe(morph);
    toggle.addEventListener("click", () => {
      drawn = !drawn;
      toggle.setAttribute("aria-pressed", String(drawn));
      toggle.textContent = drawn ? "Show the text" : "Show it drawn";
      over = false;
      if (calm) return section.classList.toggle("is-drawn", drawn);
      const all = Math.hypot(w, h) * 0.62;
      if (!drawn) section.classList.remove("is-drawn");
      flood = drawn ? { from: 0, to: all, start: performance.now() } : { from: all, to: 0, start: performance.now() };
      run();
    });
  }

  // The same answer streaming live beside its call (the landing page): the
  // demo's own frame of the web SDK, sent the answer's text when it comes
  // into view, and again on asking, timed in the reader's browser.
  const live = document.querySelector("iframe[data-stream]");
  if (live && "IntersectionObserver" in window) {
    const again = document.getElementById("live-replay");
    const note = document.getElementById("live-note");
    let words = null;
    let ready = false;
    let seen = false;
    let played = false;
    const play = async () => {
      if (!ready) return;
      played = true;
      again.disabled = true;
      words ??= await fetch(live.dataset.stream).then((r) => (r.ok ? r.text() : null), () => null);
      if (!words) return (note.textContent = "The answer didn't load. Try again."), (again.disabled = false);
      note.textContent = "Streaming.";
      live.contentWindow.postMessage({ type: "play", run: "home", text: words, chunk: calm ? words.length : 32, every: 30 }, location.origin);
    };
    addEventListener("message", (e) => {
      if (e.origin !== location.origin || e.source !== live.contentWindow) return;
      if (e.data?.type === "ready") {
        ready = true;
        if (seen && !played) play();
      } else if (e.data?.type === "done") {
        again.disabled = false;
        const d = e.data;
        note.textContent = d.error ? "It stopped part way. Stream it again." : `In your browser: first words after ${Math.round(d.first ?? 0)} ms, the whole answer in ${(d.total / 1000).toFixed(1)} s, ${Math.round(d.busy)} ms of it spent drawing.`;
      }
    });
    new IntersectionObserver(
      ([e], o) => {
        if (!e.isIntersecting) return;
        o.disconnect();
        seen = true;
        if (ready && !played) play();
      },
      { threshold: 0.35 },
    ).observe(live);
    again.addEventListener("click", play);
  }
})();
