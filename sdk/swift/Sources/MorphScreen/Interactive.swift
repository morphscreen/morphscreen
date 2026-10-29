// The interactive pack in SwiftUI (roadmap Q7): a quiz that marks answers
// and reports the score, flashcards that flip, a poll, a checklist with
// progress, and what-if sliders whose results are worked out as they move.
// State lives here on the device; what the reader did goes back as actions.

import SwiftUI

/// A What-if formula's value (the core's postfix tokens, crate::formula).
func evaluate(_ rpn: [String], _ value: (String) -> Double?) -> Double? {
    var st: [Double] = []
    for t in rpn {
        switch t {
        case "+", "-", "*", "/", "^", "%", "min", "max":
            guard let b = st.popLast(), let a = st.popLast() else { return nil }
            if (t == "/" || t == "%") && b == 0 { return nil }
            switch t {
            case "+": st.append(a + b)
            case "-": st.append(a - b)
            case "*": st.append(a * b)
            case "/": st.append(a / b)
            case "%": st.append(a.truncatingRemainder(dividingBy: b))
            case "^": st.append(pow(a, b))
            case "min": st.append(Swift.min(a, b))
            default: st.append(Swift.max(a, b))
            }
        case "neg", "round", "floor", "ceil", "abs", "sqrt":
            guard let a = st.popLast() else { return nil }
            switch t {
            case "neg": st.append(-a)
            case "round": st.append((a).rounded(.toNearestOrAwayFromZero))
            case "floor": st.append(a.rounded(.down))
            case "ceil": st.append(a.rounded(.up))
            case "abs": st.append(Swift.abs(a))
            default: st.append(a.squareRoot())
            }
        default:
            if let n = Double(t) { st.append(n) } else if let v = value(t) { st.append(v) } else { return nil }
        }
    }
    guard st.count == 1, let v = st.first, v.isFinite else { return nil }
    return v
}

/// A Result's number as the core writes it (a currency sign in front, other units after).
/// A slider's number with its unit, the way a Result shows one, with no more
/// decimals than it needs of those its numbers are written to; nil without a unit.
func sliderText(_ v: Double, _ s: UINode) -> String? {
    guard let unit = s.attr("unit")?.trimmingCharacters(in: .whitespaces), !unit.isEmpty else { return nil }
    let places = ["min", "max", "value", "step"].map { k -> Int in
        guard let t = s.attr(k)?.trimmingCharacters(in: .whitespaces), let dot = t.firstIndex(of: ".") else { return 0 }
        return t[t.index(after: dot)...].reversed().drop(while: { $0 == "0" }).count
    }.max() ?? 0
    let d = (0..<min(places, 6)).first { k in let x = v * pow(10, Double(k)); return abs(x - x.rounded()) < 1e-9 * max(abs(x), 1) } ?? min(places, 6)
    return resultText(v, unit: unit, decimals: d)
}

func resultText(_ v: Double?, unit: String, decimals: Int?) -> String {
    guard let v else { return "\u{2014}" }
    let d = Swift.min(decimals ?? (v.rounded(.down) == v ? 0 : 2), 6)
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "en_US")
    f.minimumFractionDigits = d
    f.maximumFractionDigits = d
    let num = f.string(from: NSNumber(value: Swift.abs(v))) ?? "\(Swift.abs(v))"
    let sign = v < 0 ? "\u{2212}" : ""
    let u = unit.trimmingCharacters(in: .whitespaces)
    if u.isEmpty { return sign + num }
    if ["$", "\u{20ac}", "\u{a3}", "\u{20b9}", "\u{a5}"].contains(u) { return sign + u + num }
    return u == "%" ? "\(sign)\(num)%" : "\(sign)\(num) \(u)"
}

/// A slider's name in formulas: its name, or its label as one word ("Unit price ($)" is unit_price).
func sliderName(_ n: UINode) -> String {
    if let name = n.attr("name")?.trimmingCharacters(in: .whitespaces), !name.isEmpty { return name }
    var out = ""
    for c in (n.attr("label") ?? "").lowercased() {
        if c.isLetter || c.isNumber { out.append(c) } else if !out.isEmpty && out.last != "_" { out.append("_") }
    }
    while out.hasSuffix("_") { out.removeLast() }
    return out
}

private func title(_ t: String?) -> some View {
    Group { if let t, !t.isEmpty { Text(keepIDs(t)).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true) } }
}

