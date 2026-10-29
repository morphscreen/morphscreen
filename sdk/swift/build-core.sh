#!/usr/bin/env bash
# Builds the Rust core as MorphScreenCore.xcframework (iOS device, iOS simulator,
# macOS arm64 + x86_64) for the Swift package. Output stays out of git.
#   bash sdk/swift/build-core.sh
# MACOS_ONLY=1 builds just this Mac's slice, enough for `swift test` (CI).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
rust="$here/../../rust"
out="$here/Frameworks.nosync"
targets=(aarch64-apple-ios aarch64-apple-ios-sim aarch64-apple-darwin x86_64-apple-darwin)
[ "${MACOS_ONLY:-}" = 1 ] && targets=("$(uname -m | sed 's/arm64/aarch64/')-apple-darwin")
for t in "${targets[@]}"; do
  (cd "$rust" && IPHONEOS_DEPLOYMENT_TARGET=17.0 MACOSX_DEPLOYMENT_TARGET=14.0 cargo build -q --release -p morphscreen-ffi --target "$t")
done
lib() { echo "$rust/target.nosync/$1/release/libmorphscreen.a"; }
rm -rf "$out" && mkdir -p "$out/macos" "$out/headers"
# The C header comes from the FFI crate; the module map is ours.
cp "$rust/ffi/include/morphscreen.h" "$here/include/module.modulemap" "$out/headers/"
if [ "${MACOS_ONLY:-}" = 1 ]; then
  cp "$(lib "${targets[0]}")" "$out/macos/libmorphscreen.a"
  xcodebuild -create-xcframework -library "$out/macos/libmorphscreen.a" -headers "$out/headers" -output "$out/MorphScreenCore.xcframework" >/dev/null
  exit 0
fi
lipo -create "$(lib aarch64-apple-darwin)" "$(lib x86_64-apple-darwin)" -output "$out/macos/libmorphscreen.a"
for f in "$(lib aarch64-apple-ios)" "$(lib aarch64-apple-ios-sim)" "$out/macos/libmorphscreen.a"; do strip -S -x "$f" 2>/dev/null || true; done
xcodebuild -create-xcframework \
  -library "$(lib aarch64-apple-ios)" -headers "$out/headers" \
  -library "$(lib aarch64-apple-ios-sim)" -headers "$out/headers" \
  -library "$out/macos/libmorphscreen.a" -headers "$out/headers" \
  -output "$out/MorphScreenCore.xcframework" >/dev/null
du -sh "$out/MorphScreenCore.xcframework"/*/libmorphscreen.a
