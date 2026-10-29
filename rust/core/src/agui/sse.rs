//! Server-Sent Events framing (the WHATWG grammar): bytes in as they arrive,
//! each event's data out once its blank line has come. AG-UI's binding sends
//! one event per frame and only `data:` fields matter; comments, `event:`,
//! `id:` and `retry:` are read past.

use alloc::string::String;
use alloc::vec::Vec;

#[derive(Default)]
pub struct Sse {
    line: Vec<u8>,
    data: String,
    has_data: bool,
    /// The last byte was a CR, so a LF right after it ends nothing new.
    after_cr: bool,
    started: bool,
}

impl Sse {
    /// Feeds bytes; returns the data of every event they completed.
    pub fn push(&mut self, bytes: &[u8]) -> Vec<String> {
        let mut out = Vec::new();
        for &b in bytes {
            if b == b'\n' && self.after_cr {
                self.after_cr = false;
                continue;
            }
            self.after_cr = b == b'\r';
            if b == b'\n' || b == b'\r' {
                self.end_line(&mut out);
            } else {
                self.line.push(b);
            }
        }
        out
    }

    fn end_line(&mut self, out: &mut Vec<String>) {
        let mut line = core::mem::take(&mut self.line);
        if !self.started {
            self.started = true;
            if line.starts_with(&[0xEF, 0xBB, 0xBF]) {
                line.drain(..3);
            }
        }
        if line.is_empty() {
            if self.has_data {
                let mut d = core::mem::take(&mut self.data);
                if d.ends_with('\n') {
                    d.pop();
                }
                out.push(d);
            }
            self.has_data = false;
            return;
        }
        if line[0] == b':' {
            return;
        }
        let text = String::from_utf8_lossy(&line);
        let (field, value) = match text.find(':') {
            Some(i) => (&text[..i], text[i + 1..].strip_prefix(' ').unwrap_or(&text[i + 1..])),
            None => (&text[..], ""),
        };
        if field == "data" {
            self.data.push_str(value);
            self.data.push('\n');
            self.has_data = true;
        }
    }

    /// The stream closed: an event without its blank line is dropped, as the
    /// grammar says. True when one was.
    pub fn close(&mut self) -> bool {
        let partial = self.has_data || !self.line.is_empty();
        *self = Sse::default();
        partial
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_split_anywhere() {
        let s = b": keep-alive\n\ndata: {\"a\":1}\n\nevent: x\nid: 7\ndata: {\"b\":\r\ndata: 2}\r\n\r\ndata:{\"c\":\"\xc3\xa9\"}\n\n";
        let whole = Sse::default().push(s);
        assert_eq!(whole, ["{\"a\":1}", "{\"b\":\n2}", "{\"c\":\"\u{e9}\"}"]);
        for cut in 1..s.len() {
            let mut p = Sse::default();
            let mut got = p.push(&s[..cut]);
            got.extend(p.push(&s[cut..]));
            assert_eq!(got, whole, "cut at {cut}");
        }
    }

    #[test]
    fn an_unfinished_event_is_dropped() {
        let mut p = Sse::default();
        assert!(p.push(b"data: {\"a\":1}\n").is_empty());
        assert!(p.close());
    }
}
