//! The finished tree as HTML: no JavaScript and no style attributes (it
//! passes a strict CSP, style-src included), charts, maps and bars as SVG
//! drawn with attributes, other amounts as classes. A port of
//! render/html.ts, which it matches output for output; render/theme.css
//! styles it.
//!
//! Classes are written here by their short names (`card`, `btn primary`)
//! and go out with `ms-` in front of each (`ms-card`, `ms-btn ms-primary`,
//! roadmap C5), so an app's own `.card` or `.btn` (Bootstrap's, daisyUI's)
//! never reaches an answer and ours never reach the app: [`prefix_classes`]
//! does it once, on the way out of [`render`] and [`render_node`].

use crate::catalog::{Catalog, Content};
use crate::images::ImagePolicy;
use crate::inline::Span;
use crate::jsnum::{encode_uri_component, fixed_num, num_str, number, round, to_fixed};
use crate::parse::Parser;
use crate::text::{cells, dashes, is_separator, js_len, js_slice};
use crate::tree::{Data, Node};
use alloc::format;
use alloc::sync::Arc;
use alloc::string::{String, ToString};
use alloc::vec;
use alloc::vec::Vec;
use libm::{cos, floor, log10, pow, sin};

mod packs;
pub use packs::{embed_url, when};

/// A node's icon as inline SVG (Phosphor's 256-unit grid), or nothing.
fn icon_svg(n: &Node) -> String {
    let name = n.attrs.iter().find(|(k, _)| k == "icon").and_then(|(_, v)| v.as_deref());
    match name.and_then(crate::icon::find) {
        Some((_, path)) => format!("<svg class=\"icon\" viewBox=\"0 0 256 256\" aria-hidden=\"true\"><path d=\"{path}\"/></svg>"),
        None => String::new(),
    }
}

/// What a picture that doesn't load shows: its description in a tile.
pub(crate) fn image_tile(alt: &str) -> String {
    let alt = if alt.is_empty() { "Image" } else { alt };
    let long = if alt.chars().count() > 32 { " long" } else { "" };
    format!("<span class=\"img-missing{long}\" role=\"img\" aria-label=\"{}\">{}</span>", esc(alt), keep_ids(alt))
}

/// An image, or a tile with its description when nothing may load for it:
/// one the API was asked to find and didn't (`find` is still its source),
/// or one from a host the app didn't allow.
fn picture(images: &ImagePolicy, src: &str, alt: &str) -> String {
    if src == "find" || !images.allows(src) {
        return image_tile(alt);
    }
    format!("<img src=\"{}\" alt=\"{}\" loading=\"lazy\" referrerpolicy=\"no-referrer\">", esc(src), esc(alt))
}

pub fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            c => o.push(c),
        }
    }
    o
}

/// Escaped text with IDs, dates, times, versions and codes (a token with a
/// digit and a - / : . or _ inside, like 2024-01-18, 14:22, ap-southeast-1,
/// INC-2024-0847) kept on one line: a line break inside one reads as two
/// values.
pub fn keep_ids(t: &str) -> String {
    let mut o = String::with_capacity(t.len() + 16);
    let mut start = 0;
    let bytes = t.as_bytes();
    let mut i = 0;
    while i <= bytes.len() {
        let end = i == bytes.len() || bytes[i].is_ascii_whitespace();
        if end {
            if start < i {
                let tok = &t[start..i];
                let core = tok.trim_matches(|c: char| matches!(c, '(' | ')' | ',' | ';' | '"' | '\'' | '[' | ']'));
                let id = (core.chars().count() >= 3
                    && core.chars().count() <= 32
                    && core.chars().any(|c| c.is_ascii_digit())
                    && core.trim_end_matches(['.', ':']).chars().any(|c| matches!(c, '-' | '/' | ':' | '.' | '_' | '\u{2013}'))
                    && !core.contains("://"))
                    // An email address is one piece too.
                    || (core.chars().count() <= 40 && core.contains('@') && core.trim_end_matches('.').contains('.') && !core.contains("://"));
                if id {
                    o.push_str("<span class=\"nb\">");
                    o.push_str(&esc(tok));
                    o.push_str("</span>");
                } else if tok.chars().count() > 32 && tok.contains(['/', ';']) {
                    // A long URL, path or code: it may break after a slash, never inside a part.
                    let mut first = true;
                    for part in tok.split_inclusive(['/', ';']) {
                        if !first {
                            o.push_str("<wbr>");
                        }
                        first = false;
                        // A part kept whole must still fit a phone; longer ones break as they must.
                        let n = part.chars().count();
                        if n > 1 && n <= 32 && part.chars().any(|c| c.is_ascii_digit() || matches!(c, '-' | '_' | '.')) {
                            o.push_str("<span class=\"nb\">");
                            o.push_str(&esc(part));
                            o.push_str("</span>");
                        } else {
                            o.push_str(&esc(part));
                        }
                    }
                } else {
                    // A dash between words ("lobbying—Microsoft"): the line may break
                    // after it, never before it.
                    let mut rest = tok;
                    while let Some(p) = rest.find(['\u{2014}', '\u{2013}']) {
                        let cut = p + 3;
                        if p == 0 {
                            o.push_str(&esc(&rest[..cut]));
                        } else {
                            o.push_str("<span class=\"nb\">");
                            o.push_str(&esc(&rest[..cut]));
                            o.push_str("</span>");
                        }
                        rest = &rest[cut..];
                    }
                    o.push_str(&esc(rest));
                }
            }
            if i < bytes.len() {
                o.push(bytes[i] as char);
            }
            start = i + 1;
        }
        i += 1;
    }
    o
}

fn title(s: &str) -> String {
    match pair_at(s) {
        Some(i) => format!("{}<span class=\"pair\">{}</span>", keep_ids(&dashes(&s[..i])), keep_ids(&dashes(&s[i..]))),
        None => keep_ids(&dashes(s)),
    }
}

/// Typographers' "widon't": the last two words of a heading or bold label
/// of three words or more are held together, so its last line is never one
/// word alone (text-wrap: balance evens lines but can leave one; pretty is
/// for paragraphs). They go in an inline block: kept together where they
/// fit, wrapped inside where they don't, and nothing extra to copy.
/// Where the pair starts in `s`, if it gets one.
pub fn pair_at(s: &str) -> Option<usize> {
    let t = s.trim_end();
    if t.split_whitespace().count() < 3 {
        return None;
    }
    let last = t.rfind(' ')?;
    let start = t[..last].trim_end().rfind(' ')? + 1;
    (t[start..].chars().count() <= 30).then_some(start)
}

/// Spans with their last two words held together (see `pair_at`), when the
/// pair sits in the last text span.
fn pair_spans(spans: &[Span]) -> Vec<Span> {
    let mut all = String::new();
    crate::inline::plain(spans, &mut all);
    let mut out = spans.to_vec();
    if all.split_whitespace().count() < 3 {
        return out;
    }
    if let Some(Span::Text(t)) = out.last().cloned() {
        if let Some(i) = pair_at(&t) {
            out.pop();
            if !t[..i].is_empty() {
                out.push(Span::Text(t[..i].to_string()));
            }
            out.push(Span::Fmt("pair", vec![Span::Text(t[i..].to_string())]));
        }
    }
    out
}

/// A table cell longer than this wraps on a phone; shorter ones stay on one line.
const LONG_CELL: usize = 32;
/// A cell longer than this keeps a readable width (12ch) in a crowded table.
const WIDE_CELL: usize = 12;

/// A cell's classes: num for a column of numbers, and for a body cell its
/// size from its own length only, so the web renderer can set it while the
/// cell streams and the table never re-flows when it closes: wide (a readable
/// minimum width) and long (wraps on a phone).
fn cell_class(num: bool, body: bool, spans: &[Span]) -> &'static str {
    let mut text = String::new();
    crate::inline::plain(spans, &mut text);
    let n = if body { text.chars().count() } else { 0 };
    match (num, n) {
        (false, n) if n > LONG_CELL => " class=\"wide long\"",
        (false, n) if n > WIDE_CELL => " class=\"wide\"",
        (false, _) => "",
        (true, n) if n > LONG_CELL => " class=\"num wide long\"",
        (true, n) if n > WIDE_CELL => " class=\"num wide\"",
        (true, _) => " class=\"num\"",
    }
}

/// The width a chart is shown at, so its 12px text stays 12px.
const CONTENT_WIDTH: f64 = 700.0;
/// The narrowest a cell hands a chart or a map: Columns nested deeper than an
/// answer should go would otherwise leave them a negative width.
const MIN_CELL_WIDTH: f64 = 160.0;

/// The width each cell of a Columns row gets, from the width the row has.
fn cell_width(row: f64, per_row: usize, rich: bool) -> f64 {
    round((row - 12.0 * (per_row as f64 - 1.0)) / per_row as f64 - if rich { 32.0 } else { 0.0 }).max(MIN_CELL_WIDTH)
}

/// Every class in `html` with `ms-` in front, those that have it already
/// left as they are. Text and attribute values are escaped, so `class="` is
/// only ever an attribute.
pub fn prefix_classes(html: &str) -> String {
    const AT: &str = " class=\"";
    let mut out = String::with_capacity(html.len() + html.len() / 8);
    let mut rest = html;
    while let Some(i) = rest.find(AT) {
        out.push_str(&rest[..i + AT.len()]);
        rest = &rest[i + AT.len()..];
        let end = rest.find('"').unwrap_or(rest.len());
        for (k, name) in rest[..end].split(' ').filter(|c| !c.is_empty()).enumerate() {
            if k > 0 {
                out.push(' ');
            }
            if !name.starts_with("ms-") {
                out.push_str("ms-");
            }
            out.push_str(name);
        }
        rest = &rest[end..];
    }
    out.push_str(rest);
    out
}

pub fn render(p: &Parser) -> String {
    prefix_classes(&render_short(p))
}

fn render_short(p: &Parser) -> String {
    let mut r = R { cat: &p.cat, rc: &p.cat, nodes: &p.nodes, images: &p.images, tabs: 0, chart_width: CONTENT_WIDTH, form: 0, hidden: Vec::new() };
    r.children(0, 0)
}

/// One finished node, exactly as it appears inside the whole page: the cards
/// around it set its heading levels, the columns it sits in set its charts'
/// width, and inside a Form its Buttons submit.
pub fn render_node(p: &Parser, id: &str) -> Option<String> {
    render_node_without(p, id, &[])
}

