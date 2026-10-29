// Images in answers (roadmap Q6): a photo's credit rides in its Markdown
// title, `find` asks the API for a photo, and a Gallery is one item a line.

use morphscreen_core::catalog::Catalog;
use morphscreen_core::html::render;
use morphscreen_core::inline::{image_at, parse, plain, Span};
use morphscreen_core::parse::Parser;

#[test]
fn a_title_is_the_credit_with_its_links() {
    let md = r#"![Belém Tower](https://x.example/tram.jpg "[Jane \"JD\" Doe](https://commons.wikimedia.org/wiki/File:Torre_(Lisboa).jpg), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), via Wikimedia Commons") then text"#;
    let (src, alt, credit, end) = image_at(md, 0).unwrap();
    assert_eq!((src.as_str(), alt.as_str(), &md[end..]), ("https://x.example/tram.jpg", "Belém Tower", " then text"));
    let mut words = String::new();
    plain(&credit, &mut words);
    assert_eq!(words, "Jane \"JD\" Doe, CC BY-SA 4.0, via Wikimedia Commons");
    // The ")" inside the page's address is part of it.
    assert!(matches!(&credit[0], Span::Link(h, _) if h == "https://commons.wikimedia.org/wiki/File:Torre_(Lisboa).jpg"));
}

#[test]
fn links_keep_balanced_parentheses() {
    let s = parse("See [Mercury](https://en.wikipedia.org/wiki/Mercury_(planet)), the smallest.");
    assert!(matches!(&s[1], Span::Link(h, _) if h == "https://en.wikipedia.org/wiki/Mercury_(planet)"));
    assert!(matches!(&s[2], Span::Text(t) if t == ", the smallest."));
}

#[test]
fn a_credit_shows_under_its_photo_and_find_loads_nothing() {
    let h = html_allowing("![Tram 28](https://x.example/tram.jpg \"Ann, CC BY 2.0, via Flickr\")\n\n![Pastel de nata](find)\n", &[]);
    assert!(h.contains("<span class=\"ms-pic\"><img src=\"https://x.example/tram.jpg\" alt=\"Tram 28\" loading=\"lazy\""), "one file, as the app's host has it: {h}");
    assert!(h.contains("<small class=\"ms-credit\">Ann, CC BY <span class=\"ms-nb\">2.0,</span> via Flickr</small>"), "{h}");
    assert!(h.contains("referrerpolicy=\"no-referrer\""));
    assert!(h.contains("<span class=\"ms-img-missing\" role=\"img\" aria-label=\"Pastel de nata\">Pastel de nata</span>"), "{h}");
    assert!(!h.contains("src=\"find\""));
}

#[test]
fn a_gallery_is_one_item_a_line_with_its_caption() {
    let h = html_allowing("<Gallery>\n![Sword](https://a.example/s.png) **Sword** – 1,240 units\n![Shield](find)\nTotals are for May.\n</Gallery>\n", &[]);
    assert!(h.contains("<div class=\"ms-gallery\"><figure><img src=\"https://a.example/s.png\" alt=\"Sword\""), "{h}");
    assert!(h.contains("<figcaption><span><strong>Sword</strong>1,240 units</span></figcaption></figure>"), "{h}");
    assert!(h.contains("<figure><span class=\"ms-img-missing\""), "{h}");
    // Words on a line without an image follow the grid.
    assert!(h.contains("</div><p>Totals are for May.</p>"), "{h}");
}

/// The page with pictures allowed from https://x.example and a.example.
fn html_allowing(text: &str, packs: &[&str]) -> String {
    let mut p = Parser::new(Catalog::build(packs, &[]).unwrap());
    p.allow_images(&["https://x.example", "a.example"]);
    p.push(text);
    p.finish(false);
    render(&p)
}

