// The core's contract, on small answers: what streaming must never change,
// and what the validator must catch. The recorded answers get the same checks
// at scale (mscore conformance, test/parity.test.ts).

use morphscreen_core::catalog::Catalog;
use morphscreen_core::parse::Parser;
use morphscreen_core::validate::Verdict;

fn parse(text: &str, chunk: usize, packs: &[&str]) -> (String, Verdict) {
    let mut p = Parser::new(Catalog::build(packs, &[]).unwrap());
    let chars: Vec<char> = text.chars().collect();
    for piece in chars.chunks(chunk.max(1)) {
        p.push(&piece.iter().collect::<String>());
    }
    p.finish(false);
    let v = p.verdict(false, 0, false);
    (p.tree_json(), v)
}

fn errs(text: &str) -> Vec<String> {
    parse(text, usize::MAX, &[]).1.errs.into_iter().map(|(c, d)| format!("{c}:{d}")).collect()
}

const ANSWER: &str = "# Weekend in Lisbon\n\n<Card title=\"Budget\">\n| Item | Cost |\n|---|---:|\n| Hotel | $240 |\n| Food | $90 |\n\n<Columns>\n<Stat label=\"Total\" value=\"$330\" tone=\"success\" />\n<Stat label=\"Per day\" value=\"$165\" />\n</Columns>\n\nPaid: <Badge tone=\"success\">yes</Badge>\n</Card>\n\n<FollowUps>\n- Find cheaper hotels\n- Add a day trip\n</FollowUps>\n";

#[test]
fn any_chunking_gives_the_same_tree() {
    let (whole, v) = parse(ANSWER, usize::MAX, &[]);
    assert!(v.complete, "{:?}", v.errs);
    for chunk in [1, 2, 3, 7, 16, 31, 64] {
        assert_eq!(parse(ANSWER, chunk, &[]).0, whole, "chunk {chunk}");
    }
}

#[test]
fn unknown_attributes_inside_text_are_reported() {
    // A component inside a sentence or table cell is checked like any other
    // (it used to be cleaned before the check, so these passed).
    assert_eq!(errs("Status: <Badge tone=\"sparkly\">On track</Badge>\n"), ["enum-mismatch:Badge.tone=sparkly"]);
    assert_eq!(errs("| Task | State |\n|---|---|\n| Ship | <Badge tone=\"later\">Open</Badge> |\n"), ["enum-mismatch:Badge.tone=later"]);
    assert_eq!(errs("  <Button variant=\"primary\" style=\"width: 100%\">\n    Join\n  </Button>\n"), ["signature-mismatch:Button.style"]);
}

#[test]
fn inline_errors_are_reported_once_however_the_text_arrives() {
    let text = "Status: <Badge tone=\"sparkly\">On track</Badge> and <Badge tone=\"bogus\">x</Badge>\n";
    let whole = parse(text, usize::MAX, &[]).1.errs;
    assert_eq!(whole.len(), 2);
    for chunk in [1, 5, 13] {
        assert_eq!(parse(text, chunk, &[]).1.errs, whole, "chunk {chunk}");
    }
}

#[test]
fn a_label_that_is_only_emoji_is_empty() {
    assert_eq!(errs("Priority <Badge tone=\"danger\">\u{2757}</Badge>\n"), ["required-field:Badge label"]);
    assert!(errs("<Badge tone=\"danger\">\u{2757} Urgent</Badge>\n").is_empty());
}

#[test]
fn unknown_components_are_reported_and_their_text_kept() {
    let (tree, v) = parse("<Sparkle>Hello there</Sparkle>\n", usize::MAX, &[]);
    assert!(v.errs.iter().any(|(c, d)| c == "hallucinated-component" && d == "Sparkle"));
    assert!(tree.contains("Hello there"));
}

#[test]
fn device_components_need_the_device_pack() {
    let text = "<Camera label=\"Receipt\" />\n";
    assert!(errs(text).iter().any(|e| e.starts_with("hallucinated-component")));
    assert!(parse(text, usize::MAX, &["device"]).1.complete);
}

#[test]
fn unclosed_components_are_malformed_but_still_shown() {
    let (tree, v) = parse("<Card title=\"Open\">\nStill here.\n", 4, &[]);
    assert!(!v.complete);
    assert!(v.errs.iter().any(|(c, _)| c == "malformed-syntax"));
    assert!(tree.contains("Still here."));
}