/// A node as render_node draws it, a chart leaving out the series in `hidden`
/// (0 is the first after the label column): its axis fits the series still
/// shown and their bars share the room; the legend lists them all.
pub fn render_node_without(p: &Parser, id: &str, hidden: &[usize]) -> Option<String> {
    node_short(p, id, hidden).map(|h| prefix_classes(&h))
}

fn node_short(p: &Parser, id: &str, hidden: &[usize]) -> Option<String> {
    let i = p.nodes.iter().position(|n| n.id == id)?;
    let mut r = R { cat: &p.cat, rc: &p.cat, nodes: &p.nodes, images: &p.images, tabs: 0, chart_width: CONTENT_WIDTH, form: 0, hidden: hidden.to_vec() };
    let mut chain = Vec::new();
    let mut a = i;
    while a != 0 {
        a = p.nodes[a].parent;
        chain.push(a);
    }
    let mut depth = 0;
    for &anc in chain.iter().rev() {
        let n = &p.nodes[anc];
        if !n.component {
            continue;
        }
        match n.ty.as_str() {
            "Card" => depth += 1,
            "Form" => r.form += 1,
            "Columns" => {
                let kids = n.children.clone();
                let (mut per_row, rich) = r.layout(&kids);
                // Still streaming, a row whose first cell is a chart or other rich
                // component is drawn two across, as the SDKs lay it out until it
                // closes (most such rows end with two), so a chart in it can grow
                // as its rows arrive instead of waiting for the whole row.
                if !n.closed && per_row == 1 && rich && kids.iter().all(|&c| r.max_table_cols(c) < 4) {
                    per_row = 2;
                }
                if per_row > 1 {
                    r.chart_width = cell_width(r.chart_width, per_row, rich);
                }
            }
            _ => {
                // Components with no renderer show their content one level in.
                if r.cat.component(&n.ty).is_some() && !matches!(n.ty.as_str(), "Tabs" | "Tab" | "Details" | "Steps" | "Step" | "Callout") && n.ty != "group" {
                    let listed = n.attrs.iter().any(|(_, v)| v.as_ref().map_or(false, |v| !v.trim().is_empty()));
                    if listed && !KNOWN.contains(&n.ty.as_str()) {
                        depth += 1;
                    }
                }
            }
        }
    }
    let n = &p.nodes[i];
    // A component still streaming is drawn from the lines complete so far:
    // the half-written last row of a timeline, a table or a list would show
    // its first cell in the wrong column until the line ended. The SDKs draw
    // it as it grows; a chart (the web SDK morphs each drawing into the next
    // as rows arrive) or a map is drawn from its rows, and with no row yet,
    // nothing.
    if n.component && !n.closed && n.data.is_none() {
        let done = &n.raw[..n.raw.rfind('\n').map_or(0, |k| k + 1)];
        // Drawn from table data (a chart, a map's places): its complete rows.
        if n.ty == "Chart" || n.ty == "Map" {
            let mut m = n.clone();
            m.data = crate::validate::table_data(done).filter(|d| matches!(d, Data::Table { rows, .. } if !rows.is_empty()));
            if m.data.is_none() {
                return Some(String::new());
            }
            return Some(r.component(&m, &[], depth));
        }
        if done.len() < n.raw.len() {
            let mut m = n.clone();
            m.raw = done.to_string();
            let kids = n.children.clone();
            return Some(r.component(&m, &kids, depth));
        }
    }
    Some(r.node(i, depth))
}

/// Components the HTML renderer draws itself (anything else falls back).
const KNOWN: &[&str] = &[
    "Card", "Columns", "Tabs", "Tab", "Details", "Steps", "Step", "Callout", "Stat", "Badge", "Progress", "Avatar", "Gallery", "Chart", "FollowUps", "Form", "Map", "Camera", "Scan",
    "Location", "File", "Input", "TextArea", "Select", "Date", "Slider", "Checkboxes", "Radio", "Switch", "Button",
];

struct R<'a> {
    cat: &'a Catalog,
    rc: &'a Arc<Catalog>,
    nodes: &'a [Node],
    /// Where pictures may load from.
    images: &'a ImagePolicy,
    tabs: usize,
    chart_width: f64,
    /// Forms the node being rendered is inside.
    form: usize,
    /// Series a chart leaves out (its legend still lists them): the reader switched them off.
    hidden: Vec<usize>,
}

fn tone<'a>(v: Option<&'a str>, allowed: &[&'a str], fallback: &'a str) -> String {
    // Synonyms were resolved when the attributes were read (validate::clean_attrs).
    let t = v.unwrap_or("").to_ascii_lowercase();
    if allowed.contains(&t.as_str()) {
        t
    } else {
        fallback.to_string()
    }
}

fn list(v: Option<&str>) -> Vec<String> {
    v.unwrap_or("").split('|').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()
}

fn slug(s: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for c in s.to_ascii_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            if dash && !out.is_empty() {
                out.push('-');
            }
            dash = false;
            out.push(c);
        } else {
            dash = true;
        }
    }
    out
}

fn f1(n: f64) -> String {
    to_fixed(n, 1)
}

fn cls(k: usize) -> String {
    format!("s{}", (k % 8) + 1)
}

