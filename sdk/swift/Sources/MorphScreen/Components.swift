// Layout and display components: Card, Columns, Tabs, Details, Steps,
// Callout, Stat, Badge, Progress, Avatar, Gallery, FollowUps, Button.

import SwiftUI

struct CardView: View {
    let node: UINode
    @Environment(\.morphInTile) private var inTile

    var body: some View {
        let nested = node.cardDepth > 0
        VStack(alignment: .leading, spacing: Tokens.s3) {
            if node.attr("title") != nil || node.attr("subtitle") != nil {
                VStack(alignment: .leading, spacing: 2) {
                    if let t = node.attr("title") {
                        HStack(alignment: .firstTextBaseline, spacing: Tokens.s2) {
                            if let icon = node.icon { IconView(path: icon, size: nested || inTile ? 17 : 21).foregroundColor(Theme.ink3).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 3 } }
                            Text(t).font(nested || inTile ? .headline : .title2.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    if let s = node.attr("subtitle") { Text(keepIDs(s)).font(.subheadline).foregroundColor(Theme.ink3).fixedSize(horizontal: false, vertical: true) }
                }
            }
            if !nested && !inTile, let photo = leadPhoto(node) {
                // A photo first and only text after it: beside the text when there's room.
                let rest = Array(node.children.dropFirst())
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: Tokens.s5) {
                        Photo(src: photo.src, alt: photo.alt, credit: photo.credit).frame(width: 260)
                        Children(nodes: rest).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(minWidth: 560, idealWidth: 560, maxWidth: .infinity)
                    Children(nodes: node.children)
                }
            } else {
                Children(nodes: node.children)
            }
        }
        .environment(\.morphInTile, false)
        // In a Columns row the tile fills the row's height, so tiles side by side match.
        .frame(maxWidth: .infinity, maxHeight: inTile ? .infinity : nil, alignment: .topLeading)
        .padding(inTile ? 16 : nested ? 0 : 24)
        .background {
            if inTile {
                RoundedRectangle(cornerRadius: Theme.radius).fill(Theme.tile)
            } else if !nested {
                RoundedRectangle(cornerRadius: Theme.radius).fill(Theme.surface)
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line))
            }
        }
    }
}

/// A card's leading photo, when the card opens with a paragraph that is only
/// a photo and holds nothing but text after it.
func leadPhoto(_ node: UINode) -> GalleryImage? {
    guard let first = node.children.first, first.type == "p", node.children.count > 1 else { return nil }
    let images = inlineImages(first.spans)
    let words = plainText(first.spans.filter { if case .image = $0 { false } else { true } }).trimmingCharacters(in: .whitespacesAndNewlines)
    guard images.count == 1, words.isEmpty, images[0].src != "find" else { return nil }
    let text: Set<String> = ["p", "ul", "ol", "quote", "h"]
    return node.children.dropFirst().allSatisfy { text.contains($0.type) } ? images[0] : nil
}

struct ColumnsView: View {
    let node: UINode
    var body: some View {
        let items = node.children
        if !items.isEmpty && items.allSatisfy({ $0.type == "Button" }) {
            FlowLayout { ForEach(items) { NodeView(node: $0) } }
        } else {
            // The core's plan once the Columns close; until then a guess from what has arrived.
            let plan: (per: Int, min: Int) = if case let .layout(per, min) = node.data { (per, min) } else { (columnsPlan(items).perRow, columnsPlan(items).rich ? 200 : 140) }
            ColumnsLayout(perRow: plan.per, minWidth: CGFloat(plan.min)) {
                ForEach(items) { item in
                    NodeView(node: item)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                        .padding(item.type == "group" ? 16 : 0)
                        .background {
                            if item.type == "group" { RoundedRectangle(cornerRadius: Theme.radius).fill(Theme.tile) }
                        }
                }
            }
            .environment(\.morphInTile, true)
        }
    }
}

struct TabsView: View {
    let node: UINode
    @State private var selected = 0

