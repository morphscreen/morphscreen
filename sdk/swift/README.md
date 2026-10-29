# MorphScreen for SwiftUI

MorphScreen's core as a native library under SwiftUI views: an answer is
read and checked as the model streams it, and drawn with native views
(charts in Swift Charts, maps in MapKit). The format is in spec/format.md.

iOS 17+ and macOS 14+.

## Build the core, then add the package

The core is Rust, built here as `MorphScreenCore.xcframework` (iOS device,
iOS simulator, macOS); it stays out of git until the package is published
after the launch.

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim aarch64-apple-darwin x86_64-apple-darwin
bash sdk/swift/build-core.sh          # MACOS_ONLY=1 for just this Mac's slice
```

Then add `sdk/swift` to your Xcode project as a local package and
`import MorphScreen`.

## Draw an answer

```swift
import MorphScreen
import SwiftUI

let answer = try Answer()            // every pack; Answer(packs: []) for the core alone

struct ChatAnswer: View {
    let answer: Answer
    var body: some View {
        AnswerView(answer, media: MediaPolicy(hosts: ["cdn.example.com"])) { action in
            // .ask, .submit, .quiz, .vote, .state: the app decides what happens
        }
    }
}

// as the model's text arrives
answer.push(chunk)
answer.finish()
```

Your own components go in as `components: ["ProductCard": { props in AnyView(MyCard(props)) }]`
with their packs as `Answer(custom:)` (docs/custom-components.md).

## A conversation with an agent

```swift
let chat = AgentConversation(url: URL(string: "https://example.com/agent")!)
AgentView(chat)
_ = await chat.send("Plan a weekend in Lisbon")
```

Any agent that speaks AG-UI 1.0; docs/agui.md has the rest.

## What it loads and sends

Pictures come only from your hosts (`MediaPolicy(hosts:)`); video and audio
are made when the reader presses play; embeds open in the browser. Maps
are MapKit's, so their tiles come from Apple, and a place given only by
its address is found with Apple's geocoder. The SDK
sends nothing of its own anywhere and never runs model text.
docs/security.md has the detail.

## Tests

```sh
MACOS_ONLY=1 bash sdk/swift/build-core.sh && cd sdk/swift && swift test
```
