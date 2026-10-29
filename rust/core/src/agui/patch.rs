//! JSON Patch (RFC 6902) over JSON Pointers (RFC 6901), applied atomically:
//! a patch that fails anywhere leaves the document as it was.

use crate::json::Value;
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;

/// A pointer's reference tokens, unescaped.
fn tokens(p: &str) -> Result<Vec<String>, String> {
    if p.is_empty() {
        return Ok(Vec::new());
    }
    if !p.starts_with('/') {
        return Err(format!("{p:?} isn't a JSON Pointer"));
    }
    Ok(p[1..].split('/').map(|t| t.replace("~1", "/").replace("~0", "~")).collect())
}

/// An array index token: "0", "12", never "01" or "-".
fn index(t: &str, len: usize, append: bool) -> Result<usize, String> {
    if append && t == "-" {
        return Ok(len);
    }
    if t.is_empty() || (t.len() > 1 && t.starts_with('0')) || !t.bytes().all(|b| b.is_ascii_digit()) {
        return Err(format!("{t:?} isn't an array index"));
    }
    let i: usize = t.parse().map_err(|_| format!("{t:?} is out of range"))?;
    let limit = if append { len } else { len.saturating_sub(1) };
    if i > limit || (!append && len == 0) {
        return Err(format!("index {i} is out of range (length {len})"));
    }
    Ok(i)
}

fn child_mut<'a>(v: &'a mut Value, t: &str) -> Result<&'a mut Value, String> {
    match v {
        Value::Obj(kv) => kv.iter_mut().find(|(k, _)| k == t).map(|(_, x)| x).ok_or_else(|| format!("no member {t:?}")),
        Value::Arr(items) => {
            let i = index(t, items.len(), false)?;
            Ok(&mut items[i])
        }
        _ => Err(format!("{t:?} is inside a value that isn't an object or array")),
    }
}

/// The value a pointer names.
pub fn get<'a>(doc: &'a Value, p: &str) -> Result<&'a Value, String> {
    let mut v = doc;
    for t in tokens(p)? {
        v = match v {
            Value::Obj(kv) => kv.iter().find(|(k, _)| *k == t).map(|(_, x)| x).ok_or_else(|| format!("{p}: no member {t:?}"))?,
            Value::Arr(items) => &items[index(&t, items.len(), false).map_err(|e| format!("{p}: {e}"))?],
            _ => return Err(format!("{p}: {t:?} is inside a value that isn't an object or array")),
        };
    }
    Ok(v)
}

fn parent_mut<'a>(doc: &'a mut Value, toks: &[String]) -> Result<&'a mut Value, String> {
    let mut v = doc;
    for t in &toks[..toks.len() - 1] {
        v = child_mut(v, t)?;
    }
    Ok(v)
}

fn add(doc: &mut Value, p: &str, value: Value) -> Result<(), String> {
    let toks = tokens(p)?;
    if toks.is_empty() {
        *doc = value;
        return Ok(());
    }
    let last = &toks[toks.len() - 1];
    match parent_mut(doc, &toks).map_err(|e| format!("{p}: {e}"))? {
        Value::Obj(kv) => {
            match kv.iter_mut().find(|(k, _)| k == last) {
                Some((_, x)) => *x = value,
                None => kv.push((last.clone(), value)),
            }
            Ok(())
        }
        Value::Arr(items) => {
            let i = index(last, items.len(), true).map_err(|e| format!("{p}: {e}"))?;
            items.insert(i, value);
            Ok(())
        }
        _ => Err(format!("{p}: the parent isn't an object or array")),
    }
}

fn remove(doc: &mut Value, p: &str) -> Result<Value, String> {
    let toks = tokens(p)?;
    if toks.is_empty() {
        return Ok(core::mem::replace(doc, Value::Null));
    }
    let last = &toks[toks.len() - 1];
    match parent_mut(doc, &toks).map_err(|e| format!("{p}: {e}"))? {
        Value::Obj(kv) => match kv.iter().position(|(k, _)| k == last) {
            Some(i) => Ok(kv.remove(i).1),
            None => Err(format!("{p}: no member {last:?}")),
        },
        Value::Arr(items) => {
            let i = index(last, items.len(), false).map_err(|e| format!("{p}: {e}"))?;
            Ok(items.remove(i))
        }
        _ => Err(format!("{p}: the parent isn't an object or array")),
    }
}

/// JSON equality: objects compare by members, not order.
pub fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Obj(x), Value::Obj(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.iter().any(|(k2, v2)| k == k2 && same(v, v2))),
        (Value::Arr(x), Value::Arr(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        _ => a == b,
    }
}

fn str_of<'a>(op: &'a Value, k: &str) -> Result<&'a str, String> {
    op.get(k).and_then(|v| v.as_str()).ok_or_else(|| format!("the operation has no {k}"))
}

fn one(doc: &mut Value, op: &Value) -> Result<(), String> {
    let path = str_of(op, "path")?;
    let value = || op.get("value").cloned().ok_or_else(|| String::from("the operation has no value"));
    match str_of(op, "op")? {
        "add" => add(doc, path, value()?),
        "remove" => remove(doc, path).map(|_| ()),
        "replace" => {
            let v = value()?;
            let toks = tokens(path)?;
            if toks.is_empty() {
                *doc = v;
                return Ok(());
            }
            let target = parent_mut(doc, &toks).and_then(|p| child_mut(p, &toks[toks.len() - 1])).map_err(|e| format!("{path}: {e}"))?;
            *target = v;
            Ok(())
        }
        "move" => {
            let from = str_of(op, "from")?;
            if path != from && path.starts_with(from) && path[from.len()..].starts_with('/') {
                return Err(format!("can't move {from} into its own child {path}"));
            }
            let v = remove(doc, from)?;
            add(doc, path, v)
        }
        "copy" => {
            let v = get(doc, str_of(op, "from")?)?.clone();
            add(doc, path, v)
        }
        "test" => {
            let want = value()?;
            if same(get(doc, path)?, &want) {
                Ok(())
            } else {
                Err(format!("test failed at {path}"))
            }
        }
        other => Err(format!("unknown operation {other:?}")),
    }
}

