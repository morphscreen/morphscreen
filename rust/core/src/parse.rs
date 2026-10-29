//! The streaming parser: chunks of model text in, ops out.
//!
//! Two levels. The structure level scans for component tags (`<Card ...>`,
//! `</Card>`) and hands the text between them to the container's block
//! level, which reads Markdown line by line. Complete lines are read once;
//! only the line still arriving is looked at again, to stream its words.
//! A node is final when it closes, and every node's id is its position.

use crate::catalog::{Catalog, Component, Content};
use crate::inline::{self, read_open_tag, Attrs, Span, TagRead};
use crate::text::{self, from_html};
use crate::tree::{num, write_attrs, write_data, write_spans_field, Data, Node};
use crate::validate::{self, Diag};
use alloc::format;
use alloc::string::{String, ToString};
use alloc::sync::Arc;
use alloc::vec;
use alloc::vec::Vec;

#[derive(Clone, Copy, PartialEq)]
enum Wrapper {
    /// The first non-blank line hasn't arrived.
    Undecided,
    /// The whole answer came wrapped in a ``` fence: its lines are the answer.
    On,
    Done,
}

#[derive(Clone, Copy, PartialEq)]
enum Think {
    Undecided,
    Inside,
    Done,
}

#[derive(Clone, Copy, PartialEq)]
enum LineMode {
    /// A table row: components in it stay in their cells.
    Row,
    /// `bb_inline`: Badges, Buttons and Ratings on this line sit inside the text.
    Normal { bb_inline: bool },
}

enum Cur {
    None,
    Para { node: usize, lines: Vec<String> },
    /// A heading whose line is still arriving.
    Heading { node: usize },
    List { node: usize, item: Option<usize> },
    Table { node: usize, rows: usize, head: usize, body: Vec<Vec<String>> },
    Quote { node: usize, lines: Vec<String> },
    Code { node: usize, lines: Vec<String> },
}

struct Blocks {
    partial: String,
    cur: Cur,
    /// Inside Columns: the group holding the current text run.
    run: Option<usize>,
}

fn group_spec() -> Component {
    Component { name: "group".into(), about: String::new(), attrs: Vec::new(), content: Content::Any, parent: None, numeric: false, actions: false, origin: String::new() }
}

pub struct Parser {
    pub cat: Arc<Catalog>,
    pub nodes: Vec<Node>,
    pub diags: Vec<Diag>,
    ops: String,
    stack: Vec<usize>,
    /// Block state of the containers that have text in flight.
    blocks: Vec<(usize, Blocks)>,
    /// Text not yet read; `pos` is how far into it the structure level is.
    input: String,
    pos: usize,
    hold: String,
    line_no: usize,
    at_line_start: bool,
    /// Nothing but spaces read on this line yet: a `<` here opens the line.
    line_lead: bool,
    mode: LineMode,
    in_fence: bool,
    wrapper: Wrapper,
    think: Think,
    pub had_text: bool,
    ended: bool,
    /// Leaves whose spans changed since they were last sent: sent once per
    /// push (or when they close), not once per line.
    dirty: Vec<usize>,
    /// What's wrong with the components written inside open leaves' text,
    /// checked on the text as written (attributes are cleaned before they're
    /// stored), reported when the leaf closes.
    inline_diags: Vec<(usize, Vec<Diag>)>,
    /// A leaf whose open op is held back: if it also closes before anything
    /// else is sent, it goes out as one `node` op.
    held: Option<usize>,
    /// The last heading's level, so the next never skips one (h2 then h4).
    last_heading: usize,
    /// Bytes the structure level has looked at (to check it never re-reads).
    pub scanned: usize,
    /// Characters run through the inline parser while lines were arriving.
    pub reinlined: usize,
    /// Where the HTML's pictures may load from (none but data: until set).
    pub images: crate::images::ImagePolicy,
}

impl Parser {
    pub fn new(cat: Catalog) -> Parser {
        Parser::shared(Arc::new(cat))
    }

    /// A parser using a catalog other parsers share (a server builds it once
    /// and shares it between threads).
    pub fn shared(cat: Arc<Catalog>) -> Parser {
        let root = Node {
            id: String::new(),
            ty: "root".into(),
            written: "#root".into(),
            attrs: Vec::new(),
            children: Vec::new(),
            spans: Vec::new(),
            data: None,
            raw: String::new(),
            line: 1,
            parent: 0,
            closed: false,
            component: true,
            unknown: false,
            run: false,
            sep: false,
            max_cols: 0,
            lines: 0,
        };
        Parser {
            cat,
            nodes: vec![root],
            diags: Vec::new(),
            ops: String::new(),
            stack: vec![0],
            blocks: Vec::new(),
            input: String::new(),
            pos: 0,
            hold: String::new(),
            line_no: 1,
            at_line_start: true,
            line_lead: true,
            mode: LineMode::Normal { bb_inline: true },
            in_fence: false,
            wrapper: Wrapper::Undecided,
            think: Think::Undecided,
            had_text: false,
            ended: false,
            last_heading: 0,
            dirty: Vec::new(),
            inline_diags: Vec::new(),
            held: None,
            scanned: 0,
            reinlined: 0,
            images: Default::default(),
        }
    }

    /// Lets the HTML load pictures from the app's hosts, as the SDKs do; any
    /// other picture shows what it stood for.
    pub fn allow_images(&mut self, hosts: &[&str]) {
        self.images = crate::images::ImagePolicy::new(hosts);
    }

    /// Feeds the next chunk of the model's text.
    pub fn push(&mut self, chunk: &str) {
        if !self.ended {
            self.feed(chunk, false);
        }
    }

    /// The stream is over: whatever is still open closes, with a diagnostic.
    pub fn finish(&mut self, truncated: bool) {
        if self.ended {
            return;
        }
        self.feed("", true);
        self.end_run(0);
        while self.stack.len() > 1 {
            let n = self.stack.pop().unwrap();
            let (w, l) = (self.nodes[n].written.clone(), self.nodes[n].line);
            self.diag(Diag::error(l, "malformed-syntax", format!("<{}> never closed (line {})", w, l)));
            self.close_component(n);
        }
        self.flush_spans(None);
        self.ended = true;
        let complete = !self.diags.iter().any(|d| d.severity == validate::Severity::Error) && !truncated && self.had_text;
        self.ops.push_str(&format!("{{\"op\":\"end\",\"complete\":{},\"truncated\":{}}}\n", complete, truncated));
    }

    /// The ops produced since the last call, one JSON object per line.
    pub fn take_ops(&mut self) -> String {
        core::mem::take(&mut self.ops)
    }

    // ---------- before parsing: think blocks and emojis ----------

