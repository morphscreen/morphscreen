// What both frames share: stream an answer in pieces at a fixed pace, with
// the page laid out after every piece, and report what it cost: when the
// first words showed, how much the page shifted, the time spent drawing and
// laying out, and the time to the end. `update(text, done)` draws. The frame
// follows the answer down as a chat does, until the reader scrolls it.
export function streams(side, update) {
  // Layout shift is Chromium's to measure; Safari and Firefox don't report it, so there it's null, not 0.
  const shifts = PerformanceObserver.supportedEntryTypes?.includes("layout-shift");
  let cls = 0;
  if (shifts)
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value;
    }).observe({ type: "layout-shift" });
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  let follow = true;
  for (const e of ["wheel", "touchmove", "keydown"]) addEventListener(e, () => (follow = false), { passive: true });
  // The scroll goes in a frame of its own, after the piece's frame is painted:
  // in the same frame as new content, Chrome can count the scroll as the
  // content moving.
  let queued = false;
  const down = () => {
    if (!follow || queued) return;
    queued = true;
    requestAnimationFrame(() =>
      setTimeout(() => {
        queued = false;
        if (follow) scrollTo(0, document.documentElement.scrollHeight);
      }),
    );
  };
  addEventListener("message", async (e) => {
    if (e.origin !== location.origin || e.data?.type !== "play") return;
    const { text, chunk, every, run } = e.data;
    await update(null);
    follow = true;
    scrollTo(0, 0);
    await frames();
    cls = 0;
    let first = null;
    let busy = 0;
    let error = null;
    const t0 = performance.now();
    try {
      for (let i = 0; i < text.length; i += chunk) {
        const s = performance.now();
        await update(text.slice(0, i + chunk), false);
        void document.body.offsetHeight;
        busy += performance.now() - s;
        if (first === null && document.body.innerText.trim()) first = performance.now() - t0;
        down();
        await new Promise((r) => setTimeout(r, every));
      }
      const s = performance.now();
      await update(text, true);
      void document.body.offsetHeight;
      busy += performance.now() - s;
      down();
    } catch (err) {
      error = String(err?.message ?? err).slice(0, 120);
    }
    await frames();
    parent.postMessage({ type: "done", side, run, first, busy, cls: shifts ? cls : null, total: performance.now() - t0, error }, location.origin);
  });
  parent.postMessage({ type: "ready", side }, location.origin);
}
