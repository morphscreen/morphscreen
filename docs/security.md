# Security: what runs, what loads, what's kept

An answer is written by a model, and a model can be talked into writing
anything: a prompt injection in a web page it read, a user asking it to.
So nothing in an answer is trusted. This page says what the SDKs do with
one, what they load, and what the API keeps.

## What the SDKs run

Nothing a model wrote. The core (Rust: WASM in the browser, a native
library under SwiftUI and Compose) reads the answer into a tree of the
components the app's catalog knows, and the SDKs draw that tree. There's
no `eval`, no `new Function`, no script from an answer, in any SDK.

- Text is text. Raw HTML in an answer is never rendered as HTML; the few
  tags models write anyway (`<strong>`, `<br>`) are read as formatting,
  their attributes dropped, and everything else shows as written
  (spec/format.md).
- Components never run code. When the reader acts (a button, a form, a
  quiz, a poll, a checklist tick), the SDK hands the app an action
  (spec/format.md, "Actions"): `ask`, `submit`, `quiz`, `vote` or
  `state`. The app decides what happens next. The SDK sends nothing
  itself.
- A What-if formula is compiled by the core into postfix tokens: numbers,
  the sliders' names, `+ - * / ^ %`, and `min`, `max`, `round`, `floor`,
  `ceil`, `abs`, `sqrt`. Each renderer runs those with a ten-line stack
  machine as the sliders move. Nothing else can run
  (rust/core/src/formula.rs).
- Links and pictures never go to `javascript:`, `vbscript:` or `file:`,
  and to `data:` only for a PNG, JPEG, GIF, WebP or AVIF image. The scheme
  is read the way a browser reads it, which drops spaces and control
  characters before it and tabs and line breaks anywhere in it
  (`java<tab>script:` is `javascript:` to a browser, and to the core). An
  unsafe address is dropped and the core reports `unsafe-url`.

`rust/core/tests/security.rs` checks this. It fills every attribute of
every component in every pack with 17 attacks (script schemes in every
spelling above, `data:text/html`, an SVG with `onload`, quotes that try to
close the attribute, tags that try to close the component), puts raw
`<script>`, `<iframe>`, `<style>` and handlers in the answer's text, and
draws all of it. The HTML must have no script, frame, object or style
element, no `on...` handler, no address a browser would run, no picture
from a host outside the app's list, and no formula token that isn't one
of the above. It runs in CI with the rest of the core's tests.

## What they load

Only what the app chose, and nothing until it's needed (docs/media.md).

- Pictures load from the hosts the app lists, or as a `data:` image. Any other address, a model-written URL included,
  shows the picture's description instead (an avatar shows initials):
  loading it would tell that host who is reading, and a URL can carry
  what the page holds out to anyone. With no hosts set, only `data:`
  images load.
- We supply no photos. Photos the model asks for (`![Belém Tower](find)`)
  are searched only when the app gave its own Pexels, Unsplash or
  Openverse key, on our server: the request's description (the model's alt
  text, never the conversation) goes to that provider, and Wikidata is
  asked whether a name is a person's. The key is used for that request and
  never kept; what it found is kept under the key's hash. The photo loads
  straight from the provider, so a reader's browser talks to that
  provider's image host: the app's choice, and only if the app lists it.
- Map tiles come from the app's own map provider, on its key (Google,
  Stadia, MapTiler, Thunderforest or its own tile server), straight from
  the provider on the web and on Android: the reader's browser or phone
  talks to that provider, the app's choice, and with Google the SDK first
  asks Google for a session on the app's key. Without a provider a map is
  its pins on a plain ground and nothing loads. SwiftUI draws maps with
  MapKit, so its tiles come from Apple, as soon as a map with places shows.
