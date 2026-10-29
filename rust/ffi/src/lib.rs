//! The core for other languages: a C ABI (Swift, Kotlin, servers) and, on
//! wasm32, exports for JavaScript. Every result is a string the caller frees
//! (C) or copies out (WASM); errors come back as NULL / 0 with a message from
//! `ms_last_error`.

use morphscreen_core::{action, agui, html, json, prompt, Catalog, Parser};
use std::cell::RefCell;
use std::sync::Arc;

thread_local! {
    static LAST_ERROR: RefCell<String> = const { RefCell::new(String::new()) };
    /// Catalogs already built, by (packs, custom): a session starts without
    /// re-reading pack JSON. Small; apps use one or two catalogs.
    static CATALOGS: RefCell<Vec<(String, String, Arc<Catalog>)>> = const { RefCell::new(Vec::new()) };
}

fn cached_catalog(packs: &str, custom: &str) -> Result<Arc<Catalog>, String> {
    if let Some(c) = CATALOGS.with(|c| c.borrow().iter().find(|(p, q, _)| p == packs && q == custom).map(|(_, _, cat)| cat.clone())) {
        return Ok(c);
    }
    let cat = Arc::new(build_catalog(packs, custom)?);
    CATALOGS.with(|c| {
        let mut c = c.borrow_mut();
        if c.len() >= 8 {
            c.remove(0);
        }
        c.push((packs.to_string(), custom.to_string(), cat.clone()));
    });
    Ok(cat)
}

fn set_error(e: impl Into<String>) {
    LAST_ERROR.with(|l| *l.borrow_mut() = e.into());
}

/// Builds a catalog from "device,data" and a JSON array of the app's own packs.
fn build_catalog(packs: &str, custom: &str) -> Result<Catalog, String> {
    let names: Vec<&str> = packs.split(',').map(str::trim).filter(|s| !s.is_empty()).collect();
    let mut sets: Vec<String> = Vec::new();
    if !custom.trim().is_empty() {
        match json::parse(custom)? {
            json::Value::Arr(items) => sets.extend(items.iter().map(json::to_string)),
            v @ json::Value::Obj(_) => sets.push(json::to_string(&v)),
            _ => return Err("custom packs: a JSON array of packs".into()),
        }
    }
    let refs: Vec<&str> = sets.iter().map(|s| s.as_str()).collect();
    Catalog::build(&names, &refs)
}

pub struct Session {
    parser: Parser,
}

impl Session {
    pub fn new(packs: &str, custom: &str) -> Result<Session, String> {
        Ok(Session { parser: Parser::shared(cached_catalog(packs, custom)?) })
    }
    pub fn push(&mut self, chunk: &str) {
        self.parser.push(chunk)
    }
    pub fn finish(&mut self, truncated: bool) {
        self.parser.finish(truncated)
    }
    pub fn take_ops(&mut self) -> String {
        self.parser.take_ops()
    }
    /// Pictures in the HTML load only from these hosts (comma-separated), as
    /// in the SDKs; others show what they stood for.
    pub fn allow_images(&mut self, hosts: &str) {
        let hosts: Vec<&str> = hosts.split(',').map(str::trim).filter(|h| !h.is_empty()).collect();
        self.parser.allow_images(&hosts);
    }
    pub fn html(&self) -> String {
        html::render(&self.parser)
    }
    pub fn node_html(&self, id: &str) -> String {
        html::render_node(&self.parser, id).unwrap_or_default()
    }
    /// A chart without the series the reader switched off (comma-separated, 0 the first).
    pub fn node_html_without(&self, id: &str, hidden: &str) -> String {
        let hidden: Vec<usize> = hidden.split(',').filter_map(|x| x.trim().parse().ok()).collect();
        html::render_node_without(&self.parser, id, &hidden).unwrap_or_default()
    }
    pub fn tree(&self) -> String {
        self.parser.tree_json()
    }
    pub fn verdict(&self, truncated: bool, reqs: usize, strict: bool) -> String {
        let v = self.parser.verdict(truncated, reqs, strict);
        let mut s = format!("{{\"complete\":{},\"renderable\":{},\"n\":{},\"errs\":[", v.complete, v.renderable, v.n);
        for (i, (c, d)) in v.errs.iter().enumerate() {
            if i > 0 {
                s.push(',');
            }
            s.push_str("{\"cls\":");
            json::write_str(&mut s, c);
            s.push_str(",\"detail\":");
            json::write_str(&mut s, d);
            s.push('}');
        }
        s.push_str("],\"notes\":[");
        for (i, n) in v.notes.iter().enumerate() {
            if i > 0 {
                s.push(',');
            }
            json::write_str(&mut s, n);
        }
        s.push_str("]}");
        s
    }
}

