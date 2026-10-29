// Embeds every pack in spec/packs, so callers name packs instead of shipping
// their JSON.
use std::{env, fs, path::Path};

fn main() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../spec/packs");
    println!("cargo:rerun-if-changed={}", dir.display());
    let mut names: Vec<String> = fs::read_dir(&dir)
        .expect("spec/packs")
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.ends_with(".json"))
        .collect();
    names.sort();
    let mut out = String::from("/// The packs in spec/packs, by name.\npub fn embedded(name: &str) -> Option<&'static str> {\n    match name {\n");
    for n in &names {
        let stem = n.trim_end_matches(".json");
        let path = dir.join(n).canonicalize().unwrap();
        println!("cargo:rerun-if-changed={}", path.display());
        out.push_str(&format!("        {:?} => Some(include_str!({:?})),\n", stem, path.display().to_string()));
    }
    out.push_str("        _ => None,\n    }\n}\n\n/// Every embedded pack's name.\npub const NAMES: &[&str] = &[");
    for n in &names {
        out.push_str(&format!("{:?}, ", n.trim_end_matches(".json")));
    }
    out.push_str("];\n");
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join("packs.rs"), out).unwrap();
    synonyms();
}

/// spec/synonyms.json as a match: (attribute, value) to the allowed value it
/// stands for. The file is a flat object of objects of strings ("about" aside).
fn synonyms() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../spec/synonyms.json");
    println!("cargo:rerun-if-changed={}", path.display());
    let text = fs::read_to_string(&path).expect("spec/synonyms.json");
    let strings: Vec<String> = {
        let mut v = Vec::new();
        let mut chars = text.chars().peekable();
        let mut depth = 0;
        let mut marks: Vec<(usize, String)> = Vec::new();
        while let Some(c) = chars.next() {
            match c {
                '{' => depth += 1,
                '}' => depth -= 1,
                '"' => {
                    let mut s = String::new();
                    while let Some(d) = chars.next() {
                        match d {
                            '\\' => s.push(chars.next().unwrap()),
                            '"' => break,
                            _ => s.push(d),
                        }
                    }
                    marks.push((depth, s));
                }
                _ => {}
            }
        }
        // Depth 1: attribute names (and "about" with its text); depth 2: value pairs.
        let mut attr = String::new();
        let mut i = 0;
        while i < marks.len() {
            let (d, s) = &marks[i];
            if *d == 1 {
                if s == "about" {
                    i += 2;
                    continue;
                }
                attr = s.clone();
                i += 1;
            } else {
                v.push(format!("        ({:?}, {:?}) => Some({:?}),\n", attr, s, marks[i + 1].1));
                i += 2;
            }
        }
        v
    };
    let mut out = String::from("/// spec/synonyms.json: the allowed value `value` stands for on attribute `attr`.\npub fn synonym(attr: &str, value: &str) -> Option<&'static str> {\n    match (attr, value) {\n");
    for s in strings {
        out.push_str(&s);
    }
    out.push_str("        _ => None,\n    }\n}\n");
    fs::write(Path::new(&env::var("OUT_DIR").unwrap()).join("synonyms.rs"), out).unwrap();
}
