// What a model writes can't run or load anything the app didn't allow
// (docs/security.md). Every attribute of every component, and the answer's
// own text, is filled with the usual attacks and drawn with every pack: the
// HTML has no script, no handler, no frame, no link a browser would read as
// script, and no picture from a host outside the app's list.

use morphscreen_core::catalog::{AttrType, Catalog, Content};
use morphscreen_core::html::render;
use morphscreen_core::parse::Parser;

const ATTACKS: &[&str] = &[
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\u{1}javascript:alert(1)",
    " javascript:alert(1)",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "data:text/html,<script>alert(1)</script>",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "https://evil.example/pixel.png",
    "//evil.example/pixel.png",
    "\" onmouseover=\"alert(1)",
    "x\" style=\"background:url(https://evil.example/p)",
    "'><script>alert(1)</script>",
    "</X><script>alert(1)</script>",
    "constructor.constructor('alert(1)')()",
];

const TEXT: &str = r#"<script>alert(1)</script> and <img src=x onerror=alert(1)> and <iframe src="https://evil.example"></iframe>
<svg onload=alert(1)><style>body{background:url(https://evil.example/p)}</style><a href="javascript:alert(1)">a</a>
[a](javascript:alert(1)) [b](java	script:alert(1)) [c](vbscript:x) [d](data:text/html,x) [e](file:///etc/passwd)
![f](https://evil.example/f.png) ![g](data:image/svg+xml,<svg>) ![h](//evil.example/h.png)

| <script>alert(1)</script> | [x](javascript:alert(1)) |
|---|---|
| <b onclick=alert(1)>b</b> | ![i](https://evil.example/i.png) |

```html
<script>alert(1)</script>
```
"#;

/// A value that passes for `ty`, for the attributes an attack isn't in.
fn plain(ty: &AttrType) -> String {
    match ty {
        AttrType::Num => "1".into(),
        AttrType::Bool => "true".into(),
        AttrType::Url => "https://a.example/ok.png".into(),
        AttrType::List => "a|b".into(),
        AttrType::Icon => "star".into(),
        AttrType::Enum(v) => v[0].clone(),
        AttrType::Str => "x".into(),
    }
}

fn draw(text: &str) -> String {
    let mut p = Parser::new(Catalog::build(&["all"], &[]).unwrap());
    p.allow_images(&["https://x.example", "a.example"]);
    p.push(text);
    p.finish(false);
    render(&p)
}

/// An attribute value as the browser reads it: entities decoded once.
fn decoded(v: &str) -> String {
    v.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&")
}

/// The scheme a browser's URL parser sees, if the value has one.
fn scheme(v: &str) -> Option<String> {
    let t: String = v.trim_start_matches(|c: char| c <= ' ').chars().filter(|c| !matches!(c, '\t' | '\n' | '\r')).collect();
    let p = t.find(':')?;
    let s = &t[..p];
    (!s.is_empty() && s.chars().next().unwrap().is_ascii_alphabetic() && s.chars().all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c))).then(|| s.to_ascii_lowercase())
}

/// Each tag in `html` as (name, [(attribute, value)]). Text can't hold a raw
/// "<" (the core escapes it), so every "<" starts a tag; a value that isn't
/// in double quotes is a failure.
fn tags(html: &str) -> Vec<(String, Vec<(String, String)>)> {
    let mut out = Vec::new();
    let mut rest = html;
    while let Some(i) = rest.find('<') {
        rest = &rest[i + 1..];
        if rest.starts_with('/') || rest.starts_with('!') {
            continue;
        }
        let end = rest.find(|c: char| c.is_whitespace() || c == '>' || c == '/').unwrap_or(rest.len());
        let name = rest[..end].to_ascii_lowercase();
        rest = &rest[end..];
        let mut attrs = Vec::new();
        loop {
            rest = rest.trim_start_matches(|c: char| c.is_whitespace() || c == '/');
            if rest.is_empty() || rest.starts_with('>') {
                break;
            }
            let n = rest.find(|c: char| c.is_whitespace() || c == '=' || c == '>').unwrap_or(rest.len());
            let attr = rest[..n].to_ascii_lowercase();
            rest = &rest[n..];
            if let Some(r) = rest.strip_prefix("=\"") {
                let close = r.find('"').unwrap_or_else(|| panic!("<{name} {attr}=...> never closes"));
                attrs.push((attr, decoded(&r[..close])));
                rest = &r[close + 1..];
            } else {
                assert!(!rest.starts_with('='), "<{name} {attr}=> without quotes");
                attrs.push((attr, String::new()));
            }
        }
        out.push((name, attrs));
    }
    out
}

const NEVER: &[&str] = &["script", "iframe", "frame", "frameset", "object", "embed", "applet", "style", "link", "meta", "base", "noscript", "template"];
const ADDRESSES: &[&str] = &["href", "src", "poster", "srcset", "action", "formaction", "background", "cite", "data", "xlink:href", "data-player", "data-href"];

/// Why `html` isn't safe, if it isn't.
fn unsafe_in(html: &str) -> Option<String> {
    for (tag, attrs) in tags(html) {
        if NEVER.contains(&tag.as_str()) {
            return Some(format!("a <{tag}>"));
        }
        for (a, v) in &attrs {
            if a.starts_with("on") || a == "srcdoc" || a == "formaction" || a == "action" {
                return Some(format!("<{tag} {a}>"));
            }
            if a == "style" && (v.contains("url(") || v.contains("expression") || v.contains('@')) {
                return Some(format!("<{tag} style=\"{v}\">"));
            }
            if !ADDRESSES.contains(&a.as_str()) {
                continue;
            }
            for one in if a == "srcset" { v.split(',').map(|s| s.split_whitespace().next().unwrap_or("")).collect() } else { vec![v.as_str()] } {
                match scheme(one).as_deref() {
                    Some("javascript" | "vbscript" | "file") => return Some(format!("<{tag} {a}=\"{one}\">")),
                    // A picture, or AddToCalendar's own .ics, written by the core with every value encoded.
                    Some("data") if !(tag == "img" && one.starts_with("data:image/") && !one.starts_with("data:image/svg"))
                        && !(tag == "a" && attrs.iter().any(|(d, _)| d == "download") && one.starts_with("data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR")) =>
                    {
                        return Some(format!("<{tag} {a}=\"{one}\">"))
                    }
                    _ => {}
                }
                // Pictures load by themselves: only from the app's hosts.
                let loads = (tag == "img" && (a == "src" || a == "srcset")) || (tag == "video" && a == "poster") || tag == "image" || tag == "source";
                let allowed = one.starts_with("https://x.example/") || one.starts_with("https://a.example/") || one.starts_with("data:image/");
                if loads && !one.is_empty() && !allowed {
                    return Some(format!("<{tag} {a}=\"{one}\"> loads by itself"));
                }
            }
        }
        // Sound and video wait for the reader to press play.
        if (tag == "video" || tag == "audio") && !attrs.iter().any(|(a, v)| a == "preload" && v == "none") {
            return Some(format!("<{tag}> without preload=\"none\""));
        }
    }
    // A What-if formula is numbers, names and operators, nothing that calls.
    for f in html.split("data-formula=\"").skip(1) {
        let list = decoded(&f[..f.find('"').unwrap()]);
        // A JSON list of strings: ["price","2","*"].
        let inner = list.trim().strip_prefix('[').and_then(|l| l.strip_suffix(']')).unwrap_or_else(|| panic!("formula {list}"));
        let tokens: Vec<String> = inner.split(',').filter(|t| !t.trim().is_empty()).map(|t| t.trim().trim_matches('"').to_string()).collect();
        for t in tokens {
            let ok = ["+", "-", "*", "/", "^", "%", "neg", "min", "max", "round", "floor", "ceil", "abs", "sqrt"].contains(&t.as_str())
                || t.parse::<f64>().is_ok()
                || t.chars().all(|c| c.is_alphanumeric() || c == '_');
            if !ok {
                return Some(format!("formula token {t:?}"));
            }
        }
    }
    None
}

#[test]
fn every_attack_in_every_attribute_draws_safe() {
    let catalog = Catalog::build(&["all"], &[]).unwrap();
    let (mut tried, mut shown) = (0, 0);
    for c in &catalog.components {
        let filled = |except: &str| -> String {
            c.attrs.iter().filter(|a| a.required && a.name != except).map(|a| format!(" {}=\"{}\"", a.name, plain(&a.ty))).collect()
        };
        let wrap = |inner: String| -> String {
            match c.parent.as_deref().and_then(|p| catalog.component(p)) {
                Some(p) => {
                    let req: String = p.attrs.iter().filter(|a| a.required).map(|a| format!(" {}=\"{}\"", a.name, plain(&a.ty))).collect();
                    format!("<{}{req}>\n{inner}\n</{}>\n", p.name, p.name)
                }
                None => inner,
            }
        };
        let body = match &c.content {
            Content::None => None,
            Content::Table => Some("| a | b |\n|---|---|\n| 1 | 2 |".to_string()),
            Content::List => Some("- a\n- b".to_string()),
            Content::Images => Some("![a](https://a.example/a.png)".to_string()),
            _ => Some("Some text".to_string()),
        };
        let tag = |attrs: String| -> String {
            match &body {
                None => wrap(format!("<{}{attrs} />\n", c.name)),
                Some(b) => wrap(format!("<{}{attrs}>\n{b}\n</{}>\n", c.name, c.name)),
            }
        };
        for a in &c.attrs {
            // The harness draws something: a plain address shows up where it should.
            if matches!(a.ty, AttrType::Url) && draw(&tag(format!("{} {}=\"https://a.example/ok.png\"", filled(&a.name), a.name))).contains("https://a.example/ok.png") {
                shown += 1;
            }
            for attack in ATTACKS {
                let text = tag(format!("{} {}=\"{attack}\"", filled(&a.name), a.name));
                tried += 1;
                if let Some(why) = unsafe_in(&draw(&text)) {
                    panic!("{}.{} = {attack:?}: {why}\n{text}\n{}", c.name, a.name, draw(&text));
                }
            }
        }
        // And the attacks as the component's text.
        if body.is_some() {
            let text = wrap(format!("<{}{}>\n{TEXT}\n</{}>\n", c.name, filled(""), c.name));
            if let Some(why) = unsafe_in(&draw(&text)) {
                panic!("{} with attacks inside: {why}\n{}", c.name, draw(&text));
            }
        }
    }
    assert!(tried > 1000, "{tried} tried");
    let urls = catalog.components.iter().flat_map(|c| &c.attrs).filter(|a| matches!(a.ty, AttrType::Url)).count();
    assert_eq!(shown, urls, "a plain address drawn in only {shown} of the {urls} address attributes: the harness isn't reaching them all");
}

#[test]
fn an_answer_of_attacks_draws_safe() {
    let h = draw(TEXT);
    assert_eq!(unsafe_in(&h), None, "{h}");
    // The attacks stay as text, so the reader sees what the model wrote.
    assert!(h.contains("&lt;script&gt;alert(1)&lt;/script&gt;"), "{h}");
}

#[test]
fn the_check_catches_what_it_should() {
    for bad in [
        "<script>x</script>",
        "<a href=\"java\tscript:x\">a</a>",
        "<a href=\"&#1;javascript:x\">a</a>".replace("&#1;", "\u{1}").as_str(),
        "<img src=\"https://evil.example/p.png\">",
        "<b onclick=\"x\">b</b>",
        "<p data-formula=\"[&quot;alert(1)&quot;]\">r</p>",
        "<video src=\"https://v.example/v.mp4\"></video>",
    ] {
        assert!(unsafe_in(bad).is_some(), "{bad} passed");
    }
    assert_eq!(unsafe_in("<a href=\"https://a.example/x\">a</a><img src=\"https://x.example/tram.jpg\">"), None);
}
