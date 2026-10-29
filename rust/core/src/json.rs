//! A small JSON reader and writer: enough for packs going in and ops coming
//! out, without a dependency. Objects keep their key order, and writing
//! matches JavaScript's JSON.stringify, so hashes agree with the TypeScript
//! tools.

use alloc::string::{String, ToString};
use alloc::vec::Vec;
use core::fmt::Write;

#[derive(Clone, Debug, Default, PartialEq)]
pub enum Value {
    #[default]
    Null,
    Bool(bool),
    Num(f64),
    Str(String),
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
}

impl Value {
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Obj(kv) => kv.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }
    pub fn as_arr(&self) -> Option<&[Value]> {
        match self {
            Value::Arr(a) => Some(a),
            _ => None,
        }
    }
    pub fn as_obj(&self) -> Option<&[(String, Value)]> {
        match self {
            Value::Obj(o) => Some(o),
            _ => None,
        }
    }
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }
    pub fn get_mut(&mut self, key: &str) -> Option<&mut Value> {
        match self {
            Value::Obj(kv) => kv.iter_mut().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    /// Sets a member of an object, in place if it's there, last if not.
    pub fn set(&mut self, key: &str, v: Value) {
        if let Value::Obj(kv) = self {
            match kv.iter_mut().find(|(k, _)| k == key) {
                Some((_, x)) => *x = v,
                None => kv.push((key.to_string(), v)),
            }
        }
    }
    pub fn remove(&mut self, key: &str) -> Option<Value> {
        match self {
            Value::Obj(kv) => kv.iter().position(|(k, _)| k == key).map(|i| kv.remove(i).1),
            _ => None,
        }
    }
    pub fn str(&self, key: &str) -> Option<&str> {
        self.get(key).and_then(|v| v.as_str())
    }
}

pub fn parse(src: &str) -> Result<Value, String> {
    let mut p = Reader { s: src.as_bytes(), i: 0 };
    p.ws();
    let v = p.value()?;
    p.ws();
    if p.i != p.s.len() {
        return Err(p.err("trailing characters"));
    }
    Ok(v)
}

struct Reader<'a> {
    s: &'a [u8],
    i: usize,
}

