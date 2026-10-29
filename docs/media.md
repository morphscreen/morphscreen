# Photos, icons and maps

Answers can show real photos, icons and maps. None of it loads from a host
the app didn't choose.

## Photos

We don't supply photos (decided 2026-10-26). An answer shows two kinds:
the app's own pictures, and photos found on the app's own Pexels, Unsplash
or Openverse key. Without either, the model is told to show no pictures,
and an image it writes anyway never loads.

### The app's own pictures

An app with pictures of its own (a shop's products, a listing's rooms)
gives them with the request, and the model shows them by id:

```json
"morphscreen": {
  "images": [
    { "id": "3", "url": "https://cdn.shop.example/mugs/blue.jpg", "alt": "Blue mug", "credit": "Photo: [Shop](https://shop.example)" }
  ]
}
```

The model is told each id and its `alt` (never the address, which it would
mangle, and which costs more tokens than an id) and writes
`![The blue one](img:3)`. The API puts the URL in, with the credit as its
title when there is one, and the picture's host is allowed with it. An id
it doesn't have shows as its description. Up to 200 a request.

### Photos on the app's own key

With `photos` set to the app's own key, the model is told it may ask for a
photo of a real place, dish, animal, plant or artwork by describing it:

```json
"photos": { "pexels": "<key>" }
"photos": { "unsplash": { "key": "<access key>", "app": "<your app's name on Unsplash>" } }
"photos": { "openverse": { "client_id": "...", "client_secret": "..." } }
```

```markdown
![Belém Tower on the Tagus](find)
```

As the answer streams, the API searches that provider on the app's key and
quota, and points the image straight at the provider's own address, with
the credit as its title:

```markdown
![Belém Tower on the Tagus](https://images.pexels.com/photos/... "[Ann](https://www.pexels.com/photo/...), [Pexels License](https://www.pexels.com/license/), via Pexels")
```

We never fetch, keep or serve the photo: the reader's browser loads it from
the provider. Each provider's image hosts are allowed with its key
(images.pexels.com; images.unsplash.com; live.staticflickr.com and
upload.wikimedia.org for Openverse). Every renderer shows the credit under
the photo. Unsplash's terms ask that each use be counted and that the
credit link the photographer and Unsplash with the app's name; the API does
both. Openverse is kept to licenses that allow use in a commercial app with
changes (public domain, CC0, CC BY, CC BY-SA).

The key is used for the request and never kept. What a request found is
kept by the key's hash (30 days, a week for "nothing good enough"), so the
same request on the same key isn't searched again; another key never sees
it. Some requests get no photo on purpose, and keep `find`, which renderers
show as the description in a tile:

- people, and names that read like a person's (Wikidata decides: a tower or
  a plant is fine, a person or a name it doesn't know is not);
- the answer's own made-up things: an app's dashboard, a portfolio's
  projects, "Customer 9";
- anything no candidate matches well enough. A wrong photo is worse than
  none.

Without `photos` (or with `false`) the model isn't told about `find`, and
nothing is searched.

### Within each source's rules

Every call goes out through its source's gate (rust/media/src/pace.rs):

- An app's Openverse client: 100 searches a minute and 10,000 a day.
- An app's Pexels or Unsplash key: a few at a time, stopping when its
  provider's rate-limit headers say nothing is left.
- Wikidata (the person check): one call at a time and under five a second,
  or three at a time and ten a second with a Wikimedia login
  (`MORPHSCREEN_WIKIMEDIA_TOKEN`, an OAuth 2 owner-only token).

A 429 or 503 pauses that source for its Retry-After. A search that would
wait behind too many others, or past a day's limit, is refused at once: the
request stays `find`, nothing is kept, and the next answer that asks tries
again.

### As the answer streams

The API fills an answer's requests as it streams (rust/api/src/photos.rs).
Text goes on as it comes, except from a request's `![` to the end of its
line: each search starts the moment its `)` arrives, the model is read on
while the line waits, and the line goes on with the photos found by then,
at most 3 seconds after it ends (`MORPHSCREEN_PHOTO_WAIT`). A search that
takes longer leaves its request as `find` and runs on, so the next answer
that asks gets the photo at once. A recorded answer (`replay/...`) is
filled the same way, and so is a whole answer (`stream` false) before it's
sent.

