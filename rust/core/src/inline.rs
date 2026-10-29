//! Inline content: one line of Markdown (with the components a sentence or a
//! table cell may hold) into spans, the same everywhere it's rendered.

use crate::text::{dashes, BR};
use alloc::boxed::Box;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

/// An attribute value: a string, or `None` for a bare attribute (true).
pub type Attrs = Vec<(String, Option<String>)>;

#[derive(Clone, Debug, PartialEq)]
pub enum Span {
    Text(String),
    /// strong, em, s, u, small, sub, sup, mark, kbd
    Fmt(&'static str, Vec<Span>),
    Code(String),
    Link(String, Vec<Span>),
    /// `credit` is the image's Markdown title, parsed: who made it and its
    /// license, with links (the API writes it when it finds a photo).
    Img { src: String, alt: String, credit: Vec<Span> },
    Br,
    /// A component inside a sentence or a table cell.
    El { ty: String, attrs: Attrs, children: Vec<Span> },
}

pub enum TagRead {
    Ok { name: String, attrs: Attrs, self_closing: bool, end: usize },
    /// The text so far could still become a tag.
    Incomplete,
    /// Not a tag: the `<` is text.
    Invalid,
}

fn is_ws(b: u8) -> bool {
    matches!(b, b' ' | b'\n' | b'\r' | b'\t' | 0x0b | 0x0c)
}

/// An opening component tag at byte `start` (which holds '<'), read the way
/// render/html.ts's readOpenTag does, but telling "not yet" from "never".
pub fn read_open_tag(src: &str, start: usize) -> TagRead {
    let b = src.as_bytes();
    let mut i = start + 1;
    match b.get(i) {
        None => return TagRead::Incomplete,
        Some(c) if c.is_ascii_uppercase() => {}
        Some(_) => return TagRead::Invalid,
    }
    let ns = i;
    while i < b.len() && b[i].is_ascii_alphanumeric() {
        i += 1;
    }
    let name = src[ns..i].to_string();
    let mut attrs: Attrs = Vec::new();
    let set = |attrs: &mut Attrs, k: &str, v: Option<String>| {
        if let Some(e) = attrs.iter_mut().find(|(key, _)| key == k) {
            e.1 = v;
        } else {
            attrs.push((k.to_string(), v));
        }
    };
    loop {
        while i < b.len() && is_ws(b[i]) {
            i += 1;
        }
        if i >= b.len() {
            return TagRead::Incomplete;
        }
        if b[i] == b'/' {
            match b.get(i + 1) {
                None => return TagRead::Incomplete,
                Some(b'>') => return TagRead::Ok { name, attrs, self_closing: true, end: i + 2 },
                Some(_) => return TagRead::Invalid,
            }
        }
        if b[i] == b'>' {
            return TagRead::Ok { name, attrs, self_closing: false, end: i + 1 };
        }
        if !(b[i].is_ascii_alphabetic() || b[i] == b'_') {
            return TagRead::Invalid;
        }
        let ks = i;
        while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'_' || b[i] == b'-') {
            i += 1;
        }
        if i >= b.len() {
            return TagRead::Incomplete;
        }
        let key = src[ks..i].to_string();
        while i < b.len() && b[i] == b' ' {
            i += 1;
        }
        if i >= b.len() {
            return TagRead::Incomplete;
        }
        if b[i] != b'=' {
            set(&mut attrs, &key, None);
            continue;
        }
        i += 1;
        while i < b.len() && b[i] == b' ' {
            i += 1;
        }
        let Some(&q) = b.get(i) else { return TagRead::Incomplete };
        if q == b'"' || q == b'\'' {
            // A quote escaped JSON-style (12\" for inches) belongs to the value.
            let mut j = i + 1;
            while j < b.len() && !(b[j] == q && b[j - 1] != b'\\') {
                j += 1;
            }
            if j >= b.len() {
                return TagRead::Incomplete;
            }
            let raw = &src[i + 1..j];
            let v = if q == b'"' { raw.replace("\\\"", "\"") } else { raw.replace("\\'", "'") };
            set(&mut attrs, &key, Some(entities(&v)));
            i = j + 1;
        } else if q == b'{' {
            match src[i + 1..].find('}') {
                None => return TagRead::Incomplete,
                Some(p) => {
                    let v = src[i + 1..i + 1 + p].trim();
                    let v = v.strip_prefix(|c| c == '"' || c == '\'').unwrap_or(v);
                    let v = v.strip_suffix(|c| c == '"' || c == '\'').unwrap_or(v);
                    set(&mut attrs, &key, Some(v.to_string()));
                    i = i + 1 + p + 1;
                }
            }
        } else {
            let vs = i;
            while i < b.len() && !is_ws(b[i]) && b[i] != b'/' && b[i] != b'>' {
                i += 1;
            }
            if i >= b.len() {
                return TagRead::Incomplete;
            }
            if i == vs {
                return TagRead::Invalid;
            }
            set(&mut attrs, &key, Some(src[vs..i].to_string()));
        }
    }
}

