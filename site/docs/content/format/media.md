---
title: Pictures, icons and maps
description: Answers can show your own pictures, photos found on your own photo key, icons and maps on your own map provider. Nothing loads from a host you didn't choose.
---

An answer can show pictures and maps, and none of it loads from a host your app didn't choose. We don't supply photos: an answer shows your own pictures, or photos found on your own photo key.

## Your own pictures

An app with pictures of its own (a shop's products, a listing's rooms) sends them with the request, and the model shows them by id:

```json title="morphscreen options"
{
  "images": [
    { "id": "3", "url": "https://cdn.shop.example/mugs/blue.jpg", "alt": "Blue mug", "credit": "Photo: [Shop](https://shop.example)" }
  ]
}
```

The model is told each id and its `alt`, never the address, and writes `![The blue one](img:3)`. The API puts the address in, with the credit under the picture, and allows the picture's host. Up to 200 a request; an `id` is 1 to 40 letters, digits, `-`, `_` or `.`, and `alt` and `credit` are up to 300 characters each. `credit` is Markdown, so a link in it stays a link.

Only these ids are picture addresses the model may use. When it writes one of its own anyway (`night-watch.jpg`), the picture shows its description instead, and a repair round, which is told the same ids, puts a real one in where it can.

## Free pictures, with no key

For a demo or a project with no photo key, search a free source yourself on your server before the call, and send what you found as `images`. Wikimedia Commons needs no key: public-domain and openly licensed scans of most famous artworks, places and things.

```js title="server.mjs"
// Up to 10 Commons pictures for a subject, as `images` with their credits.
async function commons(subject) {
  const q = new URLSearchParams({ action: "query", format: "json", origin: "*", generator: "search", gsrnamespace: "6", gsrlimit: "10", gsrsearch: subject, prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1280" });
  const pages = Object.values((await (await fetch(`https://commons.wikimedia.org/w/api.php?${q}`)).json()).query?.pages ?? {});
  return pages.map((p, i) => {
    const info = p.imageinfo[0];
    const meta = info.extmetadata ?? {};
    const artist = (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim() || "Unknown";
    const licence = meta.LicenseShortName?.value ?? "see the file page";
    return { id: `p${i + 1}`, url: (info.thumburl ?? info.url).split("?")[0], alt: p.title.replace(/^File:|\.\w+$/g, ""), credit: `${artist}, ${licence}, via [Wikimedia Commons](${info.descriptionurl})` };
  });
}

const images = await commons("The Great Wave off Kanagawa");
// ...then { "morphscreen": { "images": images } } with the chat completion,
// and imageHosts: ["upload.wikimedia.org", "thumb.wikimedia.org"] in the page.
```

Give each picture an `alt` that says what it shows (the title, who made it, when): the model picks by it. Openverse's search works without a key too, at a low rate; the `openverse` photo key below needs a registered client because the API searches on your app's own quota.

## Photos on your own key

With `photos` set to your own Pexels, Unsplash or Openverse key, the model may ask for a photo of a real place, dish, animal, plant or artwork by describing it:

```json title="morphscreen options"
{ "photos": { "pexels": "<your Pexels key>" } }
{ "photos": { "unsplash": { "key": "<access key>", "app": "<your app's name on Unsplash>" } } }
{ "photos": { "openverse": { "client_id": "...", "client_secret": "..." } } }
```

```markdown
![Belém Tower on the Tagus](find)
```

As the answer streams, the API searches that provider on your key and quota and points the picture straight at the provider's address, with its credit. The reader's browser loads it from the provider; we never fetch or keep the photo. Some requests get no photo on purpose and show their description instead: people, things the answer made up ("Customer 9"), and anything no result matches well enough. A wrong photo is worse than none.

Without `photos` (or with `"photos": false`), the model isn't told it can ask for any.

## Where pictures may load from

The SDK loads pictures only from the hosts you list. Any other address, a model-written one included, shows the picture's description instead: loading it would tell that host who is reading.

```ts
createAnswer(el, { core, imageHosts: ["cdn.shop.example", "images.pexels.com"] });
```

List your photo provider's image host when you give a photo key: `images.pexels.com`, `images.unsplash.com`, or for Openverse `live.staticflickr.com`, `upload.wikimedia.org` and `thumb.wikimedia.org` (where Wikimedia serves its smaller sizes). A host is matched exactly, so list each one; pictures you send as `images` have their hosts allowed for you in what the API sends back, and the page still needs them in `imageHosts`.

## Icons

`Stat` and `Button` take an `icon`: one of 229 Phosphor names. The names models write from other sets (`location`, `MapPin`, `trending_up`) are understood too. The core sends the drawing with the component, so there's no icon font to load. An unknown name shows nothing and never fails the answer.

## Maps

A `Map`'s places are drawn at the zoom that fits them. The map under the pins comes from your own map provider, on your key, straight from the provider:

```ts
createAnswer(el, { core, maps: { provider: "stadia", key: "..." } });
// { provider: "google", key: "...", language: "en-GB", region: "GB" }   Google's Map Tiles API
// { provider: "maptiler", key: "..." }
// { provider: "thunderforest", key: "..." }
// { provider: "tiles", url: "https://tiles.example/{z}/{x}/{y}.png", credit: "© ..." }
```

Each provider's credit shows under the map, as its terms ask. Without a provider a map is its pins on a plain ground, with each place linking to OpenStreetMap, and nothing loads.

For a live map you can pan and zoom, pass MapLibre GL 6.16 or later as `maplibre` too. It starts its worker from `maplibre-gl-worker.mjs` beside its script, so serve that file with your bundle; a page with a content security policy allows it as `worker-src 'self'`, and allows the provider's host for images.
