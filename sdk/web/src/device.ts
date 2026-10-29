// The device pack on the web, on top of the HTML that already works without
// JavaScript: a live map when MapLibre is given, live barcode scanning where
// the browser has BarcodeDetector, the location from Geolocation, previews of
// the photos picked. Nothing runs until the user acts.

import type { Attrs } from "./core";
import type { Action } from "./actions";
import { googleCopyright, tileAt, tileSource, type MapTiles, type TileSource } from "./maps";

const str = (v: string | true | undefined) => (typeof v === "string" ? v : "");

function button(text: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ms-btn ms-secondary ms-small";
  b.textContent = text;
  b.dataset.msAdded = "1";
  return b;
}

export function enhance(el: HTMLElement, type: string, attrs: Attrs, data: any, opts: { maplibre?: unknown; maps?: MapTiles; onAction?: (a: Action) => void }): (() => void) | void {
  switch (type) {
    case "Map":
      // A live map needs tiles to move over: without a provider the core's map stays, its pins on a plain ground.
      if (!opts.maplibre || !opts.maps) {
        const offTiles = tiles(el, opts.maps);
        const offPins = pinSize(el);
        return () => {
          offTiles?.();
          offPins?.();
        };
      }
      return liveMap(el, attrs, data, opts.maplibre, opts.maps);
    case "Scan":
      return scanner(el, attrs);
    case "Location":
      return locator(el, attrs);
    case "Camera":
      return previews(el);
    case "Countdown":
      return countdown(el);
    case "Embed":
      return embed(el);
    case "Signature":
      return signature(el);
    case "Share":
      return share(el);
    case "Contact":
      return contact(el);
  }
}

