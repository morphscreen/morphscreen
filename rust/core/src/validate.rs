//! Validation: attribute checks as components open, content checks as they
//! close, and the verdict, scored with generative-ui-bench's rules like
//! validator/validate.ts.

use crate::catalog::{AttrType, Catalog, Component, Content};
use crate::inline::{safe_url, Attrs, Span};
use crate::text::dashes;
use crate::tree::{Data, Node};
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Severity {
    Error,
    Note,
}

#[derive(Clone, Debug)]
pub struct Diag {
    pub line: usize,
    pub cls: &'static str,
    pub detail: String,
    pub severity: Severity,
    /// For a note: the error it counts as under strict scoring.
    pub strict: Option<(&'static str, String)>,
}

impl Diag {
    pub fn error(line: usize, cls: &'static str, detail: String) -> Diag {
        Diag { line, cls, detail, severity: Severity::Error, strict: None }
    }
    pub fn note(line: usize, detail: String, strict: &'static str, strict_detail: String) -> Diag {
        Diag { line, cls: "note", detail, severity: Severity::Note, strict: Some((strict, strict_detail)) }
    }
}

// The allowed value a model's word stands for, by attribute (spec/synonyms.json).
include!(concat!(env!("OUT_DIR"), "/synonyms.rs"));

/// A number as models write them: "1,204", "$3.5k", "-12%", "2x".
pub fn looks_numeric(v: &str) -> bool {
    let s = v.trim();
    let cs: Vec<char> = s.chars().collect();
    let mut i = 0;
    if i < cs.len() && (cs[i] == '-' || cs[i] == '+') {
        i += 1;
    }
    if i < cs.len() && "$€£₹¥".contains(cs[i]) {
        i += 1;
    }
    while i < cs.len() && cs[i].is_whitespace() {
        i += 1;
    }
    if i < cs.len() && (cs[i] == '-' || cs[i] == '+') {
        i += 1;
    }
    if i >= cs.len() || !cs[i].is_ascii_digit() {
        return false;
    }
    while i < cs.len() && (cs[i].is_ascii_digit() || cs[i] == ',') {
        i += 1;
    }
    if i < cs.len() && cs[i] == '.' {
        let s0 = i + 1;
        i += 1;
        while i < cs.len() && cs[i].is_ascii_digit() {
            i += 1;
        }
        if i == s0 {
            return false;
        }
    }
    while i < cs.len() && cs[i].is_whitespace() {
        i += 1;
    }
    if i < cs.len() {
        match cs[i] {
            '%' | 'x' => i += 1,
            'k' | 'K' | 'm' | 'M' | 'b' | 'B' => {
                i += 1;
                if i < cs.len() && cs[i] == 'n' {
                    i += 1;
                }
            }
            _ => {}
        }
    }
    i == cs.len()
}

/// Checks a component's attributes as it opens and returns the clean ones:
/// enum values in canonical form, unknown and unsafe ones dropped, titles
/// with dashes that don't start a line.
pub fn clean_attrs(spec: &Component, written: &str, attrs: Attrs, line: usize, diags: &mut Vec<Diag>) -> Attrs {
    let mut out: Attrs = Vec::new();
    for (key, value) in attrs {
        let Some(a) = spec.attr(&key) else {
            // An icon where none is taught is harmless: dropped, a note.
            if key == "icon" {
                diags.push(Diag { line, cls: "note", detail: format!("no icon on {}", written), severity: Severity::Note, strict: None });
            } else {
                diags.push(Diag::error(line, "signature-mismatch", format!("{}.{}", written, key)));
            }
            continue;
        };
        match &a.ty {
            AttrType::Enum(vals) => {
                let v = value.clone().unwrap_or_else(|| "true".to_string());
                if vals.iter().any(|x| *x == v) {
                    out.push((key, Some(v)));
                    continue;
                }
                let lower = v.to_ascii_lowercase();
                let coerced = if vals.contains(&lower) {
                    Some(lower)
                } else {
                    synonym(&key, &lower).map(|x| x.to_string()).filter(|x| vals.contains(x))
                };
                match coerced {
                    Some(c) => {
                        diags.push(Diag::note(line, format!("coerced {}.{}={}", written, key, v), "enum-mismatch", format!("{}.{}={}", written, key, v)));
                        out.push((key, Some(c)));
                    }
                    None => {
                        diags.push(Diag::error(line, "enum-mismatch", format!("{}.{}={}", written, key, v)));
                        if let Some(d) = &a.default {
                            out.push((key, Some(d.clone())));
                        }
                    }
                }
            }
            AttrType::Num => {
                let v = value.unwrap_or_default();
                if !looks_numeric(&v) {
                    diags.push(Diag::error(line, "signature-mismatch", format!("{}.{} not a number", written, key)));
                }
                out.push((key, Some(v)));
            }
            AttrType::Bool => match value {
                None => out.push((key, None)),
                Some(v) if v.eq_ignore_ascii_case("true") || v.eq_ignore_ascii_case("false") => out.push((key, Some(v.to_ascii_lowercase()))),
                Some(_) => diags.push(Diag::error(line, "signature-mismatch", format!("{}.{} not true/false", written, key))),
            },
            AttrType::List => {
                let v = value.unwrap_or_default();
                // Empty is only wrong where the list is required (options).
                if a.required && v.split('|').all(|x| x.trim().is_empty()) {
                    diags.push(Diag::error(line, "required-field", format!("{}.{} empty", written, key)));
                }
                out.push((key, Some(v)));
            }
            AttrType::Url => {
                let v = value.unwrap_or_default();
                if safe_url(v.trim(), key == "src") {
                    out.push((key, Some(v)));
                } else {
                    diags.push(Diag::error(line, "unsafe-url", format!("{}.{}", written, key)));
                }
            }
            AttrType::Icon => {
                // The set's own name for it; a name it doesn't know shows no icon.
                let v = value.unwrap_or_default();
                match crate::icon::find(&v) {
                    Some((name, _)) => out.push((key, Some(name.to_string()))),
                    None => diags.push(Diag { line, cls: "note", detail: format!("no icon {}.{}={}", written, key, v), severity: Severity::Note, strict: None }),
                }
            }
            AttrType::Str => {
                let v = value.unwrap_or_default();
                out.push((key.clone(), Some(if key == "title" || key == "subtitle" { dashes(&v) } else { v })));
            }
        }
    }
    for a in &spec.attrs {
        if a.required && !out.iter().any(|(k, v)| *k == a.name && v.as_deref().map_or(true, |s| !s.is_empty())) {
            diags.push(Diag::error(line, "required-field", format!("{}.{}", written, a.name)));
        }
    }
    out
}

/// Images in Markdown text, as `![alt](src "credit")`, each with the words
/// after it on its line as its caption (a Gallery's "![Sword](...) **Sword**
/// – 1,240 units").
pub fn images_in(text: &str) -> Vec<crate::tree::Image> {
    let mut out = Vec::new();
    for line in text.lines().map(str::trim).filter(|l| l.contains("![")) {
        let mut words = Vec::new();
        let start = out.len();
        for s in crate::inline::parse(line) {
            match s {
                crate::inline::Span::Img { src, alt, credit } => out.push(crate::tree::Image { src, alt, credit, caption: Vec::new() }),
                s => words.push(s),
            }
        }
        if out.len() > start {
            out.last_mut().unwrap().caption = crate::inline::caption(words);
        }
    }
    out
}

/// List items in Markdown text: the text after each `- ` or `1. ` marker.
pub fn list_items(text: &str) -> Vec<&str> {
    text.lines().filter_map(|l| list_item(l.trim()).map(|(_, rest)| rest)).collect()
}

/// A list item line: (ordered?, the item's text).
pub fn list_item(l: &str) -> Option<(bool, &str)> {
    let b = l.as_bytes();
    let (ordered, after) = match b.first()? {
        b'-' | b'*' | b'+' => (false, 1),
        c if c.is_ascii_digit() => {
            let mut j = 0;
            while j < b.len() && b[j].is_ascii_digit() {
                j += 1;
            }
            if j < b.len() && (b[j] == b'.' || b[j] == b')') {
                (true, j + 1)
            } else {
                return None;
            }
        }
        _ => return None,
    };
    let rest = &l[after..];
    let trimmed = rest.trim_start();
    if trimmed.len() == rest.len() || trimmed.is_empty() {
        return None;
    }
    Some((ordered, trimmed))
}

/// A Chart's or Map's table, with or without the separator row.
pub fn table_data(text: &str) -> Option<Data> {
    let rows: Vec<&str> = text.lines().map(str::trim).filter(|l| l.starts_with('|')).collect();
    if rows.len() < 2 {
        return None;
    }
    let sep = crate::text::is_separator(rows[1]);
    let columns = crate::text::cells(rows[0]);
    let body: Vec<Vec<String>> = rows[if sep { 2 } else { 1 }..].iter().map(|r| crate::text::cells(r)).collect();
    if body.is_empty() {
        return None;
    }
    Some(Data::Table { columns, rows: body })
}

/// Content checks as a component closes.
pub fn check_content(spec: &Component, node: &Node, nodes: &[Node], diags: &mut Vec<Diag>) {
    let name = &node.written;
    let text = node.raw.trim();
    let tags: Vec<&Node> = node.children.iter().map(|&c| &nodes[c]).filter(|c| c.component && !c.run).collect();
    let line = node.line;
    match &spec.content {
        Content::None | Content::Any => {}
        Content::Code => {
            if text.is_empty() {
                diags.push(Diag::error(line, "required-field", format!("{} needs code", name)));
            }
        }
        Content::Text => {
            if text.is_empty() && tags.is_empty() && node.attr("label").map_or(true, |l| l.trim().is_empty()) {
                diags.push(Diag::error(line, "required-field", format!("{} label", name)));
            }
            // Buttons may go inside one with actions; nothing else may.
            let stray: Vec<&&Node> = tags.iter().filter(|t| !(spec.actions && t.ty == "Button")).collect();
            if !stray.is_empty() {
                diags.push(Diag::error(line, "placement", if spec.actions { format!("{} inside {}", stray[0].written, name) } else { format!("components inside {}", name) }));
            }
        }
        Content::Table => match &node.data {
            Some(Data::Table { columns, rows }) => {
                if spec.numeric {
                    let numeric = rows.iter().all(|r| r.iter().skip(1).all(|v| v.is_empty() || looks_numeric(v)));
                    if columns.len() < 2 || !numeric {
                        diags.push(Diag::error(line, "signature-mismatch", format!("{} data not numeric", name)));
                    }
                }
            }
            _ => diags.push(Diag::error(line, "required-field", format!("{} needs a Markdown table", name))),
        },
        Content::Images => {
            if images_in(text).is_empty() {
                diags.push(Diag::error(line, "required-field", format!("{} needs images", name)));
            }
        }
        Content::List => {
            if list_items(text).is_empty() {
                diags.push(Diag::error(line, "required-field", format!("{} needs a list", name)));
            }
        }
        Content::Only(allowed) => {
            if !text.is_empty() {
                diags.push(Diag::error(line, "placement", format!("text directly inside {}", name)));
            }
            for t in &tags {
                if t.ty != *allowed {
                    diags.push(Diag::error(line, "placement", format!("{} inside {}", t.written, name)));
                }
            }
            if tags.is_empty() {
                diags.push(Diag::error(line, "required-field", format!("{} is empty", name)));
            }
        }
    }
}

/// Checks a component written inside a sentence or table cell (it has no
/// node of its own) and counts it.
pub fn check_inline(cat: &Catalog, spans: &[Span], line: usize, diags: &mut Vec<Diag>) {
    for s in spans {
        match s {
            Span::El { ty, attrs, children } => {
                let resolved = cat.component(ty).map(|c| c.name.as_str()).or_else(|| cat.alias(ty));
                match resolved.and_then(|r| cat.component(r)) {
                    Some(spec) => {
                        clean_attrs(spec, ty, attrs.clone(), line, diags);
                        let labelled = spec.attr("label").is_some() && attrs.iter().any(|(k, v)| k == "label" && v.as_deref().map_or(false, |l| !l.trim().is_empty()));
                        if spec.content == Content::Text && children.is_empty() && !labelled {
                            diags.push(Diag::error(line, "required-field", format!("{} label", ty)));
                        }
                    }
                    None if resolved == Some("group") => {}
                    None => diags.push(Diag::error(line, "hallucinated-component", ty.clone())),
                }
                check_inline(cat, children, line, diags);
            }
            Span::Fmt(_, c) | Span::Link(_, c) => check_inline(cat, c, line, diags),
            _ => {}
        }
    }
}

fn count_spans(cat: &Catalog, spans: &[Span]) -> usize {
    let mut n = 0;
    for s in spans {
        match s {
            Span::El { ty, attrs, children } => {
                n += 1;
                let spec = cat.component(ty).or_else(|| cat.alias(ty).and_then(|a| cat.component(a)));
                if let Some(spec) = spec {
                    for (k, v) in attrs {
                        if matches!(spec.attr(k).map(|a| &a.ty), Some(AttrType::List)) {
                            n += v.as_deref().unwrap_or("").split('|').filter(|x| !x.trim().is_empty()).count();
                        }
                    }
                }
                n += count_spans(cat, children);
            }
            Span::Img { .. } => n += 1,
            Span::Fmt(_, c) | Span::Link(_, c) => n += count_spans(cat, c),
            _ => {}
        }
    }
    n
}

fn only_images(spans: &[Span]) -> bool {
    !spans.is_empty() && spans.iter().all(|s| matches!(s, Span::Img { .. }) || matches!(s, Span::Text(t) if t.trim().is_empty()))
}

/// Elements in a subtree, counted as generative-ui-bench counts them.
pub fn count(cat: &Catalog, nodes: &[Node], i: usize) -> usize {
    let mut n = 0;
    for &c in &nodes[i].children {
        let node = &nodes[c];
        if !node.component {
            n += match node.ty.as_str() {
                "h" | "li" | "code" => 1 + count_spans(cat, &node.spans),
                "p" => (if only_images(&node.spans) { 0 } else { 1 }) + count_spans(cat, &node.spans),
                "quote" => node.lines + count_spans(cat, &node.spans),
                "table" => {
                    let inline: usize = node.children.iter().flat_map(|&r| nodes[r].children.iter()).map(|&cell| count_spans(cat, &nodes[cell].spans)).sum();
                    inline + if node.sep { 1 + nodes[node.children[0]].children.len() } else { 1 }
                }
                _ => count(cat, nodes, c),
            };
            continue;
        }
        if node.run || node.unknown {
            n += count(cat, nodes, c);
            continue;
        }
        n += 1;
        let spec = cat.component(&node.ty);
        if let Some(spec) = spec {
            for (k, v) in &node.attrs {
                if matches!(spec.attr(k).map(|a| &a.ty), Some(AttrType::List)) {
                    n += v.as_deref().unwrap_or("").split('|').filter(|x| !x.trim().is_empty()).count();
                }
            }
            n += match (&spec.content, &node.data) {
                (Content::Table, Some(Data::Table { columns, rows })) => {
                    if spec.numeric {
                        columns.len().saturating_sub(1)
                    } else {
                        rows.len()
                    }
                }
                (Content::Images, Some(Data::Images { images })) => images.len(),
                (Content::List, Some(Data::List { items })) => items.len(),
                (Content::Text, _) => count_spans(cat, &node.spans),
                _ => count(cat, nodes, c),
            };
        } else {
            n += count(cat, nodes, c);
        }
    }
    n
}

#[derive(Clone, Debug)]
pub struct Verdict {
    pub renderable: bool,
    pub complete: bool,
    pub n: usize,
    pub errs: Vec<(String, String)>,
    pub notes: Vec<String>,
}

pub fn verdict(cat: &Catalog, nodes: &[Node], diags: &[Diag], had_text: bool, truncated: bool, reqs: usize, strict: bool) -> Verdict {
    let mut errs: Vec<(String, String)> = Vec::new();
    let mut notes = Vec::new();
    for d in diags {
        match d.severity {
            Severity::Error => errs.push((d.cls.to_string(), d.detail.clone())),
            Severity::Note => {
                notes.push(d.detail.clone());
                if strict {
                    if let Some((cls, detail)) = &d.strict {
                        errs.push((cls.to_string(), detail.clone()));
                    }
                }
            }
        }
    }
    let n = count(cat, nodes, 0);
    if !had_text {
        errs.push(("root-missing".to_string(), "empty answer".to_string()));
    }
    if truncated {
        errs.push(("truncation".to_string(), "hit ceiling".to_string()));
    }
    let mut complete = errs.is_empty();
    if complete && n < reqs {
        errs.push(("coverage-floor".to_string(), format!("elements {} < requirements {}", n, reqs)));
        complete = false;
    }
    Verdict { renderable: had_text, complete, n, errs, notes }
}
