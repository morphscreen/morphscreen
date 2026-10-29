// Compose benchmark: the bench answers streamed into AnswerView offscreen on
// the JVM (desktop Compose, Skia), timing every chunk, plus screenshots.
//   cd sdk/android && ./gradlew :bench:run --args="../../bench/raw/nemotron-v03 ../../bench/compose/out"
plugins {
    kotlin("jvm")
    kotlin("plugin.compose")
    id("org.jetbrains.compose")
    application
}

kotlin { jvmToolchain(21) }

dependencies {
    implementation(project(":ui"))
    implementation(compose.desktop.currentOs)
    // For the layout checker (Check.kt): reads the semantics tree and text layout.
    @OptIn(org.jetbrains.compose.ExperimentalComposeLibrary::class)
    implementation(compose.uiTest)
}

application {
    mainClass.set("BenchKt")
    applicationDefaultJvmArgs = listOf(
        "-Djava.library.path=" + rootDir.resolve("../../rust/target.nosync/release").canonicalPath,
        "-Djava.awt.headless=true",
        "-Xmx2g",
    )
}

tasks.named<JavaExec>("run") { workingDir = projectDir }

// The layout checker: ./gradlew :bench:layoutCheck --args="../../bench/raw/<label> ..."
tasks.register<JavaExec>("layoutCheck") {
    group = "verification"
    mainClass.set("CheckKt")
    classpath = sourceSets["main"].runtimeClasspath
    jvmArgs = application.applicationDefaultJvmArgs.toList()
    workingDir = projectDir
}

// Every component sample as a PNG, for bench/look: ./gradlew :bench:look --args="<components.json> <outdir> <width> [theme] [ids]"
tasks.register<JavaExec>("look") {
    mainClass.set("LookKt")
    classpath = sourceSets["main"].runtimeClasspath
    jvmArgs = application.applicationDefaultJvmArgs.toList()
    workingDir = projectDir
}