- A place written with only an address is found with the phone's own
  geocoder, on iOS (Apple's) and Android (the system's, on most phones
  Google's): its name and address go to that service. The web SDK places
  only what has coordinates, and sends nothing.
- Video and audio play from the address in the answer, and nothing is
  fetched until the reader presses play: `preload="none"` on the web, the
  player made on the tap in SwiftUI, a link that opens on the tap in
  Compose.
- An embed (YouTube, through youtube-nocookie.com, Vimeo or Spotify) is a
  link until the reader taps it. On the web the player then loads in a
  sandboxed frame; SwiftUI and Compose open it in the browser. An embed
  from any other host stays a link.
- The camera (barcode scanning), location, signatures and file uploads
  start only when the reader uses them, and the browser or the phone asks
  first. Uploads stay on the device until the form is submitted, and then
  go to the app's own handler.

The SDKs send nothing of their own: no analytics, no telemetry, no calls
home. The phone's geocoder above is the one service a native SDK reaches
that the app didn't name. The web SDK fetches the core's WASM file from wherever the app says,
and `connectAgent` talks only to the agent URL the app gives it. The
SwiftUI and Compose agents do the same.

## What the API keeps

No prompt, no answer, no IP address, no API key (docs/tracking.md has
every table and column).

- Each call leaves one line: when, how long, the endpoint, the model asked
  for and the one that answered, how it ended, whether the answer was
  valid and repaired, its error classes by component, the system prompt's
  version hash, whether it ran on our key, and what the model cost. None
  of the conversation.
- Debug logs are the one exception, and they're opt-in per project: the
  request and its answer, deleted after 7 days.
- Our API keys (`ms_live_...`) are kept as a SHA-256 hash and their first
  12 characters, so a key can be checked and shown as `ms_live_ab12...`,
  never read back.
- A customer's own OpenRouter key, sent as `Authorization`, goes to
  OpenRouter and nowhere else: never stored, never logged, and taken out
  of any error text before it's passed on.
- The model included on paid plans runs on our OpenRouter key, which lives
  on the server only and never appears in a response, an error or a log
  (rust/api/tests/included.rs checks the refusals). Those calls go only to
  providers that keep no prompts (OpenRouter's `data_collection: deny`).
  Calls on a customer's own key follow that customer's OpenRouter
  settings.
- A sign-up keeps the address, the version of the terms and privacy
  notice it agreed to and when, the country it came from (two letters
  from DB-IP's free country file, never the IP address), and its ref and
  utm_* tags. Its device is kept only as a hash of FingerprintJS's visitor
  id under a pepper of ours, to give one free account per device calls on
  our key. A magic link is kept as a hash, works once for 15 minutes and
  is deleted after a day; a session is kept as a hash for 30 days.
- To sign up, a person passes Cloudflare Turnstile, so Cloudflare sees
  that visit. The address's domain is looked up in DNS (its MX records)
  and checked against the open list of throwaway domains; the address
  itself goes nowhere but to our mail provider, for the link.
- Sign-ups and deletion requests are counted per network (a /24 or a
  /48) in memory under a hash that changes each start, so no address is
  kept; the same for free accounts using our key.
- A deletion request mails a link; opening it deletes the account, its
  projects, keys, usage, calls, events and sessions at once. The nightly
  backups hold them until they age out (12 months).
- The server's log line for a request has its id, route, status and time;
  a model run adds the model, the answer's size, how it ended and the
  core's verdict. Nothing a reader or a model wrote.
- The mail we send (a month's 80% and 100% warnings now, sign-up links
  once sign-up ships) goes through our mail provider's SMTP account, over
  TLS only (rust/api/src/mail.rs): it carries the account's address and
  its call counts, never anything from a conversation.

## Payments

Dodo Payments sells as the merchant of record and takes the payment in its
own checkout: card and bank details never reach us. We keep each
subscription's id, plan, status and Dodo's customer id, and each payment's
id, amount and currency, so renewals, refunds and the plan follow it.
Dodo's webhooks count only with their signature (Standard Webhooks:
HMAC-SHA256 over the id, time and body, the time within five minutes, so
an old one can't be replayed), each is handled once however often it
comes, and a word older than one already applied changes nothing. The
checkout's return is checked with Dodo before it counts: a subscription
id counts only for the account that made it. Deleting an account cancels
its subscription first, so a deleted account is never charged.

## The admin

Ours only (rust/api/src/admin.rs): on its own listener on the box's
Tailscale address, turning away any connection from outside the tailnet
besides, so the internet never reaches it. Signing in takes an account
with the admin role, a magic link to its address and a code from an
authenticator app (TOTP, RFC 6238; no code works twice). A session lasts
12 hours. Every view and action an admin makes is written to an audit
log, which keeps a deleted account only as its number. The TOTP secret is
kept in the database, which only the box can reach.

## What's public

status.morphscreen.com shows whether the API answers (checked every
minute from our server, through the same address apps use), its uptime,
how long answers take and the share that failed (ops/status). Never how
many calls there were, and nothing about any account.

## What a trial token can do

There isn't one yet. Today every call needs an account key
(`X-MorphScreen-Key`); the free plan's 3,000 calls a month, 100 of them
with the model included, are the way to try it.

The agent trial (roadmap P1) will add a public endpoint that hands out a
short-lived token for generation only: a small quota per token, session
and IP, capped input and output, one inexpensive model, and a daily spend
cap that cuts it off by itself. Our provider keys never reach the caller.
This section changes when it ships, with the abuse test that proves those
limits.