/// One conversation with an AG-UI agent (the core's agui::Client). Every
/// platform drives it the same way: bytes of the response in with `feed`,
/// the rest through `call` by name, JSON both ways.
pub struct Agent {
    c: agui::Client,
}

fn parse_or(s: &str, empty: json::Value) -> Result<json::Value, String> {
    if s.trim().is_empty() {
        Ok(empty)
    } else {
        json::parse(s)
    }
}

impl Agent {
    pub fn new() -> Agent {
        Agent { c: agui::Client::new() }
    }

    /// Response bytes in; the updates they made, one JSON object per line.
    pub fn feed(&mut self, bytes: &[u8]) -> String {
        self.c.feed(bytes);
        self.c.take()
    }

    /// Everything else, by name:
    ///   event JSON                 one event (an app's own transport); updates
    ///   close                      the response ended; updates
    ///   add MESSAGE                the reader's or a tool's message; updates
    ///   input THREAD RUN [EXTRA]   the next run's request body
    ///   load MESSAGES [STATE]      a saved conversation; updates
    ///   messages / state           JSON
    ///   setState JSON
    ///   components MESSAGE         its components' state, by node
    ///   setComponent MESSAGE NODE JSON
    pub fn call(&mut self, op: &str, a: &str, b: &str, c: &str) -> Result<String, String> {
        let c_ = &mut self.c;
        match op {
            "event" => c_.event(a),
            "close" => c_.close(),
            "add" => c_.add(json::parse(a)?)?,
            "input" => return c_.input(a, b, if c.trim().is_empty() { None } else { Some(json::parse(c)?) }),
            "load" => c_.load(parse_or(a, json::Value::Arr(Vec::new()))?, if b.trim().is_empty() { None } else { Some(json::parse(b)?) })?,
            "messages" => return Ok(json::to_string(&json::Value::Arr(c_.messages().to_vec()))),
            "state" => return Ok(json::to_string(c_.state())),
            "setState" => c_.set_state(json::parse(a)?),
            "components" => return Ok(json::to_string(&c_.components(a))),
            "setComponent" => {
                if !c_.set_component(a, b, json::parse(c)?) {
                    return Err("the shared state isn't an object, so the component's state has nowhere to go".into());
                }
            }
            _ => return Err(format!("no such call: {op}")),
        }
        Ok(c_.take())
    }
}

impl Default for Agent {
    fn default() -> Self {
        Agent::new()
    }
}

/// The user message an action starts (spec/format.md, "Actions"), or "" for
/// one that starts no turn.
pub fn action_message(a: &str) -> Result<String, String> {
    Ok(action::message(&json::parse(a)?).unwrap_or_default())
}

pub fn system_prompt(packs: &str, custom: &str) -> Result<String, String> {
    let cat = cached_catalog(packs, custom)?;
    Ok(prompt::system_prompt(&cat))
}

#[cfg(not(target_arch = "wasm32"))]
mod c {
    use super::*;
    use std::ffi::{c_char, CStr, CString};
    use std::panic::{catch_unwind, AssertUnwindSafe};

