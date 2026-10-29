//! A What-if Result's formula: arithmetic over the sliders' names, compiled
//! here once into postfix (reverse Polish) tokens that every renderer runs
//! with a ten-line stack machine as the sliders move. Nothing else can run:
//! numbers, names, + - * / ^ %, unary minus, parentheses, and min, max,
//! round, floor, ceil, abs, sqrt.
//!
//! Tokens: a number ("12.5"), a name ("price"), an operator ("+", "-", "*",
//! "/", "^", "%"), "neg" (unary minus), or a function ("min", "max" take two
//! values; "round", "floor", "ceil", "abs", "sqrt" one).

use alloc::string::{String, ToString};
use alloc::vec::Vec;

const UNARY: &[&str] = &["round", "floor", "ceil", "abs", "sqrt"];
const BINARY: &[&str] = &["min", "max"];

#[derive(Debug, PartialEq)]
enum Lex {
    Num(String),
    Name(String),
    Op(char),
    Open,
    Close,
    Comma,
}

fn lex(s: &str) -> Result<Vec<Lex>, String> {
    let b: Vec<char> = s.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        let c = b[i];
        match c {
            ' ' | '\t' => i += 1,
            '0'..='9' | '.' => {
                let st = i;
                // "1,250" is a number; "max(1, 2)" two arguments.
                let thousands = |i: usize| b[i] == ',' && (1..=3).all(|k| b.get(i + k).is_some_and(char::is_ascii_digit)) && !b.get(i + 4).is_some_and(char::is_ascii_digit);
                while i < b.len() && (b[i].is_ascii_digit() || b[i] == '.' || b[i] == '_' || thousands(i)) {
                    i += 1;
                }
                let t: String = b[st..i].iter().filter(|c| **c != '_' && **c != ',').collect();
                if t.parse::<f64>().is_err() {
                    return Err(alloc::format!("not a number: {t}"));
                }
                out.push(Lex::Num(t));
            }
            c if c.is_alphabetic() || c == '_' => {
                let st = i;
                while i < b.len() && (b[i].is_alphanumeric() || b[i] == '_' || b[i] == '-' && b.get(i + 1).is_some_and(|n| n.is_alphabetic())) {
                    i += 1;
                }
                out.push(Lex::Name(b[st..i].iter().collect()));
            }
            '+' | '-' | '*' | '/' | '^' | '%' | '×' | '÷' => {
                out.push(Lex::Op(match c {
                    '×' => '*',
                    '÷' => '/',
                    c => c,
                }));
                i += 1;
            }
            '(' => {
                out.push(Lex::Open);
                i += 1;
            }
            ')' => {
                out.push(Lex::Close);
                i += 1;
            }
            ',' => {
                out.push(Lex::Comma);
                i += 1;
            }
            c => return Err(alloc::format!("unexpected {c}")),
        }
    }
    Ok(out)
}

fn prec(op: &str) -> (u8, bool) {
    // (precedence, right-associative)
    match op {
        "^" => (4, true),
        "neg" => (3, true),
        "*" | "/" | "%" => (2, false),
        _ => (1, false),
    }
}

/// The formula in postfix tokens, or why it can't be one.
pub fn compile(src: &str) -> Result<Vec<String>, String> {
    let toks = lex(src)?;
    let mut out: Vec<String> = Vec::new();
    let mut ops: Vec<String> = Vec::new();
    // Whether a value has just been read (so a "-" is subtraction, not negation).
    let mut value = false;
    for t in toks {
        match t {
            Lex::Num(n) => {
                if value {
                    return Err("two values in a row".into());
                }
                out.push(n);
                value = true;
            }
            Lex::Name(n) => {
                let l = n.to_lowercase();
                if UNARY.contains(&l.as_str()) || BINARY.contains(&l.as_str()) {
                    ops.push(l);
                    value = false;
                } else {
                    if value {
                        return Err("two values in a row".into());
                    }
                    out.push(n);
                    value = true;
                }
            }
            Lex::Op(c) => {
                let op = if !value && c == '-' {
                    "neg".to_string()
                } else if !value && c == '+' {
                    continue;
                } else if !value {
                    return Err(alloc::format!("{c} needs a value before it"));
                } else {
                    c.to_string()
                };
                let (p, right) = prec(&op);
                // A prefix minus applies to what comes after it: it takes nothing off the stack.
                while let Some(top) = ops.last().filter(|_| op != "neg") {
                    if top == "(" || UNARY.contains(&top.as_str()) || BINARY.contains(&top.as_str()) {
                        break;
                    }
                    let (tp, _) = prec(top);
                    if tp > p || (tp == p && !right) {
                        out.push(ops.pop().unwrap());
                    } else {
                        break;
                    }
                }
                ops.push(op);
                value = false;
            }
            Lex::Open => {
                ops.push("(".into());
                value = false;
            }
            Lex::Comma => {
                while let Some(top) = ops.last() {
                    if top == "(" {
                        break;
                    }
                    out.push(ops.pop().unwrap());
                }
                value = false;
            }
            Lex::Close => {
                loop {
                    match ops.pop() {
                        Some(o) if o == "(" => break,
                        Some(o) => out.push(o),
                        None => return Err("a ) without its (".into()),
                    }
                }
                // A function's parentheses close the call.
                if let Some(top) = ops.last() {
                    if UNARY.contains(&top.as_str()) || BINARY.contains(&top.as_str()) {
                        out.push(ops.pop().unwrap());
                    }
                }
                value = true;
            }
        }
    }
    while let Some(o) = ops.pop() {
        if o == "(" {
            return Err("a ( without its )".into());
        }
        out.push(o);
    }
    // It must leave exactly one value.
    let mut depth: i32 = 0;
    for t in &out {
        depth += match t.as_str() {
            "+" | "-" | "*" | "/" | "^" | "%" | "min" | "max" => -1,
            "neg" | "round" | "floor" | "ceil" | "abs" | "sqrt" => 0,
            _ => 1,
        };
        if depth < 1 {
            return Err("an operator without its values".into());
        }
    }
    if depth != 1 {
        return Err("values without an operator between them".into());
    }
    Ok(out)
}

