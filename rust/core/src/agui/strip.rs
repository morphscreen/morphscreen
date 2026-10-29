//! Judging a value against AG-UI's schema, the way the protocol's processing
//! model asks: material the schema doesn't describe (a property it doesn't
//! name, a union member or enum value it doesn't know) is removed and
//! reported; a value it does describe, but wrongly, is fatal.

use super::schema::DEFS;
use crate::json::Value;
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

pub enum Ty {
    Str,
    /// A JSON Pointer (RFC 6901).
    Pointer,
    /// An integer at least this.
    Int(i64),
    Bool,
    /// Anything, null included.
    Any,
    /// Anything but null.
    AnyNonNull,
    /// An object open by key (metadata, activity content).
    OpenObj,
    Const(&'static str),
    Enum(&'static [&'static str]),
    Def(usize),
    Arr(&'static Ty),
    /// One of these, picked by the value's JSON type.
    Either(&'static [Ty]),
}

pub struct Field {
    pub name: &'static str,
    pub ty: Ty,
    pub req: bool,
}

pub enum Def {
    Obj { name: &'static str, closed: bool, fields: &'static [Field] },
    Union { name: &'static str, tag: &'static str, arms: &'static [(&'static str, usize)] },
}

pub use super::schema::{EVENT, MESSAGE, RUN_AGENT_INPUT};

/// The definition of one event type, if the protocol has it.
pub fn event_def(ty: &str) -> Option<usize> {
    match &DEFS[EVENT] {
        Def::Union { arms, .. } => arms.iter().find(|(t, _)| *t == ty).map(|(_, d)| *d),
        _ => None,
    }
}

/// What judging a value comes to: the value with unrecognised material
/// removed, or None when the value itself is unrecognisable (its container
/// decides what that means). `removed` gets each path taken out.
pub fn judge(v: Value, def: usize, removed: &mut Vec<String>) -> Result<Option<Value>, String> {
    Judge { removed }.def(v, def, "")
}

struct Judge<'a> {
    removed: &'a mut Vec<String>,
}

fn kind(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "a boolean",
        Value::Num(_) => "a number",
        Value::Str(_) => "a string",
        Value::Arr(_) => "an array",
        Value::Obj(_) => "an object",
    }
}

fn at(path: &str) -> String {
    if path.is_empty() {
        "the event".into()
    } else {
        format!("'{path}'")
    }
}

/// RFC 6901's grammar: empty, or segments each starting with '/', where '~'
/// is only ever ~0 or ~1.
pub fn is_pointer(s: &str) -> bool {
    if s.is_empty() {
        return true;
    }
    if !s.starts_with('/') {
        return false;
    }
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'~' {
            if i + 1 >= b.len() || !(b[i + 1] == b'0' || b[i + 1] == b'1') {
                return false;
            }
            i += 1;
        }
        i += 1;
    }
    true
}

