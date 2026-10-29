// How answers lay out: the Columns plan and the line-breaking rules the HTML
// renderer applies (roadmap Q3). bench/quality checks the result in a browser.

use morphscreen_core::catalog::Catalog;
use morphscreen_core::html::{keep_ids, render};
use morphscreen_core::parse::Parser;

fn html(text: &str, packs: &[&str]) -> String {
    let mut p = Parser::new(Catalog::build(packs, &[]).unwrap());
    p.push(text);
    p.finish(false);
    render(&p)
}

fn stats(k: usize) -> String {
    let mut s = String::from("<Columns>\n");
    for i in 0..k {
        s += &format!("<Stat label=\"S{i}\" value=\"{i}\" />\n");
    }
    s + "</Columns>\n"
}

fn cards(k: usize, words: usize) -> String {
    let mut s = String::from("<Columns>\n");
    for i in 0..k {
        s += &format!("<Card title=\"C{i}\">\n{}\n</Card>\n", "word ".repeat(words).trim_end());
    }
    s + "</Columns>\n"
}

#[test]
fn small_tiles_share_a_row_and_rows_balance() {
    assert!(html(&stats(3), &[]).contains("class=\"ms-cols ms-n3 ms-m140"));
    assert!(html(&stats(4), &[]).contains("class=\"ms-cols ms-n4 ms-m140"));
    // Five fit one row of five; six become two rows of three, never four and two.
    assert!(html(&stats(5), &[]).contains("class=\"ms-cols ms-n5 ms-m140"));
    assert!(html(&stats(6), &[]).contains("class=\"ms-cols ms-n3 ms-m140"));
}

#[test]
fn cards_with_more_text_get_fewer_to_a_row() {
    assert!(html(&cards(3, 4), &[]).contains("class=\"ms-cols ms-n3 ms-m200"));
    // Long text: two to a row at most, and wide enough to read.
    assert!(html(&cards(4, 30), &[]).contains("class=\"ms-cols ms-n2 ms-m260"));
    assert!(html(&cards(5, 30), &[]).contains("class=\"ms-cols ms-n2 ms-m260"));
}

#[test]
fn ids_dates_and_codes_stay_on_one_line() {
    assert_eq!(keep_ids("Order WO-2025-0892 shipped"), "Order <span class=\"nb\">WO-2025-0892</span> shipped");
    assert_eq!(keep_ids("on 2025-07-24, at 14:30."), "on <span class=\"nb\">2025-07-24,</span> at <span class=\"nb\">14:30.</span>");
    // Words, prices and links are left alone.
    assert_eq!(keep_ids("a well-known fix for $1,200 at https://x.io/a-1"), "a well-known fix for $1,200 at https://x.io/a-1");
    assert_eq!(keep_ids("Tom & Jerry"), "Tom &amp; Jerry");
}

#[test]
fn a_dash_between_words_never_starts_a_line() {
    assert_eq!(keep_ids("lobbying—Microsoft said"), "<span class=\"nb\">lobbying—</span>Microsoft said");
    assert_eq!(keep_ids("a—b—c"), "<span class=\"nb\">a—</span><span class=\"nb\">b—</span>c");
    // A number range is one unit.
    assert_eq!(keep_ids("51–100"), "<span class=\"nb\">51–100</span>");
}

#[test]
fn titles_keep_ids_whole_like_body_text() {
    let h = html("<Steps>\n<Step title=\"Separate 14-day cooling-off period\" />\n</Steps>\n", &[]);
    assert!(h.contains("<strong>Separate <span class=\"ms-nb\">14-day</span> <span class=\"ms-pair\">cooling-off period</span></strong>"), "{h}");
}

#[test]
fn long_table_cells_are_marked_to_wrap() {
    // Each cell is sized by its own text, so nothing changes width when the table closes.
    let long = "Gearbox vibration alarm on the main extruder";
    let h = html(&format!("| WO | Description | Hours |\n|---|---|---|\n| WO-1 | {long} | 12 |\n| WO-2 | Belt replacement | 3 |\n| WO-3 | Belt | 1 |\n"), &[]);
    assert!(h.contains(&format!("<td class=\"ms-wide ms-long\">{long}</td>")), "{h}");
    assert!(h.contains("<td class=\"ms-wide\">Belt replacement</td>"), "{h}");
    assert!(h.contains("<td>Belt</td>"), "{h}");
    assert!(h.contains("<td class=\"ms-num\">12</td>"), "{h}");
}

