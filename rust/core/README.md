# morphscreen-core

The format's core: one streaming parser, validator and HTML renderer that
every SDK runs. `no_std` + `alloc`, so the same code builds as WASM for the
web, a static library for iOS, a JNI library for Android, and a crate for
servers.

```rust
use morphscreen_core::{catalog::Catalog, html, parse::Parser};

let mut p = Parser::new(Catalog::build(&["all"], &[]).unwrap());
p.push("<Card title=\"Plan\">\nHello ");
p.push("world\n</Card>\n");
p.finish(false);
let ops = p.take_ops(); // JSON lines: open, spans, close, diag, end
let verdict = p.verdict(false, 0, false); // valid or not, and why
let page = html::render(&p); // the finished tree as HTML, no script needed
```

Text goes in as it streams, and each byte is read once: what's been drawn
never changes because more arrived (`mscore conformance` checks that on
every recorded answer, split at every point). The catalog is the
components an app allows, from spec/packs and its own packs; anything else
in an answer is reported, never drawn as markup.

What's in it: `parse` (the streaming parser), `validate` and `catalog`
(the rules), `inline` (Markdown inside lines, and which addresses are
safe), `images` (where pictures may load from), `formula` (What-if
arithmetic, compiled to postfix tokens), `html` (the renderer), `prompt`
(the system prompt for a catalog), `agui` (the AG-UI 1.0 client and
server events).

```sh
cargo test -p morphscreen-core            # from rust/
cargo run -p morphscreen-cli -- html answer.md --packs all
```

tests/security.rs fills every attribute of every component with attacks
and checks the HTML can't run or load anything (docs/security.md).
