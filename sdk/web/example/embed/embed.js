// What every host page in this folder shares (roadmap C6): with ?sdk=1 the
// SDK's stylesheet goes in after the host's own, as an app would import it,
// and every sample in test/fixtures/components.json is drawn into the
// page's slot, each in an answer of ?width= pixels (the same width our own
// page, plain.html, gives it). Without it the page is the host alone.

const q = new URLSearchParams(location.search);
export const withSdk = q.get("sdk") === "1";

/** The reader's light or dark, for hosts that switch by a class or an attribute. */
export const dark = matchMedia("(prefers-color-scheme: dark)").matches;

export async function embed(slot) {
  if (!withSdk) {
    window.ready = true;
    return;
  }
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = new URL("../../dist/morphscreen.css", import.meta.url).href;
  const loaded = new Promise((r) => (css.onload = r));
  document.head.appendChild(css);
  await loaded;
  const { loadCore, createAnswer } = await import("../../dist/index.js");
  const core = await loadCore(new URL("../../dist/morphscreen.wasm", import.meta.url));
  const { packs, samples } = await (await fetch(new URL("../../../../test/fixtures/components.json", import.meta.url))).json();
  const width = Number(q.get("width") ?? 720);
  for (const s of samples) {
    const el = document.createElement("div");
    el.dataset.sample = s.id;
    el.style.width = `${width}px`;
    el.style.maxWidth = "none";
    slot.appendChild(el);
    const a = createAnswer(el, { core, packs: packs.filter((p) => p !== "core") });
    a.push(s.md);
    a.end();
  }
  await document.fonts.ready;
  window.ready = true;
}
