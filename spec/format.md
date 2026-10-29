# MorphScreen format, v1.0-rc1

A response is Markdown with a small set of components written like JSX. Models
already write both, so the format needs little teaching, and a half-written
response is always a valid prefix of a finished one.

The catalog is the only definition of the components. The system prompt, the
validator and the renderers all read it, so they always agree.

## Catalog: packs and custom components

A catalog is built from packs (sets of components, each a JSON file) and an
app's own components, in that order:

- `core` is always included: layout, text blocks, numbers, charts, forms and
  buttons. The API and the SDKs add every other pack unless an app names the
  ones it wants (`all` names every pack; `[]` is core alone, for a prompt
  about half as long: 1,400 tokens against 2,900, about 22 a component).
- An app's own components use the same JSON as a pack, or come from a JSON
  Schema of their props (Zod 4: `z.toJSONSchema`). Strings, numbers,
  booleans, string enums, URLs and arrays of strings map to attributes; other
  shapes are rejected, since a model can't write them in an attribute.
- A name defined twice is an error, never an override, so an app can't
  replace a built-in component by accident. The one exception: a pack that
  comes in only through the default (`all`) gives way to the app's own, so
  an app's own `Product` or `Map` replaces the pack's; a pack the app names
  outright still clashes. Definitions are checked when the
  catalog is built: names, content kinds, attribute types, enum defaults,
  parents, alias targets, and that `tone` uses the shared values.
- Each renderer draws the components it knows. An app registers renderers
  for its own; a component with none shows its attributes as a list and then
  its content, so nothing the model wrote is lost.

## Document

- The document is the root. There is no `root` statement to forget and no
  names to wire up: a component's place in the tree is where it's written.
- Text between components is Markdown.
- Anything the model writes before or after the UI (a sentence of intro, for
  example) is just Markdown and renders as text.

### Markdown subset

CommonMark plus GFM tables, limited to: ATX headings (`#` to `######`),
paragraphs, emphasis and strong, inline code, links, images, unordered and
ordered lists, block quotes, fenced code, thematic breaks and tables.

Images:

- `![what it shows](find)` asks for a photo, when the app gave the API its
  own Pexels, Unsplash or Openverse key. The API searches that provider for
  what the alt text names and rewrites the image to the provider's address
  before the answer reaches the app. People and the answer's own made-up
  things (an app's dashboard, a listing's rooms) get none. A request
  nothing answers keeps `find`, and renderers show its description in a
  tile.
- `![what it shows](img:ID)` shows one of the app's own pictures, given
  with the request; the API puts its address in.
- An image's title is its credit line, as inline Markdown with links:
  `![Belém Tower](https://images.pexels.com/... "[Author](page), [Pexels License](license), via Pexels")`.
  Renderers show it under the image.
- Renderers load images only from the hosts the app allows. Any other address, model-written URLs included, shows the
  description (an avatar its initials): loading it would tell that host who
  is reading, and a URL can carry what the page holds.
- Link and image addresses may hold balanced parentheses
  (`https://en.wikipedia.org/wiki/Mercury_(planet)`), as in CommonMark.

Raw HTML is never rendered as HTML, but models write some anyway (`<strong>`
and `<br>` in about one answer in ten), so it is read as formatting:

- `<br>` is a line break, `<p>` and `<div>` are paragraph breaks (line breaks
  inside a table cell), `<h1>` to `<h6>` are headings.
- `<strong>`/`<b>`, `<em>`/`<i>`, `<u>`, `<s>`/`<del>`, `<code>`, `<small>`,
  `<sub>`, `<sup>`, `<mark>` and `<kbd>` keep their meaning. Their attributes
  are dropped and unclosed ones are closed where the text ends.
- `<span>`, `<font>`, `<a>` and other layout tags are dropped; their text stays.
- Anything else, and anything inside code, is text.

## Components

```
<Name attr="value" other=42 flag>content</Name>
<Name attr="value" />
```

- A component name starts with an uppercase letter. `<div>` or `<br>` is text.
- Attribute values are quoted strings. Numbers and `true`/`false` may be
  unquoted; JSX-style `{value}` is accepted and unwrapped. A bare attribute
  (`required`) means `true`.
- List attributes separate values with ` | `: `options="S | M | L"`.
- Components whose content is `none` are void, like HTML's `<br>`: they never
  need closing, and a stray `</Input>` is ignored.