/// HTML's escapes in a quoted value, as HTML and JSX read them: a model (or a
/// repair round) writes `&quot;` for a quote inside a value as often as `\"`.
/// `&amp;` goes last, so `&amp;quot;` stays the text `&quot;`.
fn entities(v: &str) -> String {
    if !v.contains('&') {
        return v.into();
    }
    v.replace("&quot;", "\"").replace("&#34;", "\"").replace("&apos;", "'").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
}

const FORMAT: [(&str, &str); 13] = [
    ("strong", "strong"),
    ("b", "strong"),
    ("em", "em"),
    ("i", "em"),
    ("u", "u"),
    ("s", "s"),
    ("del", "s"),
    ("code", "code"),
    ("small", "small"),
    ("sub", "sub"),
    ("sup", "sup"),
    ("mark", "mark"),
    ("kbd", "kbd"),
];

fn format_tag(name: &str) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    FORMAT.iter().find(|(k, _)| *k == lower).map(|(_, v)| *v)
}

/// A lowercase HTML tag at `i`: (closing?, name, end). Attributes are allowed
/// and ignored.
fn html_tag(s: &str, i: usize) -> Option<(bool, &str, usize)> {
    let b = s.as_bytes();
    let mut j = i + 1;
    let close = b.get(j) == Some(&b'/');
    if close {
        j += 1;
    }
    let ns = j;
    while j < b.len() && b[j].is_ascii_alphabetic() {
        j += 1;
    }
    if j == ns {
        return None;
    }
    let name = &s[ns..j];
    match b.get(j) {
        Some(b'>') => Some((close, name, j + 1)),
        Some(c) if is_ws(*c) || *c == b'/' => s[j..].find('>').map(|p| (close, name, j + p + 1)),
        _ => None,
    }
}

/// Links and images only to places that can't run script: javascript:,
/// vbscript: and file: never, data: only for images. The scheme is read as
/// a browser reads it, which drops spaces and control characters before it
/// and tabs and line breaks anywhere ("java\tscript:" is javascript:).
pub fn safe_url(u: &str, image: bool) -> bool {
    let t: String = u.trim_start_matches(|c: char| c <= ' ').chars().filter(|c| !matches!(c, '\t' | '\n' | '\r')).collect();
    let t = t.as_str();
    let Some(p) = t.find(':') else { return true };
    let scheme = &t[..p];
    if scheme.is_empty() || !scheme.bytes().enumerate().all(|(k, c)| c.is_ascii_alphabetic() || (k > 0 && (c.is_ascii_digit() || c == b'+' || c == b'.' || c == b'-'))) {
        return true;
    }
    match scheme.to_ascii_lowercase().as_str() {
        "javascript" | "vbscript" | "file" => false,
        "data" => {
            let rest = t[p + 1..].to_ascii_lowercase();
            image && ["image/png;", "image/jpeg;", "image/jpg;", "image/gif;", "image/webp;", "image/avif;"].iter().any(|x| rest.starts_with(x))
        }
        _ => true,
    }
}

fn is_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// Collapses `<br>` markers: none at the edges, one for a run.
fn tidy_breaks(s: &str) -> String {
    let trimmed = s.trim_matches(|c: char| c.is_whitespace() || c == BR);
    if !trimmed.contains(BR) {
        return trimmed.to_string();
    }
    let mut out = String::with_capacity(trimmed.len());
    let cs: Vec<char> = trimmed.chars().collect();
    let mut i = 0;
    while i < cs.len() {
        if cs[i].is_whitespace() || cs[i] == BR {
            let mut j = i;
            let mut br = false;
            while j < cs.len() && (cs[j].is_whitespace() || cs[j] == BR) {
                br |= cs[j] == BR;
                j += 1;
            }
            if br {
                out.push(BR);
            } else {
                out.extend(&cs[i..j]);
            }
            i = j;
        } else {
            out.push(cs[i]);
            i += 1;
        }
    }
    out
}

