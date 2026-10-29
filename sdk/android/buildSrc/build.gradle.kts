plugins {
    `kotlin-dsl`
}

repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
}

dependencies {
    implementation("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.21")
    implementation("org.jetbrains.kotlin:compose-compiler-gradle-plugin:2.4.21")
    implementation("org.jetbrains.compose:compose-gradle-plugin:1.12.1")
    implementation("com.android.tools.build:gradle:9.4.1")
}