- A line that opens with a known component but isn't a tag the core can read
  (`<Stat label! value!>`, the prompt's signature copied in; `subtitle "Eno"`
  without its `=`; a value with no name) shows as text, and is an
  `unreadable-tag` error on its own line, not only the stray closing tags
  it leaves behind.
- Only the attributes listed in the catalog exist. `!` in the prompt marks a
  required attribute; an enum lists every allowed value, the first being the
  default.
- An attribute name means the same thing on every component, with the same
  values: `tone` is always `neutral`, `info`, `success`, `warning` or `danger`.
  (In v0.1 Stat's tones lacked `info` and Callout's lacked `neutral`; models
  wrote the missing one in 8 of 10 answers.)

### Aliases

Some names models write on their own for something that exists: `<Table>` (a
section holding a table), `<Column>` (one cell of Columns) and `<Buttons>` (a
row of buttons). The catalog lists them under `aliases`; they are read as the
component they mean and reported as a note, never taught in the prompt.

### Content kinds

| Kind | Between the tags |
|---|---|
| `any` | Markdown and components |
| `text` | inline text (a label) |
| `table` | a Markdown table: first column labels, other columns series; the separator row may be left out |
| `images` | Markdown images, one item a line; words after an image on its line are its caption |
| `list` | a Markdown list |
| `only:<Tag>` | only those components (`Tabs` holds `Tab`s) |
| `none` | nothing (void) |

A component with a `parent` (like `Tab`) is only valid inside that parent; a
`Result` may sit anywhere inside its `WhatIf` (in a `Columns`, say). A `text`
component marked `"actions": true` (`Product`) also takes `Button`s inside,
drawn under it as what the reader can do with it ("Add to cart"); nothing else
goes inside it.

### Inline components

Any component may sit inside a Markdown table cell (models put badges,
avatars and buttons in cells), and `Badge` and `Button` may also appear inside
a sentence. They render in place without breaking the table.

### Emojis

Renderers strip emojis from everything a model writes (©, ® and ™ stay), and
the prompt asks for none.

## Device pack

The device pack reaches the device's own hardware and apps. Each
component is native on every platform, and a web page without JavaScript gets
a fallback that still works:

| Component | iOS (SwiftUI) | Android (Compose) | Web with the DOM renderer | Web without JavaScript |
|---|---|---|---|---|
| `Map` | MapKit, markers, route; addresses geocoded on device | MapLibre on the app's own map provider | the app's own map provider's tiles, live with MapLibre | numbered pins on a plain schematic, no tiles; every place links to OpenStreetMap |
| `Camera` | camera capture, or the photo library | CameraX / `TakePicture` | `capture` file input | `<input type="file" accept="image/*" capture>` |
| `Scan` | VisionKit `DataScannerViewController` | ML Kit barcode scanning | `BarcodeDetector`, else typing | type the code or photograph it |
| `Location` | `LocationButton` (one-time permission) | fused location provider | Geolocation API | a city or address field |
| `File` | `fileImporter` | `OpenDocument` | file input | file input, `accept` from the list |

Rules that hold on every platform:

- The model only asks. Nothing is captured, read or sent until the user acts:
  a tap opens the camera or shares the location, and values leave the device
  only when the user submits the form they belong to.
- The operating system's own permission prompts apply; a renderer never works
  around a refused permission, it falls back to the typed field.
- `Location` defaults to approximate. Precise location needs `precision="precise"`
  and the platform's precise-location permission.
- Device components are form fields: their values are submitted with the
  form, photos and files as multipart uploads, a location as coordinates.

## Streaming

The format is designed so the core only ever reads the new text and never
re-reads what it has already processed.

**A value is committed only once it is complete.** This one rule replaces the
per-component patches OpenUI needed (`step` arriving last, cut-short URLs,
truncated `$state` defaults, `max` arriving as "800" before "8000"):

- A component appears when its opening tag is complete (`>` received), with
  every attribute final.
- Text streams word by word.
- A table row counts at its newline. A chart draws when its closing tag
  arrives and shows a placeholder of the same size until then.
- Numbers, enum values and URLs are only ever read in full.

**Finished nodes never change.** A closed component is final, so renderers
never redraw it. Nodes are identified by their position in the document, never
by an array index that can shift.

**One parser.** Parsing a whole response is streaming it in one chunk; the
test suite checks that every split of every recording gives the same tree.