impl R<'_> {
    fn n(&self, i: usize) -> &Node {
        &self.nodes[i]
    }

    // ---------- inline ----------

    /// An image, with its credit under it. One that may not load (not found,
    /// or from a host the app didn't allow) shows its description in a tile.
    fn image(&mut self, src: &str, alt: &str, credit: &[Span]) -> String {
        let img = picture(self.images, src, alt);
        if credit.is_empty() || src == "find" || !self.images.allows(src) {
            return img;
        }
        let c = self.credit(credit);
        format!("<span class=\"pic\">{img}{c}</span>")
    }

    /// An image's credit line (empty when it has none).
    fn credit(&mut self, credit: &[Span]) -> String {
        if credit.is_empty() {
            return String::new();
        }
        format!("<small class=\"credit\">{}</small>", self.spans(credit))
    }

    fn spans(&mut self, spans: &[Span]) -> String {
        let mut o = String::new();
        for s in spans {
            match s {
                Span::Text(t) => o.push_str(&keep_ids(t)),
                Span::Code(t) => {
                    o.push_str("<code>");
                    o.push_str(&esc(t));
                    o.push_str("</code>");
                }
                Span::Fmt("pair", c) => {
                    let inner = self.spans(c);
                    o.push_str(&format!("<span class=\"pair\">{inner}</span>"));
                }
                Span::Fmt(f, c) => {
                    o.push('<');
                    o.push_str(f);
                    o.push('>');
                    // A bold label holds its last two words together, as headings do.
                    let c = if *f == "strong" { pair_spans(c) } else { c.clone() };
                    let inner = self.spans(&c);
                    o.push_str(&inner);
                    o.push_str("</");
                    o.push_str(f);
                    o.push('>');
                }
                Span::Link(h, c) => {
                    let inner = self.spans(c);
                    o.push_str(&format!("<a href=\"{}\">{}</a>", esc(h), inner));
                }
                Span::Img { src, alt, credit } => {
                    let img = self.image(src, alt, credit);
                    o.push_str(&img);
                }
                Span::Br => o.push_str("<br>"),
                Span::El { ty, attrs, children } => {
                    let node = Node {
                        id: String::new(),
                        ty: ty.clone(),
                        written: ty.clone(),
                        attrs: attrs.clone(),
                        children: Vec::new(),
                        spans: children.clone(),
                        data: None,
                        raw: String::new(),
                        line: 0,
                        parent: 0,
                        closed: true,
                        component: true,
                        unknown: self.cat.component(ty).is_none(),
                        run: false,
                        sep: false,
                        max_cols: 0,
                        lines: 0,
                    };
                    let html = self.component(&node, &[], 0);
                    o.push_str(&html);
                }
            }
        }
        o
    }

    // ---------- children and blocks ----------

    fn children(&mut self, i: usize, depth: usize) -> String {
        let kids = self.n(i).children.clone();
        self.list_of(&kids, depth)
    }

    fn list_of(&mut self, kids: &[usize], depth: usize) -> String {
        let mut out: Vec<String> = Vec::new();
        let mut buttons: Vec<String> = Vec::new();
        for &c in kids {
            if self.n(c).component && matches!(self.n(c).ty.as_str(), "Button" | "AddToCalendar" | "Share") {
                let b = self.node(c, depth);
                buttons.push(b);
                continue;
            }
            if !buttons.is_empty() {
                out.push(format!("<div class=\"actions\">{}</div>", buttons.join("")));
                buttons.clear();
            }
            let h = self.node(c, depth);
            out.push(h);
        }
        if !buttons.is_empty() {
            out.push(format!("<div class=\"actions\">{}</div>", buttons.join("")));
        }
        out.join("\n")
    }

    fn node(&mut self, i: usize, depth: usize) -> String {
        let n = &self.nodes[i];
        if !n.component {
            return self.block(i);
        }
        if n.ty == "group" {
            return self.children(i, depth);
        }
        let kids = n.children.clone();
        self.component(n, &kids, depth)
    }

    fn block(&mut self, i: usize) -> String {
        let n = &self.nodes[i];
        match n.ty.as_str() {
            "p" => format!("<p>{}</p>", self.spans(&n.spans)),
            "h" => {
                // The core already set the level to show (cards around it, no skipped levels).
                let level = n.attr("level").and_then(|l| l.parse::<usize>().ok()).unwrap_or(1).clamp(1, 6);
                let spans = pair_spans(&n.spans);
                format!("<h{level}>{}</h{level}>", self.spans(&spans))
            }
            "hr" => "<hr>".to_string(),
            "code" => {
                let mut t = String::new();
                crate::inline::plain(&n.spans, &mut t);
                format!("<pre><code>{}</code></pre>", esc(&t))
            }
            "quote" => format!("<blockquote>{}</blockquote>", self.spans(&n.spans)),
            "ul" | "ol" => {
                let mut items = String::new();
                for &li in &n.children.clone() {
                    let l = &self.nodes[li];
                    let class = match l.attr("task") {
                        Some("open") => " class=\"task\"",
                        Some("done") => " class=\"task done\"",
                        _ => "",
                    };
                    let inner = self.spans(&l.spans);
                    items.push_str(&format!("<li{class}>{inner}</li>"));
                }
                format!("<{0}>{1}</{0}>", n.ty, items)
            }
            "li" => {
                let class = match n.attr("task") {
                    Some("open") => " class=\"task\"",
                    Some("done") => " class=\"task done\"",
                    _ => "",
                };
                format!("<li{class}>{}</li>", self.spans(&n.spans))
            }
            // A cell alone, in its column's alignment so far (the parser keeps
            // it as rows arrive; a header takes it when the table closes).
            "cell" => {
                let row = &self.nodes[n.parent];
                let head = row.has("head");
                let tag = if head { "th" } else { "td" };
                let num = !head
                    && match &self.nodes[row.parent].data {
                        Some(Data::Align(a)) => row.children.iter().position(|&c| c == i).and_then(|k| a.get(k).copied()).unwrap_or(false),
                        _ => false,
                    };
                format!("<{tag}{}>{}</{tag}>", cell_class(num, !head, &n.spans), self.spans(&n.spans))
            }
            "table" => {
                let align = match &n.data {
                    Some(Data::Align(a)) => a.clone(),
                    _ => Vec::new(),
                };
                let num = |k: usize| align.get(k).copied().unwrap_or(false);
                let rows = n.children.clone();
                let mut head = String::new();
                let mut body = String::new();
                for (ri, &r) in rows.iter().enumerate() {
                    let cells_ = self.nodes[r].children.clone();
                    let mut tr = String::from("<tr>");
                    for (k, &cell) in cells_.iter().enumerate() {
                        let inner = self.spans(&self.nodes[cell].spans);
                        let tag = if ri == 0 { "th" } else { "td" };
                        // On a phone short cells keep to one line; long ones wrap (theme.css).
                        let class = cell_class(num(k), ri > 0, &self.nodes[cell].spans);
                        tr.push_str(&format!("<{tag}{class}>{inner}</{tag}>"));
                    }
                    tr.push_str("</tr>");
                    if ri == 0 {
                        head = tr;
                    } else {
                        body.push_str(&tr);
                    }
                }
                format!("<div class=\"table\" tabindex=\"0\"><table><thead>{head}</thead><tbody>{body}</tbody></table></div>")
            }
            _ => String::new(),
        }
    }

    // ---------- layout helpers ----------

    /// Widest table (rows counted in cells) inside a node, including chart tables.
    fn max_table_cols(&self, i: usize) -> usize {
        let n = self.n(i);
        let mut m = n.max_cols;
        for l in n.raw.lines() {
            if l.trim().starts_with('|') {
                m = m.max(cells(l).len());
            }
        }
        for &c in &n.children {
            m = m.max(self.max_table_cols(c));
        }
        m
    }

    fn longest_value(&self, i: usize) -> usize {
        let n = self.n(i);
        let own = if n.component && n.ty == "Stat" { js_len(n.attr("value").unwrap_or("")) } else { 0 };
        n.children.iter().map(|&c| self.longest_value(c)).fold(own, usize::max)
    }

    fn text_of(&self, n: &Node) -> String {
        n.raw.clone()
    }

    // ---------- components ----------

    fn component(&mut self, n: &Node, kids: &[usize], depth: usize) -> String {
        let a = |k: &str| n.attr(k);
        let s = |k: &str| match n.attrs.iter().find(|(key, _)| key == k) {
            Some((_, Some(v))) => esc(v),
            _ => String::new(),
        };
        let truthy = |k: &str| n.attrs.iter().any(|(key, v)| key == k && v.as_deref().map_or(true, |x| !x.is_empty()));
        // Subtitles carry IDs, regions and times: the text rules apply.
        let sub = || keep_ids(n.attr("subtitle").unwrap_or(""));
        let name = match n.attr("name") {
            Some(v) => v.to_string(),
            None => slug(n.attr("label").unwrap_or("field")),
        };
        let field = |label: &str, control: String, hint: Option<&str>| {
            format!(
                "<label class=\"field\"><span>{}</span>{}{}</label>",
                esc(label),
                control,
                match hint {
                    Some(h) if !h.is_empty() => format!("<small>{}</small>", esc(h)),
                    _ => String::new(),
                }
            )
        };
        let req = if truthy("required") { " required" } else { "" };
        match n.ty.as_str() {
            "Card" => {
                let h = if depth > 0 { 3 } else { 2 };
                let header = if truthy("title") || truthy("subtitle") {
                    format!(
                        "<header>{}{}</header>",
                        if truthy("title") { format!("<h{h}>{}{}</h{h}>", icon_svg(n), title(a("title").unwrap())) } else { String::new() },
                        if truthy("subtitle") { format!("<p>{}</p>", sub()) } else { String::new() }
                    )
                } else {
                    String::new()
                };
                let inner = self.list_of(kids, depth + 1);
                format!("<section class=\"{}\">{header}{inner}</section>", if depth > 0 { "group" } else { "card" })
            }
            "Columns" => self.columns(kids, depth),
            "Tabs" => {
                self.tabs += 1;
                let id = format!("t{}", self.tabs);
                let tabs: Vec<usize> = kids.iter().copied().filter(|&c| self.n(c).component && self.n(c).ty == "Tab").collect();
                // The radios stay siblings of the panels (that's what switches them
                // without script); the labels sit in a row of their own that
                // scrolls sideways when the tabs don't fit.
                let mut radios = String::new();
                let mut labels = String::new();
                for (k, &t) in tabs.iter().enumerate() {
                    let label = match self.n(t).attr("title") {
                        Some(x) => title(x),
                        None => format!("Tab {}", k + 1),
                    };
                    radios.push_str(&format!("<input type=\"radio\" name=\"{id}\" id=\"{id}-{k}\"{}>", if k > 0 { "" } else { " checked" }));
                    labels.push_str(&format!("<label for=\"{id}-{k}\">{label}</label>"));
                }
                let mut panels = String::new();
                for &t in &tabs {
                    let inner = self.children(t, depth);
                    panels.push_str(&format!("<div>{inner}</div>"));
                }
                format!("<div class=\"tabs\">{radios}<div class=\"tablist\">{labels}</div><div class=\"panels\">{panels}</div></div>")
            }
            "Tab" => self.list_of(kids, depth),
            "Details" => {
                let inner = self.list_of(kids, depth);
                format!("<details{}><summary>{}</summary>{inner}</details>", if n.flag("open") { " open" } else { "" }, title(a("title").unwrap_or("")))
            }
            "Steps" => {
                let mut o = String::new();
                for &c in kids {
                    if self.n(c).component {
                        let h = self.node(c, depth);
                        o.push_str(&h);
                    }
                }
                format!("<ol class=\"steps\">{o}</ol>")
            }
            "Step" => {
                let inner = self.list_of(kids, depth);
                format!(
                    "<li class=\"{}\"><strong>{}</strong>{}{inner}</li>",
                    tone(a("status"), &["done", "current", "todo"], "todo"),
                    title(a("title").unwrap_or("")),
                    if truthy("subtitle") { format!("<small>{}</small>", sub()) } else { String::new() }
                )
            }
            "Callout" => {
                let inner = self.list_of(kids, depth);
                format!(
                    "<aside class=\"callout {}\">{}{inner}</aside>",
                    tone(a("tone"), &["neutral", "info", "success", "warning", "danger"], "info"),
                    if truthy("title") { format!("<strong>{}</strong>", title(a("title").unwrap())) } else { String::new() }
                )
            }
            "Stat" => {
                let ch = a("change").unwrap_or("").to_string();
                let t = tone(a("tone"), &["info", "success", "warning", "danger"], "");
                // Its tone (the color) and its direction (the arrow) are separate: a rise can be bad news.
                let sign = if ch.starts_with(['-', '\u{2212}', '\u{2013}']) {
                    "down"
                } else if ch.starts_with(['+', '\u{2191}', '\u{25b2}']) || (!ch.is_empty() && t.is_empty()) {
                    "up"
                } else {
                    ""
                };
                let dir = [t.as_str(), sign].iter().filter(|x| !x.is_empty()).cloned().collect::<Vec<_>>().join(" ");
                // The change's number (with its unit) is the pill; what it's compared with follows as text.
                let (pill, rest) = change_parts(&ch);
                let change = match (pill.is_empty(), rest.is_empty()) {
                    (true, true) => String::new(),
                    (false, true) => format!("<b>{}</b>", keep_ids(pill)),
                    (true, false) => keep_ids(rest),
                    (false, false) => format!("<b>{}</b>{}", keep_ids(pill), keep_ids(rest)),
                };
                format!(
                    "<div class=\"stat{}\"><span class=\"label\">{}{}</span><span class=\"value\">{}</span><span class=\"change {dir}\">{change}</span><span class=\"note\">{}</span></div>",
                    if !t.is_empty() && ch.is_empty() { format!(" {t}") } else { String::new() },
                    icon_svg(n),
                    s("label"),
                    s("value"),
                    keep_ids(a("note").unwrap_or(""))
                )
            }
            "Badge" => {
                let t = tone(a("tone"), &["neutral", "info", "success", "warning", "danger"], "neutral");
                format!("<span class=\"badge {t}\">{}</span>", self.spans(&n.spans))
            }
            "Progress" => {
                let max = match a("max") {
                    Some(m) => number(m),
                    None => 100.0,
                };
                let max = if max == 0.0 || max.is_nan() { 100.0 } else { max };
                let value = match a("value") {
                    Some(v) => number(v),
                    None => f64::NAN,
                };
                let value = if value.is_nan() || value == 0.0 { 0.0 } else { value };
                let pct = fixed_num((value / max) * 100.0, if value / max < 0.1 { 1 } else { 0 });
                format!(
                    "<div class=\"progress{}\">{}<progress value=\"{}\" max=\"{}\"></progress><small>{pct}%</small></div>",
                    match tone(a("tone"), &["info", "success", "warning", "danger"], "").as_str() {
                        "" => String::new(),
                        t => format!(" {t}"),
                    },
                    if truthy("label") { format!("<span>{}</span>", s("label")) } else { String::new() },
                    num_str(value),
                    num_str(max)
                )
            }
            "Avatar" => {
                let nm = a("name").unwrap_or("").to_string();
                let initials: String = nm.split_whitespace().filter_map(|w| w.chars().next()).collect::<String>();
                let initials = js_slice(&initials, 2).to_ascii_uppercase();
                format!(
                    "<div class=\"avatar\">{}<div><strong>{}</strong>{}</div></div>",
                    if truthy("src") && self.images.allows(a("src").unwrap_or("")) { format!("<img src=\"{}\" alt=\"\">", s("src")) } else { format!("<span>{}</span>", esc(&initials)) },
                    esc(&nm),
                    if truthy("subtitle") { format!("<small>{}</small>", sub()) } else { String::new() }
                )
            }
            "Gallery" => {
                // One item a line: its image, then the words after it on that
                // line as its caption ("![Sword](...) **Sword** – 1,240 units").
                // Lines without an image follow the grid as text.
                let raw = self.text_of(n);
                let mut items = String::new();
                let mut text = String::new();
                for line in raw.lines().map(str::trim).filter(|l| !l.is_empty()) {
                    let spans = crate::inline::parse(line);
                    if !spans.iter().any(|s| matches!(s, Span::Img { .. })) {
                        text.push_str(line);
                        text.push('\n');
                        continue;
                    }
                    let (pics, words): (Vec<Span>, Vec<Span>) = spans.into_iter().partition(|s| matches!(s, Span::Img { .. }));
                    let caption = self.spans(&crate::inline::caption(words));
                    let last = pics.len() - 1;
                    for (k, p) in pics.iter().enumerate() {
                        let Span::Img { src, alt, credit } = p else { continue };
                        let credit = if src == "find" || !self.images.allows(src) { String::new() } else { self.credit(credit) };
                        let cap = if k == last { caption.as_str() } else { "" };
                        let cap = if cap.is_empty() { String::new() } else { format!("<span>{cap}</span>") };
                        let below = if cap.is_empty() && credit.is_empty() { String::new() } else { format!("<figcaption>{cap}{credit}</figcaption>") };
                        items.push_str(&format!("<figure>{}{below}</figure>", picture(self.images, src, alt)));
                    }
                }
                // Components written inside (people as Avatars, say) show as
                // items too, rather than vanishing.
                items.push_str(&self.list_of(kids, depth));
                let after = if text.trim().is_empty() { String::new() } else { self.markdown(&text, depth) };
                format!("<div class=\"gallery\">{items}</div>{after}")
            }
            "Chart" => match &n.data {
                // A chart drawn for a wide column, scaled down on a phone, has
                // unreadable labels; it also comes drawn for a tablet column and
                // a phone tile, and the theme shows whichever is nearest the space
                // it has (no script): over 460px, 341 to 460, 340 and under.
                Some(Data::Table { columns, rows }) if self.chart_width > 300.0 => {
                    let saved = self.chart_width;
                    let mut sizes = vec![(saved, if saved > 460.0 { "c-hi" } else { "c-hi c-mid" })];
                    if saved > 460.0 {
                        sizes.push((380.0, "c-mid"));
                    }
                    sizes.push((260.0, "c-lo"));
                    let mut o = String::from("<div class=\"chart-fit\">");
                    for (w, class) in sizes {
                        self.chart_width = w;
                        o.push_str(&format!("<div class=\"{class}\">{}</div>", self.chart(n, columns, rows)));
                    }
                    self.chart_width = saved;
                    o + &chart_table(n, columns, rows) + "</div>"
                }
                Some(Data::Table { columns, rows }) => {
                    let fig = self.chart(n, columns, rows);
                    let table = chart_table(n, columns, rows);
                    match fig.strip_suffix("</figure>") {
                        Some(f) => format!("{f}{table}</figure>"),
                        None => fig,
                    }
                }
                _ => String::new(),
            },
            "FollowUps" => {
                let raw = self.text_of(n);
                let mut o = String::new();
                for q in crate::validate::list_items(&raw) {
                    let inner = self.spans(&crate::inline::parse(q));
                    o.push_str(&format!("<a href=\"?ask={}\">{inner}</a>", encode_uri_component(q)));
                }
                format!("<nav class=\"followups\">{o}</nav>")
            }
            "Form" => {
                self.form += 1;
                let inner = self.list_of(kids, depth);
                self.form -= 1;
                format!("<form method=\"post\" enctype=\"multipart/form-data\" class=\"form\">{inner}</form>")
            }
            "Map" => match &n.data {
                Some(Data::Table { columns, rows }) => self.map(n, columns, rows),
                _ => String::new(),
            },
            "Camera" => {
                let facing = if tone(a("facing"), &["back", "front"], "back") == "front" { "user" } else { "environment" };
                field(
                    a("label").unwrap_or(""),
                    format!("<input type=\"file\" name=\"{}\" accept=\"image/*\" capture=\"{facing}\"{}{req}>", esc(&name), if n.flag("multiple") { " multiple" } else { "" }),
                    a("hint"),
                )
            }
            "Scan" => field(
                a("label").unwrap_or(""),
                format!("<input name=\"{0}\" placeholder=\"Type the code\"{req}><input type=\"file\" name=\"{0}-photo\" accept=\"image/*\" capture=\"environment\" aria-label=\"Or a photo of the code\">", esc(&name)),
                a("hint"),
            ),
            "Location" => field(a("label").unwrap_or(""), format!("<input name=\"{}\" placeholder=\"City or address\" autocomplete=\"street-address\"{req}>", esc(&name)), a("hint")),
            "File" => {
                let accept = accept_list(a("accept"));
                field(
                    a("label").unwrap_or(""),
                    format!(
                        "<input type=\"file\" name=\"{}\"{}{}{req}>",
                        esc(&name),
                        if accept.is_empty() { String::new() } else { format!(" accept=\"{}\"", esc(&accept)) },
                        if n.flag("multiple") { " multiple" } else { "" }
                    ),
                    a("hint"),
                )
            }
            "Input" => field(
                a("label").unwrap_or(""),
                format!(
                    "<input name=\"{}\" type=\"{}\"{}{}{}{req}>",
                    esc(&name),
                    tone(a("type"), &["text", "email", "number", "password", "url", "tel", "search", "date", "time", "datetime-local"], "text"),
                    format!(
                        "{}{}{}",
                        if n.has("step") { format!(" step=\"{}\"", s("step")) } else { String::new() },
                        if truthy("min") { format!(" min=\"{}\"", s("min")) } else { String::new() },
                        if truthy("max") { format!(" max=\"{}\"", s("max")) } else { String::new() }
                    ),
                    if truthy("placeholder") { format!(" placeholder=\"{}\"", s("placeholder")) } else { String::new() },
                    if truthy("value") { format!(" value=\"{}\"", s("value")) } else { String::new() }
                ),
                a("hint"),
            ),
            "TextArea" => {
                let rows = a("rows").map(number).filter(|r| !r.is_nan() && *r != 0.0).unwrap_or(3.0);
                field(
                    a("label").unwrap_or(""),
                    format!(
                        "<textarea name=\"{}\" rows=\"{}\"{}{req}>{}</textarea>",
                        esc(&name),
                        num_str(rows),
                        if truthy("placeholder") { format!(" placeholder=\"{}\"", s("placeholder")) } else { String::new() },
                        s("value")
                    ),
                    a("hint"),
                )
            }
            "Select" => {
                let value = a("value").map(|v| v.to_string());
                let mut opts = String::new();
                if truthy("placeholder") {
                    opts.push_str(&format!("<option value=\"\">{}</option>", s("placeholder")));
                }
                for o in list(a("options")) {
                    opts.push_str(&format!("<option{}>{}</option>", if value.as_deref() == Some(o.as_str()) { " selected" } else { "" }, esc(&o)));
                }
                field(a("label").unwrap_or(""), format!("<select name=\"{}\"{req}>{opts}</select>", esc(&name)), a("hint"))
            }
            "Date" => field(
                a("label").unwrap_or(""),
                format!("<input type=\"date\" name=\"{}\"{}{req}>", esc(&name), if truthy("value") { format!(" value=\"{}\"", s("value")) } else { String::new() }),
                a("hint"),
            ),
            "Slider" => {
                // With a unit, its numbers show the way a Result's do ($400,000, 6.5%);
                // the SDKs show each new value the same way from data-unit and data-places.
                let unit = a("unit").map(str::trim).filter(|u| !u.is_empty());
                let places = crate::interactive::places(n);
                let shown = |v: String| match unit {
                    Some(u) => {
                        let x = number(&v);
                        if x.is_finite() { crate::html::packs::slider_text(x, u, places) } else { v }
                    }
                    None => v,
                };
                field(
                a("label").unwrap_or(""),
                format!(
                    "<input type=\"range\" class=\"fill{}\" name=\"{}\" min=\"{}\" max=\"{}\"{}{}{}><span class=\"range\"><small>{}</small><output>{}</output><small>{}</small></span>",
                    // How far the accent fills the track, to the thumb, in whole percent by
                    // class (fill0 to fill100), not a style attribute; the SDK keeps it as
                    // the reader drags.
                    {
                        let (lo, hi) = (number(a("min").unwrap_or("0")), number(a("max").unwrap_or("100")));
                        let v = a("value").map(number).filter(|v| v.is_finite()).unwrap_or((lo + hi) / 2.0);
                        round(if lo.is_finite() && hi.is_finite() && hi > lo { ((v - lo) / (hi - lo) * 100.0).clamp(0.0, 100.0) } else { 50.0 }) as u32
                    },
                    esc(&name),
                    s("min"),
                    s("max"),
                    if truthy("step") { format!(" step=\"{}\"", s("step")) } else { String::new() },
                    if n.has("value") { format!(" value=\"{}\"", s("value")) } else { String::new() },
                    unit.map(|u| format!(" data-unit=\"{}\" data-places=\"{places}\"", esc(u))).unwrap_or_default(),
                    esc(&shown(a("min").unwrap_or("").to_string())),
                    // Where it starts (the browser's own start is halfway).
                    esc(&shown(n.attr("value").map(str::to_string).unwrap_or_else(|| {
                        let (lo, hi) = (number(a("min").unwrap_or("0")), number(a("max").unwrap_or("100")));
                        num_str(if lo.is_finite() && hi.is_finite() { lo + (hi - lo) / 2.0 } else { 0.0 })
                    }))),
                    esc(&shown(a("max").unwrap_or("").to_string()))
                ),
                None,
            )
            }
            "Checkboxes" | "Radio" => {
                let radio = n.ty == "Radio";
                let value = a("value").map(|v| v.to_string());
                let chosen = list(a("value"));
                let mut o = format!("<fieldset class=\"field\"><legend>{}</legend>", s("label"));
                for opt in list(a("options")) {
                    let checked = if radio { value.as_deref() == Some(opt.as_str()) } else { chosen.contains(&opt) };
                    o.push_str(&format!(
                        "<label class=\"choice\"><input type=\"{}\" name=\"{}\" value=\"{}\"{}{}>{}</label>",
                        if radio { "radio" } else { "checkbox" },
                        esc(&name),
                        esc(&opt),
                        if checked { " checked" } else { "" },
                        if radio && n.flag("required") { " required" } else { "" },
                        esc(&opt)
                    ));
                }
                if truthy("hint") {
                    o.push_str(&format!("<small>{}</small>", s("hint")));
                }
                o.push_str("</fieldset>");
                o
            }
            "Switch" => format!(
                "<label class=\"switch\"><input type=\"checkbox\" role=\"switch\" name=\"{}\"{}><span>{}</span></label>",
                esc(&name),
                if n.flag("value") { " checked" } else { "" },
                s("label")
            ),
            "Button" => {
                let size = tone(a("size"), &["small", "large"], "");
                let variant = format!("{}{}", tone(a("variant"), &["primary", "secondary", "tertiary", "danger"], "primary"), if size.is_empty() { String::new() } else { format!(" {size}") });
                let label = format!("{}{}", icon_svg(n), self.spans(&n.spans));
                if n.flag("disabled") && n.has("disabled") {
                    format!("<button class=\"btn {variant}\" disabled>{label}</button>")
                } else if truthy("href") {
                    format!("<a class=\"btn {variant}\" href=\"{}\">{label}</a>", s("href"))
                } else if truthy("ask") || self.form == 0 {
                    // Outside a form a Button asks: its ask text, or its label.
                    let ask = match a("ask") {
                        Some(q) if !q.is_empty() => q.to_string(),
                        _ => {
                            let mut t = String::new();
                            crate::inline::plain(&n.spans, &mut t);
                            t.replace('\u{a0}', " ")
                        }
                    };
                    format!("<a class=\"btn {variant}\" href=\"?ask={}\">{label}</a>", encode_uri_component(&ask))
                } else {
                    format!("<button class=\"btn {variant}\">{label}</button>")
                }
            }
            t if packs::PACK.contains(&t) => self.pack(n, kids, depth).unwrap_or_default(),
            _ => {
                // No renderer here: the attributes as a list, then the content: a text
                // component's own words, a list's, table's or pictures' Markdown (kept
                // as written, not as nodes) or its code, then what's inside it (its buttons).
                let listed: Vec<(String, String)> = n.attrs.iter().filter_map(|(k, v)| v.as_ref().filter(|v| !v.trim().is_empty()).map(|v| (k.clone(), v.clone()))).collect();
                let mut own = if n.spans.is_empty() { String::new() } else { format!("<p>{}</p>", self.spans(&n.spans)) };
                match self.cat.component(&n.ty).map(|c| &c.content) {
                    Some(Content::List | Content::Table | Content::Images) if !n.raw.trim().is_empty() => {
                        let raw = n.raw.clone();
                        own.push_str(&self.markdown(&raw, depth + 1));
                    }
                    Some(Content::Code) if !n.raw.trim().is_empty() => own.push_str(&format!("<pre><code>{}</code></pre>", esc(n.raw.trim_end_matches('\n')))),
                    _ => {}
                }
                if self.cat.component(&n.ty).is_some() && !n.unknown && !listed.is_empty() {
                    let mut facts = String::from("<dl class=\"facts\">");
                    for (k, v) in &listed {
                        facts.push_str(&format!("<dt>{}</dt><dd>{}</dd>", esc(&split_camel(k)), esc(v)));
                    }
                    facts.push_str("</dl>");
                    let inner = self.list_of(kids, depth + 1);
                    format!("<section class=\"group\">{facts}{own}{inner}</section>")
                } else {
                    format!("{own}{}", self.list_of(kids, depth))
                }
            }
        }
    }

    /// Markdown text (a Gallery's content) through the same block reader.
    fn markdown(&mut self, text: &str, depth: usize) -> String {
        let mut p = Parser::shared(self.rc.clone());
        p.push(text);
        p.finish(false);
        let mut r = R { cat: self.cat, rc: self.rc, nodes: &p.nodes, images: self.images, tabs: self.tabs, chart_width: self.chart_width, form: self.form, hidden: Vec::new() };
        let kids = p.nodes[0].children.clone();
        let html = r.list_of(&kids, depth);
        self.tabs = r.tabs;
        html
    }

    fn columns(&mut self, kids: &[usize], depth: usize) -> String {
        let items: Vec<usize> = kids.to_vec();
        if !items.is_empty() && items.iter().all(|&c| self.n(c).component && self.n(c).ty == "Button" && !self.n(c).run) {
            let mut o = String::new();
            for &c in &items {
                let h = self.node(c, depth);
                o.push_str(&h);
            }
            return format!("<div class=\"actions\">{o}</div>");
        }
        let is_text = |n: &Node| n.run;
        let all_stats = items.iter().all(|&c| !is_text(self.n(c)) && self.n(c).ty == "Stat");
        // The core's plan (crate::layout): the most cells a row holds and how
        // narrow a cell may get; the theme's flex rows do the rest at any width.
        let plan = crate::layout::columns(self.nodes, &items);
        let per_row = plan.per;
        let (_, rich) = self.layout(&items);
        let saved = self.chart_width;
        if per_row > 1 {
            self.chart_width = cell_width(saved, per_row, rich);
        }
        let field = items.iter().any(|&c| !is_text(self.n(c)) && ["Input", "Select", "Date", "TextArea"].contains(&self.n(c).written.as_str()));
        let longest = items.iter().map(|&c| self.longest_value(c)).max().unwrap_or(0);
        let label2 = all_stats && {
            let tile = (720.0 - (per_row as f64 - 1.0) * 12.0) / per_row as f64 - 32.0;
            items.iter().any(|&c| js_len(self.n(c).attr("label").unwrap_or("")) as f64 * 6.6 > tile)
        };
        let mut classes = vec!["cols".to_string(), format!("n{per_row}")];
        if plan.min > 0 {
            classes.push(format!("m{}", plan.min));
        }
        if rich {
            classes.push("rich".into());
        }
        if field {
            classes.push("with-field".into());
        }
        if label2 {
            classes.push("label2".into());
        }
        let v = if longest > 16 {
            "v17"
        } else if longest > 13 {
            "v14"
        } else if longest > 11 {
            "v12"
        } else {
            ""
        };
        if !v.is_empty() {
            classes.push(v.into());
        }
        let mut cells_html = String::new();
        for &c in &items {
            let inner = self.node(c, depth);
            cells_html.push_str(&format!("<div class=\"cell\">{inner}</div>"));
        }
        self.chart_width = saved;
        format!("<div class=\"{}\">{cells_html}</div>", classes.join(" "))
    }

    /// How many cells a row of these Columns items holds, and whether they're
    /// rich (anything but small tiles).
    fn layout(&self, items: &[usize]) -> (usize, bool) {
        let k = items.len();
        let all_stats = items.iter().all(|&c| !self.n(c).run && self.n(c).ty == "Stat");
        let rich = items.iter().any(|&c| self.n(c).run || !["Stat", "Badge", "Progress", "Avatar", "Button"].contains(&self.n(c).written.as_str()));
        let wide = items.iter().any(|&c| self.max_table_cols(c) >= 4);
        let per_row = if wide {
            1
        } else if k <= 4 {
            k
        } else if k == 5 && all_stats {
            5
        } else {
            k.div_ceil(k.div_ceil(4))
        };
        (per_row.max(1), rich)
    }

    // ---------- charts ----------

    fn chart(&mut self, n: &Node, head: &[String], data: &[Vec<String>]) -> String {
        let labels: Vec<String> = data.iter().map(|r| r.first().cloned().unwrap_or_default()).collect();
        let series: Vec<(String, Vec<f64>)> =
            head.iter().skip(1).enumerate().map(|(k, name)| (name.clone(), data.iter().map(|r| chart_num(r.get(k + 1).map(|s| s.as_str()).unwrap_or(""))).collect())).collect();
        let ty = n.attr("type").unwrap_or("bar").to_ascii_lowercase();
        let round_ = ty == "pie" || ty == "donut";
        let axis = match n.attr("y") {
            Some(y) if !y.is_empty() && !round_ => format!("<span class=\"axis\">{}</span>", esc(y)),
            _ => String::new(),
        };
        let has_title = n.attr("title").map_or(false, |t| !t.is_empty());
        let caption = if has_title || !axis.is_empty() { format!("<figcaption><span>{}</span>{axis}</figcaption>", title(n.attr("title").unwrap_or(""))) } else { String::new() };
        let vals: Vec<f64> = if round_ { series.first().map(|s| s.1.iter().map(|&v| if v.is_finite() && v > 0.0 { v } else { 0.0 }).collect()).unwrap_or_default() } else { Vec::new() };
        let total = {
            let t: f64 = vals.iter().sum();
            if t == 0.0 {
                1.0
            } else {
                t
            }
        };
        let side = round_ && self.chart_width >= 480.0;
        let legend_names: Vec<String> = if round_ {
            labels.clone()
        } else if series.len() > 1 {
            series.iter().map(|s| s.0.clone()).collect()
        } else {
            Vec::new()
        };
        let legend = if legend_names.is_empty() {
            String::new()
        } else {
            let mut o = String::from("<ul class=\"legend\">");
            for (k, name) in legend_names.iter().enumerate() {
                let share = if round_ {
                    let p = vals.get(k).copied().unwrap_or(f64::NAN) / total * 100.0;
                    format!("<span class=\"v\">{}%</span>", if p > 0.0 && p < 1.0 { "<1".to_string() } else { num_str(round(p)) })
                } else {
                    String::new()
                };
                o.push_str(&format!("<li><i class=\"{}\"></i>{}{share}</li>", cls(k), esc(name)));
            }
            o.push_str("</ul>");
            o
        };
        let w = if side { 240.0 } else { self.chart_width };
        let spark = !round_ && ty != "radar" && ty != "horizontal" && w < 170.0;
        let h = if side {
            240.0
        } else if round_ || ty == "radar" {
            round(w * 0.45) + 40.0
        } else if spark {
            round(w * 0.42)
        } else if ty == "horizontal" {
            // A row a bar, each tall enough for its label (two lines when names
            // are longer than the label column holds), however many there are.
            let longest = data.iter().map(|r| r.first().map(|x| js_len(x)).unwrap_or(0)).max().unwrap_or(0) as f64;
            let fit = ((w * 0.5).min(180.0) - 8.0) / 7.4;
            let row_h = if longest > fit { 34.0 } else { 22.0 };
            (round(w * 0.36) + 24.0).max(8.0 + 24.0 + data.len() as f64 * row_h)
        } else {
            round(w * 0.36) + 24.0
        };
        let pi = core::f64::consts::PI;
        let mut svg = String::new();
        // The plot's scale, for the web SDK's hover and tap (tooltips, crosshair).
        let mut scale = String::new();
        if round_ {
            let r = w.min(h) / 2.0 - 8.0;
            let (cx, cy) = (w / 2.0, h / 2.0);
            let ri = if ty == "donut" { r * 0.6 } else { 0.0 };
            let mut a0 = -pi / 2.0;
            let p = |rad: f64, ang: f64| format!("{},{}", f1(cx + rad * cos(ang)), f1(cy + rad * sin(ang)));
            for (k, v) in vals.iter().enumerate() {
                let a1 = a0 + (2.0 * pi * v) / total;
                let large = if a1 - a0 > pi { 1 } else { 0 };
                let d = if ri != 0.0 {
                    format!("M{}A{},{} 0 {large} 1 {}L{}A{},{} 0 {large} 0 {}Z", p(r, a0), num_str(r), num_str(r), p(r, a1), p(ri, a1), num_str(ri), num_str(ri), p(ri, a0))
                } else {
                    format!("M{},{}L{}A{},{} 0 {large} 1 {}Z", num_str(cx), num_str(cy), p(r, a0), num_str(r), num_str(r), p(r, a1))
                };
                a0 = a1;
                svg.push_str(&format!("<path class=\"slice {}\" data-i=\"{k}\" d=\"{d}\"/>", cls(k)));
            }
        } else if ty == "radar" {
            let (cx, cy) = (w / 2.0, h / 2.0);
            let r = w.min(h) / 2.0 - 28.0;
            let nlab = if labels.is_empty() { 1.0 } else { labels.len() as f64 };
            scale = format!(" data-n=\"{}\"", labels.len());
            let max = series.iter().flat_map(|s| s.1.iter()).copied().filter(|v| v.is_finite()).fold(1.0f64, f64::max);
            let pt = |k: usize, v: f64| {
                let ang = -pi / 2.0 + (2.0 * pi * k as f64) / nlab;
                (cx + (r * v * cos(ang)) / max, cy + (r * v * sin(ang)) / max)
            };
            for f in [1.0 / 3.0, 2.0 / 3.0, 1.0] {
                let pts: Vec<String> = (0..labels.len()).map(|k| {
                    let (x, y) = pt(k, max * f);
                    format!("{},{}", f1(x), f1(y))
                }).collect();
                svg.push_str(&format!("<polygon class=\"ring\" points=\"{}\"/>", pts.join(" ")));
            }
            for (k, lab) in labels.iter().enumerate() {
                let (x, y) = pt(k, max * 1.18);
                let ys = f1(y);
                svg.push_str(&format!("<text x=\"{}\" y=\"{}\" text-anchor=\"middle\">{}</text>", f1(x), to_fixed(number(&ys) + 4.0, 1), esc(lab)));
            }
            for (j, s) in series.iter().enumerate() {
                let pts: Vec<String> = s.1.iter().enumerate().map(|(k, &v)| {
                    let (x, y) = pt(k, if v.is_finite() { v } else { 0.0 });
                    format!("{},{}", f1(x), f1(y))
                }).collect();
                svg.push_str(&format!("<polygon class=\"radar {}\" points=\"{}\"/>", cls(j), pts.join(" ")));
            }
        } else {
            let horizontal = ty == "horizontal";
            let stacked = ty == "stacked";
            // Series the reader switched off are left out; the rest keep their colors.
            let vis: Vec<usize> = (0..series.len()).filter(|j| !self.hidden.contains(j)).collect();
            let finite: Vec<f64> = vis.iter().flat_map(|&j| series[j].1.iter()).copied().filter(|v| v.is_finite()).collect();
            let sums: Vec<f64> = (0..labels.len()).map(|i| vis.iter().map(|&j| if series[j].1[i].is_finite() { series[j].1[i].max(0.0) } else { 0.0 }).sum()).collect();
            let line_like = ty == "line" || ty == "area" || ty == "scatter";
            let fmin = finite.iter().copied().fold(f64::INFINITY, f64::min);
            let mut lo = fmin.min(0.0);
            let mut hi = if stacked { sums.iter().copied().fold(0.0, f64::max) } else { finite.iter().copied().fold(0.0, f64::max) };
            if line_like && !finite.is_empty() && fmin > 0.0 && fmin > (hi - fmin) * 1.5 {
                lo = fmin;
            }
            let ticks = nice_ticks(lo, if hi == 0.0 { 1.0 } else { hi });
            lo = ticks[0];
            hi = ticks[ticks.len() - 1];
            let tl = tick_fmt(&ticks);
            // Category labels on the left: as wide as the longest one needs (12px
            // text, about 7 units a character), within a quarter to a half of the width.
            let longest = labels.iter().map(|s| js_len(s)).max().unwrap_or(0).min(24) as f64;
            // Value labels on the left of a vertical chart: room for the widest one.
            let widest_tick = tl.iter().map(|t| js_len(t)).max().unwrap_or(0) as f64;
            let l = if spark { 2.0 } else if horizontal { (longest * 7.0 + 12.0).clamp(w * 0.25, w * 0.5).min(180.0) } else { (widest_tick * 7.0 + 12.0).max(40.0) };
            // Room on the right for half of the last axis number (a scatter's last point
            // and number can sit at the very end of its axis, so it keeps a little more).
            let rr = if spark { 2.0 } else if horizontal || ty == "scatter" { 16.0 } else { 8.0 };
            let t = if spark { 4.0 } else { 8.0 };
            let b = if spark { 4.0 } else if horizontal { 24.0 } else { 28.0 };
            let pw = w - l - rr;
            let ph = h - t - b;
            let span = if hi - lo == 0.0 { 1.0 } else { hi - lo };
            scale = format!(
                " data-l=\"{}\" data-t=\"{}\" data-pw=\"{}\" data-ph=\"{}\" data-lo=\"{}\" data-hi=\"{}\" data-n=\"{}\"",
                num_str(l),
                num_str(t),
                f1(pw),
                f1(ph),
                num_str(lo),
                num_str(hi),
                labels.len()
            );
            if horizontal {
                let x = |v: f64| l + ((v - lo) / span) * pw;
                let bh = ph / (labels.len().max(1) as f64);
                for (k, &tk) in ticks.iter().enumerate() {
                    svg.push_str(&format!(
                        "<line class=\"grid\" x1=\"{0}\" x2=\"{0}\" y1=\"{1}\" y2=\"{2}\"/><text x=\"{0}\" y=\"{3}\" text-anchor=\"middle\">{4}</text>",
                        f1(x(tk)),
                        num_str(t),
                        num_str(t + ph),
                        num_str(h - 6.0),
                        tl[k]
                    ));
                }
                for (i, lab) in labels.iter().enumerate() {
                    let nv = vis.len().max(1) as f64;
                    let hh = 22f64.min((bh * 0.66) / nv);
                    let top = t + i as f64 * bh + (bh - hh * nv) / 2.0;
                    for (pos, &j) in vis.iter().enumerate() {
                        let s = &series[j];
                        let v = if s.1[i].is_finite() { s.1[i] } else { 0.0 };
                        svg.push_str(&format!(
                            "<rect class=\"{}\" data-i=\"{i}\" x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"2\"/>",
                            cls(j),
                            f1(x(v.min(0.0))),
                            f1(top + pos as f64 * hh),
                            f1((x(v) - x(0.0)).abs()),
                            f1(hh - 2.0)
                        ));
                    }
                    let fit = (((l - 8.0) / 7.4) as usize).max(4);
                    let cut = |s: &str| if js_len(s) > fit { format!("{}…", js_slice(s, fit - 1)) } else { String::from(s) };
                    let mid = t + i as f64 * bh + bh / 2.0;
                    // A long name takes two lines when the row has room, broken between words.
                    let two = (js_len(lab) > fit && bh >= 30.0)
                        .then(|| lab.char_indices().filter(|&(k, c)| c == ' ' && js_len(&lab[..k]) <= fit).map(|(k, _)| k).last())
                        .flatten();
                    match two {
                        Some(k) => svg.push_str(&format!(
                            "<text x=\"{0}\" y=\"{1}\" text-anchor=\"end\"><tspan x=\"{0}\">{2}</tspan><tspan x=\"{0}\" dy=\"14\">{3}</tspan></text>",
                            num_str(l - 8.0),
                            f1(mid - 3.0),
                            esc(&lab[..k]),
                            esc(&cut(&lab[k + 1..]))
                        )),
                        None => svg.push_str(&format!("<text x=\"{}\" y=\"{}\" text-anchor=\"end\">{}</text>", num_str(l - 8.0), f1(mid + 4.0), esc(&cut(lab)))),
                    }
                }
            } else {
                let y = |v: f64| t + ph - ((v - lo) / span) * ph;
                let bw = pw / (labels.len().max(1) as f64);
                let shown = axis_labels(&labels);
                // A scatter whose first column is numbers puts its points where
                // those numbers are, on an axis of its own, not one per category.
                let xs: Option<Vec<f64>> = (ty == "scatter" && labels.len() > 1).then(|| labels.iter().map(|x| chart_num(x)).collect::<Vec<f64>>()).filter(|v| v.iter().all(|x| x.is_finite()));
                let xticks = xs.as_ref().map(|v| nice_ticks(v.iter().copied().fold(f64::INFINITY, f64::min), v.iter().copied().fold(f64::NEG_INFINITY, f64::max)));
                let xpos = |v: f64| match &xticks {
                    Some(k) => l + (v - k[0]) / (k[k.len() - 1] - k[0]).max(f64::MIN_POSITIVE) * pw,
                    None => v,
                };
                if let Some(k) = &xticks {
                    scale.push_str(&format!(" data-xlo=\"{}\" data-xhi=\"{}\"", num_str(k[0]), num_str(k[k.len() - 1])));
                }
                let every = libm::ceil(labels.len() as f64 / 3f64.max(floor(pw / 70.0))).max(1.0) as usize;
                let room = 4f64.max(floor((bw * every as f64 - 10.0) / 7.0)) as usize;
                if !spark {
                    for (k, &tk) in ticks.iter().enumerate() {
                        svg.push_str(&format!(
                            "<line class=\"{}\" x1=\"{}\" x2=\"{}\" y1=\"{3}\" y2=\"{3}\"/><text x=\"{4}\" y=\"{5}\" text-anchor=\"end\">{6}</text>",
                            if tk == 0.0 { "base" } else { "grid" },
                            num_str(l),
                            num_str(w - rr),
                            f1(y(tk)),
                            num_str(l - 8.0),
                            f1(y(tk) + 4.0),
                            tl[k]
                        ));
                    }
                    if let Some(k) = &xticks {
                        for (i, tl) in tick_fmt(k).iter().enumerate() {
                            let half = js_len(tl) as f64 * 3.5 + 2.0;
                            let xx = xpos(k[i]);
                            svg.push_str(&format!(
                                "<line class=\"grid\" x1=\"{0}\" x2=\"{0}\" y1=\"{1}\" y2=\"{2}\"/><text x=\"{3}\" y=\"{4}\" text-anchor=\"middle\">{5}</text>",
                                f1(xx),
                                num_str(t),
                                num_str(t + ph),
                                f1(xx.max(half).min(w - half)),
                                num_str(h - 8.0),
                                tl
                            ));
                        }
                    }
                    for (i, lab) in shown.iter().enumerate() {
                        if xticks.is_some() || i % every != 0 {
                            continue;
                        }
                        let tt = if js_len(lab) > room { format!("{}…", js_slice(lab, room - 1)) } else { lab.clone() };
                        let half = js_len(&tt) as f64 * 3.5;
                        let xx = (l + bw * i as f64 + bw / 2.0).max(half).min(w - half);
                        svg.push_str(&format!("<text x=\"{}\" y=\"{}\" text-anchor=\"middle\">{}</text>", f1(xx), num_str(h - 8.0), esc(&tt)));
                    }
                }
                if line_like {
                    for (j, s) in series.iter().enumerate().filter(|(j, _)| !self.hidden.contains(j)) {
                        let pts: Vec<(f64, f64)> = s.1.iter().enumerate().filter(|(_, v)| v.is_finite()).map(|(i, &v)| (l + bw * i as f64 + bw / 2.0, y(v))).collect();
                        if ty == "scatter" {
                            for (i, &v) in s.1.iter().enumerate().filter(|(_, v)| v.is_finite()) {
                                let px = match &xs {
                                    Some(xs) => xpos(xs[i]),
                                    None => l + bw * i as f64 + bw / 2.0,
                                };
                                svg.push_str(&format!("<circle class=\"{}\" data-i=\"{i}\" cx=\"{}\" cy=\"{}\" r=\"4.5\"/>", cls(j), f1(px), f1(y(v))));
                            }
                            continue;
                        }
                        if pts.is_empty() {
                            continue;
                        }
                        let d = curve(&pts);
                        if ty == "area" {
                            svg.push_str(&format!(
                                "<path class=\"fill {}\" d=\"{d}L{},{}L{},{}Z\"/>",
                                cls(j),
                                f1(pts[pts.len() - 1].0),
                                f1(y(lo)),
                                f1(pts[0].0),
                                f1(y(lo))
                            ));
                        }
                        // pathLength 1: the theme draws the line in with a dash offset.
                        svg.push_str(&format!("<path class=\"line {}\" pathLength=\"1\" d=\"{d}\"/>", cls(j)));
                    }
                } else {
                    for i in 0..labels.len() {
                        let mut acc = 0.0;
                        let group = if stacked { 1.0 } else { vis.len().max(1) as f64 };
                        let wd = 36f64.min((bw * 0.64) / group);
                        let start = l + bw * i as f64 + (bw - wd * group) / 2.0;
                        for (pos, &j) in vis.iter().enumerate() {
                            let s = &series[j];
                            let v = if s.1[i].is_finite() { s.1[i] } else { 0.0 };
                            let from = if stacked { acc } else { 0.0 };
                            let to = if stacked { acc + v.max(0.0) } else { v };
                            if stacked {
                                acc += v.max(0.0);
                            }
                            let xx = if stacked { start } else { start + pos as f64 * wd };
                            svg.push_str(&format!(
                                "<rect class=\"{}\" data-i=\"{i}\" x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"2\"/>",
                                cls(j),
                                f1(xx),
                                f1(y(from.max(to))),
                                f1((wd - 2.0).max(1.0)),
                                f1((y(from) - y(to)).abs())
                            ));
                        }
                    }
                }
            }
        }
        let label = esc(match n.attr("title") {
            Some(t) => t.to_string(),
            None => format!("{ty} chart"),
        }
        .as_str());
        format!(
            "<figure class=\"chart{}\">{caption}<svg viewBox=\"0 0 {} {}\" role=\"img\" aria-label=\"{label}\" data-kind=\"{ty}\"{scale}>{svg}</svg>{legend}</figure>",
            if side { " side" } else { "" },
            num_str(w),
            num_str(h)
        )
    }

    // ---------- device: Map without JavaScript ----------

    fn map(&mut self, n: &Node, head: &[String], body: &[Vec<String>]) -> String {
        let head: Vec<String> = head.iter().map(|h| h.to_ascii_lowercase()).collect();
        let col = |f: &dyn Fn(&str) -> bool| head.iter().enumerate().position(|(k, h)| k > 0 && f(h)).map(|p| p as isize).unwrap_or(-1);
        let lat_k = col(&|h| h.starts_with("lat"));
        let lng_k = col(&|h| h.starts_with("lng") || h.starts_with("lon") || h.starts_with("long"));
        let addr_k = col(&|h| h.contains("address") || h.contains("location") || h.contains("where"));
        struct Place {
            name: String,
            address: String,
            lat: f64,
            lng: f64,
            known: bool,
            rest: Vec<String>,
        }
        let get = |r: &Vec<String>, k: isize| if k > 0 { r.get(k as usize).cloned() } else { None };
        let places: Vec<Place> = body
            .iter()
            .map(|r| {
                let lat = get(r, lat_k).map(|v| number(&v)).unwrap_or(f64::NAN);
                let lng = get(r, lng_k).map(|v| number(&v)).unwrap_or(f64::NAN);
                let known = lat.is_finite() && lng.is_finite() && lat.abs() <= 90.0 && lng.abs() <= 180.0;
                let rest = r
                    .iter()
                    .enumerate()
                    .filter(|(k, v)| *k > 0 && *k as isize != lat_k && *k as isize != lng_k && *k as isize != addr_k && !v.is_empty())
                    .map(|(_, v)| v.clone())
                    .collect();
                Place { name: r.first().cloned().unwrap_or_default(), address: get(r, addr_k).unwrap_or_default(), lat, lng, known, rest }
            })
            .collect();
        let link = |p: &Place| {
            esc(&if p.known {
                format!("https://www.openstreetmap.org/?mlat={0}&mlon={1}#map=16/{0}/{1}", num_str(p.lat), num_str(p.lng))
            } else {
                let q: Vec<&str> = [p.name.as_str(), p.address.as_str()].into_iter().filter(|s| !s.is_empty()).collect();
                format!("https://www.openstreetmap.org/search?query={}", encode_uri_component(&q.join(", ")))
            })
        };
        let pinned: Vec<(usize, &Place)> = places.iter().enumerate().filter(|(_, p)| p.known).collect();
        let mut svg = String::new();
        if !pinned.is_empty() {
            let w = self.chart_width;
            let h = round(w * 0.5);
            let pad = 28.0;
            // Web Mercator at the largest zoom (16 at most) that fits every
            // pin, one unit a pixel of that zoom: map tiles (256 units each)
            // can then sit exactly under the pins. data-z, data-ox and
            // data-oy say where: the zoom and the world pixel at the top left.
            let pi = core::f64::consts::PI;
            let world = |p: &Place, z: f64| {
                let size = 256.0 * libm::pow(2.0, z);
                let lat = p.lat.clamp(-85.05, 85.05) * pi / 180.0;
                ((p.lng + 180.0) / 360.0 * size, (1.0 - libm::log(libm::tan(lat) + 1.0 / cos(lat)) / pi) / 2.0 * size)
            };
            let bounds = |z: f64| {
                let pts: Vec<(f64, f64)> = pinned.iter().map(|(_, p)| world(p, z)).collect();
                let fold = |f: fn(f64, f64) -> f64, init: f64, k: usize| pts.iter().map(|q| if k == 0 { q.0 } else { q.1 }).fold(init, f);
                (fold(f64::min, f64::INFINITY, 0), fold(f64::max, f64::NEG_INFINITY, 0), fold(f64::min, f64::INFINITY, 1), fold(f64::max, f64::NEG_INFINITY, 1))
            };
            let mut z = 16.0;
            while z > 1.0 {
                let (x0, x1, y0, y1) = bounds(z);
                if x1 - x0 <= w - 2.0 * pad && y1 - y0 <= h - 2.0 * pad {
                    break;
                }
                z -= 1.0;
            }
            let (x0, x1, y0, y1) = bounds(z);
            let (ox, oy) = ((x0 + x1) / 2.0 - w / 2.0, (y0 + y1) / 2.0 - h / 2.0);
            let px = |p: &Place| {
                let (x, y) = world(p, z);
                (x - ox, y - oy)
            };
            svg.push_str(&format!(
                "<svg viewBox=\"0 0 {} {}\" role=\"img\" aria-label=\"{}\" data-z=\"{}\" data-ox=\"{}\" data-oy=\"{}\">",
                num_str(w),
                num_str(h),
                esc(n.attr("title").unwrap_or("Map")),
                num_str(z),
                f1(ox),
                f1(oy)
            ));
            if n.flag("route") && n.has("route") && pinned.len() > 1 {
                let d: Vec<String> = pinned.iter().enumerate().map(|(j, (_, p))| {
                    let (x, y) = px(p);
                    format!("{}{},{}", if j > 0 { "L" } else { "M" }, f1(x), f1(y))
                }).collect();
                svg.push_str(&format!("<path class=\"route\" d=\"{}\"/>", d.join("")));
            }
            for (i, p) in &pinned {
                let (x, y) = px(p);
                // The pins are a picture; the list below links each place.
                svg.push_str(&format!(
                    "<circle class=\"pin\" cx=\"{}\" cy=\"{}\" r=\"11\"/><text x=\"{}\" y=\"{}\" text-anchor=\"middle\">{}</text>",
                    f1(x),
                    f1(y),
                    f1(x),
                    f1(y + 4.0),
                    i + 1
                ));
            }
            svg.push_str("</svg>");
        }
        let mut items = String::new();
        for p in &places {
            let name = self.spans(&crate::inline::parse(&p.name));
            let addr = if p.address.is_empty() { String::new() } else { format!("<small>{}</small>", self.spans(&crate::inline::parse(&p.address))) };
            let rest = if p.rest.is_empty() {
                String::new()
            } else {
                let parts: Vec<String> = p.rest.iter().map(|r| self.spans(&crate::inline::parse(r))).collect();
                format!("<small>{}</small>", parts.join(" · "))
            };
            items.push_str(&format!("<li><a href=\"{}\">{name}</a>{addr}{rest}</li>", link(p)));
        }
        let caption = match n.attr("title") {
            Some(t) if !t.is_empty() => format!("<figcaption>{}</figcaption>", title(t)),
            _ => String::new(),
        };
        format!("<figure class=\"map\">{caption}{svg}<ol class=\"places\">{items}</ol></figure>")
    }
}

