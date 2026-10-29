// Images load only from where the app allows (roadmap Q6): the app's own
// hosts. An image the model wrote with any other
// address must never be requested, while streaming or after; it shows its
// description, and an avatar its initials. A photo's credit shows under it.
// A map's tiles come from the app's own provider (roadmap Q15), straight
// from it with its credit, never through us; with none, there are no tiles.
//   node sdk/web/build.mjs && node sdk/web/test-media.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { browserName, launch } from "./browser.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tools = process.env.TOOLS ?? join(process.env.HOME, ".cache/morphscreen-web");
const require = createRequire(join(tools, "package.json"));
const puppeteer = require("puppeteer-core");
const served = [];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAADklEQVR4nGNoQAIMODkAXzYSAY5zHKsAAAAASUVORK5CYII=", "base64");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
const server = createServer((req, res) => {
  if (req.url.startsWith("/photos/") || req.url.startsWith("/tiles/")) {
    served.push(req.url.split("?")[0].split("/").slice(0, 4).join("/"));
    return res.writeHead(200, { "content-type": "image/png" }).end(png);
  }
  const p = join(repo, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(repo) || !existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": types[extname(p)] ?? "application/octet-stream" }).end(readFileSync(p));
});
// Somewhere else: any request reaching it is a leak.
const leaks = [];
const other = createServer((req, res) => {
  leaks.push(req.url);
  res.writeHead(200, { "content-type": "image/png" }).end(png);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await new Promise((r) => other.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const elsewhere = `http://127.0.0.1:${other.address().port}`;
const answer = `![Tram 28](${base}/photos/ok.jpg "[Ann](https://www.flickr.com/photos/ann/1), CC BY 2.0, via Flickr")

Our numbers ![chart](${elsewhere}/track.png?q=revenue-412k) are in.

<Gallery>
![Lisbon](https://images.unsplash.com/photo-1)
![Pastel de nata](find)
</Gallery>

<Avatar name="Emily Chen" src="${elsewhere}/face.jpg" />

<Stat label="Flight" value="2h 40m" icon="plane" />

<Map title="Belém">
| Place | Lat | Lng |
|---|---|---|
| Tower | 38.6916 | -9.2160 |
| MAAT | 38.6957 | -9.1942 |
</Map>
`;

const browser = await launch(puppeteer);
const failures = [];
const page = await browser.newPage();
page.on("pageerror", (e) => failures.push(e.message));
const outside = [];
// Safari's WebDriver can't see requests: there the second server alone catches a leak.
if (browserName !== "safari") {
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = r.url();
    if (u.startsWith(base) || u.startsWith(elsewhere) || u.startsWith("data:")) return r.continue();
    outside.push(u);
    r.abort();
  });
}
await page.goto(`${base}/bench/web/ours.html`);
await page.waitForFunction("window.ready === true");
// Small chunks: the streaming spans are guarded as well as the final HTML.
await page.evaluate((t, host, maps) => window.run(t, { chunk: 7, imageHosts: [host], maps, packs: ["device"] }), answer, new URL(base).host, { provider: "tiles", url: `${base}/tiles/{z}/{x}/{y}.png`, credit: "Tiles © Example" });
await new Promise((r) => setTimeout(r, 800));
const seen = await page.evaluate(() => ({
  loaded: [...document.images].filter((i) => i.naturalWidth > 0).map((i) => i.alt),
  debug: [...document.images].map((i) => [i.complete, i.naturalWidth, i.currentSrc, i.loading]),
  imgs: [...document.images].map((i) => i.getAttribute("src")),
  tiles: [...document.querySelectorAll(".ms-img-missing")].map((t) => t.getAttribute("aria-label")),
  credit: document.querySelector(".ms-pic .ms-credit")?.textContent,
  creditLink: document.querySelector(".ms-pic .ms-credit a")?.getAttribute("href"),
  avatar: document.querySelector(".ms-avatar > span")?.textContent,
  icon: !!document.querySelector(".ms-stat .ms-label > svg.ms-icon path[d^='M']"),
  mapTiles: [...document.querySelectorAll(".ms-map .ms-tiles image")].map((i) => i.getAttribute("href")),
  mapCredit: document.querySelector(".ms-map .ms-credit")?.textContent,
}));
const want = (ok, what) => ok || failures.push(what);
want(leaks.length === 0, `requests to another host: ${leaks.join(", ")}`);
want(outside.length === 0, `requests outside the page: ${outside.join(", ")}`);
want(seen.loaded.join() === "Tram 28", `loaded ${seen.loaded.join()} ${JSON.stringify(seen.debug)}`);
want(seen.imgs.length === 1, `img elements: ${seen.imgs.join(", ")}`);
want(["chart", "Lisbon", "Pastel de nata"].every((t) => seen.tiles.includes(t)), `tiles ${seen.tiles.join(", ")}`);
want(seen.credit === "Ann, CC BY 2.0, via Flickr" && seen.creditLink === "https://www.flickr.com/photos/ann/1", `credit ${seen.credit} ${seen.creditLink}`);
want(seen.avatar === "EC", `avatar ${seen.avatar}`);
want(seen.icon, "the Stat's icon");
want(seen.mapTiles.length >= 2 && seen.mapTiles.every((u) => u.startsWith(`${base}/tiles/15/`)), `map tiles ${seen.mapTiles.join(", ")}`);
want(served.some((u) => u.startsWith("/tiles/15/")), "tiles requested from the app's provider");
want(seen.mapCredit === "Tiles © Example", `the map's credit: ${seen.mapCredit}`);

// Each provider on the app's key: the tiles' addresses and the credit its
// terms ask for. Their hosts are answered here, so nothing leaves the machine.
const MAP = `<Map title="Belém">\n| Place | Lat | Lng |\n|---|---|---|\n| Tower | 38.6916 | -9.2160 |\n| MAAT | 38.6957 | -9.1942 |\n</Map>\n`;
async function drawMap(maps, theme) {
  const p = await browser.newPage();
  p.on("pageerror", (e) => failures.push(e.message));
  const calls = [];
  await p.setRequestInterception(true);
  p.on("request", (r) => {
    const u = r.url();
    if (u.startsWith(base) || u.startsWith("data:")) return r.continue();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET, POST" };
    if (r.method() === "OPTIONS") return r.respond({ status: 204, headers: cors });
    // A request's body can't be read in Firefox (WebDriver BiDi): the session's settings are checked in Chrome.
    let body = "";
    try {
      body = r.postData() ?? "";
    } catch {}
    calls.push(`${r.method()} ${u}${body ? " " + body : ""}`);
    if (u.startsWith("https://tile.googleapis.com/v1/createSession"))
      return r.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ session: "S1", expiry: String(Math.round(Date.now() / 1000) + 14 * 86400), tileWidth: 256, tileHeight: 256, imageFormat: "png" }) });
    if (u.startsWith("https://tile.googleapis.com/tile/v1/viewport")) return r.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ copyright: "Map data ©2026 Google" }) });
    if (/^https:\/\/(tile\.googleapis\.com|tiles\.stadiamaps\.com|api\.maptiler\.com|api\.thunderforest\.com)\//.test(u)) return r.respond({ status: 200, headers: cors, contentType: "image/png", body: png });
    outside.push(u);
    r.abort();
  });
  await p.goto(`${base}/bench/web/ours.html`);
  if (theme) await p.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  await p.waitForFunction("window.ready === true");
  await p.evaluate((t, maps) => window.run(t, { chunk: 1e7, maps, packs: ["device"] }), MAP, maps);
  await new Promise((r) => setTimeout(r, 600));
  const got = await p.evaluate(() => ({
    tiles: [...document.querySelectorAll(".ms-map .ms-tiles image")].map((i) => i.getAttribute("href")),
    credit: document.querySelector(".ms-map .ms-credit")?.textContent ?? "",
    links: [...document.querySelectorAll(".ms-map .ms-credit a")].map((a) => a.getAttribute("href")),
    pins: document.querySelectorAll(".ms-map circle.ms-pin").length,
  }));
  await p.close();
  return { ...got, calls };
}
// The providers are answered by intercepting their requests, which Safari's WebDriver can't: Chrome and Firefox check them.
if (browserName !== "safari") {
  const none = await drawMap(undefined);
  want(none.tiles.length === 0 && none.credit === "" && none.calls.length === 0 && none.pins === 2, `no provider: pins on a plain ground, nothing loaded ${JSON.stringify(none)}`);
  const shapes = [
    [{ provider: "stadia", key: "K" }, null, /^https:\/\/tiles\.stadiamaps\.com\/tiles\/alidade_smooth\/15\/\d+\/\d+\.png\?api_key=K$/, /© Stadia Maps © OpenMapTiles © OpenStreetMap contributors/],
    [{ provider: "stadia", key: "K" }, "dark", /\/tiles\/alidade_smooth_dark\/15\//, /© Stadia Maps/],
    [{ provider: "maptiler", key: "K" }, null, /^https:\/\/api\.maptiler\.com\/maps\/streets-v2\/256\/15\/\d+\/\d+\.png\?key=K$/, /© MapTiler © OpenStreetMap contributors/],
    [{ provider: "thunderforest", key: "K" }, null, /^https:\/\/api\.thunderforest\.com\/atlas\/15\/\d+\/\d+\.png\?apikey=K$/, /Maps © Thunderforest, Data © OpenStreetMap contributors/],
    [{ provider: "google", key: "K", language: "en-GB", region: "GB" }, null, /^https:\/\/tile\.googleapis\.com\/v1\/2dtiles\/15\/\d+\/\d+\?session=S1&key=K$/, /^Google Maps · Map data ©2026 Google$/],
  ];
  for (const [maps, theme, tile, credit] of shapes) {
    const got = await drawMap(maps, theme);
    const what = `${maps.provider}${theme ? " " + theme : ""}`;
    want(got.tiles.length >= 2 && got.tiles.every((u) => tile.test(u)), `${what} tiles ${got.tiles.join(", ")}`);
    want(credit.test(got.credit), `${what} credit "${got.credit}"`);
    want(got.pins === 2, `${what} pins ${got.pins}`);
    if (maps.provider === "google") {
      const session = got.calls.filter((c) => c.startsWith("POST https://tile.googleapis.com/v1/createSession?key=K"));
      const sent = session[0]?.split(" ").slice(2).join(" ");
      want(session.length === 1 && (!sent || JSON.parse(sent).mapType === "roadmap"), `one Google session: ${got.calls.join(" | ")}`);
      want(got.calls.some((c) => c.startsWith("GET https://tile.googleapis.com/tile/v1/viewport?session=S1&key=K&zoom=15")), "Google's copyright for what the map shows");
    } else want(got.links.includes("https://www.openstreetmap.org/copyright"), `${what} credit links ${got.links.join(", ")}`);
  }
}
await browser.close();
server.close();
other.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("media: ok (only the app's hosts load; model URLs never requested; credits shown; map tiles from the app's provider, each with its credit; icons)");
