//! The server side: AG-UI events for an answer as the model writes it, framed
//! for the HTTP + SSE binding.
//!
//! ```text
//! let mut e = Emitter::new("thread-1", "run-1");
//! out.push_str(&e.start());
//! out.push_str(&e.text("msg-1", "<Card title=\"Plan\">\n"));   // opens msg-1, then each delta
//! out.push_str(&e.finish());                                    // closes msg-1, ends the run
//! ```

use super::{patch, VERSION};
use crate::json::{self, Value};
use alloc::string::{String, ToString};
use alloc::vec;
use alloc::vec::Vec;

/// One event as an SSE frame.
pub fn frame(event: &Value) -> String {
    let mut s = String::from("data: ");
    json::write(&mut s, event);
    s.push_str("\n\n");
    s
}

fn ev(kv: Vec<(&str, Value)>) -> Value {
    Value::Obj(kv.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

fn st(s: &str) -> Value {
    Value::Str(s.into())
}

/// One run's events: the run, the assistant's messages, the state.
pub struct Emitter {
    thread: String,
    run: String,
    open: Option<String>,
    state: Option<Value>,
}

impl Emitter {
    pub fn new(thread: &str, run: &str) -> Emitter {
        Emitter { thread: thread.into(), run: run.into(), open: None, state: None }
    }

    pub fn start(&self) -> String {
        frame(&ev(vec![("type", st("RUN_STARTED")), ("threadId", st(&self.thread)), ("runId", st(&self.run)), ("protocolVersion", st(VERSION))]))
    }

    /// The next piece of an assistant message's text; opens it first, and
    /// closes the one before it.
    pub fn text(&mut self, message: &str, delta: &str) -> String {
        let mut out = String::new();
        if self.open.as_deref() != Some(message) {
            out.push_str(&self.close());
            out.push_str(&frame(&ev(vec![("type", st("TEXT_MESSAGE_START")), ("messageId", st(message)), ("role", st("assistant"))])));
            self.open = Some(message.into());
        }
        if !delta.is_empty() {
            out.push_str(&frame(&ev(vec![("type", st("TEXT_MESSAGE_CONTENT")), ("messageId", st(message)), ("delta", st(delta))])));
        }
        out
    }

    /// Closes the open message, if any.
    pub fn close(&mut self) -> String {
        match self.open.take() {
            Some(m) => frame(&ev(vec![("type", st("TEXT_MESSAGE_END")), ("messageId", Value::Str(m))])),
            None => String::new(),
        }
    }

    /// The shared state: the whole of it the first time, then only what changed.
    pub fn state(&mut self, next: &Value) -> String {
        let out = match &self.state {
            None => frame(&ev(vec![("type", st("STATE_SNAPSHOT")), ("snapshot", next.clone())])),
            Some(prev) => {
                let ops = patch::diff(prev, next);
                if ops.is_empty() {
                    String::new()
                } else {
                    frame(&ev(vec![("type", st("STATE_DELTA")), ("delta", Value::Arr(ops))]))
                }
            }
        };
        self.state = Some(next.clone());
        out
    }

    /// Ends the run (closing any open message first).
    pub fn finish(&mut self) -> String {
        let mut out = self.close();
        out.push_str(&frame(&ev(vec![("type", st("RUN_FINISHED")), ("threadId", st(&self.thread)), ("runId", st(&self.run))])));
        out
    }

    /// The run failed: what went wrong, for a person to read.
    pub fn error(&mut self, message: &str, code: Option<&str>) -> String {
        self.open = None;
        let mut kv = vec![("type", st("RUN_ERROR")), ("message", st(message))];
        if let Some(c) = code {
            kv.push(("code", st(c)));
        }
        frame(&ev(kv))
    }
}

/// A whole saved answer as one run, its text in pieces of about `piece`
/// bytes (split on character boundaries), the way a model streams it.
pub fn answer(thread: &str, run: &str, message: &str, text: &str, piece: usize) -> String {
    let mut e = Emitter::new(thread, run);
    let mut out = e.start();
    let mut rest = text;
    out.push_str(&e.text(message, ""));
    while !rest.is_empty() {
        let mut cut = piece.max(1).min(rest.len());
        while !rest.is_char_boundary(cut) {
            cut += 1;
        }
        out.push_str(&e.text(message, &rest[..cut]));
        rest = &rest[cut..];
    }
    out.push_str(&e.finish());
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agui::Client;

    #[test]
    fn what_the_emitter_sends_the_client_reads() {
        let text = "<Card title=\"Trip\">\nPack **light**. \u{1f6eb}\n</Card>\n";
        let sse = answer("t", "r", "m", text, 7);
        let mut c = Client::new();
        for b in sse.as_bytes().chunks(5) {
            c.feed(b);
        }
        c.close();
        assert!(c.warnings.is_empty(), "{:?}", c.warnings);
        assert_eq!(c.messages()[0].str("content"), Some(text));
        assert!(!c.take().contains("rejected"));
    }

    #[test]
    fn state_goes_whole_then_as_changes() {
        let mut e = Emitter::new("t", "r");
        let a = json::parse(r#"{"morphscreen":{"m":{"1":{"done":[0]}}}}"#).unwrap();
        let b = json::parse(r#"{"morphscreen":{"m":{"1":{"done":[0,1]}}}}"#).unwrap();
        assert!(e.state(&a).contains("STATE_SNAPSHOT"));
        let d = e.state(&b);
        assert!(d.contains(r#""op":"replace","path":"/morphscreen/m/1/done""#), "{d}");
        assert_eq!(e.state(&b), "");
    }
}