impl Reader<'_> {
    fn err(&self, what: &str) -> String {
        let mut e = String::new();
        let _ = write!(e, "JSON: {} at byte {}", what, self.i);
        e
    }
    fn ws(&mut self) {
        while self.i < self.s.len() && matches!(self.s[self.i], b' ' | b'\n' | b'\r' | b'\t') {
            self.i += 1;
        }
    }
    fn eat(&mut self, lit: &[u8]) -> bool {
        if self.s[self.i..].starts_with(lit) {
            self.i += lit.len();
            true
        } else {
            false
        }
    }
    fn value(&mut self) -> Result<Value, String> {
        match self.s.get(self.i) {
            None => Err(self.err("unexpected end")),
            Some(b'{') => {
                self.i += 1;
                let mut kv = Vec::new();
                self.ws();
                if self.eat(b"}") {
                    return Ok(Value::Obj(kv));
                }
                loop {
                    self.ws();
                    let k = self.string()?;
                    self.ws();
                    if !self.eat(b":") {
                        return Err(self.err("expected ':'"));
                    }
                    self.ws();
                    let v = self.value()?;
                    kv.push((k, v));
                    self.ws();
                    if self.eat(b",") {
                        continue;
                    }
                    if self.eat(b"}") {
                        return Ok(Value::Obj(kv));
                    }
                    return Err(self.err("expected ',' or '}'"));
                }
            }
            Some(b'[') => {
                self.i += 1;
                let mut a = Vec::new();
                self.ws();
                if self.eat(b"]") {
                    return Ok(Value::Arr(a));
                }
                loop {
                    self.ws();
                    a.push(self.value()?);
                    self.ws();
                    if self.eat(b",") {
                        continue;
                    }
                    if self.eat(b"]") {
                        return Ok(Value::Arr(a));
                    }
                    return Err(self.err("expected ',' or ']'"));
                }
            }
            Some(b'"') => Ok(Value::Str(self.string()?)),
            Some(b't') if self.eat(b"true") => Ok(Value::Bool(true)),
            Some(b'f') if self.eat(b"false") => Ok(Value::Bool(false)),
            Some(b'n') if self.eat(b"null") => Ok(Value::Null),
            Some(_) => self.number(),
        }
    }
    fn number(&mut self) -> Result<Value, String> {
        let start = self.i;
        while self.i < self.s.len() && matches!(self.s[self.i], b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9') {
            self.i += 1;
        }
        let t = core::str::from_utf8(&self.s[start..self.i]).map_err(|_| self.err("bad number"))?;
        t.parse::<f64>().map(Value::Num).map_err(|_| self.err("bad number"))
    }
    fn string(&mut self) -> Result<String, String> {
        if !self.eat(b"\"") {
            return Err(self.err("expected string"));
        }
        let mut out = String::new();
        loop {
            let start = self.i;
            while self.i < self.s.len() && self.s[self.i] != b'"' && self.s[self.i] != b'\\' {
                self.i += 1;
            }
            out.push_str(core::str::from_utf8(&self.s[start..self.i]).map_err(|_| self.err("bad UTF-8"))?);
            match self.s.get(self.i) {
                None => return Err(self.err("unterminated string")),
                Some(b'"') => {
                    self.i += 1;
                    return Ok(out);
                }
                _ => {
                    self.i += 1;
                    let c = *self.s.get(self.i).ok_or_else(|| self.err("bad escape"))?;
                    self.i += 1;
                    match c {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let mut cp = self.hex4()?;
                            if (0xD800..0xDC00).contains(&cp) && self.eat(b"\\u") {
                                let lo = self.hex4()?;
                                cp = 0x10000 + ((cp - 0xD800) << 10) + (lo.wrapping_sub(0xDC00) & 0x3FF);
                            }
                            out.push(char::from_u32(cp).unwrap_or('\u{FFFD}'));
                        }
                        _ => return Err(self.err("bad escape")),
                    }
                }
            }
        }
    }
    fn hex4(&mut self) -> Result<u32, String> {
        let h = self.s.get(self.i..self.i + 4).ok_or_else(|| self.err("bad \\u"))?;
        self.i += 4;
        let t = core::str::from_utf8(h).map_err(|_| self.err("bad \\u"))?;
        u32::from_str_radix(t, 16).map_err(|_| self.err("bad \\u"))
    }
}

/// Appends `s` as a JSON string, escaped the way JSON.stringify does.
pub fn write_str(out: &mut String, s: &str) {
    out.reserve(s.len() + 2);
    out.push('"');
    let b = s.as_bytes();
    let mut run = 0;
    for (i, &c) in b.iter().enumerate() {
        let esc: &str = match c {
            b'"' => "\\\"",
            b'\\' => "\\\\",
            b'\n' => "\\n",
            b'\r' => "\\r",
            b'\t' => "\\t",
            0x08 => "\\b",
            0x0c => "\\f",
            c if c < 0x20 => "",
            _ => continue,
        };
        out.push_str(&s[run..i]);
        if esc.is_empty() {
            let _ = write!(out, "\\u{:04x}", c);
        } else {
            out.push_str(esc);
        }
        run = i + 1;
    }
    out.push_str(&s[run..]);
    out.push('"');
}

/// A number the way JavaScript prints it (integers without ".0").
pub fn write_num(out: &mut String, n: f64) {
    if n.is_finite() && n == (n as i64) as f64 && n.abs() < 1e15 {
        let _ = write!(out, "{}", n as i64);
    } else if n.is_finite() {
        let _ = write!(out, "{}", n);
    } else {
        out.push_str("null");
    }
}

pub fn write(out: &mut String, v: &Value) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Num(n) => write_num(out, *n),
        Value::Str(s) => write_str(out, s),
        Value::Arr(a) => {
            out.push('[');
            for (i, x) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write(out, x);
            }
            out.push(']');
        }
        Value::Obj(kv) => {
            out.push('{');
            for (i, (k, x)) in kv.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_str(out, k);
                out.push(':');
                write(out, x);
            }
            out.push('}');
        }
    }
}

pub fn to_string(v: &Value) -> String {
    let mut s = String::new();
    write(&mut s, v);
    s
}

impl From<&str> for Value {
    fn from(s: &str) -> Self {
        Value::Str(s.to_string())
    }
}
