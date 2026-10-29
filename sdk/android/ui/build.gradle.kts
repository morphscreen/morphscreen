// Compose views over the core's tree. Common code is every component; the
// device pack has a desktop version (pickers and links) and an Android one
// (CameraX, ML Kit's code scanner, fused location, MapLibre, OpenDocument).
plugins {
    kotlin("multiplatform")
    kotlin("plugin.compose")
    id("org.jetbrains.compose")
}

kotlin {
    jvmToolchain(21)
    jvm()
    compilerOptions { freeCompilerArgs.add("-Xexpect-actual-classes") }
    sourceSets {
        commonMain.dependencies {
            api(project(":core"))
            implementation(libs.compose.foundation)
            implementation(libs.compose.ui)
            implementation(libs.compose.material3)
        }
        // IBM Plex lives in Android's res/font; the desktop build reads the same files as resources.
        jvmMain { resources.srcDir("src/androidMain/res") }
        jvmTest.dependencies {
            implementation(kotlin("test"))
            implementation(compose.desktop.currentOs)
            // Tapping charts in tests (ChartsTest).
            @OptIn(org.jetbrains.compose.ExperimentalComposeLibrary::class)
            implementation(compose.uiTest)
        }
    }
}

// res/font holds IBM Plex (SIL Open Font License; the license ships in resources/font).
android("com.morphscreen.ui") { (it as com.android.build.api.dsl.KotlinMultiplatformAndroidLibraryTarget).androidResources.enable = true }

kotlin.sourceSets.findByName("androidMain")?.dependencies {
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("androidx.camera:camera-camera2:1.5.1")
    implementation("androidx.camera:camera-lifecycle:1.5.1")
    implementation("androidx.camera:camera-view:1.5.1")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("org.maplibre.gl:android-sdk:11.13.5")
}

tasks.withType<Test>().configureEach {
    systemProperty("java.library.path", rootDir.resolve("../../rust/target.nosync/release").canonicalPath)
    // A running examples/langgraph agent, for AgentTest's live test.
    systemProperty("agentUrl", System.getenv("AGENT_URL") ?: "")
    systemProperty("morphscreen.raw", rootDir.resolve("../../bench/raw").canonicalPath)
}
