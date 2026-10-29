// The core: the Rust parser over JNI (libmorphscreen, built by build-core.sh)
// and the answer as a tree of observable nodes.
plugins {
    kotlin("multiplatform")
}

kotlin {
    jvmToolchain(21)
    jvm()
    compilerOptions { freeCompilerArgs.add("-Xexpect-actual-classes") }
    sourceSets {
        commonMain.dependencies {
            api(libs.compose.runtime)
            api(libs.serialization.json)
        }
        // The JNI binding is the same on the desktop JVM and on Android.
        jvmMain { kotlin.srcDir("src/jvmShared/kotlin") }
        jvmTest.dependencies {
            implementation(kotlin("test"))
        }
    }
}

android("com.morphscreen.core")

tasks.withType<Test>().configureEach {
    // The host build of the core, for tests on this machine.
    systemProperty("java.library.path", rootDir.resolve("../../rust/target.nosync/release").canonicalPath)
    systemProperty("morphscreen.raw", rootDir.resolve("../../bench/raw").canonicalPath)
}

kotlin.sourceSets.findByName("androidMain")?.kotlin?.srcDir("src/jvmShared/kotlin")