    fn arg<'a>(p: *const c_char) -> &'a str {
        if p.is_null() {
            return "";
        }
        unsafe { CStr::from_ptr(p) }.to_str().unwrap_or("")
    }

    fn out(s: String) -> *mut c_char {
        CString::new(s.replace('\0', "")).map(CString::into_raw).unwrap_or(std::ptr::null_mut())
    }

    fn guard<T>(f: impl FnOnce() -> Result<T, String>, fail: T) -> T {
        match catch_unwind(AssertUnwindSafe(f)) {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => {
                set_error(e);
                fail
            }
            Err(_) => {
                set_error("internal error (panic) in the core");
                fail
            }
        }
    }

    /// A new parser for one answer. `packs`: "device,data" (core is always in);
    /// `custom`: a JSON array of the app's own packs, or NULL.
    #[no_mangle]
    pub extern "C" fn ms_parser_new(packs: *const c_char, custom: *const c_char) -> *mut Session {
        guard(|| Session::new(arg(packs), arg(custom)).map(|s| Box::into_raw(Box::new(s))), std::ptr::null_mut())
    }

    /// Feeds `len` bytes of UTF-8 (a chunk may end mid-character; the rest
    /// waits for the next chunk).
    #[no_mangle]
    pub extern "C" fn ms_parser_push(p: *mut Session, chunk: *const u8, len: usize) {
        if p.is_null() || chunk.is_null() {
            return;
        }
        let s = unsafe { &mut *p };
        let bytes = unsafe { std::slice::from_raw_parts(chunk, len) };
        guard(
            || {
                s.push(&String::from_utf8_lossy(bytes));
                Ok(())
            },
            (),
        )
    }

