// AG-UI 1.0's own conformance streams (test/agui/streams, from the protocol's
// repository), replayed through the core's client. Each fixture's stream goes
// in as the producer sent it; the outcome, the delivered events, the final
// messages and state, and the request are checked as the fixture says.
//
// Read the way the corpus's README says a third-party client should be: its
// SHOULD-level warnings are checked as "some warning" rather than by the
// TypeScript client's wording, the fixtures for version-gated downgrade shims
// don't apply because this client ships none (the always-on translations of
// retired shapes it does run), and
// where the corpus pins a gap of the TypeScript client against the spec
// (unknown-enum-value-role-fatal) this client follows the spec.

use morphscreen_core::agui::Client;
use morphscreen_core::json::{self, Value};
use std::fs;
use std::path::PathBuf;

fn dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../test/agui/streams")
}

/// The README's subset match: arrays the same length, objects on the keys named.
fn subset(want: &Value, got: &Value) -> bool {
    match (want, got) {
        (Value::Obj(w), Value::Obj(_)) => w.iter().all(|(k, v)| got.get(k).is_some_and(|g| subset(v, g))),
        (Value::Arr(w), Value::Arr(g)) => w.len() == g.len() && w.iter().zip(g).all(|(a, b)| subset(a, b)),
        _ => want == got,
    }
}

/// A dotted path into a value ("outcome.type", "messages.0.id").
fn at<'a>(v: &'a Value, path: &str) -> Option<&'a Value> {
    let mut cur = v;
    for seg in path.split('.') {
        cur = match cur {
            Value::Obj(_) => cur.get(seg)?,
            Value::Arr(a) => a.get(seg.parse::<usize>().ok()?)?,
            _ => return None,
        };
    }
    Some(cur)
}

/// Why this client rejects each stream the corpus says must fail: the rule,
/// in this client's words. A rejection for any other reason fails the test.
const REASONS: &[(&str, &str)] = &[
    ("chunk-conflicting-role-fatal", "says role"),
    ("chunk-conflicting-tool-name-fatal", "says toolCallName"),
    ("content-without-start-fatal", "which isn't open"),
    ("custom-closes-chunk-stream-fatal", "the first TEXT_MESSAGE_CHUNK has no messageId"),
    ("event-after-run-finished-fatal", "after RUN_FINISHED"),
    ("first-chunk-missing-id-fatal", "has no messageId"),
    ("first-event-not-run-started-fatal", "not RUN_STARTED"),
    ("first-tool-chunk-missing-name-fatal", "has no toolCallName"),
    ("malformed-known-field-fatal", "should be a string"),
    ("nested-run-started-fatal", "while a run is still going"),
    ("open-message-at-run-finished-fatal", "text messages still open"),
    ("reasoning-discipline-verified", "which isn't open"),
    ("reasoning-message-wrong-role-fatal", "should be \"reasoning\""),
    ("run-finished-with-active-subagent-fatal", "subagents still open"),
    ("step-finished-without-start-fatal", "never started"),
    ("subagent-attribution-mismatch-fatal", "is attributed to"),
    ("subagent-finished-unstarted-fatal", "which isn't running"),
    ("subagent-started-missing-name-fatal", "has no name"),
    ("unknown-outcome-array-fatal", "should be"),
];

/// Fixtures where this client knowingly answers differently, and why.
const DIVERGES: &[(&str, &str)] = &[(
    "unknown-enum-value-role-fatal",
    "the spec's processing model says an unrecognised value in a closed string set is removed, not fatal; the fixture pins the TypeScript client's admitted gap",
)];

struct Outcome {
    failures: Vec<String>,
    skipped: Vec<String>,
    passed: usize,
}

