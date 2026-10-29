//! The catalog: core, then the named packs, then an app's own components,
//! checked when built. Same rules and same hash as spec/catalog.ts.

use crate::json::{self, Value};
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

include!(concat!(env!("OUT_DIR"), "/packs.rs"));

/// The pack name that stands for every pack the core carries, what the API
/// and the SDKs use unless told otherwise.
pub const ALL: &str = "all";

#[derive(Clone, Debug, PartialEq)]
pub enum AttrType {
    Str,
    Num,
    Bool,
    Url,
    List,
    /// An icon's name (crate::icon).
    Icon,
    Enum(Vec<String>),
}

#[derive(Clone, Debug)]
pub struct AttrSpec {
    pub name: String,
    pub ty: AttrType,
    pub required: bool,
    pub default: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Content {
    Any,
    Text,
    Table,
    Images,
    List,
    /// Code exactly as written (a fence around it is optional): no Markdown, no tags.
    Code,
    None,
    Only(String),
}

#[derive(Clone, Debug)]
pub struct Component {
    pub name: String,
    pub about: String,
    pub attrs: Vec<AttrSpec>,
    pub content: Content,
    pub parent: Option<String>,
    /// A table whose columns after the first must be numbers (a chart's series).
    pub numeric: bool,
    /// A text component Buttons may go inside, drawn as its actions.
    pub actions: bool,
    pub origin: String,
}

impl Component {
    pub fn attr(&self, name: &str) -> Option<&AttrSpec> {
        self.attrs.iter().find(|a| a.name == name)
    }
}

#[derive(Clone, Debug)]
pub struct Catalog {
    pub packs: Vec<(String, String)>,
    pub components: Vec<Component>,
    /// alias name, what it's read as ("group" or a component), origin
    pub aliases: Vec<(String, String, String)>,
    pub hash: String,
}

const TONES: [&str; 5] = ["neutral", "info", "success", "warning", "danger"];

fn is_name(s: &str) -> bool {
    let mut cs = s.chars();
    matches!(cs.next(), Some(c) if c.is_ascii_uppercase()) && cs.all(|c| c.is_ascii_alphanumeric())
}

fn is_attr_name(s: &str) -> bool {
    let mut cs = s.chars();
    matches!(cs.next(), Some(c) if c.is_ascii_lowercase()) && cs.all(|c| c.is_ascii_alphanumeric())
}

fn content_of(s: &str) -> Option<Content> {
    Some(match s {
        "any" => Content::Any,
        "text" => Content::Text,
        "table" => Content::Table,
        "images" => Content::Images,
        "list" => Content::List,
        "code" => Content::Code,
        "none" => Content::None,
        _ => match s.strip_prefix("only:") {
            Some(t) if is_name(t) => Content::Only(t.to_string()),
            _ => return None,
        },
    })
}

fn component(name: &str, v: &Value, origin: &str, errors: &mut Vec<String>) -> Option<Component> {
    let at = format!("{}: {}", origin, name);
    let mut ok = true;
    if !is_name(name) {
        errors.push(format!("{}: a component name starts with an uppercase letter and has only letters and digits", at));
        ok = false;
    }
    let about = v.get("about").and_then(Value::as_str).unwrap_or("").to_string();
    if about.trim().is_empty() {
        errors.push(format!("{}: needs \"about\", the one line the model reads", at));
        ok = false;
    }
    let content_s = v.get("content").and_then(Value::as_str).unwrap_or("");
    let content = match content_of(content_s) {
        Some(c) => c,
        None => {
            errors.push(format!("{}: unknown content \"{}\"", at, content_s));
            ok = false;
            Content::Any
        }
    };
    let numeric = match v.get("columns") {
        None => false,
        Some(Value::Str(s)) if s == "numeric" && content == Content::Table => true,
        Some(_) => {
            errors.push(format!("{}: columns is \"numeric\", and only on a table", at));
            ok = false;
            false
        }
    };
    let mut attrs = Vec::new();
    for (attr, raw) in v.get("attrs").and_then(Value::as_obj).unwrap_or(&[]) {
        if !is_attr_name(attr) {
            errors.push(format!("{}.{}: attribute names are camelCase", at, attr));
            ok = false;
        }
        let (tyv, required, default) = match raw {
            Value::Obj(_) => (
                raw.get("type").cloned().unwrap_or(Value::Null),
                raw.get("required").and_then(Value::as_bool).unwrap_or(false),
                raw.get("default").map(|d| match d {
                    Value::Str(s) => s.clone(),
                    other => json::to_string(other),
                }),
            ),
            other => (other.clone(), false, None),
        };
        let ty = match &tyv {
            Value::Arr(vals) => {
                let vals: Vec<String> = vals.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect();
                if vals.is_empty() {
                    errors.push(format!("{}.{}: an enum needs values", at, attr));
                    ok = false;
                }
                if let Some(d) = &default {
                    if !vals.contains(d) {
                        errors.push(format!("{}.{}: default \"{}\" isn't one of the values", at, attr, d));
                        ok = false;
                    }
                }
                if attr == "tone" && vals.iter().any(|x| !TONES.contains(&x.as_str())) {
                    errors.push(format!("{}.tone: tone is always {}", at, TONES.join(", ")));
                    ok = false;
                }
                AttrType::Enum(vals)
            }
            Value::Str(s) => match s.as_str() {
                "string" => AttrType::Str,
                "number" => AttrType::Num,
                "boolean" => AttrType::Bool,
                "url" => AttrType::Url,
                "list" => AttrType::List,
                "icon" => AttrType::Icon,
                other => {
                    errors.push(format!("{}.{}: unknown type \"{}\"", at, attr, other));
                    ok = false;
                    AttrType::Str
                }
            },
            _ => {
                errors.push(format!("{}.{}: unknown type", at, attr));
                ok = false;
                AttrType::Str
            }
        };
        attrs.push(AttrSpec { name: attr.clone(), ty, required, default });
    }
    let parent = v.get("parent").and_then(Value::as_str).map(|s| s.to_string());
    let actions = match v.get("actions") {
        None => false,
        Some(Value::Bool(true)) if content == Content::Text => true,
        Some(_) => {
            errors.push(format!("{}: actions is true, and only on a text component", at));
            ok = false;
            false
        }
    };
    if !ok {
        return None;
    }
    Some(Component { name: name.to_string(), about, attrs, content, parent, numeric, actions, origin: origin.to_string() })
}

impl Catalog {
    /// Core alone.
    pub fn core() -> Catalog {
        Catalog::build(&[], &[]).expect("core pack is valid")
    }

