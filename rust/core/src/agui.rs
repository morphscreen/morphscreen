//! AG-UI (github.com/ag-ui-protocol/ag-ui, protocol 1.0), done once here for
//! every platform: the client side that reads an agent's event stream into
//! the conversation and the shared state, and (in `emit`) what a server needs
//! to send one.
//!
//! The client follows the protocol's processing model in its order: each
//! event is judged against the schema (unrecognised material removed with a
//! warning, a malformed known value fatal), chunks are expanded, the stream
//! discipline is verified (runs, messages, tool calls, steps, reasoning,
//! subagents), and only then is the event applied. What the app needs to
//! draw comes out as updates, one JSON object per line:
//!
//! ```text
//! {"t":"run","threadId":"t1","runId":"r1"}
//! {"t":"message","id":"m1","role":"assistant","index":1}   a message appeared
//! {"t":"text","id":"m1","delta":"<Card ..."}                its text grew
//! {"t":"end","id":"m1"}                                     it's complete ("truncated":true if the run broke off)
//! {"t":"reset","id":"m1"}                                   its text was replaced; text and end follow
//! {"t":"removed","id":"m1"}                                 a snapshot dropped it
//! {"t":"changed","id":"m1"}                                 tool calls, metadata or activity changed
//! {"t":"tool","id":"c1","name":"search","arguments":"{..}","parentMessageId":"m1"}
//! {"t":"state"}                                             the shared state changed
//! {"t":"step","name":"plan","started":true}
//! {"t":"custom","name":"..","value":..}
//! {"t":"finished","outcome":"success","pending":["c1"]}     or "interrupt" with "interrupts", or "cancelled"
//! {"t":"error","message":"..","code":".."}                  the agent reported its run failed
//! {"t":"rejected","message":".."}                           the stream broke the protocol; nothing more is read
//! {"t":"truncated"}                                         the stream ended without its run ending
//! {"t":"warn","message":".."}
//! ```
//!
//! The interactive components' state lives in the shared state under
//! `morphscreen`, by message and node: `{"morphscreen": {"m1": {"1.2":
//! {"done": [0, 2]}}}}`, so an agent sees what the reader did and can set it.

use crate::json::{self, Value};
use alloc::collections::BTreeMap;
use alloc::format;
use alloc::string::{String, ToString};
use alloc::vec;
use alloc::vec::Vec;

mod compat;
pub mod emit;
pub mod patch;
mod schema;
pub mod sse;
pub mod strip;

/// The protocol version this core speaks.
pub const VERSION: &str = "1.0";
/// The shared state's key for the components' state.
pub const STATE_KEY: &str = "morphscreen";

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Text,
    Tool,
    Reasoning,
}

/// A chunk stream being assembled (one per owner: the agent, or a subagent).
struct Pending {
    kind: Kind,
    id: String,
    role: Option<String>,
    name: Option<String>,
    parent: Option<String>,
    owner: Option<String>,
}

/// What one stream (one request's response) has open. Messages and state
/// outlive it; this starts over with each request.
#[derive(Default)]
struct Stream {
    first: bool,
    started: bool,
    finished: bool,
    errored: bool,
    rejected: bool,
    lanes: Vec<(Option<String>, Pending)>,
    text: Vec<String>,
    tools: Vec<String>,
    spans: Vec<String>,
    reasoning: Vec<String>,
    own_msg: BTreeMap<String, Option<String>>,
    own_tool: BTreeMap<String, Option<String>>,
    own_act: BTreeMap<String, Option<String>>,
    own_rsn: BTreeMap<String, Option<String>>,
    steps: Vec<(Option<String>, String)>,
    subs: Vec<String>,
    done_subs: Vec<String>,
    run_tools: Vec<String>,
    answered: Vec<String>,
}

impl Stream {
    fn reset_run(&mut self) {
        let first = self.first;
        *self = Stream { first, started: true, ..Stream::default() };
    }
}

/// The conversation with one agent.
#[derive(Default)]
pub struct Client {
    sse: sse::Sse,
    messages: Vec<Value>,
    state: Value,
    out: String,
    s: Stream,
    compat: compat::Compat,
    /// Keep every event delivered to the app (for conformance tests).
    pub record: bool,
    pub delivered: Vec<Value>,
    pub warnings: Vec<String>,
}

