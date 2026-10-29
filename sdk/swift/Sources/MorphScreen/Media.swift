// Where pictures may load from. An answer's image URLs are the model's:
// loading one tells its host who is reading, and a URL can carry what the
// screen holds out to anyone. So only the app's own hosts load (with a photo
// key for the API, its provider's too); any other image shows its
// description in a tile, an avatar its initials.

import SwiftUI

public struct MediaPolicy: Sendable {
    /// The image hosts that load ("cdn.example.com", "images.pexels.com").
    public var hosts: [String]

    public init(hosts: [String] = []) {
        self.hosts = hosts
    }

    /// The URL to load for `src`, if it may load: https (http on this
    /// machine) from an allowed host.
    func url(_ src: String) -> URL? {
        guard let u = URL(string: src), let scheme = u.scheme?.lowercased(), let host = u.host?.lowercased() else { return nil }
        let local = host == "localhost" || host == "127.0.0.1" || host == "::1"
        guard scheme == "https" || (scheme == "http" && local) else { return nil }
        let at = u.port.map { "\(host):\($0)" } ?? host
        guard hosts.map({ $0.lowercased() }).contains(at) else { return nil }
        return u
    }
}

struct MediaKey: EnvironmentKey {
    static let defaultValue = MediaPolicy()
}

extension EnvironmentValues {
    var morphMedia: MediaPolicy {
        get { self[MediaKey.self] }
        set { self[MediaKey.self] = newValue }
    }
}

/// A photo, or its description in a tile when it can't or mustn't load; its
/// credit under it.
struct Photo: View {
    let src: String
    let alt: String
    var credit: [Span] = []
    /// Width over height of the frame; the photo fills it, cropped.
    var aspect: CGFloat = 3 / 2
    @Environment(\.morphMedia) private var media

    var body: some View {
        let url = media.url(src)
        VStack(alignment: .leading, spacing: Tokens.s1) {
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case let .success(image):
                        framed(image.resizable())
                    case .failure:
                        tile
                    default:
                        Theme.tile.aspectRatio(aspect, contentMode: .fit)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
                .accessibilityLabel(alt)
                if !credit.isEmpty {
                    inlineText(credit).font(.caption).foregroundColor(Theme.ink3).tint(Theme.ink3).fixedSize(horizontal: false, vertical: true)
                }
            } else {
                tile
            }
        }
    }

    private func framed(_ image: Image) -> some View {
        Color.clear.aspectRatio(aspect, contentMode: .fit).frame(maxWidth: .infinity).overlay(image.scaledToFill()).clipped()
    }

    private var tile: some View {
        Text(keepIDs(alt.isEmpty ? "Image" : alt))
            .font(.footnote)
            .foregroundColor(Theme.ink3)
            .multilineTextAlignment(.center)
            .padding(Tokens.s2)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .aspectRatio(aspect, contentMode: .fit)
            .background(Theme.tile, in: RoundedRectangle(cornerRadius: Theme.radius))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(alt)
            .accessibilityAddTraits(.isImage)
    }
}

/// An icon from the core: its path (M, L, C and Z, absolute or relative, on
/// Phosphor's 256-unit grid) filled in the text's color at `size` points.
struct IconView: View {
    let path: String
    var size: CGFloat = 16

    var body: some View {
        IconShape(path: path).frame(width: size, height: size).accessibilityHidden(true)
    }
}

struct IconShape: Shape {
    let path: String

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let k = min(rect.width, rect.height) / 256
        var nums: [CGFloat] = []
        var cmd: Character = "M"
        var cur = CGPoint.zero, start = CGPoint.zero
        func pt(_ x: CGFloat, _ y: CGFloat, rel: Bool) -> CGPoint { rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y) }
        func flush() {
            let rel = cmd.isLowercase
            switch cmd.lowercased() {
            case "m":
                var i = 0
                while i + 1 < nums.count {
                    let q = pt(nums[i], nums[i + 1], rel: rel)
                    if i == 0 { p.move(to: q.scaled(k)); start = q } else { p.addLine(to: q.scaled(k)) }
                    cur = q
                    i += 2
                }
            case "l":
                var i = 0
                while i + 1 < nums.count {
                    cur = pt(nums[i], nums[i + 1], rel: rel)
                    p.addLine(to: cur.scaled(k))
                    i += 2
                }
            case "c":
                var i = 0
                while i + 5 < nums.count {
                    let c1 = pt(nums[i], nums[i + 1], rel: rel), c2 = pt(nums[i + 2], nums[i + 3], rel: rel), e = pt(nums[i + 4], nums[i + 5], rel: rel)
                    p.addCurve(to: e.scaled(k), control1: c1.scaled(k), control2: c2.scaled(k))
                    cur = e
                    i += 6
                }
            case "z":
                p.closeSubpath()
                cur = start
            default: break
            }
            nums.removeAll(keepingCapacity: true)
        }
        var number = ""
        func endNumber() {
            if let v = Double(number) { nums.append(CGFloat(v)) }
            number = ""
        }
        for ch in path {
            if ch.isLetter {
                endNumber()
                flush()
                cmd = ch
            } else if ch == "-" {
                endNumber()
                number = "-"
            } else if ch == " " || ch == "," {
                endNumber()
            } else {
                number.append(ch)
            }
        }
        endNumber()
        flush()
        return p
    }
}

private extension CGPoint {
    func scaled(_ k: CGFloat) -> CGPoint { CGPoint(x: x * k, y: y * k) }
}