#[test]
fn pictures_from_other_hosts_show_what_they_stood_for() {
    // Nothing set: only data: images load, as in an SDK given no hosts.
    let text = "![Tram 28](https://x.example/tram.jpg \"Ann, CC BY 2.0, via Flickr\")\n\n\
                <Gallery>\n![Sword](https://a.example/s.png \"Bo, CC0\") **Sword**\n</Gallery>\n\n\
                <Avatar name=\"Sarah Chen\" src=\"https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah\" />\n\n\
                <Product name=\"Desk lamp\" image=\"https://shop.example/lamp.jpg\" price=\"$40\" />\n\n\
                <Video src=\"https://cdn.example/v.mp4\" poster=\"https://cdn.example/p.jpg\" />\n\n\
                ![Dot](data:image/png;base64,AAAA)\n";
    let h = html_with(text, &["commerce", "media"]);
    assert!(!h.contains("<img src=\"http"), "{h}");
    assert!(h.contains("<span class=\"ms-img-missing\" role=\"img\" aria-label=\"Tram 28\">Tram 28</span>"), "{h}");
    assert!(!h.contains("Ann, CC BY"), "a credit goes with its photo: {h}");
    assert!(h.contains("<figure><span class=\"ms-img-missing\" role=\"img\" aria-label=\"Sword\">Sword</span><figcaption><span><strong>Sword</strong></span></figcaption></figure>"), "{h}");
    assert!(h.contains("<div class=\"ms-avatar\"><span>SC</span>"), "{h}");
    assert!(h.contains("<span class=\"ms-img-missing ms-icon-only\" role=\"img\" aria-label=\"Desk lamp\"><svg class=\"ms-icon\""), "{h}");
    assert!(h.contains("<video controls preload=\"none\" src=\"https://cdn.example/v.mp4\">"), "the player stays, its poster goes: {h}");
    assert!(h.contains("<img src=\"data:image/png;base64,AAAA\""), "{h}");
    // Allowed, the same answer loads them.
    let h = html_allowing(text, &["commerce", "media"]);
    assert!(h.contains("<img src=\"https://x.example/tram.jpg\""), "{h}");
    assert!(h.contains("<img src=\"https://a.example/s.png\""), "{h}");
    assert!(h.contains("<div class=\"ms-avatar\"><span>SC</span>"), "{h}");
}

fn html_with(text: &str, packs: &[&str]) -> String {
    let mut p = Parser::new(Catalog::build(packs, &[]).unwrap());
    p.push(text);
    p.finish(false);
    render(&p)
}

#[test]
fn icons_resolve_and_draw_from_the_core() {
    let text = "<Stat label=\"Users\" value=\"12\" icon=\"Users\" />\n\n<Button icon=\"location\" ask=\"Map it\">Open the map</Button>\n\n<Stat label=\"Odd\" value=\"1\" icon=\"unicorn-sparkles\" />\n\n<Card title=\"Getting there\" icon=\"plane\">\nFly in.\n</Card>\n";
    let mut p = Parser::new(Catalog::build(&[], &[]).unwrap());
    p.push(text);
    p.finish(false);
    let ops = p.take_ops();
    // The canonical name in the attributes, the path beside them.
    assert!(ops.contains("\"icon\":\"users\"},\"icon\":\"M"), "{ops}");
    assert!(ops.contains("\"attrs\":{\"icon\":\"map-pin\",\"ask\":\"Map it\"},\"icon\":\"M"), "{ops}");
    let h = render(&p);
    assert!(h.contains("<span class=\"ms-label\"><svg class=\"ms-icon\" viewBox=\"0 0 256 256\" aria-hidden=\"true\"><path d=\"M"), "{h}");
    assert!(h.contains("class=\"ms-btn ms-primary\" href=\"?ask=Map%20it\"><svg class=\"ms-icon\""), "{h}");
    // A name the set doesn't have, or an icon on a Card (which takes none):
    // no icon, a note, never an error.
    assert!(h.contains("<span class=\"ms-label\">Odd</span>"), "{h}");
    assert!(h.contains("<h2>Getting there</h2>"), "{h}");
    let v = p.verdict(false, 0, false);
    assert!(v.errs.is_empty(), "{:?}", v.errs);
}

#[test]
fn a_map_is_web_mercator_with_its_tile_frame() {
    let h = html_with("<Map title=\"Belém\">\n| Place | Lat | Lng |\n|---|---|---|\n| Tower | 38.6916 | -9.2160 |\n| MAAT | 38.6957 | -9.1942 |\n</Map>\n", &["device"]);
    // Zoom 15 fits both; the frame's top left in world pixels at that zoom.
    assert!(h.contains("data-z=\"15\" data-ox=\""), "{h}");
    let num = |k: &str| -> f64 { h.split(&format!("{k}=\"")).nth(1).unwrap().split('"').next().unwrap().parse().unwrap() };
    let (ox, oy) = (num("data-ox"), num("data-oy"));
    // The tower's world pixel at zoom 15, less the frame's corner, is its pin.
    let s = 256.0 * 2f64.powi(15);
    let lat = 38.6916f64.to_radians();
    let (wx, wy) = ((-9.2160 + 180.0) / 360.0 * s, (1.0 - (lat.tan() + 1.0 / lat.cos()).ln() / std::f64::consts::PI) / 2.0 * s);
    let cx = num("cx");
    let cy = num("cy");
    assert!((cx - (wx - ox)).abs() < 0.2 && (cy - (wy - oy)).abs() < 0.2, "pin at {cx},{cy}, expected {},{}", wx - ox, wy - oy);
}