/** The time left, ticking; the HTML shows the moment itself. */
function countdown(el: HTMLElement): () => void {
  const time = el.querySelector("time");
  const until = Date.parse(el.dataset.until ?? "");
  if (!time || Number.isNaN(until)) return () => {};
  const pad = (n: number) => String(n).padStart(2, "0");
  const tick = () => {
    const s = Math.max(0, Math.floor((until - Date.now()) / 1000));
    const [d, h, m] = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60)];
    time.textContent = s === 0 ? "Now" : d > 0 ? `${d}d ${h}h ${m}m` : `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
  };
  tick();
  const t = setInterval(tick, 1000);
  return () => clearInterval(t);
}

/** The host's player, loaded only when the user asks for it. */
function embed(fig: HTMLElement) {
  const player = fig.dataset.player;
  const a = fig.querySelector("a");
  if (!player || !a) return;
  a.addEventListener("click", (ev) => {
    ev.preventDefault();
    const f = document.createElement("iframe");
    f.src = player;
    f.title = a.querySelector("strong")?.textContent ?? "Embedded player";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.referrerPolicy = "strict-origin-when-cross-origin";
    f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups");
    a.replaceWith(f);
  });
}

/** A pad to sign on; the drawing goes with the form as a PNG data URL, the typed name stays as the fallback. */
function signature(el: HTMLElement) {
  const input = el.querySelector("input");
  if (!input) return;
  // A <label> forwards clicks to its first control, which would be the Clear
  // button: the field becomes a plain container, the input keeps its name.
  const label = document.createElement("div");
  label.className = el.className;
  for (const [k, v] of Object.entries(el.dataset)) label.dataset[k] = v;
  label.append(...Array.from(el.childNodes));
  el.replaceWith(label);
  input.setAttribute("aria-label", label.querySelector("span")?.textContent ?? "Signature");
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 160;
  canvas.style.cssText = "width:100%;height:140px;border:1px solid var(--ms-line-2);border-radius:var(--ms-r);background:var(--ms-surface);touch-action:none";
  canvas.setAttribute("aria-label", "Signature pad");
  const data = document.createElement("input");
  data.type = "hidden";
  data.name = `${input.name}-drawing`;
  const clear = button("Clear");
  const g = canvas.getContext("2d")!;
  g.lineWidth = 2.5;
  g.lineCap = "round";
  g.strokeStyle = "#18191b";
  let drawing = false;
  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height] as const;
  };
  canvas.addEventListener("pointerdown", (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    g.beginPath();
    g.moveTo(...at(e));
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    g.lineTo(...at(e));
    g.stroke();
  });
  canvas.addEventListener("pointerup", () => {
    drawing = false;
    data.value = canvas.toDataURL("image/png");
    input.required = false;
  });
  clear.addEventListener("click", () => {
    g.clearRect(0, 0, canvas.width, canvas.height);
    data.value = "";
    input.required = label.querySelector("span")?.textContent?.endsWith("*") ?? false;
  });
  input.placeholder = "Or type your full name";
  input.before(canvas);
  canvas.after(clear);
  label.append(data);
}

/** The system share sheet where there is one, else the link is copied. */
function share(a: HTMLElement) {
  a.addEventListener("click", async (ev) => {
    const text = a.dataset.text || undefined;
    const url = a.dataset.href || undefined;
    if (navigator.share) {
      ev.preventDefault();
      try {
        await navigator.share({ text, url });
      } catch {}
    } else if (navigator.clipboard) {
      ev.preventDefault();
      await navigator.clipboard.writeText([text, url].filter(Boolean).join(" "));
      a.textContent = "Copied";
    }
  });
}

/** The Contact Picker where the browser has it (Chrome on Android). */
function contact(label: HTMLElement) {
  const input = label.querySelector("input");
  const picker = (navigator as any).contacts;
  if (!input || !picker?.select) return;
  const b = button("Choose from contacts");
  b.addEventListener("click", async () => {
    try {
      const [c] = await picker.select(["name", "tel", "email"], { multiple: false });
      if (c) input.value = [c.name?.[0], c.tel?.[0] ?? c.email?.[0]].filter(Boolean).join(", ");
    } catch {}
  });
  input.after(b);
}

/** The credit under a map, from its provider. */
function credit(after: Element, html: string): HTMLElement {
  const c = document.createElement("small");
  c.className = "ms-credit";
  c.dataset.msAdded = "1";
  c.innerHTML = html;
  after.after(c);
  return c;
}

/** Longitude and latitude of a world pixel at zoom `z` (Web Mercator, 256-pixel tiles). */
const lngLat = (x: number, y: number, z: number): [number, number] => {
  const size = 256 * 2 ** z;
  return [(x / size) * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / size))) * 180) / Math.PI];
};

/** Google's line for what the map shows, after its name. */
async function googleCredit(c: HTMLElement, src: TileSource, z: number, x0: number, y0: number, x1: number, y1: number) {
  if (!src.google) return;
  const [west, north] = lngLat(x0, y0, z), [east, south] = lngLat(x1, y1, z);
  const line = await googleCopyright(src.google, z, north, Math.max(south, -85), east, west).catch(() => "");
  if (line && c.isConnected) c.textContent = `Google Maps · ${line}`;
}

/**
 * The core's map (pins on Web Mercator at a whole zoom, data-z/ox/oy on the
 * SVG) with the map itself under the pins: the tiles that cover it, from
 * the app's map provider, and the provider's credit. Without one the pins
 * stay on a plain tile color.
 */
function tiles(fig: HTMLElement, maps?: MapTiles) {
  const svg = fig.querySelector<SVGSVGElement>("svg[data-z]");
  if (!maps || !svg) return;
  const z = Number(svg.dataset.z), ox = Number(svg.dataset.ox), oy = Number(svg.dataset.oy);
  const { width: w, height: h } = svg.viewBox.baseVal;
  if (![z, ox, oy, w, h].every(Number.isFinite)) return;
  const n = 2 ** z;
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "ms-tiles");
  let c: HTMLElement | null = null;
  let gone = false;
  tileSource(maps)
    .then((src) => {
      if (gone) return;
      for (let ty = Math.floor(oy / 256); ty * 256 < oy + h; ty++) {
        for (let tx = Math.floor(ox / 256); tx * 256 < ox + w; tx++) {
          if (ty < 0 || ty >= n) continue;
          const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
          img.setAttribute("href", tileAt(src.url, z, ((tx % n) + n) % n, ty));
          img.setAttribute("x", (tx * 256 - ox).toFixed(1));
          img.setAttribute("y", (ty * 256 - oy).toFixed(1));
          img.setAttribute("width", "256.5");
          img.setAttribute("height", "256.5");
          g.appendChild(img);
        }
      }
      svg.prepend(g);
      c = credit(svg, src.credit);
      googleCredit(c, src, z, ox, oy, ox + w, oy + h);
    })
    .catch(() => {});
  return () => {
    gone = true;
    g.remove();
    c?.remove();
  };
}

/**
 * Pins and their numbers the same size on screen at any width: the map is
 * drawn for a chat column and scaled down on a phone, which would shrink
 * them with it.
 */
function pinSize(fig: HTMLElement) {
  const svg = fig.querySelector<SVGSVGElement>("svg[viewBox]");
  if (!svg) return;
  const fit = () => {
    const k = svg.viewBox.baseVal.width / (svg.clientWidth || svg.viewBox.baseVal.width);
    if (!Number.isFinite(k) || k <= 0) return;
    svg.querySelectorAll("circle.ms-pin").forEach((c) => c.setAttribute("r", (11 * k).toFixed(1)));
    svg.querySelectorAll<SVGTextElement>("text").forEach((t) => {
      t.style.fontSize = `${11 * k}px`;
      const cy = Number(t.previousElementSibling?.getAttribute("cy"));
      if (Number.isFinite(cy)) t.setAttribute("y", (cy + 4 * k).toFixed(1));
    });
    const route = svg.querySelector<SVGPathElement>(".ms-route");
    if (route) route.style.strokeWidth = String(2 * k);
  };
  fit();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
  ro?.observe(svg);
  return () => ro?.disconnect();
}

/** Places with coordinates on a MapLibre map, with tiles from the app's map provider and its credit under the map. */
function liveMap(fig: HTMLElement, attrs: Attrs, data: any, maplibre: unknown, maps: MapTiles): (() => void) | void {
  if (!maplibre || !data?.columns) return;
  const head: string[] = data.columns.map((c: string) => c.toLowerCase());
  const col = (re: RegExp) => head.findIndex((h, k) => k > 0 && re.test(h));
  const [latK, lngK] = [col(/^lat/), col(/^(lng|lon|long)/)];
  const pts = (data.rows as string[][])
    .map((r) => ({ name: r[0], lat: Number(r[latK]), lng: Number(r[lngK]) }))
    .filter((p) => latK > 0 && lngK > 0 && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (!pts.length) return;
  let map: any;
  let c: HTMLElement | null = null;
  let gone = false;
  (async () => {
    const lib: any = typeof maplibre === "function" ? await (maplibre as () => Promise<unknown>)() : maplibre;
    const gl = lib.default ?? lib;
    const src = await tileSource(maps);
    if (gone) return;
    const box = document.createElement("div");
    box.className = "ms-maplive";
    box.dataset.msAdded = "1";
    const svg = fig.querySelector("svg");
    if (svg) svg.replaceWith(box);
    else fig.insertBefore(box, fig.querySelector("ol"));
    map = new gl.Map({
      container: box,
      style: {
        version: 8,
        sources: { tiles: { type: "raster", tiles: [src.url], tileSize: 256, maxzoom: src.maxZoom } },
        layers: [{ id: "tiles", type: "raster", source: "tiles" }],
      },
      center: [pts[0].lng, pts[0].lat],
      zoom: 13,
      // The provider's credit goes under the map, as on the core's map.
      attributionControl: false,
    });
    c = credit(box, src.credit);
    if (src.google)
      map.on("moveend", () => {
        const b = map.getBounds(), z = Math.round(map.getZoom());
        googleCopyright(src.google!, z, b.getNorth(), b.getSouth(), b.getEast(), b.getWest())
          .then((line) => {
            if (line && c?.isConnected) c.textContent = `Google Maps · ${line}`;
          })
          .catch(() => {});
      });
    pts.forEach((p, i) => {
      const m = document.createElement("div");
      m.className = "ms-pin";
      m.textContent = String(i + 1);
      new gl.Marker({ element: m }).setLngLat([p.lng, p.lat]).addTo(map);
    });
    if (pts.length > 1) {
      const lngs = pts.map((p) => p.lng), lats = pts.map((p) => p.lat);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 40, duration: 0 });
    }
    if ((attrs.route === true || attrs.route === "true") && pts.length > 1)
      map.on("load", () => {
        map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts.map((p) => [p.lng, p.lat]) } } });
        map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-width": 3, "line-dasharray": [2, 2] } });
      });
  })().catch(() => {});
  return () => {
    gone = true;
    map?.remove();
    c?.remove();
  };
}

/** Live scanning with the camera where the browser can detect barcodes. */
function scanner(wrap: HTMLElement, attrs: Attrs): (() => void) | void {
  const Detector = (globalThis as any).BarcodeDetector;
  const input = wrap.querySelector<HTMLInputElement>("input:not([type=file])");
  if (!Detector || !navigator.mediaDevices?.getUserMedia || !input) return;
  const b = button("Scan");
  input.after(b);
  let stop = () => {};
  b.addEventListener("click", async () => {
    const formats = attrs.kind === "qr" ? ["qr_code"] : attrs.kind === "barcode" ? ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] : undefined;
    const detector = new Detector(formats ? { formats } : undefined);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch {
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "ms-scan-overlay";
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    const cancel = button("Cancel");
    overlay.append(video, cancel);
    document.body.appendChild(overlay);
    let live = true;
    stop = () => {
      live = false;
      stream.getTracks().forEach((t) => t.stop());
      overlay.remove();
    };
    cancel.addEventListener("click", () => stop());
    await video.play();
    while (live) {
      const found = await detector.detect(video).catch(() => []);
      if (found.length) {
        input.value = found[0].rawValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        stop();
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  });
  return () => stop();
}

/** The location, once the user taps for it. */
function locator(wrap: HTMLElement, attrs: Attrs): void {
  const input = wrap.querySelector<HTMLInputElement>("input");
  if (!navigator.geolocation || !input) return;
  const b = button("Use my location");
  input.after(b);
  b.addEventListener("click", () => {
    b.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        wrap.dataset.location = JSON.stringify({ lat, lng, accuracy });
        input.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        b.textContent = "Location added";
      },
      () => {
        b.disabled = false;
        b.textContent = "Couldn't get your location";
      },
      { enableHighAccuracy: str(attrs.precision) === "precise", timeout: 15000 },
    );
  });
}

/** Thumbnails of the photos picked. */
function previews(wrap: HTMLElement): () => void {
  const input = wrap.querySelector<HTMLInputElement>("input[type=file]");
  const urls: string[] = [];
  const box = document.createElement("div");
  box.className = "ms-previews";
  box.dataset.msAdded = "1";
  wrap.appendChild(box);
  input?.addEventListener("change", () => {
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    box.textContent = "";
    for (const f of Array.from(input.files ?? [])) {
      const u = URL.createObjectURL(f);
      urls.push(u);
      const img = document.createElement("img");
      img.src = u;
      img.alt = f.name;
      box.appendChild(img);
    }
  });
  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}
