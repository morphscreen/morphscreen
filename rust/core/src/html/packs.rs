//! HTML for the component packs (spec/packs: data, commerce, scheduling,
//! media, docs, inputs, and the device pack's second set). Like the rest of
//! the renderer it needs no JavaScript: the web SDK enhances some of these
//! (live countdowns, a signature pad, embeds loaded on request).

use super::{chart_num, esc, keep_ids, list, slug, title, tone, R};
use crate::inline::{self, Span};
use crate::jsnum::{encode_uri_component, fixed_num, num_str, number, round};
use crate::tree::{Data, Node};
use crate::validate::list_items;
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

/// Components this module draws.
pub const PACK: &[&str] = &[
    "KeyValue", "Timeline", "Gauge", "Heatmap", "Funnel", "Sparkline", "Tree", "Product", "Plan", "Cart", "Rating", "Compare", "Price", "Calendar", "Event",
    "TimeSlots", "Agenda", "Countdown", "Video", "Audio", "Embed", "Carousel", "Code", "Diff", "Math", "FileTree", "Citation", "RatingInput", "Combobox", "Time",
    "ToggleGroup", "Stepper", "Signature", "Contact", "AddToCalendar", "Share", "VoiceNote", "QR", "Quiz", "Question", "Flashcards", "Poll",
    "Checklist", "WhatIf", "Result",
];

/// A node id as part of an HTML name ("3.1" is q3-1).
fn field_id(id: &str) -> String {
    alloc::format!("q{}", id.replace('.', "-"))
}

/// A Result's number as it's shown: its decimals, grouped thousands, and its
/// unit (a currency sign in front, anything else after).
pub fn result_text(v: Option<f64>, unit: &str, decimals: Option<usize>) -> String {
    let Some(v) = v else { return String::from("\u{2014}") };
    let d = decimals.unwrap_or(if libm::floor(v) == v { 0 } else { 2 }).min(6);
    let s = crate::jsnum::to_fixed(v.abs(), d);
    let (int, frac) = s.split_once('.').map_or((s.as_str(), ""), |(a, b)| (a, b));
    let mut grouped = String::new();
    for (k, c) in int.chars().enumerate() {
        if k > 0 && (int.len() - k) % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(c);
    }
    let num = if frac.is_empty() { grouped } else { alloc::format!("{grouped}.{frac}") };
    let sign = if v < 0.0 { "\u{2212}" } else { "" };
    let unit = unit.trim();
    if unit.is_empty() {
        alloc::format!("{sign}{num}")
    } else if ["$", "\u{20ac}", "\u{a3}", "\u{20b9}", "\u{a5}"].contains(&unit) {
        alloc::format!("{sign}{unit}{num}")
    } else if unit == "%" {
        alloc::format!("{sign}{num}%")
    } else {
        alloc::format!("{sign}{num} {unit}")
    }
}

/// A Slider's number with its unit, the way a Result shows one, with no more
/// decimals than it needs of the `places` its numbers are written to.
pub fn slider_text(v: f64, unit: &str, places: usize) -> String {
    let d = (0..places).find(|&k| {
        let x = v * libm::pow(10.0, k as f64);
        libm::fabs(x - libm::round(x)) < 1e-9 * libm::fmax(libm::fabs(x), 1.0)
    });
    result_text(Some(v), unit, Some(d.unwrap_or(places)))
}

/// The heading level of a thing's name (a Product, a Plan, an Event): the
/// level under its surroundings', as a Card's title is (h2 at the top, h3 in
/// a Card), so the page's headings never skip one.
fn item_heading(depth: usize) -> usize {
    if depth > 1 {
        4
    } else {
        3
    }
}

const TONES: &[&str] = &["neutral", "info", "success", "warning", "danger"];
const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/// A section's title line (a figcaption belongs to a figure).
fn title_line(t: Option<&str>) -> String {
    match t {
        Some(t) if !t.trim().is_empty() => format!("<p class=\"caption\">{}</p>", keep_ids(&crate::text::dashes(t))),
        _ => String::new(),
    }
}

fn caption(t: Option<&str>) -> String {
    match t {
        // Captions follow the text rules: IDs whole, long URLs broken at their slashes.
        Some(t) if !t.trim().is_empty() => format!("<figcaption>{}</figcaption>", keep_ids(&crate::text::dashes(t))),
        _ => String::new(),
    }
}

/// "2026-10-20T18:00" as "20 Oct 2026, 18:00"; anything else as written.
pub fn when(s: &str) -> String {
    let t = s.trim();
    let b = t.as_bytes();
    let digits = |r: core::ops::Range<usize>| b.len() >= r.end && b[r].iter().all(u8::is_ascii_digit);
    if !(digits(0..4) && b.get(4) == Some(&b'-') && digits(5..7) && b.get(7) == Some(&b'-') && digits(8..10)) {
        return esc(t);
    }
    let m = t[5..7].parse::<usize>().unwrap_or(0);
    if m == 0 || m > 12 {
        return esc(t);
    }
    let mut o = format!("{} {} {}", t[8..10].trim_start_matches('0'), MONTHS[m - 1], &t[0..4]);
    if b.len() >= 16 && (b[10] == b'T' || b[10] == b' ') && digits(11..13) && b[13] == b':' && digits(14..16) {
        o.push_str(", ");
        o.push_str(&t[11..16]);
    }
    o
}

