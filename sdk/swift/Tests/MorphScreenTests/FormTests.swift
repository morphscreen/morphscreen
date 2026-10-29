import AppKit
import SwiftUI
import XCTest
@testable import MorphScreen

/// The view in a window through a hosting controller, as an app shows it.
@MainActor
func hosted<V: View>(_ view: V, width: CGFloat = 760) -> NSWindow {
    let host = NSHostingController(rootView: view.frame(width: width))
    host.sizingOptions = []
    let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: width, height: 1400), styleMask: [.borderless], backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    window.contentViewController = host
    window.setContentSize(NSSize(width: width, height: 1400))
    host.view.layoutSubtreeIfNeeded()
    RunLoop.main.run(until: Date().addingTimeInterval(0.4))
    return window
}

/// Inside a form: once drawn, sends the form as its Button would.
private struct SendProbe: View {
    @Environment(FormState.self) private var form: FormState?
    @Environment(\.morphAction) private var act
    var body: some View {
        Color.clear.frame(height: 1).task {
            try? await Task.sleep(nanoseconds: 150_000_000)
            if let form { act(form.submit(button: "Request demo")) }
        }
    }
}

final class FormStartTests: XCTestCase {
    private let probe = #"{"name":"probe","version":"1.0.0","components":{"SendProbe":{"about":"test","attrs":{},"content":"none"}}}"#

    /// A form sent untouched, in a window as an app shows it, sends the values
    /// the model wrote in: a ticked box, a chosen radio, a slider's start.
    @MainActor
    func testStartingValuesAreSent() throws {
        let a = try Answer(custom: [probe])
        a.push("""
        <Card title="Book a demo">
        <Form name="demo">
        <Slider label="Seats" name="seats" min="1" max="50" value="8" />
        <Checkboxes label="Interested in" name="interests" options="Analytics | Billing" value="Analytics" />
        <Radio label="Plan" name="plan" options="Cloud | Self-hosted" value="Cloud" />
        <SendProbe />
        </Form>
        </Card>

        """)
        a.finish()
        var sent: [Action] = []
        // Hosted as an app hosts it: the answer, padded on the page, in a hosting controller.
        let window = hosted(AnyView(AnswerView(a, components: ["SendProbe": { _ in AnyView(SendProbe()) }]) { sent.append($0) }
            .padding(.horizontal, 24).padding(.vertical, 12).background(Theme.page)))
        RunLoop.main.run(until: Date().addingTimeInterval(0.4))
        guard case let .submit(_, form, _, fields) = sent.last else { return XCTFail("nothing sent: \(sent)") }
        XCTAssertEqual(form, "demo")
        XCTAssertEqual(fields["seats"], .number(8))
        XCTAssertEqual(fields["interests"], .list(["Analytics"]))
        XCTAssertEqual(fields["plan"], .text("Cloud"))
        window.close()
    }
}

final class FormSeedTests: XCTestCase {
    /// A form's state starts with every value the model wrote in, the packs'
    /// inputs included, before any field has appeared.
    func testTheFormStartsWithItsFieldsValues() throws {
        let a = try Answer(packs: ["inputs", "scheduling"])
        a.push("""
        <Form name="trip">
        <Slider label="Seats" name="seats" min="1" max="50" value="8" />
        <Checkboxes label="Interested in" name="interests" options="Analytics | Billing" value="Analytics" />
        <Radio label="Plan" name="plan" options="Cloud | Self-hosted" value="Cloud" />
        <Input label="Name" name="name" />
        <ToggleGroup label="Days" name="days" options="Mon | Tue | Wed" value="Mon | Wed" multiple="true" />
        <TimeSlots label="Time" name="slot" options="09:00 | 09:30" />
        <RatingInput label="How was it?" name="stars" value="4" />
        <Button>Send</Button>
        </Form>

        """)
        a.finish()
        let form = FormState(node: a.root.children[0])
        XCTAssertEqual(form.values["seats"], .number(8))
        XCTAssertEqual(form.values["interests"], .list(["Analytics"]))
        XCTAssertEqual(form.values["plan"], .text("Cloud"))
        XCTAssertEqual(form.values["days"], .list(["Mon", "Wed"]))
        XCTAssertEqual(form.values["stars"], .number(4))
        XCTAssertNil(form.values["name"])
        XCTAssertNil(form.values["slot"])
    }
}