    fn feed(&mut self, chunk: &str, eof: bool) {
        self.hold.push_str(chunk);
        if self.think == Think::Undecided {
            let t = self.hold.trim_start();
            if t.starts_with("<think>") {
                self.think = Think::Inside;
            } else if !eof && (t.is_empty() || "<think>".starts_with(t)) {
                return;
            } else {
                self.think = Think::Done;
            }
        }
        if self.think == Think::Inside {
            match self.hold.find("</think>") {
                Some(p) => {
                    self.hold = self.hold[p + 8..].trim_start().to_string();
                    self.think = Think::Done;
                }
                None if eof => {
                    self.hold.clear();
                    self.think = Think::Done;
                }
                None => return,
            }
        }
        let keep = if eof { 0 } else { text::emoji_tail(&self.hold) };
        let cut = self.hold.len() - keep;
        let ready = text::strip_emoji(&self.hold[..cut]);
        self.hold.drain(..cut);
        if ready.chars().any(|c| !c.is_whitespace()) {
            self.had_text = true;
        }
        // What's been read goes once per chunk, not once per line.
        if self.pos > 0 {
            self.input.drain(..self.pos);
            self.pos = 0;
        }
        self.input.push_str(&ready);
        self.process(eof);
    }

    // ---------- structure level ----------

    fn process(&mut self, eof: bool) {
        loop {
            if self.pos >= self.input.len() {
                break;
            }
            if self.at_line_start {
                match self.line_start(eof) {
                    Step::Wait => break,
                    Step::Again => continue,
                    Step::Line => self.line_lead = true,
                }
            }
            if !self.scan(eof) {
                break;
            }
        }
        if !eof {
            self.provisional();
        }
        self.flush_spans(None);
    }

    fn consume_line(&mut self, nl: Option<usize>, forward: bool) {
        let end = nl.map_or(self.input.len() - self.pos, |p| p + 1);
        self.scanned += end;
        if forward {
            self.forward(end);
        } else {
            self.pos += end;
        }
        if nl.is_some() {
            self.line_no += 1;
        }
    }

    fn line_start(&mut self, eof: bool) -> Step {
        let rest = &self.input[self.pos..];
        let nl = rest.find('\n');
        let complete = nl.is_some() || eof;
        let end = nl.unwrap_or(rest.len());
        let line = rest[..end].to_string();
        let t = line.trim_start();
        if self.wrapper == Wrapper::Undecided {
            if t.trim().is_empty() {
                if !complete {
                    return Step::Wait;
                }
                self.consume_line(nl, false);
                return Step::Again;
            }
            if t.starts_with("```") {
                if !complete {
                    return Step::Wait;
                }
                let lang = t[3..].trim().to_ascii_lowercase();
                if ["", "md", "markdown", "mdx", "html", "xml", "jsx", "tsx"].contains(&lang.as_str()) {
                    self.wrapper = Wrapper::On;
                    self.consume_line(nl, false);
                    return Step::Again;
                }
            } else if !complete && t.chars().all(|c| c == '`') {
                return Step::Wait;
            }
            if self.wrapper == Wrapper::Undecided {
                self.wrapper = Wrapper::Done;
            }
        }
        // Only indentation so far: what the line is can't be told yet.
        if !complete && t.is_empty() {
            return Step::Wait;
        }
        if self.in_fence {
            if !complete {
                return Step::Wait;
            }
            if t.starts_with("```") {
                self.in_fence = false;
            }
            self.consume_line(nl, true);
            return Step::Again;
        }
        if t.starts_with("```") || (!complete && !t.is_empty() && t.chars().all(|c| c == '`')) {
            if !complete {
                return Step::Wait;
            }
            if t.starts_with("```") {
                if self.wrapper == Wrapper::On && t.trim() == "```" {
                    self.wrapper = Wrapper::Done;
                    self.consume_line(nl, false);
                    return Step::Again;
                }
                self.in_fence = true;
                self.consume_line(nl, true);
                return Step::Again;
            }
        }
        if t.starts_with('|') {
            if !complete {
                return Step::Wait;
            }
            self.mode = LineMode::Row;
            self.at_line_start = false;
            return Step::Line;
        }
        for name in ["<Badge", "<Button", "<Rating"] {
            if t.starts_with(name) && !t[name.len()..].starts_with(|c: char| c.is_ascii_alphanumeric()) {
                if !complete {
                    return Step::Wait;
                }
                self.mode = LineMode::Normal { bb_inline: !only_badges_and_buttons(t) };
                self.at_line_start = false;
                return Step::Line;
            }
            if !complete && !t.is_empty() && name.starts_with(t) {
                return Step::Wait;
            }
        }
        self.mode = LineMode::Normal { bb_inline: true };
        self.at_line_start = false;
        Step::Line
    }

    /// Scans the current line up to its end or a structural tag. False when
    /// it has to wait for more text.
    fn scan(&mut self, eof: bool) -> bool {
        let row = self.mode == LineMode::Row;
        let bb_inline = matches!(self.mode, LineMode::Normal { bb_inline: true });
        // Inside code every tag is text, but the one that closes it.
        let code_in = self.code_name();
        let mut i = 0;
        loop {
            let b = &self.input.as_bytes()[self.pos..];
            if i >= b.len() {
                self.scanned += i;
                if i > 0 {
                    self.forward(i);
                }
                return false;
            }
            match b[i] {
                b'\n' => {
                    self.scanned += i + 1;
                    self.forward(i + 1);
                    self.line_no += 1;
                    self.at_line_start = true;
                    return true;
                }
                b'`' => match self.input[self.pos + i + 1..].find(|c| c == '`' || c == '\n') {
                    Some(p) if b[i + 1 + p] == b'`' => i = i + 1 + p + 1,
                    Some(_) => i += 1,
                    None if eof => i += 1,
                    None => {
                        self.scanned += i;
                        if i > 0 {
                            self.forward(i);
                        }
                        return false;
                    }
                },
                b'<' => match b.get(i + 1) {
                    None => {
                        if eof {
                            i += 1;
                            continue;
                        }
                        self.scanned += i;
                        if i > 0 {
                            self.forward(i);
                        }
                        return false;
                    }
                    Some(b'/') => {
                        let upper = match b.get(i + 2) {
                            None if !eof => {
                                self.scanned += i;
                                if i > 0 {
                                    self.forward(i);
                                }
                                return false;
                            }
                            Some(c) => c.is_ascii_uppercase(),
                            None => false,
                        };
                        if !upper {
                            i += 1;
                            continue;
                        }
                        let Some(p) = self.input[self.pos + i..].find('>') else {
                            if eof {
                                i += 1;
                                continue;
                            }
                            self.scanned += i;
                            if i > 0 {
                                self.forward(i);
                            }
                            return false;
                        };
                        let gt = i + p;
                        let name = self.input[self.pos + i + 2..self.pos + gt].to_string();
                        if !name.bytes().all(|c| c.is_ascii_alphanumeric()) {
                            i += 1;
                            continue;
                        }
                        if row || (bb_inline && INLINE.contains(&name.as_str())) || code_in.as_deref().is_some_and(|c| c != name) {
                            i = gt + 1;
                            continue;
                        }
                        let line = self.line_no;
                        self.scanned += gt + 1;
                        self.forward(i);
                        self.end_run(self.target());
                        self.pos += gt + 1 - i;
                        self.line_lead = false;
                        self.close_tag(&name, line);
                        return true;
                    }
                    Some(c) if c.is_ascii_uppercase() => match read_open_tag(&self.input[self.pos..], i) {
                        TagRead::Incomplete => {
                            if eof {
                                if !row && code_in.is_none() {
                                    self.unread(i);
                                }
                                i += 1;
                                continue;
                            }
                            self.scanned += i;
                            if i > 0 {
                                self.forward(i);
                            }
                            return false;
                        }
                        TagRead::Invalid => {
                            if !row && code_in.is_none() {
                                self.unread(i);
                            }
                            i += 1;
                        }
                        TagRead::Ok { name, attrs, self_closing, end } => {
                            if row || (bb_inline && INLINE.contains(&name.as_str())) || code_in.is_some() {
                                i = end;
                                continue;
                            }
                            let line = self.line_no;
                            let newlines = self.input[self.pos + i..self.pos + end].matches('\n').count();
                            self.scanned += end;
                            self.forward(i);
                            self.end_run(self.target());
                            self.pos += end - i;
                            self.line_no += newlines;
                            self.line_lead = false;
                            self.open_tag(name, attrs, self_closing, line);
                            return true;
                        }
                    },
                    _ => i += 1,
                },
                _ => i += self.input[self.pos + i..].chars().next().unwrap().len_utf8(),
            }
        }
    }