#[test]
fn key_values_with_long_values_stack_on_a_phone() {
    let short = html("<KeyValue>\n| Key | Value |\n|---|---|\n| Name | Sarah |\n</KeyValue>\n", &["data"]);
    assert!(short.contains("class=\"ms-kv\""), "{short}");
    let long = html("<KeyValue>\n| Key | Value |\n|---|---|\n| Moderate | Acceptable; some pollutants may affect sensitive groups |\n</KeyValue>\n", &["data"]);
    assert!(long.contains("class=\"ms-kv ms-long\""), "{long}");
}

#[test]
fn long_urls_and_paths_break_at_their_slashes() {
    let h = keep_ids("see https://open.spotify.com/embed/playlist/37i9dQZF1DX3Ogo9pFvBkY now");
    assert!(h.contains("/<wbr><span class=\"nb\">37i9dQZF1DX3Ogo9pFvBkY</span>"), "{h}");
    assert!(h.contains("<span class=\"nb\">open.spotify.com/</span><wbr>embed/"), "{h}");
    // A short path is one unit, as before.
    assert_eq!(keep_ids("/v1/orders"), "<span class=\"nb\">/v1/orders</span>");
}

#[test]
fn times_in_packs_stay_whole() {
    let h = html("<Agenda>\n| Time | What |\n|---|---|\n| 09:00–09:30 | Standup |\n</Agenda>\n", &["scheduling"]);
    assert!(h.contains("<time><span class=\"ms-nb\">09:00–09:30</span></time>"), "{h}");
}

#[test]
fn bar_labels_fit_their_column() {
    // Long category names are cut to what the label column holds, at any width.
    let chart = "<Chart type=\"horizontal\" title=\"Fill\">\n| Course | Fill |\n|---|---|\n| ENG 301 Thermodynamics and Heat | 92 |\n| CS 101 | 80 |\n</Chart>\n";
    let h = html(chart, &[]);
    for label in h.split("text-anchor=\"end\">").skip(1).map(|t| t.split('<').next().unwrap()) {
        assert!(label.chars().count() <= 24, "{label}");
    }
    assert!(h.contains("CS 101<"), "{h}");
}

#[test]
fn a_url_part_too_long_for_a_phone_is_left_breakable() {
    let h = keep_ids("https://images.example.com/photo-1598103442097-8b74394b95c6?w=400&h=300&fit=crop&q=80");
    assert!(!h.contains("<span class=\"nb\">photo-"), "{h}");
}