/// A stat's change split into its number (with a unit that belongs to it) and
/// what it's compared with: "+12% vs same day last week" is "+12%" and
/// "vs same day last week". A change with no number in front is one short pill,
/// or, when long, only text.
fn change_parts(ch: &str) -> (&str, &str) {
    let t = ch.trim();
    let first_end = t.find(char::is_whitespace).unwrap_or(t.len());
    if !t[..first_end].chars().any(|c| c.is_ascii_digit()) {
        return if t.chars().count() <= 16 { (t, "") } else { ("", t) };
    }
    let rest = t[first_end..].trim_start();
    let unit_end = rest.find(char::is_whitespace).unwrap_or(rest.len());
    let unit = &rest[..unit_end];
    let end = if ["pts", "pt", "pp", "bps", "points", "%", "ms", "s", "x"].contains(&unit.to_ascii_lowercase().as_str()) { t.len() - rest.len() + unit_end } else { first_end };
    (&t[..end], t[end..].trim_start())
}

fn split_camel(k: &str) -> String {
    let mut o = String::new();
    let cs: Vec<char> = k.chars().collect();
    for (i, &c) in cs.iter().enumerate() {
        if i > 0 && c.is_ascii_uppercase() && cs[i - 1].is_ascii_lowercase() {
            o.push(' ');
        }
        o.push(c);
    }
    o.to_ascii_lowercase()
}

