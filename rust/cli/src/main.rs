//! mscore: run the core over saved answers.
//!
//!   mscore ops FILE [--packs a,b] [--chunk N]   the op stream
//!   mscore tree FILE [--packs a,b]              the finished tree as JSON
//!   mscore verdict FILE [--reqs N] [--strict]   the validator's verdict
//!   mscore html FILE [--packs a,b] [--image-hosts a,b]
//!                                               the page; pictures load only from those
//!   mscore conformance DIR...                    every split gives the same tree
//!   mscore agui FILE [--piece N]                  the answer as an AG-UI 1.0 stream (SSE)
//!   mscore agui-read FILE                         an AG-UI stream (SSE) read by the core's client: its updates

use morphscreen_core::{Catalog, Parser};
use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering::Relaxed};
use std::{env, fs, path::Path, process::exit};

/// Counts live heap bytes, to measure memory while streaming.
struct Counting;
static LIVE: AtomicUsize = AtomicUsize::new(0);
static PEAK: AtomicUsize = AtomicUsize::new(0);
unsafe impl GlobalAlloc for Counting {
    unsafe fn alloc(&self, l: Layout) -> *mut u8 {
        let p = System.alloc(l);
        if !p.is_null() {
            let now = LIVE.fetch_add(l.size(), Relaxed) + l.size();
            PEAK.fetch_max(now, Relaxed);
        }
        p
    }
    unsafe fn dealloc(&self, p: *mut u8, l: Layout) {
        LIVE.fetch_sub(l.size(), Relaxed);
        System.dealloc(p, l)
    }
}
#[global_allocator]
static A: Counting = Counting;

fn catalog(args: &[String]) -> Catalog {
    let packs: Vec<String> = flag(args, "--packs").map(|p| p.split(',').map(String::from).collect()).unwrap_or_default();
    let refs: Vec<&str> = packs.iter().map(|s| s.as_str()).collect();
    Catalog::build(&refs, &[]).unwrap_or_else(|e| {
        eprintln!("{e}");
        exit(2)
    })
}

fn flag<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).map(|s| s.as_str())
}

