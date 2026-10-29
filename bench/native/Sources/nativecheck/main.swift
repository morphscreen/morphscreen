// Layout checker for SwiftUI (roadmap Q2). SwiftUI doesn't expose how it laid
// out its text, so this reads the screenshot instead: Apple's Vision finds
// every line of text and where it is, and the answer's own text says which
// words and IDs a line break split. The same check runs on our renderer and
// on OpenUI's Swift port, from nativebench's screenshots.
//   nativecheck <screenshot.png> <answer.txt> <width in points>
// Prints the defects as one JSON array. Text size isn't checked: these are
// macOS renders, and macOS sizes its text styles smaller than iOS does.

import AppKit
import Foundation
import Vision

struct Line {
    let text: String
    let rect: CGRect // points, origin top left
}

struct Defect: Encodable {
    let kind: String
    let at: String
    let detail: String
}

let args = CommandLine.arguments
guard args.count == 4, let widthPt = Double(args[3]) else {
    FileHandle.standardError.write("usage: nativecheck <png> <answer.txt> <width>\n".data(using: .utf8)!)
    exit(2)
}
guard let image = NSImage(contentsOfFile: args[1]), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("[]")
    exit(0)
}
let source = (try? String(contentsOfFile: args[2], encoding: .utf8)) ?? ""

// On the page color (white, or NATIVE_BG for the dark review), so transparent areas read as page.
let bgHex = UInt32(ProcessInfo.processInfo.environment["NATIVE_BG"] ?? "", radix: 16) ?? 0xFFFFFF
let w = cg.width, h = cg.height
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
ctx.setFillColor(CGColor(red: CGFloat((bgHex >> 16) & 0xFF) / 255, green: CGFloat((bgHex >> 8) & 0xFF) / 255, blue: CGFloat(bgHex & 0xFF) / 255, alpha: 1))
ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
let flat = ctx.makeImage()!
let scale = Double(w) / widthPt

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-US"]
try VNImageRequestHandler(cgImage: flat).perform([request])
let lines: [Line] = (request.results ?? []).compactMap { o in
    guard let s = o.topCandidates(1).first?.string else { return nil }
    let b = o.boundingBox
    let r = CGRect(x: b.minX * Double(w) / scale, y: (1 - b.maxY) * Double(h) / scale, width: b.width * Double(w) / scale, height: b.height * Double(h) / scale)
    return Line(text: s, rect: r)
}
// Vision now and then reads a drawing (a chart, a photo) as one tall "line": not text.
.filter { $0.rect.height < 40 }
.sorted { $0.rect.minY < $1.rect.minY }

if ProcessInfo.processInfo.environment["CHECK_VERBOSE"] != nil {
    for l in lines { FileHandle.standardError.write("\(Int(l.rect.minX)),\(Int(l.rect.minY)) \(Int(l.rect.width))x\(Int(l.rect.height)) \(l.text)\n".data(using: .utf8)!) }
}

// Every word, number and ID the answer contains.
let tokenPattern = try NSRegularExpression(pattern: "[\\p{L}\\p{N}#$@][\\p{L}\\p{N}\\-–—_./:#%$@&+']*[\\p{L}\\p{N}%]")
var tokens = Set<String>()
let ns = source as NSString
for m in tokenPattern.matches(in: source, range: NSRange(location: 0, length: ns.length)) { tokens.insert(ns.substring(with: m.range)) }

let edge = CharacterSet(charactersIn: "()[]{},;:!?\"'“”‘’*|<>")
func clean(_ s: Substring) -> String { s.trimmingCharacters(in: edge).trimmingCharacters(in: .whitespaces) }
func hasDigit(_ s: String) -> Bool { s.contains { $0.isNumber } }
func twoCaps(_ s: String) -> Bool { s.range(of: "[A-Z]{2}", options: .regularExpression) != nil }

var out: [Defect] = []

// A line and the one continuing it: just below, same left edge (or centred the same).
func next(after i: Int) -> Int? {
    let a = lines[i].rect
    for j in (i + 1)..<lines.count {
        let b = lines[j].rect
        if b.minY - a.maxY > a.height * 0.9 { break }
        if b.minY < a.maxY - a.height * 0.5 { continue }
        if abs(b.minX - a.minX) < 3 || abs(b.midX - a.midX) < 3 { return j }
    }
    return nil
}

for i in lines.indices {
    guard let j = next(after: i) else { continue }
    guard let lastRaw = lines[i].text.split(separator: " ").last, let firstRaw = lines[j].text.split(separator: " ").first else { continue }
    let last = clean(lastRaw), first = clean(firstRaw)
    guard !last.isEmpty, !first.isEmpty else { continue }
    let joined = last + first
    // Fragments this short are separate numbers or labels more often than a split.
    guard joined.count >= 4 else { continue }
    // A real split continues the line: the word before it, then the whole token,
    // is in the answer ("Dr. Ch|ecked" from a misread "Dr. Chen" isn't).
    let before = lines[i].text.split(separator: " ").dropLast().last.map { clean($0) } ?? ""
    if !before.isEmpty, !norm(source).contains(norm(before + " " + joined)) { continue }
    // Only a split of something the answer really contains, and not two words of their own.
    guard tokens.contains(joined) || tokens.contains(clean(Substring(joined))) else { continue }
    if tokens.contains(last) && !last.hasSuffix("-") && !last.hasSuffix("/") { continue }
    let at = String(lines[i].text.prefix(48))
    let split = "\"\(last)|\(first)\""
    // A URL or path may break after its slash.
    if last.hasSuffix("/") { continue }
    if hasDigit(joined) { out.append(Defect(kind: "broken-id", at: at, detail: split)) }
    else if last.hasSuffix("-") || last.hasSuffix("/") || last.hasSuffix("–") || last.hasSuffix("—") { continue }
    else if twoCaps(joined) { out.append(Defect(kind: "broken-id", at: at, detail: split)) }
    else { out.append(Defect(kind: "broken-word", at: at, detail: split)) }
}