/// File types models name in accept="PDF | Images" as the browser's accept list.
fn accept_list(v: Option<&str>) -> String {
    list(v)
        .iter()
        .map(|t| match t.to_ascii_lowercase().as_str() {
            "pdf" => ".pdf,application/pdf".to_string(),
            "image" | "images" | "photo" | "photos" => "image/*".to_string(),
            "video" | "videos" => "video/*".to_string(),
            "audio" => "audio/*".to_string(),
            _ => {
                let ok = {
                    let (a, b) = t.split_once('/').unwrap_or((t.as_str(), ""));
                    !a.is_empty()
                        && a.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-')
                        && (!t.contains('/') || (!b.is_empty() && b.chars().all(|c| c.is_ascii_alphanumeric() || "_.*+-".contains(c))))
                };
                if ok {
                    t.clone()
                } else {
                    String::new()
                }
            }
        })
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(",")
}

/// A chart cell as a number: "$3.5k" is 3500.
pub(crate) fn chart_num(v: &str) -> f64 {
    let t: String = v.chars().filter(|c| !"$€£₹¥,%".contains(*c) && !c.is_whitespace()).collect();
    let b = t.as_bytes();
    let mut i = 0;
    if i < b.len() && (b[i] == b'-' || b[i] == b'+') {
        i += 1;
    }
    let ds = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    if i < b.len() && b[i] == b'.' {
        let dot = i;
        i += 1;
        let fs = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == fs {
            i = dot;
        }
    }
    // [-+]?\d*\.?\d+ : the last run must have digits
    if i == ds || !b[ds..i].iter().any(|c| c.is_ascii_digit()) || b[i - 1] == b'.' {
        return f64::NAN;
    }
    let base = number(&t[..i]);
    let mult = match b.get(i).map(|c| c.to_ascii_lowercase()) {
        Some(b'k') => 1e3,
        Some(b'm') => 1e6,
        Some(b'b') => 1e9,
        _ => 1.0,
    };
    base * mult
}