    /// A line that opens with a known component's `<` the core can't read as
    /// a tag (an attribute without its `=` or its quotes, the format's
    /// signature notation copied into the answer): it shows as text, so it
    /// is an error of its own, not only the closing tags it leaves stray.
    fn unread(&mut self, i: usize) {
        if !self.line_lead || !self.input[self.pos..self.pos + i].trim().is_empty() {
            return;
        }
        let name: String = self.input[self.pos + i + 1..].chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
        if self.cat.component(&name).is_some() || self.cat.alias(&name).is_some() {
            let line = self.line_no;
            self.diag(Diag::error(line, "unreadable-tag", format!("<{name}> can't be read as a tag (line {line})")));
        }
    }

    /// Hands the first `n` bytes of input to the open container as text.
    fn forward(&mut self, n: usize) {
        if n == 0 {
            return;
        }
        // Lend the buffer out instead of copying the text.
        let input = core::mem::take(&mut self.input);
        let (a, b) = (self.pos, self.pos + n);
        if !input[a..b].trim().is_empty() {
            self.line_lead = false;
        }
        self.pos = b;
        self.text(&input[a..b]);
        self.input = input;
    }

    /// The node text goes to now: the open container (or its run group).
    fn target(&self) -> usize {
        *self.stack.last().unwrap()
    }

    fn is_block_container(&self, i: usize) -> bool {
        let n = &self.nodes[i];
        if n.ty == "root" || n.ty == "group" || n.unknown {
            return true;
        }
        matches!(self.cat.component(&n.ty).map(|c| &c.content), Some(Content::Any))
    }

    fn text(&mut self, t: &str) {
        let c = self.target();
        if !self.is_block_container(c) {
            self.nodes[c].raw.push_str(t);
            return;
        }
        if self.nodes[c].ty == "Columns" {
            let run = self.blocks.iter().find(|(k, _)| *k == c).and_then(|(_, b)| b.run);
            let g = match run {
                Some(g) => g,
                None => {
                    if t.trim().is_empty() {
                        return;
                    }
                    let g = self.add_node(c, "group", "group", Vec::new(), true);
                    self.nodes[g].run = true;
                    self.blocks_of(c).run = Some(g);
                    g
                }
            };
            self.feed_blocks(g, t);
            return;
        }
        self.feed_blocks(c, t);
    }

    /// The text run in container `c` is over (a tag follows, or the end).
    fn end_run(&mut self, c: usize) {
        if self.nodes[c].ty == "Columns" {
            if let Some(g) = self.blocks.iter_mut().find(|(k, _)| *k == c).and_then(|(_, b)| b.run.take()) {
                self.end_blocks(g);
                self.blocks.retain(|(k, _)| *k != g);
                self.nodes[g].closed = true;
                self.close_op(g);
            }
            return;
        }
        if self.is_block_container(c) {
            self.end_blocks(c);
        }
    }

    fn open_tag(&mut self, name: String, attrs: Attrs, self_closing: bool, line: usize) {
        let parent = self.target();
        let cat = self.cat.clone();
        let group = group_spec();
        let (ty, spec, unknown): (String, Option<&Component>, bool) = if let Some(c) = cat.component(&name) {
            (c.name.clone(), Some(c), false)
        } else if let Some(to) = cat.alias(&name).map(|s| s.to_string()) {
            self.diag(Diag::note(line, format!("alias <{}> read as {}", name, to), "hallucinated-component", name.clone()));
            if to == "group" {
                ("group".to_string(), Some(&group), false)
            } else {
                let c = cat.component(&to);
                (to, c, false)
            }
        } else {
            self.diag(Diag::error(line, "hallucinated-component", name.clone()));
            ("group".to_string(), None, true)
        };
        if let Some(p) = spec.and_then(|s| s.parent.clone()) {
            // A Result works its What-if's sliders out wherever it sits inside
            // it (in a Columns, say); the rest need theirs directly around them.
            let mut inside = self.nodes[parent].written == p;
            if !inside && spec.is_some_and(|s| s.name == "Result") {
                inside = crate::interactive::whatif_of(&self.nodes, parent).is_some() || self.nodes[parent].ty == "WhatIf";
            }
            if !inside {
                self.diag(Diag::error(line, "placement", format!("{} outside {}", name, p)));
            }
        }
        let attrs = match spec {
            Some(s) => {
                let mut d = Vec::new();
                let a = validate::clean_attrs(s, &name, attrs, line, &mut d);
                for x in d {
                    self.diag(x);
                }
                a
            }
            None => attrs,
        };
        let n = self.add_node(parent, &ty, &name, attrs, true);
        self.nodes[n].line = line;
        self.nodes[n].unknown = unknown;
        if ty == "Card" && self.nodes[n].attr("title").map_or(false, |t| !t.is_empty()) {
            let mut nested = false;
            let mut a = parent;
            while a != 0 {
                nested |= self.nodes[a].ty == "Card";
                a = self.nodes[a].parent;
            }
            self.last_heading = if nested { 3 } else { 2 };
        }
        let void = self_closing || matches!(spec.map(|s| &s.content), Some(Content::None));
        if void {
            self.close_component(n);
        } else {
            self.stack.push(n);
        }
    }

    fn close_tag(&mut self, name: &str, line: usize) {
        let open = self.stack.iter().skip(1).any(|&n| self.nodes[n].written == name);
        if self.cat.is_void(name) && !open {
            return;
        }
        match self.stack.iter().rposition(|&n| self.nodes[n].written == name) {
            Some(d) if d > 0 => {
                while self.stack.len() > d + 1 {
                    let k = self.stack.pop().unwrap();
                    let (w, l) = (self.nodes[k].written.clone(), self.nodes[k].line);
                    self.diag(Diag::error(line, "malformed-syntax", format!("<{}> closed by </{}> (line {})", w, name, line)));
                    self.diag(Diag::error(l, "malformed-syntax", format!("<{}> never closed (line {})", w, l)));
                    self.close_component(k);
                }
                let k = self.stack.pop().unwrap();
                self.close_component(k);
            }
            _ => self.diag(Diag::error(line, "malformed-syntax", format!("stray </{}> (line {})", name, line))),
        }
    }

