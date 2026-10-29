// AnswerView: the answer, natively. Containers lay out their children as the
// ops arrive; each node redraws only when it changes.

import SwiftUI

/// What the app gets when the user acts (spec/format.md, "Actions").
public enum Action: Sendable {
    case ask(text: String, node: String)
    case submit(node: String, form: String, button: String, fields: [String: FieldValue])
    /// A Quiz finished: the score and each answer (right is nil where the quiz had no key).
    case quiz(node: String, score: Int, total: Int, answers: [QuizAnswer])
    case vote(node: String, name: String, choice: String)
    /// What the reader has done so far (a Checklist's ticks, the cards they know): kept, not a new turn.
    case state(node: String, name: String, value: [String])
}

public struct QuizAnswer: Sendable, Equatable {
    public let question: String
    public let choice: String
    public let right: Bool?
}

public enum FieldValue: Sendable, Equatable {
    case text(String)
    case number(Double)
    case bool(Bool)
    case list([String])
    case files([URL])
    case photos([Data])
    case location(lat: Double, lng: Double, accuracy: Double)
}

/// An app's own component: its attributes and the text the model put inside.
public struct CustomProps {
    public let attrs: Attrs
    public let text: String
    public let node: UINode
}

public typealias CustomView = (CustomProps) -> AnyView

struct ActionKey: EnvironmentKey {
    static let defaultValue: (Action) -> Void = { _ in }
}

struct CustomKey: EnvironmentKey {
    static let defaultValue: [String: CustomView] = [:]
}

struct InTileKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var morphAction: (Action) -> Void {
        get { self[ActionKey.self] }
        set { self[ActionKey.self] = newValue }
    }
    var morphCustom: [String: CustomView] {
        get { self[CustomKey.self] }
        set { self[CustomKey.self] = newValue }
    }
    /// Inside a Columns cell: sections become tiles, stats lose their own tile.
    var morphInTile: Bool {
        get { self[InTileKey.self] }
        set { self[InTileKey.self] = newValue }
    }
}

public struct AnswerView: View {
    let answer: Answer
    let components: [String: CustomView]
    let onAction: (Action) -> Void
    let media: MediaPolicy

    /// `media` is where images may load from: the app's own hosts (and its
    /// photo provider's). Any other image shows its description.
    public init(_ answer: Answer, components: [String: CustomView] = [:], media: MediaPolicy = MediaPolicy(), onAction: @escaping (Action) -> Void = { _ in }) {
        self.answer = answer
        self.components = components
        self.media = media
        self.onAction = onAction
    }

    public var body: some View {
        Children(nodes: answer.root.children)
            .environment(\.morphAction, onAction)
            .environment(\.morphCustom, components)
            .environment(\.morphMedia, media)
            .environment(answer.components)
            .foregroundColor(Theme.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A node's children, with consecutive Buttons in one row.
struct Children: View {
    let nodes: [UINode]
    var spacing: CGFloat = 16

    private var groups: [[UINode]] {
        var out: [[UINode]] = []
        let buttons: Set<String> = ["Button", "AddToCalendar", "Share"]
        for n in nodes {
            if buttons.contains(n.type), let last = out.last, let t = last.first?.type, buttons.contains(t) {
                out[out.count - 1].append(n)
            } else {
                out.append([n])
            }
        }
        return out
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(groups, id: \.first!.id) { g in
                Group {
                    if ["Button", "AddToCalendar", "Share"].contains(g.first!.type) {
                        FlowLayout { ForEach(g) { NodeView(node: $0) } }
                    } else {
                        NodeView(node: g[0])
                    }
                }
                // Each block arrives the same way: it fades in and rises 4 points.
                .transition(reduceMotion ? .identity : .opacity.combined(with: .offset(y: 4)))
            }
        }
        .animation(reduceMotion ? nil : .snappy(duration: Tokens.base), value: nodes.count)
    }
}

struct NodeView: View {
    let node: UINode
    @Environment(\.morphCustom) private var custom

    var body: some View {
        switch node.type {
        case "p": Paragraph(node: node)
        case "h": Heading(node: node)
        case "ul", "ol": ListBlock(node: node)
        case "table": TableBlock(node: node)
        case "code": CodeBlock(node: node)
        case "quote": inlineText(node.spans).italic().foregroundColor(Theme.ink2).padding(.leading, Tokens.s4)
        case "hr": Divider()
        case "group": Children(nodes: node.children)
        case "Card": CardView(node: node)
        case "Columns": ColumnsView(node: node)
        case "Tabs": TabsView(node: node)
        case "Tab": Children(nodes: node.children)
        case "Details": DetailsView(node: node)
        case "Steps": StepsView(node: node)
        case "Callout": CalloutView(node: node)
        case "Stat": StatView(node: node)
        case "Badge": BadgeView(node: node)
        case "Progress": ProgressBlock(node: node)
        case "Avatar": AvatarView(name: node.attr("name") ?? "", subtitle: node.attr("subtitle"), src: node.attr("src"))
        case "Gallery": GalleryView(node: node)
        case "Chart": ChartView(node: node)
        case "FollowUps": FollowUpsView(node: node)
        case "Form": FormView(node: node)
        case "Input", "TextArea", "Select", "Date", "Slider", "Checkboxes", "Radio", "Switch": FieldView(node: node)
        case "Button": ButtonView(node: node)
        case "Map": MapBlock(node: node)
        case "Camera", "Scan", "Location", "File": DeviceField(node: node)
        case _ where packComponents.contains(node.type): PackView(node: node)
        default:
            if let make = custom[node.type] {
                make(CustomProps(attrs: node.attrs, text: plainText(node.spans), node: node))
            } else {
                Facts(node: node)
            }
        }
    }
}

// MARK: - Markdown blocks

struct Paragraph: View {
    let node: UINode
    @Environment(\.morphAction) private var act

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.s2) {
            let words = !plainText(node.spans.filter { if case .image = $0 { false } else { true } }).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            if let ask = askTarget(node.spans) {
                Button { act(.ask(text: ask, node: node.id)) } label: { inlineText(node.spans).multilineTextAlignment(.leading) }
                    .buttonStyle(.plain)
            } else if words {
                // A readable line length (about 70 characters) in a wide card.
                inlineText(node.spans).fixedSize(horizontal: false, vertical: true).frame(maxWidth: 620, alignment: .leading)
            }
            ForEach(Array(inlineImages(node.spans).enumerated()), id: \.offset) { _, img in
                Photo(src: img.src, alt: img.alt, credit: img.credit)
            }
        }
    }
}