#[test]
fn unsafe_urls_are_dropped() {
    let (tree, v) = parse("<Avatar name=\"A\" src=\"javascript:alert(1)\" />\n", usize::MAX, &[]);
    assert!(v.errs.iter().any(|(c, _)| c == "unsafe-url"));
    assert!(!tree.contains("javascript:"));
}

#[test]
fn a_tag_that_cant_be_read_is_an_error_on_its_line() {
    // The format's signature notation, an attribute without its `=`, a value
    // with no name, a tag never ended: each shows as text. (A plain value
    // without quotes, title=Budget, is read.)
    for (text, line) in [
        ("Intro.\n\n<Stat label! value! tone?>\n", 3),
        ("<Columns>\n<Card title=\"Ambient\" subtitle \"Eno\">\nCalm.\n</Card>\n</Columns>\n", 2),
        ("<Card title=\"Budget\" \"Weekend\">\nText.\n</Card>\n", 1),
        ("  <Stat label=\"Total\" value=\"$330\"\n", 1),
    ] {
        for chunk in [1, 3, usize::MAX] {
            let (_, v) = parse(text, chunk, &[]);
            let unread: Vec<_> = v.errs.iter().filter(|(c, _)| c == "unreadable-tag").collect();
            assert_eq!(unread.len(), 1, "{text:?} in chunks of {chunk}: {:?}", v.errs);
            assert!(unread[0].1.ends_with(&format!("can't be read as a tag (line {line})")), "{:?}", unread[0]);
        }
    }
    // Not a component's line: an unknown name, a mention in a sentence, code.
    for text in ["<Foo bar baz>\n", "Use <Stat label> for one number.\n", "The signature:\n\n```\n<Stat label! value!>\n```\n", "`<Stat label!>` is the signature.\n"] {
        assert!(!errs(text).iter().any(|e| e.starts_with("unreadable-tag")), "{text:?}: {:?}", errs(text));
    }
    assert!(!errs(ANSWER).iter().any(|e| e.starts_with("unreadable-tag")));
}

#[test]
fn emoji_never_reach_the_tree() {
    let (tree, _) = parse("Ready \u{1F680} to go \u{2705}\n", 3, &[]);
    assert!(tree.contains("Ready to go"), "{tree}");
    assert!(!tree.contains('\u{1F680}') && !tree.contains('\u{2705}'));
}

const ALL_PACKS: &[&str] = &["data", "commerce", "scheduling", "media", "docs", "inputs", "device", "interactive"];

#[test]
fn every_pack_component_in_one_answer() {
    let text = include_str!("../../../test/fixtures/packs-all.md");
    let (_, v) = parse(text, 17, ALL_PACKS);
    assert!(v.complete, "{:?}", v.errs);
    let mut p = Parser::new(Catalog::build(ALL_PACKS, &[]).unwrap());
    p.push(text);
    p.finish(false);
    let html = morphscreen_core::html::render(&p);
    for class in ["class=\"ms-kv\"", "class=\"ms-timeline\"", "class=\"ms-gauge ms-warning\"", "class=\"ms-heatmap\"", "class=\"ms-funnel\"", "class=\"ms-spark\"", "class=\"ms-tree\"", "class=\"ms-product\"", "class=\"ms-plan ms-featured\"", "class=\"ms-cart\"", "class=\"ms-stars\"", "class=\"ms-compare\"", "class=\"ms-price\"", "class=\"ms-calendar\"", "class=\"ms-event ms-info\"", "class=\"ms-field ms-chips\"", "class=\"ms-agenda\"", "class=\"ms-countdown\"", "class=\"ms-video\"", "class=\"ms-audio\"", "class=\"ms-embed\"", "class=\"ms-carousel\"", "class=\"ms-codefile\"", "class=\"ms-diff\"", "class=\"ms-math\"", "class=\"ms-filetree\"", "class=\"ms-citation\"", "class=\"ms-field ms-star-input\"", "<datalist", "type=\"time\"", "class=\"ms-field ms-stepper\"", "class=\"ms-field ms-signature\"", "class=\"ms-field ms-contact\"", "text/calendar", "class=\"ms-btn ms-secondary ms-share\"", "class=\"ms-field ms-voice\"", "class=\"ms-qr\""] {
        assert!(html.contains(class), "no {class} in the HTML");
    }
    // Nothing from an embed's host loads until asked: a link, the player URL kept aside.
    assert!(html.contains("data-player=\"https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ\""));
    assert!(!html.contains("<iframe"));
}

