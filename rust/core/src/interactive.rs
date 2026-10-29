//! The interactive pack's components, worked out once here: which of a
//! Question's choices is right, a Checklist's done marks, and a What-if
//! Result's formula with its first value.

use crate::inline::{self, Span};
use crate::tree::Node;
use alloc::string::String;
use alloc::vec::Vec;

/// A choice or an answer as plain words: no Markdown, no "B." or "(2)" in front.
fn words(s: &str) -> String {
    let mut t = String::new();
    inline::plain(&inline::parse(s), &mut t);
    let t = t.trim();
    let label_end = t.find(|c: char| c == '.' || c == ')' || c == ':').filter(|&i| i <= 3 && t[..i].trim_start_matches('(').chars().all(|c| c.is_ascii_alphanumeric()) && t[i + 1..].starts_with(' '));
    let t = match label_end {
        Some(i) => t[i + 1..].trim(),
        None => t,
    };
    t.to_lowercase().trim_end_matches(['.', '!', '?']).trim().into()
}

/// Which choice the answer names: its letter ("B", "b)"), its number ("2"),
/// or its words, the way a quiz key is written.
pub fn answer_index(answer: &str, choices: &[&str]) -> Option<usize> {
    let a = answer.trim();
    let key = a.trim_start_matches('(').trim_end_matches(['.', ')', ':']);
    if key.chars().count() == 1 {
        let c = key.chars().next()?;
        if c.is_ascii_alphabetic() {
            let i = (c.to_ascii_uppercase() as u8 - b'A') as usize;
            if i < choices.len() {
                return Some(i);
            }
        }
    }
    if let Ok(n) = key.parse::<usize>() {
        if (1..=choices.len()).contains(&n) {
            return Some(n - 1);
        }
    }
    let want = words(a);
    if want.is_empty() {
        return None;
    }
    let mine: Vec<String> = choices.iter().map(|c| words(c)).collect();
    mine.iter().position(|c| *c == want).or_else(|| {
        // "Chlorophyll" for "Chlorophyll in the chloroplasts": only when one choice holds it.
        let holds: Vec<usize> = mine.iter().enumerate().filter(|(_, c)| want.chars().count() >= 3 && (c.contains(want.as_str()) || want.contains(c.as_str()))).map(|(i, _)| i).collect();
        (holds.len() == 1).then(|| holds[0])
    })
}

/// A slider's name in a formula: its name, or its label as one word
/// ("Unit price ($)" is unit_price).
pub fn slider_name(n: &Node) -> String {
    if let Some(name) = n.attr("name").filter(|s| !s.trim().is_empty()) {
        return name.trim().into();
    }
    let label = n.attr("label").unwrap_or("").to_lowercase();
    let mut out = String::new();
    for c in label.chars() {
        if c.is_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('_') {
            out.push('_');
        }
    }
    out.trim_end_matches('_').into()
}

/// The What-if around a node: the nearest one above it.
pub fn whatif_of(nodes: &[Node], n: usize) -> Option<usize> {
    let mut a = nodes[n].parent;
    loop {
        if nodes[a].ty == "WhatIf" {
            return Some(a);
        }
        if a == 0 {
            return None;
        }
        a = nodes[a].parent;
    }
}

/// The sliders among these nodes and inside them, in the order they're
/// written: a What-if's own, wherever they sit in it (a Columns, say), but
/// not those of a What-if inside it.
pub fn sliders_in(nodes: &[Node], kids: &[usize]) -> Vec<usize> {
    let mut out = Vec::new();
    for &k in kids {
        match nodes[k].ty.as_str() {
            "Slider" => out.push(k),
            "WhatIf" => {}
            _ => out.extend(sliders_in(nodes, &nodes[k].children)),
        }
    }
    out
}

/// The decimal places a slider's numbers are written to (6.25 is two).
pub fn places(n: &Node) -> usize {
    let at = |k: &str| n.attr(k).and_then(|v| v.trim().split_once('.').map(|(_, f)| f.trim_end_matches('0').len())).unwrap_or(0);
    ["min", "max", "value", "step"].iter().map(|k| at(k)).max().unwrap_or(0).min(6)
}