/// One line of inline Markdown into spans.
pub fn parse(s: &str) -> Vec<Span> {
    let t = tidy_breaks(s);
    let mut p = Inline { s: &t };
    p.run(0, t.len())
}

struct Inline<'a> {
    s: &'a str,
}

impl Inline<'_> {
    fn run(&mut self, from: usize, to: usize) -> Vec<Span> {
        let s = self.s;
        let b = s.as_bytes();
        let mut out: Vec<Span> = Vec::new();
        let mut text = String::new();
        let flush = |out: &mut Vec<Span>, text: &mut String| {
            if !text.is_empty() {
                out.push(Span::Text(dashes(text)));
                text.clear();
            }
        };
        let mut i = from;
        while i < to {
            let c = s[i..].chars().next().unwrap();
            let prev = s[..i].chars().next_back();
            match c {
                BR => {
                    flush(&mut out, &mut text);
                    out.push(Span::Br);
                    i += c.len_utf8();
                    continue;
                }
                '`' => {
                    if let Some(p) = s[i + 1..to].find('`') {
                        if p > 0 {
                            flush(&mut out, &mut text);
                            out.push(Span::Code(s[i + 1..i + 1 + p].to_string()));
                            i = i + 1 + p + 1;
                            continue;
                        }
                    }
                }
                '!' if b.get(i + 1) == Some(&b'[') => {
                    if let Some((alt, url, title, end)) = link_at(s, i + 1, to) {
                        flush(&mut out, &mut text);
                        if safe_url(&url, true) {
                            out.push(Span::Img { src: url, alt: alt.to_string(), credit: credit(title.as_deref()) });
                        } else {
                            out.push(Span::Text(dashes(alt)));
                        }
                        i = end;
                        continue;
                    }
                }
                '[' => {
                    if let Some((label, url, _, end)) = link_at(s, i, to) {
                        if !label.is_empty() {
                            flush(&mut out, &mut text);
                            let ls = i + 1;
                            let inner = self.run(ls, ls + label.len());
                            if safe_url(&url, false) {
                                out.push(Span::Link(url, inner));
                            } else {
                                out.extend(inner);
                            }
                            i = end;
                            continue;
                        }
                    }
                }
                '*' if b.get(i + 1) == Some(&b'*') => {
                    if let Some(p) = s[i + 2..to].find('*') {
                        if p > 0 && s[i + 2 + p..to].starts_with("**") {
                            flush(&mut out, &mut text);
                            let inner = self.run(i + 2, i + 2 + p);
                            out.push(Span::Fmt("strong", inner));
                            i = i + 2 + p + 2;
                            continue;
                        }
                    }
                }
                '*' if !matches!(prev, Some(p) if p == '*' || is_word(p)) => {
                    if let Some(p) = s[i + 1..to].find(|ch| ch == '*' || ch == '\n') {
                        if p > 0 && s.as_bytes()[i + 1 + p] == b'*' {
                            flush(&mut out, &mut text);
                            let inner = self.run(i + 1, i + 1 + p);
                            out.push(Span::Fmt("em", inner));
                            i = i + 1 + p + 1;
                            continue;
                        }
                    }
                }
                '_' if !matches!(prev, Some(p) if is_word(p)) => {
                    if let Some(p) = s[i + 1..to].find(|ch| ch == '_' || ch == '\n') {
                        let close = i + 1 + p;
                        let after = s[close + 1..to].chars().next();
                        if p > 0 && s.as_bytes()[close] == b'_' && !matches!(after, Some(a) if is_word(a)) {
                            flush(&mut out, &mut text);
                            let inner = self.run(i + 1, close);
                            out.push(Span::Fmt("em", inner));
                            i = close + 1;
                            continue;
                        }
                    }
                }
                '<' => {
                    if let Some((span, end)) = self.tag(i, to) {
                        flush(&mut out, &mut text);
                        if let Some(sp) = span {
                            out.push(sp);
                        }
                        i = end;
                        continue;
                    }
                }
                _ => {}
            }
            text.push(c);
            i += c.len_utf8();
        }
        flush(&mut out, &mut text);
        out
    }

    /// A tag at `i`: an inline component, a formatting tag (with its content),
    /// or a stray closing tag (dropped). `None` when it's just a '<'.
    fn tag(&mut self, i: usize, to: usize) -> Option<(Option<Span>, usize)> {
        let s = self.s;
        let b = s.as_bytes();
        // </Name> left over: dropped.
        if b.get(i + 1) == Some(&b'/') && b.get(i + 2).map_or(false, |c| c.is_ascii_uppercase()) {
            let end = s[i..to].find('>')? + i + 1;
            if s[i + 2..end - 1].bytes().all(|c| c.is_ascii_alphanumeric()) {
                return Some((None, end));
            }
            return None;
        }
        if b.get(i + 1).map_or(false, |c| c.is_ascii_uppercase()) {
            let TagRead::Ok { name, attrs, self_closing, end } = read_open_tag(&s[..to], i) else { return None };
            if !self_closing {
                // <Name ...>body</Name>
                // </badge> closes <Badge> too: models slip into HTML's case.
                let close = alloc::format!("</{}>", name).to_ascii_lowercase();
                if let Some(p) = s[end..to].to_ascii_lowercase().find(close.as_str()) {
                    let children = self.run(end, end + p);
                    return Some((Some(Span::El { ty: name, attrs, children: trim_spans(children) }), end + p + close.len()));
                }
            }
            return Some((Some(Span::El { ty: name, attrs, children: Vec::new() }), end));
        }
        // formatting tags: <strong>…</strong>, unclosed ones run to the end
        let (close, name, end) = html_tag(s, i)?;
        let fmt = format_tag(name)?;
        if close {
            return Some((None, end));
        }
        let mut depth = 1;
        let mut k = end;
        while k < to {
            if b[k] == b'<' {
                if let Some((c2, n2, e2)) = html_tag(s, k) {
                    if format_tag(n2) == Some(fmt) {
                        depth += if c2 { -1 } else { 1 };
                        if depth == 0 {
                            let inner = self.run(end, k);
                            return Some((Some(fmt_span(fmt, inner)), e2));
                        }
                    }
                    k = e2;
                    continue;
                }
            }
            k += s[k..].chars().next().unwrap().len_utf8();
        }
        let inner = self.run(end, to);
        Some((Some(fmt_span(fmt, inner)), to))
    }
}