    var body: some View {
        let tabs = node.children.filter { $0.type == "Tab" }
        VStack(alignment: .leading, spacing: Tokens.s3) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 20) {
                    ForEach(Array(tabs.enumerated()), id: \.element.id) { k, t in
                        Button { selected = k } label: {
                            VStack(spacing: 6) {
                                Text(t.attr("title") ?? "Tab \(k + 1)").font(.subheadline.weight(.medium))
                                    .foregroundColor(k == selected ? Theme.ink : Theme.ink3)
                                Rectangle().fill(k == selected ? Theme.ink : .clear).frame(height: 2)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            Divider()
            if selected < tabs.count { Children(nodes: tabs[selected].children) }
        }
    }
}

struct DetailsView: View {
    let node: UINode
    @State private var open: Bool?

    var body: some View {
        DisclosureGroup(isExpanded: Binding(get: { open ?? node.flag("open") }, set: { open = $0 })) {
            Children(nodes: node.children).padding(.top, Tokens.s2)
        } label: {
            Text(keepIDs(node.attr("title") ?? "")).fontWeight(.medium).fixedSize(horizontal: false, vertical: true)
        }
        .tint(Theme.ink3)
    }
}

struct StepsView: View {
    let node: UINode
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(node.children.filter { $0.type == "Step" }.enumerated()), id: \.element.id) { k, step in
                let status = step.attr("status") ?? "todo"
                HStack(alignment: .top, spacing: Tokens.s3) {
                    ZStack {
                        Circle().fill(status == "done" ? Theme.ink : Theme.surface)
                        Circle().stroke(status == "todo" ? Theme.line2 : Theme.ink, lineWidth: 1.5)
                        if status == "done" {
                            Image(systemName: "checkmark").font(.caption.weight(.bold)).foregroundColor(Theme.surface)
                        } else {
                            Text("\(k + 1)").font(.caption.weight(.semibold)).foregroundColor(status == "current" ? Theme.ink : Theme.ink3)
                        }
                    }
                    .frame(width: 22, height: 22)
                    VStack(alignment: .leading, spacing: Tokens.s1) {
                        Text(keepIDs(step.attr("title") ?? "")).fontWeight(status == "todo" ? .regular : .semibold)
                            .foregroundColor(status == "todo" ? Theme.ink2 : Theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        if let sub = step.attr("subtitle"), !sub.trimmingCharacters(in: .whitespaces).isEmpty { Text(keepIDs(sub)).font(.footnote).foregroundColor(Theme.ink3).fixedSize(horizontal: false, vertical: true) }
                        Children(nodes: step.children, spacing: 6).font(.callout).foregroundColor(Theme.ink3)
                    }
                }
            }
        }
    }
}

struct CalloutView: View {
    let node: UINode
    var body: some View {
        let tone = node.attr("tone") ?? "info"
        let (fg, bg) = tone == "neutral" ? (Theme.ink3, Theme.tile) : Theme.tone(tone)
        HStack(alignment: .top, spacing: Tokens.s3) {
            Circle().fill(fg).frame(width: 8, height: 8).padding(.top, 7)
            VStack(alignment: .leading, spacing: Tokens.s1) {
                if let t = node.attr("title") { Text(keepIDs(t)).fontWeight(.semibold).fixedSize(horizontal: false, vertical: true) }
                Children(nodes: node.children, spacing: Tokens.s1).foregroundColor(Theme.ink2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tokens.s4).padding(.vertical, Tokens.s3)
        .background(bg, in: RoundedRectangle(cornerRadius: Theme.radius))
    }
}

struct StatView: View {
    let node: UINode
    @Environment(\.morphInTile) private var inTile

    var body: some View {
        let change = node.attr("change") ?? ""
        let tone = node.attr("tone").flatMap { $0 == "neutral" ? nil : $0 }
        let changeColor: Color = tone.map { Theme.tone($0).0 } ?? (change.hasPrefix("-") || change.hasPrefix("−") ? Theme.bad : Theme.good)
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                if let tone, change.isEmpty { Circle().fill(Theme.tone(tone).0).frame(width: 6, height: 6) }
                if let icon = node.icon { IconView(path: icon, size: 14).foregroundColor(Theme.ink3) }
                Text(node.attr("label") ?? "").font(.footnote).foregroundColor(Theme.ink2)
            }
            Text(node.attr("value") ?? "").font(.title2.weight(.semibold)).monospacedDigit().minimumScaleFactor(0.6).lineLimit(2)
            if !change.isEmpty { Text(change).font(.caption.weight(.semibold)).foregroundColor(changeColor) }
            if let note = node.attr("note") { Text(note).font(.caption).foregroundColor(Theme.ink3) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(inTile ? 0 : 12)
        .background {
            if !inTile { RoundedRectangle(cornerRadius: Theme.radius).fill(Theme.tile) }
        }
    }
}

struct BadgeView: View {
    let node: UINode
    var body: some View {
        let tone = node.attr("tone") ?? "neutral"
        let (fg, bg) = Theme.tone(tone)
        HStack(spacing: 5) {
            if tone != "neutral" { Circle().fill(fg).frame(width: 6, height: 6) }
            inlineText(node.spans)
        }
        .font(.caption.weight(.semibold))
        .foregroundColor(fg)
        // A long badge wraps rather than being cut off.
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, 7).padding(.vertical, 2)
        .frame(minHeight: 20)
        .background(bg, in: RoundedRectangle(cornerRadius: 4))
    }
}

struct ProgressBlock: View {
    let node: UINode
    var body: some View {
        let max = Double(node.attr("max") ?? "") ?? 100
        let value = Double(node.attr("value") ?? "") ?? 0
        let tone = node.attr("tone")
        let pct = max > 0 ? value / max : 0
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                if let l = node.attr("label") { Text(l).font(.subheadline).foregroundColor(Theme.ink2) }
                Spacer()
                Text("\(Int((pct * 100).rounded()))%").font(.footnote).monospacedDigit().foregroundColor(Theme.ink3)
            }
            ProgressView(value: min(Swift.max(pct, 0), 1)).tint(tone == nil || tone == "neutral" ? Theme.ink : Theme.tone(tone).0)
        }
    }
}