struct Heading: View {
    let node: UINode
    var body: some View {
        let level = Int(node.attr("level") ?? "1") ?? 1
        let font: Font = switch level {
        case 1: .title.weight(.semibold)
        case 2: .title2.weight(.semibold)
        case 3: .title3.weight(.semibold)
        default: .headline
        }
        inlineText(node.spans).font(font).padding(.top, Tokens.s1)
    }
}

struct ListBlock: View {
    let node: UINode
    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.s1) {
            ForEach(Array(node.children.enumerated()), id: \.element.id) { k, li in
                HStack(alignment: .firstTextBaseline, spacing: Tokens.s2) {
                    switch li.attr("task") {
                    case "done": Image(systemName: "checkmark.square.fill").foregroundColor(Theme.ink)
                    case "open": Image(systemName: "square").foregroundColor(Theme.ink3)
                    default: Text(node.type == "ol" ? "\(k + 1)." : "•").foregroundColor(Theme.ink3)
                    }
                    inlineText(li.spans)
                        .strikethrough(li.attr("task") == "done")
                        .foregroundColor(li.attr("task") == "done" ? Theme.ink3 : Theme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

struct TableBlock: View {
    let node: UINode
    var body: some View {
        let align: [Bool] = if case let .align(a) = node.data { a } else { [] }
        ScrollView(.horizontal, showsIndicators: false) {
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                ForEach(Array(node.children.enumerated()), id: \.element.id) { r, row in
                    GridRow {
                        ForEach(Array(row.children.enumerated()), id: \.element.id) { k, cell in
                            inlineText(cell.spans, base: .callout)
                                .font(r == 0 ? .footnote : .callout)
                                .foregroundColor(r == 0 ? Theme.ink3 : Theme.ink)
                                .gridColumnAlignment(k < align.count && align[k] ? .trailing : .leading)
                        }
                    }
                    if r == 0 { Divider().gridCellUnsizedAxes(.horizontal) }
                }
            }
            .monospacedDigit()
        }
    }
}

struct CodeBlock: View {
    let node: UINode
    var body: some View {
        // Every line, as written: code scrolls sideways, never wraps, and never
        // stops at a height its parent proposed (in a Tab it was cut to two lines).
        ScrollView(.horizontal, showsIndicators: false) {
            Text(plainText(node.spans)).font(.system(.footnote, design: .monospaced)).fixedSize(horizontal: true, vertical: true).textSelection(.enabled).padding(Tokens.s3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.tile, in: RoundedRectangle(cornerRadius: Theme.radius))
    }
}

/// A component with no view here: its attributes as a list, then its content.
struct Facts: View {
    let node: UINode
    var body: some View {
        let listed = node.attrs.compactMap { k, v in v.string.map { (k, $0) } }.filter { !$0.1.isEmpty }.sorted { $0.0 < $1.0 }
        VStack(alignment: .leading, spacing: Tokens.s2) {
            if !listed.isEmpty {
                Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 4) {
                    ForEach(listed, id: \.0) { k, v in
                        GridRow {
                            Text(k).foregroundColor(Theme.ink3)
                            Text(v).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .font(.callout)
            }
            if !node.spans.isEmpty { inlineText(node.spans) }
            Children(nodes: node.children)
        }
    }
}