## Where images may load from

Each SDK loads images only from the hosts the app lists. Any other address,
including a URL the model wrote, never loads: it shows its description (an
avatar its initials). Loading it would tell that host who is reading, and a
URL can carry what the page holds out to anyone. An app that gives a photo
key lists that provider's image hosts too.

```ts
// web
createAnswer(el, { core, imageHosts: ["cdn.shop.example", "images.pexels.com"] });
<Answer core={core} imageHosts={["cdn.shop.example", "images.pexels.com"]} />
```

```swift
// SwiftUI
AnswerView(answer, media: MediaPolicy(hosts: ["cdn.shop.example", "images.pexels.com"]))
```

```kotlin
// Compose
AnswerView(answer, media = MediaPolicy(hosts = listOf("cdn.shop.example", "images.pexels.com")))
```

On Compose the SDK loads allowed images itself; an app that passes its own
loader (Coil, say) still only gets the URLs the policy allows.

The core's HTML (a page rendered on a server, or `mscore html`) follows the
same rule: with no hosts set only data: images load, and a picture from
anywhere else shows what it stood for, as the SDKs draw it (a tile with its
description, an avatar's initials, a picture's outline beside a product, a
video without its poster). The web SDK hands its hosts to the core, so the
page and the core's HTML match. The API's own HTML allows the app's
pictures' hosts and its photo provider's.

```
mscore html answer.md --image-hosts cdn.shop.example,images.pexels.com
session.allowImages(hosts: ["cdn.shop.example"])                  // Swift
session.allowImages(listOf("cdn.shop.example"))                     // Kotlin
ms_parser_allow_images(p, "cdn.shop.example");                     // C
```

## Icons

Stat and Button take an `icon`: a Phosphor name (229 of the regular weight).
The core accepts the names models write from other sets too (`location`,
`MapPin`, `settings-outline`, `trending_up`) and sends the path with the
node, so the SDKs draw it without an icon font or a table of their own. An
unknown name, or an icon on a component that takes none, shows nothing and
never fails the answer.

## Maps

The core draws a Map's places in Web Mercator at the zoom that fits them.
The map under the pins comes from the app's own map provider, on its own
key, straight from the provider (roadmap Q15; none of their terms allow
caching their tiles through someone else's server, so we don't):

```ts
// web
createAnswer(el, { core, maps: { provider: "stadia", key: "..." } });
{ provider: "google", key: "...", language: "en-GB", region: "GB" }  // Google's Map Tiles API
{ provider: "maptiler", key: "..." }
{ provider: "thunderforest", key: "..." }
{ provider: "tiles", url: "https://tiles.example/{z}/{x}/{y}.png", credit: "© ..." }  // any tile server
```

```kotlin
// Compose
AnswerView(answer, maps = MapTiles.Stadia(key = "..."))
```

Each provider's credit shows under the map, as its terms ask: Google's is
"Google Maps" and the copyright line its viewport call gives for what the
map shows. In dark mode Stadia, MapTiler and Thunderforest draw their own
dark style (pass `style` and `darkStyle` to choose others); nobody's tiles
are recoloured, since their terms don't allow it. Google's 2D tiles are
billed to the app's Google Cloud account (100,000 free a month, then $0.60
per 1,000 when we checked, 2026-10-25; a map is about 9 tiles); the others
count against the app's own plan.

Without a provider a map is its pins on a plain ground, with each place
linking to OpenStreetMap; the live map (MapLibre, which the web SDK takes
as `maplibre`; 6.16 or later, as earlier versions have an XSS bug in
their own HTML sanitizer) needs a provider too. MapLibre 6 starts its
worker from `maplibre-gl-worker.mjs` beside the script that loaded it, so
an app that bundles MapLibre serves that file next to its bundle (the
example's test copies it into `build/`) or points `setWorkerUrl` at it; a
page with a content security policy allows it as `worker-src 'self'`. On Android the map is MapLibre on the
same providers; on iOS it's MapKit's, with Apple's tiles. A page with a
content security policy lets the provider's host load images (and, for
Google, `connect-src https://tile.googleapis.com` for its session).
