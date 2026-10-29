// Liquid glass for MorphScreenUI's floating controls (roadmap Z2): a lens, never
// frost. `lens(el)` gives a .msui-glass element a displacement map of its own
// size, so what scrolls under it bends toward the middle at the rim and stays
// sharp in the middle. Only Chrome applies an SVG filter as a backdrop; other
// browsers, and anyone who asks for less transparency, keep the plain capsule
// from theme.css. Returns a function that removes the lens.

let count = 0;
let defs: SVGDefsElement | null = null;

const chromium = () => (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands.some((b) => b.brand === "Chromium") ?? false;

function svgDefs(): SVGDefsElement {
  if (defs?.isConnected) return defs;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  defs = document.createElementNS(ns, "defs");
  svg.append(defs);
  document.body.append(svg);
  return defs;
}

/** Red moves the backdrop sideways, green up and down, 128 is still. Near the
 * capsule's edge the backdrop is pulled in from outside, as a thick convex rim
 * bends what's behind it. */
function lensMap(w: number, h: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(w, h);
  const r = Math.min(h, w) / 2;
  const band = Math.max(10, h * 0.32);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = Math.min(Math.max(x + 0.5, r), w - r);
      const cy = Math.min(Math.max(y + 0.5, r), h - r);
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const core = Math.hypot(dx, dy);
      let d: number, nx: number, ny: number;
      if (core === 0) {
        [d, nx, ny] = [
          [x + 0.5, -1, 0],
          [w - x - 0.5, 1, 0],
          [y + 0.5, 0, -1],
          [h - y - 0.5, 0, 1],
        ].reduce((a, b) => (b[0] < a[0] ? b : a));
      } else {
        d = r - core;
        nx = dx / core;
        ny = dy / core;
      }
      const t = Math.max(0, 1 - d / band);
      const k = t * t * (3 - 2 * t);
      const i = (y * w + x) * 4;
      image.data[i] = Math.round(128 + 127 * nx * k);
      image.data[i + 1] = Math.round(128 + 127 * ny * k);
      image.data[i + 2] = 128;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export function lens(el: HTMLElement, strength = 34): () => void {
  if (!chromium() || matchMedia("(prefers-reduced-transparency: reduce)").matches) return () => {};
  const ns = "http://www.w3.org/2000/svg";
  const id = `msui-lens-${++count}`;
  const filter = document.createElementNS(ns, "filter");
  filter.id = id;
  for (const [k, v] of Object.entries({ x: "0", y: "0", width: "100%", height: "100%", "color-interpolation-filters": "sRGB" })) filter.setAttribute(k, v);
  const map = document.createElementNS(ns, "feImage");
  map.setAttribute("x", "0");
  map.setAttribute("y", "0");
  map.setAttribute("preserveAspectRatio", "none");
  map.setAttribute("result", "map");
  const displace = document.createElementNS(ns, "feDisplacementMap");
  for (const [k, v] of Object.entries({ in: "SourceGraphic", in2: "map", scale: String(strength), xChannelSelector: "R", yChannelSelector: "G" })) displace.setAttribute(k, v);
  filter.append(map, displace);
  svgDefs().append(filter);

  let size = "";
  const fit = () => {
    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);
    if (!w || !h || `${w}x${h}` === size) return;
    size = `${w}x${h}`;
    map.setAttribute("width", String(w));
    map.setAttribute("height", String(h));
    map.setAttribute("href", lensMap(w, h));
  };
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(el);
  el.style.backdropFilter = `url(#${id}) saturate(1.3) brightness(1.05)`;
  return () => {
    observer.disconnect();
    filter.remove();
    el.style.backdropFilter = "";
  };
}