fn fmt_tick(n: f64, d: usize) -> String {
    if n.abs() >= 1e6 {
        format!("{}M", fixed_num(n / 1e6, d))
    } else if n.abs() >= 1e3 {
        format!("{}k", fixed_num(n / 1e3, d))
    } else {
        fixed_num(n, d.max(2))
    }
}

/// Axis labels with just enough decimals that no two ticks read the same.
fn tick_fmt(ticks: &[f64]) -> Vec<String> {
    for d in 1..4 {
        let out: Vec<String> = ticks.iter().map(|&t| fmt_tick(t, d)).collect();
        let mut seen: Vec<&String> = Vec::new();
        if out.iter().all(|x| {
            let dup = seen.contains(&x);
            seen.push(x);
            !dup
        }) {
            return out;
        }
    }
    ticks.iter().map(|&t| fmt_tick(t, 4)).collect()
}

/// A chart's data as a table, hidden on screen: what a screen reader reads, and
/// where the web SDK's tooltips take each value as the answer wrote it. The
/// hiding is on a box around it: a table keeps its own width whatever it's
/// given, so hidden itself it widened the page on a phone.
fn chart_table(n: &Node, head: &[String], rows: &[Vec<String>]) -> String {
    let mut o = String::from("<div class=\"sr\"><table class=\"chart-data\">");
    if let Some(t) = n.attr("title").filter(|t| !t.is_empty()) {
        o.push_str(&format!("<caption>{}</caption>", esc(t)));
    }
    o.push_str("<thead><tr>");
    for h in head {
        o.push_str(&format!("<th scope=\"col\">{}</th>", esc(h)));
    }
    o.push_str("</tr></thead><tbody>");
    for r in rows {
        o.push_str("<tr>");
        for (k, c) in r.iter().enumerate() {
            if k == 0 {
                o.push_str(&format!("<th scope=\"row\">{}</th>", esc(c)));
            } else {
                o.push_str(&format!("<td>{}</td>", esc(c)));
            }
        }
        o.push_str("</tr>");
    }
    o + "</tbody></table></div>"
}