impl Judge<'_> {
    fn def(&mut self, v: Value, d: usize, path: &str) -> Result<Option<Value>, String> {
        match &DEFS[d] {
            Def::Union { name, tag, arms } => {
                let Value::Obj(_) = v else { return Err(format!("{} should be {name} (an object), not {}", at(path), kind(&v))) };
                let t = match v.get(tag) {
                    Some(Value::Str(t)) => t.clone(),
                    Some(other) => return Err(format!("{}'s {tag} should be a string, not {}", at(path), kind(other))),
                    None => return Err(format!("{} has no {tag}", at(path))),
                };
                match arms.iter().find(|(a, _)| *a == t) {
                    Some((_, arm)) => self.def(v, *arm, path),
                    // A member added after this version: removed, not fatal.
                    None => Ok(None),
                }
            }
            Def::Obj { name, closed, fields } => {
                let Value::Obj(kv) = v else { return Err(format!("{} should be {name} (an object), not {}", at(path), kind(&v))) };
                let mut out = Vec::with_capacity(kv.len());
                for (k, val) in kv {
                    let here = format!("{path}/{k}");
                    let Some(f) = fields.iter().find(|f| f.name == k) else {
                        if *closed {
                            self.removed.push(here);
                        } else {
                            out.push((k, val));
                        }
                        continue;
                    };
                    if val == Value::Null && !f.req && !matches!(f.ty, Ty::Any) {
                        return Err(format!("'{here}' is null; an optional field with no value is left out"));
                    }
                    let mark = self.removed.len();
                    match self.ty(val, &f.ty, &here)? {
                        Some(x) => out.push((k, x)),
                        None if !f.req => {
                            self.removed.truncate(mark);
                            self.removed.push(here);
                        }
                        // Unrecognisable in a required place: the whole value goes.
                        None => {
                            self.removed.truncate(mark);
                            return Ok(None);
                        }
                    }
                }
                for f in fields.iter().filter(|f| f.req) {
                    if !out.iter().any(|(k, _)| k == f.name) {
                        return Err(format!("{} has no {} ({name} needs one)", at(path), f.name));
                    }
                }
                Ok(Some(Value::Obj(out)))
            }
        }
    }

    fn ty(&mut self, v: Value, t: &Ty, path: &str) -> Result<Option<Value>, String> {
        let bad = |want: &str, v: &Value| Err(format!("'{path}' should be {want}, not {}", kind(v)));
        match t {
            Ty::Any => Ok(Some(v)),
            Ty::AnyNonNull => match v {
                Value::Null => Err(format!("'{path}' is null")),
                v => Ok(Some(v)),
            },
            Ty::Str => match v {
                Value::Str(_) => Ok(Some(v)),
                v => bad("a string", &v),
            },
            Ty::Pointer => match &v {
                Value::Str(s) if is_pointer(s) => Ok(Some(v)),
                Value::Str(s) => Err(format!("'{path}' isn't a JSON Pointer: {s:?}")),
                v => bad("a JSON Pointer", v),
            },
            Ty::Bool => match v {
                Value::Bool(_) => Ok(Some(v)),
                v => bad("true or false", &v),
            },
            Ty::Int(min) => match v {
                Value::Num(n) if n >= *min as f64 && n <= 9007199254740991.0 && n == (n as i64) as f64 => Ok(Some(v)),
                Value::Num(n) => Err(format!("'{path}' should be a whole number from {min}, not {n}")),
                v => bad("a whole number", &v),
            },
            Ty::OpenObj => match v {
                Value::Obj(_) => Ok(Some(v)),
                v => bad("an object", &v),
            },
            Ty::Const(c) => match &v {
                Value::Str(s) if s == c => Ok(Some(v)),
                Value::Str(s) => Err(format!("'{path}' should be \"{c}\", not \"{s}\"")),
                v => bad(&format!("\"{c}\""), v),
            },
            Ty::Enum(set) => match &v {
                Value::Str(s) if set.contains(&s.as_str()) => Ok(Some(v)),
                // A value added after this version: removed, not fatal.
                Value::Str(_) => Ok(None),
                v => bad("a string", v),
            },
            Ty::Def(d) => self.def(v, *d, path),
            Ty::Arr(item) => match v {
                Value::Arr(items) => {
                    let mut out = Vec::with_capacity(items.len());
                    for (i, x) in items.into_iter().enumerate() {
                        let here = format!("{path}/{i}");
                        let mark = self.removed.len();
                        match self.ty(x, item, &here)? {
                            Some(x) => out.push(x),
                            None => {
                                self.removed.truncate(mark);
                                self.removed.push(here);
                            }
                        }
                    }
                    Ok(Some(Value::Arr(out)))
                }
                v => bad("an array", &v),
            },
            Ty::Either(arms) => {
                let pick = arms.iter().find(|a| match (a, &v) {
                    (Ty::Str, Value::Str(_)) | (Ty::Arr(_), Value::Arr(_)) | (Ty::Bool, Value::Bool(_)) | (Ty::Int(_), Value::Num(_)) => true,
                    (Ty::OpenObj | Ty::Def(_), Value::Obj(_)) => true,
                    _ => false,
                });
                match pick {
                    Some(a) => self.ty(v, a, path),
                    None => bad("one of the shapes the schema allows", &v),
                }
            }
        }
    }
}

impl Def {
    pub fn name(&self) -> &'static str {
        match self {
            Def::Obj { name, .. } | Def::Union { name, .. } => name,
        }
    }
}

/// A short name for an event type, for messages: "TEXT_MESSAGE_START".
pub fn type_of(v: &Value) -> String {
    v.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string()
}
