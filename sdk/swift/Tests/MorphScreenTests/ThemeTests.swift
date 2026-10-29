import Foundation
@testable import MorphScreen
import SwiftUI
import XCTest

// The theme format (roadmap T1): spec/theme.tokens.json read here is the
// built-in theme exactly, any other theme file reads too, and a broken one
// says which token is wrong.
final class ThemeTests: XCTestCase {
    let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../..").standardized

    func testTheFileIsTheBuiltInTheme() throws {
        let spec = try ThemeSpec(dtcg: Data(contentsOf: repo.appendingPathComponent("spec/theme.tokens.json")))
        XCTAssertEqual(spec, .standard)
    }

    func testAnotherThemeReads() throws {
        let clay = try ThemeSpec(dtcg: Data(contentsOf: repo.appendingPathComponent("test/fixtures/themes/clay.tokens.json")))
        XCTAssertEqual(clay.fonts.sans.first, "Charter")
        XCTAssertEqual(clay.radius.card, 2)
        XCTAssertEqual(clay.space.s4, 18)
        XCTAssertEqual(clay.light.accent, 0xA2431C)
        XCTAssertEqual(clay.type.body, ThemeSpec.standard.type.body)
    }

    func testAliasesAndErrors() throws {
        var file = try JSONSerialization.jsonObject(with: Data(contentsOf: repo.appendingPathComponent("spec/theme.tokens.json"))) as! [String: Any]
        var color = file["color"] as! [String: Any]
        var dark = color["dark"] as! [String: Any]
        dark["focus"] = ["$value": "{color.dark.ink}"]
        color["dark"] = dark
        file["color"] = color
        XCTAssertEqual(try ThemeSpec(dtcg: JSONSerialization.data(withJSONObject: file)).dark.focus, ThemeSpec.standard.dark.ink)
        dark.removeValue(forKey: "accentBg")
        color["dark"] = dark
        file["color"] = color
        XCTAssertThrowsError(try ThemeSpec(dtcg: JSONSerialization.data(withJSONObject: file))) { e in
            XCTAssertTrue("\(e)".contains("color.dark.accentBg"), "\(e)")
        }
    }

    func testUseSwitchesTheTheme() throws {
        defer { Theme.use(.standard) }
        try Theme.use(dtcg: Data(contentsOf: repo.appendingPathComponent("test/fixtures/themes/clay.tokens.json")))
        XCTAssertEqual(Theme.radius, 2)
        XCTAssertEqual(Tokens.s4, 18)
        XCTAssertEqual(Theme.palette(dark: false).accent, 0xA2431C)
    }

    func testPlexShipsAndDraws() {
        Faces.register()
        XCTAssertNotNil(PlatformFont(name: "IBMPlexSansVar-Regular", size: 15))
        XCTAssertNotNil(PlatformFont(name: "IBMPlexMono", size: 13))
        XCTAssertNotNil(PlatformFont(name: "IBMPlexMono-SmBld", size: 13))
        XCTAssertEqual(Faces.face(ThemeSpec.standard.fonts.sans), .plexSans)
        XCTAssertEqual(Faces.face(["Nonexistent Face", "ui-serif"]), .system(.serif))
        // Body lines are the theme's 24 points apart: Plex's own 19.5 plus the spacing.
        XCTAssertEqual(Faces.naturalLine(ThemeSpec.standard.type.body, families: ThemeSpec.standard.fonts.sans) + Theme.lineSpacing(\.body), 24, accuracy: 0.01)
    }
}