/// Days since 1970-01-01 for a civil date (Howard Hinnant's algorithm).
fn days(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn month_len(y: i64, m: i64) -> i64 {
    match m {
        2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

fn ymd(s: &str) -> Option<(i64, i64, i64)> {
    let t = s.trim();
    if t.len() < 10 || t.as_bytes()[4] != b'-' || t.as_bytes()[7] != b'-' {
        return None;
    }
    // get(): a byte offset can fall inside a character in what the model wrote.
    Some((t.get(0..4)?.parse().ok()?, t.get(5..7)?.parse().ok()?, t.get(8..10)?.parse().ok()?))
}

/// An embed's player URL, for the hosts we allow; None for anything else.
pub fn embed_url(src: &str) -> Option<(String, &'static str)> {
    let s = src.trim();
    let rest = s.strip_prefix("https://").or_else(|| s.strip_prefix("http://"))?;
    let rest = rest.strip_prefix("www.").or_else(|| rest.strip_prefix("m.")).unwrap_or(rest);
    let id = |p: &str| p.split(|c| c == '?' || c == '&' || c == '#' || c == '/').next().unwrap_or("").to_string();
    let safe = |x: &str| !x.is_empty() && x.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if let Some(p) = rest.strip_prefix("youtube.com/watch?v=").or_else(|| rest.strip_prefix("youtu.be/")).or_else(|| rest.strip_prefix("youtube.com/shorts/")) {
        let v = id(p);
        return safe(&v).then(|| (format!("https://www.youtube-nocookie.com/embed/{v}"), "YouTube"));
    }
    if let Some(p) = rest.strip_prefix("vimeo.com/") {
        let v = id(p);
        return (safe(&v) && v.chars().all(|c| c.is_ascii_digit())).then(|| (format!("https://player.vimeo.com/video/{v}"), "Vimeo"));
    }
    if let Some(p) = rest.strip_prefix("open.spotify.com/") {
        let mut parts = p.split('/');
        let kind = parts.next().unwrap_or("");
        let v = id(parts.next().unwrap_or(""));
        return (["track", "album", "playlist", "episode", "show", "artist"].contains(&kind) && safe(&v)).then(|| (format!("https://open.spotify.com/embed/{kind}/{v}"), "Spotify"));
    }
    if rest.starts_with("soundcloud.com/") {
        return Some((format!("https://w.soundcloud.com/player/?url={}", encode_uri_component(s)), "SoundCloud"));
    }
    None
}

/// A path list ("a > b > c" or "src/app.ts") as nested lists.
fn tree_html(paths: &[Vec<String>], class: &str, files: bool) -> String {
    fn level(items: &[(Vec<String>, bool)], depth: usize, files: bool, out: &mut String) {
        let mut i = 0;
        out.push_str("<ul>");
        while i < items.len() {
            let name = items[i].0[depth].clone();
            let mut j = i;
            while j < items.len() && items[j].0.len() > depth && items[j].0[depth] == name {
                j += 1;
            }
            let group = &items[i..j];
            let deeper: Vec<(Vec<String>, bool)> = group.iter().filter(|(p, _)| p.len() > depth + 1).cloned().collect();
            let folder = !deeper.is_empty() || group.iter().any(|(p, dir)| p.len() == depth + 1 && *dir);
            let class = if !files {
                ""
            } else if folder {
                " class=\"dir\""
            } else {
                " class=\"file\""
            };
            out.push_str(&format!("<li{class}><span>{}</span>", esc(&name)));
            if !deeper.is_empty() {
                level(&deeper, depth + 1, files, out);
            }
            out.push_str("</li>");
            i = j;
        }
        out.push_str("</ul>");
    }
    let items: Vec<(Vec<String>, bool)> = paths.iter().filter(|p| !p.is_empty()).map(|p| (p.clone(), false)).collect();
    let mut o = format!("<div class=\"{class}\">");
    level(&items, 0, files, &mut o);
    o.push_str("</div>");
    o
}

/// Stars to the nearest half, each lit, half lit or not, by class: no
/// style attribute, so a strict style-src draws it whole.
fn stars(value: f64, max: f64) -> String {
    let max = if max.is_nan() || max <= 0.0 { 5.0 } else { max.min(10.0) };
    let v = if value.is_nan() { 0.0 } else { value.clamp(0.0, max) };
    let halves = round(v * 2.0) as usize;
    let each: String = (0..max as usize)
        .map(|i| match halves.saturating_sub(i * 2) {
            0 => "<span>\u{2605}</span>",
            1 => "<span class=\"half\">\u{2605}</span>",
            _ => "<span class=\"lit\">\u{2605}</span>",
        })
        .collect();
    format!("<span class=\"stars\" role=\"img\" aria-label=\"{} out of {}\">{each}</span>", num_str(v), num_str(max))
}

/// An .ics file for AddToCalendar, as a data: URL that downloads without JavaScript.
fn ics(n: &Node) -> String {
    let stamp = |s: &str| -> String { s.chars().filter(|c| c.is_ascii_digit()).take(12).collect::<String>() };
    let fmt = |s: &str| {
        let d = stamp(s);
        if d.len() >= 12 {
            format!("{}T{}00", &d[0..8], &d[8..12])
        } else if d.len() >= 8 {
            d[0..8].to_string()
        } else {
            String::new()
        }
    };
    let clean = |s: &str| s.replace(['\r', '\n'], " ").replace(',', "\\,").replace(';', "\\;");
    let start = fmt(n.attr("start").unwrap_or(""));
    let end = n.attr("end").map(fmt).filter(|e| !e.is_empty()).unwrap_or_else(|| start.clone());
    let date_only = start.len() == 8;
    let mut lines = alloc::vec![
        String::from("BEGIN:VCALENDAR"),
        String::from("VERSION:2.0"),
        String::from("PRODID:-//MorphScreen//EN"),
        String::from("BEGIN:VEVENT"),
        format!("UID:{}-{}@morphscreen", start, slug(n.attr("title").unwrap_or("event"))),
        format!("DTSTAMP:{}", if date_only { format!("{start}T000000") } else { start.clone() }),
        format!("DTSTART{}:{}", if date_only { ";VALUE=DATE" } else { "" }, start),
        format!("DTEND{}:{}", if date_only { ";VALUE=DATE" } else { "" }, end),
        format!("SUMMARY:{}", clean(n.attr("title").unwrap_or(""))),
    ];
    if let Some(w) = n.attr("where") {
        lines.push(format!("LOCATION:{}", clean(w)));
    }
    if let Some(d) = n.attr("note") {
        lines.push(format!("DESCRIPTION:{}", clean(d)));
    }
    lines.push(String::from("END:VEVENT"));
    lines.push(String::from("END:VCALENDAR"));
    format!("data:text/calendar;charset=utf-8,{}", encode_uri_component(&lines.join("\r\n")))
}

fn plain(spans: &[Span]) -> String {
    let mut t = String::new();
    inline::plain(spans, &mut t);
    t
}

impl R<'_> {
    /// A pack component's HTML, or None when `n` isn't one.
    pub(super) fn pack(&mut self, n: &Node, kids: &[usize], depth: usize) -> Option<String> {
        let a = |k: &str| n.attr(k);
        let s = |k: &str| esc(n.attr(k).unwrap_or(""));
        let has = |k: &str| n.attr(k).map_or(false, |v| !v.trim().is_empty());
        let name = match n.attr("name") {
            Some(v) => v.to_string(),
            None => slug(n.attr("label").unwrap_or("field")),
        };
        let req = if n.flag("required") { " required" } else { "" };
        let hint = || if has("hint") { format!("<small>{}</small>", s("hint")) } else { String::new() };
        let label = || format!("<span>{}{}</span>", s("label"), if n.flag("required") { " *" } else { "" });
        let table = || match &n.data {
            Some(Data::Table { columns, rows }) => Some((columns.clone(), rows.clone())),
            _ => None,
        };
        let raw = n.raw.clone();
        let html = match n.ty.as_str() {
            // ---------- data ----------
            "KeyValue" => {
                let (_, rows) = table().unwrap_or_default();
                // Long values go under their keys on a phone (theme.css).
                let long = rows.iter().any(|r| r.get(1..).map(|x| x.iter().map(|c| c.chars().count()).sum::<usize>()).unwrap_or(0) > 40);
                let mut o = format!("<figure class=\"kv{}\">{}<dl>", if long { " long" } else { "" }, caption(a("title")));
                for r in rows {
                    let k = r.first().cloned().unwrap_or_default();
                    let v = r.get(1..).map(|x| x.join(" \u{b7} ")).unwrap_or_default();
                    o.push_str(&format!("<dt>{}</dt><dd>{}</dd>", self.spans(&inline::parse(&k)), self.spans(&inline::parse(&v))));
                }
                o + "</dl></figure>"
            }
            "Timeline" => {
                let mut o = format!("<figure class=\"timeline\">{}<ol>", caption(a("title")));
                for item in list_items(&raw) {
                    let (t, what) = match item.split_once(": ") {
                        Some((t, w)) if t.chars().count() <= 32 => (t, w),
                        _ => ("", item),
                    };
                    o.push_str(&format!("<li><time>{}</time><span>{}</span></li>", keep_ids(t), self.spans(&inline::parse(what))));
                }
                o + "</ol></figure>"
            }
            "Gauge" => {
                let min = a("min").map(number).filter(|x| !x.is_nan()).unwrap_or(0.0);
                let max = a("max").map(number).filter(|x| !x.is_nan() && *x > min).unwrap_or(if min < 100.0 { 100.0 } else { min + 1.0 });
                let v = a("value").map(chart_num).unwrap_or(f64::NAN);
                let f = if v.is_nan() { 0.0 } else { ((v - min) / (max - min)).clamp(0.0, 1.0) };
                // A half circle of radius 40: the value's arc over the track.
                let ang = core::f64::consts::PI * (1.0 - f);
                let (x, y) = (50.0 + 40.0 * libm::cos(ang), 50.0 - 40.0 * libm::sin(ang));
                format!(
                    "<figure class=\"gauge {}\"><svg viewBox=\"0 0 100 56\" role=\"meter\" aria-valuenow=\"{}\" aria-valuemin=\"{}\" aria-valuemax=\"{}\" aria-label=\"{}\"><path class=\"track\" d=\"M10 50A40 40 0 0 1 90 50\"/>{}</svg><strong>{}{}</strong><figcaption>{}</figcaption><small>{}</small><small>{}</small></figure>",
                    tone(a("tone"), TONES, "neutral"),
                    if v.is_nan() { String::new() } else { num_str(v) },
                    num_str(min),
                    num_str(max),
                    s("label"),
                    if f > 0.0 { format!("<path class=\"value\" d=\"M10 50A40 40 0 0 1 {} {}\"/>", fixed_num(x, 2), fixed_num(y, 2)) } else { String::new() },
                    s("value"),
                    if has("unit") { format!("<span>{}</span>", s("unit")) } else { String::new() },
                    s("label"),
                    num_str(min),
                    num_str(max)
                )
            }
            "Heatmap" => {
                let (cols, rows) = table().unwrap_or_default();
                let vals: Vec<f64> = rows.iter().flat_map(|r| r.iter().skip(1).map(|c| chart_num(c))).filter(|x| !x.is_nan()).collect();
                let lo = vals.iter().cloned().fold(f64::INFINITY, f64::min);
                let hi = vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                let mut o = format!("<figure class=\"heatmap\">{}<div class=\"table\" tabindex=\"0\"><table><thead><tr>", caption(a("title")));
                for c in &cols {
                    o.push_str(&format!("<th>{}</th>", esc(c)));
                }
                o.push_str("</tr></thead><tbody>");
                for r in &rows {
                    o.push_str(&format!("<tr><th>{}</th>", esc(r.first().map(String::as_str).unwrap_or(""))));
                    for c in r.iter().skip(1) {
                        let v = chart_num(c);
                        let f = if v.is_nan() || !(hi > lo) { 0.0 } else { (v - lo) / (hi - lo) };
                        // Its shade in tenths, by class (heat0 to heat10), not a style attribute.
                        o.push_str(&format!("<td class=\"heat{}\">{}</td>", round(f * 10.0) as u32, esc(c)));
                    }
                    o.push_str("</tr>");
                }
                o + "</tbody></table></div></figure>"
            }
            "Funnel" => {
                let (_, rows) = table().unwrap_or_default();
                let first = rows.first().and_then(|r| r.get(1)).map(|c| chart_num(c)).filter(|x| !x.is_nan() && *x > 0.0).unwrap_or(1.0);
                let mut o = format!("<figure class=\"funnel\">{}<ol>", caption(a("title")));
                for r in &rows {
                    let raw_v = r.get(1).cloned().unwrap_or_default();
                    let v = chart_num(&raw_v);
                    let pct = if v.is_nan() { 0.0 } else { (v / first * 100.0).clamp(0.0, 100.0) };
                    o.push_str(&format!(
                        "<li><span class=\"label\">{}</span><span class=\"bar\"><svg viewBox=\"0 0 100 1\" preserveAspectRatio=\"none\" aria-hidden=\"true\"><rect width=\"{}\" height=\"1\"/></svg></span><span class=\"n\">{}</span><small>{}%</small></li>",
                        esc(r.first().map(String::as_str).unwrap_or("")),
                        fixed_num(pct, 1),
                        esc(&raw_v),
                        fixed_num(pct, if pct < 10.0 { 1 } else { 0 })
                    ));
                }
                o + "</ol></figure>"
            }
            "Sparkline" => {
                let vals: Vec<f64> = list(a("values")).iter().map(|v| chart_num(v)).filter(|x| !x.is_nan()).collect();
                let lo = vals.iter().cloned().fold(f64::INFINITY, f64::min);
                let hi = vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                let pts: Vec<String> = vals
                    .iter()
                    .enumerate()
                    .map(|(i, v)| {
                        let x = if vals.len() > 1 { i as f64 / (vals.len() - 1) as f64 * 100.0 } else { 50.0 };
                        let y = if hi > lo { 26.0 - (v - lo) / (hi - lo) * 24.0 } else { 14.0 };
                        format!("{},{}", fixed_num(x, 1), fixed_num(y, 1))
                    })
                    .collect();
                let ch = a("change").unwrap_or("");
                let dir = if ch.starts_with(['-', '\u{2212}']) { "down" } else { "up" };
                format!(
                    "<div class=\"spark\"><span class=\"label\">{}</span><span class=\"value\">{}</span><svg viewBox=\"0 0 100 28\" preserveAspectRatio=\"none\" role=\"img\" aria-label=\"{}: {}\"><polyline points=\"{}\"/></svg>{}</div>",
                    s("label"),
                    s("value"),
                    s("label"),
                    esc(&list(a("values")).join(", ")),
                    pts.join(" "),
                    if ch.is_empty() { String::new() } else { format!("<span class=\"change {dir}\">{}</span>", esc(ch)) }
                )
            }
            "Tree" => {
                let paths: Vec<Vec<String>> = list_items(&raw).iter().map(|p| p.split(" > ").map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()).collect();
                format!("<figure class=\"tree\">{}{}</figure>", caption(a("title")), tree_html(&paths, "tree-list", false))
            }
            // ---------- commerce ----------
            "Product" => {
                let body = self.spans(&n.spans);
                let name = if has("href") { format!("<a href=\"{}\">{}</a>", s("href"), s("name")) } else { s("name") };
                // Its Buttons, in a row under it: what the reader can do with it.
                let buttons: Vec<usize> = kids.iter().copied().filter(|&c| self.n(c).component && self.n(c).ty == "Button").collect();
                let actions = self.list_of(&buttons, depth);
                // How many rated it, grouped as a Result's number is ("2,140").
                let count = a("count").map(|c| match c.trim().replace(',', "").parse::<f64>() {
                    Ok(v) if v.is_finite() && v >= 0.0 => result_text(Some(v), "", Some(0)),
                    _ => esc(c.trim()),
                });
                let h = item_heading(depth);
                format!(
                    "<article class=\"product\">{}<div><h{h}>{name}</h{h}>{}{}{}{}{actions}</div></article>",
                    match a("image").filter(|v| !v.trim().is_empty()) {
                        Some(src) if self.images.allows(src) => format!("<img src=\"{}\" alt=\"{}\" loading=\"lazy\" referrerpolicy=\"no-referrer\">", s("image"), s("name")),
                        // A photo that may not load: a picture's outline beside the name.
                        Some(_) => format!(
                            "<span class=\"img-missing icon-only\" role=\"img\" aria-label=\"{}\"><svg class=\"icon\" viewBox=\"0 0 256 256\" aria-hidden=\"true\"><path d=\"{}\"/></svg></span>",
                            if has("name") { s("name") } else { "Image".into() },
                            crate::icon::find("image").map_or("", |(_, p)| p)
                        ),
                        None => String::new(),
                    },
                    if has("badge") { format!("<span class=\"tag\">{}</span>", s("badge")) } else { String::new() },
                    if has("price") { format!("<p class=\"price\"><strong>{}</strong>{}</p>", s("price"), if has("was") { format!("<s>{}</s>", s("was")) } else { String::new() }) } else { String::new() },
                    if has("rating") {
                        let st = stars(number(a("rating").unwrap()), 5.0);
                        match &count {
                            Some(c) if !c.is_empty() => format!("<span class=\"rating\">{st}<small>({c})</small></span>"),
                            _ => st,
                        }
                    } else {
                        String::new()
                    },
                    if body.is_empty() { String::new() } else { format!("<p>{body}</p>") }
                )
            }
            "Plan" => {
                let mut feats = String::new();
                for f in list_items(&raw) {
                    feats.push_str(&format!("<li>{}</li>", self.spans(&inline::parse(f))));
                }
                let h = item_heading(depth);
                format!(
                    "<article class=\"plan{}\"><h{h}>{}</h{h}><p class=\"price\"><strong>{}</strong>{}</p>{}<ul>{feats}</ul></article>",
                    if n.flag("featured") { " featured" } else { "" },
                    s("name"),
                    s("price"),
                    if has("period") { format!("<small>{}</small>", s("period")) } else { String::new() },
                    format!("<p class=\"note\">{}</p>", s("note"))
                )
            }
            "Cart" => {
                let (cols, rows) = table().unwrap_or_default();
                let mut o = format!("<figure class=\"cart\">{}<div class=\"table\" tabindex=\"0\"><table><thead><tr>", caption(a("title")));
                for (k, c) in cols.iter().enumerate() {
                    o.push_str(&format!("<th{}>{}</th>", if k > 0 { " class=\"num\"" } else { "" }, esc(c)));
                }
                o.push_str("</tr></thead><tbody>");
                for r in &rows {
                    o.push_str("<tr>");
                    for (k, c) in r.iter().enumerate() {
                        o.push_str(&format!("<td{}>{}</td>", if k > 0 { " class=\"num\"" } else { "" }, self.spans(&inline::parse(c))));
                    }
                    o.push_str("</tr>");
                }
                o.push_str("</tbody>");
                if has("total") {
                    o.push_str(&format!("<tfoot><tr><th colspan=\"{}\">Total</th><td class=\"num\">{}</td></tr></tfoot>", cols.len().max(2) - 1, s("total")));
                }
                o.push_str("</table></div>");
                if has("note") {
                    o.push_str(&format!("<small>{}</small>", s("note")));
                }
                o + "</figure>"
            }
            "Rating" => format!("<span class=\"rating\">{}<span>{}</span>{}</span>", stars(number(a("value").unwrap_or("")), a("max").map(number).unwrap_or(5.0)), s("value"), if has("count") { format!("<small>({})</small>", s("count")) } else { String::new() }),
            "Compare" => {
                let (cols, rows) = table().unwrap_or_default();
                let mark = |c: &str| match c.trim().to_ascii_lowercase().as_str() {
                    "yes" | "y" | "true" | "\u{2713}" | "\u{2714}" | "x" => Some("<span class=\"yes\"><span class=\"sr\">Yes</span></span>"),
                    "no" | "n" | "false" | "\u{2717}" | "\u{2718}" | "-" | "\u{2014}" => Some("<span class=\"no\"><span class=\"sr\">No</span></span>"),
                    _ => None,
                };
                let mut o = format!("<figure class=\"compare\">{}<div class=\"table\" tabindex=\"0\"><table><thead><tr>", caption(a("title")));
                for c in &cols {
                    o.push_str(&format!("<th>{}</th>", esc(c)));
                }
                o.push_str("</tr></thead><tbody>");
                for r in &rows {
                    o.push_str("<tr>");
                    for (k, c) in r.iter().enumerate() {
                        let cell = match mark(c) {
                            Some(m) if k > 0 => m.to_string(),
                            _ => self.spans(&inline::parse(c)),
                        };
                        o.push_str(&if k == 0 { format!("<th>{cell}</th>") } else { format!("<td>{cell}</td>") });
                    }
                    o.push_str("</tr>");
                }
                o + "</tbody></table></div></figure>"
            }
            "Price" => format!(
                "<p class=\"price\"><strong>{}</strong>{}{}{}</p>",
                s("value"),
                if has("was") { format!("<s>{}</s>", s("was")) } else { String::new() },
                if has("period") { format!("<small>{}</small>", s("period")) } else { String::new() },
                if has("note") { format!("<small class=\"note\">{}</small>", s("note")) } else { String::new() }
            ),
            // ---------- scheduling ----------
            "Calendar" => {
                let (_, rows) = table().unwrap_or_default();
                let marked: Vec<((i64, i64, i64), String)> = rows.iter().filter_map(|r| ymd(r.first()?).map(|d| (d, r.get(1..).map(|x| x.join(" \u{b7} ")).unwrap_or_default()))).collect();
                let (y, m) = a("month")
                    .and_then(|v| Some((v.get(0..4)?.parse().ok()?, v.get(5..7)?.parse().ok()?)))
                    .filter(|(_, m): &(i64, i64)| (1..=12).contains(m))
                    .or_else(|| marked.first().map(|((y, m, _), _)| (*y, *m)))
                    .unwrap_or((2026, 1));
                // Monday first.
                let lead = (days(y, m, 1) + 3).rem_euclid(7);
                let len = month_len(y, m);
                let mut o = format!(
                    "<figure class=\"calendar\"><figcaption>{}</figcaption><table><thead><tr><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Sun</th></tr></thead><tbody><tr>",
                    if has("title") { title(a("title").unwrap()) } else { format!("{} {y}", ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][(m - 1) as usize]) }
                );
                for _ in 0..lead {
                    o.push_str("<td></td>");
                }
                for d in 1..=len {
                    if (lead + d - 1) % 7 == 0 && d > 1 {
                        o.push_str("</tr><tr>");
                    }
                    let on: Vec<&String> = marked.iter().filter(|((yy, mm, dd), _)| *yy == y && *mm == m && *dd == d).map(|(_, t)| t).collect();
                    if on.is_empty() {
                        o.push_str(&format!("<td><span>{d}</span></td>"));
                    } else {
                        let text: Vec<String> = on.iter().map(|t| esc(t)).collect();
                        o.push_str(&format!("<td class=\"on\"><span>{d}</span><small>{}</small></td>", text.join("<br>")));
                    }
                }
                let tail = (7 - (lead + len) % 7) % 7;
                for _ in 0..tail {
                    o.push_str("<td></td>");
                }
                o.push_str("</tr></tbody></table>");
                // On a phone a day is too narrow for its events: they're listed under
                // the month, or, when every day says the same thing, named once.
                let shown: Vec<_> = marked.iter().filter(|((yy, mm, _), _)| *yy == y && *mm == m).collect();
                let mut list = String::new();
                if shown.len() > 1 && shown.iter().all(|(_, t)| *t == shown[0].1) {
                    list.push_str(&format!("<li class=\"key\"><span>{}</span></li>", esc(&shown[0].1)));
                } else {
                    for ((_, _, dd), t) in &shown {
                        list.push_str(&format!("<li><time>{} {}</time><span>{}</span></li>", dd, MONTHS[(m - 1) as usize], esc(t)));
                    }
                }
                if !list.is_empty() {
                    o.push_str(&format!("<ul class=\"cal-list\">{list}</ul>"));
                }
                o + "</figure>"
            }
            "Event" => {
                let body = self.spans(&n.spans);
                let t = tone(a("tone"), TONES, "neutral");
                let h = item_heading(depth);
                format!(
                    "<article class=\"event {t}\"><time datetime=\"{}\">{}{}</time><h{h}>{}</h{h}>{}{}</article>",
                    s("start"),
                    when(a("start").unwrap_or("")),
                    if has("end") {
                        // Same day: only the end time.
                        let (st, en) = (a("start").unwrap_or(""), a("end").unwrap());
                        let same = st.get(0..10).is_some() && st.get(0..10) == en.get(0..10);
                        format!(" \u{2013} {}", match en.get(11..16) {
                            Some(time) if same => esc(time),
                            _ => when(en),
                        })
                    } else {
                        String::new()
                    },
                    s("title"),
                    if has("where") { format!("<p class=\"where\">{}</p>", s("where")) } else { String::new() },
                    if body.is_empty() { String::new() } else { format!("<p>{body}</p>") }
                )
            }
            "TimeSlots" | "ToggleGroup" => {
                let multiple = n.ty == "ToggleGroup" && n.flag("multiple");
                let chosen = list(a("value"));
                let options = list(a("options"));
                // Longer options get wider columns (theme.css), so a slot keeps to one line.
                let longest = options.iter().map(|o| o.chars().count()).max().unwrap_or(0);
                let size = if longest >= 14 { " long" } else if longest >= 8 { " wide" } else { "" };
                let mut o = format!("<fieldset class=\"field chips{size}\"><legend>{}{}</legend><div>", s("label"), if n.flag("required") { " *" } else { "" });
                for opt in options {
                    o.push_str(&format!(
                        "<label><input type=\"{}\" name=\"{}\" value=\"{}\"{}{}><span>{}</span></label>",
                        if multiple { "checkbox" } else { "radio" },
                        esc(&name),
                        esc(&opt),
                        if chosen.contains(&opt) { " checked" } else { "" },
                        if !multiple { req } else { "" },
                        esc(&opt)
                    ));
                }
                o + "</div>" + &hint() + "</fieldset>"
            }
            "Agenda" => {
                let (_, rows) = table().unwrap_or_default();
                let mut o = format!("<figure class=\"agenda\">{}<ol>", caption(a("title")));
                for r in &rows {
                    let rest = r.get(1..).map(|x| x.join(" \u{b7} ")).unwrap_or_default();
                    o.push_str(&format!("<li><time>{}</time><span>{}</span></li>", keep_ids(r.first().map(String::as_str).unwrap_or("")), self.spans(&inline::parse(&rest))));
                }
                o + "</ol></figure>"
            }
            "Countdown" => format!("<div class=\"countdown\" data-until=\"{}\"><span class=\"label\">{}</span><time datetime=\"{}\">{}</time></div>", s("until"), s("label"), s("until"), when(a("until").unwrap_or(""))),
            // ---------- media ----------
            "Video" => format!(
                "<figure class=\"video\"><video controls preload=\"none\" src=\"{}\"{}{}></video>{}</figure>",
                s("src"),
                if has("poster") && self.images.allows(a("poster").unwrap_or("")) { format!(" poster=\"{}\"", s("poster")) } else { String::new() },
                if has("title") { format!(" aria-label=\"{}\"", s("title")) } else { String::new() },
                if has("title") || has("caption") { format!("<figcaption>{}{}</figcaption>", if has("title") { format!("<strong>{}</strong>", s("title")) } else { String::new() }, if has("caption") { format!(" {}", s("caption")) } else { String::new() }) } else { String::new() }
            ),
            "Audio" => format!("<figure class=\"audio\">{}<audio controls preload=\"none\" src=\"{}\"></audio></figure>", caption(a("title")), s("src")),
            "Embed" => {
                let src = a("src").unwrap_or("");
                let label = if has("title") { s("title") } else { esc(src) };
                match embed_url(src) {
                    // Nothing from the host loads until the user asks (the web SDK swaps in the player).
                    Some((player, host)) => format!("<figure class=\"embed\" data-player=\"{}\"><a href=\"{}\" rel=\"noopener\"><strong>{label}</strong><small>Play on {host}</small></a></figure>", esc(&player), s("src")),
                    None => format!("<figure class=\"embed\"><a href=\"{}\" rel=\"noopener\"><strong>{label}</strong><small>{}</small></a></figure>", s("src"), keep_ids(a("src").unwrap_or(""))),
                }
            }
            // ---------- interactive ----------
            // Each works with no script: radio buttons and the answer behind a
            // disclosure, cards that open, checkboxes. The SDKs add marking,
            // flipping, progress and live results, and report what the reader did.
            "Quiz" => {
                let qs = self.list_of(kids, depth);
                format!("<section class=\"quiz\">{}<ol class=\"questions\">{qs}</ol><p class=\"score\" hidden></p></section>", title_line(a("title")))
            }
            "Question" => {
                let (items, answer) = match &n.data {
                    // The theme letters each choice, so letters the model wrote go.
                    Some(Data::Choices { items, answer }) => (crate::interactive::strip_keys(items), *answer),
                    _ => (Vec::new(), None),
                };
                let group = field_id(&n.id);
                let mut o = format!("<li class=\"question\"{}><fieldset><legend>{}</legend>", answer.map(|i| format!(" data-answer=\"{i}\"")).unwrap_or_default(), keep_ids(a("text").unwrap_or("")));
                for (k, it) in items.iter().enumerate() {
                    let label = self.spans(it);
                    o.push_str(&format!("<label><input type=\"radio\" name=\"{group}\" value=\"{k}\"> <span>{label}</span></label>"));
                }
                o.push_str("</fieldset>");
                let right = answer.and_then(|i| items.get(i)).map(|it| self.spans(it));
                if right.is_some() || has("explain") {
                    let mut why = right.map(|r| format!("<strong>{r}</strong>")).unwrap_or_default();
                    if has("explain") {
                        if !why.is_empty() {
                            why.push_str(" \u{b7} ");
                        }
                        why.push_str(&keep_ids(a("explain").unwrap_or("")));
                    }
                    o.push_str(&format!("<details class=\"explain\"><summary>Answer</summary><p>{why}</p></details>"));
                }
                o + "</li>"
            }
            "Flashcards" => {
                let rows = match &n.data {
                    Some(Data::Table { rows, .. }) => rows.clone(),
                    _ => Vec::new(),
                };
                let mut o = format!("<section class=\"flashcards\">{}<ol>", title_line(a("title")));
                for r in rows.iter().filter(|r| !r.is_empty()) {
                    let front = self.spans(&crate::inline::parse(&r[0]));
                    let back = self.spans(&crate::inline::parse(&r[1..].join(" \u{b7} ")));
                    o.push_str(&format!("<li><details class=\"card\"><summary>{front}</summary><p>{back}</p></details></li>"));
                }
                o + "</ol></section>"
            }
            "Poll" => {
                let group = format!("poll-{}", esc(&name));
                let mut o = format!("<fieldset class=\"poll\" data-name=\"{}\"><legend>{}</legend>", esc(&name), keep_ids(a("label").unwrap_or("")));
                for opt in list(a("options")) {
                    let opt = opt.trim();
                    o.push_str(&format!("<label><input type=\"radio\" name=\"{group}\" value=\"{}\"> <span>{}</span></label>", esc(opt), keep_ids(opt)));
                }
                o + "</fieldset>"
            }
            "Checklist" => {
                let items = match &n.data {
                    Some(Data::Checks { items }) => items.clone(),
                    _ => Vec::new(),
                };
                let done = items.iter().filter(|(d, _)| *d).count();
                let mut o = format!(
                    "<section class=\"checklist\" data-name=\"{}\">{}<p class=\"progress-line\"><progress max=\"{}\" value=\"{done}\"></progress><span>{done} of {} done</span></p><ul>",
                    esc(&name),
                    title_line(a("title")),
                    items.len(),
                    items.len()
                );
                for (d, it) in &items {
                    let label = self.spans(it);
                    o.push_str(&format!("<li><label><input type=\"checkbox\"{}> <span>{label}</span></label></li>", if *d { " checked" } else { "" }));
                }
                o + "</ul></section>"
            }
            "WhatIf" => {
                // Each slider's name in the formulas, beside the slider itself.
                // Wherever they sit inside it, in the order the page shows them.
                let mut vars = String::new();
                for c in crate::interactive::sliders_in(self.nodes, kids) {
                    if !vars.is_empty() {
                        vars.push(',');
                    }
                    vars.push_str(&format!("\"{}\"", esc(&crate::interactive::slider_name(self.n(c)))));
                }
                let inner = self.list_of(kids, depth);
                format!("<section class=\"whatif\" data-vars=\"[{}]\">{}{inner}</section>", vars.replace('"', "&quot;"), title_line(a("title")))
            }
            "Result" => {
                let (rpn, value) = match &n.data {
                    Some(Data::Formula { rpn, value }) => (rpn.clone(), *value),
                    _ => (Vec::new(), None),
                };
                let tokens: Vec<String> = rpn.iter().map(|t| format!("&quot;{}&quot;", esc(t))).collect();
                let decimals = a("decimals").and_then(|d| d.trim().parse::<usize>().ok());
                format!(
                    "<p class=\"result\" data-formula=\"[{}]\" data-unit=\"{}\"{}><span>{}</span> <output>{}</output></p>",
                    tokens.join(","),
                    s("unit"),
                    decimals.map(|d| format!(" data-decimals=\"{d}\"")).unwrap_or_default(),
                    keep_ids(a("label").unwrap_or("")),
                    esc(&result_text(value, a("unit").unwrap_or(""), decimals))
                )
            }
            "Carousel" => {
                let mut o = format!("<figure class=\"carousel\">{}<div tabindex=\"0\">", caption(a("title")));
                for im in crate::validate::images_in(&raw) {
                    let img = self.image(&im.src, &im.alt, &im.credit);
                    o.push_str(&img);
                }
                o + "</div></figure>"
            }
            // ---------- docs ----------
            "Code" | "Diff" => {
                // The lines the core kept as written (older trees: a fenced block inside).
                let code = kids.iter().copied().find(|&c| self.n(c).ty == "code");
                let text = match &n.data {
                    Some(Data::Lines(l)) => l.join("\n"),
                    _ => code.map(|c| plain(&self.n(c).spans)).unwrap_or_default(),
                };
                let marks: Vec<usize> = list(a("highlight")).iter().filter_map(|x| x.trim().parse().ok()).collect();
                let mut lines = String::new();
                for (k, l) in text.lines().enumerate() {
                    let class = if n.ty == "Diff" {
                        if l.starts_with("+++") || l.starts_with("---") || l.starts_with("@@") {
                            "meta"
                        } else if l.starts_with('+') {
                            "add"
                        } else if l.starts_with('-') {
                            "del"
                        } else {
                            ""
                        }
                    } else if marks.contains(&(k + 1)) {
                        "hl"
                    } else {
                        ""
                    };
                    lines.push_str(&format!("<span{}>{}</span>\n", if class.is_empty() { String::new() } else { format!(" class=\"{class}\"") }, esc(l)));
                }
                let rest: Vec<usize> = kids.iter().copied().filter(|&c| Some(c) != code).collect();
                let after = self.list_of(&rest, depth);
                format!("<figure class=\"{}\">{}<pre><code>{lines}</code></pre></figure>{after}", if n.ty == "Diff" { "diff" } else { "codefile" }, caption(a("file")))
            }
            "Math" => {
                // Typeset by the browser from MathML (the other renderers show the Unicode line).
                let tex = a("tex").unwrap_or("");
                let body = if tex.trim().is_empty() {
                    match &n.data {
                        Some(Data::Lines(l)) => esc(&l.first().cloned().unwrap_or_default()),
                        _ => String::new(),
                    }
                } else {
                    crate::math::to_mathml(tex)
                };
                format!("<figure class=\"math\"><div>{body}</div>{}</figure>", caption(a("label")))
            }
            "FileTree" => {
                let mut paths: Vec<Vec<String>> = Vec::new();
                for p in list_items(&raw) {
                    let p = p.trim().trim_matches('`');
                    let dir = p.ends_with('/');
                    let mut parts: Vec<String> = p.split('/').filter(|x| !x.is_empty()).map(|x| x.to_string()).collect();
                    if dir {
                        if let Some(last) = parts.last_mut() {
                            last.push('/');
                        }
                    }
                    paths.push(parts);
                }
                // Folders written with a trailing slash name the same entry as their contents.
                for p in paths.iter_mut() {
                    let k = p.len();
                    for (i, seg) in p.iter_mut().enumerate() {
                        if i + 1 < k && !seg.ends_with('/') {
                            seg.push('/');
                        }
                    }
                }
                format!("<figure class=\"filetree\">{}{}</figure>", caption(a("title")), tree_html(&paths, "tree-list", true))
            }
            "Citation" => {
                let body = self.spans(&n.spans);
                let src = if has("href") { format!("<a href=\"{}\" rel=\"noopener\">{}</a>", s("href"), s("title")) } else { s("title") };
                // Dates and IDs in the source line stay whole.
                let meta: Vec<String> = ["source", "date"].iter().filter(|k| has(k)).map(|k| keep_ids(a(k).unwrap_or(""))).collect();
                format!(
                    "<blockquote class=\"citation\">{}<footer>{src}{}</footer></blockquote>",
                    if body.is_empty() { String::new() } else { format!("<p>{body}</p>") },
                    if meta.is_empty() { String::new() } else { format!(" <small>{}</small>", meta.join(" \u{b7} ")) }
                )
            }
            // ---------- inputs ----------
            "RatingInput" => {
                let max = a("max").map(number).filter(|x| !x.is_nan() && *x >= 1.0).unwrap_or(5.0).min(10.0) as usize;
                let value = a("value").map(number).unwrap_or(f64::NAN);
                let mut o = format!("<fieldset class=\"field star-input\"><legend>{}{}</legend><div>", s("label"), if n.flag("required") { " *" } else { "" });
                // Highest first: with row-reverse, ":checked ~ label" lights the lower stars.
                for k in (1..=max).rev() {
                    o.push_str(&format!(
                        "<input type=\"radio\" id=\"{0}-{k}\" name=\"{0}\" value=\"{k}\"{1}{req}><label for=\"{0}-{k}\" title=\"{k} of {max}\">\u{2605}</label>",
                        esc(&name),
                        if !value.is_nan() && value as usize == k { " checked" } else { "" }
                    ));
                }
                o + "</div>" + &hint() + "</fieldset>"
            }
            "Combobox" => {
                let id = format!("{}-list", esc(&name));
                let mut opts = String::new();
                for o in list(a("options")) {
                    opts.push_str(&format!("<option value=\"{}\">", esc(&o)));
                }
                format!(
                    "<label class=\"field\">{}<input name=\"{}\" list=\"{id}\" autocomplete=\"off\"{}{}{req}><datalist id=\"{id}\">{opts}</datalist>{}</label>",
                    label(),
                    esc(&name),
                    if has("placeholder") { format!(" placeholder=\"{}\"", s("placeholder")) } else { String::new() },
                    if has("value") { format!(" value=\"{}\"", s("value")) } else { String::new() },
                    hint()
                )
            }
            "Time" => format!(
                "<label class=\"field\">{}<input type=\"time\" name=\"{}\"{}{}{}{req}>{}</label>",
                label(),
                esc(&name),
                if has("value") { format!(" value=\"{}\"", s("value")) } else { String::new() },
                if has("min") { format!(" min=\"{}\"", s("min")) } else { String::new() },
                if has("max") { format!(" max=\"{}\"", s("max")) } else { String::new() },
                hint()
            ),
            "Stepper" => format!(
                "<label class=\"field stepper\">{}<span><input type=\"number\" inputmode=\"numeric\" name=\"{}\" value=\"{}\"{}{}{}{req}>{}</span>{}</label>",
                label(),
                esc(&name),
                if has("value") { s("value") } else if has("min") { s("min") } else { String::from("0") },
                if has("min") { format!(" min=\"{}\"", s("min")) } else { String::new() },
                if has("max") { format!(" max=\"{}\"", s("max")) } else { String::new() },
                format!(" step=\"{}\"", if has("step") { s("step") } else { String::from("1") }),
                if has("unit") { format!("<small>{}</small>", s("unit")) } else { String::new() },
                hint()
            ),
            "Signature" => format!(
                "<label class=\"field signature\">{}<input name=\"{}\" placeholder=\"Type your full name to sign\" autocomplete=\"name\"{req}>{}</label>",
                label(),
                esc(&name),
                hint()
            ),
            // ---------- device, second set ----------
            "Contact" => format!("<label class=\"field contact\">{}<input name=\"{}\" placeholder=\"Name, phone or email\" autocomplete=\"name\"{req}>{}</label>", label(), esc(&name), hint()),
            "AddToCalendar" => {
                let text = self.spans(&n.spans);
                format!("<a class=\"btn secondary\" href=\"{}\" download=\"{}.ics\">{}</a>", ics(n), esc(&slug(a("title").unwrap_or("event"))), if text.is_empty() { String::from("Add to calendar") } else { text })
            }
            "Share" => {
                let text = self.spans(&n.spans);
                let body = [a("text").unwrap_or(""), a("href").unwrap_or("")].iter().filter(|x| !x.is_empty()).cloned().collect::<Vec<_>>().join(" ");
                format!("<a class=\"btn secondary share\" href=\"mailto:?body={}\" data-text=\"{}\" data-href=\"{}\">{}</a>", encode_uri_component(&body), s("text"), s("href"), if text.is_empty() { String::from("Share") } else { text })
            }
            "VoiceNote" => format!(
                "<label class=\"field voice\">{}<input type=\"file\" name=\"{}\" accept=\"audio/*\" capture{}{req}>{}</label>",
                label(),
                esc(&name),
                if has("max") { format!(" data-max=\"{}\"", s("max")) } else { String::new() },
                hint()
            ),
            "QR" => {
                let rows = match &n.data {
                    Some(Data::Lines(l)) => l.clone(),
                    _ => crate::qr::encode(a("value").unwrap_or("")).unwrap_or_default(),
                };
                let size = rows.len() + 8;
                let mut path = String::new();
                for (y, r) in rows.iter().enumerate() {
                    for (x, c) in r.chars().enumerate() {
                        if c == '1' {
                            path.push_str(&format!("M{} {}h1v1h-1z", x + 4, y + 4));
                        }
                    }
                }
                format!(
                    "<figure class=\"qr\"><svg viewBox=\"0 0 {size} {size}\" role=\"img\" aria-label=\"QR code: {}\" shape-rendering=\"crispEdges\"><rect width=\"{size}\" height=\"{size}\" fill=\"#fff\"/><path d=\"{path}\" fill=\"#000\"/></svg>{}<small>{}</small></figure>",
                    s("value"),
                    caption(a("label")),
                    keep_ids(a("value").unwrap_or(""))
                )
            }
            _ => return None,
        };
        Some(html)
    }
}