#[test]
fn interactive_components_work_without_script() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../../test/fixtures/interactive.md")).unwrap();
    let h = html_with(&text, &["interactive"]);
    // A quiz: radio buttons per question, the right one marked for the SDK, the answer behind a disclosure.
    assert!(h.contains("<li class=\"ms-question\" data-answer=\"1\"><fieldset><legend>What absorbs light in a leaf?</legend>"), "{h}");
    assert!(h.contains("<details class=\"ms-explain\"><summary>Answer</summary><p><strong>Chlorophyll</strong>"), "{h}");
    // Cards that open, a checklist's progress, results at the sliders' starting values.
    assert!(h.contains("<details class=\"ms-card\"><summary>Chlorophyll</summary><p>The green pigment that absorbs light</p></details>"), "{h}");
    assert!(h.contains("<progress max=\"3\" value=\"1\"></progress><span>1 of 3 done</span>"), "{h}");
    assert!(h.contains("<output>$54.00</output>") && h.contains("<output>$6.00</output>"), "{h}");
    assert!(h.contains("data-vars=\"[&quot;price&quot;,&quot;qty&quot;,&quot;discount&quot;]\""), "{h}");
    // A slider shows where it is.
    assert!(h.contains("<small>5</small><output>20</output><small>100</small>"), "{h}");
}

#[test]
fn a_broken_formula_is_an_error_and_a_missing_key_a_note() {
    let mut p = Parser::new(Catalog::build(&["interactive"], &[]).unwrap());
    p.push("<WhatIf>\n<Slider label=\"x\" min=\"0\" max=\"9\" />\n<Result label=\"Y\" value=\"x *\" />\n</WhatIf>\n\n<Quiz>\n<Question text=\"Q\" answer=\"Z\">\n- one\n- two\n</Question>\n</Quiz>\n");
    p.finish(false);
    let v = p.verdict(false, 0, false);
    assert_eq!(v.errs.iter().map(|e| e.0.as_str()).collect::<Vec<_>>(), ["signature-mismatch"], "{:?}", v.errs);
    assert!(v.notes.iter().any(|n| n.contains("names none of its choices")), "{:?}", v.notes);
}

#[test]
fn a_what_ifs_sliders_and_results_work_wherever_they_sit_inside_it() {
    // From a real answer: Results laid out in a Columns, and sliders too.
    let mut p = Parser::new(Catalog::build(&["interactive"], &[]).unwrap());
    p.push("<WhatIf title=\"What if mortgage rates change?\">\n<Columns>\n<Slider label=\"Mortgage rate (%)\" min=\"3\" max=\"9\" step=\"0.25\" value=\"6.5\" name=\"rate\" />\n<Slider label=\"Price\" min=\"100000\" max=\"900000\" step=\"1000\" value=\"320000\" name=\"price\" />\n</Columns>\n<Columns>\n<Result label=\"Monthly mortgage payment\" value=\"round(price*(rate/100/12)/(1-(1+rate/100/12)^-360))\" unit=\"$\" decimals=\"0\" />\n<Result label=\"A year\" value=\"12*round(price*(rate/100/12)/(1-(1+rate/100/12)^-360))\" unit=\"$\" decimals=\"0\" />\n</Columns>\n</WhatIf>\n");
    p.finish(false);
    assert!(p.verdict(false, 0, false).errs.is_empty(), "{:?}", p.verdict(false, 0, false).errs);
    let h = render(&p);
    assert!(h.contains("<output>$2,023</output>") && h.contains("<output>$24,276</output>"), "{h}");
    assert!(h.contains("data-vars=\"[&quot;rate&quot;,&quot;price&quot;]\""), "{h}");
    // Outside any What-if, a Result still has nothing to work from.
    let mut p = Parser::new(Catalog::build(&["interactive"], &[]).unwrap());
    p.push("<Columns>\n<Result label=\"Stray\" value=\"1\" />\n</Columns>\n");
    p.finish(false);
    assert_eq!(p.verdict(false, 0, false).errs.iter().map(|e| e.0.as_str()).collect::<Vec<_>>(), ["placement"]);
}

#[test]
fn a_slider_value_off_its_step_is_put_on_it_once_for_everyone() {
    // From a real answer: 1.2 isn't on 0.5 + k * 0.25, so the browser made it
    // 1.25 on the next move while the label and the tax still read 1.2.
    let mut p = Parser::new(Catalog::build(&["interactive"], &[]).unwrap());
    p.push("<WhatIf>\n<Slider label=\"Property tax (annual %)\" min=\"0.5\" max=\"3\" step=\"0.25\" value=\"1.2\" name=\"tax\" />\n<Slider label=\"Share\" min=\"0\" max=\"1\" value=\"0.35\" name=\"share\" />\n<Result label=\"Tax a month\" value=\"400000 * tax / 100 / 12\" unit=\"$\" decimals=\"0\" />\n<Result label=\"Share\" value=\"share * 100\" unit=\"%\" />\n</WhatIf>\n");
    p.finish(false);
    let h = render(&p);
    assert!(h.contains("step=\"0.25\" value=\"1.25\"") && h.contains("<output>1.25</output>"), "{h}");
    assert!(h.contains("<output>$417</output>"), "the Result reads the value the slider shows: {h}");
    // No step and a value with decimals: a step that keeps it (a browser's 1 would make it 0).
    assert!(h.contains("step=\"0.01\" value=\"0.35\"") && h.contains("<output>35%</output>"), "{h}");
    let v = p.verdict(false, 0, false);
    assert!(v.errs.is_empty() && v.notes.iter().any(|n| n == "Slider.value 1.2 put on its step: 1.25"), "{:?} {:?}", v.errs, v.notes);
}

