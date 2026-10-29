// OpenUI's renderer, streamed the way its apps stream: the response so far,
// re-rendered on every chunk (flushSync so each chunk's work is measured).
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Renderer } from "@openuidev/react-lang";
import { ThemeProvider } from "@openuidev/react-ui";
import { openuiChatLibrary } from "@openuidev/react-ui/genui-lib";

const el = document.getElementById("root");
const root = createRoot(el);
const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const view = (text, streaming) => (
  <ThemeProvider mode="light">
    <Renderer response={text} library={openuiChatLibrary} isStreaming={streaming} />
  </ThemeProvider>
);

// delay 0: CPU mode, each chunk rendered synchronously (flushSync) and timed.
// delay > 0: reading mode, rendered the way apps do (a normal update per
// chunk, a frame to paint). A render error is reported, not thrown.
window.run = async (text, { chunk = 32, delay = 0 } = {}) => {
  flushSync(() => root.render(null));
  window.gc?.();
  const heap0 = performance.memory?.usedJSHeapSize ?? 0;
  let cls = 0;
  const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; });
  po.observe({ type: "layout-shift" });
  const t0 = performance.now();
  let first = null, busy = 0, error = null;
  try {
    for (let i = 0; i < text.length; i += chunk) {
      const s = performance.now();
      if (delay) root.render(view(text.slice(0, i + chunk), true));
      else flushSync(() => root.render(view(text.slice(0, i + chunk), true)));
      if (delay) await new Promise((r) => requestAnimationFrame(r));
      void el.offsetHeight;
      busy += performance.now() - s;
      if (first === null && el.innerText.trim()) first = performance.now() - t0;
      if (delay) await new Promise((r) => setTimeout(r, delay));
    }
    const s = performance.now();
    flushSync(() => root.render(view(text, false)));
    void el.offsetHeight;
    busy += performance.now() - s;
  } catch (e) {
    error = String(e?.message ?? e).slice(0, 120);
  }
  await frames();
  po.disconnect();
  window.gc?.();
  return { first, busy, cls, error, heap: (performance.memory?.usedJSHeapSize ?? 0) - heap0 };
};
window.ready = true;
