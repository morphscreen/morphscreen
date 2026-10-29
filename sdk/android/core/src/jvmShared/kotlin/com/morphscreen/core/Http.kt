// AG-UI's HTTP + SSE binding on the JVM and Android: the run input POSTed,
// the response body read as it arrives.

package com.morphscreen.core

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn

class HttpTransport(private val url: String) : AgentTransport {
    override fun post(body: String, headers: Map<String, String>): Flow<ByteArray> = flow {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.setRequestProperty("Accept", "text/event-stream")
            for ((k, v) in headers) c.setRequestProperty(k, v)
            c.outputStream.use { it.write(body.encodeToByteArray()) }
            if (c.responseCode != 200) throw AgentHttpException(c.responseCode)
            c.inputStream.use { input ->
                val buf = ByteArray(8192)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    if (n > 0) emit(buf.copyOf(n))
                }
            }
        } finally {
            c.disconnect()
        }
    }.flowOn(Dispatchers.IO)
}