/// Parses `text` fed in pieces of `sizes` (cycled), returning the tree JSON.
fn parse_chunked(cat: &Catalog, text: &str, sizes: &[usize]) -> (String, Parser) {
    let mut p = Parser::new(cat.clone());
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    let mut k = 0;
    while i < chars.len() {
        let n = sizes[k % sizes.len()].max(1);
        let piece: String = chars[i..i.saturating_add(n).min(chars.len())].iter().collect();
        p.push(&piece);
        i = i.saturating_add(n);
        k += 1;
    }
    p.finish(false);
    (p.tree_json(), p)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let cmd = args.get(1).map(|s| s.as_str()).unwrap_or("");
    match cmd {
        "ops" | "tree" | "verdict" => {
            let file = args.get(2).expect("file");
            let text = fs::read_to_string(file).expect("read");
            let cat = catalog(&args);
            // --chunk 7, or a sequence the fuzzer saved: --chunk 3,17,8,41 (cycled).
            let sizes: Vec<usize> = flag(&args, "--chunk").map(|c| c.split(',').map(|x| x.trim().parse().unwrap()).collect()).unwrap_or_else(|| vec![usize::MAX]);
            let chunk = sizes[0];
            let (tree, mut p) = parse_chunked(&cat, &text, &sizes);
            match cmd {
                "ops" => {
                    let mut q = Parser::new(cat.clone());
                    let chars: Vec<char> = text.chars().collect();
                    for piece in chars.chunks(chunk.min(chars.len().max(1))) {
                        q.push(&piece.iter().collect::<String>());
                        print!("{}", q.take_ops());
                    }
                    q.finish(false);
                    print!("{}", q.take_ops());
                }
                "tree" => println!("{tree}"),
                _ => {
                    let reqs = flag(&args, "--reqs").map(|r| r.parse().unwrap()).unwrap_or(0);
                    let v = p.verdict(false, reqs, args.iter().any(|a| a == "--strict"));
                    let _ = p.take_ops();
                    println!("complete={} n={} errs={:?} notes={:?}", v.complete, v.n, v.errs, v.notes);
                }
            }
        }
        "prompt" => {
            let cat = catalog(&args);
            if args.iter().any(|a| a == "--hash") {
                println!("{}", morphscreen_core::prompt::prompt_hash(&cat));
            } else {
                print!("{}", morphscreen_core::prompt::system_prompt(&cat));
            }
        }
        "agui" => {
            let text = fs::read_to_string(args.get(2).expect("file")).expect("read");
            let piece = flag(&args, "--piece").and_then(|p| p.parse().ok()).unwrap_or(24);
            print!("{}", morphscreen_core::agui::emit::answer("thread-1", "run-1", "msg-1", &text, piece));
        }
        "agui-read" => {
            let path = args.get(2).unwrap_or_else(|| {
                eprintln!("mscore agui-read FILE");
                exit(2)
            });
            let bytes = fs::read(path).unwrap_or_else(|e| {
                eprintln!("{path}: {e}");
                exit(1)
            });
            let mut c = morphscreen_core::agui::Client::new();
            c.feed(&bytes);
            c.close();
            print!("{}", c.take());
        }
        "html" => {
            let file = args.get(2).expect("file");
            let text = fs::read_to_string(file).expect("read");
            let (_, mut p) = parse_chunked(&catalog(&args), &text, &[usize::MAX]);
            let hosts: Vec<&str> = flag(&args, "--image-hosts").map(|h| h.split(',').collect()).unwrap_or_default();
            p.allow_images(&hosts);
            println!("{}", morphscreen_core::html::render(&p));
        }
        "htmls" => {
            // One JSON line per answer with its HTML, for comparing with render/html.ts.
            for dir in args[2..].iter().filter(|d| Path::new(d).is_dir()) {
                let mut entries: Vec<_> = fs::read_dir(dir).expect("dir").filter_map(|e| e.ok()).map(|e| e.path()).collect();
                entries.sort();
                for path in entries {
                    let name = path.file_name().unwrap().to_string_lossy().to_string();
                    if !name.starts_with("ours__") || !name.ends_with(".txt") {
                        continue;
                    }
                    let packs = packs_for(&path);
                    let refs: Vec<&str> = packs.iter().map(|s| s.as_str()).collect();
                    let cat = Catalog::build(&refs, &[]).unwrap();
                    let text = fs::read_to_string(&path).unwrap();
                    let (_, p) = parse_chunked(&cat, &text, &[usize::MAX]);
                    let mut line = String::from("{\"file\":");
                    morphscreen_core::json::write_str(&mut line, &path.display().to_string());
                    line.push_str(",\"html\":");
                    morphscreen_core::json::write_str(&mut line, &morphscreen_core::html::render(&p));
                    line.push('}');
                    println!("{line}");
                }
            }
        }
        "verdicts" => {
            // One JSON line per answer: the verdict, for comparing with the TypeScript validator.
            for dir in args[2..].iter().filter(|d| Path::new(d).is_dir()) {
                let mut entries: Vec<_> = fs::read_dir(dir).expect("dir").filter_map(|e| e.ok()).map(|e| e.path()).collect();
                entries.sort();
                for path in entries {
                    let name = path.file_name().unwrap().to_string_lossy().to_string();
                    if !name.starts_with("ours__") || !name.ends_with(".txt") {
                        continue;
                    }
                    let packs = packs_for(&path);
                    let refs: Vec<&str> = packs.iter().map(|s| s.as_str()).collect();
                    let cat = Catalog::build(&refs, &[]).unwrap();
                    let text = fs::read_to_string(&path).unwrap();
                    let (_, p) = parse_chunked(&cat, &text, &[usize::MAX]);
                    let v = p.verdict(false, 0, false);
                    let mut line = String::from("{\"file\":");
                    morphscreen_core::json::write_str(&mut line, &path.display().to_string());
                    line.push_str(&format!(",\"complete\":{},\"n\":{},\"errs\":[", v.complete, v.n));
                    for (i, (c, d)) in v.errs.iter().enumerate() {
                        if i > 0 {
                            line.push(',');
                        }
                        line.push('[');
                        morphscreen_core::json::write_str(&mut line, c);
                        line.push(',');
                        morphscreen_core::json::write_str(&mut line, d);
                        line.push(']');
                    }
                    line.push_str("]}");
                    println!("{line}");
                }
            }
        }
        "bench" => {
            // mscore bench DIR...: stream every answer in 32-character chunks.
            // Prints total time (median of 7 runs) and the worst peak memory
            // relative to the answer's size.
            let mut texts: Vec<(String, Vec<String>)> = Vec::new();
            for dir in args[2..].iter().filter(|d| Path::new(d).is_dir()) {
                let mut entries: Vec<_> = fs::read_dir(dir).unwrap().filter_map(|e| e.ok()).map(|e| e.path()).collect();
                entries.sort();
                for path in entries {
                    let name = path.file_name().unwrap().to_string_lossy().to_string();
                    if name.starts_with("ours__") && name.ends_with(".txt") {
                        let t = fs::read_to_string(&path).unwrap();
                        if !t.trim().is_empty() {
                            texts.push((t, packs_for(&path)));
                        }
                    }
                }
            }
            let cats: Vec<Catalog> = texts.iter().map(|(_, p)| Catalog::build(&p.iter().map(|s| s.as_str()).collect::<Vec<_>>(), &[]).unwrap()).collect();
            let chunks: Vec<Vec<String>> = texts.iter().map(|(t, _)| t.chars().collect::<Vec<_>>().chunks(32).map(|c| c.iter().collect()).collect()).collect();
            let mut times = Vec::new();
            for _ in 0..7 {
                let t0 = std::time::Instant::now();
                for (k, cs) in chunks.iter().enumerate() {
                    let mut p = Parser::new(cats[k].clone());
                    for c in cs {
                        p.push(c);
                        let _ = p.take_ops();
                    }
                    p.finish(false);
                    let _ = p.take_ops();
                }
                times.push(t0.elapsed().as_secs_f64() * 1000.0);
            }
            times.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let (mut worst, mut sum_ratio, mut bytes, mut scanned, mut reinlined) = (0f64, 0f64, 0usize, 0usize, 0usize);
            for (k, cs) in chunks.iter().enumerate() {
                let shared = std::sync::Arc::new(cats[k].clone());
                let base = LIVE.load(Relaxed);
                PEAK.store(base, Relaxed);
                let mut p = Parser::shared(shared.clone());
                for c in cs {
                    p.push(c);
                    let _ = p.take_ops();
                }
                p.finish(false);
                let _ = p.take_ops();
                let peak = PEAK.load(Relaxed) - base;
                let len = texts[k].0.len();
                let ratio = peak as f64 / len as f64;
                worst = worst.max(ratio);
                sum_ratio += ratio;
                bytes += len;
                scanned += p.scanned;
                reinlined += p.reinlined;
                drop(p);
            }
            println!(
                "{} answers, {} KB: streamed in 32-char chunks in {:.2} ms (median of 7); peak memory median-ish {:.2}x, worst {:.2}x the answer's size; structure scan read {:.2} bytes per input byte, words re-read for streaming {:.2} per byte",
                texts.len(),
                bytes / 1000,
                times[3],
                sum_ratio / texts.len() as f64,
                worst,
                scanned as f64 / bytes as f64,
                reinlined as f64 / bytes as f64
            );
        }
        "sizes" => {
            let text = fs::read_to_string(args.get(2).expect("file")).unwrap();
            let cat = Catalog::build(&["device"], &[]).unwrap();
            let base = LIVE.load(Relaxed);
            let c2 = cat.clone();
            let catalog_bytes = LIVE.load(Relaxed) - base;
            drop(c2);
            let (_, p) = parse_chunked(&cat, &text, &[32]);
            let spans: usize = p.nodes.iter().map(|n| n.spans.len()).sum();
            println!(
                "answer {} B; Node is {} B; {} nodes ({} B of structs); {} spans; catalog clone {} B; live after parse {} B",
                text.len(),
                std::mem::size_of::<morphscreen_core::tree::Node>(),
                p.nodes.len(),
                p.nodes.len() * std::mem::size_of::<morphscreen_core::tree::Node>(),
                spans,
                catalog_bytes,
                LIVE.load(Relaxed) - base
            );
        }
        "nodes" => {
            // mscore nodes DIR...: every closed node's own HTML must appear in
            // the page's HTML (what the web renderer relies on).
            let (mut checked, mut missing) = (0, 0);
            for dir in args[2..].iter().filter(|d| Path::new(d).is_dir()) {
                for e in fs::read_dir(dir).unwrap().filter_map(|e| e.ok()) {
                    let name = e.file_name().to_string_lossy().to_string();
                    if !name.starts_with("ours__") || !name.ends_with(".txt") {
                        continue;
                    }
                    let packs = packs_for(&e.path());
                    let cat = Catalog::build(&packs.iter().map(|s| s.as_str()).collect::<Vec<_>>(), &[]).unwrap();
                    let (_, p) = parse_chunked(&cat, &fs::read_to_string(e.path()).unwrap(), &[usize::MAX]);
                    let page = morphscreen_core::html::render(&p);
                    for n in p.nodes.iter().skip(1) {
                        // Leaves the web renderer swaps in: components without children and leaf blocks.
                        let leaf = if n.component { n.children.is_empty() && n.ty != "group" } else { matches!(n.ty.as_str(), "p" | "h" | "code" | "quote" | "hr") };
                        if !leaf {
                            continue;
                        }
                        checked += 1;
                        let h = morphscreen_core::html::render_node(&p, &n.id).unwrap_or_default();
                        if !h.is_empty() && !page.contains(&h) {
                            missing += 1;
                            if missing <= 5 {
                                println!("{}: node {} ({}) not found in page:\n  {}", name, n.id, n.ty, &h[..h.len().min(200)]);
                            }
                        }
                    }
                }
            }
            println!("{checked} leaf nodes, {missing} whose HTML differs from the page's");
        }
        "parseloop" => {
            // mscore parseloop DIR SECONDS: parse every answer whole, again and
            // again (for a profiler to sample).
            let secs: u64 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(10);
            let texts: Vec<String> = fs::read_dir(&args[2]).unwrap().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().starts_with("ours__")).map(|e| fs::read_to_string(e.path()).unwrap()).collect();
            let cat = std::sync::Arc::new(Catalog::core());
            let t0 = std::time::Instant::now();
            let mut n = 0;
            while t0.elapsed().as_secs() < secs {
                for t in &texts {
                    let mut p = Parser::shared(cat.clone());
                    p.push(t);
                    p.finish(false);
                    let _ = p.take_ops();
                }
                n += 1;
            }
            println!("{n} rounds, {:.3} ms per round", t0.elapsed().as_secs_f64() * 1000.0 / n as f64);
        }
        "check" => {
            // mscore check FILE: exits 1 (and says where) if any chunking or
            // two-way split gives a different tree.
            // The same catalog as the fuzzer (every pack), and the HTML too, since
            // a failure saved by the fuzzer may be a renderer panic.
            let text = fs::read_to_string(args.get(2).expect("file")).expect("read");
            let cat = Catalog::build(&["data", "commerce", "scheduling", "media", "docs", "inputs", "device", "interactive"], &[]).unwrap();
            let (whole, p) = parse_chunked(&cat, &text, &[usize::MAX]);
            let _ = morphscreen_core::html::render(&p);
            for sizes in [&[1usize][..], &[2], &[3], &[7]] {
                if parse_chunked(&cat, &text, sizes).0 != whole {
                    println!("differs with chunks {sizes:?}");
                    exit(1);
                }
            }
            let n = text.chars().count();
            for at in 1..n {
                if parse_chunked(&cat, &text, &[at, usize::MAX]).0 != whole {
                    println!("differs split at char {at}");
                    exit(1);
                }
            }
            println!("same");
        }
        "fuzz" => {
            // mscore fuzz SECONDS DIR...: mutate saved answers; every mutant must
            // parse without a panic, render, and give the same tree whole and
            // in random chunks. Failing inputs are written to fuzz-failures/.
            let secs: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(60);
            let mut corpus: Vec<String> = Vec::new();
            for dir in args[3..].iter().filter(|d| Path::new(d).is_dir()) {
                for e in fs::read_dir(dir).unwrap().filter_map(|e| e.ok()) {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.starts_with("ours__") && name.ends_with(".txt") {
                        if let Ok(t) = fs::read_to_string(e.path()) {
                            if !t.trim().is_empty() {
                                corpus.push(t);
                            }
                        }
                    }
                }
            }
            // Every pack on, so their code (QR, TeX, pack HTML) is fuzzed too.
            let cat = Catalog::build(&["data", "commerce", "scheduling", "media", "docs", "inputs", "device", "interactive"], &[]).unwrap();
            let start = std::time::Instant::now();
            let mut rng = 0x9E3779B97F4A7C15u64 ^ std::process::id() as u64;
            let mut next = move || {
                rng ^= rng << 13;
                rng ^= rng >> 7;
                rng ^= rng << 17;
                rng
            };
            const BITS: &[&str] = &[
                "<Card title=\"x\">", "</Card>", "<Columns>", "</Columns>", "<Tabs>", "<Tab title=\"a\">", "</Tab>", "|", "| a | b |\n", "|---|\n", "\n", "\n\n", "```", "```js\n", "`", "**", "*", "_",
                "[x](", "](http://a)", "![i](", "<br>", "<p>", "</p>", "<h2>", "</h2>", "<strong>", "</b>", "🎉", "\u{200d}", "\u{fe0f}", "👍🏽", "<think>", "</think>", "\"", "'", ">", "<", "{", "}", "#", "## ",
                "- [ ] ", "- ", "1. ", "> ", "<Badge tone=\"success\">", "</Badge>", "<Button>", "</Button>", "<Stat label=\"a\" value=\"1\" />", "<Chart type=\"pie\">", "</Chart>", "<Map>", "</Map>",
                "<Input label=\"a\"", "/>", "<Foo>", "</Foo>", "\u{0}", "\u{3}", "\r\n", "\t", "é", "—", " - ", "<Select options=\"A | B\" />", "javascript:alert(1)",
                "<QR value=\"", "\" />", "<Math tex=\"\\frac{", "^{", "_{", "\\sqrt[", "\\", "<Code file=\"a\">", "</Code>", "<Diff>", "</Diff>", "<Calendar month=\"2026-13\">", "</Calendar>",
                "| 2026-02-30 | x |\n", "<Gauge label=\"g\" value=\"", "<Embed src=\"https://youtu.be/", "<FileTree>", "- a/b/\n", "</FileTree>", "<Tree>", "- a > > b\n", "</Tree>", "</badge>",
                "<Event title=\"e\" start=\"2026-10-20T18:00\" end=\"", "<Countdown label=\"c\" until=\"", "<AddToCalendar title=\"t\" start=\"", "</AddToCalendar>", "<Sparkline label=\"s\" values=\"1 | x | 3\" />",
                "<Quiz title=\"q\">", "</Quiz>", "<Question text=\"q\" answer=\"B\" explain=\"e\">", "</Question>", "<Flashcards>", "</Flashcards>", "<Poll label=\"p\" options=\"A | B\" />",
                "<Checklist name=\"c\">", "</Checklist>", "- [x] ", "<WhatIf>", "</WhatIf>", "<Slider label=\"Price\" min=\"0\" max=\"10\" value=\"", "<Result label=\"r\" unit=\"$\" value=\"",
                "price * qty * (1 - discount / 100)", "max(", "round(", "^", "%", "-(", "1e308 * 1e308", "0 / 0", ")))",
                "\u{a0}", "\u{202f}", "\u{3000}", "  ", "<Chart type=\"scatter\">", "<Chart type=\"line\">", "| 1.5 | -2 | 1e9 |\n", "<Rating value=\"",
                "\\left(", "\\right)", "\\left|", "\\operatorname{", "<Stat label=\"a\" value=\"1\" change=\"+12% vs last\" />",
            ];
            let (mut runs, mut fails) = (0u64, 0u64);
            // A line every ten minutes: on a long run, a stuck input shows as the log going quiet.
            let mut said = 0u64;
            fs::create_dir_all("fuzz-failures").ok();
            while start.elapsed().as_secs() < secs {
                let base = &corpus[(next() % corpus.len() as u64) as usize];
                let mut chars: Vec<char> = base.chars().collect();
                for _ in 0..1 + next() % 6 {
                    let at = if chars.is_empty() { 0 } else { (next() % chars.len() as u64) as usize };
                    match next() % 6 {
                        0 => {
                            let len = (next() % 40) as usize;
                            let end = (at + len).min(chars.len());
                            chars.drain(at..end);
                        }
                        1 | 2 => {
                            let bit: Vec<char> = BITS[(next() % BITS.len() as u64) as usize].chars().collect();
                            chars.splice(at..at, bit);
                        }
                        3 => {
                            let len = (next() % 80) as usize;
                            let end = (at + len).min(chars.len());
                            let dup: Vec<char> = chars[at..end].to_vec();
                            chars.splice(at..at, dup);
                        }
                        4 => chars.truncate(at),
                        _ => {
                            if let Some(c) = char::from_u32((next() % 0x2FFF) as u32) {
                                chars.splice(at..at, [c]);
                            }
                        }
                    }
                }
                let text: String = chars.into_iter().collect();
                let sizes: Vec<usize> = (0..4).map(|_| 1 + (next() % 50) as usize).collect();
                let tag = sizes.iter().map(|n| n.to_string()).collect::<Vec<_>>().join(",");
                let cat2 = cat.clone();
                let t2 = text.clone();
                // One mutant in four is also drawn node by node while it streams (slower).
                let draw = runs % 4 == 0;
                let result = std::panic::catch_unwind(move || {
                    let (whole, mut p) = parse_chunked(&cat2, &t2, &[usize::MAX]);
                    let _ = morphscreen_core::html::render(&p);
                    p.allow_images(&["https://media.example", "cdn.example"]);
                    let _ = morphscreen_core::html::render(&p);
                    let _ = p.verdict(false, 3, true);
                    // As the web SDK streams: a node is drawn on its own as it closes, an open
                    // chart from the rows it has after every chunk, and a chart with a series
                    // switched off in its legend.
                    let mut q = Parser::new(cat2.clone());
                    let cs: Vec<char> = t2.chars().collect();
                    let (mut i, mut k) = (0, 0);
                    let mut drawn = Vec::new();
                    while i < cs.len() {
                        let n = sizes[k % sizes.len()];
                        q.push(&cs[i..(i + n).min(cs.len())].iter().collect::<String>());
                        i += n;
                        k += 1;
                        drawn.resize(q.nodes.len(), false);
                        for j in (0..q.nodes.len()).filter(|_| draw) {
                            let chart = q.nodes[j].ty == "Chart";
                            if (q.nodes[j].closed && !drawn[j]) || (chart && !q.nodes[j].closed) {
                                drawn[j] = q.nodes[j].closed;
                                let id = q.nodes[j].id.clone();
                                let _ = morphscreen_core::html::render_node(&q, &id);
                                if chart {
                                    let _ = morphscreen_core::html::render_node_without(&q, &id, &[k % 3]);
                                }
                            }
                        }
                    }
                    q.finish(false);
                    for j in (0..q.nodes.len()).filter(|_| draw) {
                        let id = q.nodes[j].id.clone();
                        let _ = morphscreen_core::html::render_node(&q, &id);
                        if q.nodes[j].ty == "Chart" {
                            let _ = morphscreen_core::html::render_node_without(&q, &id, &[0, 1]);
                        }
                    }
                    whole == q.tree_json()
                });
                runs += 1;
                if start.elapsed().as_secs() / 600 > said {
                    said = start.elapsed().as_secs() / 600;
                    eprintln!("{}s: {runs} mutated answers, {fails} failures", start.elapsed().as_secs());
                }
                if !matches!(result, Ok(true)) {
                    fails += 1;
                    // The chunk sizes go in the name: replay with mscore tree FILE --chunk 3,17,8,41.
                    let kind = if result.is_err() { "panic" } else { "diff" };
                    fs::write(format!("fuzz-failures/{kind}-{runs}-chunks-{tag}.txt"), &text).ok();
                }
            }
            println!("{runs} mutated answers in {secs}s, {fails} failures");
            if fails > 0 {
                exit(1);
            }
        }
        "conformance" => {
            let mut files = 0;
            let mut fails = 0;
            let mut splits = 0u64;
            for dir in args[2..].iter().filter(|d| Path::new(d).is_dir()) {
                let mut entries: Vec<_> = fs::read_dir(dir).expect("dir").filter_map(|e| e.ok()).map(|e| e.path()).collect();
                entries.sort();
                for path in entries {
                    let name = path.file_name().unwrap().to_string_lossy().to_string();
                    if !name.starts_with("ours__") || !name.ends_with(".txt") {
                        continue;
                    }
                    let packs = packs_for(&path);
                    let refs: Vec<&str> = packs.iter().map(|s| s.as_str()).collect();
                    let cat = Catalog::build(&refs, &[]).unwrap();
                    let text = fs::read_to_string(&path).unwrap();
                    files += 1;
                    let (whole, _) = parse_chunked(&cat, &text, &[usize::MAX]);
                    let mut bad: Option<String> = None;
                    for sizes in [&[1usize][..], &[2], &[3], &[7], &[13], &[32], &[100], &[5, 1, 17, 2, 64, 3]] {
                        splits += 1;
                        let (t, _) = parse_chunked(&cat, &text, sizes);
                        if t != whole {
                            bad = Some(format!("chunks {:?}", sizes));
                            break;
                        }
                    }
                    // Every two-way split (every 7th point on long answers).
                    let chars: Vec<char> = text.chars().collect();
                    let stride = if chars.len() > 3000 { 7 } else { 1 };
                    if bad.is_none() {
                        let mut at = 1;
                        while at < chars.len() {
                            splits += 1;
                            let (t, _) = parse_chunked(&cat, &text, &[at, usize::MAX]);
                            if t != whole {
                                bad = Some(format!("split at char {at}"));
                                break;
                            }
                            at += stride;
                        }
                    }
                    if let Some(b) = bad {
                        fails += 1;
                        println!("DIFF {} ({b})", path.display());
                    }
                }
            }
            println!("{files} answers, {splits} splits, {fails} with a different tree");
            if fails > 0 {
                exit(1);
            }
        }
        _ => {
            eprintln!("usage: mscore ops|tree|verdict FILE | conformance DIR...");
            exit(2);
        }
    }
}

/// The packs an answer's prompt had (bench/run.ts records them in meta.jsonl).
fn packs_for(path: &Path) -> Vec<String> {
    let meta = path.parent().unwrap().join("meta.jsonl");
    let id = path.file_stem().unwrap().to_string_lossy().to_string();
    let Ok(text) = fs::read_to_string(meta) else { return Vec::new() };
    for line in text.lines() {
        if line.contains(&format!("\"id\":\"{id}\"")) {
            if let Some(p) = line.find("\"packs\":[") {
                let rest = &line[p + 9..];
                let end = rest.find(']').unwrap_or(0);
                return rest[..end].split(',').map(|s| s.trim().trim_matches('"').to_string()).filter(|s| !s.is_empty()).collect();
            }
        }
    }
    Vec::new()
}
