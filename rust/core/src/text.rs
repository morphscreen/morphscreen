//! Text clean-up shared by every node: emojis out, dashes that never start a
//! line, and the HTML models slip in read as formatting.

use crate::emoji::EXT_PICT;
use alloc::string::String;
use alloc::vec::Vec;

/// Marks a line break inside a paragraph or table cell (from `<br>`).
pub const BR: char = '\u{3}';

pub fn is_ext_pict(c: char) -> bool {
    let u = c as u32;
    EXT_PICT
        .binary_search_by(|&(lo, hi)| {
            if hi < u {
                core::cmp::Ordering::Less
            } else if lo > u {
                core::cmp::Ordering::Greater
            } else {
                core::cmp::Ordering::Equal
            }
        })
        .is_ok()
}

/// An emoji the format strips: pictographic, but not ©, ® or ™.
pub fn is_strippable(c: char) -> bool {
    !matches!(c, '\u{A9}' | '\u{AE}' | '\u{2122}') && is_ext_pict(c)
}

fn is_modifier(c: char) -> bool {
    matches!(c, '\u{FE0F}' | '\u{20E3}' | '\u{1F3FB}'..='\u{1F3FF}')
}

/// Removes emojis with their modifiers, joiners and one following space.
pub fn strip_emoji(s: &str) -> String {
    // Nothing below U+00A9 is an emoji or a modifier: most text leaves here.
    if !s.chars().any(|c| (c as u32) >= 0xA9) {
        return String::from(s);
    }
    let mut out = String::with_capacity(s.len());
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        if (c as u32) >= 0xA9 && is_strippable(c) {
            loop {
                match it.peek().copied() {
                    Some(m) if is_modifier(m) => {
                        it.next();
                    }
                    Some('\u{200D}') => {
                        let mut look = it.clone();
                        look.next();
                        match look.peek().copied() {
                            Some(e) if is_ext_pict(e) => {
                                it.next();
                                it.next();
                                if it.peek() == Some(&'\u{FE0F}') {
                                    it.next();
                                }
                            }
                            _ => break,
                        }
                    }
                    _ => break,
                }
            }
            if it.peek() == Some(&' ') {
                it.next();
            }
            continue;
        }
        if c == '\u{FE0F}' || c == '\u{20E3}' {
            continue;
        }
        out.push(c);
    }
    out
}

/// How many bytes at the end of `s` could still be the start of an emoji
/// sequence, so a stream holds them back until the next chunk.
pub fn emoji_tail(s: &str) -> usize {
    let mut start = None;
    for (i, c) in s.char_indices().rev() {
        if is_strippable(c) {
            start = Some(i);
            break;
        }
        if !(is_modifier(c) || c == '\u{200D}' || is_ext_pict(c)) {
            break;
        }
    }
    start.map(|i| s.len() - i).unwrap_or(0)
}

/// A dash between words never starts a line: " - " becomes "\u{a0}- ".
pub fn dashes(s: &str) -> String {
    if !s.contains(" -") && !s.contains(" \u{2013}") && !s.contains(" \u{2014}") {
        return String::from(s);
    }
    let cs: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < cs.len() {
        if cs[i] == ' ' && i + 2 < cs.len() && matches!(cs[i + 1], '-' | '\u{2013}' | '\u{2014}') && cs[i + 2] == ' ' {
            out.push('\u{a0}');
            out.push(cs[i + 1]);
            out.push(' ');
            i += 3;
        } else {
            out.push(cs[i]);
            i += 1;
        }
    }
    out
}

fn eq_ci(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).all(|(x, y)| x.to_ascii_lowercase() == y)
}

/// A tag at byte `i` of `s`: (closing?, name, end byte after '>'). Only when
/// the name is followed by a non-word character, like the regex `\b`.
fn tag_at(s: &str, i: usize) -> Option<(bool, &str, usize)> {
    let b = s.as_bytes();
    if b.get(i) != Some(&b'<') {
        return None;
    }
    let mut j = i + 1;
    let close = b.get(j) == Some(&b'/');
    if close {
        j += 1;
    }
    let ns = j;
    while j < b.len() && b[j].is_ascii_alphanumeric() {
        j += 1;
    }
    if j == ns {
        return None;
    }
    if j < b.len() && (b[j] == b'_') {
        return None;
    }
    let name = &s[ns..j];
    let end = s[j..].find('>')? + j + 1;
    Some((close, name, end))
}