/// Applies a patch to `doc`, all of it or none of it.
pub fn apply(doc: &mut Value, ops: &[Value]) -> Result<(), String> {
    let mut next = doc.clone();
    for op in ops {
        one(&mut next, op)?;
    }
    *doc = next;
    Ok(())
}

/// The patch that turns `a` into `b`: members added, removed and replaced
/// one by one; arrays and other values replaced whole.
pub fn diff(a: &Value, b: &Value) -> Vec<Value> {
    let mut ops = Vec::new();
    walk(a, b, &mut String::new(), &mut ops);
    ops
}

fn escape(k: &str) -> String {
    k.replace('~', "~0").replace('/', "~1")
}

fn op(name: &str, path: &str, value: Option<&Value>) -> Value {
    let mut kv = alloc::vec![("op".into(), Value::Str(name.into())), ("path".into(), Value::Str(path.into()))];
    if let Some(v) = value {
        kv.push(("value".into(), v.clone()));
    }
    Value::Obj(kv)
}

fn walk(a: &Value, b: &Value, path: &mut String, ops: &mut Vec<Value>) {
    if same(a, b) {
        return;
    }
    match (a, b) {
        (Value::Obj(x), Value::Obj(y)) => {
            for (k, v) in x {
                if !y.iter().any(|(k2, _)| k2 == k) {
                    ops.push(op("remove", &format!("{path}/{}", escape(k)), None));
                } else {
                    let w = &y.iter().find(|(k2, _)| k2 == k).unwrap().1;
                    let len = path.len();
                    path.push('/');
                    path.push_str(&escape(k));
                    walk(v, w, path, ops);
                    path.truncate(len);
                }
            }
            for (k, w) in y {
                if !x.iter().any(|(k2, _)| k2 == k) {
                    ops.push(op("add", &format!("{path}/{}", escape(k)), Some(w)));
                }
            }
        }
        _ => ops.push(op("replace", path, Some(b))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::{parse, to_string};

    fn run(doc: &str, patch: &str) -> Result<String, String> {
        let mut d = parse(doc).unwrap();
        let p = parse(patch).unwrap();
        apply(&mut d, p.as_arr().unwrap())?;
        Ok(to_string(&d))
    }

    #[test]
    fn rfc6902_examples() {
        assert_eq!(run(r#"{"foo":"bar"}"#, r#"[{"op":"add","path":"/baz","value":"qux"}]"#).unwrap(), r#"{"foo":"bar","baz":"qux"}"#);
        assert_eq!(run(r#"{"foo":["bar","baz"]}"#, r#"[{"op":"add","path":"/foo/1","value":"qux"}]"#).unwrap(), r#"{"foo":["bar","qux","baz"]}"#);
        assert_eq!(run(r#"{"baz":"qux","foo":"bar"}"#, r#"[{"op":"remove","path":"/baz"}]"#).unwrap(), r#"{"foo":"bar"}"#);
        assert_eq!(run(r#"{"foo":{"bar":"baz","waldo":"fred"},"qux":{"corge":"grault"}}"#, r#"[{"op":"move","from":"/foo/waldo","path":"/qux/thud"}]"#).unwrap(), r#"{"foo":{"bar":"baz"},"qux":{"corge":"grault","thud":"fred"}}"#);
        assert_eq!(run(r#"{"foo":["all","grass","cows","eat"]}"#, r#"[{"op":"move","from":"/foo/1","path":"/foo/3"}]"#).unwrap(), r#"{"foo":["all","cows","eat","grass"]}"#);
        assert!(run(r#"{"baz":"qux"}"#, r#"[{"op":"test","path":"/baz","value":"bar"}]"#).is_err());
        assert!(run(r#"{"foo":"bar"}"#, r#"[{"op":"add","path":"/baz/bat","value":"qux"}]"#).is_err());
        assert_eq!(run(r#"{"foo":["bar"]}"#, r#"[{"op":"add","path":"/foo/-","value":["abc","def"]}]"#).unwrap(), r#"{"foo":["bar",["abc","def"]]}"#);
        assert_eq!(run(r#"{"/":9,"~1":10}"#, r#"[{"op":"test","path":"/~01","value":10}]"#).unwrap(), r#"{"/":9,"~1":10}"#);
    }

    #[test]
    fn a_failed_patch_changes_nothing() {
        let mut d = parse(r#"{"a":1}"#).unwrap();
        let p = parse(r#"[{"op":"add","path":"/b","value":2},{"op":"remove","path":"/missing"}]"#).unwrap();
        assert!(apply(&mut d, p.as_arr().unwrap()).is_err());
        assert_eq!(to_string(&d), r#"{"a":1}"#);
    }

    #[test]
    fn diff_round_trips() {
        let a = parse(r#"{"m":{"x":{"done":[0]},"y":1},"keep":true}"#).unwrap();
        let b = parse(r#"{"m":{"x":{"done":[0,2]},"z":"new"},"keep":true}"#).unwrap();
        let ops = diff(&a, &b);
        let mut c = a.clone();
        apply(&mut c, &ops).unwrap();
        assert!(same(&c, &b));
    }
}
