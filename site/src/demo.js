// /demo's controller: sends both frames the same answer at the same moment,
// and shows what each measured. Replays on a click or a new brief.
(() => {
  const panes = { ours: document.querySelector('iframe[src$="ours.html"]'), openui: document.querySelector('iframe[src$="openui.html"]') };
  const note = document.getElementById("demo-note");
  const replay = document.getElementById("demo-replay");
  const ready = new Set();
  let data = null;
  let brief = document.querySelector("[data-brief]").dataset.brief;
  let run = 0;
  let waiting = new Set();
  const fmt = (ms) => (ms === null ? "none" : ms < 1 ? "under 1 ms" : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`);
  const stats = (side, r) => {
    const dl = document.querySelector(`.demo__stats[data-side="${side}"]`);
    dl.textContent = "";
    const rows = r.error ? [["Stopped", r.error]] : [["First words", fmt(r.first)], ["Layout shift", r.cls === null ? "not measured here" : r.cls.toFixed(3)], ["Drawing and layout", fmt(r.busy)], ["Done in", fmt(r.total)]];
    for (const [k, v] of rows) {
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = k;
      dd.textContent = v;
      dl.append(dt, dd);
    }
  };
  const play = () => {
    if (!data || ready.size < 2) return;
    const b = data.briefs.find((x) => x.id === brief);
    run++;
    waiting = new Set(["ours", "openui"]);
    replay.disabled = true;
    note.textContent = `Streaming "${b.label}" from ${data.model} into both, ${data.pace.chunk} characters every ${data.pace.every} ms.`;
    for (const d of document.querySelectorAll(".demo__stats")) d.textContent = "";
    for (const [side, frame] of Object.entries(panes)) frame.contentWindow.postMessage({ type: "play", run, text: side === "ours" ? b.ours : b.openui, ...data.pace }, location.origin);
  };
  addEventListener("message", (e) => {
    if (e.origin !== location.origin) return;
    if (e.data?.type === "ready") {
      ready.add(e.data.side);
      if (ready.size === 2 && data) (replay.disabled = false), play();
    }
    if (e.data?.type === "done" && e.data.run === run) {
      stats(e.data.side, e.data);
      waiting.delete(e.data.side);
      if (!waiting.size) {
        replay.disabled = false;
        note.textContent = "Done. Replay it, or pick another answer.";
      }
    }
  });
  fetch("/demo/answers.json")
    .then((r) => r.json())
    .then((d) => {
      data = d;
      if (ready.size === 2) (replay.disabled = false), play();
    });
  replay.addEventListener("click", play);
  for (const b of document.querySelectorAll("[data-brief]"))
    b.addEventListener("click", () => {
      for (const o of document.querySelectorAll("[data-brief]")) o.setAttribute("aria-checked", String(o === b));
      brief = b.dataset.brief;
      play();
    });
})();
