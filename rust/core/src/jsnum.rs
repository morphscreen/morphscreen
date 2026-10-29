//! Numbers the way JavaScript reads and prints them, so the HTML (chart
//! coordinates, percentages) matches the TypeScript renderer digit for digit.

use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

/// Number(s): trims whitespace, "" is 0, anything not a number is NaN.
pub fn number(s: &str) -> f64 {
    let t = s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    if t.is_empty() {
        return 0.0;
    }
    match t {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    for (prefix, radix) in [("0x", 16), ("0X", 16), ("0b", 2), ("0B", 2), ("0o", 8), ("0O", 8)] {
        if let Some(rest) = t.strip_prefix(prefix) {
            return u64::from_str_radix(rest, radix).map(|v| v as f64).unwrap_or(f64::NAN);
        }
    }
    let ok = t.bytes().all(|c| c.is_ascii_digit() || matches!(c, b'+' | b'-' | b'.' | b'e' | b'E')) && t.bytes().any(|c| c.is_ascii_digit());
    if !ok {
        return f64::NAN;
    }
    t.parse::<f64>().unwrap_or(f64::NAN)
}

/// x.toFixed(d): exact decimal expansion, ties rounded up (away from zero).
pub fn to_fixed(x: f64, d: usize) -> String {
    if !x.is_finite() {
        return if x.is_nan() { "NaN".into() } else if x > 0.0 { "Infinity".into() } else { "-Infinity".into() };
    }
    if x.abs() >= 1e21 {
        return num_str(x);
    }
    let neg = x < 0.0;
    // Rust prints the exact binary value with enough digits; round that by hand.
    let exact = format!("{:.*}", d + 30, x.abs());
    let (int_part, frac_part) = exact.split_once('.').unwrap_or((&exact, ""));
    let mut digits: Vec<u8> = int_part.bytes().chain(frac_part.bytes().take(d)).map(|b| b - b'0').collect();
    let next = frac_part.as_bytes().get(d).copied().unwrap_or(b'0');
    if next >= b'5' {
        let mut i = digits.len();
        loop {
            if i == 0 {
                digits.insert(0, 1);
                break;
            }
            i -= 1;
            if digits[i] == 9 {
                digits[i] = 0;
            } else {
                digits[i] += 1;
                break;
            }
        }
    }
    let int_len = digits.len() - d;
    let mut out = String::new();
    let all_zero = digits.iter().all(|&g| g == 0);
    if neg && !all_zero {
        out.push('-');
    }
    for &g in &digits[..int_len] {
        out.push((b'0' + g) as char);
    }
    if d > 0 {
        out.push('.');
        for &g in &digits[int_len..] {
            out.push((b'0' + g) as char);
        }
    }
    out
}

/// String(x): the shortest form that reads back as x.
pub fn num_str(x: f64) -> String {
    if x.is_nan() {
        return "NaN".into();
    }
    if x.is_infinite() {
        return if x > 0.0 { "Infinity".into() } else { "-Infinity".into() };
    }
    if x == 0.0 {
        return "0".into();
    }
    let a = x.abs();
    if a >= 1e21 || a < 1e-6 {
        let s = format!("{:e}", x);
        let (m, e) = s.split_once('e').unwrap();
        let e: i32 = e.parse().unwrap();
        return format!("{}e{}{}", m, if e >= 0 { "+" } else { "-" }, e.abs());
    }
    x.to_string()
}

/// +x.toFixed(d) printed back: rounded, trailing zeros gone.
pub fn fixed_num(x: f64, d: usize) -> String {
    num_str(to_fixed(x, d).parse::<f64>().unwrap_or(f64::NAN))
}

/// Math.round: halves go up.
pub fn round(x: f64) -> f64 {
    libm::floor(x + 0.5)
}

/// encodeURIComponent.
pub fn encode_uri_component(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        if c.is_ascii_alphanumeric() || "-_.!~*'()".contains(c) {
            out.push(c);
        } else {
            let mut buf = [0u8; 4];
            for b in c.encode_utf8(&mut buf).bytes() {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}