#[test]
fn math_as_unicode() {
    use morphscreen_core::math::to_unicode;
    assert_eq!(to_unicode("E_k = \\frac{1}{2} m v^2"), "Eₖ = 1/2 m v²");
    assert_eq!(to_unicode("\\sigma = \\sqrt{\\frac{1}{N} \\sum_{i=1}^{N} (x_i - \\mu)^2}"), "σ = √(1/N ∑ᵢ₌₁ᴺ (xᵢ - μ)²)");
    assert_eq!(to_unicode("a \\le b \\cdot c"), "a ≤ b · c");
    assert_eq!(to_unicode("x^{2n+1}"), "x²ⁿ⁺¹");
    assert_eq!(to_unicode("\\mathbb{R}^n \\to \\mathbb{R}"), "ℝⁿ → ℝ");
    assert_eq!(to_unicode("\\bar{x}"), "x\u{304}");
    // Unknown commands stay readable as TeX rather than vanish (validation asks for them to be rewritten).
    assert_eq!(to_unicode("\\foo{x}"), "\\foox");
    // Marks over symbols, and the symbols models reach for when checking work.
    assert_eq!(to_unicode("2 \\stackrel{?}{=} 2(4) - 3"), "2 ≟ 2(4) - 3");
    assert_eq!(to_unicode("3 = 3 \\checkmark \\therefore x = 3"), "3 = 3 ✓ ∴ x = 3");
    assert_eq!(to_unicode("\\overset{2}{\\to}"), "→²");
}

#[test]
fn tex_that_isnt_drawn_goes_back_to_be_rewritten() {
    use morphscreen_core::math::{to_mathml, unsupported};
    // The demo's answer: \stackrel and \checkmark are drawn, so nothing to rewrite.
    let demo = "y = 2x - 3 \\Rightarrow 2 \\stackrel{?}{=} 2(4) - 3 = 5 \\qquad 3 = 3 \\checkmark";
    assert!(unsupported(demo).is_empty(), "{:?}", unsupported(demo));
    let ml = to_mathml(demo);
    assert!(ml.contains("<mover><mrow><mo>=</mo></mrow><mrow><mo>?</mo></mrow></mover>") && ml.contains("✓"), "{ml}");
    // One that isn't: named once, drawn as its TeX, and an error in the verdict.
    assert_eq!(unsupported("\\cancel{x} + \\cancel{y}"), vec!["cancel".to_string()]);
    assert!(to_mathml("\\cancel{x}").contains("<mtext>\\cancel</mtext>"));
    let docs = |t: &str| parse(t, usize::MAX, &["docs"]).1.errs.into_iter().map(|(c, d)| format!("{c}:{d}")).collect::<Vec<_>>();
    let e = docs("<Math tex=\"\\cancel{x} = 0\" />\n");
    assert!(e.iter().any(|x| x.contains("\\cancel isn't supported")), "{e:?}");
    assert!(docs("<Math tex=\"2 \\stackrel{?}{=} 2\" />\n").is_empty());
}

#[test]
fn tex_becomes_mathml_for_the_web() {
    use morphscreen_core::math::to_mathml;
    assert_eq!(to_mathml("E_k = \\frac{1}{2} m v^2"), "<math display=\"block\"><mrow><msub><mi>E</mi><mi>k</mi></msub><mo>=</mo><mfrac><mrow><mn>1</mn></mrow><mrow><mn>2</mn></mrow></mfrac><mi>m</mi><msup><mi>v</mi><mn>2</mn></msup></mrow></math>");
    let sd = to_mathml("\\sigma = \\sqrt{\\frac{1}{N} \\sum_{i=1}^{N} (x_i - \\mu)^2}");
    assert!(sd.contains("<msqrt>") && sd.contains("<munderover><mo>∑</mo>") && sd.contains("<mo>\u{2212}</mo>"), "{sd}");
    assert!(to_mathml("\\left( \\frac{a}{b} \\right)").contains("<mo fence=\"true\" stretchy=\"true\">(</mo>"));
    assert!(sd.contains("<mo stretchy=\"false\">(</mo>"), "{sd}");
    assert!(to_mathml("\\text{if } x < 0").contains("<mtext>if </mtext>") && to_mathml("x < 0").contains("<mo>&lt;</mo>"));
    // Malformed or deeply nested TeX still gives markup, and never runs out of stack.
    for bad in ["\\frac{", "}}}{{{", "x^", "\\left(", "\\right)", "\\sqrt[", "\\", "_^_^"] {
        assert!(to_mathml(bad).starts_with("<math"), "{bad}");
    }
    let deep = "{".repeat(5000) + "x" + &"}".repeat(5000);
    assert!(to_mathml(&deep).contains("<mtext>"));
    assert!(to_mathml(&"\\sqrt[".repeat(3000)).starts_with("<math"));
}