## Validation and repair

Lenient where the intent is clear, strict where it isn't:

- Enum values match without case, and a few common synonyms are accepted
  (`error` means `danger`, `column` means `bar`). These are reported as notes.
- An invalid value is resolved at its edge (OpenUI's #729 rule): use the
  default if there is one; otherwise drop an optional attribute, or invalidate
  the component if the attribute is required. A bad table row drops only that
  row.
- An unknown component is dropped and its content kept as text.
- Every problem is reported as a diagnostic tied to its line, so a repair pass
  can rewrite just that line. Truncation is reported, never silent.

## Output: the op stream (v1)

The core turns chunks of model text into a stream of operations, one JSON
object per line (served as SSE `data:` lines by the API). Every renderer, on
every platform, only applies ops; none of them parses the format.

### Nodes

The document is a tree. A node's id is its position: the indexes from the
root joined with dots (`"3"`, `"3.0"`, `"3.0.2"`). Ids never shift, because
nodes only ever arrive after the ones before them.

| Node type | What it is | Holds |
|---|---|---|
| A component name (`Card`, `Chart`, `Camera`, a customer's own) | a component, aliases already resolved | children, spans, or data, by its content kind |
| `p` | paragraph | spans |
| `h` | heading; `attrs.level` 1 to 6 | spans |
| `ul`, `ol` | list | `li` children |
| `li` | list item; `attrs.task` is `"open"` or `"done"` for task items | spans |
| `table` | table | `row` children |
| `row` | table row; `attrs.head` is true for the header row | `cell` children |
| `cell` | table cell; `attrs.align` is `"right"` when its column is numeric | spans |
| `code` | fenced code; `attrs.lang` when given | spans (one text span) |
| `quote` | block quote | spans |
| `hr` | thematic break | nothing |

### Ops

| Op | Fields | Meaning |
|---|---|---|
| `open` | `id`, `type`, `attrs` (left out when empty) | A node starts; its parent is its id up to the last dot. A component's attributes are final when it opens (the tag was complete). Attribute values are strings, or `true` for a bare attribute. |
| `spans` | `id`, `spans` | The whole inline content of an open leaf so far (a string when it's plain text). Replaces the previous `spans` of that node. Sent at most once per chunk of input, and before the node closes. |
| `node` | `id`, `type`, `attrs`, `spans`, `data` (each left out when empty) | A leaf that opened and finished within one chunk: `open`, `spans` and `close` in one op. |
| `close` | `id`, optional `data` | The node is final and never changes again. Components with table, list or image content carry their parsed content in `data`. |
| `diag` | `line`, `cls`, `detail`, `severity` | A problem (`error`) or a coercion the core made (`note`), tied to the line, for repair. |
| `end` | `complete`, `truncated` | The stream is over. Anything still open was closed first, with a diagnostic. |

`data` by content kind:

- `table` (Chart, Map): `{"columns": [...], "rows": [[...], ...]}`, cells as
  the model wrote them (renderers parse numbers for charts).
- `list` (FollowUps): `{"items": [spans, ...]}`.
- `images` (Gallery): `{"images": [{"src": "...", "alt": "...", "credit": [spans]}]}`
  (`credit` only when the image has one).
- A Question (interactive pack): `{"items": [spans, ...], "answer": index or null}`;
  the core matches `answer` to a choice by its letter, number or words.
- A Checklist: `{"checks": [{"done": true or false, "c": [spans]}]}` (`[x]` marks done).
- A What-if Result: `{"formula": [tokens], "value": number or null}`: the
  formula in postfix tokens (numbers, the Sliders' names, `+ - * / ^ %`,
  `neg`, `min`, `max`, `round`, `floor`, `ceil`, `abs`, `sqrt`) and its value
  at the Sliders' starting values. A Slider's name is its `name`, or its
  label as one word ("Unit price ($)" is `unit_price`). Renderers run the
  tokens on a stack as the Sliders move; nothing else runs.

### Spans

Inline content is an array of spans:

| Span | Fields |
|---|---|
| `{"t": "text", "v": "..."}` | plain text |
| `{"t": "strong" \| "em" \| "s" \| "u" \| "small" \| "sub" \| "sup" \| "mark" \| "kbd", "c": [spans]}` | formatting |
| `{"t": "code", "v": "..."}` | inline code |
| `{"t": "link", "href": "...", "c": [spans]}` | link |
| `{"t": "img", "src": "...", "alt": "...", "credit": [spans]}` | inline image; `credit` is its title, parsed, when it has one |
| `{"t": "br"}` | line break |
| `{"t": "el", "type": "Badge", "attrs": {...}, "c": [spans]}` | a component inside a sentence or a table cell |

The core strips emojis (keeping ©, ® and ™), reads the HTML models slip in as
formatting, and keeps a dash between words from starting a line, so every
renderer shows the same text.

### Example

```
{"op":"open","id":"0","type":"h","attrs":{"level":"1"}}
{"op":"spans","id":"0","spans":[{"t":"text","v":"Revenue overview"}]}
{"op":"close","id":"0"}
{"op":"open","id":"1","type":"Card","attrs":{"title":"Weekly revenue"}}
{"op":"open","id":"1.0","type":"Chart","attrs":{"type":"line","x":"Week","y":"USD"}}
{"op":"close","id":"1.0","data":{"columns":["Week","Revenue"],"rows":[["W1","24100"],["W2","30800"]]}}
{"op":"close","id":"1"}
{"op":"end","complete":true,"truncated":false}
```

## Actions: what the app sends back (v1)

Components never run code. When the user acts, the renderer sends an action,
and the API turns it into the model's next turn.

| User does | Action | Next model turn |
|---|---|---|
| Taps a Button with `ask`, or one with no `href` outside a Form | `{"type": "ask", "text": ask or the label, "node": id}` | a user message with that text |
| Taps a FollowUps item | `{"type": "ask", "text": the item, "node": id}` | a user message with that text |
| Taps a Button with `href` | nothing is sent; the link opens | none |
| Submits a Form (any Button inside it) | `{"type": "submit", "node": form id, "form": its name, "button": the label, "fields": {...}, "labels": {...}}` | a user message listing each field's label and value, with photos and files attached |
| Switches a Tab, opens Details | nothing; local state | none |
| Answers the last question of a Quiz | `{"type": "quiz", "node": id, "title": its title, "score": n, "total": n, "answers": [{"question", "choice", "right": true, false or null}]}` | a user message with the score and each answer |
| Votes in a Poll | `{"type": "vote", "node": id, "name": its name, "question": its label, "choice": the option}` | a user message with the vote and the poll's question |
| Ticks a Checklist item, marks a Flashcard known | `{"type": "state", "node": id, "name": the Checklist's name or "known", "value": what's ticked or known}` | none: it's component state (below) |
| Moves a What-if Slider | nothing; the Results are worked out on the device | none |

`fields` is keyed by each field's `name` (or its label as a slug when it has
none), and `labels` gives the label the reader saw for each, by the same key
(the message uses it in place of the name). `title` and `question` are left
out when the component has none:

| Field | Value |
|---|---|
| Input, TextArea, Select, Radio, Date, Scan | a string |
| Slider | a number |
| Switch | `true` or `false` |
| Checkboxes | an array of the chosen options |
| Camera, File | an array of the platform's file objects (`File` on the web) |
| Location | `{"lat", "lng", "accuracy"}` in degrees and meters |

Photos and files come to the app in the action as the platform's own file
objects (a `File` on the web), for the app to upload where it likes; with
AG-UI they go to the agent as content parts. The renderer checks `required`
before sending. Device values exist only after the user acted: a tap took
the photo, a tap shared the location.

### Component state

What the reader has done to the interactive components and forms is also
kept as plain JSON per node, the same shape on every platform, so it can be
saved, restored and shared with an agent. With AG-UI it is the shared
state's `morphscreen` key, by message id and node id, sent with every run;
an agent that sets it sets the components, and that sends no action.

| Component | State |
|---|---|
| Quiz | `{"answers": [index or null per question]}` |
| Flashcards | `{"known": [card index]}` |
| Poll | `{"vote": option or null}` |
| Checklist | `{"done": [item index]}` |
| WhatIf | `{"values": {slider name: number}}` |
| Form | `{"fields": {name: value}}`, typed as above; uploads and locations stay on the device |

The words of an action's user message come from the core, so every SDK and
the API send the same turn; in the web SDK, `core.actionMessage(action)`
gives them.

## Versioning

Every pack carries a version, and a built catalog has a hash of everything in
it. The prompt's hash is recorded with every benchmark run, so results are
tied to the exact prompt the model saw.