fn fmt_span(fmt: &'static str, inner: Vec<Span>) -> Span {
    if fmt == "code" {
        let mut t = String::new();
        plain(&inner, &mut t);
        Span::Code(t)
    } else {
        Span::Fmt(fmt, inner)
    }
}

/// In a line still arriving, where the first link or image that hasn't closed
/// starts (its '[', or the '!' before it). Shown before it closes, it would be
/// its raw markdown, and a quoted title that's still open would end it at a
/// ')' inside the title. Brackets that can't become a link don't count.
pub fn unfinished_link(s: &str) -> Option<usize> {
    let b = s.as_bytes();
    let mut i = 0;
    while let Some(p) = s[i..].find('[') {
        let at = i + p;
        let start = if at > 0 && b[at - 1] == b'!' { at - 1 } else { at };
        let Some(close) = s[at + 1..].find(']').map(|c| c + at + 1) else { return Some(start) };
        match b.get(close + 1) {
            None => return Some(start),
            Some(b'(') => {}
            Some(_) => {
                i = close + 1;
                continue;
            }
        }
        if s[close + 2..].starts_with(')') {
            i = close + 3;
            continue;
        }
        match link_at(s, at, s.len()) {
            // An odd number of quotes: the title hasn't closed.
            Some((_, _, _, end)) if s[close + 2..end].replace("\\\"", "").matches('"').count() % 2 == 0 => i = end,
            _ => return Some(start),
        }
    }
    None
}

/// `[label](url "title")` at `i` (which holds '['): (label, url, title, end).
fn link_at(s: &str, i: usize, to: usize) -> Option<(&str, String, Option<String>, usize)> {
    let close = s[i + 1..to].find(']')? + i + 1;
    let label = &s[i + 1..close];
    if !s[close..to].starts_with("](") {
        return None;
    }
    let us = close + 2;
    // The address runs to a space or an unbalanced ")": balanced parentheses
    // are part of it (Mercury_(planet)), as CommonMark reads them.
    let mut ue = to;
    let mut depth = 0usize;
    for (k, c) in s[us..to].char_indices() {
        match c {
            '(' => depth += 1,
            ')' if depth > 0 => depth -= 1,
            ')' => {
                ue = us + k;
                break;
            }
            c if c.is_whitespace() => {
                ue = us + k;
                break;
            }
            _ => {}
        }
    }
    if ue == us {
        return None;
    }
    let url = s[us..ue].to_string();
    // A quoted title may hold anything, ")" included (a credit's links do);
    // \" is a quote inside it.
    let ts = ue + (s[ue..to].len() - s[ue..to].trim_start().len());
    if s[ts..to].starts_with('"') {
        if let Some((title, te)) = quoted(s, ts, to) {
            let rest = &s[te..to];
            if rest.trim_start().starts_with(')') {
                return Some((label, url, Some(title), te + (rest.len() - rest.trim_start().len()) + 1));
            }
        }
    }
    let end = s[ue..to].find(')')? + ue + 1;
    Some((label, url, None, end))
}