#[test]
fn deep_or_repeated_tex_stays_on_the_stack_and_small() {
    use morphscreen_core::math::{to_mathml, to_unicode};
    // Commands nested without braces used to recurse without a limit, in the text both
    // native SDKs show and in the web's MathML; run on a 1 MB stack, the browser's size.
    std::thread::Builder::new()
        .stack_size(1 << 20)
        .spawn(|| {
            for deep in ["{".repeat(5000) + "x" + &"}".repeat(5000), "\\sqrt[".repeat(5000), "\\sqrt".repeat(5000) + "x", "\\hat".repeat(5000) + "x", "\\frac".repeat(5000) + "ab", "\\left(".repeat(5000)] {
                assert!(!to_unicode(&deep).is_empty());
                assert!(to_mathml(&deep).starts_with("<math"));
            }
        })
        .unwrap()
        .join()
        .unwrap();
    // An accent marks letters, not the marks before it: one mark per accent, not double each time.
    assert_eq!(to_unicode("\\hat\\hat x"), "x\u{302}\u{302}");
    assert_eq!(to_unicode(&("\\hat ".repeat(20) + "x")).chars().count(), 21);
    // Past the depth limit the rest is kept as written; either way it grows with the input, not 2^n.
    assert!(to_unicode(&("\\hat ".repeat(60) + "x")).len() < 2000);
}

#[test]
fn qr_codes() {
    use morphscreen_core::qr::encode;
    let rows = encode("https://example.com").unwrap();
    assert_eq!(rows.len(), 25, "19 bytes fit version 2");
    assert!(rows.iter().all(|r| r.len() == 25));
    // The three finder patterns.
    for (x, y) in [(0, 0), (18, 0), (0, 18)] {
        assert_eq!(&rows[y][x..x + 7], "1111111");
        assert_eq!(&rows[y + 1][x..x + 7], "1000001");
        assert_eq!(&rows[y + 3][x..x + 7], "1011101");
    }
    assert_eq!(encode(&"x".repeat(213)).unwrap().len(), 57, "213 bytes is version 10");
    assert!(encode(&"x".repeat(214)).is_none());
    let (_, v) = parse(&format!("<QR value=\"{}\" />\n", "x".repeat(300)), usize::MAX, &["device"]);
    assert!(v.errs.iter().any(|(c, d)| c == "signature-mismatch" && d.contains("213")));
}

#[test]
fn embeds_only_from_known_hosts() {
    use morphscreen_core::html::embed_url;
    assert_eq!(embed_url("https://youtu.be/abc_DEF-123").unwrap().0, "https://www.youtube-nocookie.com/embed/abc_DEF-123");
    assert_eq!(embed_url("https://vimeo.com/76979871").unwrap().0, "https://player.vimeo.com/video/76979871");
    assert_eq!(embed_url("https://open.spotify.com/playlist/37i9dQZF1DX5trt9i14X7j").unwrap().0, "https://open.spotify.com/embed/playlist/37i9dQZF1DX5trt9i14X7j");
    assert!(embed_url("https://evil.example/watch?v=x").is_none());
    assert!(embed_url("javascript:alert(1)").is_none());
    assert!(embed_url("https://youtube.com/watch?v=a\"onload=x").is_none());
}

#[test]
fn dates_with_odd_characters_dont_panic() {
    // Found by the fuzzer: a byte offset inside a character in a date.
    for text in [
        "<Calendar>\n| Date | What |\n|---|---|\n| 2026-10-1\u{1b6} | x |\n</Calendar>\n",
        "<Event title=\"e\" start=\"2026-10-20T18:00\" end=\"2026-10-20T1\u{1b6}:0\">x</Event>\n",
        "<Event title=\"e\" start=\"2026-10-2\u{e9}T18:00\" end=\"2026-10-2\u{e9}T19:00\">x</Event>\n",
        "<Countdown label=\"c\" until=\"2026-\u{1b6}-01\" />\n",
    ] {
        let mut p = Parser::new(Catalog::build(ALL_PACKS, &[]).unwrap());
        p.push(text);
        p.finish(false);
        let html = morphscreen_core::html::render(&p);
        assert!(!html.is_empty(), "{text}");
    }
}