#[test]
fn a_slider_with_a_unit_shows_its_numbers_as_a_result_does() {
    let h = html_with("<Slider label=\"Price\" min=\"100000\" max=\"900000\" step=\"1000\" value=\"400000\" unit=\"$\" />\n\n<Slider label=\"Rate\" min=\"3\" max=\"9\" step=\"0.25\" value=\"6.5\" unit=\"%\" />\n\n<Slider label=\"Year\" min=\"2000\" max=\"2030\" value=\"2026\" />\n", &[]);
    assert!(h.contains("data-unit=\"$\" data-places=\"0\"") && h.contains("<small>$100,000</small><output>$400,000</output><small>$900,000</small>"), "{h}");
    assert!(h.contains("data-unit=\"%\" data-places=\"2\"") && h.contains("<small>3%</small><output>6.5%</output><small>9%</small>"), "no more decimals than it needs: {h}");
    assert!(h.contains("<small>2000</small><output>2026</output><small>2030</small>"), "without a unit, as written: {h}");
}

#[test]
fn a_product_takes_buttons_for_what_the_reader_can_do_and_nothing_else() {
    // The card a shopping answer wants: its Buttons under it, how many rated it.
    let mut p = Parser::new(Catalog::build(&["commerce"], &[]).unwrap());
    p.push("<Product name=\"Brooks Ghost 16\" price=\"$119\" rating=\"4.6\" count=\"2140\">\nPlush and smooth for easy miles.\n<Button ask=\"Add the Brooks Ghost 16 to my cart\">Add to cart</Button>\n<Button variant=\"secondary\" ask=\"Tell me more about the Brooks Ghost 16\">Tell me more</Button>\n</Product>\n");
    p.finish(false);
    let v = p.verdict(false, 0, false);
    assert!(v.complete && v.errs.is_empty(), "{:?}", v.errs);
    let h = render(&p);
    assert!(h.contains("<small>(2,140)</small></span><p>Plush and smooth for easy miles.</p><div class=\"ms-actions\"><a class=\"ms-btn ms-primary\" href=\"?ask=Add%20the%20Brooks%20Ghost%2016%20to%20my%20cart\">Add to cart</a>"), "{h}");
    // Anything but a Button inside is out of place.
    let mut p = Parser::new(Catalog::build(&["commerce"], &[]).unwrap());
    p.push("<Product name=\"Ghost\" price=\"$119\">\nSoft.\n<Stat label=\"Weight\" value=\"280 g\" />\n</Product>\n");
    p.finish(false);
    assert_eq!(p.verdict(false, 0, false).errs, [("placement".to_string(), "Stat inside Product".to_string())]);
}

#[test]
fn all_names_every_pack() {
    let all = Catalog::build(&["all"], &[]).unwrap();
    let named: Vec<&str> = morphscreen_core::catalog::NAMES.iter().copied().filter(|n| *n != "core").collect();
    assert_eq!(all.hash, Catalog::build(&named, &[]).unwrap().hash);
    assert!(all.component("Quiz").is_some() && all.component("Map").is_some() && all.component("Carousel").is_some());
    assert_eq!(Catalog::build(&["all", "commerce", "core"], &[]).unwrap().hash, all.hash, "named twice, read once");
}

#[test]
fn an_apps_own_component_replaces_a_pack_one_of_the_same_name_unless_the_pack_was_named() {
    let own = r#"{"name":"shop","version":"1.0.0","components":{"Product":{"about":"a product from our shelves","attrs":{"sku":{"type":"string","required":true}},"content":"none"}}}"#;
    // Every pack by default: the app's own Product stands in for commerce's.
    let c = Catalog::build(&["all"], &[own]).unwrap();
    assert_eq!(c.component("Product").unwrap().about, "a product from our shelves");
    assert!(c.component("Cart").is_some(), "the rest of commerce stays");
    // Asked for by name, the clash is an error, as ever.
    assert!(Catalog::build(&["commerce"], &[own]).unwrap_err().contains("Product is already defined"));
}