/// A slider's value put on its step from min, as a browser puts it the
/// first time the reader moves anything: the new value when it was off it,
/// and a step when it had none and its numbers have decimals (a browser's
/// own is 1, which would round 0.35 to 0).
pub fn on_step(n: &Node) -> (Option<String>, Option<String>) {
    let num = |k: &str| n.attr(k).and_then(|v| v.trim().replace(',', "").parse::<f64>().ok()).filter(|v| v.is_finite());
    let d = places(n);
    let (lo, hi) = (num("min").unwrap_or(0.0), num("max").unwrap_or(100.0));
    let (step, added) = match num("step").filter(|s| *s > 0.0) {
        Some(s) => (s, None),
        None if d > 0 => {
            let s = libm::pow(10.0, -(d as f64));
            (s, Some(crate::jsnum::fixed_num(s, d)))
        }
        None => (1.0, None),
    };
    let Some(v) = num("value") else { return (None, added) };
    if hi < lo {
        return (None, added);
    }
    let top = lo + libm::floor((hi - lo) / step + 1e-9) * step;
    let on = (lo + crate::jsnum::round((v - lo) / step) * step).clamp(lo, top);
    ((libm::fabs(on - v) > 1e-9 * libm::fmax(step, 1.0)).then(|| crate::jsnum::fixed_num(on, d)), added)
}

/// A slider's starting value: its value, or its min.
pub fn slider_value(n: &Node) -> Option<f64> {
    n.attr("value").or_else(|| n.attr("min")).and_then(|v| v.trim().replace(',', "").parse().ok())
}

/// A checklist item and whether it's done: "[x] Book flights" is done.
pub fn check(item: &str) -> (bool, Vec<Span>) {
    let t = item.trim_start();
    for (mark, done) in [("[x]", true), ("[X]", true), ("[ ]", false), ("[]", false)] {
        if let Some(rest) = t.strip_prefix(mark) {
            return (done, inline::parse(rest.trim_start()));
        }
    }
    (false, inline::parse(t))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_answer_names_its_choice() {
        let c = ["A. Stomata", "B. Chlorophyll", "C. Xylem"];
        for (a, want) in [("B", Some(1)), ("b)", Some(1)), ("2", Some(1)), ("Chlorophyll", Some(1)), ("B. Chlorophyll", Some(1)), ("chlorophyll.", Some(1)), ("D", None), ("Mitochondria", None)] {
            assert_eq!(answer_index(a, &c), want, "{a}");
        }
        let plain = ["Paris", "Lyon", "**Marseille**"];
        assert_eq!(answer_index("Marseille", &plain), Some(2));
        assert_eq!(answer_index("C", &plain), Some(2));
    }
}

/// How long the key a model wrote before choice `k` is ("A. ", "b) ", "(C) "),
/// if it wrote the letter that choice would get.
fn key_len(s: &str, k: usize) -> Option<usize> {
    let (up, low) = ((b'A' + k as u8) as char, (b'a' + k as u8) as char);
    let t = s.trim_start();
    let lead = t.len() - t.trim_start_matches('(').len();
    let mut c = t[lead..].chars();
    let l = c.next()?;
    if l != up && l != low {
        return None;
    }
    let rest = c.as_str();
    let rest = if lead > 0 { rest.strip_prefix(')')? } else { rest.strip_prefix(['.', ')', ':'])? };
    rest.starts_with(' ').then(|| s.len() - rest.trim_start().len())
}

/// Choices the model lettered itself ("A. Stomata", "b) Xylem", "(C) Phloem"),
/// without their letters, when every choice has the next letter (a renderer
/// that draws its own keys shows them once); otherwise as written.
pub fn strip_keys(items: &[Vec<Span>]) -> Vec<Vec<Span>> {
    fn lead(it: &[Span]) -> Option<&str> {
        match it.first() {
            Some(Span::Text(t)) => Some(t.as_str()),
            _ => None,
        }
    }
    let all = items.len() >= 2 && items.len() <= 26 && items.iter().enumerate().all(|(k, it)| lead(it).and_then(|t| key_len(t, k)).is_some());
    items
        .iter()
        .enumerate()
        .map(|(k, it)| {
            let mut it = it.clone();
            if all {
                if let Some(Span::Text(t)) = it.first_mut() {
                    let n = key_len(t, k).unwrap();
                    *t = String::from(&t[n..]);
                }
            }
            it
        })
        .collect()
}