    #[no_mangle]
    pub extern "C" fn ms_parser_finish(p: *mut Session, truncated: bool) {
        if let Some(s) = unsafe { p.as_mut() } {
            guard(
                || {
                    s.finish(truncated);
                    Ok(())
                },
                (),
            )
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_parser_take_ops(p: *mut Session) -> *mut c_char {
        match unsafe { p.as_mut() } {
            Some(s) => guard(|| Ok(out(s.take_ops())), std::ptr::null_mut()),
            None => std::ptr::null_mut(),
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_parser_allow_images(p: *mut Session, hosts: *const c_char) {
        if let Some(s) = unsafe { p.as_mut() } {
            s.allow_images(&arg(hosts));
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_parser_html(p: *mut Session) -> *mut c_char {
        match unsafe { p.as_ref() } {
            Some(s) => guard(|| Ok(out(s.html())), std::ptr::null_mut()),
            None => std::ptr::null_mut(),
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_parser_node_html(p: *mut Session, id: *const c_char) -> *mut c_char {
        match unsafe { p.as_ref() } {
            Some(s) => guard(|| Ok(out(s.node_html(arg(id)))), std::ptr::null_mut()),
            None => std::ptr::null_mut(),
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_parser_tree(p: *mut Session) -> *mut c_char {
        match unsafe { p.as_ref() } {
            Some(s) => guard(|| Ok(out(s.tree())), std::ptr::null_mut()),
            None => std::ptr::null_mut(),
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_parser_verdict(p: *mut Session, truncated: bool, reqs: usize, strict: bool) -> *mut c_char {
        match unsafe { p.as_ref() } {
            Some(s) => guard(|| Ok(out(s.verdict(truncated, reqs, strict))), std::ptr::null_mut()),
            None => std::ptr::null_mut(),
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_parser_free(p: *mut Session) {
        if !p.is_null() {
            drop(unsafe { Box::from_raw(p) });
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_prompt(packs: *const c_char, custom: *const c_char) -> *mut c_char {
        guard(|| system_prompt(arg(packs), arg(custom)).map(out), std::ptr::null_mut())
    }

    /// Inline text parsed into spans, as JSON (pack cells on native).
    #[no_mangle]
    pub extern "C" fn ms_inline(text: *const c_char) -> *mut c_char {
        out(morphscreen_core::tree::inline_json(arg(text)))
    }

    /// A conversation with an AG-UI agent.
    #[no_mangle]
    pub extern "C" fn ms_agent_new() -> *mut Agent {
        Box::into_raw(Box::new(Agent::new()))
    }

    /// Bytes of the agent's response; returns the updates (JSON lines).
    #[no_mangle]
    pub extern "C" fn ms_agent_feed(a: *mut Agent, bytes: *const u8, len: usize) -> *mut c_char {
        match unsafe { a.as_mut() } {
            Some(a) if !bytes.is_null() || len == 0 => {
                let b = if len == 0 { &[][..] } else { unsafe { std::slice::from_raw_parts(bytes, len) } };
                guard(|| Ok(out(a.feed(b))), std::ptr::null_mut())
            }
            _ => std::ptr::null_mut(),
        }
    }

    /// Any other call by name (Agent::call); NULL on failure, with ms_last_error.
    #[no_mangle]
    pub extern "C" fn ms_agent_call(a: *mut Agent, op: *const c_char, x: *const c_char, y: *const c_char, z: *const c_char) -> *mut c_char {
        match unsafe { a.as_mut() } {
            Some(a) => guard(|| a.call(arg(op), arg(x), arg(y), arg(z)).map(out), std::ptr::null_mut()),
            None => std::ptr::null_mut(),
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_agent_free(a: *mut Agent) {
        if !a.is_null() {
            drop(unsafe { Box::from_raw(a) });
        }
    }

    /// An action's user message ("" when it starts no turn).
    #[no_mangle]
    pub extern "C" fn ms_action_message(action: *const c_char) -> *mut c_char {
        guard(|| action_message(arg(action)).map(out), std::ptr::null_mut())
    }

    /// The message of the last failure on this thread.
    #[no_mangle]
    pub extern "C" fn ms_last_error() -> *mut c_char {
        out(LAST_ERROR.with(|l| l.borrow().clone()))
    }

    #[no_mangle]
    pub extern "C" fn ms_string_free(s: *mut c_char) {
        if !s.is_null() {
            drop(unsafe { CString::from_raw(s) });
        }
    }
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    //! JavaScript passes strings in by writing UTF-8 into memory from
    //! `ms_alloc`; results come back as a pointer with `ms_out_len`.
    use super::*;

    static mut OUT: Vec<u8> = Vec::new();

    fn arg(ptr: *const u8, len: usize) -> String {
        if ptr.is_null() || len == 0 {
            return String::new();
        }
        String::from_utf8_lossy(unsafe { std::slice::from_raw_parts(ptr, len) }).into_owned()
    }

    #[allow(static_mut_refs)]
    fn out(s: String) -> *const u8 {
        unsafe {
            OUT = s.into_bytes();
            OUT.as_ptr()
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_alloc(len: usize) -> *mut u8 {
        let mut v: Vec<u8> = Vec::with_capacity(len.max(1));
        let p = v.as_mut_ptr();
        std::mem::forget(v);
        p
    }

    #[no_mangle]
    pub extern "C" fn ms_dealloc(ptr: *mut u8, len: usize) {
        if !ptr.is_null() {
            drop(unsafe { Vec::from_raw_parts(ptr, 0, len.max(1)) });
        }
    }

    #[no_mangle]
    #[allow(static_mut_refs)]
    pub extern "C" fn ms_out_len() -> usize {
        unsafe { OUT.len() }
    }

    #[no_mangle]
    pub extern "C" fn ms_new(packs: *const u8, packs_len: usize, custom: *const u8, custom_len: usize) -> *mut Session {
        match Session::new(&arg(packs, packs_len), &arg(custom, custom_len)) {
            Ok(s) => Box::into_raw(Box::new(s)),
            Err(e) => {
                set_error(e);
                std::ptr::null_mut()
            }
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_push(p: *mut Session, ptr: *const u8, len: usize) {
        if let Some(s) = unsafe { p.as_mut() } {
            s.push(&arg(ptr, len));
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_finish(p: *mut Session, truncated: u32) {
        if let Some(s) = unsafe { p.as_mut() } {
            s.finish(truncated != 0);
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_take_ops(p: *mut Session) -> *const u8 {
        out(unsafe { p.as_mut() }.map(|s| s.take_ops()).unwrap_or_default())
    }

    #[no_mangle]
    pub extern "C" fn ms_allow_images(p: *mut Session, hp: *const u8, hl: usize) {
        if let Some(s) = unsafe { p.as_mut() } {
            s.allow_images(&arg(hp, hl));
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_html(p: *mut Session) -> *const u8 {
        out(unsafe { p.as_ref() }.map(|s| s.html()).unwrap_or_default())
    }

    #[no_mangle]
    pub extern "C" fn ms_node_html(p: *mut Session, id: *const u8, id_len: usize) -> *const u8 {
        out(unsafe { p.as_ref() }.map(|s| s.node_html(&arg(id, id_len))).unwrap_or_default())
    }

    /// "id\0hidden series" (comma-separated).
    #[no_mangle]
    pub extern "C" fn ms_node_html_without(p: *mut Session, ptr: *const u8, len: usize) -> *const u8 {
        let all = arg(ptr, len);
        let (id, hidden) = all.split_once('\0').unwrap_or((all.as_str(), ""));
        out(unsafe { p.as_ref() }.map(|s| s.node_html_without(id, hidden)).unwrap_or_default())
    }

    #[no_mangle]
    pub extern "C" fn ms_tree(p: *mut Session) -> *const u8 {
        out(unsafe { p.as_ref() }.map(|s| s.tree()).unwrap_or_default())
    }

    #[no_mangle]
    pub extern "C" fn ms_verdict(p: *mut Session, truncated: u32, reqs: usize, strict: u32) -> *const u8 {
        out(unsafe { p.as_ref() }.map(|s| s.verdict(truncated != 0, reqs, strict != 0)).unwrap_or_default())
    }

    #[no_mangle]
    pub extern "C" fn ms_free(p: *mut Session) {
        if !p.is_null() {
            drop(unsafe { Box::from_raw(p) });
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_prompt(packs: *const u8, packs_len: usize, custom: *const u8, custom_len: usize) -> *const u8 {
        match system_prompt(&arg(packs, packs_len), &arg(custom, custom_len)) {
            Ok(s) => out(s),
            Err(e) => {
                set_error(e);
                std::ptr::null()
            }
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_error() -> *const u8 {
        out(LAST_ERROR.with(|l| l.borrow().clone()))
    }

    #[no_mangle]
    #[cfg(feature = "agent")]
    pub extern "C" fn ms_agent_new() -> *mut Agent {
        Box::into_raw(Box::new(Agent::new()))
    }

    #[no_mangle]
    #[cfg(feature = "agent")]
    pub extern "C" fn ms_agent_feed(a: *mut Agent, ptr: *const u8, len: usize) -> *const u8 {
        let bytes = if ptr.is_null() || len == 0 { &[][..] } else { unsafe { std::slice::from_raw_parts(ptr, len) } };
        out(unsafe { a.as_mut() }.map(|a| a.feed(bytes)).unwrap_or_default())
    }

    /// `args`: the call's name and up to three arguments, joined by NUL.
    #[no_mangle]
    #[cfg(feature = "agent")]
    pub extern "C" fn ms_agent_call(a: *mut Agent, ptr: *const u8, len: usize) -> *const u8 {
        let all = arg(ptr, len);
        let mut it = all.split('\0');
        let (op, x, y, z) = (it.next().unwrap_or(""), it.next().unwrap_or(""), it.next().unwrap_or(""), it.next().unwrap_or(""));
        match unsafe { a.as_mut() }.ok_or_else(|| "closed agent".to_string()).and_then(|a| a.call(op, x, y, z)) {
            Ok(s) => out(s),
            Err(e) => {
                set_error(e);
                std::ptr::null()
            }
        }
    }

    #[no_mangle]
    #[cfg(feature = "agent")]
    pub extern "C" fn ms_agent_free(a: *mut Agent) {
        if !a.is_null() {
            drop(unsafe { Box::from_raw(a) });
        }
    }

    #[no_mangle]
    pub extern "C" fn ms_action_message(ptr: *const u8, len: usize) -> *const u8 {
        match action_message(&arg(ptr, len)) {
            Ok(s) => out(s),
            Err(e) => {
                set_error(e);
                std::ptr::null()
            }
        }
    }
}

/// JNI exports for `com.morphscreen.core.Native` (sdk/android). Text crosses as
/// UTF-8 byte arrays both ways: JNI's own strings are "modified UTF-8",
/// which mangles emoji, and a model's text has them. Errors come back as 0
/// or null with the message from `lastError`. A session belongs to the
/// thread that made it.
#[cfg(all(feature = "jni", not(target_arch = "wasm32")))]
mod jni {
    use super::*;
    use std::ffi::c_void;
    use std::panic::{catch_unwind, AssertUnwindSafe};

    type Env = *mut *const *const c_void;
    type Obj = *mut c_void;

    // Slots in JNI's function table (jni.h, JNINativeInterface_).
    const GET_ARRAY_LENGTH: usize = 171;
    const NEW_BYTE_ARRAY: usize = 176;
    const GET_BYTE_ARRAY_REGION: usize = 200;
    const SET_BYTE_ARRAY_REGION: usize = 208;

    unsafe fn slot(env: Env, i: usize) -> *const c_void {
        *(*env).add(i)
    }

    unsafe fn bytes(env: Env, arr: Obj) -> Vec<u8> {
        if arr.is_null() {
            return Vec::new();
        }
        let len: extern "system" fn(Env, Obj) -> i32 = std::mem::transmute(slot(env, GET_ARRAY_LENGTH));
        let get: extern "system" fn(Env, Obj, i32, i32, *mut u8) = std::mem::transmute(slot(env, GET_BYTE_ARRAY_REGION));
        let n = len(env, arr).max(0) as usize;
        let mut v = vec![0u8; n];
        get(env, arr, 0, n as i32, v.as_mut_ptr());
        v
    }

    unsafe fn text(env: Env, arr: Obj) -> String {
        let b = bytes(env, arr);
        String::from_utf8(b).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
    }

    unsafe fn array(env: Env, s: &str) -> Obj {
        let new: extern "system" fn(Env, i32) -> Obj = std::mem::transmute(slot(env, NEW_BYTE_ARRAY));
        let set: extern "system" fn(Env, Obj, i32, i32, *const u8) = std::mem::transmute(slot(env, SET_BYTE_ARRAY_REGION));
        let arr = new(env, s.len() as i32);
        if !arr.is_null() {
            set(env, arr, 0, s.len() as i32, s.as_ptr());
        }
        arr
    }

    fn guard<T>(f: impl FnOnce() -> Result<T, String>, fail: T) -> T {
        match catch_unwind(AssertUnwindSafe(f)) {
            Ok(Ok(v)) => v,
            Ok(Err(e)) => {
                set_error(e);
                fail
            }
            Err(_) => {
                set_error("internal error (panic) in the core");
                fail
            }
        }
    }

    fn session<'a>(h: i64) -> Result<&'a mut Session, String> {
        if h == 0 {
            return Err("closed session".into());
        }
        Ok(unsafe { &mut *(h as *mut Session) })
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_create(env: Env, _: Obj, packs: Obj, custom: Obj) -> i64 {
        let (p, c) = (text(env, packs), text(env, custom));
        guard(|| Session::new(&p, &c).map(|s| Box::into_raw(Box::new(s)) as i64), 0)
    }

    /// Feeds a chunk and returns the ops it produced.
    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_push(env: Env, _: Obj, h: i64, chunk: Obj) -> Obj {
        let t = text(env, chunk);
        let ops = guard(
            || {
                let s = session(h)?;
                s.push(&t);
                Ok(Some(s.take_ops()))
            },
            None,
        );
        ops.map_or(std::ptr::null_mut(), |o| array(env, &o))
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_finish(env: Env, _: Obj, h: i64, truncated: u8) -> Obj {
        let ops = guard(
            || {
                let s = session(h)?;
                s.finish(truncated != 0);
                Ok(Some(s.take_ops()))
            },
            None,
        );
        ops.map_or(std::ptr::null_mut(), |o| array(env, &o))
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_allowImages(env: Env, _: Obj, h: i64, hosts: Obj) {
        let hs = text(env, hosts);
        guard(|| session(h).map(|s| s.allow_images(&hs)), ());
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_html(env: Env, _: Obj, h: i64) -> Obj {
        guard(|| session(h).map(|s| Some(s.html())), None).map_or(std::ptr::null_mut(), |o| array(env, &o))
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_nodeHtml(env: Env, _: Obj, h: i64, id: Obj) -> Obj {
        let id = text(env, id);
        guard(|| session(h).map(|s| Some(s.node_html(&id))), None).map_or(std::ptr::null_mut(), |o| array(env, &o))
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_verdict(env: Env, _: Obj, h: i64, truncated: u8, reqs: i32, strict: u8) -> Obj {
        guard(|| session(h).map(|s| Some(s.verdict(truncated != 0, reqs.max(0) as usize, strict != 0))), None).map_or(std::ptr::null_mut(), |o| array(env, &o))
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_free(_: Env, _: Obj, h: i64) {
        if h != 0 {
            drop(Box::from_raw(h as *mut Session));
        }
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_prompt(env: Env, _: Obj, packs: Obj, custom: Obj) -> Obj {
        let (p, c) = (text(env, packs), text(env, custom));
        guard(|| system_prompt(&p, &c).map(Some), None).map_or(std::ptr::null_mut(), |o| array(env, &o))
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_parseInline(env: Env, _: Obj, t: Obj) -> Obj {
        array(env, &morphscreen_core::tree::inline_json(&text(env, t)))
    }

    fn agent<'a>(h: i64) -> Result<&'a mut Agent, String> {
        if h == 0 {
            return Err("closed agent".into());
        }
        Ok(unsafe { &mut *(h as *mut Agent) })
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_agentNew(_: Env, _: Obj) -> i64 {
        Box::into_raw(Box::new(Agent::new())) as i64
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_agentFeed(env: Env, _: Obj, h: i64, chunk: Obj) -> Obj {
        let b = bytes(env, chunk);
        guard(|| agent(h).map(|a| Some(a.feed(&b))), None).map_or(std::ptr::null_mut(), |o| array(env, &o))
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_agentCall(env: Env, _: Obj, h: i64, op: Obj, x: Obj, y: Obj, z: Obj) -> Obj {
        let (op, x, y, z) = (text(env, op), text(env, x), text(env, y), text(env, z));
        guard(|| agent(h).and_then(|a| a.call(&op, &x, &y, &z)).map(Some), None).map_or(std::ptr::null_mut(), |o| array(env, &o))
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_agentFree(_: Env, _: Obj, h: i64) {
        if h != 0 {
            drop(Box::from_raw(h as *mut Agent));
        }
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_actionMessage(env: Env, _: Obj, a: Obj) -> Obj {
        let a = text(env, a);
        guard(|| action_message(&a).map(Some), None).map_or(std::ptr::null_mut(), |o| array(env, &o))
    }

    #[no_mangle]
    pub unsafe extern "system" fn Java_com_morphscreen_core_Native_lastError(env: Env, _: Obj) -> Obj {
        let e = LAST_ERROR.with(|l| l.borrow().clone());
        array(env, &e)
    }
}
