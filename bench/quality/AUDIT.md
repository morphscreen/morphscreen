# Quality audit (Q1 to Q8)

How our answers look next to OpenUI's on the web, SwiftUI and Compose, what
was wrong, what changed and what's still open. Every number here comes from
a result file in this folder; the scoreboard reads the same files.

## What was checked

- 177 answer pairs, ours and OpenUI's chat library for the same brief and
  model (Nemotron 3 Ultra): 45 of the 46 regular briefs once each (the
  provider failed on b5-disaster for OpenUI), 10 regular briefs twice from
  the v0.3 run, and the 7 packs' 8 briefs twice each.
- Two widths everywhere: 390 (a phone) and 760 (a chat column), px on the web,
  points on SwiftUI, dp on Compose.
- Web (`run.mjs`, `check.js`): both renderers in Chrome, nothing loaded from
  outside the page. The checker looks for: the page scrolling sideways,
  things past the answer's edge, clipped text, IDs and words broken inside,
  text under 11 px (chart text included), chart labels drawn over each
  other, runs of under 16 characters a line, one word alone on a heading's
  last line, text within 8 px of a card's edge, a lone card on a last row,
  and cards of uneven height side by side. axe's color-contrast rule runs
  too and is counted on its own.
- Compose (`bench/compose/.../Check.kt`): the same kinds, read from the
  semantics tree and each text's layout. Chart labels are drawn on a canvas,
  outside the tree, so they aren't checked there.
- SwiftUI (`bench/native/check.mjs`, `nativecheck`): SwiftUI doesn't expose
  its text layout, so each screenshot is read with Apple's Vision and the
  lines it finds are checked against the answer's own text: IDs and words
  split across lines, ellipses the answer didn't write, text cut off at the
  window's edge, paragraphs under 16 characters a line. The same check runs
  on OpenUI's Swift port. Text size isn't checked: these are macOS renders,
  and macOS sizes its text styles smaller than iOS.
- Themes: our answers again in the dark and grayscale palettes on all three.
- ChatGPT: not yet. It needs screenshots taken by using ChatGPT normally (see
  the end of this file).

"Before" is f04a600, the commit before this work; "after" is 95a5199
(17 October 2026). Both are checked by the same final checkers.

## Web

| | before | after | OpenUI |
|---|---|---|---|
| Defects per answer, 390 px | 2.80 | 0 | 0.69 |
| Defects per answer, 760 px | 1.36 | 0 | 0.31 |
| Clean answers, 390 px | 93 | 177 | 124 |
| Clean answers, 760 px | 126 | 177 | 146 |
| Answers with low-contrast text | 0 | 0 | 177 |

OpenUI fails axe's contrast rule on every answer (2,941 elements at
390 px), counted on its own and left out of the defects above.

## Compose

| | before | after |
|---|---|---|
| Defects per answer, 390 dp | 2.84 | 0 |
| Defects per answer, 760 dp | 1.49 | 0 |
| Clean answers, 390 dp | 101 | 177 |
| Clean answers, 760 dp | 141 | 177 |

OpenUI has no Compose renderer to compare with.

## SwiftUI

| | ours | OpenUI's Swift port |
|---|---|---|
| Defects per answer, 390 pt | 0 | 0.06 |
| Defects per answer, 760 pt | 0 | 0.13 |
| Clean answers, 390 pt | 177 of 177 | 170 of 177 |
| Clean answers, 760 pt | 177 of 177 | 167 of 177 |
| Answers that crashed the renderer | 0 | 1 |

## Light, dark and mono

The palettes come from one file, `spec/tokens.json` (since T1,
`spec/theme.tokens.json`), and a test checks every
text color against every background it is drawn on in all three (WCAG AA,
4.5:1). It found grayscale's danger color drawn white on white, and black
on its own tint. axe on every answer in each palette then found heatmap
cells too dark for their text in dark and grayscale; each palette now has
its own strongest heatmap tint (a token, tested the same way). All fixed.

