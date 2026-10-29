//! The document tree the ops describe, and the ops' JSON.

use crate::inline::{Attrs, Span};
use crate::json::{write_num, write_str};
use alloc::string::String;
use alloc::vec::Vec;

#[derive(Clone, Debug, PartialEq)]
pub enum Data {
    /// A Chart's or Map's table: the header, then the rows as written.
    Table { columns: Vec<String>, rows: Vec<Vec<String>> },
    /// FollowUps: one entry per list item.
    List { items: Vec<Vec<Span>> },
    /// Gallery: the images, in order.
    Images { images: Vec<Image> },
    /// A Markdown table: which columns are all numbers (aligned right).
    Align(Vec<bool>),
    /// What the core works out for a renderer: a Math formula as Unicode
    /// (one line), a QR code's module rows ("1" dark, "0" light).
    Lines(Vec<String>),
    /// Columns: the most cells a row holds and the narrowest a cell may get (crate::layout).
    Layout { per: usize, min: usize },
    /// A Question's choices and which one is right (None: the answer named none of them).
    Choices { items: Vec<Vec<Span>>, answer: Option<usize> },
    /// A Checklist's items and whether each is done ("[x]").
    Checks { items: Vec<(bool, Vec<Span>)> },
    /// A What-if Result: its formula in postfix tokens (crate::formula) and its
    /// value at the sliders' starting values.
    Formula { rpn: Vec<String>, value: Option<f64> },
}

/// A Markdown image: where it loads from, what it shows, and its credit
/// line (the title, parsed; empty when there is none). `find` as the source
/// asks the API for a photo of what the alt text names.
#[derive(Clone, Debug, PartialEq)]
pub struct Image {
    pub src: String,
    pub alt: String,
    pub credit: Vec<Span>,
    /// In a Gallery: the words after the image on its line.
    pub caption: Vec<Span>,
}

#[derive(Clone, Debug)]
pub struct Node {
    /// Position: child indexes from the root joined with dots ("" is the root).
    pub id: String,
    /// A component name (aliases resolved), "group", or a block type: p, h,
    /// ul, ol, li, table, row, cell, code, quote, hr.
    pub ty: String,
    /// The name as the model wrote it (what a closing tag must match).
    pub written: String,
    pub attrs: Attrs,
    pub children: Vec<usize>,
    pub spans: Vec<Span>,
    pub data: Option<Data>,
    /// The text inside a component whose content isn't Markdown blocks.
    pub raw: String,
    pub line: usize,
    pub parent: usize,
    pub closed: bool,
    pub component: bool,
    /// Not in the catalog: shown as its content, reported.
    pub unknown: bool,
    /// A text run between components inside Columns, kept together as one cell.
    pub run: bool,
    /// Tables: the separator row was there; the widest row, in cells.
    pub sep: bool,
    pub max_cols: usize,
    /// Quotes: how many lines.
    pub lines: usize,
}

impl Node {
    pub fn attr(&self, k: &str) -> Option<&str> {
        self.attrs.iter().find(|(key, _)| key == k).map(|(_, v)| v.as_deref().unwrap_or(""))
    }
    pub fn has(&self, k: &str) -> bool {
        self.attrs.iter().any(|(key, _)| key == k)
    }
    /// A boolean attribute: bare, or "true".
    pub fn flag(&self, k: &str) -> bool {
        self.attrs.iter().any(|(key, v)| key == k && v.as_deref().map_or(true, |s| s.eq_ignore_ascii_case("true")))
    }
}

pub fn write_attrs(out: &mut String, attrs: &Attrs) {
    out.push('{');
    for (i, (k, v)) in attrs.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        write_str(out, k);
        out.push(':');
        match v {
            Some(s) => write_str(out, s),
            None => out.push_str("true"),
        }
    }
    out.push('}');
}

/// Spans as sent: plain text as a string, anything else as an array.
pub fn write_spans_field(out: &mut String, spans: &[Span]) {
    match spans {
        [Span::Text(t)] => write_str(out, t),
        _ => write_spans(out, spans),
    }
}

/// Inline text (a table cell, a list item) parsed as the core parses content,
/// as span JSON: native renderers draw pack cells with it.
pub fn inline_json(text: &str) -> String {
    let mut out = String::new();
    write_spans(&mut out, &crate::inline::parse(text));
    out
}