/// A choice row: a radio mark, the words, and once answered whether it was right.
private struct ChoiceRow: View {
    let spans: [Span]
    let chosen: Bool
    let mark: String?
    let tint: Color?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Tokens.s2) {
            ZStack {
                Circle().stroke(Theme.ink3, lineWidth: 1.5).frame(width: 16, height: 16)
                if chosen { Circle().fill(Theme.ink).frame(width: 8, height: 8) }
            }
            .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 3 }
            inlineText(spans).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: Tokens.s2)
            if let mark { Text(mark).font(.caption.weight(.semibold)).foregroundColor(mark == "Right" ? Theme.good : Theme.bad) }
        }
        .padding(.horizontal, Tokens.s3)
        .padding(.vertical, Tokens.s2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint ?? .clear, in: RoundedRectangle(cornerRadius: Theme.radius))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(tint == nil ? Theme.line : .clear))
        .contentShape(Rectangle())
    }
}

struct QuizView: View {
    let node: UINode
    @Environment(\.morphAction) private var act
    @Environment(ComponentStore.self) private var store

    private var questions: [UINode] { node.children.filter { $0.type == "Question" } }

    /// Each question's chosen answer, from the state {answers: [index or null]}.
    private var picked: [String: Int] {
        let a = store[node.id]?["answers"]?.array ?? []
        var out: [String: Int] = [:]
        for (k, q) in questions.enumerated() where k < a.count {
            if let n = a[k].number { out[q.id] = Int(n) }
        }
        return out
    }