/// The line-level HTML conversions, as render/html.ts's fromHtml: `<br>` is a
/// line break, `<p>`/`<div>`/list tags are paragraph breaks (line breaks in a
/// table row), headings become Markdown headings, layout tags are dropped.
pub fn from_html(line: &str) -> String {
    if !line.contains('<') {
        return String::from(line);
    }
    let row = line.trim_start().starts_with('|');
    // <br>, <br/>, <br /> (no attributes)
    let mut s = String::with_capacity(line.len());
    let mut i = 0;
    while i < line.len() {
        let rest = &line[i..];
        if rest.len() >= 3 && rest.as_bytes()[0] == b'<' && rest.as_bytes()[1..3].eq_ignore_ascii_case(b"br") {
            let t = rest[3..].trim_start();
            let t = t.strip_prefix('/').unwrap_or(t);
            if let Some(after) = t.strip_prefix('>') {
                s.push(BR);
                i = line.len() - after.len();
                continue;
            }
        }
        let c = rest.chars().next().unwrap();
        s.push(c);
        i += c.len_utf8();
    }
    // <hN>text</hN>
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        if let Some((false, name, end)) = tag_at(&s, i) {
            if name.len() == 2 && (name.as_bytes()[0] | 0x20) == b'h' && (b'1'..=b'6').contains(&name.as_bytes()[1]) {
                let level = (name.as_bytes()[1] - b'0') as usize;
                let mut k = end;
                let mut found = None;
                while let Some(p) = s[k..].find("</") {
                    let at = k + p;
                    if let Some((true, n2, e2)) = tag_at(&s, at) {
                        if eq_ci(n2, name) {
                            found = Some((at, e2));
                            break;
                        }
                    }
                    k = at + 2;
                }
                if let Some((at, e2)) = found {
                    let text = &s[end..at];
                    if row {
                        out.push_str("**");
                        out.push_str(text);
                        out.push_str("**");
                        out.push(BR);
                    } else {
                        out.push_str("\n\n");
                        for _ in 0..level {
                            out.push('#');
                        }
                        out.push(' ');
                        out.push_str(text);
                        out.push_str("\n\n");
                    }
                    i = e2;
                    continue;
                }
            }
        }
        let c = s[i..].chars().next().unwrap();
        out.push(c);
        i += c.len_utf8();
    }
    // block tags and layout tags
    let mut done = String::with_capacity(out.len());
    let mut i = 0;
    while i < out.len() {
        if let Some((_, name, end)) = tag_at(&out, i) {
            if ["p", "div", "li", "ul", "ol"].iter().any(|t| eq_ci(name, t)) {
                if row {
                    done.push(BR);
                } else {
                    done.push_str("\n\n");
                }
                i = end;
                continue;
            }
            if ["span", "font", "center", "section", "article", "header", "footer", "label", "a"].contains(&name) {
                i = end;
                continue;
            }
        }
        let c = out[i..].chars().next().unwrap();
        done.push(c);
        i += c.len_utf8();
    }
    done
}

/// Splits a table row into its cells: outer pipes dropped, each cell
/// trimmed. A pipe inside a component tag (`options="A | B"`) or a code span
/// doesn't split.
pub fn cells(line: &str) -> Vec<String> {
    let t = line.trim();
    let t = t.strip_prefix('|').unwrap_or(t);
    let t = t.strip_suffix('|').unwrap_or(t);
    let mut out = Vec::new();
    let mut cur = String::new();
    let (mut tag, mut quote, mut code) = (false, None::<char>, false);
    let mut it = t.chars().peekable();
    while let Some(c) = it.next() {
        match c {
            '`' if !tag => code = !code,
            '<' if !code && !tag && it.peek().map_or(false, |n| n.is_ascii_uppercase()) => tag = true,
            '"' | '\'' if tag => match quote {
                Some(q) if q == c => quote = None,
                None => quote = Some(c),
                _ => {}
            },
            '>' if tag && quote.is_none() => tag = false,
            '|' if !tag && !code => {
                out.push(String::from(cur.trim()));
                cur.clear();
                continue;
            }
            _ => {}
        }
        cur.push(c);
    }
    out.push(String::from(cur.trim()));
    out
}

/// A separator row under a table's header: `|---|:--:|`.
pub fn is_separator(line: &str) -> bool {
    let t = line.trim();
    let t = t.strip_prefix('|').unwrap_or(t);
    let t = t.trim_start();
    let t = t.strip_prefix(':').unwrap_or(t);
    t.starts_with("--")
}

/// UTF-16 length, the way JavaScript counts a string.
pub fn js_len(s: &str) -> usize {
    s.chars().map(|c| c.len_utf16()).sum()
}

/// The first `n` UTF-16 units of `s`, as JavaScript's slice(0, n).
pub fn js_slice(s: &str, n: usize) -> String {
    let mut out = String::new();
    let mut k = 0;
    for c in s.chars() {
        if k + c.len_utf16() > n {
            break;
        }
        k += c.len_utf16();
        out.push(c);
    }
    out
}
