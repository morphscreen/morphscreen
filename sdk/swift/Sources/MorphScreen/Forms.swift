// Forms: every field writes its value, typed as spec/format.md says, into
// the form it's in; a Button inside the form submits them. What's typed so
// far is also the form's state {fields: {name: value}} in the answer's
// component store, so an agent can fill a form in.

import Observation
import SwiftUI

@Observable
public final class FormState {
    let node: UINode
    var values: [String: FieldValue] = [:]
    @ObservationIgnored weak var store: ComponentStore?

    init(node: UINode, store: ComponentStore? = nil) {
        self.node = node
        self.store = store
        seedFields(node.children)
        load(store?[node.id])
    }

    /// The starting values the model wrote into the form's fields, as a page
    /// sends them untouched (fields streaming in later seed themselves).
    private func seedFields(_ nodes: [UINode]) {
        for n in nodes where n.type != "Form" {
            if let v = startingValue(n) { seed(fieldName(n), v) }
            seedFields(n.children)
        }
    }

    /// The reader typed: kept, and reported as the form's state.
    func set(_ key: String, _ v: FieldValue) {
        guard values[key] != v else { return }
        values[key] = v
        store?.set(node.id, .object(["fields": .object(values.compactMapValues(\.state))]))
    }

    /// A field's starting value: kept, not reported.
    func seed(_ key: String, _ v: FieldValue) {
        if values[key] == nil { values[key] = v }
    }

    /// Fields set from outside (an agent's state).
    func load(_ state: JSONValue?) {
        for (k, v) in state?["fields"]?.object ?? [:] {
            if let f = FieldValue(state: v), values[k] != f { values[k] = f }
        }
    }

    func submit(button: String) -> Action {
        .submit(node: node.id, form: node.attr("name") ?? "", button: button, fields: values)
    }
}

/// A field's key in the submitted values: its name, or its label as a slug.
func fieldName(_ node: UINode) -> String {
    if let n = node.attr("name"), !n.isEmpty { return n }
    let label = (node.attr("label") ?? "field").lowercased()
    var out = "", dash = false
    for c in label {
        if c.isASCII && (c.isLetter || c.isNumber) {
            if dash && !out.isEmpty { out.append("-") }
            dash = false
            out.append(c)
        } else {
            dash = true
        }
    }
    return out
}

/// A field's value before the reader touches it, as the model wrote it (nil
/// when it starts empty): what the web sends for an untouched field.
func startingValue(_ n: UINode) -> FieldValue? {
    let v = n.attr("value")?.trimmingCharacters(in: .whitespaces) ?? ""
    switch n.type {
    case "Input", "TextArea", "Select", "Date", "Radio", "TimeSlots", "Combobox", "Time":
        return v.isEmpty ? nil : .text(v)
    case "Slider":
        let lo = Double(n.attr("min") ?? "0") ?? 0, hi = Double(n.attr("max") ?? "100") ?? 100
        return .number(min(max(Double(v) ?? lo, lo), max(hi, lo)))
    case "Checkboxes":
        let l = options(v)
        return l.isEmpty ? nil : .list(l)
    case "ToggleGroup":
        let l = options(v)
        return l.isEmpty ? nil : n.flag("multiple") ? .list(l) : .text(l[0])
    case "Switch":
        return .bool(n.flag("value"))
    case "RatingInput", "Stepper":
        return Double(v).map { .number($0) }
    default:
        return nil
    }
}

func options(_ v: String?) -> [String] {
    (v ?? "").split(separator: "|").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
}

struct FormView: View {
    let node: UINode
    @Environment(ComponentStore.self) private var store
    /// One FormState for the form's life, made on its first draw: the fields
    /// write their starting values into it as they appear, so it must be the
    /// same one a Button submits (a state made later lost them).
    @State private var holder = Holder()

    final class Holder {
        var state: FormState?
    }

    var body: some View {
        let state = holder.state ?? {
            let s = FormState(node: node, store: store)
            holder.state = s
            return s
        }()
        Children(nodes: node.children)
            .environment(state)
            .onChange(of: store[node.id]) { state.load(store[node.id]) }
    }
}

/// A label above a control, with an optional hint under it.
struct Labeled<Content: View>: View {
    let label: String
    let hint: String?
    var required = false
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !label.isEmpty {
                Text(label + (required ? " *" : "")).font(.footnote.weight(.semibold))
            }
            content
            if let hint, !hint.isEmpty { Text(hint).font(.caption).foregroundColor(Theme.ink3) }
        }
    }
}

struct FieldStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 10)
            .frame(minHeight: 38)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: Theme.radius))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line2))
    }
}

struct FieldView: View {
    let node: UINode
    @Environment(FormState.self) private var form: FormState?
    /// A field outside any form keeps its own value.
    @State private var own: FieldValue?

    private var key: String { fieldName(node) }
    private var value: FieldValue? { form?.values[key] ?? own }

    private func set(_ v: FieldValue) {
        if let form { form.set(key, v) } else { own = v }
    }

    private func seed(_ v: FieldValue) {
        if let form { form.seed(key, v) } else if own == nil { own = v }
    }