    private func choices(_ q: UINode) -> ([[Span]], Int?) {
        if case let .choices(items, answer) = q.data { return (items, answer) }
        return ([], nil)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.s5) {
            title(node.attr("title"))
            ForEach(questions) { q in
                let (items, answer) = choices(q)
                let chosen = picked[q.id]
                VStack(alignment: .leading, spacing: Tokens.s2) {
                    Text(keepIDs(q.attr("text") ?? "")).font(.headline).fixedSize(horizontal: false, vertical: true)
                    ForEach(Array(items.enumerated()), id: \.offset) { k, it in
                        let mark: String? = chosen == nil ? nil : (k == answer ? "Right" : (k == chosen ? "Your answer" : nil))
                        Button { choose(q, k, items) } label: {
                            ChoiceRow(spans: it, chosen: chosen == k, mark: mark, tint: mark == "Right" ? Theme.goodBg : (mark == nil ? nil : Theme.badBg))
                        }
                        .buttonStyle(.plain)
                        .disabled(chosen != nil)
                    }
                    if chosen != nil, let why = q.attr("explain"), !why.isEmpty {
                        Text(keepIDs(why)).font(.callout).foregroundColor(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            if !questions.isEmpty, picked.count == questions.count {
                Text("\(score) of \(questions.count) right").font(.headline)
            }
        }
    }

    private var score: Int {
        let p = picked
        return questions.filter { q in choices(q).1.map { p[q.id] == $0 } ?? false }.count
    }

    private func choose(_ q: UINode, _ k: Int, _ items: [[Span]]) {
        guard picked[q.id] == nil else { return }
        var now = picked
        now[q.id] = k
        withAnimation(.snappy(duration: 0.2)) {
            store.set(node.id, .object(["answers": .array(questions.map { now[$0.id].map { .number(Double($0)) } ?? .null })]))
        }
        let picked = now
        guard picked.count == questions.count else { return }
        let answers = questions.map { q -> QuizAnswer in
            let (items, answer) = choices(q)
            let c = picked[q.id] ?? 0
            return QuizAnswer(question: q.attr("text") ?? "", choice: items.indices.contains(c) ? plainText(items[c]) : "", right: answer.map { $0 == c })
        }
        act(.quiz(node: node.id, score: score, total: questions.count, answers: answers))
    }
}

struct FlashcardsView: View {
    let node: UINode
    @Environment(\.morphAction) private var act
    @Environment(ComponentStore.self) private var store
    @State private var flipped: Set<Int> = []

    /// The cards the reader knows, from the state {known: [index]}.
    private var known: Set<Int> { Set(store[node.id]?["known"]?.indices ?? []) }

    var body: some View {
        let rows: [[String]] = if case let .table(_, r) = node.data { r.filter { !$0.isEmpty } } else { [] }
        VStack(alignment: .leading, spacing: Tokens.s3) {
            title(node.attr("title"))
            HStack(spacing: Tokens.s2) {
                ProgressView(value: Double(known.count), total: Double(Swift.max(rows.count, 1))).tint(Theme.ink).frame(maxWidth: 220)
                Text("\(known.count) of \(rows.count) known").font(.footnote).foregroundColor(Theme.ink3)
            }
            ColumnsLayout(perRow: 3, minWidth: 150, spacing: Tokens.s2) {
                ForEach(Array(rows.enumerated()), id: \.offset) { k, r in
                    card(k, front: r[0], back: r.dropFirst().joined(separator: " \u{b7} "))
                }
            }
        }
    }

    private func card(_ k: Int, front: String, back: String) -> some View {
        let open = flipped.contains(k)
        return VStack(spacing: Tokens.s2) {
            if open {
                Text(keepIDs(front)).font(.footnote).foregroundColor(Theme.ink3)
                inlineText(parseInline(back)).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: Tokens.s2) {
                    Button("Got it") { mark(k, true) }.buttonStyle(.bordered).controlSize(.small)
                    Button("Again") { mark(k, false) }.buttonStyle(.borderless).controlSize(.small)
                }
            } else {
                inlineText(parseInline(front)).font(.headline).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(Tokens.s4)
        .frame(maxWidth: .infinity, minHeight: 96)
        .background(known.contains(k) ? Theme.goodBg : Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
        .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(known.contains(k) ? .clear : Theme.line))
        .contentShape(Rectangle())
        .onTapGesture { withAnimation(.snappy(duration: 0.25)) { if open { flipped.remove(k) } else { flipped.insert(k) } } }
        .accessibilityAddTraits(.isButton)
    }

    private func mark(_ k: Int, _ knew: Bool) {
        var known = self.known
        if knew { known.insert(k) } else { known.remove(k) }
        withAnimation(.snappy(duration: 0.2)) {
            store.set(node.id, .object(["known": .array(known.sorted().map { .number(Double($0)) })]))
            flipped.remove(k)
        }
        let rows: [[String]] = if case let .table(_, r) = node.data { r.filter { !$0.isEmpty } } else { [] }
        act(.state(node: node.id, name: "known", value: known.sorted().compactMap { rows.indices.contains($0) ? rows[$0][0] : nil }))
    }
}

struct PollView: View {
    let node: UINode
    @Environment(\.morphAction) private var act
    @Environment(ComponentStore.self) private var store

    /// The reader's vote, from the state {vote: option or null}.
    private var vote: String? { store[node.id]?["vote"]?.string }

    var body: some View {
        let options = (node.attr("options") ?? "").split(separator: "|").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        VStack(alignment: .leading, spacing: Tokens.s2) {
            Text(keepIDs(node.attr("label") ?? "")).font(.headline).fixedSize(horizontal: false, vertical: true)
            ForEach(options, id: \.self) { o in
                Button {
                    store.set(node.id, .object(["vote": .string(o)]))
                    act(.vote(node: node.id, name: node.attr("name") ?? "", choice: o))
                } label: { ChoiceRow(spans: [.text(o)], chosen: vote == o, mark: nil, tint: nil) }
                .buttonStyle(.plain)
                .disabled(vote != nil)
            }
            if let vote {
                HStack(spacing: Tokens.s2) {
                    Text("You voted for \(vote).").font(.footnote).foregroundColor(Theme.ink2)
                    Button("Change vote") { store.set(node.id, .object(["vote": .null])) }.buttonStyle(.borderless).font(.footnote)
                }
            }
        }
    }
}

struct ChecklistView: View {
    let node: UINode
    @Environment(\.morphAction) private var act
    @Environment(ComponentStore.self) private var store

    var body: some View {
        let items: [CheckItem] = if case let .checks(i) = node.data { i } else { [] }
        // Ticked items, from the state {done: [index]}; until there is one, as the model wrote them.
        let marked = store[node.id]?["done"].map { Set($0.indices) }
        let state = items.indices.map { marked?.contains($0) ?? items[$0].done }
        VStack(alignment: .leading, spacing: Tokens.s2) {
            title(node.attr("title"))
            HStack(spacing: Tokens.s2) {
                ProgressView(value: Double(state.filter { $0 }.count), total: Double(Swift.max(items.count, 1))).tint(Theme.ink).frame(maxWidth: 220)
                Text("\(state.filter { $0 }.count) of \(items.count) done").font(.footnote).foregroundColor(Theme.ink3)
            }
            ForEach(Array(items.enumerated()), id: \.offset) { k, it in
                let on = state.indices.contains(k) && state[k]
                Button {
                    var s = state
                    s[k].toggle()
                    withAnimation(.snappy(duration: 0.15)) { store.set(node.id, .object(["done": .array(s.indices.filter { s[$0] }.map { .number(Double($0)) })])) }
                    act(.state(node: node.id, name: node.attr("name") ?? "", value: items.indices.filter { s[$0] }.map { plainText(items[$0].spans) }))
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: Tokens.s2) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 3).stroke(on ? Theme.ink : Theme.ink3, lineWidth: 1.5).frame(width: 16, height: 16)
                            if on { RoundedRectangle(cornerRadius: 3).fill(Theme.ink).frame(width: 16, height: 16); Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundColor(Theme.surface) }
                        }
                        .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 3 }
                        inlineText(it.spans).foregroundColor(on ? Theme.ink3 : Theme.ink).strikethrough(on, color: Theme.line2).fixedSize(horizontal: false, vertical: true)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityValue(on ? "done" : "not done")
            }
        }
    }
}

/// A What-if's own sliders or results, wherever they sit in it (in Columns, say), not a What-if's inside it.
private func own(_ n: UINode, _ type: String) -> [UINode] {
    n.children.flatMap { k in k.type == type ? [k] : k.type == "WhatIf" ? [] : own(k, type) }
}

struct WhatIfView: View {
    let node: UINode
    @Environment(ComponentStore.self) private var store

