//! Retired shapes (the protocol's DEPRECATIONS.md, all expiring 2027-09-17),
//! translated before an event is judged, as the protocol asks: an optional
//! field sent as null reads as absent, the THINKING_* events become their
//! REASONING_* replacements, and a `binary` content part becomes the media
//! part it stands for. Each translation warns.

use crate::json::Value;
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec::Vec;

/// Fields an older producer may send as null, by where they sit.
fn nullable(at: &str) -> &'static [&'static str] {
    match at {
        "event" => &["rawEvent", "subagentRunId"],
        "RUN_STARTED" => &["parentRunId", "input"],
        "RUN_FINISHED" => &["result", "outcome"],
        "RUN_ERROR" => &["usage"],
        "SUBAGENT_FINISHED" => &["result"],
        "TOOL_CALL_START" | "TOOL_CALL_CHUNK" => &["parentMessageId"],
        "TOOL_CALL_RESULT" => &["role"],
        "outcome" => &["pendingToolCallIds"],
        "usage" => &["provider", "reasoningTokens", "cachedInputTokens", "cacheWriteInputTokens"],
        "RunAgentInput" => &["forwardedProps"],
        "Tool" => &["parameters"],
        "ResumeEntry" => &["payload"],
        "part" => &["metadata"],
        _ => &[],
    }
}

#[derive(Default)]
pub struct Compat {
    reasoning: Option<String>,
    message: Option<String>,
    minted: usize,
    noticed: Vec<String>,
}

impl Compat {
    fn nulls(&mut self, v: &mut Value, at: &str, label: &str, warn: &mut Vec<String>) {
        let Value::Obj(kv) = v else { return };
        let fields = nullable(at);
        kv.retain(|(k, x)| {
            if *x == Value::Null && fields.contains(&k.as_str()) {
                let what = format!("{label}{k}: null");
                if !self.noticed.contains(&what) {
                    warn.push(format!("read {what} as an absent field (a retired shape; omit the field)"));
                    self.noticed.push(what);
                }
                false
            } else {
                true
            }
        });
    }

    fn each(&mut self, v: &mut Value, field: &str, at: &str, label: &str, warn: &mut Vec<String>) {
        if let Some(Value::Arr(items)) = v.get_mut(field) {
            for x in items.iter_mut() {
                self.nulls(x, at, label, warn);
            }
        }
    }

    fn mint(&mut self, from: &str, warn: &mut Vec<String>) -> String {
        self.minted += 1;
        let id = format!("reasoning-{}", self.minted);
        warn.push(format!("made up the id '{id}' for {from}: no THINKING opener came before it"));
        id
    }

    /// Messages arriving (a snapshot, RUN_STARTED's input, a saved conversation).
    pub fn messages(&mut self, v: &mut Value, warn: &mut Vec<String>) {
        if let Value::Arr(list) = v {
            for m in list.iter_mut() {
                if let Some(Value::Arr(parts)) = m.get_mut("content") {
                    for p in parts.iter_mut() {
                        if matches!(p.str("type"), Some("image" | "audio" | "video" | "document")) {
                            self.nulls(p, "part", "a media part's ", warn);
                        }
                    }
                }
                upgrade_binary(m, warn);
            }
        }
    }

    fn input(&mut self, v: &mut Value, warn: &mut Vec<String>) {
        self.nulls(v, "RunAgentInput", "RunAgentInput.", warn);
        self.each(v, "tools", "Tool", "Tool.", warn);
        self.each(v, "resume", "ResumeEntry", "ResumeEntry.", warn);
        if let Some(m) = v.get_mut("messages") {
            self.messages(m, warn);
        }
    }