fn verdict_of(text: &str, packs: &[&str], custom: &[&str]) -> Verdict {
    let mut p = Parser::new(Catalog::build(packs, custom).unwrap());
    p.push(text);
    p.finish(false);
    p.verdict(false, 0, false)
}

#[test]
fn synonyms_coerce_with_a_note() {
    let v = verdict_of("Status: <Badge tone=\"current\">On track</Badge>\n<Chart type=\"grouped\">\n| A | B |\n|---|---|\n| x | 1 |\n</Chart>\n", &[], &[]);
    assert!(v.complete, "{:?}", v.errs);
    assert!(v.notes.iter().any(|n| n.contains("Badge.tone=current")), "{:?}", v.notes);
    assert!(v.notes.iter().any(|n| n.contains("Chart.type=grouped")), "{:?}", v.notes);
    let mut p = Parser::new(Catalog::build(&[], &[]).unwrap());
    p.push("<Badge tone=\"current\">On track</Badge>\n");
    p.finish(false);
    assert!(morphscreen_core::html::render(&p).contains("ms-badge ms-info"));
}

#[test]
fn synonyms_only_for_their_own_attribute() {
    // A customer's "level" enum isn't a tone: "current" stays an error there.
    let pack = r#"{"name":"logs","version":"1.0.0","components":{"Log":{"about":"a log line","attrs":{"level":["debug","info","error"]},"content":"text"}}}"#;
    let v = verdict_of("<Log level=\"current\">Started</Log>\n", &[], &[pack]);
    assert!(v.errs.iter().any(|(c, d)| c == "enum-mismatch" && d == "Log.level=current"), "{:?}", v.errs);
}

#[test]
fn step_subtitle_and_default_status() {
    let mut p = Parser::new(Catalog::build(&[], &[]).unwrap());
    p.push("<Steps>\n<Step title=\"Pack\" subtitle=\"Monday\">Boxes.</Step>\n<Step title=\"Ship\" subtitle=\"\">Van.</Step>\n</Steps>\n");
    p.finish(false);
    let html = morphscreen_core::html::render(&p);
    assert!(html.contains("<strong>Pack</strong><small>Monday</small>"), "{html}");
    assert!(html.contains("<li class=\"ms-todo\"><strong>Ship</strong><p>"), "an empty subtitle draws nothing: {html}");
    assert!(morphscreen_core::prompt::system_prompt(&Catalog::build(&[], &[]).unwrap()).contains("status=todo|done|current"));
}

#[test]
fn a_label_attribute_counts_only_where_the_component_has_one() {
    // Share has no label attribute: its text is required.
    let v = verdict_of("<Share label=\"Send\" />\n", &["device"], &[]);
    assert!(v.errs.iter().any(|(c, d)| c == "required-field" && d == "Share label"), "{:?}", v.errs);
    assert!(v.errs.iter().any(|(c, d)| c == "signature-mismatch" && d == "Share.label"), "{:?}", v.errs);
    // Button has one: a non-blank label stands in, a blank or bare one doesn't, inline or as a block.
    for (text, ok) in [
        ("<Button label=\"Go\"></Button>\n", true),
        ("Click <Button label=\"Go\"></Button>\n", true),
        ("<Button label=\"  \"></Button>\n", false),
        ("Click <Button label=\"  \"></Button>\n", false),
        ("<Button label></Button>\n", false),
        ("Click <Button label></Button>\n", false),
    ] {
        let v = verdict_of(text, &[], &[]);
        assert_eq!(v.errs.iter().all(|(c, _)| c != "required-field"), ok, "{text:?}: {:?}", v.errs);
    }
}