    /// Where the sliders are, from the state {values: {name: number}}.
    private var values: [String: Double] { (store[node.id]?["values"]?.object ?? [:]).compactMapValues(\.number) }

    private func move(_ name: String, _ v: Double, _ sliders: [UINode]) {
        var all: [String: JSONValue] = [:]
        for s in sliders {
            let n = sliderName(s)
            all[n] = .number(n == name ? v : values[n] ?? Double(s.attr("value") ?? s.attr("min") ?? "") ?? 0)
        }
        store.set(node.id, .object(["values": .object(all)]))
    }

    var body: some View {
        let sliders = own(node, "Slider")
        let results = own(node, "Result")
        VStack(alignment: .leading, spacing: Tokens.s3) {
            title(node.attr("title"))
            ForEach(sliders) { s in
                let name = sliderName(s)
                let lo = Double(s.attr("min") ?? "") ?? 0, hi = Double(s.attr("max") ?? "") ?? 100
                let step = Double(s.attr("step") ?? "") ?? 1
                let start = Double(s.attr("value") ?? "") ?? lo
                let v = values[name] ?? start
                VStack(alignment: .leading, spacing: 2) {
                    HStack {
                        Text(keepIDs(s.attr("label") ?? name)).font(.footnote.weight(.semibold))
                        Spacer()
                        Text(sliderText(v, s) ?? trimmed(v)).font(.footnote.weight(.semibold)).monospacedDigit()
                    }
                    Slider(value: Binding(get: { v }, set: { move(name, $0, sliders) }), in: lo...Swift.max(hi, lo + step), step: step).tint(Theme.ink)
                }
            }
            ForEach(results) { r in
                let rpn: [String] = if case let .formula(t, _) = r.data { t } else { [] }
                let value = evaluate(rpn) { name in
                    if let s = sliders.first(where: { sliderName($0).lowercased() == name.lowercased() }) {
                        return values[sliderName(s)] ?? Double(s.attr("value") ?? s.attr("min") ?? "")
                    }
                    return nil
                }
                HStack(alignment: .firstTextBaseline) {
                    Text(keepIDs(r.attr("label") ?? ""))
                    Spacer()
                    Text(resultText(value, unit: r.attr("unit") ?? "", decimals: Int(r.attr("decimals") ?? ""))).font(.title3.weight(.semibold)).monospacedDigit()
                        .contentTransition(.numericText())
                        .animation(.snappy(duration: 0.15), value: value)
                }
                .padding(.top, Tokens.s1)
            }
        }
    }

    private func trimmed(_ v: Double) -> String { v.rounded() == v ? String(Int(v)) : String(format: "%.2f", v) }
}