#[test]
fn pack_cells_parse_like_content() {
    assert_eq!(morphscreen_core::tree::inline_json("**Keynote** at `9:00`"), r#"[{"t":"strong","c":[{"t":"text","v":"Keynote"}]},{"t":"text","v":" at "},{"t":"code","v":"9:00"}]"#);
}

#[test]
fn email_addresses_stay_whole() {
    assert_eq!(keep_ids("write to maria.santos@rentals.com today"), "write to <span class=\"nb\">maria.santos@rentals.com</span> today");
}

#[test]
fn a_charts_data_table_is_hidden_in_a_box() {
    // A table keeps its own width whatever it's given: hidden itself, it
    // widened the page on a phone. The box around it is what's hidden.
    let h = html("<Chart type=\"bar\" title=\"Latency\">\n| Endpoint | p99 |\n|---|---|\n| /api/v1/orders/search | 412 |\n</Chart>\n", &[]);
    assert!(h.contains("<div class=\"ms-sr\"><table class=\"ms-chart-data\"><caption>Latency</caption>"), "{h}");
    assert!(!h.contains("<table class=\"sr"), "{h}");
}

// Found by the 24-hour fuzz (2026-10-19): Columns nested deep enough left a
// chart a negative width, and the horizontal chart's label room panicked
// (clamp with min above max). A chart is drawn at a floor width instead.
#[test]
fn deeply_nested_columns_still_draw_a_chart() {
    let mut s = String::new();
    for i in 0..6 {
        s += &format!("<Columns>\n<Card title=\"Level {i}\">\nText.\n</Card>\n<Card title=\"Inner {i}\">\n");
    }
    s += "<Chart type=\"horizontal\" title=\"Fill\">\n| Course | Fill |\n|---|---|\n| CS 101 Intro to Programming | 98 |\n| BIO 150 Genetics | 89 |\n</Chart>\n";
    for _ in 0..6 {
        s += "</Card>\n</Columns>\n";
    }
    let page = html(&s, &[]);
    assert!(page.contains("<svg"), "the chart is drawn");
    assert!(!page.contains("width=\"-"), "no negative widths");
}

#[test]
fn a_rating_stays_in_its_sentence() {
    let h = html("The headphones are rated <Rating value=\"4.6\" count=\"1,203\" /> by buyers.\n", &["commerce"]);
    assert!(h.contains("<p>The headphones are rated <span class=\"ms-rating\">"), "{h}");
    assert!(h.contains("</span> by buyers.</p>"), "{h}");
    // On a line of its own it is still a block.
    assert!(!html("<Rating value=\"4.6\" />\n", &["commerce"]).contains("<p>"));
}

#[test]
fn plans_keep_their_notes_place_and_products_take_a_tag() {
    let h = html("<Plan name=\"Free\" price=\"$0\">\n- One\n</Plan>\n", &["commerce"]);
    assert!(h.contains("<p class=\"ms-note\"></p><ul>"), "{h}");
    let p = html("<Product name=\"Headphones\" price=\"$249\" badge=\"Sale\" />\n", &["commerce"]);
    assert!(p.contains("<span class=\"ms-tag\">Sale</span>"), "{p}");
}

#[test]
fn a_slider_fills_to_its_value() {
    assert!(html("<Slider label=\"Rate\" min=\"0\" max=\"200\" value=\"50\" />\n", &[]).contains("class=\"ms-fill25\""));
    assert!(html("<Slider label=\"Rate\" min=\"0\" max=\"10\" />\n", &[]).contains("class=\"ms-fill50\""));
}

/// Amounts are drawn without style attributes, which a strict style-src
/// turns away (in server-rendered HTML and in the SDK's, which is the core's):
/// funnel bars as SVG, stars, heatmap shades and slider fills as classes.
#[test]
fn no_answer_needs_a_style_attribute() {
    let h = html(
        "<Rating value=\"3.7\" count=\"12\" />\n\n<Funnel title=\"Sign-ups\">\n| Step | People |\n|---|---|\n| Visited | 1000 |\n| Signed up | 552 |\n</Funnel>\n\n<Heatmap title=\"Calls\">\n| Day | AM | PM |\n|---|---|---|\n| Mon | 1 | 9 |\n</Heatmap>\n\n<Slider label=\"Rate\" min=\"0\" max=\"10\" value=\"3\" />\n",
        &["commerce", "data"],
    );
    assert!(!h.contains("style="), "{h}");
    assert!(h.contains("aria-label=\"3.7 out of 5\"><span class=\"ms-lit\">\u{2605}</span><span class=\"ms-lit\">\u{2605}</span><span class=\"ms-lit\">\u{2605}</span><span class=\"ms-half\">\u{2605}</span><span>\u{2605}</span></span>"), "3.7 shows as three and a half: {h}");
    assert!(h.contains("<rect width=\"55.2\" height=\"1\"/>"), "{h}");
    assert!(h.contains("<td class=\"ms-heat0\">1</td><td class=\"ms-heat10\">9</td>"), "{h}");
    assert!(h.contains("class=\"ms-fill30\""), "{h}");
}

#[test]
fn lettered_choices_lose_their_letters_and_keep_their_answer() {
    let h = html("<Quiz>\n<Question text=\"What absorbs light?\" answer=\"B. Chlorophyll\">\n- A. Stomata\n- B. Chlorophyll\n- C. Xylem\n</Question>\n</Quiz>\n", &["interactive"]);
    assert!(h.contains("data-answer=\"1\""), "{h}");
    assert!(h.contains("<span>Stomata</span>") && h.contains("<span>Xylem</span>"), "{h}");
    // Letters out of order, or on some choices only, are the model's words.
    let k = html("<Quiz>\n<Question text=\"Q\" answer=\"A plan\">\n- A plan\n- B. Two\n</Question>\n</Quiz>\n", &["interactive"]);
    assert!(k.contains("<span>A plan</span>") && k.contains("<span>B. Two</span>"), "{k}");
}

#[test]
fn a_scatter_of_numbers_spaces_them_by_value() {
    let h = html("<Chart type=\"scatter\" title=\"Price against rating\">\n| Price | Rating |\n|---|---|\n| 49 | 4.1 |\n| 79 | 3.6 |\n| 129 | 4.8 |\n| 249 | 4.6 |\n</Chart>\n", &[]);
    assert!(h.contains("data-xlo=\"0\" data-xhi=\"250\""), "{h}");
    let cx = |i: usize| -> f64 {
        let at = h.find(&format!("data-i=\"{i}\" cx=\"")).unwrap() + format!("data-i=\"{i}\" cx=\"").len();
        h[at..at + h[at..].find('"').unwrap()].parse().unwrap()
    };
    // 49 to 79 is 30 apart, 129 to 249 is 120: four times the room, not the same.
    let (a, b) = (cx(1) - cx(0), cx(3) - cx(2));
    assert!((b / a - 4.0).abs() < 0.05, "{a} {b}");
}

#[test]
fn a_streaming_chart_is_drawn_from_its_complete_rows() {
    use morphscreen_core::html::render_node;
    let mut p = Parser::new(Catalog::build(&[], &[]).unwrap());
    p.push("<Chart type=\"line\" title=\"Points\">\n| Round | A | B |\n|---|---|---|\n| R1 | 25 | 18 |\n| R2 | 43 | 3");
    let id = p.nodes.iter().find(|n| n.ty == "Chart").unwrap().id.clone();
    let partial = render_node(&p, &id).unwrap();
    // One complete row so far; the half-written second one isn't drawn.
    assert!(partial.contains("data-n=\"1\""), "{partial}");
    p.push("6 |\n| R3 | 68 | 51 |\n");
    assert!(render_node(&p, &id).unwrap().contains("data-n=\"3\""));
    p.push("</Chart>\n");
    p.finish(false);
    assert!(render_node(&p, &id).unwrap().contains("data-n=\"3\""));
    // Before any row, nothing.
    let mut q = Parser::new(Catalog::build(&[], &[]).unwrap());
    q.push("<Chart type=\"bar\">\n| Month | Signups |\n|---|---|\n");
    let qid = q.nodes.iter().find(|n| n.ty == "Chart").unwrap().id.clone();
    assert_eq!(render_node(&q, &qid).unwrap(), "");
}

#[test]
fn a_streaming_component_is_drawn_from_its_complete_lines() {
    use morphscreen_core::html::render_node;
    let mut p = Parser::new(Catalog::build(&["data"], &[]).unwrap());
    p.push("<Timeline title=\"Milestones\">\n- 2019: Founded in a Lisbon flat\n- 2021: First 1,000 customers\n- 2");
    let id = p.nodes.iter().find(|n| n.ty == "Timeline").unwrap().id.clone();
    let partial = render_node(&p, &id).unwrap();
    // Two rows are complete; the third has only begun, so it isn't drawn
    // (its "2" would sit where the event goes).
    assert_eq!(partial.matches("<li>").count(), 2, "{partial}");
    assert!(!partial.contains("<span>2</span>"), "{partial}");
    p.push("023: Opened in Porto\n");
    assert_eq!(render_node(&p, &id).unwrap().matches("<li>").count(), 3);
    p.push("</Timeline>\n");
    p.finish(false);
    assert_eq!(render_node(&p, &id).unwrap().matches("<li>").count(), 3);
    // A map shows its places as their rows complete, before it closes.
    let mut m = Parser::new(Catalog::build(&["device"], &[]).unwrap());
    m.push("<Map title=\"Where to eat\">\n| Place | Lat | Lng |\n|---|---|---|\n| Time Out Market | 38.7069 | -9.1459 |\n| Pastéis");
    let mid = m.nodes.iter().find(|n| n.ty == "Map").unwrap().id.clone();
    let partial = render_node(&m, &mid).unwrap();
    assert!(partial.contains("Time Out Market") && !partial.contains("Pastéis"), "{partial}");
}

#[test]
fn a_chart_drawn_without_a_series_fits_the_rest_and_keeps_its_legend() {
    use morphscreen_core::html::{render_node, render_node_without};
    let mut p = Parser::new(Catalog::build(&[], &[]).unwrap());
    p.push("<Chart type=\"bar\" title=\"Points\">\n| Round | A | B |\n|---|---|---|\n| R1 | 140 | 18 |\n| R2 | 120 | 36 |\n</Chart>\n");
    p.finish(false);
    let id = p.nodes.iter().find(|n| n.ty == "Chart").unwrap().id.clone();
    let all = render_node(&p, &id).unwrap();
    let without = render_node_without(&p, &id, &[0]).unwrap();
    // The axis fits what's left (B tops out at 36), A isn't drawn, B keeps its color.
    assert!(all.contains("data-hi=\"150\""), "{all}");
    assert!(without.contains("data-hi=\"40\""), "{without}");
    assert!(!without.contains("<rect class=\"ms-s1\"") && without.contains("<rect class=\"ms-s2\""), "{without}");
    // The legend still lists both, so A can come back.
    assert!(without.contains("<i class=\"ms-s1\"></i>A") && without.contains("<i class=\"ms-s2\"></i>B"), "{without}");
    // Its bars take the room the hidden ones had: alone in their slot, they move to its middle.
    let x = |h: &str| -> f64 { let at = h.find("class=\"ms-s2\" data-i=\"0\"").unwrap(); let k = h[at..].find("x=\"").unwrap() + at + 3; h[k..k + h[k..].find('"').unwrap()].parse().unwrap() };
    assert!(x(&without) < x(&all), "{} vs {}", x(&without), x(&all));
}

#[test]
fn a_stats_change_is_its_number_then_what_its_compared_with() {
    let h = html("<Stat label=\"Revenue\" value=\"$487,200\" change=\"+12% vs same day last week\" tone=\"success\" />\n", &[]);
    assert!(h.contains("<span class=\"ms-change ms-success ms-up\"><b>+12%</b>vs same day last week</span>"), "{h}");
    assert!(html("<Stat label=\"Churn\" value=\"2.8%\" change=\"+0.6 pts worse\" />\n", &[]).contains(" pts</b>worse"));
    assert!(html("<Stat label=\"Users\" value=\"3,904\" change=\"+3.1%\" />\n", &[]).contains("</b></span><span class=\"ms-note\">"));
}

/// Every class goes out with ms- in front (roadmap C5), so an app's own
/// `.card` or `.btn` never meets ours: every component of every pack, in the
/// fixtures that show them all.
#[test]
fn every_class_goes_out_with_ms() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../test/fixtures");
    let mut seen = 0;
    for f in ["packs-all.md", "interactive.md", "charts.md"] {
        let h = html(&std::fs::read_to_string(format!("{dir}/{f}")).unwrap(), &["all"]);
        for at in h.match_indices(" class=\"") {
            let rest = &h[at.0 + 8..];
            let value = &rest[..rest.find('"').unwrap()];
            for c in value.split(' ').filter(|c| !c.is_empty()) {
                assert!(c.starts_with("ms-"), "{f}: class {c:?} in {value:?}");
                seen += 1;
            }
        }
    }
    assert!(seen > 500, "{seen} classes seen");
    assert_eq!(morphscreen_core::html::prefix_classes("<p class=\"a  ms-b\">x class=\"y\"</p>"), "<p class=\"ms-a ms-b\">x class=\"ms-y\"</p>");
}
