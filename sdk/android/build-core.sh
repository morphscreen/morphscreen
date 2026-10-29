#!/usr/bin/env bash
# Builds the Rust core for the Kotlin SDK.
#   host: rust/target.nosync/release/libmorphscreen.{dylib,so} (JVM tests, bench)
#   android: core/src/androidMain/jniLibs/{arm64-v8a,x86_64}/libmorphscreen.so,
#            when the NDK is installed (ANDROID_NDK_HOME or $ANDROID_HOME/ndk/*)
#   bash sdk/android/build-core.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
rust="$here/../../rust"
(cd "$rust" && cargo build -q --release -p morphscreen-ffi --features jni)
echo "host: $(ls "$rust"/target.nosync/release/libmorphscreen.{dylib,so} 2>/dev/null)"

ndk="${ANDROID_NDK_HOME:-}"
if [ -z "$ndk" ] && [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME/ndk" ]; then
  ndk="$(ls -d "$ANDROID_HOME"/ndk/* | sort -V | tail -1)"
fi
if [ -z "$ndk" ]; then
  echo "android: no NDK (set ANDROID_NDK_HOME); static libraries only"
  for t in aarch64-linux-android x86_64-linux-android; do
    (cd "$rust" && cargo rustc -q --release -p morphscreen-ffi --features jni --target "$t" --crate-type staticlib)
  done
  exit 0
fi
bin="$(ls -d "$ndk"/toolchains/llvm/prebuilt/*/bin | head -1)"
for pair in "aarch64-linux-android:arm64-v8a" "x86_64-linux-android:x86_64"; do
  t="${pair%%:*}"; abi="${pair##*:}"
  linker="$bin/${t}24-clang"
  env_t="$(echo "$t" | tr 'a-z-' 'A-Z_')"
  (cd "$rust" && env "CARGO_TARGET_${env_t}_LINKER=$linker" cargo rustc -q --release -p morphscreen-ffi --features jni --target "$t" --crate-type cdylib)
  mkdir -p "$here/core/src/androidMain/jniLibs/$abi"
  cp "$rust/target.nosync/$t/release/libmorphscreen.so" "$here/core/src/androidMain/jniLibs/$abi/"
  "$bin/llvm-strip" "$here/core/src/androidMain/jniLibs/$abi/libmorphscreen.so"
done
ls -la "$here"/core/src/androidMain/jniLibs/*/libmorphscreen.so