    fn close_component(&mut self, n: usize) {
        self.end_run(n);
        let cat = self.cat.clone();
        let group = group_spec();
        let spec: Option<&Component> = if self.nodes[n].ty == "group" && !self.nodes[n].unknown { Some(&group) } else { cat.component(&self.nodes[n].ty) };
        if let Some(spec) = spec {
            let raw = self.nodes[n].raw.clone();
            match spec.content {
                Content::Text => {
                    // The label between the tags, or in a label attribute.
                    let mut label = raw.trim().to_string();
                    if label.is_empty() {
                        label = self.nodes[n].attr("label").unwrap_or("").trim().to_string();
                    }
                    if spec.name == "Badge" && self.nodes[n].attr("tone").map_or(false, |t| t != "neutral") {
                        let t = label.trim_start_matches(['●', '○', '◉', '◎', '•', '■', '□', '▪', '▫', '◆', '◇', '▲', '△', '▼', '▽']);
                        if t.len() != label.len() {
                            label = t.trim_start().to_string();
                        }
                    }
                    self.set_spans(n, inline::parse(&label));
                    if let Some(i) = self.inline_diags.iter().position(|(k, _)| *k == n) {
                        for x in self.inline_diags.swap_remove(i).1 {
                            self.diag(x);
                        }
                    }
                }
                Content::Table => self.nodes[n].data = validate::table_data(&raw),
                Content::List if spec.name == "Question" => {
                    let raw_items = validate::list_items(&raw);
                    let answer = crate::interactive::answer_index(self.nodes[n].attr("answer").unwrap_or(""), &raw_items);
                    if answer.is_none() && !raw_items.is_empty() {
                        // The quiz can't mark it: a note, and the reader sees the explanation.
                        self.diag(Diag::note(self.nodes[n].line, String::from("Question.answer names none of its choices"), "signature-mismatch", String::from("Question.answer not a choice")));
                    }
                    let items = raw_items.into_iter().map(inline::parse).collect();
                    self.nodes[n].data = Some(Data::Choices { items, answer });
                }
                Content::List if spec.name == "Checklist" => {
                    let items = validate::list_items(&raw).into_iter().map(crate::interactive::check).collect();
                    self.nodes[n].data = Some(Data::Checks { items });
                }
                Content::List => {
                    let items = validate::list_items(&raw).into_iter().map(inline::parse).collect();
                    self.nodes[n].data = Some(Data::List { items });
                }
                Content::Images => {
                    self.nodes[n].data = Some(Data::Images { images: validate::images_in(&raw) });
                }
                Content::Code => {
                    self.nodes[n].data = Some(Data::Lines(code_lines(&raw)));
                }
                Content::Any if spec.name == "Columns" => {
                    let items = self.nodes[n].children.clone();
                    let plan = crate::layout::columns(&self.nodes, &items);
                    self.nodes[n].data = Some(Data::Layout { per: plan.per, min: plan.min });
                }
                Content::None => match spec.name.as_str() {
                    // Worked out once here, so no renderer needs TeX or a QR encoder.
                    "Math" => {
                        let tex = self.nodes[n].attr("tex").unwrap_or("").to_string();
                        // A command the renderers don't draw would show as its name: the line goes back to be rewritten.
                        let unknown = crate::math::unsupported(&tex);
                        if !unknown.is_empty() {
                            let names: Vec<String> = unknown.iter().map(|c| alloc::format!("\\{c}")).collect();
                            self.diag(Diag::error(self.nodes[n].line, "signature-mismatch", alloc::format!("Math.tex: {} isn't supported; write it with plain symbols or \\text{{}}", names.join(", "))));
                        }
                        self.nodes[n].data = Some(Data::Lines(alloc::vec![crate::math::to_unicode(&tex)]));
                    }
                    "Result" => {
                        let src = self.nodes[n].attr("value").unwrap_or("").to_string();
                        match crate::formula::compile(&src) {
                            Ok(rpn) => {
                                // Its value at the sliders' starting values, from the What-if around it.
                                let around = crate::interactive::whatif_of(&self.nodes, n).map(|w| crate::interactive::sliders_in(&self.nodes, &self.nodes[w].children)).unwrap_or_default();
                                let sliders: Vec<(String, Option<f64>)> = around.iter().map(|&c| (crate::interactive::slider_name(&self.nodes[c]), crate::interactive::slider_value(&self.nodes[c]))).collect();
                                let value = crate::formula::eval(&rpn, |name| sliders.iter().find(|(k, _)| k.eq_ignore_ascii_case(name)).and_then(|(_, v)| *v));
                                self.nodes[n].data = Some(Data::Formula { rpn, value });
                            }
                            Err(why) => self.diag(Diag::error(self.nodes[n].line, "signature-mismatch", alloc::format!("Result.value: {why}"))),
                        }
                    }
                    "Slider" => {
                        // Off its step, a value snaps the first time the reader moves
                        // anything while its label and the Results keep the old one:
                        // put on its step here, once, for every renderer.
                        let (value, step) = crate::interactive::on_step(&self.nodes[n]);
                        if let Some(s) = step {
                            self.nodes[n].attrs.push((String::from("step"), Some(s)));
                        }
                        if let Some(v) = value {
                            let was = String::from(self.nodes[n].attr("value").unwrap_or(""));
                            if let Some(a) = self.nodes[n].attrs.iter_mut().find(|(k, _)| k == "value") {
                                a.1 = Some(v.clone());
                            }
                            self.diag(Diag::note(self.nodes[n].line, alloc::format!("Slider.value {was} put on its step: {v}"), "signature-mismatch", alloc::format!("Slider.value {was} off its step")));
                        }
                    }
                    "QR" => {
                        let value = self.nodes[n].attr("value").unwrap_or("").to_string();
                        match crate::qr::encode(&value) {
                            Some(rows) => self.nodes[n].data = Some(Data::Lines(rows)),
                            None => self.diag(Diag::error(self.nodes[n].line, "signature-mismatch", String::from("QR.value longer than 213 bytes"))),
                        }
                    }
                    _ => {}
                },
                _ => {}
            }
            let mut d = Vec::new();
            validate::check_content(spec, &self.nodes[n], &self.nodes, &mut d);
            for x in d {
                self.diag(x);
            }
        }
        self.nodes[n].closed = true;
        self.blocks.retain(|(k, _)| *k != n);
        self.close_op(n);
    }

    // ---------- block level ----------