Defects per answer and contrast, ours, in each palette (layout doesn't change with color, so the numbers match across themes unless a palette hides something):

| Ours | 390 | 760 | Low-contrast answers |
|---|---|---|---|
| Web, light | 0 | 0 | 0 of 177 |
| Web, dark | 0 | 0 | 0 of 177 |
| Web, mono | 0 | 0 | 0 of 177 |
| Compose, light | 0 | 0 | token test |
| Compose, dark | 0 | 0 | token test |
| Compose, mono | 0 | 0 | token test |
| SwiftUI, light | 0 | 0 | token test |
| SwiftUI, dark | 0 | 0 | token test |
| SwiftUI, mono | 0 | 0 | token test |

## What was wrong, by how often it happened

Web, ours, both widths together, before and after, with OpenUI's for scale:

| Defect | before | after | OpenUI |
|---|---|---|---|
| IDs, dates and codes split | 372 | 0 | 37 |
| text under 11 px (mostly chart labels) | 186 | 0 | 0 |
| runs of under 16 characters a line | 108 | 2 | 12 |
| one word alone on a heading's last line | 29 | 7 | 0 |
| words split without a hyphen | 16 | 0 | 2 |
| something past the answer's edge | 8 | 0 | 26 |
| the page scrolling sideways | 8 | 0 | 18 |
| text within 8 px of a card's edge | 5 | 0 | 7 |
| chart labels drawn over each other | 4 | 0 | 0 |
| text cut off | 0 | 0 | 75 |

On Compose the most common were avatar names drawn inside the 40 dp circle
when no image loader was set (a letter a line), rows of two texts where the
first took all the width (a select's arrow, a follow-up's arrow, a
citation's source line), fixed-width time columns too narrow for
"09:00–09:30", calendar days too narrow for their labels, titles stranding
their last word (desktop Compose ignores `LineBreak.Heading`), and cells in
a Columns row capped at an intrinsic height that came in short.

On SwiftUI: text cut off with an ellipsis where a fixed height or a grid
cell kept it from wrapping (badges, buttons, summaries, cart items, funnel
labels, key/value values, agenda rows), pack cells showing `**bold**`
markers, and code blocks wrapping and splitting IDs.

Found by looking rather than by the checkers: every Code block in our
answers rendered as a paragraph (the model never fences code inside
`<Code>`), and a horizontal bar chart with ten rows drew its labels over each
other on a phone (the web checker now looks for that too).

## What changed

In the core, so every platform gets it:

- Columns are planned from their content: the most cells a row holds and the
  narrowest a cell may get (`rust/core/src/layout.rs`, sent as `layout` data).
  Small tiles go up to five across, rich cards two or three, long text two;
  rows come out even (six as three and three).
- IDs, dates, times and codes never split; a word stays with the dash after
  it; long URLs and paths break only after their slashes; links and table
  cells don't hyphenate. Pack times, captions and subtitles follow the same
  rules.
- Code and Diff keep their code exactly as written, fenced or not, and send
  the lines as data (docs pack 0.2; the prompt text is unchanged).
- The inline parser is exposed (`ms_inline`, JNI `parseInline`) so pack
  cells on SwiftUI and Compose parse bold, code and links like content.
- Charts are drawn at up to three widths and the one nearest the space shows;
  horizontal bar charts are as tall as their rows need and wrap long labels.
- Phone layouts: wide tables scroll with short cells on one line, key/value
  lists with long values and timelines stack, calendars show dots and list
  their days, tab names scroll in one row.
- Design tokens (Q4): `spec/tokens.json` (since T1, `spec/theme.tokens.json`) generates `render/tokens.css`,
  `Tokens.swift` and `Tokens.kt`; colors, type scale, spacing, corners and
  motion come from it on every platform, with a grayscale palette on all
  three. The face is each platform's own interface font (SF Pro, Roboto,
  Segoe UI): the answers live inside someone else's app, so they match its
  chrome, cost no download and load nothing from a font host; numbers use
  tabular figures. Apple keeps Dynamic Type styles so text follows the
  reader's size setting.

On the web: badges and buttons are inline blocks (in a flex box every bold
word or kept-together ID became its own item and the spaces around it went
missing), buttons wrap long labels, headings and labels are balanced and
running text avoids a lone last word and keeps to about 70 characters a
line, inline code breaks rather than widen the page, a lone badge in a cell
stays a badge, sparklines in a table row are compact, failed images show
their description, follow-up chips have the normal corner radius.

On SwiftUI and Compose: tiles as tall as the tallest in their row, the same
keep-together rules, time columns sized to their labels, calendar phone
mode, rows that never squeeze a part to nothing, text that wraps instead of
being cut off, code on one line in a sideways scroll, square follow-up
chips. Compose balances titles itself and hyphenates running text where the
platform can.

## Still open

No layout defect is left on any platform, in any palette, at either width
(web re-measured on 17 October after the Q7 and Q8 work; SwiftUI and
Compose on 16 October). What it took past the first round:

- Titles and bold labels of three words or more hold their last two words
  together, and keep IDs and dates whole the way body text does ("14-day"
  had started breaking at its hyphen once titles were paired).
- Compose keeps IDs, ranges and long tokens together in running text too,
  and draws code and math raw so copies stay clean; SwiftUI code blocks in
  tabs no longer cut off; key/value lists keep one key column.
- Found while taking screenshots of the interactive pack: four flashcard
  rules were written for every Card, centering and padding all their
  paragraphs on the web. Scoped, with a test.
- A badge's dot sits in its first line's indent, so it never wraps away from
  its word and a long badge keeps its width.

Since Q8 the benchmark also checks that the page the web SDK builds while
streaming ends up equal to the core's HTML: 20 of 20 answers, with layout
shift 0.008 in all (OpenUI 0.915).

What the checkers can't see, from looking at the screenshots:

- Model slips show as text: an image link closed with ">" instead of ")"
  comes out as raw markup, and a line wrapped in angle brackets
  (`<Total: 1,560 min ...>`) shows as typed.

## Charts that answer (Q5)

Every chart type on web, SwiftUI and Compose shows the values at the
pointer as the answer wrote them, on hover or tap: a crosshair and a dot per
series on lines and areas, a band on bars, the slice on pies, the spoke on
radar. Legend items switch a series off, charts draw in (not with reduced
motion), and on the web each chart carries its data as a table for screen
readers. sdk/web/test-charts.mjs hovers every type at both widths and runs
axe (0 violations); ChartsTest and the Swift tests check what a tap picks.

Found on the way: Compose's y scale stopped at the last tick under the
highest value, so the tops of bars and lines were drawn past the canvas
(240 drew at about 207). Fixed, with horizontal-bar labels that wrap instead
of trailing off and radar labels that no longer sit on the ring.

## Photos, icons and maps (Q6)

The model asks for a photo of a real place, dish, animal, plant or artwork
with `![what it shows](find)`; the media service finds a licensed one and
the SDKs show it with its credit (docs/media.md). With the photo line in
the prompt the model wrote no image URL of its own in 264 answers (the
media briefs, the visual briefs and a full run of the regular ones); before
it, the media briefs' 16 answers held 41 invented ones. Validity didn't
move: 90.2% on the regular briefs with prompt v0.9, 89.7% with v0.6. Of 107
photo requests in the visual briefs, 98 got
a photo; the other 9 were invented people (a team page), two range maps
Commons doesn't have and a holiday rental's own room, which get none on
purpose. Every photo was checked by eye on a contact sheet.

Loading a model's image URL tells its host who is reading. Rendering the
177 answer pairs with nothing from outside the page allowed through
(bench/quality/hosts.mjs), OpenUI's renderer tried other hosts in 33
answers (121 requests: images.unsplash.com, picsum.photos, img.youtube.com,
api.qrserver.com and others; 5 of them for a URL still arriving, the host
cut off). Ours tried none. The core's own HTML, which a server sends, now
follows the same rule (17 October): before, it kept an address the model
wrote, such as an avatar from api.dicebear.com.

The media service runs at https://media.morphscreen.com (photos, tiles and
health checked end to end on 16 October). Still to set before real
traffic: a registered Openverse client and a tile provider that allows an
API's traffic.

Icons: 229 of Phosphor's on Stat and Button. A pilot that let Cards take
them too put one on 106 of 152 Cards, which reads as a template, so Cards
don't. Maps get OpenStreetMap tiles through the same proxy, and a card that
opens with a photo puts it beside the text when there's room.

## ChatGPT comparison (needs screenshots)

ChatGPT's own components show up for some kinds of question, so these are
asked the way a person would, in the web app and the phone app, with a
screenshot of the whole answer each time:

1. What's the weather in Bengaluru this week?
2. Compare the iPhone 16, Pixel 9 and Galaxy S25 for me.
3. Quiz me on photosynthesis, five questions.
4. Show me how to make chicken parmesan, with a video.
5. Give me a 3-day plan for Lisbon with a map.
6. Our team standup: who's blocked and who hasn't posted? (paste the b2-standup brief)

The same six go through our pipeline as new briefs so all three can be put
side by side for Q10.