// Cut off: a line ending in an ellipsis the answer didn't write. OCR misreads
// a letter now and then, so it's the answer's own when the line's first words
// appear in it with an ellipsis soon after.
func writtenEllipsis(_ text: String) -> Bool {
    if source.contains(text) { return true }
    // Text cut off is text too long for its box: two or three characters before
    // the ellipsis is OCR reading a written one ("// ..." read as "'i...").
    if text.trimmingCharacters(in: CharacterSet(charactersIn: ".… ")).count < 4 && (source.contains("...") || source.contains("…")) { return true }
    // The last letters before the ellipsis, written with one in the answer ("budget..." read as "buaget...").
    let stem = text.trimmingCharacters(in: CharacterSet(charactersIn: ".…")).suffix(3)
    if stem.count == 3, source.range(of: stem + "...", options: .caseInsensitive) != nil || source.range(of: stem + "…", options: .caseInsensitive) != nil { return true }
    // OCR garbles the start or the last word now and then ("hotfix..." read as
    // "hotx..."): the two whole words before the last, followed by an
    // ellipsis in the answer, say it's the answer's own too.
    let all = text.split(separator: " ")
    if all.count >= 3 {
        let probe = all[(all.count - 3)...(all.count - 2)].joined(separator: " ")
        var at = source.startIndex
        while let r = source.range(of: probe, options: .caseInsensitive, range: at..<source.endIndex) {
            let tail = source[r.upperBound...].prefix(24)
            if tail.contains("…") || tail.contains("...") { return true }
            at = r.upperBound
        }
    }
    let words = text.split(separator: " ").prefix(2).joined(separator: " ")
    guard !words.isEmpty else { return false }
    var from = source.startIndex
    while let r = source.range(of: words, options: .caseInsensitive, range: from..<source.endIndex) {
        let tail = source[r.upperBound...].prefix(text.count + 12)
        if tail.contains("…") || tail.contains("...") { return true }
        from = r.upperBound
    }
    return false
}
for l in lines where l.text.hasSuffix("…") || l.text.hasSuffix("...") {
    if !writtenEllipsis(l.text) { out.append(Defect(kind: "clipped-text", at: String(l.text.prefix(48)), detail: "ends in an ellipsis")) }
}

// Past the edge: nativebench pads the answer by 24 points a side, and Vision's
// boxes can run 15 points wide of large glyphs, so what counts is text reaching
// the window's own edge, where anything wider is cut off.
for l in lines where l.rect.maxX > widthPt - 6 || l.rect.minX < 6 {
    out.append(Defect(kind: "overflow", at: String(l.text.prefix(48)), detail: "\(Int(l.rect.minX))-\(Int(l.rect.maxX)) of \(Int(widthPt))"))
}

// Cramped: a paragraph under 16 characters a line. Lines belong to one
// paragraph when they continue each other in the answer's own text (a name
// over a time, or a label over its value, are separate pieces, not a wrap).
// Options split by "|" and separate lines are separate pieces: § keeps them apart.
func norm(_ s: String) -> String {
    let kept = s.lowercased().map { $0.isLetter || $0.isNumber || ".,%$-'/:".contains($0) ? String($0) : $0 == "|" || $0.isNewline ? " § " : " " }
    return kept.joined().split(separator: " ").joined(separator: " ")
}
let flatSource = norm(source)
func continues(_ a: Line, _ b: Line) -> Bool {
    let end = norm(a.text).split(separator: " ").suffix(2).joined(separator: " ")
    let start = norm(b.text).split(separator: " ").prefix(2).joined(separator: " ")
    return !end.isEmpty && !start.isEmpty && flatSource.contains(end + " " + start)
}
var used = Set<Int>()
for i in lines.indices where !used.contains(i) {
    var block = [i]
    var k = i
    while let j = next(after: k), lines[j].rect.minY - lines[k].rect.maxY < lines[k].rect.height * 0.6, continues(lines[k], lines[j]) {
        block.append(j)
        k = j
    }
    block.forEach { used.insert($0) }
    let chars = block.reduce(0) { $0 + lines[$1].text.count }
    if block.count >= 3, chars >= 40, chars / block.count < 16 {
        out.append(Defect(kind: "cramped-text", at: String(lines[i].text.prefix(48)), detail: "\(block.count) lines, \(chars / block.count) characters each"))
    }
}

let enc = JSONEncoder()
print(String(data: try enc.encode(out), encoding: .utf8)!)