    fn blocks_of(&mut self, c: usize) -> &mut Blocks {
        let i = match self.blocks.iter().position(|(k, _)| *k == c) {
            Some(i) => i,
            None => {
                self.blocks.push((c, Blocks { partial: String::new(), cur: Cur::None, run: None }));
                self.blocks.len() - 1
            }
        };
        &mut self.blocks[i].1
    }

    fn feed_blocks(&mut self, c: usize, t: &str) {
        self.blocks_of(c).partial.push_str(t);
        while let Some(p) = self.blocks_of(c).partial.find('\n') {
            let b = self.blocks_of(c);
            let line: String = b.partial[..p].to_string();
            b.partial.drain(..=p);
            self.complete_line(c, &line);
        }
    }

    fn end_blocks(&mut self, c: usize) {
        if !self.blocks.iter().any(|(k, _)| *k == c) {
            return;
        }
        let rest = core::mem::take(&mut self.blocks_of(c).partial);
        if !rest.is_empty() {
            self.complete_line(c, &rest);
        }
        self.end_block(c);
    }

    fn complete_line(&mut self, c: usize, line: &str) {
        if let Cur::Code { node, lines } = &mut self.blocks_of(c).cur {
            let node = *node;
            if line.trim_start().starts_with("```") {
                self.end_block(c);
            } else {
                lines.push(line.to_string());
                let text = lines.join("\n");
                self.set_spans(node, vec![Span::Text(text)]);
            }
            return;
        }
        let expanded = from_html(line);
        for sub in expanded.split('\n') {
            self.block_line(c, sub);
        }
    }

    fn block_line(&mut self, c: usize, raw: &str) {
        let l = raw.trim();
        if l.is_empty() {
            self.end_block(c);
            return;
        }
        if let Some(rest) = l.strip_prefix("```") {
            self.end_block(c);
            let lang = rest.trim();
            let attrs = if lang.is_empty() { Vec::new() } else { vec![("lang".to_string(), Some(lang.to_string()))] };
            let node = self.add_node(c, "code", "code", attrs, false);
            self.blocks_of(c).cur = Cur::Code { node, lines: Vec::new() };
            return;
        }
        if let Some((level, text)) = heading(l) {
            let node = match core::mem::replace(&mut self.blocks_of(c).cur, Cur::None) {
                Cur::Heading { node } => node,
                other => {
                    self.blocks_of(c).cur = other;
                    self.end_block(c);
                    let shown = self.heading_level(c, level);
                    self.add_node(c, "h", "h", vec![("level".to_string(), Some(shown.to_string()))], false)
                }
            };
            self.set_spans(node, inline::parse(text));
            self.close_block(node);
            return;
        }
        if l == "---" || l == "***" || l == "___" {
            self.end_block(c);
            let node = self.add_node(c, "hr", "hr", Vec::new(), false);
            self.close_block(node);
            return;
        }
        if l.starts_with('|') {
            if !matches!(self.blocks_of(c).cur, Cur::Table { .. }) {
                self.end_block(c);
                let node = self.add_node(c, "table", "table", Vec::new(), false);
                self.blocks_of(c).cur = Cur::Table { node, rows: 0, head: 0, body: Vec::new() };
            }
            self.table_row(c, l);
            return;
        }
        if let Some((ordered, text)) = validate::list_item(l) {
            let (list, item) = match core::mem::replace(&mut self.blocks_of(c).cur, Cur::None) {
                Cur::List { node, item } => (node, item),
                other => {
                    self.blocks_of(c).cur = other;
                    self.end_block(c);
                    (self.add_node(c, if ordered { "ol" } else { "ul" }, "list", Vec::new(), false), None)
                }
            };
            let (task, text) = task_item(text);
            let li = item.unwrap_or_else(|| self.add_node(list, "li", "li", task_attrs(task), false));
            self.set_spans(li, inline::parse(text));
            self.close_block(li);
            self.blocks_of(c).cur = Cur::List { node: list, item: None };
            return;
        }
        if let Some(rest) = l.strip_prefix('>') {
            let text = rest.strip_prefix(' ').unwrap_or(rest).to_string();
            let node = match &mut self.blocks_of(c).cur {
                Cur::Quote { node, lines } => {
                    lines.push(text);
                    *node
                }
                _ => {
                    self.end_block(c);
                    let node = self.add_node(c, "quote", "quote", Vec::new(), false);
                    self.blocks_of(c).cur = Cur::Quote { node, lines: vec![text] };
                    node
                }
            };
            let joined = match &self.blocks_of(c).cur {
                Cur::Quote { lines, .. } => lines.join(" "),
                _ => String::new(),
            };
            self.nodes[node].lines += 1;
            self.set_spans(node, inline::parse(&joined));
            return;
        }
        let node = match &mut self.blocks_of(c).cur {
            Cur::Para { node, lines } => {
                lines.push(l.to_string());
                *node
            }
            _ => {
                self.end_block(c);
                let node = self.add_node(c, "p", "p", Vec::new(), false);
                self.blocks_of(c).cur = Cur::Para { node, lines: vec![l.to_string()] };
                node
            }
        };
        let joined = match &self.blocks_of(c).cur {
            Cur::Para { lines, .. } => lines.join(" "),
            _ => String::new(),
        };
        self.set_spans(node, inline::parse(&joined));
    }

    fn table_row(&mut self, c: usize, line: &str) {
        let cells = text::cells(line);
        let Cur::Table { node, rows, .. } = &self.blocks_of(c).cur else { return };
        let (table, seen) = (*node, *rows);
        self.nodes[table].max_cols = self.nodes[table].max_cols.max(cells.len());
        if seen == 1 && text::is_separator(line) {
            self.nodes[table].sep = true;
            if let Cur::Table { rows, .. } = &mut self.blocks_of(c).cur {
                *rows += 1;
            }
            return;
        }
        // A body row updates its columns' alignment before its cells are drawn,
        // so each cell is drawn as its column stands and a column rarely
        // changes when the table closes (only data sent on close reaches the SDKs).
        if seen > 0 {
            let align = match &mut self.blocks_of(c).cur {
                Cur::Table { head, body, .. } => {
                    body.push(cells.clone());
                    column_align(*head, body)
                }
                _ => Vec::new(),
            };
            self.nodes[table].data = Some(Data::Align(align));
        }
        let attrs = if seen == 0 { vec![("head".to_string(), None)] } else { Vec::new() };
        let row = self.add_node(table, "row", "row", attrs, false);
        for cell in &cells {
            let cn = self.add_node(row, "cell", "cell", Vec::new(), false);
            self.set_spans(cn, inline::parse(cell));
            self.close_block(cn);
        }
        self.close_block(row);
        if let Cur::Table { rows, head, .. } = &mut self.blocks_of(c).cur {
            if seen == 0 {
                *head = cells.len();
            }
            *rows += 1;
        }
    }