/// Round axis ticks: 0 and 4 nice steps up to at least the max.
fn nice_ticks(min: f64, max: f64) -> Vec<f64> {
    let span = if max - min == 0.0 { 1.0 } else { max - min };
    let raw = span / 4.0;
    let mag = pow(10.0, floor(log10(raw)));
    let step = [1.0, 2.0, 2.5, 5.0, 10.0].iter().map(|m| m * mag).find(|s| *s >= raw).unwrap_or(raw);
    let lo = floor(min / step) * step;
    let mut ticks = Vec::new();
    let mut t = lo;
    while t < max + step * 0.999 {
        ticks.push(number(&to_fixed(t, 10)));
        t += step;
        if ticks.len() > 1000 {
            break;
        }
    }
    if ticks.is_empty() {
        ticks.push(lo);
    }
    ticks
}

const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

fn iso_month(l: &str) -> Option<usize> {
    let m: usize = l.get(5..7)?.parse().ok()?;
    (1..=12).contains(&m).then_some(m)
}

/// ISO dates on an axis read as "Jan 15", or "Jan" for months.
fn axis_labels(labels: &[String]) -> Vec<String> {
    let day = |l: &str| l.len() == 10 && l.as_bytes()[4] == b'-' && l.as_bytes()[7] == b'-' && l[..4].bytes().all(|c| c.is_ascii_digit()) && l[8..].bytes().all(|c| c.is_ascii_digit()) && iso_month(l).is_some() && l[5..7].bytes().all(|c| c.is_ascii_digit());
    let month = |l: &str| l.len() == 7 && l.as_bytes()[4] == b'-' && l[..4].bytes().all(|c| c.is_ascii_digit()) && l[5..7].bytes().all(|c| c.is_ascii_digit()) && iso_month(l).is_some();
    if !labels.is_empty() && labels.iter().all(|l| day(l)) {
        return labels.iter().map(|l| format!("{} {}", MONTHS[iso_month(l).unwrap() - 1], l[8..10].parse::<u32>().unwrap())).collect();
    }
    if !labels.is_empty() && labels.iter().all(|l| month(l)) {
        let mut years: Vec<&str> = labels.iter().map(|l| &l[..4]).collect();
        years.sort();
        years.dedup();
        return labels.iter().map(|l| if years.len() > 1 { format!("{} {}", MONTHS[iso_month(l).unwrap() - 1], &l[2..4]) } else { MONTHS[iso_month(l).unwrap() - 1].to_string() }).collect();
    }
    labels.to_vec()
}