#[test]
fn code_is_kept_as_written_fenced_or_not() {
    let plain = parse("<Code file=\"app.tsx\">\nconst a = <Card title=\"x\" />;\nfn f() -> Promise<void> {}\n</Code>\n", usize::MAX, &["docs"]);
    let fenced = parse("<Code file=\"app.tsx\">\n```tsx\nconst a = <Card title=\"x\" />;\nfn f() -> Promise<void> {}\n```\n</Code>\n", usize::MAX, &["docs"]);
    assert!(plain.1.complete, "{:?}", plain.1.errs);
    assert!(plain.0.contains(r#""data":{"lines":["const a = <Card title=\"x\" />;","fn f() -> Promise<void> {}"]}"#), "{}", plain.0);
    assert_eq!(plain.0, fenced.0);
    // Streamed a character at a time it's the same.
    assert_eq!(parse("<Code file=\"app.tsx\">\nconst a = <Card title=\"x\" />;\nfn f() -> Promise<void> {}\n</Code>\n", 1, &["docs"]).0, plain.0);
}

#[test]
fn only_spaces_and_tabs_count_as_code_indentation() {
    // A narrow no-break space (3 bytes) at a line's start beside lines indented two spaces
    // used to be cut through the middle (the 24-hour fuzz, 2026-10-20).
    let (tree, v) = parse("<Code file=\"a\">\n\u{202f}min\n  a\n</Code>\n", usize::MAX, &["docs"]);
    assert!(v.complete, "{:?}", v.errs);
    assert!(tree.contains("min\",\"  a\"]"), "{}", tree);
    // A blank line of other spaces inside indented code is kept, not cut.
    let (tree, _) = parse("<Code file=\"a\">\n  a\n\u{202f}\n    b\n</Code>\n", usize::MAX, &["docs"]);
    assert!(tree.contains("\"lines\":[\"a\",") && tree.contains("\"  b\"]"), "{}", tree);
    // The answer the fuzzer broke, in the chunks it arrived in.
    let text = "<Card title=\"x\">\n  <Stat label=\"Avg\" value=\"12<Code file=\"a\">\u{202f}min\" />\n  <Button href=\"#\">New t";
    let mut p = Parser::new(Catalog::build(&["docs"], &[]).unwrap());
    let chars: Vec<char> = text.chars().collect();
    let mut at = 0;
    for n in [33, 2, 36, 22].iter().cycle() {
        if at >= chars.len() {
            break;
        }
        let end = (at + n).min(chars.len());
        p.push(&chars[at..end].iter().collect::<String>());
        at = end;
    }
    p.finish(false);
}

#[test]
fn a_quote_escaped_json_style_belongs_to_the_value() {
    let (tree, v) = parse("<Radio label=\"Size\" options=\"Small (10\\\") | Large (14\\\")\" />\n", usize::MAX, &[]);
    assert!(v.complete, "{:?}", v.errs);
    assert!(tree.contains(r#""options":"Small (10\") | Large (14\")""#), "{tree}");
}

#[test]
fn html_escapes_in_a_value_read_as_html_reads_them() {
    // What a repair round wrote for a model's unescaped quotes (Docent, 2026-10-29).
    let (tree, v) = parse("<Poll label=\"In &quot;The Geographer&quot;, what&#39;s he holding? Q&amp;A &lt;1&gt; &amp;quot;\" options=\"A | B\" />\n", usize::MAX, &["interactive"]);
    assert!(v.complete, "{:?}", v.errs);
    assert!(tree.contains(r#""label":"In \"The Geographer\", what's he holding? Q&A <1> &quot;""#), "{tree}");
}

#[test]
fn a_link_or_photo_still_arriving_never_shows_as_markdown() {
    let text = "We start at ![Belem Tower](https://media.example/v1/media/images/abc \"[Dale Cruse](https://flickr.com/x), CC BY 2.0\") and take [the tram](https://example.com/tram) back, then see [1] and a[0] too.\n\nNext line.\n";
    let mut p = Parser::new(Catalog::build(&[], &[]).unwrap());
    let mut seen_tram = false;
    for ch in text.chars() {
        p.push(&ch.to_string());
        let t = p.tree_json();
        assert!(!t.contains("![") && !t.contains("](") && !t.contains("[Dale") && !t.contains("[the"), "{t}");
        seen_tram |= t.contains("the tram");
    }
    assert!(seen_tram, "the link should show once it has closed, before the line ends");
    p.finish(false);
    assert_eq!(p.tree_json(), parse(text, usize::MAX, &[]).0);
    // Brackets that can't be a link don't hold the rest of the line back.
    let mut q = Parser::new(Catalog::build(&[], &[]).unwrap());
    q.push("See [1] and a[0] and more words here");
    assert!(q.tree_json().contains("more words"), "{}", q.tree_json());
}