    fn end_block(&mut self, c: usize) {
        let cur = core::mem::replace(&mut self.blocks_of(c).cur, Cur::None);
        match cur {
            Cur::None => {}
            Cur::Para { node, .. } | Cur::Quote { node, .. } | Cur::Heading { node } | Cur::Code { node, .. } => self.close_block(node),
            Cur::List { node, item } => {
                if let Some(li) = item {
                    self.close_block(li);
                }
                self.close_block(node);
            }
            Cur::Table { node, head, body, .. } => {
                self.nodes[node].data = Some(Data::Align(column_align(head, &body)));
                self.close_block(node);
            }
        }
    }

    /// Streams the words of the line still arriving into the open block.
    fn provisional(&mut self) {
        let mut c = self.target();
        if !self.is_block_container(c) {
            return;
        }
        if self.nodes[c].ty == "Columns" {
            match self.blocks.iter().find(|(k, _)| *k == c).and_then(|(_, b)| b.run) {
                Some(g) => c = g,
                None => return,
            }
        }
        let partial = match self.blocks.iter().find(|(k, _)| *k == c).map(|(_, b)| b) {
            Some(b) if !b.partial.is_empty() && !matches!(b.cur, Cur::Code { .. }) => b.partial.clone(),
            _ => return,
        };
        let Some(cut) = partial.rfind(char::is_whitespace) else { return };
        let words = partial[..cut].trim();
        if words.is_empty() {
            return;
        }
        // A tag may still be arriving, or HTML may still reshape the line
        // when it ends: wait for the line rather than guess.
        let b = words.as_bytes();
        if b.windows(2).any(|w| w[0] == b'<' && (w[1].is_ascii_alphabetic() || w[1] == b'/')) {
            return;
        }
        // A link or photo shows once it has closed, never as its markdown.
        let words = match inline::unfinished_link(words) {
            Some(p) => words[..p].trim_end(),
            None => words,
        };
        if words.is_empty() {
            return;
        }
        self.reinlined += words.len();
        match classify(words) {
            Prov::Wait => {}
            Prov::Para => {
                let node = match &self.blocks_of(c).cur {
                    Cur::Para { node, .. } => *node,
                    _ => {
                        self.end_block(c);
                        let node = self.add_node(c, "p", "p", Vec::new(), false);
                        self.blocks_of(c).cur = Cur::Para { node, lines: Vec::new() };
                        node
                    }
                };
                let mut joined = match &self.blocks_of(c).cur {
                    Cur::Para { lines, .. } => lines.join(" "),
                    _ => String::new(),
                };
                if !joined.is_empty() {
                    joined.push(' ');
                }
                joined.push_str(words);
                self.reinlined += joined.len();
                self.set_spans(node, inline::parse(&joined));
            }
            Prov::Heading(level, _) => {
                let node = match &self.blocks_of(c).cur {
                    Cur::Heading { node } => *node,
                    _ => {
                        self.end_block(c);
                        let shown = self.heading_level(c, level);
                        let node = self.add_node(c, "h", "h", vec![("level".to_string(), Some(shown.to_string()))], false);
                        self.blocks_of(c).cur = Cur::Heading { node };
                        node
                    }
                };
                let text = heading(words).map(|(_, t)| t).unwrap_or("");
                if !text.is_empty() {
                    self.set_spans(node, inline::parse(text));
                }
            }
            Prov::Item(ordered) => {
                let Some((_, item_text)) = validate::list_item(words) else { return };
                let (task, text) = task_item(item_text);
                // "[", "[ ]", "[x" could still turn out to be a task marker.
                if task.is_none() && ["[", "[ ", "[ ]", "[x", "[X", "[x]", "[X]"].contains(&item_text) {
                    return;
                }
                if text.is_empty() && task.is_some() {
                    return;
                }
                let li = match core::mem::replace(&mut self.blocks_of(c).cur, Cur::None) {
                    Cur::List { node, item: Some(li) } => {
                        self.blocks_of(c).cur = Cur::List { node, item: Some(li) };
                        li
                    }
                    Cur::List { node, item: None } => {
                        let li = self.add_node(node, "li", "li", task_attrs(task), false);
                        self.blocks_of(c).cur = Cur::List { node, item: Some(li) };
                        li
                    }
                    other => {
                        self.blocks_of(c).cur = other;
                        self.end_block(c);
                        let list = self.add_node(c, if ordered { "ol" } else { "ul" }, "list", Vec::new(), false);
                        let li = self.add_node(list, "li", "li", task_attrs(task), false);
                        self.blocks_of(c).cur = Cur::List { node: list, item: Some(li) };
                        li
                    }
                };
                self.set_spans(li, inline::parse(text));
            }
            Prov::Quote => {
                let text = words.strip_prefix('>').map(|r| r.strip_prefix(' ').unwrap_or(r)).unwrap_or(words);
                let node = match &self.blocks_of(c).cur {
                    Cur::Quote { node, .. } => *node,
                    _ => {
                        self.end_block(c);
                        let node = self.add_node(c, "quote", "quote", Vec::new(), false);
                        self.blocks_of(c).cur = Cur::Quote { node, lines: Vec::new() };
                        node
                    }
                };
                let mut joined = match &self.blocks_of(c).cur {
                    Cur::Quote { lines, .. } => lines.join(" "),
                    _ => String::new(),
                };
                if !joined.is_empty() {
                    joined.push(' ');
                }
                joined.push_str(text);
                self.set_spans(node, inline::parse(&joined));
            }
        }
    }

    /// The level a heading is shown at: its own plus the Cards around it (at
    /// most two), never more than one below the previous heading.
    fn heading_level(&mut self, c: usize, written: usize) -> usize {
        let mut cards = 0;
        let mut a = c;
        while a != 0 {
            if self.nodes[a].ty == "Card" {
                cards += 1;
            }
            a = self.nodes[a].parent;
        }
        let level = (written + cards.min(2)).min(6);
        let level = if self.last_heading > 0 { level.min(self.last_heading + 1) } else { level };
        self.last_heading = level;
        level
    }

    // ---------- nodes and ops ----------

    fn add_node(&mut self, parent: usize, ty: &str, written: &str, attrs: Attrs, component: bool) -> usize {
        let idx = self.nodes.len();
        let k = self.nodes[parent].children.len();
        let id = if self.nodes[parent].id.is_empty() { format!("{}", k) } else { format!("{}.{}", self.nodes[parent].id, k) };
        let node = Node {
            id,
            ty: ty.to_string(),
            written: written.to_string(),
            attrs,
            children: Vec::new(),
            spans: Vec::new(),
            data: None,
            raw: String::new(),
            line: self.line_no,
            parent,
            closed: false,
            component,
            unknown: false,
            run: false,
            sep: false,
            max_cols: 0,
            lines: 0,
        };
        self.nodes.push(node);
        self.nodes[parent].children.push(idx);
        let n = &self.nodes[idx];
        let _ = n;
        // The parent is the id up to its last dot; attrs only when there are
        // some. A leaf's open is held, in case it finishes right away.
        self.release();
        if self.is_leaf(idx) {
            self.held = Some(idx);
        } else {
            self.open_op(idx, "open");
            self.ops.push_str("}\n");
        }
        idx
    }