/// A monotone curve through the points, as d3's monotoneX draws it.
fn curve(pts: &[(f64, f64)]) -> String {
    let n = pts.len();
    let xy = |x: f64, y: f64| format!("{},{}", f1(x), f1(y));
    if n < 3 {
        return pts.iter().enumerate().map(|(i, &(x, y))| format!("{}{}", if i > 0 { "L" } else { "M" }, xy(x, y))).collect();
    }
    let mut dx = vec![0.0; n - 1];
    let mut sl = vec![0.0; n - 1];
    for i in 0..n - 1 {
        dx[i] = pts[i + 1].0 - pts[i].0;
        sl[i] = (pts[i + 1].1 - pts[i].1) / if dx[i] == 0.0 { 1.0 } else { dx[i] };
    }
    let mut m = vec![0.0; n];
    m[0] = sl[0];
    for i in 1..n - 1 {
        m[i] = if sl[i - 1] * sl[i] <= 0.0 { 0.0 } else { (3.0 * (dx[i - 1] + dx[i])) / ((2.0 * dx[i] + dx[i - 1]) / sl[i - 1] + (dx[i] + 2.0 * dx[i - 1]) / sl[i]) };
    }
    m[n - 1] = sl[n - 2];
    let mut d = format!("M{}", xy(pts[0].0, pts[0].1));
    for i in 0..n - 1 {
        let h = dx[i] / 3.0;
        d.push_str(&format!("C{} {} {}", xy(pts[i].0 + h, pts[i].1 + m[i] * h), xy(pts[i + 1].0 - h, pts[i + 1].1 - m[i + 1] * h), xy(pts[i + 1].0, pts[i + 1].1)));
    }
    d
}

#[allow(dead_code)]
fn sep(l: &str) -> bool {
    is_separator(l)
}