struct AvatarView: View {
    let name: String
    let subtitle: String?
    let src: String?
    @Environment(\.morphMedia) private var media

    var body: some View {
        HStack(spacing: Tokens.s3) {
            Group {
                if let src, let url = media.url(src) {
                    AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { initials }
                } else {
                    initials
                }
            }
            .frame(width: 40, height: 40)
            .clipShape(Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(name).fontWeight(.semibold)
                if let subtitle { Text(subtitle).font(.footnote).foregroundColor(Theme.ink3) }
            }
        }
    }

    private var initials: some View {
        let letters = name.split(separator: " ").compactMap(\.first).prefix(2).map(String.init).joined().uppercased()
        return ZStack {
            Theme.tile
            Text(letters).font(.footnote.weight(.semibold)).foregroundColor(Theme.ink2)
        }
    }
}

struct GalleryView: View {
    let node: UINode
    var body: some View {
        let images: [GalleryImage] = if case let .images(i) = node.data { i } else { [] }
        // One item a line: the photo, then its caption and credit.
        // Three across, two on a phone, as on the web.
        ColumnsLayout(perRow: 3, minWidth: 130, spacing: Tokens.s2) {
            ForEach(Array(images.enumerated()), id: \.offset) { _, img in
                VStack(alignment: .leading, spacing: Tokens.s1) {
                    Photo(src: img.src, alt: img.alt, aspect: 4 / 3)
                    if !img.caption.isEmpty {
                        GalleryCaption(spans: img.caption)
                    }
                    if !img.credit.isEmpty && img.src != "find" {
                        inlineText(img.credit).font(.caption).foregroundColor(Theme.ink3).tint(Theme.ink3).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            ForEach(node.children) { NodeView(node: $0) }
        }
    }
}

/// A gallery item's caption: a bold name leading it gets its own line.
struct GalleryCaption: View {
    let spans: [Span]
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            if case let .format("strong", name) = spans.first {
                Text(keepIDs(plainText(name))).font(.footnote.weight(.semibold))
                let rest = Array(spans.dropFirst())
                if !plainText(rest).trimmingCharacters(in: .whitespaces).isEmpty {
                    inlineText(rest).font(.footnote).foregroundColor(Theme.ink2)
                }
            } else {
                inlineText(spans).font(.footnote).foregroundColor(Theme.ink2)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

struct FollowUpsView: View {
    let node: UINode
    @Environment(\.morphAction) private var act

    var body: some View {
        let items: [[Span]] = if case let .list(i) = node.data { i } else { [] }
        FlowLayout {
            ForEach(Array(items.enumerated()), id: \.offset) { _, q in
                Button { act(.ask(text: plainText(q), node: node.id)) } label: {
                    HStack(spacing: Tokens.s1) {
                        inlineText(q)
                        Text("→").foregroundColor(Theme.ink3).layoutPriority(1)
                    }
                    .font(.subheadline)
                    .foregroundColor(Theme.ink2)
                    .padding(.horizontal, Tokens.s3).padding(.vertical, 5)
                    .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line2))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct ButtonView: View {
    let node: UINode
    @Environment(\.morphAction) private var act
    @Environment(\.openURL) private var openURL
    @Environment(FormState.self) private var form: FormState?

    var body: some View {
        let variant = node.attr("variant") ?? "primary"
        let size = node.attr("size") ?? "medium"
        let label = inlineText(node.spans)
        Button {
            if let href = node.attr("href"), let url = URL(string: href) {
                openURL(url)
            } else if let ask = node.attr("ask"), !ask.isEmpty {
                act(.ask(text: ask, node: node.id))
            } else if let form {
                act(form.submit(button: plainText(node.spans)))
            } else {
                act(.ask(text: plainText(node.spans), node: node.id))
            }
        } label: {
            HStack(spacing: 6) {
                if let icon = node.icon { IconView(path: icon, size: size == "small" ? 13 : 15) }
                label
            }
                .font(size == "small" ? .footnote.weight(.semibold) : size == "large" ? .body.weight(.semibold) : .subheadline.weight(.semibold))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, size == "small" ? 10 : size == "large" ? 20 : 14)
                .padding(.vertical, 6)
                // At least the usual height; a long label wraps onto a second line.
                .frame(minHeight: size == "small" ? 28 : size == "large" ? 44 : 36)
                .foregroundColor(variant == "primary" ? Theme.primaryInk : variant == "danger" ? Theme.bad : variant == "tertiary" ? Theme.ink2 : Theme.ink)
                .background {
                    switch variant {
                    case "primary": RoundedRectangle(cornerRadius: Theme.radius).fill(Theme.primary)
                    case "danger": RoundedRectangle(cornerRadius: Theme.radius).fill(Theme.badBg)
                    case "secondary": RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line2)
                    default: Color.clear
                    }
                }
        }
        .buttonStyle(.plain)
        .disabled(node.flag("disabled"))
        .opacity(node.flag("disabled") ? 0.4 : 1)
    }
}