fn check(name: &str, f: &Value, o: &mut Outcome) {
    // Shims gated on an older peer's version; this client speaks 1.0 to
    // everyone. (The era fixtures for the always-on boundary still run.)
    if ["era-0-0-39-flattens-content", "era-0-0-57-subagent-dropped-with-warning", "era-pinned-peer-omits-protocol-version"].contains(&name) {
        o.skipped.push(format!("{name}: a downgrade shim for an older peer"));
        return;
    }
    let mut expect = f.get("expect").cloned().unwrap();
    if DIVERGES.iter().any(|(n, _)| *n == name) {
        // Instead: the stream completes, the unknown role is removed with a
        // warning, and the message is the assistant's (an absent role's meaning).
        expect = json::parse(r#"{"outcome":"completed","warnings":["role"],"messageCount":1,"messages":[{"id":"m-unknown-role","role":"assistant","content":"the role above is the only defect in this stream"}],"eventAbsentPaths":["1.role"]}"#).unwrap();
    }
    let mut c = Client::new();
    c.record = true;
    let mut extra = None;
    if let Some(input) = f.get("input") {
        if let Some(m) = input.get("messages") {
            c.load(m.clone(), None).unwrap();
        }
        if let Some(t) = input.get("tools") {
            extra = Some(Value::Obj(vec![("tools".into(), t.clone())]));
        }
    }
    let request = json::parse(&c.input("t", "r", extra).unwrap()).unwrap();
    c.take();
    for e in f.get("stream").and_then(|s| s.as_arr()).unwrap() {
        c.event(&json::to_string(e));
    }
    c.close();
    let out = c.take();
    let updates: Vec<Value> = out.lines().map(|l| json::parse(l).unwrap()).collect();
    let rejection = updates.iter().find(|u| u.str("t") == Some("rejected")).and_then(|u| u.str("message")).map(String::from);
    let mut bad = Vec::new();
    let want = expect.str("outcome").unwrap_or("completed");
    let got = if rejection.is_some() { "failed" } else { "completed" };
    if want != got {
        bad.push(format!("outcome {got}, wanted {want} ({})", rejection.clone().unwrap_or_default()));
    }
    if want == "failed" {
        if let (Some(r), Some((_, key))) = (&rejection, REASONS.iter().find(|(n, _)| *n == name)) {
            if !r.contains(key) {
                bad.push(format!("rejected for another reason: {r} (wanted one about \"{key}\")"));
            }
        } else if rejection.is_some() {
            bad.push(format!("no reason on file for this rejection: {}", rejection.unwrap()));
        }
    }
    if let Some(re) = expect.get("runError") {
        let errs: Vec<&Value> = updates.iter().filter(|u| u.str("t") == Some("error")).collect();
        let ok = match re {
            Value::Bool(true) => !errs.is_empty(),
            Value::Str(s) => errs.iter().any(|e| e.str("message").is_some_and(|m| m.contains(s.as_str()))),
            _ => true,
        };
        if !ok {
            bad.push(format!("runError {re:?} not reported"));
        }
    }
    let types: Vec<Value> = c.delivered.iter().map(|e| e.get("type").cloned().unwrap()).collect();
    if let Some(Value::Arr(w)) = expect.get("eventTypes") {
        if *w != types {
            bad.push(format!("events {} wanted {}", json::to_string(&Value::Arr(types.clone())), json::to_string(&Value::Arr(w.clone()))));
        }
    }
    if let Some(Value::Arr(w)) = expect.get("eventTypesAbsent") {
        for t in w {
            if types.contains(t) {
                bad.push(format!("{t:?} reached the app"));
            }
        }
    }
    let events = Value::Arr(c.delivered.clone());
    if let Some(Value::Obj(paths)) = expect.get("eventPaths") {
        for (p, v) in paths {
            if at(&events, p) != Some(v) {
                bad.push(format!("event path {p} is {:?}, wanted {v:?}", at(&events, p)));
            }
        }
    }
    if let Some(Value::Arr(paths)) = expect.get("eventAbsentPaths") {
        for p in paths.iter().filter_map(|p| p.as_str()) {
            if at(&events, p).is_some() {
                bad.push(format!("event path {p} should be gone"));
            }
        }
    }
    if expect.get("noWarnings") == Some(&Value::Bool(true)) && !c.warnings.is_empty() {
        bad.push(format!("warned: {:?}", c.warnings));
    }
    if matches!(expect.get("warnings"), Some(Value::Arr(w)) if !w.is_empty()) && c.warnings.is_empty() {
        bad.push("no warning".into());
    }
    if let Some(Value::Num(n)) = expect.get("messageCount") {
        if c.messages().len() != *n as usize {
            bad.push(format!("{} messages, wanted {n}", c.messages().len()));
        }
    }
    let messages = Value::Arr(c.messages().to_vec());
    if let Some(w) = expect.get("messages") {
        if !subset(w, &messages) {
            bad.push(format!("messages {} wanted {}", json::to_string(&messages), json::to_string(w)));
        }
    }
    if let Some(w) = expect.get("state") {
        if !subset(w, c.state()) {
            bad.push(format!("state {} wanted {}", json::to_string(c.state()), json::to_string(w)));
        }
    }
    if let Some(w) = expect.get("request") {
        if !subset(w, &request) {
            bad.push(format!("request {} wanted {}", json::to_string(&request), json::to_string(w)));
        }
    }
    if let Some(Value::Arr(paths)) = expect.get("requestAbsentPaths") {
        for p in paths.iter().filter_map(|p| p.as_str()) {
            if at(&request, p).is_some() {
                bad.push(format!("request path {p} should be absent"));
            }
        }
    }
    if bad.is_empty() {
        o.passed += 1;
    } else {
        o.failures.push(format!("{name}:\n    {}", bad.join("\n    ")));
    }
}

#[test]
fn agui_conformance_streams() {
    let manifest = fs::read_to_string(dir().join("MANIFEST.txt")).unwrap();
    let names: Vec<&str> = manifest.lines().map(str::trim).filter(|l| l.ends_with(".json")).collect();
    assert!(names.len() >= 68, "the corpus shrank: {}", names.len());
    let mut o = Outcome { failures: Vec::new(), skipped: Vec::new(), passed: 0 };
    for file in &names {
        let f = json::parse(&fs::read_to_string(dir().join(file)).unwrap()).unwrap();
        check(file.trim_end_matches(".json"), &f, &mut o);
    }
    eprintln!("AG-UI conformance: {} passed, {} not applicable, {} failed", o.passed, o.skipped.len(), o.failures.len());
    for s in &o.skipped {
        eprintln!("  n/a {s}");
    }
    assert!(o.failures.is_empty(), "\n{}", o.failures.join("\n"));
}
