# MorphScreen

Let your model answer with real UI. A model writes its answer as Markdown
with a few tags (`<Card>`, `<Chart>`, `<Quiz>`, `<Product>`), the core reads
it as it streams and checks every line against the components the app
allows, and the SDKs draw it as real UI on the web, in SwiftUI and in
Compose.

```markdown
## Weekend in Lisbon

<Columns>
<Stat label="Budget" value="$330" />
<Stat label="Per day" value="$165" />
</Columns>

<Map title="Where to go">
| Place | Lat | Lng |
|---|---|---|
| Belém Tower | 38.6916 | -9.2160 |
| Alfama | 38.7114 | -9.1300 |
</Map>
```

This repository is the open part of MorphScreen, under the Apache License
2.0: the format, the Rust core, the SDKs, the benchmark and the website.
The hosted API at api.morphscreen.com (it adds the components' prompt, runs
the model and has the same model repair any line that breaks a rule) is
MorphScreen's paid service, with a free plan; its server isn't in here.
Docs: https://morphscreen.com/docs

## Use it

```sh
npm install @morphscreen/web
```

```js
import { createAnswer, loadCore } from "@morphscreen/web";
import "@morphscreen/web/morphscreen.css";

// dist/morphscreen.wasm from the package, served with the app
const core = await loadCore("/assets/morphscreen.wasm");
const answer = createAnswer(document.querySelector("#answer"), {
  core,
  imageHosts: ["cdn.example.com"], // where pictures may load from
  onAction: (a) => console.log(a), // a button, a form, a quiz: the app decides
});
for await (const text of chunksFromYourServer()) answer.push(text);
answer.end();
```

The text can come from the hosted API (one base URL and one header on the
OpenAI client you already use; [quickstart](https://morphscreen.com/docs/quickstart))
or from any model you prompt yourself with the prompt the core builds.
Each SDK's README has its own start: [web](sdk/web/README.md),
[SwiftUI](sdk/swift/README.md), [Compose](sdk/android/README.md).

## What's where

| Folder | What it holds |
|---|---|
| `spec/` | The format (spec/format.md), the component packs (spec/packs/*.json) and the theme tokens |
| `prompt/` | The system prompt, built from the catalog, and its rules |
| `rust/core` | The streaming parser, the validator and the HTML renderer, built as WASM for the web and a C library for Swift and Kotlin ([README](rust/core/README.md)) |
| `rust/ffi`, `rust/cli` | The C ABI, WASM and JNI bindings; `mscore`, the core on the command line |
| `sdk/` | The web (with React), SwiftUI and Compose SDKs |
| `validator/`, `render/` | The TypeScript reference validator and renderer, held to the core by the parity test |
| `bench/` | The benchmark against OpenUI on its own briefs: every raw answer, the harness and bench/SCOREBOARD.md |
| `compare/` | How OpenUI's side of the benchmark is built |
| `site/`, `ui/` | morphscreen.com and its docs, and MorphScreenUI, the design system they use |
| `docs/` | The API reference, AG-UI, media, theming, custom components and security |
| `test/`, `examples/` | Tests across the languages, and a LangGraph agent drawing into the web SDK |

`rust/api` holds only the two files the site and the docs read from the
hosted API (its plans and its OpenAPI description); the server itself is
private.

## Where it runs

| SDK | Runs on |
|---|---|
| Web (`@morphscreen/web`: plain DOM, or React 18+) | Browsers with WebAssembly |
| SwiftUI (the `MorphScreen` Swift package) | iOS 17+, macOS 14+ |
| Compose (`sdk/android`, its `core` and `ui` modules) | Android 7.0+ (API 24), desktop JVM |

The SDKs send nothing of their own: no analytics, no telemetry, no calls
home. They load pictures only from the hosts the app lists and never run
anything a model wrote. docs/security.md has the detail.

## Working on it

```sh
cd rust && cargo test --release --workspace         # the core and its bindings
cargo run --release -p morphscreen-cli -- conformance ../bench/raw/*   # every split, the same tree
cd .. && node sdk/web/build.mjs && node --test test/*.test.ts   # TS checks, parity with the core
node sdk/web/test-stream.mjs                          # one of the web SDK's browser tests
node sdk/web/size.mjs && node tools/sbom.mjs          # the download budget and every bundled piece's licence
node site/build.mjs && node site/test.mjs             # the website and docs
```

The web SDK's browser tests need Chrome (and Firefox with
`BROWSER=firefox`); its build needs `wasm-opt` from binaryen and the tools
in sdk/web/tools. .github/workflows/ci.yml is the full list CI runs.

## Issues and pull requests

Bugs and ideas go in this repository's issues. Pull requests are welcome:
CONTRIBUTING.md says how. A security problem goes to support@morphscreen.com
instead (SECURITY.md). Questions about your account or the hosted API:
SUPPORT.md.

## License

Apache License 2.0 (LICENSE and NOTICE). Third-party parts keep their own
licences, credited in THIRD_PARTY_NOTICES.md.