    fn set_spans(&mut self, n: usize, spans: Vec<Span>) {
        let mut d = Vec::new();
        validate::check_inline(&self.cat, &spans, self.nodes[n].line, &mut d);
        match self.inline_diags.iter().position(|(k, _)| *k == n) {
            Some(i) if d.is_empty() => {
                self.inline_diags.swap_remove(i);
            }
            Some(i) => self.inline_diags[i].1 = d,
            None if !d.is_empty() => self.inline_diags.push((n, d)),
            None => {}
        }
        let spans = normalize(&self.cat, spans);
        if self.nodes[n].spans == spans {
            return;
        }
        self.nodes[n].spans = spans;
        if !self.dirty.contains(&n) {
            self.dirty.push(n);
        }
    }

    /// Sends the spans of leaves that changed (`only`: just that node).
    fn flush_spans(&mut self, only: Option<usize>) {
        if only.is_none() {
            self.release();
        }
        let mut i = 0;
        while i < self.dirty.len() {
            let n = self.dirty[i];
            if only.map_or(false, |o| o != n) {
                i += 1;
                continue;
            }
            self.dirty.remove(i);
            self.ops.push_str("{\"op\":\"spans\",\"id\":");
            crate::json::write_str(&mut self.ops, &self.nodes[n].id.clone());
            self.ops.push_str(",\"spans\":");
            let spans = core::mem::take(&mut self.nodes[n].spans);
            write_spans_field(&mut self.ops, &spans);
            self.nodes[n].spans = spans;
            self.ops.push_str("}\n");
        }
    }

    /// Whether a node is a leaf the renderers draw whole (its open can be held).
    /// The written name of the code component text is going to, if it is one.
    fn code_name(&self) -> Option<String> {
        let n = &self.nodes[self.target()];
        (n.component && matches!(self.cat.component(&n.ty).map(|c| &c.content), Some(Content::Code))).then(|| n.written.clone())
    }

    fn is_leaf(&self, n: usize) -> bool {
        let node = &self.nodes[n];
        if !node.component {
            return matches!(node.ty.as_str(), "p" | "h" | "li" | "cell" | "quote" | "code" | "hr");
        }
        matches!(self.cat.component(&node.ty).map(|c| &c.content), Some(Content::None | Content::Text | Content::Table | Content::List | Content::Images | Content::Code))
    }

    /// Sends the held leaf's open op (something else is about to be sent).
    fn release(&mut self) {
        if let Some(h) = self.held.take() {
            self.open_op(h, "open");
            self.ops.push_str("}\n");
        }
    }

    /// `{"op":KIND,"id":..,"type":..[,"attrs":..]` (the caller closes it).
    fn open_op(&mut self, idx: usize, kind: &str) {
        self.ops.push_str("{\"op\":\"");
        self.ops.push_str(kind);
        self.ops.push_str("\",\"id\":");
        crate::json::write_str(&mut self.ops, &self.nodes[idx].id.clone());
        self.ops.push_str(",\"type\":");
        crate::json::write_str(&mut self.ops, &self.nodes[idx].ty.clone());
        if !self.nodes[idx].attrs.is_empty() {
            self.ops.push_str(",\"attrs\":");
            let attrs = self.nodes[idx].attrs.clone();
            write_attrs(&mut self.ops, &attrs);
        }
        // Its icon's path, so a renderer draws it without a table of its own.
        if let Some(path) = self.nodes[idx].attrs.iter().find(|(k, _)| k == "icon").and_then(|(_, v)| v.as_deref()).and_then(crate::icon::find).map(|x| x.1) {
            self.ops.push_str(",\"icon\":");
            crate::json::write_str(&mut self.ops, path);
        }
    }

    fn close_block(&mut self, n: usize) {
        if self.nodes[n].closed {
            return;
        }
        if let Some(i) = self.inline_diags.iter().position(|(k, _)| *k == n) {
            for x in self.inline_diags.swap_remove(i).1 {
                self.diag(x);
            }
        }
        self.nodes[n].closed = true;
        self.close_op(n);
    }

    fn close_op(&mut self, n: usize) {
        if self.held == Some(n) {
            // Opened and finished with nothing in between: one op.
            self.held = None;
            self.dirty.retain(|&d| d != n);
            self.open_op(n, "node");
            if !self.nodes[n].spans.is_empty() {
                self.ops.push_str(",\"spans\":");
                let spans = core::mem::take(&mut self.nodes[n].spans);
                write_spans_field(&mut self.ops, &spans);
                self.nodes[n].spans = spans;
            }
            if let Some(d) = self.nodes[n].data.clone() {
                self.ops.push_str(",\"data\":");
                write_data(&mut self.ops, &d);
            }
            self.ops.push_str("}\n");
            return;
        }
        self.release();
        self.flush_spans(Some(n));
        self.ops.push_str("{\"op\":\"close\",\"id\":");
        crate::json::write_str(&mut self.ops, &self.nodes[n].id.clone());
        if let Some(d) = self.nodes[n].data.clone() {
            self.ops.push_str(",\"data\":");
            write_data(&mut self.ops, &d);
        }
        self.ops.push_str("}\n");
    }

    fn diag(&mut self, d: Diag) {
        self.release();
        self.ops.push_str("{\"op\":\"diag\",\"line\":");
        num(&mut self.ops, d.line);
        self.ops.push_str(",\"cls\":");
        crate::json::write_str(&mut self.ops, d.cls);
        self.ops.push_str(",\"detail\":");
        crate::json::write_str(&mut self.ops, &d.detail);
        self.ops.push_str(",\"severity\":");
        self.ops.push_str(if d.severity == validate::Severity::Error { "\"error\"" } else { "\"note\"" });
        self.ops.push_str("}\n");
        self.diags.push(d);
    }

    /// The finished tree as JSON.
    pub fn tree_json(&self) -> String {
        let mut s = String::new();
        crate::tree::write_tree(&mut s, &self.nodes, 0);
        s
    }

    pub fn verdict(&self, truncated: bool, reqs: usize, strict: bool) -> validate::Verdict {
        validate::verdict(&self.cat, &self.nodes, &self.diags, self.had_text, truncated, reqs, strict)
    }
}

enum Step {
    Wait,
    Again,
    Line,
}

enum Prov {
    Wait,
    Para,
    Heading(usize, ()),
    Item(bool),
    Quote,
}

