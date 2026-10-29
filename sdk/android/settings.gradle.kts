// The Kotlin SDK: `core` (the Rust core over JNI, the op stream as an
// observable tree) and `ui` (Compose views). Both build for the JVM (desktop
// Compose, which is also how they're tested and benchmarked here) and, when
// an Android SDK is installed, for Android.
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "morphscreen-android"
include(":core", ":ui", ":bench")
project(":bench").projectDir = file("../../bench/compose")
