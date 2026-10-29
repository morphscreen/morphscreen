// Map tiles on the app's own key (roadmap Q15): Google's Map Tiles API,
// Stadia, MapTiler, Thunderforest, or any {z}/{x}/{y} address. Tiles load
// straight from the provider (none of their terms allow caching through
// someone else's server), with the credit each provider asks for. Without a
// provider a map is its pins on a plain ground. Every provider here draws
// Web Mercator in 256-pixel tiles on the same grid as the core's map, so the
// pins sit where they should.

export type MapTiles =
  /** Google's Map Tiles API (2D tiles), on a key with that API enabled. */
  | { provider: "google"; key: string; mapType?: "roadmap" | "satellite" | "terrain"; language?: string; region?: string }
  /** Stadia Maps; the key can be left out where Stadia allows the app's domain. */
  | { provider: "stadia"; key?: string; style?: string; darkStyle?: string }
  | { provider: "maptiler"; key: string; style?: string; darkStyle?: string }
  | { provider: "thunderforest"; key: string; style?: string; darkStyle?: string }
  /** Any raster tile server: `url` with {z}, {x} and {y}; `credit` is HTML. */
  | { provider: "tiles"; url: string; credit: string; maxZoom?: number };

export interface TileSource {
  /** The tile address with {z}, {x} and {y}. */
  url: string;
  /** The credit to show with the map, as HTML. */
  credit: string;
  maxZoom: number;
  /** Google's session, for its viewport credit. */
  google?: { session: string; key: string };
}

const OSM = '<a href="https://www.openstreetmap.org/copyright" rel="noopener">© OpenStreetMap contributors</a>';
const q = encodeURIComponent;

/** Whether the page shows the dark palette: its data-theme, else the system's. */
export function darkPage(doc: Document = document): boolean {
  const t = doc.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light" || t === "mono") return false;
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

const sessions = new Map<string, Promise<{ session: string; expiry: number }>>();

/** A Google session for these settings, made once and kept until shortly before it runs out. */
async function googleSession(m: Extract<MapTiles, { provider: "google" }>): Promise<string> {
  const body = { mapType: m.mapType ?? "roadmap", language: m.language ?? (typeof navigator === "object" ? navigator.language : "en-US") ?? "en-US", region: m.region ?? "US" };
  if (body.mapType === "terrain") Object.assign(body, { layerTypes: ["layerRoadmap"] });
  const k = JSON.stringify([m.key, body]);
  let s = sessions.get(k);
  const fresh = async () => {
    const r = await fetch(`https://tile.googleapis.com/v1/createSession?key=${q(m.key)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Google Map Tiles: HTTP ${r.status}`);
    const j = await r.json();
    return { session: String(j.session), expiry: Number(j.expiry) * 1000 };
  };
  if (!s) sessions.set(k, (s = fresh()));
  let got = await s.catch((e) => {
    sessions.delete(k);
    throw e;
  });
  if (got.expiry - Date.now() < 3600_000) {
    sessions.set(k, (s = fresh()));
    got = await s;
  }
  return got.session;
}

/** Where a map's tiles come from, and its credit. */
export async function tileSource(m: MapTiles, dark = darkPage()): Promise<TileSource> {
  switch (m.provider) {
    case "google": {
      const session = await googleSession(m);
      return { url: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${q(session)}&key=${q(m.key)}`, credit: "Google Maps", maxZoom: 22, google: { session, key: m.key } };
    }
    case "stadia": {
      const style = dark ? (m.darkStyle ?? "alidade_smooth_dark") : (m.style ?? "alidade_smooth");
      return {
        url: `https://tiles.stadiamaps.com/tiles/${q(style)}/{z}/{x}/{y}.png${m.key ? `?api_key=${q(m.key)}` : ""}`,
        credit: `<a href="https://stadiamaps.com/" rel="noopener">© Stadia Maps</a> <a href="https://openmaptiles.org/" rel="noopener">© OpenMapTiles</a> ${OSM}`,
        maxZoom: 20,
      };
    }
    case "maptiler": {
      const style = dark ? (m.darkStyle ?? "streets-v2-dark") : (m.style ?? "streets-v2");
      return {
        url: `https://api.maptiler.com/maps/${q(style)}/256/{z}/{x}/{y}.png?key=${q(m.key)}`,
        credit: `<a href="https://www.maptiler.com/copyright/" rel="noopener">© MapTiler</a> ${OSM}`,
        maxZoom: 20,
      };
    }
    case "thunderforest": {
      const style = dark ? (m.darkStyle ?? "transport-dark") : (m.style ?? "atlas");
      return {
        url: `https://api.thunderforest.com/${q(style)}/{z}/{x}/{y}.png?apikey=${q(m.key)}`,
        credit: `Maps <a href="https://www.thunderforest.com/" rel="noopener">© Thunderforest</a>, Data ${OSM}`,
        maxZoom: 22,
      };
    }
    case "tiles":
      return { url: m.url, credit: m.credit, maxZoom: m.maxZoom ?? 19 };
  }
}

/** One tile's address. */
export const tileAt = (url: string, z: number, x: number, y: number) => url.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));

/**
 * Google's copyright line for what a map shows (its viewport call), which
 * its terms ask to be shown with the Google Maps logo or its name.
 */
export async function googleCopyright(g: { session: string; key: string }, zoom: number, north: number, south: number, east: number, west: number): Promise<string> {
  const p = new URLSearchParams({ session: g.session, key: g.key, zoom: String(zoom), north: String(north), south: String(south), east: String(east), west: String(west) });
  const r = await fetch(`https://tile.googleapis.com/tile/v1/viewport?${p}`);
  if (!r.ok) return "";
  return String((await r.json()).copyright ?? "");
}