    /// Core, then the named embedded packs ("all" names every one), then the
    /// app's own sets (pack JSON). A pack that comes in only through "all"
    /// gives way to the app's own: a component or alias the app defines too is
    /// left out of it (an app's own Product replaces commerce's). Named
    /// outright, a pack's clash with the app's own is an error, as ever.
    pub fn build(packs: &[&str], custom: &[&str]) -> Result<Catalog, String> {
        let mut sets: Vec<(Value, bool)> = Vec::new();
        let mut errors: Vec<String> = Vec::new();
        let mut named: Vec<&str> = Vec::new();
        for &p in packs {
            for n in if p == ALL { NAMES } else { core::slice::from_ref(&p) } {
                if *n != "core" && !named.contains(n) {
                    named.push(n);
                }
            }
        }
        let own: Vec<Value> = custom.iter().map(|s| json::parse(s)).collect::<Result<_, _>>()?;
        let own_names: Vec<String> = own
            .iter()
            .flat_map(|s| ["components", "aliases"].into_iter().flat_map(move |k| s.get(k).and_then(Value::as_obj).unwrap_or(&[]).iter().map(|(n, _)| n.clone())))
            .collect();
        for name in core::iter::once("core").chain(named) {
            match embedded(name) {
                Some(src) => sets.push((json::parse(src)?, name != "core" && !packs.contains(&name))),
                None => errors.push(format!("no pack named \"{}\"", name)),
            }
        }
        for s in own {
            sets.push((s, false));
        }
        let mut cat = Catalog { packs: Vec::new(), components: Vec::new(), aliases: Vec::new(), hash: String::new() };
        let mut raw_components: Vec<(String, Value)> = Vec::new();
        let mut raw_aliases: Vec<(String, Value)> = Vec::new();
        let mut origin: Vec<(String, String)> = Vec::new();
        let origin_of = |origin: &Vec<(String, String)>, n: &str| origin.iter().find(|(k, _)| k == n).map(|(_, o)| o.clone());
        for (set, yields) in &sets {
            let gives_way = |n: &str| *yields && own_names.iter().any(|o| o == n);
            let name = set.get("name").and_then(Value::as_str).unwrap_or("").to_string();
            let version = set.get("version").and_then(Value::as_str).unwrap_or("").to_string();
            if cat.packs.iter().any(|(n, _)| *n == name) {
                errors.push(format!("\"{}\" is included twice", name));
            }
            cat.packs.push((name.clone(), version));
            for (cname, cv) in set.get("components").and_then(Value::as_obj).unwrap_or(&[]) {
                if gives_way(cname) {
                    continue;
                }
                let c = component(cname, cv, &name, &mut errors);
                if let Some(o) = origin_of(&origin, cname) {
                    errors.push(format!("{}: {} is already defined by {}", name, cname, o));
                } else if let Some(c) = c {
                    raw_components.push((cname.clone(), cv.clone()));
                    origin.push((cname.clone(), name.clone()));
                    cat.components.push(c);
                }
            }
            for (aname, av) in set.get("aliases").and_then(Value::as_obj).unwrap_or(&[]) {
                if gives_way(aname) {
                    continue;
                }
                if let Some(o) = origin_of(&origin, aname) {
                    errors.push(format!("{}: alias {} is already defined by {}", name, aname, o));
                } else {
                    let to = av.get("as").and_then(Value::as_str).unwrap_or("").to_string();
                    raw_aliases.push((aname.clone(), av.clone()));
                    origin.push((aname.clone(), name.clone()));
                    cat.aliases.push((aname.clone(), to, name.clone()));
                }
            }
        }
        for c in &cat.components {
            if let Some(p) = &c.parent {
                if cat.component(p).is_none() {
                    errors.push(format!("{}: {}'s parent {} doesn't exist", c.origin, c.name, p));
                }
            }
            if let Content::Only(t) = &c.content {
                if cat.component(t).is_none() {
                    errors.push(format!("{}: {} holds only {}, which doesn't exist", c.origin, c.name, t));
                }
            }
        }
        for (a, to, o) in &cat.aliases {
            if to != "group" && cat.component(to).is_none() {
                errors.push(format!("{}: alias {} points to {}, which doesn't exist", o, a, to));
            }
        }
        if !errors.is_empty() {
            return Err(format!("invalid catalog:\n  {}", errors.join("\n  ")));
        }
        // JSON.stringify([packs, components, aliases]), as spec/catalog.ts hashes it.
        let packs_v = Value::Arr(
            cat.packs
                .iter()
                .map(|(n, v)| Value::Obj(alloc::vec![("name".to_string(), Value::from(n.as_str())), ("version".to_string(), Value::from(v.as_str()))]))
                .collect(),
        );
        let all = Value::Arr(alloc::vec![packs_v, Value::Obj(raw_components), Value::Obj(raw_aliases)]);
        cat.hash = crate::sha256::hex(json::to_string(&all).as_bytes(), 12);
        Ok(cat)
    }

    pub fn component(&self, name: &str) -> Option<&Component> {
        self.components.iter().find(|c| c.name == name)
    }

    /// What an alias is read as, if `name` is one.
    pub fn alias(&self, name: &str) -> Option<&str> {
        self.aliases.iter().find(|(a, _, _)| a == name).map(|(_, to, _)| to.as_str())
    }

    pub fn is_void(&self, name: &str) -> bool {
        matches!(self.component(name).map(|c| &c.content), Some(Content::None))
    }
}