fn obj(kv: Vec<(&str, Value)>) -> Value {
    Value::Obj(kv.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

fn st(s: &str) -> Value {
    Value::Str(s.into())
}

fn opt(v: &Value, k: &str) -> Option<String> {
    v.str(k).map(String::from)
}

fn owner_name(o: &Option<String>) -> String {
    match o {
        Some(s) => format!("subagent '{s}'"),
        None => "the agent".into(),
    }
}

/// A user or tool message's text: the string, or its text parts in order.
fn content_text(v: Option<&Value>) -> String {
    match v {
        Some(Value::Str(s)) => s.clone(),
        Some(Value::Arr(parts)) => parts.iter().filter(|p| p.str("type") == Some("text")).filter_map(|p| p.str("text")).collect::<Vec<_>>().join(""),
        _ => String::new(),
    }
}

/// Roles whose content is text a reader sees.
fn has_text(role: &str) -> bool {
    matches!(role, "assistant" | "user" | "system" | "developer" | "reasoning")
}

impl Client {
    pub fn new() -> Client {
        Client { state: Value::Obj(Vec::new()), ..Client::default() }
    }

    // ---------- in ----------

    /// Bytes of the response body (Server-Sent Events), as they arrive.
    pub fn feed(&mut self, bytes: &[u8]) {
        for data in self.sse.push(bytes) {
            self.event(&data);
        }
    }

    /// One event as JSON, for apps with their own transport.
    pub fn event(&mut self, text: &str) {
        if self.s.rejected {
            return;
        }
        match json::parse(text) {
            Ok(v) => self.value(v),
            Err(e) => self.reject(format!("an event that isn't JSON ({e})")),
        }
    }

    /// The response ended. A run still open is a truncated one.
    pub fn close(&mut self) {
        if self.sse.close() {
            self.warn("the stream ended inside an event, which was dropped".into());
        }
        if self.s.rejected {
            return;
        }
        if !self.s.first || (self.s.started && !self.s.finished && !self.s.errored) {
            self.end_open(true);
            self.emit(vec![("t", st("truncated"))]);
        }
    }

    /// The updates since the last call, one JSON object per line.
    pub fn take(&mut self) -> String {
        core::mem::take(&mut self.out)
    }

    // ---------- the conversation ----------

    pub fn messages(&self) -> &[Value] {
        &self.messages
    }

    pub fn message(&self, id: &str) -> Option<&Value> {
        self.messages.iter().find(|m| m.str("id") == Some(id))
    }

    pub fn state(&self) -> &Value {
        &self.state
    }

    /// Replaces the shared state (the app's own change; sent with the next run).
    pub fn set_state(&mut self, v: Value) {
        self.state = v;
    }

    /// Starts from a saved conversation: messages as AG-UI messages, and the state.
    pub fn load(&mut self, messages: Value, state: Option<Value>) -> Result<(), String> {
        let mut removed = Vec::new();
        let mut messages = messages;
        let mut notes = Vec::new();
        self.compat.messages(&mut messages, &mut notes);
        for n in notes {
            self.warn(n);
        }
        let Value::Arr(list) = messages else { return Err("the messages should be an array".into()) };
        for m in list {
            if let Some(m) = strip::judge(m, strip::MESSAGE, &mut removed)? {
                let id = opt(&m, "id").unwrap_or_default();
                if self.message(&id).is_none() {
                    self.messages.push(m);
                    self.announce(self.messages.len() - 1);
                }
            }
        }
        for p in removed {
            self.warn(format!("removed unrecognised {p} from a saved message"));
        }
        if let Some(s) = state {
            self.state = s;
            self.emit(vec![("t", st("state"))]);
        }
        Ok(())
    }

    /// A message of the app's own (the reader's, or a tool's answer), added
    /// before the next run; it must be an AG-UI message.
    pub fn add(&mut self, m: Value) -> Result<(), String> {
        let mut removed = Vec::new();
        let m = strip::judge(m, strip::MESSAGE, &mut removed)?.ok_or("a message of a role this version doesn't know")?;
        if let Some(id) = m.str("id") {
            if self.find(id).is_some() {
                return Err(format!("there's already a message '{id}'"));
            }
        }
        self.messages.push(m);
        self.announce(self.messages.len() - 1);
        Ok(())
    }

    /// The reader's own message (text, or AG-UI content parts).
    pub fn user(&mut self, id: &str, content: Value) -> Result<(), String> {
        self.add(obj(vec![("id", st(id)), ("role", st("user")), ("content", content)]))
    }

    /// The app's answer to a tool call the agent left for it.
    pub fn tool_result(&mut self, id: &str, tool_call: &str, content: Value, error: Option<&str>) -> Result<(), String> {
        let mut kv = vec![("id", st(id)), ("role", st("tool")), ("toolCallId", st(tool_call)), ("content", content)];
        if let Some(e) = error {
            kv.push(("error", st(e)));
        }
        self.add(obj(kv))
    }

    /// The request body for the next run, as JSON. `extra` adds tools,
    /// context, forwardedProps, resume or parentRunId. A new request is a new
    /// stream, so what the last one had open is forgotten.
    pub fn input(&mut self, thread: &str, run: &str, extra: Option<Value>) -> Result<String, String> {
        let mut messages: Vec<Value> = self.messages.iter().filter(|m| m.str("role") != Some("activity")).cloned().collect();
        let mut notes = Vec::new();
        for m in messages.iter_mut() {
            compat::upgrade_binary(m, &mut notes);
        }
        for n in notes {
            self.warn(n);
        }
        let mut kv = vec![("threadId", st(thread)), ("runId", st(run)), ("protocolVersion", st(VERSION))];
        if self.state != Value::Null {
            kv.push(("state", self.state.clone()));
        }
        kv.push(("messages", Value::Arr(messages)));
        let mut input = obj(kv);
        if let Some(Value::Obj(more)) = extra {
            for (k, v) in more {
                if v != Value::Null {
                    input.set(&k, v);
                }
            }
        }
        let mut removed = Vec::new();
        let input = strip::judge(input, strip::RUN_AGENT_INPUT, &mut removed)?.ok_or("the input isn't a run input")?;
        for p in removed {
            self.warn(format!("removed unrecognised {p} from the outgoing input"));
        }
        self.s = Stream::default();
        self.sse = sse::Sse::default();
        Ok(json::to_string(&input))
    }

    // ---------- the components' state ----------

    /// The components' state for one answer: node id to its state.
    pub fn components(&self, message: &str) -> Value {
        self.state.get(STATE_KEY).and_then(|m| m.get(message)).cloned().unwrap_or(Value::Obj(Vec::new()))
    }

    /// Records one component's state (the reader ticked, answered, typed).
    /// False when the shared state isn't an object, so there's nowhere to keep it.
    pub fn set_component(&mut self, message: &str, node: &str, value: Value) -> bool {
        if self.state == Value::Null {
            self.state = Value::Obj(Vec::new());
        }
        let Value::Obj(_) = self.state else { return false };
        if !matches!(self.state.get(STATE_KEY), Some(Value::Obj(_))) {
            self.state.set(STATE_KEY, Value::Obj(Vec::new()));
        }
        let all = self.state.get_mut(STATE_KEY).unwrap();
        if !matches!(all.get(message), Some(Value::Obj(_))) {
            all.set(message, Value::Obj(Vec::new()));
        }
        all.get_mut(message).unwrap().set(node, value);
        true
    }

    // ---------- out ----------

    fn emit(&mut self, kv: Vec<(&str, Value)>) {
        json::write(&mut self.out, &obj(kv));
        self.out.push('\n');
    }

    fn warn(&mut self, m: String) {
        self.emit(vec![("t", st("warn")), ("message", st(&m))]);
        self.warnings.push(m);
    }

    fn reject(&mut self, m: String) {
        self.s.rejected = true;
        self.end_open(true);
        self.emit(vec![("t", st("rejected")), ("message", st(&m))]);
    }

    /// Announces the message at `i`: it appeared, with all its text so far.
    fn announce(&mut self, i: usize) {
        let m = &self.messages[i];
        let id = opt(m, "id").unwrap_or_default();
        let role = opt(m, "role").unwrap_or_default();
        let text = if has_text(&role) { content_text(m.get("content")) } else { String::new() };
        self.emit(vec![("t", st("message")), ("id", st(&id)), ("role", st(&role)), ("index", Value::Num(i as f64))]);
        if !text.is_empty() {
            self.emit(vec![("t", st("text")), ("id", st(&id)), ("delta", Value::Str(text))]);
        }
        if has_text(&role) {
            self.emit(vec![("t", st("end")), ("id", st(&id))]);
        }
    }

    /// Ends every text message still open (the run broke off).
    fn end_open(&mut self, truncated: bool) {
        let open: Vec<String> = self.s.text.drain(..).chain(self.s.reasoning.drain(..)).collect();
        for id in open {
            let mut kv = vec![("t", st("end")), ("id", st(&id))];
            if truncated {
                kv.push(("truncated", Value::Bool(true)));
            }
            self.emit(kv);
        }
    }

    fn find(&self, id: &str) -> Option<usize> {
        self.messages.iter().rposition(|m| m.str("id") == Some(id))
    }

    // ---------- the pipeline ----------

    fn value(&mut self, mut v: Value) {
        let mut notes = Vec::new();
        self.compat.event(&mut v, &mut notes);
        for n in notes {
            self.warn(n);
        }
        let ty = match v.get("type") {
            Some(Value::Str(t)) => t.clone(),
            Some(_) => return self.reject("an event whose type isn't a string".into()),
            None => return self.reject("an event with no type".into()),
        };
        let Some(def) = strip::event_def(&ty) else {
            return self.warn(format!("dropped an event of unrecognised type {ty}"));
        };
        let mut removed = Vec::new();
        let v = match strip::judge(v, def, &mut removed) {
            Ok(Some(v)) => v,
            Ok(None) => return self.warn(format!("dropped a {ty} this version can't read")),
            Err(e) => return self.reject(format!("{ty}: {e}")),
        };
        for p in removed {
            self.warn(format!("removed unrecognised {p} from {ty}"));
        }
        let events = match self.expand(v) {
            Ok(e) => e,
            Err(e) => return self.reject(e),
        };
        for e in events {
            if let Err(m) = self.verify(&e) {
                return self.reject(m);
            }
            if self.record {
                self.delivered.push(e.clone());
            }
            self.apply(e);
        }
    }

    // ---------- chunks ----------

    fn close_lane(&mut self, owner: &Option<String>) -> Vec<Value> {
        let Some(i) = self.s.lanes.iter().position(|(o, _)| o == owner) else { return Vec::new() };
        let (_, p) = self.s.lanes.remove(i);
        let (ty, key) = match p.kind {
            Kind::Text => ("TEXT_MESSAGE_END", "messageId"),
            Kind::Tool => ("TOOL_CALL_END", "toolCallId"),
            Kind::Reasoning => ("REASONING_MESSAGE_END", "messageId"),
        };
        let mut kv = vec![("type", st(ty)), (key, st(&p.id))];
        if let Some(o) = p.owner {
            kv.push(("subagentRunId", Value::Str(o)));
        }
        vec![obj(kv)]
    }

    fn close_all(&mut self) -> Vec<Value> {
        let owners: Vec<Option<String>> = self.s.lanes.iter().map(|(o, _)| o.clone()).collect();
        owners.iter().flat_map(|o| self.close_lane(o)).collect()
    }

    /// Which lane a chunk continues or opens.
    fn lane(&self, kind: Kind, id: &Option<String>, tag: &Option<String>, what: &str) -> Result<Option<String>, String> {
        if let Some(id) = id {
            if let Some((owner, _)) = self.s.lanes.iter().find(|(_, p)| p.kind == kind && &p.id == id) {
                if tag.is_some() && tag != owner {
                    return Err(format!("a chunk for {what} '{id}' is attributed to {}, but it's open under {}", owner_name(tag), owner_name(owner)));
                }
                return Ok(owner.clone());
            }
            return Ok(tag.clone());
        }
        if tag.is_some() {
            return Ok(tag.clone());
        }
        if self.s.lanes.iter().any(|(o, p)| o.is_none() && p.kind == kind) {
            return Ok(None);
        }
        let open: Vec<&Option<String>> = self.s.lanes.iter().filter(|(_, p)| p.kind == kind).map(|(o, _)| o).collect();
        match open.len() {
            0 => Ok(None),
            1 => Ok(open[0].clone()),
            n => Err(format!("an unattributed chunk continues {what}, but {n} subagents have one open")),
        }
    }

    fn expand(&mut self, e: Value) -> Result<Vec<Value>, String> {
        let ty = strip::type_of(&e);
        let tag = opt(&e, "subagentRunId");
        let mut out = match ty.as_str() {
            "RUN_STARTED" | "RUN_FINISHED" | "RUN_ERROR" | "MESSAGES_SNAPSHOT" => self.close_all(),
            "RAW" | "ACTIVITY_SNAPSHOT" | "ACTIVITY_DELTA" | "REASONING_ENCRYPTED_VALUE" | "SUBAGENT_STARTED" => Vec::new(),
            "SUBAGENT_FINISHED" | "SUBAGENT_ERROR" => self.close_lane(&tag),
            "TEXT_MESSAGE_CHUNK" => return self.chunk(e, Kind::Text),
            "TOOL_CALL_CHUNK" => return self.chunk(e, Kind::Tool),
            "REASONING_MESSAGE_CHUNK" => return self.chunk(e, Kind::Reasoning),
            _ => self.close_lane(&tag),
        };
        out.push(e);
        Ok(out)
    }

    fn chunk(&mut self, e: Value, kind: Kind) -> Result<Vec<Value>, String> {
        let (idk, what, start, content, ck) = match kind {
            Kind::Text => ("messageId", "a text message", "TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_CHUNK"),
            Kind::Tool => ("toolCallId", "a tool call", "TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_CHUNK"),
            Kind::Reasoning => ("messageId", "a reasoning message", "REASONING_MESSAGE_START", "REASONING_MESSAGE_CONTENT", "REASONING_MESSAGE_CHUNK"),
        };
        let id = opt(&e, idk);
        let tag = opt(&e, "subagentRunId");
        let lane = self.lane(kind, &id, &tag, what)?;
        let mut out = Vec::new();
        let open = self.s.lanes.iter().position(|(o, p)| *o == lane && p.kind == kind && (id.is_none() || id.as_deref() == Some(p.id.as_str())));
        let (pid, powner) = match open {
            Some(i) => {
                let p = &self.s.lanes[i].1;
                let agree = |field: &str, incoming: Option<String>, had: &Option<String>| -> Result<(), String> {
                    match incoming {
                        Some(x) if Some(&x) != had.as_ref() => Err(format!("a {ck} for '{}' says {field} '{x}', but the stream opened with {}", p.id, had.as_deref().map(|h| format!("'{h}'")).unwrap_or("none".into()))),
                        _ => Ok(()),
                    }
                };
                match kind {
                    Kind::Text => {
                        agree("role", opt(&e, "role"), &p.role)?;
                        agree("name", opt(&e, "name"), &p.name)?;
                    }
                    Kind::Tool => {
                        agree("toolCallName", opt(&e, "toolCallName"), &p.name)?;
                        agree("parentMessageId", opt(&e, "parentMessageId"), &p.parent)?;
                    }
                    Kind::Reasoning => {}
                }
                (p.id.clone(), p.owner.clone())
            }
            None => {
                out.extend(self.close_lane(&lane));
                let Some(id) = id.clone() else { return Err(format!("the first {ck} has no {idk}")) };
                let mut kv = vec![("type", st(start)), (idk, st(&id))];
                let p = match kind {
                    Kind::Text => {
                        let role = opt(&e, "role").unwrap_or("assistant".into());
                        kv.push(("role", st(&role)));
                        if let Some(n) = opt(&e, "name") {
                            kv.push(("name", Value::Str(n)));
                        }
                        Pending { kind, id: id.clone(), role: Some(role), name: opt(&e, "name"), parent: None, owner: tag.clone() }
                    }
                    Kind::Tool => {
                        let Some(name) = opt(&e, "toolCallName") else { return Err(format!("the first {ck} has no toolCallName")) };
                        kv.push(("toolCallName", st(&name)));
                        if let Some(pm) = opt(&e, "parentMessageId") {
                            kv.push(("parentMessageId", Value::Str(pm)));
                        }
                        Pending { kind, id: id.clone(), role: None, name: Some(name), parent: opt(&e, "parentMessageId"), owner: tag.clone() }
                    }
                    Kind::Reasoning => {
                        kv.push(("role", st("reasoning")));
                        Pending { kind, id: id.clone(), role: None, name: None, parent: None, owner: tag.clone() }
                    }
                };
                if let Some(t) = &tag {
                    kv.push(("subagentRunId", st(t)));
                }
                if let Some(m) = e.get("metadata") {
                    kv.push(("metadata", m.clone()));
                }
                out.push(obj(kv));
                self.s.lanes.push((lane, p));
                (id, tag.clone())
            }
        };
        let delta = e.get("delta").cloned();
        let raw = e.get("rawEvent").cloned();
        let meta = e.get("metadata").cloned();
        if delta.is_some() || raw.is_some() || (out.is_empty() && meta.is_some()) {
            let mut kv = vec![("type", st(content)), (idk, st(&pid)), ("delta", delta.unwrap_or(st("")))];
            if let Some(o) = tag.or(powner) {
                kv.push(("subagentRunId", Value::Str(o)));
            }
            if let Some(m) = meta {
                kv.push(("metadata", m));
            }
            if let Some(r) = raw {
                kv.push(("rawEvent", r));
            }
            out.push(obj(kv));
        }
        Ok(out)
    }

    // ---------- the stream's discipline ----------

    fn seed_owners(&mut self, messages: Option<&Value>, authoritative: bool) {
        let Some(Value::Arr(list)) = messages else { return };
        for m in list {
            let Some(id) = m.str("id") else { continue };
            let owner = opt(m, "subagentRunId");
            let map = match m.str("role") {
                Some("reasoning") => &mut self.s.own_rsn,
                Some("activity") => &mut self.s.own_act,
                _ => &mut self.s.own_msg,
            };
            if authoritative || !map.contains_key(id) {
                map.insert(id.into(), owner.clone());
            }
            if let Some(Value::Arr(calls)) = m.get("toolCalls") {
                for c in calls {
                    if let Some(cid) = c.str("id") {
                        if authoritative || !self.s.own_tool.contains_key(cid) {
                            self.s.own_tool.insert(cid.into(), owner.clone());
                        }
                    }
                }
            }
        }
    }

    fn verify(&mut self, e: &Value) -> Result<(), String> {
        let ty = strip::type_of(e);
        let t = ty.as_str();
        if self.s.errored && t != "RUN_STARTED" {
            return Err(format!("{t} after the run ended with RUN_ERROR"));
        }
        if self.s.finished && t != "RUN_ERROR" && t != "RUN_STARTED" {
            return Err(format!("{t} after RUN_FINISHED; a new run starts with RUN_STARTED"));
        }
        if !self.s.first {
            self.s.first = true;
            if t != "RUN_STARTED" && t != "RUN_ERROR" {
                return Err(format!("the stream starts with {t}, not RUN_STARTED"));
            }
        } else if t == "RUN_STARTED" {
            if self.s.started && !self.s.finished && !self.s.errored {
                return Err("RUN_STARTED while a run is still going".into());
            }
            if self.s.finished || self.s.errored {
                self.s.reset_run();
            }
        }
        let tag = opt(e, "subagentRunId");
        let mismatch = |owner: Option<&Option<String>>, what: &str, id: &str| -> Result<(), String> {
            match (&tag, owner) {
                (Some(t), Some(o)) if Some(t) != o.as_ref() => Err(format!("{ty} for {what} '{id}' is attributed to {}, but {} opened it", owner_name(&tag), owner_name(o))),
                _ => Ok(()),
            }
        };
        let id = |k: &str| e.str(k).unwrap_or("").to_string();
        match t {
            "TEXT_MESSAGE_START" => {
                let m = id("messageId");
                if self.s.text.contains(&m) {
                    return Err(format!("TEXT_MESSAGE_START for '{m}', which is already open"));
                }
                if let Some(o) = self.s.own_msg.get(&m) {
                    mismatch(Some(o), "message", &m)?;
                } else {
                    self.s.own_msg.insert(m.clone(), tag.clone());
                }
                self.s.text.push(m);
            }
            "TEXT_MESSAGE_CONTENT" | "TEXT_MESSAGE_END" => {
                let m = id("messageId");
                if !self.s.text.contains(&m) {
                    return Err(format!("{t} for '{m}', which isn't open"));
                }
                mismatch(self.s.own_msg.get(&m), "message", &m)?;
                if t == "TEXT_MESSAGE_END" {
                    self.s.text.retain(|x| *x != m);
                }
            }
            "TOOL_CALL_START" => {
                let c = id("toolCallId");
                if self.s.tools.contains(&c) {
                    return Err(format!("TOOL_CALL_START for '{c}', which is already open"));
                }
                let mut inherited = None;
                if let Some(pm) = e.str("parentMessageId") {
                    if let Some(po) = self.s.own_msg.get(pm) {
                        if tag.is_some() && tag != *po {
                            return Err(format!("tool call '{c}' is attributed to {}, but its message '{pm}' belongs to {}", owner_name(&tag), owner_name(po)));
                        }
                        inherited = Some(po.clone());
                    }
                }
                if let Some(o) = self.s.own_tool.get(&c).cloned() {
                    mismatch(Some(&o), "tool call", &c)?;
                    if tag.is_none() && inherited.as_ref().is_some_and(|i| *i != o) {
                        return Err(format!("tool call '{c}' belongs to {}, but its message belongs to {}", owner_name(&o), owner_name(inherited.as_ref().unwrap())));
                    }
                } else {
                    let o = if tag.is_some() { tag.clone() } else { inherited.unwrap_or(None) };
                    self.s.own_tool.insert(c.clone(), o);
                }
                self.s.tools.push(c);
            }
            "TOOL_CALL_ARGS" | "TOOL_CALL_END" => {
                let c = id("toolCallId");
                if !self.s.tools.contains(&c) {
                    return Err(format!("{t} for '{c}', which isn't open"));
                }
                mismatch(self.s.own_tool.get(&c), "tool call", &c)?;
                if t == "TOOL_CALL_END" {
                    self.s.tools.retain(|x| *x != c);
                }
            }
            "TOOL_CALL_RESULT" => {
                self.s.own_msg.insert(id("messageId"), tag.clone());
            }
            "STEP_STARTED" => {
                let n = id("stepName");
                if self.s.steps.contains(&(tag.clone(), n.clone())) {
                    return Err(format!("step '{n}' started twice"));
                }
                self.s.steps.push((tag.clone(), n));
            }
            "STEP_FINISHED" => {
                let n = id("stepName");
                let key = (tag.clone(), n.clone());
                if !self.s.steps.contains(&key) {
                    if let Some((o, _)) = self.s.steps.iter().find(|(_, x)| *x == n) {
                        return Err(format!("step '{n}' finished by {}, but {} started it", owner_name(&tag), owner_name(o)));
                    }
                    return Err(format!("STEP_FINISHED for '{n}', which never started"));
                }
                self.s.steps.retain(|s| *s != key);
            }
            "ACTIVITY_SNAPSHOT" => {
                let m = id("messageId");
                if !self.s.own_act.contains_key(&m) || e.get("replace") != Some(&Value::Bool(false)) {
                    self.s.own_act.insert(m, tag.clone());
                }
            }
            "ACTIVITY_DELTA" => {
                let m = id("messageId");
                mismatch(self.s.own_act.get(&m), "activity", &m)?;
            }
            "REASONING_START" | "REASONING_MESSAGE_START" => {
                let m = id("messageId");
                let span = t == "REASONING_START";
                let open = if span { &self.s.spans } else { &self.s.reasoning };
                if open.contains(&m) {
                    return Err(format!("{t} for '{m}', which is already open"));
                }
                if let Some(o) = self.s.own_rsn.get(&m) {
                    mismatch(Some(o), "reasoning message", &m)?;
                } else {
                    self.s.own_rsn.insert(m.clone(), tag.clone());
                }
                if span { &mut self.s.spans } else { &mut self.s.reasoning }.push(m);
            }
            "REASONING_MESSAGE_CONTENT" | "REASONING_MESSAGE_END" | "REASONING_END" => {
                let m = id("messageId");
                let span = t == "REASONING_END";
                let open = if span { &self.s.spans } else { &self.s.reasoning };
                if !open.contains(&m) {
                    return Err(format!("{t} for '{m}', which isn't open"));
                }
                mismatch(self.s.own_rsn.get(&m), "reasoning message", &m)?;
                if t != "REASONING_MESSAGE_CONTENT" {
                    if span { &mut self.s.spans } else { &mut self.s.reasoning }.retain(|x| *x != m);
                }
            }
            "REASONING_ENCRYPTED_VALUE" => {
                let m = id("entityId");
                let owner = match e.str("subtype") {
                    Some("tool-call") => self.s.own_tool.get(&m),
                    _ => self.s.own_msg.get(&m).or(self.s.own_rsn.get(&m)),
                }
                .cloned();
                mismatch(owner.as_ref(), "entity", &m)?;
            }
            "SUBAGENT_STARTED" => {
                let sid = id("subagentRunId");
                if self.s.subs.contains(&sid) {
                    return Err(format!("subagent '{sid}' started while it's already running"));
                }
                if self.s.done_subs.contains(&sid) {
                    return Err(format!("subagent '{sid}' started again in the same run"));
                }
                if let Some(p) = e.str("parentSubagentRunId") {
                    if !self.s.subs.iter().any(|x| x == p) && !self.s.done_subs.iter().any(|x| x == p) {
                        return Err(format!("subagent '{sid}' names parent '{p}', which never started"));
                    }
                }
                self.s.subs.push(sid);
            }
            "SUBAGENT_FINISHED" | "SUBAGENT_ERROR" => {
                let sid = id("subagentRunId");
                if !self.s.subs.contains(&sid) {
                    return Err(format!("{t} for subagent '{sid}', which isn't running"));
                }
                self.s.subs.retain(|x| *x != sid);
                self.s.done_subs.push(sid);
            }
            "MESSAGES_SNAPSHOT" => self.seed_owners(e.get("messages"), true),
            "RUN_STARTED" => {
                self.s.started = true;
                self.seed_owners(e.get("input").and_then(|i| i.get("messages")), false);
            }
            "RUN_FINISHED" => {
                let open = |what: &str, ids: Vec<String>| if ids.is_empty() { Ok(()) } else { Err(format!("RUN_FINISHED with {what} still open: {}", ids.join(", "))) };
                open("steps", self.s.steps.iter().map(|(_, n)| n.clone()).collect())?;
                open("text messages", self.s.text.clone())?;
                open("reasoning messages", self.s.reasoning.clone())?;
                open("reasoning spans", self.s.spans.clone())?;
                open("tool calls", self.s.tools.clone())?;
                open("subagents", self.s.subs.clone())?;
                self.s.finished = true;
            }
            "RUN_ERROR" => self.s.errored = true,
            _ => {}
        }
        Ok(())
    }

    // ---------- applying ----------

    fn merge_meta(target: &mut Value, e: &Value) -> bool {
        let Some(Value::Obj(add)) = e.get("metadata") else { return false };
        if !matches!(target.get("metadata"), Some(Value::Obj(_))) {
            target.set("metadata", Value::Obj(Vec::new()));
        }
        let m = target.get_mut("metadata").unwrap();
        for (k, v) in add {
            m.set(k, v.clone());
        }
        true
    }

    fn owner_of_call(&self, call: &str) -> Option<usize> {
        self.messages.iter().position(|m| matches!(m.get("toolCalls"), Some(Value::Arr(c)) if c.iter().any(|x| x.str("id") == Some(call))))
    }

    fn apply(&mut self, e: Value) {
        let ty = strip::type_of(&e);
        let id = opt(&e, "messageId").unwrap_or_default();
        match ty.as_str() {
            "TEXT_MESSAGE_START" | "REASONING_MESSAGE_START" => {
                let role = if ty == "REASONING_MESSAGE_START" { "reasoning".into() } else { opt(&e, "role").unwrap_or("assistant".into()) };
                match self.find(&id) {
                    Some(i) if self.messages[i].str("role") == Some("activity") => self.warn(format!("{ty}: '{id}' is an activity message")),
                    Some(i) => {
                        // Reopened: its text continues from what it has.
                        Self::merge_meta(&mut self.messages[i], &e);
                        let text = content_text(self.messages[i].get("content"));
                        self.emit(vec![("t", st("reset")), ("id", st(&id))]);
                        if !text.is_empty() {
                            self.emit(vec![("t", st("text")), ("id", st(&id)), ("delta", Value::Str(text))]);
                        }
                    }
                    None => {
                        let mut kv = vec![("id", st(&id)), ("role", st(&role)), ("content", st(""))];
                        if let Some(n) = opt(&e, "name") {
                            kv.push(("name", Value::Str(n)));
                        }
                        if let Some(o) = opt(&e, "subagentRunId") {
                            kv.push(("subagentRunId", Value::Str(o)));
                        }
                        let mut m = obj(kv);
                        Self::merge_meta(&mut m, &e);
                        self.messages.push(m);
                        self.emit(vec![("t", st("message")), ("id", st(&id)), ("role", st(&role)), ("index", Value::Num((self.messages.len() - 1) as f64))]);
                    }
                }
            }
            "TEXT_MESSAGE_CONTENT" | "REASONING_MESSAGE_CONTENT" => {
                let Some(i) = self.find(&id) else { return self.warn(format!("{ty}: no message '{id}'")) };
                if self.messages[i].str("role") == Some("activity") {
                    return self.warn(format!("{ty}: '{id}' is an activity message"));
                }
                let delta = e.str("delta").unwrap_or("");
                let m = &mut self.messages[i];
                match m.get_mut("content") {
                    Some(Value::Str(s)) => s.push_str(delta),
                    _ => m.set("content", st(delta)),
                }
                Self::merge_meta(m, &e);
                if !delta.is_empty() {
                    self.emit(vec![("t", st("text")), ("id", st(&id)), ("delta", st(delta))]);
                }
            }
            "TEXT_MESSAGE_END" | "REASONING_MESSAGE_END" => {
                let Some(i) = self.find(&id) else { return self.warn(format!("{ty}: no message '{id}'")) };
                if self.messages[i].str("role") == Some("activity") {
                    return self.warn(format!("{ty}: '{id}' is an activity message"));
                }
                Self::merge_meta(&mut self.messages[i], &e);
                self.emit(vec![("t", st("end")), ("id", st(&id))]);
            }
            "TOOL_CALL_START" => {
                let call = opt(&e, "toolCallId").unwrap_or_default();
                let name = opt(&e, "toolCallName").unwrap_or_default();
                if !self.s.run_tools.contains(&call) {
                    self.s.run_tools.push(call.clone());
                }
                if let Some(i) = self.owner_of_call(&call) {
                    let msg_id = opt(&self.messages[i], "id").unwrap_or_default();
                    if let Some(Value::Arr(calls)) = self.messages[i].get_mut("toolCalls") {
                        if let Some(c) = calls.iter_mut().find(|c| c.str("id") == Some(&call)) {
                            if let Some(f) = c.get_mut("function") {
                                f.set("name", st(&name));
                            }
                            Self::merge_meta(c, &e);
                        }
                    }
                    return self.emit(vec![("t", st("changed")), ("id", st(&msg_id))]);
                }
                let parent = opt(&e, "parentMessageId");
                let target = match parent.as_deref().and_then(|p| self.find(p)) {
                    Some(i) if self.messages[i].str("role") == Some("assistant") => i,
                    found => {
                        if found.is_some() {
                            self.warn(format!("TOOL_CALL_START: '{}' isn't an assistant message", parent.clone().unwrap_or_default()));
                        }
                        let mid = if found.is_some() { call.clone() } else { parent.clone().unwrap_or(call.clone()) };
                        let mut kv = vec![("id", st(&mid)), ("role", st("assistant")), ("toolCalls", Value::Arr(Vec::new()))];
                        if let Some(o) = opt(&e, "subagentRunId") {
                            kv.push(("subagentRunId", Value::Str(o)));
                        }
                        self.messages.push(obj(kv));
                        let i = self.messages.len() - 1;
                        self.emit(vec![("t", st("message")), ("id", st(&mid)), ("role", st("assistant")), ("index", Value::Num(i as f64))]);
                        i
                    }
                };
                let mut c = obj(vec![("id", st(&call)), ("type", st("function")), ("function", obj(vec![("name", st(&name)), ("arguments", st(""))]))]);
                Self::merge_meta(&mut c, &e);
                let m = &mut self.messages[target];
                if !matches!(m.get("toolCalls"), Some(Value::Arr(_))) {
                    m.set("toolCalls", Value::Arr(Vec::new()));
                }
                if let Some(Value::Arr(calls)) = m.get_mut("toolCalls") {
                    calls.push(c);
                }
                let mid = opt(m, "id").unwrap_or_default();
                self.emit(vec![("t", st("changed")), ("id", st(&mid))]);
            }
            "TOOL_CALL_ARGS" | "TOOL_CALL_END" => {
                let call = opt(&e, "toolCallId").unwrap_or_default();
                let Some(i) = self.owner_of_call(&call) else { return self.warn(format!("{ty}: no message holds tool call '{call}'")) };
                let mid = opt(&self.messages[i], "id").unwrap_or_default();
                let mut done = None;
                if let Some(Value::Arr(calls)) = self.messages[i].get_mut("toolCalls") {
                    if let Some(c) = calls.iter_mut().find(|c| c.str("id") == Some(&call)) {
                        if ty == "TOOL_CALL_ARGS" {
                            if let Some(Value::Str(a)) = c.get_mut("function").and_then(|f| f.get_mut("arguments")) {
                                a.push_str(e.str("delta").unwrap_or(""));
                            }
                        }
                        Self::merge_meta(c, &e);
                        if ty == "TOOL_CALL_END" {
                            let f = c.get("function");
                            done = Some((f.and_then(|f| f.str("name")).unwrap_or("").to_string(), f.and_then(|f| f.str("arguments")).unwrap_or("").to_string()));
                        }
                    }
                }
                if let Some((name, args)) = done {
                    self.emit(vec![("t", st("tool")), ("id", st(&call)), ("name", Value::Str(name)), ("arguments", Value::Str(args)), ("parentMessageId", st(&mid))]);
                    self.emit(vec![("t", st("changed")), ("id", st(&mid))]);
                }
            }
            "TOOL_CALL_RESULT" => {
                let call = opt(&e, "toolCallId").unwrap_or_default();
                self.s.answered.push(call.clone());
                let existing = self.messages.iter().position(|m| m.str("id") == Some(&id) && m.str("role") == Some("tool") && m.str("toolCallId") == Some(&call));
                let mut m = match existing {
                    Some(i) => self.messages[i].clone(),
                    None => Value::Obj(Vec::new()),
                };
                m.set("id", st(&id));
                m.set("toolCallId", st(&call));
                m.set("role", st("tool"));
                m.set("content", e.get("content").cloned().unwrap_or(st("")));
                match opt(&e, "subagentRunId") {
                    Some(o) => m.set("subagentRunId", Value::Str(o)),
                    None => {
                        m.remove("subagentRunId");
                    }
                }
                Self::merge_meta(&mut m, &e);
                match existing {
                    Some(i) => {
                        self.messages[i] = m;
                        self.emit(vec![("t", st("changed")), ("id", st(&id))]);
                    }
                    None => {
                        let at = match self.owner_of_call(&call) {
                            Some(o) => {
                                let mut k = o + 1;
                                while k < self.messages.len() && self.messages[k].str("role") == Some("tool") {
                                    k += 1;
                                }
                                k
                            }
                            None => self.messages.len(),
                        };
                        self.messages.insert(at, m);
                        self.emit(vec![("t", st("message")), ("id", st(&id)), ("role", st("tool")), ("index", Value::Num(at as f64))]);
                    }
                }
            }
            "STATE_SNAPSHOT" => {
                self.state = e.get("snapshot").cloned().unwrap_or(Value::Null);
                self.emit(vec![("t", st("state"))]);
            }
            "STATE_DELTA" => {
                let ops = e.get("delta").and_then(|d| d.as_arr()).map(|a| a.to_vec()).unwrap_or_default();
                match patch::apply(&mut self.state, &ops) {
                    Ok(()) => self.emit(vec![("t", st("state"))]),
                    Err(err) => self.warn(format!("a state patch didn't apply, so the state stays as it was: {err}")),
                }
            }
            "MESSAGES_SNAPSHOT" => self.snapshot(e.get("messages").and_then(|m| m.as_arr()).map(|a| a.to_vec()).unwrap_or_default()),
            "ACTIVITY_SNAPSHOT" => {
                let at = self.find(&id);
                let replace = e.get("replace") != Some(&Value::Bool(false));
                let mut kv = vec![("id", st(&id)), ("role", st("activity")), ("activityType", e.get("activityType").cloned().unwrap_or(st(""))), ("content", e.get("content").cloned().unwrap_or(Value::Obj(Vec::new())))];
                if let Some(o) = opt(&e, "subagentRunId") {
                    kv.push(("subagentRunId", Value::Str(o)));
                }
                let fresh = obj(kv);
                match at {
                    None => {
                        let mut m = fresh;
                        Self::merge_meta(&mut m, &e);
                        self.messages.push(m);
                        self.emit(vec![("t", st("message")), ("id", st(&id)), ("role", st("activity")), ("index", Value::Num((self.messages.len() - 1) as f64))]);
                    }
                    Some(i) if self.messages[i].str("role") == Some("activity") => {
                        if replace {
                            let m = &mut self.messages[i];
                            m.set("activityType", fresh.get("activityType").cloned().unwrap());
                            m.set("content", fresh.get("content").cloned().unwrap());
                            match fresh.get("subagentRunId") {
                                Some(o) => m.set("subagentRunId", o.clone()),
                                None => {
                                    m.remove("subagentRunId");
                                }
                            }
                        }
                        Self::merge_meta(&mut self.messages[i], &e);
                        self.emit(vec![("t", st("changed")), ("id", st(&id))]);
                    }
                    Some(i) => {
                        if replace {
                            let mut m = fresh;
                            Self::merge_meta(&mut m, &e);
                            self.messages[i] = m;
                            self.emit(vec![("t", st("reset")), ("id", st(&id))]);
                            self.emit(vec![("t", st("changed")), ("id", st(&id))]);
                        }
                    }
                }
            }
            "ACTIVITY_DELTA" => {
                let Some(i) = self.find(&id) else { return self.warn(format!("ACTIVITY_DELTA for '{id}', which doesn't exist")) };
                if self.messages[i].str("role") != Some("activity") {
                    return self.warn(format!("ACTIVITY_DELTA for '{id}', which isn't an activity message"));
                }
                Self::merge_meta(&mut self.messages[i], &e);
                let ops = e.get("patch").and_then(|d| d.as_arr()).map(|a| a.to_vec()).unwrap_or_default();
                let mut content = self.messages[i].get("content").cloned().unwrap_or(Value::Obj(Vec::new()));
                match patch::apply(&mut content, &ops) {
                    Ok(()) => {
                        let m = &mut self.messages[i];
                        m.set("content", content);
                        if let Some(a) = e.get("activityType") {
                            m.set("activityType", a.clone());
                        }
                        self.emit(vec![("t", st("changed")), ("id", st(&id))]);
                    }
                    Err(err) => self.warn(format!("an activity patch for '{id}' didn't apply: {err}")),
                }
            }
            "CUSTOM" => {
                let name = e.get("name").cloned().unwrap_or(st(""));
                let value = e.get("value").cloned().unwrap_or(Value::Null);
                self.emit(vec![("t", st("custom")), ("name", name), ("value", value)]);
            }
            "RUN_STARTED" => {
                self.s.run_tools.clear();
                self.s.answered.clear();
                if let Some(v) = e.str("protocolVersion") {
                    let parts: Vec<&str> = v.split('.').collect();
                    let numeric = parts.len() == 2 && parts.iter().all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()));
                    if !numeric {
                        self.warn(format!("the agent declares protocol version '{v}', which this client can't interpret"));
                    } else if v != VERSION {
                        let n = |s: &str| s.parse::<u64>().unwrap_or(0);
                        let mine: Vec<&str> = VERSION.split('.').collect();
                        if (n(parts[0]), n(parts[1])) > (n(mine[0]), n(mine[1])) {
                            self.warn(format!("the agent speaks protocol {v}; this client speaks {VERSION}, so newer material is removed with warnings"));
                        }
                    }
                }
                if let Some(Value::Arr(list)) = e.get("input").and_then(|i| i.get("messages")) {
                    for m in list.clone() {
                        let mid = opt(&m, "id").unwrap_or_default();
                        if self.find(&mid).is_none() {
                            self.messages.push(m);
                            self.announce(self.messages.len() - 1);
                        }
                    }
                }
                self.emit(vec![("t", st("run")), ("threadId", e.get("threadId").cloned().unwrap_or(st(""))), ("runId", e.get("runId").cloned().unwrap_or(st("")))]);
            }
            "RUN_FINISHED" => {
                let outcome = e.get("outcome");
                let kind = outcome.and_then(|o| o.str("type")).unwrap_or("success");
                let mut kv = vec![("t", st("finished")), ("outcome", st(kind))];
                match kind {
                    "interrupt" => kv.push(("interrupts", outcome.and_then(|o| o.get("interrupts")).cloned().unwrap_or(Value::Arr(Vec::new())))),
                    "success" => {
                        let named: Vec<Value> = outcome.and_then(|o| o.get("pendingToolCallIds")).and_then(|p| p.as_arr()).map(|a| a.to_vec()).unwrap_or_default();
                        let pending = if !named.is_empty() { named } else { self.s.run_tools.iter().filter(|c| !self.s.answered.contains(c)).map(|c| st(c)).collect() };
                        kv.push(("pending", Value::Arr(pending)));
                        if let Some(r) = e.get("result") {
                            kv.push(("result", r.clone()));
                        }
                    }
                    _ => {}
                }
                self.emit(kv);
            }
            "RUN_ERROR" => {
                self.end_open(true);
                let mut kv = vec![("t", st("error")), ("message", e.get("message").cloned().unwrap_or(st("")))];
                if let Some(c) = e.get("code") {
                    kv.push(("code", c.clone()));
                }
                self.emit(kv);
            }
            "STEP_STARTED" | "STEP_FINISHED" => {
                let name = e.get("stepName").cloned().unwrap_or(st(""));
                self.emit(vec![("t", st("step")), ("name", name), ("started", Value::Bool(ty == "STEP_STARTED"))]);
            }
            "REASONING_ENCRYPTED_VALUE" => {
                let entity = opt(&e, "entityId").unwrap_or_default();
                let value = e.get("encryptedValue").cloned().unwrap_or(st(""));
                let mut done = None;
                if e.str("subtype") == Some("tool-call") {
                    for m in self.messages.iter_mut() {
                        let mid = opt(m, "id");
                        if let Some(Value::Arr(calls)) = m.get_mut("toolCalls") {
                            if let Some(c) = calls.iter_mut().find(|c| c.str("id") == Some(&entity)) {
                                c.set("encryptedValue", value.clone());
                                done = mid;
                                break;
                            }
                        }
                    }
                } else if let Some(i) = self.find(&entity) {
                    if self.messages[i].str("role") != Some("activity") {
                        self.messages[i].set("encryptedValue", value);
                        done = Some(entity.clone());
                    }
                }
                match done {
                    Some(mid) => self.emit(vec![("t", st("changed")), ("id", Value::Str(mid))]),
                    None => self.warn(format!("an encrypted value for '{entity}', which this conversation doesn't have, was dropped")),
                }
            }
            _ => {}
        }
    }

    /// MESSAGES_SNAPSHOT: the agent's full set. Ones it carries replace the
    /// copies held here, in place; ones held here that it lacks go, except
    /// activity and reasoning messages when it carries none of that kind;
    /// new ones go last.
    fn snapshot(&mut self, new: Vec<Value>) {
        let has_act = new.iter().any(|m| m.str("role") == Some("activity"));
        let has_rsn = new.iter().any(|m| m.str("role") == Some("reasoning"));
        let old = core::mem::take(&mut self.messages);
        let mut next = Vec::with_capacity(new.len());
        for m in &old {
            let id = m.str("id").unwrap_or("");
            match new.iter().find(|n| n.str("id") == Some(id)) {
                Some(n) => {
                    next.push(n.clone());
                    let role = n.str("role").unwrap_or("");
                    let (a, b) = (content_text(m.get("content")), content_text(n.get("content")));
                    if has_text(role) && (a != b || m.str("role") != n.str("role")) {
                        self.emit(vec![("t", st("reset")), ("id", st(id))]);
                        if !b.is_empty() {
                            self.emit(vec![("t", st("text")), ("id", st(id)), ("delta", Value::Str(b))]);
                        }
                        self.emit(vec![("t", st("end")), ("id", st(id))]);
                    } else if !patch::same(m, n) {
                        self.emit(vec![("t", st("changed")), ("id", st(id))]);
                    }
                }
                None if (m.str("role") == Some("activity") && !has_act) || (m.str("role") == Some("reasoning") && !has_rsn) => next.push(m.clone()),
                None => self.emit(vec![("t", st("removed")), ("id", st(id))]),
            }
        }
        self.messages = next;
        for n in new {
            let id = n.str("id").unwrap_or("").to_string();
            if self.find(&id).is_none() {
                self.messages.push(n);
                self.announce(self.messages.len() - 1);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(events: &[&str]) -> Client {
        let mut c = Client::new();
        for e in events {
            c.event(e);
        }
        c
    }

    #[test]
    fn an_answer_streams_in() {
        let mut c = run(&[
            r#"{"type":"RUN_STARTED","threadId":"t","runId":"r"}"#,
            r#"{"type":"TEXT_MESSAGE_START","messageId":"m","role":"assistant"}"#,
            r#"{"type":"TEXT_MESSAGE_CONTENT","messageId":"m","delta":"<Card title=\"Hi\">"}"#,
            r#"{"type":"TEXT_MESSAGE_END","messageId":"m"}"#,
            r#"{"type":"RUN_FINISHED","threadId":"t","runId":"r"}"#,
        ]);
        let out = c.take();
        assert!(out.contains(r#"{"t":"message","id":"m","role":"assistant","index":0}"#), "{out}");
        assert!(out.contains(r#"{"t":"text","id":"m","delta":"<Card title=\"Hi\">"}"#), "{out}");
        assert!(out.contains(r#"{"t":"finished","outcome":"success","pending":[]}"#), "{out}");
        assert_eq!(c.messages()[0].str("content"), Some("<Card title=\"Hi\">"));
    }

    #[test]
    fn chunks_expand_and_close() {
        let c = run(&[
            r#"{"type":"RUN_STARTED","threadId":"t","runId":"r"}"#,
            r#"{"type":"TEXT_MESSAGE_CHUNK","messageId":"m","delta":"a"}"#,
            r#"{"type":"TEXT_MESSAGE_CHUNK","delta":"b"}"#,
            r#"{"type":"RUN_FINISHED","threadId":"t","runId":"r"}"#,
        ]);
        assert!(c.warnings.is_empty());
        assert_eq!(c.messages()[0].str("content"), Some("ab"));
    }

    #[test]
    fn content_without_start_is_rejected() {
        let mut c = run(&[r#"{"type":"RUN_STARTED","threadId":"t","runId":"r"}"#, r#"{"type":"TEXT_MESSAGE_CONTENT","messageId":"x","delta":"a"}"#]);
        assert!(c.take().contains(r#""t":"rejected""#));
    }

    #[test]
    fn a_broken_stream_ends_open_answers_as_truncated() {
        let mut c = run(&[r#"{"type":"RUN_STARTED","threadId":"t","runId":"r"}"#, r#"{"type":"TEXT_MESSAGE_START","messageId":"m"}"#]);
        c.close();
        let out = c.take();
        assert!(out.contains(r#"{"t":"end","id":"m","truncated":true}"#), "{out}");
        assert!(out.ends_with("{\"t\":\"truncated\"}\n"), "{out}");
    }

    // Rules the protocol's corpus has no stream for.
    #[test]
    fn rules_the_corpus_leaves_out() {
        let start = r#"{"type":"RUN_STARTED","threadId":"t","runId":"r"}"#;
        for (stream, why) in [
            (&[start, r#"{"type":"TEXT_MESSAGE_START","messageId":"m"}"#, r#"{"type":"TEXT_MESSAGE_START","messageId":"m"}"#][..], "already open"),
            (&[start, r#"{"type":"TOOL_CALL_ARGS","toolCallId":"c","delta":"{"}"#][..], "isn't open"),
            (&[start, r#"{"type":"STEP_STARTED","stepName":"s"}"#, r#"{"type":"STEP_STARTED","stepName":"s"}"#][..], "started twice"),
            (&[start, r#"{"type":"RUN_ERROR","message":"x"}"#, r#"{"type":"TEXT_MESSAGE_START","messageId":"m"}"#][..], "after the run ended"),
            (&[start, r#"{"type":"TEXT_MESSAGE_START","messageId":7}"#][..], "should be a string"),
        ] {
            let mut c = run(stream);
            let out = c.take();
            assert!(out.contains("rejected") && out.contains(why), "{why}: {out}");
        }
    }

    #[test]
    fn snapshots_replace_and_say_what_changed() {
        let mut c = run(&[
            r#"{"type":"RUN_STARTED","threadId":"t","runId":"r"}"#,
            r#"{"type":"TEXT_MESSAGE_START","messageId":"a"}"#,
            r#"{"type":"TEXT_MESSAGE_CONTENT","messageId":"a","delta":"draft"}"#,
            r#"{"type":"TEXT_MESSAGE_END","messageId":"a"}"#,
            r#"{"type":"TEXT_MESSAGE_START","messageId":"b"}"#,
            r#"{"type":"TEXT_MESSAGE_END","messageId":"b"}"#,
            r#"{"type":"MESSAGES_SNAPSHOT","messages":[{"id":"a","role":"assistant","content":"final"},{"id":"c","role":"user","content":"hi"}]}"#,
            r#"{"type":"STATE_SNAPSHOT","snapshot":{"n":1}}"#,
            r#"{"type":"STATE_DELTA","delta":[{"op":"remove","path":"/missing"}]}"#,
        ]);
        let out = c.take();
        for want in [r#"{"t":"reset","id":"a"}"#, r#"{"t":"text","id":"a","delta":"final"}"#, r#"{"t":"removed","id":"b"}"#, r#"{"t":"message","id":"c","role":"user","index":1}"#] {
            assert!(out.contains(want), "{want}: {out}");
        }
        assert_eq!(json::to_string(c.state()), r#"{"n":1}"#);
        assert!(c.warnings.iter().any(|w| w.contains("didn't apply")));
    }

    #[test]
    fn retired_thinking_events_read_as_reasoning() {
        let c = run(&[
            r#"{"type":"RUN_STARTED","threadId":"t","runId":"r","parentRunId":null}"#,
            r#"{"type":"THINKING_START","title":"plan"}"#,
            r#"{"type":"THINKING_TEXT_MESSAGE_START"}"#,
            r#"{"type":"THINKING_TEXT_MESSAGE_CONTENT","delta":"hmm"}"#,
            r#"{"type":"THINKING_TEXT_MESSAGE_END"}"#,
            r#"{"type":"THINKING_END"}"#,
            r#"{"type":"RUN_FINISHED","threadId":"t","runId":"r","outcome":null}"#,
        ]);
        assert_eq!(c.messages()[0].str("role"), Some("reasoning"));
        assert_eq!(c.messages()[0].str("content"), Some("hmm"));
        assert!(c.warnings.iter().any(|w| w.contains("parentRunId: null")));
    }

    #[test]
    fn component_state_goes_out_with_the_next_run() {
        let mut c = Client::new();
        c.user("u1", st("Quiz me")).unwrap();
        assert!(c.set_component("m1", "1.2", json::parse(r#"{"done":[0,2]}"#).unwrap()));
        let input = c.input("t", "r", None).unwrap();
        assert!(input.contains(r#""state":{"morphscreen":{"m1":{"1.2":{"done":[0,2]}}}}"#), "{input}");
        assert!(input.contains(r#""protocolVersion":"1.0""#));
        c.event(r#"{"type":"RUN_STARTED","threadId":"t","runId":"r"}"#);
        c.event(r#"{"type":"STATE_DELTA","delta":[{"op":"replace","path":"/morphscreen/m1/1.2/done","value":[1]}]}"#);
        assert_eq!(json::to_string(&c.components("m1")), r#"{"1.2":{"done":[1]}}"#);
    }
}
