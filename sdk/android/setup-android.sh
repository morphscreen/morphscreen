#!/usr/bin/env bash
# One-time Android setup, then the Android build. Run it yourself: sdkmanager
# shows Google's Android SDK license and you accept it there.
#   bash sdk/android/setup-android.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
sdk="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

if ! command -v sdkmanager >/dev/null; then
  brew install --cask android-commandlinetools
fi
mkdir -p "$sdk"
sdkmanager --sdk_root="$sdk" --licenses
sdkmanager --sdk_root="$sdk" "platforms;android-36" "build-tools;36.0.0" "ndk;28.2.13676358"
echo "sdk.dir=$sdk" > "$here/local.properties"

export ANDROID_HOME="$sdk" ANDROID_NDK_HOME="$sdk/ndk/28.2.13676358"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 21)}"
bash "$here/build-core.sh"
cd "$here" && ./gradlew :core:assemble :ui:assemble
ls -la core/build/outputs/aar ui/build/outputs/aar 2>/dev/null || true