/// The names a formula reads.
pub fn names(rpn: &[String]) -> Vec<&str> {
    rpn.iter()
        .map(String::as_str)
        .filter(|t| t.chars().next().is_some_and(|c| c.is_alphabetic() || c == '_') && !matches!(*t, "neg" | "min" | "max" | "round" | "floor" | "ceil" | "abs" | "sqrt"))
        .collect()
}

/// The formula's value with these names' values, or None (an unknown name,
/// a division by zero, not a finite number).
pub fn eval(rpn: &[String], value_of: impl Fn(&str) -> Option<f64>) -> Option<f64> {
    let mut st: Vec<f64> = Vec::new();
    for t in rpn {
        let one = |st: &mut Vec<f64>| st.pop();
        match t.as_str() {
            "+" | "-" | "*" | "/" | "^" | "%" | "min" | "max" => {
                let b = one(&mut st)?;
                let a = one(&mut st)?;
                st.push(match t.as_str() {
                    "+" => a + b,
                    "-" => a - b,
                    "*" => a * b,
                    "/" if b == 0.0 => return None,
                    "/" => a / b,
                    "%" if b == 0.0 => return None,
                    "%" => a % b,
                    "^" => libm::pow(a, b),
                    "min" => a.min(b),
                    _ => a.max(b),
                });
            }
            "neg" => {
                let a = one(&mut st)?;
                st.push(-a);
            }
            "round" | "floor" | "ceil" | "abs" | "sqrt" => {
                let a = one(&mut st)?;
                st.push(match t.as_str() {
                    "round" => libm::round(a),
                    "floor" => libm::floor(a),
                    "ceil" => libm::ceil(a),
                    "abs" => a.abs(),
                    _ => libm::sqrt(a),
                });
            }
            n => match n.parse::<f64>() {
                Ok(v) => st.push(v),
                Err(_) => st.push(value_of(n)?),
            },
        }
    }
    let v = st.pop()?;
    (st.is_empty() && v.is_finite()).then_some(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(src: &str, vars: &[(&str, f64)]) -> Option<f64> {
        let rpn = compile(src).unwrap();
        eval(&rpn, |n| vars.iter().find(|(k, _)| *k == n).map(|(_, v)| *v))
    }

    #[test]
    fn arithmetic_as_written() {
        assert_eq!(run("price * qty * (1 - discount / 100)", &[("price", 20.0), ("qty", 3.0), ("discount", 10.0)]), Some(54.0));
        assert_eq!(run("2 ^ 3 ^ 2", &[]), Some(512.0));
        assert_eq!(run("-x + 4", &[("x", 1.0)]), Some(3.0));
        assert_eq!(run("max(a, b) - min(a, b)", &[("a", 2.0), ("b", 7.0)]), Some(5.0));
        assert_eq!(run("round(10 / 3)", &[]), Some(3.0));
        assert_eq!(run("1,250 * 2", &[]), Some(2500.0));
        // A monthly loan payment.
        let p = run("principal * (rate / 12) / (1 - (1 + rate / 12) ^ -months)", &[("principal", 10000.0), ("rate", 0.06), ("months", 12.0)]).unwrap();
        assert!((p - 860.66).abs() < 0.01, "{p}");
    }

    #[test]
    fn nothing_else_runs() {
        assert_eq!(run("1 / x", &[("x", 0.0)]), None);
        assert_eq!(run("y + 1", &[]), None);
        assert!(compile("alert(1)").is_err(), "a name followed by ( is not a call");
        for bad in ["2 +", "(1 + 2", "1 + 2)", "* 3", "1 2", "a; b", "x = 3"] {
            assert!(compile(bad).is_err(), "{bad}");
        }
        assert_eq!(names(&compile("a * b + max(c, 2)").unwrap()), ["a", "b", "c"]);
    }
}