/// The text of a "..." at `i` (which holds '"'), with \" and \\ unescaped,
/// and the index just past the closing quote.
fn quoted(s: &str, i: usize, to: usize) -> Option<(String, usize)> {
    let mut out = String::new();
    let mut it = s[i + 1..to].char_indices();
    while let Some((k, c)) = it.next() {
        match c {
            '\\' => match it.next() {
                Some((_, n @ ('"' | '\\'))) => out.push(n),
                Some((_, n)) => {
                    out.push('\\');
                    out.push(n);
                }
                None => return None,
            },
            '"' => return Some((out, i + 1 + k + 1)),
            _ => out.push(c),
        }
    }
    None
}

/// An image's credit line: its title as inline text, without images or
/// components (a credit is words and links).
fn credit(title: Option<&str>) -> Vec<Span> {
    fn keep(v: Vec<Span>) -> Vec<Span> {
        v.into_iter()
            .filter_map(|s| match s {
                Span::Img { .. } | Span::El { .. } => None,
                Span::Fmt(f, c) => Some(Span::Fmt(f, keep(c))),
                Span::Link(h, c) => Some(Span::Link(h, keep(c))),
                s => Some(s),
            })
            .collect()
    }
    match title.map(str::trim) {
        Some(t) if !t.is_empty() => keep(parse(t)),
        _ => Vec::new(),
    }
}

/// The words beside a gallery image as its caption: without the space and
/// dash that set them off ("– 1,240 units").
pub fn caption(mut v: Vec<Span>) -> Vec<Span> {
    let dash = |t: &str| t.trim_start().trim_start_matches(['-', '\u{2013}', '\u{2014}', ':', '|']).trim_start().to_string();
    if let Some(Span::Text(t)) = v.first_mut() {
        *t = dash(t);
    }
    v.retain(|s| !matches!(s, Span::Text(t) if t.is_empty()));
    // "**Name** – detail": the name on its own line, the dash gone.
    if matches!(v.first(), Some(Span::Fmt("strong", _))) {
        if let Some(Span::Text(t)) = v.get_mut(1) {
            *t = dash(t);
        }
    }
    if let Some(Span::Text(t)) = v.last_mut() {
        *t = t.trim_end().to_string();
    }
    v.retain(|s| !matches!(s, Span::Text(t) if t.is_empty()));
    v
}

/// An image at `i` (which holds '!'): its source, alt text, credit and end,
/// read as the inline parser reads it (a Gallery's images, say).
pub fn image_at(s: &str, i: usize) -> Option<(String, String, Vec<Span>, usize)> {
    if !s[i..].starts_with("![") {
        return None;
    }
    let (alt, url, title, end) = link_at(s, i + 1, s.len())?;
    Some((url, alt.to_string(), credit(title.as_deref()), end))
}

/// Trims whitespace at the edges of a component's label.
fn trim_spans(mut v: Vec<Span>) -> Vec<Span> {
    if let Some(Span::Text(t)) = v.first_mut() {
        *t = t.trim_start().to_string();
    }
    if let Some(Span::Text(t)) = v.last_mut() {
        *t = t.trim_end().to_string();
    }
    v.retain(|s| !matches!(s, Span::Text(t) if t.is_empty()));
    v
}

/// The plain text of spans (labels, alt text, search).
pub fn plain(spans: &[Span], out: &mut String) {
    for s in spans {
        match s {
            Span::Text(t) | Span::Code(t) => out.push_str(t),
            Span::Fmt(_, c) | Span::Link(_, c) | Span::El { children: c, .. } => plain(c, out),
            Span::Img { alt, .. } => out.push_str(alt),
            Span::Br => out.push(' '),
        }
    }
}

// Boxed recursion keeps clippy quiet about large enum variants elsewhere.
#[allow(dead_code)]
type _B = Box<Span>;