    /// One event, before it's judged.
    pub fn event(&mut self, v: &mut Value, warn: &mut Vec<String>) {
        let ty = v.str("type").unwrap_or("").to_string();
        if ty == "RUN_STARTED" {
            self.noticed.clear();
        }
        self.nulls(v, "event", "", warn);
        self.nulls(v, &ty, &format!("{ty}."), warn);
        let rename = |v: &mut Value, to: &str, warn: &mut Vec<String>| {
            warn.push(format!("read {ty} as {to} (a retired shape)"));
            v.set("type", Value::Str(to.into()));
        };
        match ty.as_str() {
            "THINKING_START" => {
                self.minted += 1;
                let id = format!("reasoning-{}", self.minted);
                self.reasoning = Some(id.clone());
                if v.remove("title").is_some() {
                    warn.push("dropped THINKING_START's title: REASONING_START has no place for it".into());
                }
                rename(v, "REASONING_START", warn);
                v.set("messageId", Value::Str(id));
            }
            "THINKING_TEXT_MESSAGE_START" => {
                self.minted += 1;
                let id = format!("reasoning-{}", self.minted);
                self.message = Some(id.clone());
                rename(v, "REASONING_MESSAGE_START", warn);
                v.set("messageId", Value::Str(id));
                v.set("role", Value::Str("reasoning".into()));
            }
            "THINKING_TEXT_MESSAGE_CONTENT" => {
                let id = match self.message.clone() {
                    Some(id) => id,
                    None => self.mint(&ty, warn),
                };
                rename(v, "REASONING_MESSAGE_CONTENT", warn);
                v.set("messageId", Value::Str(id));
            }
            "THINKING_TEXT_MESSAGE_END" => {
                let id = match self.message.take() {
                    Some(id) => id,
                    None => self.mint(&ty, warn),
                };
                rename(v, "REASONING_MESSAGE_END", warn);
                v.set("messageId", Value::Str(id));
            }
            "THINKING_END" => {
                let id = match self.reasoning.take() {
                    Some(id) => id,
                    None => self.mint(&ty, warn),
                };
                rename(v, "REASONING_END", warn);
                v.set("messageId", Value::Str(id));
            }
            "RUN_FINISHED" => {
                if let Some(o) = v.get_mut("outcome") {
                    self.nulls(o, "outcome", "RUN_FINISHED.outcome.", warn);
                }
                self.each(v, "usage", "usage", "RUN_FINISHED.usage[].", warn);
            }
            "MESSAGES_SNAPSHOT" => {
                if let Some(m) = v.get_mut("messages") {
                    self.messages(m, warn);
                }
            }
            "RUN_STARTED" => {
                if let Some(i) = v.get_mut("input") {
                    self.input(i, warn);
                }
            }
            _ => {}
        }
    }
}

/// A `binary` part as the media part it stands for, by its MIME type; a
/// legacy part that only mirrors a modern one beside it is dropped.
pub fn upgrade_binary(m: &mut Value, warn: &mut Vec<String>) {
    let Some(Value::Arr(parts)) = m.get_mut("content") else { return };
    if !parts.iter().any(|p| p.str("type") == Some("binary")) {
        return;
    }
    let old = core::mem::take(parts);
    let mut out: Vec<Value> = Vec::with_capacity(old.len());
    for p in &old {
        if p.str("type") != Some("binary") {
            out.push(p.clone());
            continue;
        }
        let Some(mime) = p.str("mimeType") else {
            out.push(p.clone());
            continue;
        };
        let kind = if mime.starts_with("image/") {
            "image"
        } else if mime.starts_with("audio/") {
            "audio"
        } else if mime.starts_with("video/") {
            "video"
        } else {
            "document"
        };
        let (src, value) = match (p.str("data"), p.str("url")) {
            (Some(d), _) if !d.is_empty() => ("data", d),
            (_, Some(u)) if !u.is_empty() => ("url", u),
            _ => {
                warn.push("a binary part with only an id can't become a media part; it was left as it is".into());
                out.push(p.clone());
                continue;
            }
        };
        let source = Value::Obj(alloc::vec![("type".into(), Value::Str(src.into())), ("value".into(), Value::Str(value.into())), ("mimeType".into(), Value::Str(mime.into()))]);
        let mut part = Value::Obj(alloc::vec![("type".into(), Value::Str(kind.into())), ("source".into(), source.clone())]);
        let filename = p.str("filename");
        if let Some(f) = filename {
            part.set("metadata", Value::Obj(alloc::vec![("filename".into(), Value::Str(f.into()))]));
        }
        // A mirror of a modern part already there: keep the modern one.
        let mirrored = old.iter().any(|q| {
            q.str("type") == Some(kind) && q.get("source").is_some_and(|s| super::patch::same(s, &source)) && filename.is_none_or(|f| q.get("metadata").and_then(|m| m.str("filename")) == Some(f))
        });
        if !mirrored {
            out.push(part);
        }
    }
    *parts = out;
}
