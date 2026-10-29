// The core through JNI (rust/ffi, feature "jni"). Text crosses as UTF-8 bytes:
// JNI's own strings are modified UTF-8, which mangles emoji.

package com.morphscreen.core

internal object Native {
    init {
        // Android and most desktops: libmorphscreen on the library path. A desktop
        // app can point at the file instead with -Dmorphscreen.library=/path.
        val file = System.getProperty("morphscreen.library")
        if (file != null) System.load(file) else System.loadLibrary("morphscreen")
    }

    @JvmStatic external fun create(packs: ByteArray, custom: ByteArray): Long
    @JvmStatic external fun push(handle: Long, chunk: ByteArray): ByteArray?
    @JvmStatic external fun finish(handle: Long, truncated: Boolean): ByteArray?
    @JvmStatic external fun allowImages(handle: Long, hosts: ByteArray)
    @JvmStatic external fun html(handle: Long): ByteArray?
    @JvmStatic external fun nodeHtml(handle: Long, id: ByteArray): ByteArray?
    @JvmStatic external fun verdict(handle: Long, truncated: Boolean, reqs: Int, strict: Boolean): ByteArray?
    @JvmStatic external fun free(handle: Long)
    @JvmStatic external fun prompt(packs: ByteArray, custom: ByteArray): ByteArray?
    @JvmStatic external fun parseInline(text: ByteArray): ByteArray?
    @JvmStatic external fun lastError(): ByteArray
    @JvmStatic external fun agentNew(): Long
    @JvmStatic external fun agentFeed(handle: Long, bytes: ByteArray): ByteArray?
    @JvmStatic external fun agentCall(handle: Long, op: ByteArray, x: ByteArray, y: ByteArray, z: ByteArray): ByteArray?
    @JvmStatic external fun agentFree(handle: Long)
    @JvmStatic external fun actionMessage(action: ByteArray): ByteArray?

    fun text(b: ByteArray?): String = b?.decodeToString() ?: throw CoreException(lastError().decodeToString())
}

private fun customJson(custom: List<String>) = if (custom.isEmpty()) ByteArray(0) else "[${custom.joinToString(",")}]".encodeToByteArray()

actual class Session actual constructor(packs: List<String>, custom: List<String>) : AutoCloseable {
    private var handle = Native.create(packs.joinToString(",").encodeToByteArray(), customJson(custom))

    init {
        if (handle == 0L) throw CoreException(Native.lastError().decodeToString())
    }

    actual fun push(text: String): List<Op> = decodeOps(Native.text(Native.push(handle, text.encodeToByteArray())))

    actual fun finish(truncated: Boolean): List<Op> = decodeOps(Native.text(Native.finish(handle, truncated)))

    actual fun allowImages(hosts: List<String>) = Native.allowImages(handle, hosts.joinToString(",").encodeToByteArray())

    actual fun html(): String = Native.text(Native.html(handle))

    actual fun verdict(truncated: Boolean, reqs: Int, strict: Boolean): String = Native.text(Native.verdict(handle, truncated, reqs, strict))

    actual override fun close() {
        if (handle != 0L) Native.free(handle)
        handle = 0L
    }
}

actual fun systemPrompt(packs: List<String>, custom: List<String>): String =
    Native.text(Native.prompt(packs.joinToString(",").encodeToByteArray(), customJson(custom)))

actual fun parseInline(text: String): List<Span> = decodeSpansJson(Native.text(Native.parseInline(text.encodeToByteArray())))

actual class AgentCore actual constructor() : AutoCloseable {
    private var handle = Native.agentNew()

    actual fun feed(bytes: ByteArray): List<AgentUpdate> = decodeUpdates(Native.text(Native.agentFeed(handle, bytes)))

    actual fun call(op: String, a: String, b: String, c: String): String =
        Native.text(Native.agentCall(handle, op.encodeToByteArray(), a.encodeToByteArray(), b.encodeToByteArray(), c.encodeToByteArray()))

    actual override fun close() {
        if (handle != 0L) Native.agentFree(handle)
        handle = 0L
    }
}

actual fun actionMessage(actionJson: String): String = Native.text(Native.actionMessage(actionJson.encodeToByteArray()))
