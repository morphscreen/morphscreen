import org.gradle.api.Project
import org.gradle.api.plugins.ExtensionAware
import java.io.File
import java.util.Properties

/** The Android SDK, from local.properties (sdk.dir) or ANDROID_HOME. */
fun Project.androidSdk(): File? {
    val props = rootProject.file("local.properties")
    val fromProps = if (props.exists()) Properties().apply { props.inputStream().use(::load) }.getProperty("sdk.dir") else null
    val dir = fromProps ?: providers.environmentVariable("ANDROID_HOME").orNull ?: return null
    return File(dir).takeIf { it.resolve("platforms").isDirectory }
}

/**
 * Adds the Android target when an Android SDK is installed; without one the
 * module still builds and tests for the JVM.
 */
fun Project.android(namespace: String, configure: (Any) -> Unit = {}) {
    if (androidSdk() == null) {
        logger.lifecycle("$path: no Android SDK (local.properties sdk.dir or ANDROID_HOME); building for the JVM only")
        return
    }
    pluginManager.apply("com.android.kotlin.multiplatform.library")
    val kotlin = extensions.getByName("kotlin") as ExtensionAware
    val target = kotlin.extensions.findByName("android") ?: kotlin.extensions.getByName("androidLibrary")
    target as com.android.build.api.dsl.KotlinMultiplatformAndroidLibraryTarget
    target.namespace = namespace
    target.compileSdk = 36
    target.minSdk = 24
    configure(target)
}
