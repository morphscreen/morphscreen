//! What the reader did, as the user message that starts the model's next
//! turn (spec/format.md, "Actions"), worded once here so every SDK and the
//! API send the same thing. A vote names the poll's question and a form its
//! fields' labels when the SDK sends them, so the model needn't guess from
//! history that may have been trimmed.

use crate::json::Value;
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;

fn number(n: f64) -> String {
    let mut s = String::new();
    crate::json::write_num(&mut s, n);
    s
}

/// A field's value in words.
fn words(v: &Value) -> String {
    match v {
        Value::Str(s) => s.clone(),
        Value::Num(n) => number(*n),
        Value::Bool(b) => (if *b { "yes" } else { "no" }).into(),
        Value::Null => String::new(),
        Value::Arr(items) => {
            let parts: Vec<String> = items
                .iter()
                .map(|x| match x {
                    // An upload: its name and type.
                    Value::Obj(_) if x.get("name").is_some() => {
                        let name = x.str("name").unwrap_or("a file");
                        match x.str("type").filter(|t| !t.is_empty()) {
                            Some(t) => format!("{name} ({t})"),
                            None => name.into(),
                        }
                    }
                    other => words(other),
                })
                .collect();
            if parts.is_empty() {
                "none".into()
            } else {
                parts.join(", ")
            }
        }
        Value::Obj(_) => match (v.get("lat"), v.get("lng")) {
            (Some(Value::Num(lat)), Some(Value::Num(lng))) => {
                let acc = match v.get("accuracy") {
                    Some(Value::Num(a)) => format!(" (within {} m)", number((*a).round_half())),
                    _ => String::new(),
                };
                format!("{}, {}{acc}", number(*lat), number(*lng))
            }
            _ => crate::json::to_string(v),
        },
    }
}

trait Round {
    fn round_half(self) -> f64;
}
impl Round for f64 {
    fn round_half(self) -> f64 {
        let t = self as i64 as f64;
        if self - t >= 0.5 {
            t + 1.0
        } else {
            t
        }
    }
}

fn quoted(s: &str) -> String {
    format!("\"{}\"", s.trim())
}

/// The user message for an action, or None for one that starts no turn (a
/// Checklist tick, a card marked known: the app keeps those as state).
pub fn message(a: &Value) -> Option<String> {
    match a.str("type")? {
        "ask" => Some(a.str("text")?.into()),
        "vote" => {
            let choice = a.str("choice")?;
            match a.str("question").filter(|q| !q.trim().is_empty()) {
                Some(q) => Some(format!("I voted for {} in the poll {}.", quoted(choice), quoted(q))),
                None => Some(format!("I voted for {}.", quoted(choice))),
            }
        }
        "quiz" => {
            let n = |k: &str| match a.get(k) {
                Some(Value::Num(x)) => number(*x),
                _ => "0".into(),
            };
            let mut out = format!("I finished the quiz: {} of {} right.", n("score"), n("total"));
            if let Some(Value::Arr(answers)) = a.get("answers") {
                for (i, x) in answers.iter().enumerate() {
                    let mark = match x.get("right") {
                        Some(Value::Bool(true)) => " (right)",
                        Some(Value::Bool(false)) => " (wrong)",
                        _ => "",
                    };
                    out.push_str(&format!("\n{}. {} I answered {}{mark}.", i + 1, x.str("question").unwrap_or("").trim(), quoted(x.str("choice").unwrap_or(""))));
                }
            }
            Some(out)
        }
        "submit" => {
            let form = a.str("form").filter(|f| !f.trim().is_empty());
            let button = a.str("button").filter(|b| !b.trim().is_empty());
            let mut out = String::from("I filled in the form");
            if let Some(f) = form {
                out.push_str(&format!(" {}", quoted(f)));
            }
            if let Some(b) = button {
                out.push_str(&format!(" and pressed {}", quoted(b)));
            }
            out.push(':');
            if let Some(Value::Obj(fields)) = a.get("fields") {
                for (k, v) in fields {
                    let label = a.get("labels").and_then(|l| l.str(k)).map(str::trim).filter(|l| !l.is_empty()).unwrap_or(k);
                    out.push_str(&format!("\n- {label}: {}", words(v)));
                }
            }
            Some(out)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::json::parse;

    fn say(a: &str) -> Option<String> {
        message(&parse(a).unwrap())
    }

    #[test]
    fn each_action_in_words() {
        assert_eq!(say(r#"{"type":"ask","text":"Show me the cheaper one","node":"1.2"}"#).unwrap(), "Show me the cheaper one");
        assert_eq!(say(r#"{"type":"vote","node":"1","name":"lunch","choice":"Pizza"}"#).unwrap(), "I voted for \"Pizza\".");
        assert_eq!(
            say(r#"{"type":"quiz","node":"1","score":1,"total":2,"answers":[{"question":"Which gas?","choice":"Oxygen","right":true},{"question":"Where?","choice":"Roots","right":false}]}"#).unwrap(),
            "I finished the quiz: 1 of 2 right.\n1. Which gas? I answered \"Oxygen\" (right).\n2. Where? I answered \"Roots\" (wrong)."
        );
        assert_eq!(
            say(r#"{"type":"submit","node":"1","form":"booking","button":"Book","fields":{"name":"Ana","guests":3,"vegan":true,"diet":["nuts","soy"],"photo":[{"file":"f1","name":"id.jpg","type":"image/jpeg","size":1200}],"where":{"lat":12.97,"lng":77.59,"accuracy":20.4}}}"#).unwrap(),
            "I filled in the form \"booking\" and pressed \"Book\":\n- name: Ana\n- guests: 3\n- vegan: yes\n- diet: nuts, soy\n- photo: id.jpg (image/jpeg)\n- where: 12.97, 77.59 (within 20 m)"
        );
        assert_eq!(say(r#"{"type":"state","node":"1","name":"packing","value":["Passport"]}"#), None);
    }

    #[test]
    fn a_vote_names_its_question_and_a_form_its_labels() {
        assert_eq!(
            say(r#"{"type":"vote","node":"1","name":"mood","question":"Which mood above your desk?","choice":"Bright and breezy"}"#).unwrap(),
            "I voted for \"Bright and breezy\" in the poll \"Which mood above your desk?\"."
        );
        assert_eq!(
            say(r#"{"type":"submit","node":"1","form":"route","button":"Plan it","fields":{"focus":"The Night Watch","extras":["The library"],"time":2},"labels":{"focus":"Choose your focus","extras":" "}}"#).unwrap(),
            "I filled in the form \"route\" and pressed \"Plan it\":\n- Choose your focus: The Night Watch\n- extras: The library\n- time: 2"
        );
    }
}