pub fn write_spans(out: &mut String, spans: &[Span]) {
    out.push('[');
    for (i, s) in spans.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        match s {
            Span::Text(t) => {
                out.push_str("{\"t\":\"text\",\"v\":");
                write_str(out, t);
                out.push('}');
            }
            Span::Code(t) => {
                out.push_str("{\"t\":\"code\",\"v\":");
                write_str(out, t);
                out.push('}');
            }
            Span::Fmt(f, c) => {
                out.push_str("{\"t\":");
                write_str(out, f);
                out.push_str(",\"c\":");
                write_spans(out, c);
                out.push('}');
            }
            Span::Link(h, c) => {
                out.push_str("{\"t\":\"link\",\"href\":");
                write_str(out, h);
                out.push_str(",\"c\":");
                write_spans(out, c);
                out.push('}');
            }
            Span::Img { src, alt, credit } => {
                out.push_str("{\"t\":\"img\",\"src\":");
                write_str(out, src);
                out.push_str(",\"alt\":");
                write_str(out, alt);
                if !credit.is_empty() {
                    out.push_str(",\"credit\":");
                    write_spans(out, credit);
                }
                out.push('}');
            }
            Span::Br => out.push_str("{\"t\":\"br\"}"),
            Span::El { ty, attrs, children } => {
                out.push_str("{\"t\":\"el\",\"type\":");
                write_str(out, ty);
                out.push_str(",\"attrs\":");
                write_attrs(out, attrs);
                out.push_str(",\"c\":");
                write_spans(out, children);
                out.push('}');
            }
        }
    }
    out.push(']');
}

pub fn write_data(out: &mut String, d: &Data) {
    match d {
        Data::Table { columns, rows } => {
            out.push_str("{\"columns\":[");
            for (i, c) in columns.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_str(out, c);
            }
            out.push_str("],\"rows\":[");
            for (i, r) in rows.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push('[');
                for (j, c) in r.iter().enumerate() {
                    if j > 0 {
                        out.push(',');
                    }
                    write_str(out, c);
                }
                out.push(']');
            }
            out.push_str("]}");
        }
        Data::List { items } => {
            out.push_str("{\"items\":[");
            for (i, it) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_spans(out, it);
            }
            out.push_str("]}");
        }
        Data::Choices { items, answer } => {
            out.push_str("{\"items\":[");
            for (i, it) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_spans(out, it);
            }
            out.push_str("],\"answer\":");
            match answer {
                Some(a) => write_num(out, *a as f64),
                None => out.push_str("null"),
            }
            out.push('}');
        }
        Data::Checks { items } => {
            out.push_str("{\"checks\":[");
            for (i, (done, it)) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(if *done { "{\"done\":true,\"c\":" } else { "{\"done\":false,\"c\":" });
                write_spans(out, it);
                out.push('}');
            }
            out.push_str("]}");
        }
        Data::Formula { rpn, value } => {
            out.push_str("{\"formula\":[");
            for (i, t) in rpn.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_str(out, t);
            }
            out.push_str("],\"value\":");
            match value {
                Some(v) => write_num(out, *v),
                None => out.push_str("null"),
            }
            out.push('}');
        }
        Data::Images { images } => {
            out.push_str("{\"images\":[");
            for (i, im) in images.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str("{\"src\":");
                write_str(out, &im.src);
                out.push_str(",\"alt\":");
                write_str(out, &im.alt);
                if !im.credit.is_empty() {
                    out.push_str(",\"credit\":");
                    write_spans(out, &im.credit);
                }
                if !im.caption.is_empty() {
                    out.push_str(",\"caption\":");
                    write_spans(out, &im.caption);
                }
                out.push('}');
            }
            out.push_str("]}");
        }
        Data::Layout { per, min } => {
            out.push_str(&alloc::format!("{{\"layout\":{{\"per\":{per},\"min\":{min}}}}}"));
        }
        Data::Lines(lines) => {
            out.push_str("{\"lines\":[");
            for (i, l) in lines.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_str(out, l);
            }
            out.push_str("]}");
        }
        Data::Align(cols) => {
            out.push_str("{\"align\":[");
            for (i, n) in cols.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(if *n { "\"right\"" } else { "\"\"" });
            }
            out.push_str("]}");
        }
    }
}

/// The whole tree as JSON (what the conformance tests compare).
pub fn write_tree(out: &mut String, nodes: &[Node], i: usize) {
    let n = &nodes[i];
    out.push_str("{\"type\":");
    write_str(out, &n.ty);
    if !n.attrs.is_empty() {
        out.push_str(",\"attrs\":");
        write_attrs(out, &n.attrs);
    }
    if !n.spans.is_empty() {
        out.push_str(",\"spans\":");
        write_spans(out, &n.spans);
    }
    if let Some(d) = &n.data {
        out.push_str(",\"data\":");
        write_data(out, d);
    }
    if !n.children.is_empty() {
        out.push_str(",\"children\":[");
        for (k, c) in n.children.iter().enumerate() {
            if k > 0 {
                out.push(',');
            }
            write_tree(out, nodes, *c);
        }
        out.push(']');
    }
    out.push('}');
}

/// A number for an op (line numbers).
pub fn num(out: &mut String, n: usize) {
    write_num(out, n as f64);
}