    private var text: Binding<String> {
        Binding(get: { if case let .text(t) = value { return t }; return "" }, set: { set(.text($0)) })
    }
    private var on: Binding<Bool> {
        Binding(get: { if case let .bool(b) = value { return b }; return false }, set: { set(.bool($0)) })
    }
    private var chosen: Set<String> {
        if case let .list(l) = value { return Set(l) }
        return []
    }

    var body: some View {
        let label = node.attr("label") ?? ""
        let hint = node.attr("hint")
        let required = node.flag("required")
        Group {
            switch node.type {
            case "Input":
                Labeled(label: label, hint: hint, required: required) {
                    TextField(node.attr("placeholder") ?? "", text: text)
                        .textFieldStyle(.plain)
                        .modifier(FieldStyle())
                        #if os(iOS)
                        .keyboardType(keyboard)
                        .textInputAutocapitalization(node.attr("type") == "email" || node.attr("type") == "url" ? .never : .sentences)
                        #endif
                }
                .onAppear { if let v = node.attr("value"), !v.isEmpty { seed(.text(v)) } }
            case "TextArea":
                Labeled(label: label, hint: hint, required: required) {
                    TextField(node.attr("placeholder") ?? "", text: text, axis: .vertical)
                        .lineLimit(Int(node.attr("rows") ?? "3") ?? 3, reservesSpace: true)
                        .textFieldStyle(.plain)
                        .padding(.vertical, Tokens.s2)
                        .modifier(FieldStyle())
                }
                .onAppear { if let v = node.attr("value"), !v.isEmpty { seed(.text(v)) } }
            case "Select":
                Labeled(label: label, hint: hint, required: required) {
                    Picker(node.attr("placeholder") ?? label, selection: text) {
                        if let p = node.attr("placeholder") { Text(p).tag("") }
                        ForEach(options(node.attr("options")), id: \.self) { Text($0).tag($0) }
                    }
                    .labelsHidden()
                    .tint(Theme.ink)
                }
                .onAppear { if let v = node.attr("value"), !v.isEmpty { seed(.text(v)) } }
            case "Date":
                Labeled(label: label, hint: hint, required: required) {
                    DatePicker("", selection: Binding(get: {
                        if case let .text(t) = value, let d = ISO8601DateFormatter.date(t) { return d }
                        return Date()
                    }, set: { set(.text(ISO8601DateFormatter.string(from: $0, timeZone: .current, formatOptions: [.withFullDate]))) }), displayedComponents: .date).labelsHidden()
                }
            case "Slider":
                let lo = Double(node.attr("min") ?? "0") ?? 0, hi = Double(node.attr("max") ?? "100") ?? 100
                Labeled(label: label, hint: hint) {
                    if hi > lo {
                        Slider(value: Binding(get: { if case let .number(n) = value { return min(max(n, lo), hi) }; return lo }, set: { set(.number($0)) }), in: lo...hi, step: max(Double(node.attr("step") ?? "1") ?? 1, (hi - lo) / 10_000))
                            .tint(Theme.ink)
                        HStack { Text(sliderText(lo, node) ?? node.attr("min") ?? ""); Spacer(); Text(sliderText(hi, node) ?? node.attr("max") ?? "") }
                            .font(.caption).foregroundColor(Theme.ink3).monospacedDigit()
                    } else {
                        Slider(value: .constant(0), in: 0...1).disabled(true)
                    }
                }
                .onAppear { seed(.number(min(max(Double(node.attr("value") ?? "") ?? lo, lo), max(hi, lo)))) }
            case "Checkboxes":
                Labeled(label: label, hint: hint, required: required) {
                    ForEach(options(node.attr("options")), id: \.self) { o in
                        Toggle(o, isOn: Binding(get: { chosen.contains(o) }, set: { on in
                            var c = chosen
                            if on { c.insert(o) } else { c.remove(o) }
                            set(.list(options(node.attr("options")).filter(c.contains)))
                        }))
                            .toggleStyle(CheckboxStyle())
                    }
                }
                .onAppear { let v = options(node.attr("value")); if !v.isEmpty { seed(.list(v)) } }
            case "Radio":
                Labeled(label: label, hint: hint, required: required) {
                    ForEach(options(node.attr("options")), id: \.self) { o in
                        Button { set(.text(o)) } label: {
                            HStack(spacing: 9) {
                                Image(systemName: text.wrappedValue == o ? "largecircle.fill.circle" : "circle").foregroundColor(text.wrappedValue == o ? Theme.ink : Theme.ink3)
                                Text(o)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .onAppear { if let v = node.attr("value"), !v.isEmpty { seed(.text(v)) } }
            case "Switch":
                Toggle(label, isOn: on).tint(Theme.ink)
                    .onAppear { seed(.bool(node.flag("value"))) }
            default:
                EmptyView()
            }
        }
    }

    #if os(iOS)
    private var keyboard: UIKeyboardType {
        switch node.attr("type") {
        case "email": return .emailAddress
        case "number": return .decimalPad
        case "tel": return .phonePad
        case "url": return .URL
        default: return .default
        }
    }
    #endif
}

struct CheckboxStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: 9) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square").foregroundColor(configuration.isOn ? Theme.ink : Theme.ink3)
                configuration.label
            }
        }
        .buttonStyle(.plain)
    }
}

extension ISO8601DateFormatter {
    /// A date written as yyyy-MM-dd.
    static func date(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate]
        f.timeZone = .current
        return f.date(from: s)
    }
}