/// What a line still arriving will be, once that can no longer change. Uses
/// the same whitespace rule (Unicode) as the finished-line reader.
fn classify(t: &str) -> Prov {
    let b = t.as_bytes();
    let Some(&c) = b.first() else { return Prov::Wait };
    // Whether the character at byte `i` is whitespace (None: not arrived yet).
    let ws = |i: usize| t.get(i..).and_then(|r| r.chars().next()).map(char::is_whitespace);
    match c {
        b'#' => {
            let n = b.iter().take_while(|&&x| x == b'#').count();
            match ws(n) {
                None => Prov::Wait,
                Some(true) if n <= 6 => Prov::Heading(n, ()),
                Some(_) => Prov::Para,
            }
        }
        b'-' | b'*' | b'+' | b'_' => match ws(1) {
            None => Prov::Wait,
            Some(true) if c != b'_' => Prov::Item(false),
            Some(_) if t.trim_end().bytes().all(|x| x == c) && t.trim_end().len() <= 3 => Prov::Wait,
            Some(_) => Prov::Para,
        },
        b'|' | b'<' | b'`' => Prov::Wait,
        b'>' => Prov::Quote,
        b'0'..=b'9' => {
            let n = b.iter().take_while(|x| x.is_ascii_digit()).count();
            match b.get(n) {
                None => Prov::Wait,
                Some(b'.') | Some(b')') => match ws(n + 1) {
                    None => Prov::Wait,
                    Some(true) => Prov::Item(true),
                    Some(false) => Prov::Para,
                },
                Some(_) => Prov::Para,
            }
        }
        _ => Prov::Para,
    }
}

fn heading(l: &str) -> Option<(usize, &str)> {
    let n = l.bytes().take_while(|&x| x == b'#').count();
    if n == 0 || n > 6 {
        return None;
    }
    let rest = &l[n..];
    let text = rest.trim_start();
    if text.len() == rest.len() {
        return None;
    }
    Some((n, text))
}

/// `[ ] task` / `[x] done`: (Some(done?), the text).
fn task_item(t: &str) -> (Option<bool>, &str) {
    for (mark, done) in [("[ ]", false), ("[x]", true), ("[X]", true)] {
        if let Some(rest) = t.strip_prefix(mark) {
            let r = rest.trim_start();
            if r.len() != rest.len() && !r.is_empty() {
                return (Some(done), r);
            }
        }
    }
    (None, t)
}

fn task_attrs(task: Option<bool>) -> Attrs {
    match task {
        Some(done) => vec![("task".to_string(), Some(if done { "done" } else { "open" }.to_string()))],
        None => Vec::new(),
    }
}

/// A table cell that's a number (right-aligned): render/html.ts's rule.
/// Which columns hold numbers: every body cell in them does.
fn column_align(head: usize, body: &[Vec<String>]) -> Vec<bool> {
    (0..head).map(|k| !body.is_empty() && body.iter().all(|r| table_num(r.get(k).map(|s| s.as_str()).unwrap_or("")))).collect()
}

fn table_num(s: &str) -> bool {
    let t = s.trim();
    let cs: Vec<char> = t.chars().collect();
    let mut i = 0;
    if i < cs.len() && (cs[i] == '-' || cs[i] == '+') {
        i += 1;
    }
    if i < cs.len() && "$€£₹¥".contains(cs[i]) {
        i += 1;
    }
    if i < cs.len() && cs[i].is_whitespace() {
        i += 1;
    }
    if i < cs.len() && (cs[i] == '-' || cs[i] == '+') {
        i += 1;
    }
    if i >= cs.len() || !cs[i].is_ascii_digit() {
        return false;
    }
    while i < cs.len() && (cs[i].is_ascii_digit() || cs[i] == ',' || cs[i] == '.') {
        i += 1;
    }
    if i < cs.len() && cs[i].is_whitespace() {
        i += 1;
    }
    let rest: String = cs[i..].iter().collect();
    matches!(rest.as_str(), "" | "%" | "k" | "K" | "m" | "M" | "b" | "B" | "ms" | "s" | "h" | "x")
}

/// Components inside text get the same clean-up as standalone ones: canonical
/// attribute values, and no typed bullet before a Badge's own dot.
fn normalize(cat: &Catalog, spans: Vec<Span>) -> Vec<Span> {
    spans
        .into_iter()
        .map(|s| match s {
            Span::El { ty, attrs, children } => {
                let resolved = cat.component(&ty).map(|c| c.name.clone()).or_else(|| cat.alias(&ty).map(|a| a.to_string()));
                let spec = resolved.as_deref().and_then(|r| cat.component(r)).cloned();
                let attrs = match &spec {
                    Some(spec) => validate::clean_attrs(spec, &ty, attrs, 0, &mut Vec::new()),
                    None => attrs,
                };
                let mut children = normalize(cat, children);
                let ty = resolved.unwrap_or(ty);
                if ty == "Badge" && attrs.iter().any(|(k, v)| k == "tone" && v.as_deref().map_or(false, |t| t != "neutral")) {
                    if let Some(Span::Text(t)) = children.first_mut() {
                        let stripped = t.trim_start_matches(['●', '○', '◉', '◎', '•', '■', '□', '▪', '▫', '◆', '◇', '▲', '△', '▼', '▽']);
                        if stripped.len() != t.len() {
                            *t = stripped.trim_start().to_string();
                        }
                    }
                }
                Span::El { ty, attrs, children }
            }
            Span::Fmt(f, c) => Span::Fmt(f, normalize(cat, c)),
            Span::Link(h, c) => Span::Link(h, normalize(cat, c)),
            other => other,
        })
        .collect()
}

/// Components that sit inside a sentence when written in one: a Badge, a
/// Button, a Rating ("rated <Rating value=4.6/> by buyers").
const INLINE: &[&str] = &["Badge", "Button", "Rating"];

/// A line made only of Badge, Button and Rating elements is a row of them.
fn only_badges_and_buttons(t: &str) -> bool {
    let mut s = t.trim();
    while !s.is_empty() {
        let Some(&name) = INLINE.iter().find(|n| s.strip_prefix('<').is_some_and(|r| r.starts_with(**n))) else {
            return false;
        };
        let rest = &s[1 + name.len()..];
        if rest.starts_with(|c: char| c.is_ascii_alphanumeric()) {
            return false;
        }
        let Some(gt) = s.find('>') else { return false };
        if s[..gt].ends_with('/') {
            s = s[gt + 1..].trim_start();
            continue;
        }
        let close = format!("</{}>", name);
        let body = &s[gt + 1..];
        match body.find(close.as_str()) {
            Some(p) if !body[..p].contains('<') => s = body[p + close.len()..].trim_start(),
            _ => return false,
        }
    }
    true
}

/// The lines of a code component: a fence around them (with its language) is
/// dropped, and the indentation they share, so code reads the same written either way.
pub fn code_lines(raw: &str) -> Vec<String> {
    let mut lines: Vec<&str> = raw.lines().collect();
    while lines.first().is_some_and(|l| l.trim().is_empty()) {
        lines.remove(0);
    }
    while lines.last().is_some_and(|l| l.trim().is_empty()) {
        lines.pop();
    }
    if lines.first().is_some_and(|l| l.trim_start().starts_with("```")) {
        lines.remove(0);
        if lines.last().is_some_and(|l| l.trim() == "```") {
            lines.pop();
        }
    }
    // Indentation is spaces and tabs (one byte each); other spaces at a line's start are its text.
    let lead = |l: &str| l.bytes().take_while(|&b| b == b' ' || b == b'\t').count();
    let indent = lines.iter().filter(|l| !l.trim().is_empty()).map(|l| lead(l)).min().unwrap_or(0);
    lines.iter().map(|l| String::from(&l[lead(l).min(indent)..])).collect()
}
