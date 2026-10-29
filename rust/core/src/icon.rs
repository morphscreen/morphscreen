//! Icon names as models write them ("location", "MapPin", "ph-map-pin",
//! "settings-outline"), to the set's own (crate::icons, from spec/icons.json).

use crate::icons::{ALIASES, ICONS};
use alloc::string::String;

/// A written name as a lookup key: lower case words joined by dashes, without
/// the prefixes and style suffixes other icon sets use.
fn key(name: &str) -> String {
    let mut k = String::with_capacity(name.len() + 4);
    let mut prev_lower = false;
    for c in name.trim().chars() {
        if c.is_ascii_uppercase() && prev_lower {
            k.push('-');
        }
        prev_lower = c.is_ascii_lowercase() || c.is_ascii_digit();
        match c {
            c if c.is_ascii_alphanumeric() => k.push(c.to_ascii_lowercase()),
            _ if !k.ends_with('-') && !k.is_empty() => k.push('-'),
            _ => {}
        }
    }
    let mut k = String::from(k.trim_end_matches('-'));
    for p in ["ph-", "lucide-", "icon-", "fa-", "mdi-", "material-", "heroicons-", "i-"] {
        if let Some(r) = k.strip_prefix(p) {
            k = r.into();
        }
    }
    for s in ["-icon", "-outline", "-outlined", "-filled", "-fill", "-bold", "-regular", "-solid", "-line", "-alt", "-2"] {
        if let Some(r) = k.strip_suffix(s) {
            k = r.into();
        }
    }
    k
}

fn exact(k: &str) -> Option<(&'static str, &'static str)> {
    ICONS.binary_search_by(|(n, _)| (*n).cmp(k)).ok().map(|i| ICONS[i])
}

fn alias(k: &str) -> Option<(&'static str, &'static str)> {
    ALIASES.binary_search_by(|(a, _)| (*a).cmp(k)).ok().and_then(|i| exact(ALIASES[i].1))
}

/// The icon a written name means, as (name, path), if the set has one.
pub fn find(name: &str) -> Option<(&'static str, &'static str)> {
    let k = key(name);
    if k.is_empty() {
        return None;
    }
    if let Some(x) = exact(&k).or_else(|| alias(&k)) {
        return Some(x);
    }
    // "users" for "user", "calendars" for "calendar".
    for s in ["es", "s"] {
        if let Some(r) = k.strip_suffix(s) {
            if let Some(x) = exact(r).or_else(|| alias(r)) {
                return Some(x);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::find;

    #[test]
    fn names_from_other_sets_resolve() {
        for (written, want) in [("map-pin", "map-pin"), ("MapPin", "map-pin"), ("location", "map-pin"), ("ph-gear", "gear"), ("settings-outline", "gear"), ("Calendar", "calendar"), ("trending_up", "trend-up"), ("plane", "airplane"), ("Users", "users")] {
            assert_eq!(find(written).map(|x| x.0), Some(want), "{written}");
        }
        assert!(find("not-an-icon-name").is_none());
        assert!(find("").is_none());
    }

    #[test]
    fn the_tables_are_sorted() {
        assert!(crate::icons::ICONS.windows(2).all(|w| w[0].0 < w[1].0));
        assert!(crate::icons::ALIASES.windows(2).all(|w| w[0].0 < w[1].0));
    }
}
