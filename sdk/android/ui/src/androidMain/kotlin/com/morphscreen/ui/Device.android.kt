// The device pack on Android: MapLibre with tiles from the app's own map provider (places
// geocoded on the device), CameraX capture and the photo picker, ML Kit's code
// scanner (Google Play services shows the camera, no permission needed), the
// fused location provider, and the document picker.

package com.morphscreen.ui

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Geocoder
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.morphscreen.core.UINode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.graphics.luminance
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import org.json.JSONObject
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.Point
import java.io.File

/** A MapLibre style of the provider's raster tiles. */
private fun tileStyle(src: TileSource): String {
    val source = JSONObject().put("type", "raster").put("tiles", org.json.JSONArray().put(src.url)).put("tileSize", 256).put("maxzoom", src.maxZoom)
    return JSONObject().put("version", 8).put("sources", JSONObject().put("tiles", source)).put("layers", org.json.JSONArray().put(JSONObject().put("id", "tiles").put("type", "raster").put("source", "tiles"))).toString()
}

/** Google's sessions, by key and settings: a session lasts two weeks; one is made again a day before it ends. */
private val googleSessions = mutableMapOf<String, Pair<String, Long>>()

private fun googleSession(m: MapTiles.Google): String {
    val k = listOf(m.key, m.mapType, m.language, m.region).joinToString("|")
    googleSessions[k]?.let { (s, until) -> if (System.currentTimeMillis() < until - 86_400_000) return s }
    val body = JSONObject().put("mapType", m.mapType).put("language", m.language).put("region", m.region)
    if (m.mapType == "terrain") body.put("layerTypes", org.json.JSONArray().put("layerRoadmap"))
    val c = URL("https://tile.googleapis.com/v1/createSession?key=" + URLEncoder.encode(m.key, "UTF-8")).openConnection() as HttpURLConnection
    c.requestMethod = "POST"
    c.doOutput = true
    c.setRequestProperty("Content-Type", "application/json")
    c.outputStream.use { it.write(body.toString().toByteArray()) }
    val j = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
    val s = j.getString("session")
    googleSessions[k] = s to j.optString("expiry", "0").toLong() * 1000
    return s
}

/** Google's copyright line for what the map shows (its viewport call). */
private fun googleCopyright(m: MapTiles.Google, session: String, zoom: Int, north: Double, south: Double, east: Double, west: Double): String {
    val q = listOf("session" to session, "key" to m.key, "zoom" to "$zoom", "north" to "$north", "south" to "$south", "east" to "$east", "west" to "$west")
        .joinToString("&") { (k, v) -> k + "=" + URLEncoder.encode(v, "UTF-8") }
    val c = URL("https://tile.googleapis.com/tile/v1/viewport?$q").openConnection() as HttpURLConnection
    return JSONObject(c.inputStream.bufferedReader().use { it.readText() }).optString("copyright")
}

@Composable
internal actual fun MapBlock(node: UINode) {
    val context = LocalContext.current
    val uri = LocalUriHandler.current
    val c = colors
    var list by remember(node.id) { mutableStateOf(places(node)) }
    // Places with only an address are found on the device, off the main thread.
    LaunchedEffect(node.id, node.closed) {
        if (!node.closed || !Geocoder.isPresent()) return@LaunchedEffect
        val geocoder = Geocoder(context)
        val out = list.toMutableList()
        for ((i, p) in out.withIndex()) {
            if (p.lat != null) continue
            val query = listOf(p.name, p.address).filter { it.isNotEmpty() }.joinToString(", ")
            @Suppress("DEPRECATION")
            val hit = withContext(Dispatchers.IO) { runCatching { geocoder.getFromLocationName(query, 1)?.firstOrNull() }.getOrNull() }
            if (hit != null) {
                out[i] = p.copy(lat = hit.latitude, lng = hit.longitude)
                list = out.toList()
            }
        }
    }
    val pins = list.filter { it.lat != null && it.lng != null }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        node.attr("title")?.let { Txt(it, Type.callout.copy(fontWeight = FontWeight.SemiBold)) }
        // The map needs the app's map provider for its tiles; without one the places are a list.
        val maps = LocalMaps.current
        if (pins.isNotEmpty() && maps != null) PlacesMap(pins, node.flag("route"), Modifier.fillMaxWidth().height(260.dp).clip(RoundedCornerShape(Radius)), maps)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (p in list) {
                Column(Modifier.clickable(role = Role.Button) { uri.openUri(mapLink(p)) }) {
                    Txt("${p.index + 1}. ${p.name}", Type.body.copy(fontWeight = FontWeight.Medium))
                    if (p.address.isNotEmpty()) Txt(p.address, Type.footnote.copy(color = c.ink3))
                }
            }
        }
    }
}

@Composable
private fun PlacesMap(pins: List<Place>, route: Boolean, modifier: Modifier, maps: MapTiles) {
    val dark = colors.page.luminance() < 0.5f
    var src by remember(maps, dark) { mutableStateOf<TileSource?>(null) }
    var session by remember(maps) { mutableStateOf<String?>(null) }
    var credit by remember(maps, dark) { mutableStateOf("") }
    LaunchedEffect(maps, dark) {
        if (maps is MapTiles.Google) session = withContext(Dispatchers.IO) { runCatching { googleSession(maps) }.getOrNull() } ?: return@LaunchedEffect
        src = tileSource(maps, dark, session).also { credit = it.credit }
    }
    val tiles = src ?: return
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        PlacesMapView(pins, modifier, tiles, maps, session) { line -> credit = "Google Maps · $line" }
        Txt(credit, Type.caption.copy(color = colors.ink3))
    }
}

@Composable
private fun PlacesMapView(pins: List<Place>, modifier: Modifier, tiles: TileSource, maps: MapTiles, session: String?, onCopyright: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val scope = rememberCoroutineScope()
    val accent = colors.series[0]
    val map = remember {
        MapLibre.getInstance(context)
        MapView(context).apply { onCreate(null) }
    }
    DisposableEffect(lifecycle, map) {
        val observer = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> map.onStart()
                Lifecycle.Event.ON_RESUME -> map.onResume()
                Lifecycle.Event.ON_PAUSE -> map.onPause()
                Lifecycle.Event.ON_STOP -> map.onStop()
                else -> {}
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            map.onDestroy()
        }
    }
    AndroidView({ map }, modifier) { view ->
        view.getMapAsync { m ->
            // The provider's credit is shown under the map.
            m.uiSettings.isAttributionEnabled = false
            if (maps is MapTiles.Google && session != null) {
                m.addOnCameraIdleListener {
                    val b = m.projection.visibleRegion.latLngBounds
                    val z = m.cameraPosition.zoom.toInt()
                    scope.launch {
                        val line = withContext(Dispatchers.IO) { runCatching { googleCopyright(maps, session, z, b.latitudeNorth, b.latitudeSouth, b.longitudeEast, b.longitudeWest) }.getOrNull() }
                        if (!line.isNullOrEmpty()) onCopyright(line)
                    }
                }
            }
            m.setStyle(Style.Builder().fromJson(tileStyle(tiles))) { style ->
                val points = pins.map { Feature.fromGeometry(Point.fromLngLat(it.lng!!, it.lat!!)) }
                style.removeLayer("places")
                style.removeSource("places")
                style.addSource(GeoJsonSource("places", FeatureCollection.fromFeatures(points)))
                val argb = android.graphics.Color.argb((accent.alpha * 255).toInt(), (accent.red * 255).toInt(), (accent.green * 255).toInt(), (accent.blue * 255).toInt())
                style.addLayer(
                    CircleLayer("places", "places").withProperties(
                        PropertyFactory.circleRadius(7f),
                        PropertyFactory.circleColor(argb),
                        PropertyFactory.circleStrokeColor(android.graphics.Color.WHITE),
                        PropertyFactory.circleStrokeWidth(2f),
                    ),
                )
                val ll = pins.map { LatLng(it.lat!!, it.lng!!) }
                if (ll.size == 1) {
                    m.moveCamera(CameraUpdateFactory.newLatLngZoom(ll[0], 14.0))
                } else {
                    m.moveCamera(CameraUpdateFactory.newLatLngBounds(LatLngBounds.Builder().includes(ll).build(), 48))
                }
            }
        }
    }
}

@Composable
internal actual fun DeviceField(node: UINode) {
    val form = LocalForm.current
    val key = fieldName(node)
    Labeled(node.attr("label") ?: "", node.attr("hint"), node.flag("required")) {
        when (node.type) {
            "Camera" -> CameraField(node) { form?.values?.set(key, FieldValue.Files(it)) }
            "Scan" -> ScanField(node) { form?.values?.set(key, FieldValue.Text(it)) }
            "Location" -> LocationField(node) { form?.values?.set(key, it) }
            else -> FileField(node) { form?.values?.set(key, FieldValue.Files(it)) }
        }
    }
}

private fun granted(context: Context, permission: String) = ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

@Composable
private fun CameraField(node: UINode, onPhotos: (List<String>) -> Unit) {
    val context = LocalContext.current
    val multiple = node.flag("multiple")
    var photos by rememberSaveable(node.id) { mutableStateOf(listOf<String>()) }
    var capturing by remember { mutableStateOf(false) }
    fun add(uris: List<String>) {
        photos = if (multiple) photos + uris else uris.take(1)
        onPhotos(photos)
    }
    val pickOne = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { it?.let { u -> add(listOf(u.toString())) } }
    val pickMany = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { add(it.map(Uri::toString)) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) capturing = true }
    val hasCamera = context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (hasCamera) SecondaryButton("Take photo") { if (granted(context, Manifest.permission.CAMERA)) capturing = true else ask.launch(Manifest.permission.CAMERA) }
            SecondaryButton("Choose photo") {
                val request = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                if (multiple) pickMany.launch(request) else pickOne.launch(request)
            }
        }
        if (photos.isNotEmpty()) Txt("${photos.size} photo${if (photos.size == 1) "" else "s"} added", Type.footnote.copy(color = colors.ink3))
    }
    if (capturing) Capture(node.attr("facing") == "front", { capturing = false }) { add(listOf(it)) }
}

/** CameraX preview and capture in a dialog; the photo goes to the app's cache. */
@Composable
private fun Capture(front: Boolean, onClose: () -> Unit, onPhoto: (String) -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val capture = remember { ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build() }
    val preview = remember { PreviewView(context) }
    DisposableEffect(Unit) {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            val provider = future.get()
            val p = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
            provider.unbindAll()
            provider.bindToLifecycle(owner, if (front) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA, p, capture)
        }, ContextCompat.getMainExecutor(context))
        onDispose { runCatching { future.get().unbindAll() } }
    }
    Dialog(onClose, DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.Black)) {
            AndroidView({ preview }, Modifier.fillMaxSize())
            Row(Modifier.align(Alignment.BottomCenter).padding(24.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SecondaryButton("Cancel", onClose)
                SecondaryButton("Take photo") {
                    val file = File(context.cacheDir, "morphscreen-${System.currentTimeMillis()}.jpg")
                    capture.takePicture(
                        ImageCapture.OutputFileOptions.Builder(file).build(),
                        ContextCompat.getMainExecutor(context),
                        object : ImageCapture.OnImageSavedCallback {
                            override fun onImageSaved(r: ImageCapture.OutputFileResults) {
                                onPhoto(Uri.fromFile(file).toString())
                                onClose()
                            }

                            override fun onError(e: ImageCaptureException) = onClose()
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ScanField(node: UINode, onCode: (String) -> Unit) {
    val context = LocalContext.current
    var code by rememberSaveable(node.id) { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TextInput(code, { code = it; onCode(it) }, "Type the code")
        SecondaryButton("Scan") {
            val formats = when (node.attr("kind")) {
                "qr" -> intArrayOf(Barcode.FORMAT_QR_CODE)
                "barcode" -> intArrayOf(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E, Barcode.FORMAT_CODE_128, Barcode.FORMAT_CODE_39, Barcode.FORMAT_ITF)
                else -> intArrayOf(Barcode.FORMAT_ALL_FORMATS)
            }
            val options = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(formats.first(), *formats.drop(1).toIntArray()).build()
            GmsBarcodeScanning.getClient(context, options).startScan().addOnSuccessListener { b ->
                b.rawValue?.let { code = it; onCode(it) }
            }
        }
    }
}

@SuppressLint("MissingPermission")
@Composable
private fun LocationField(node: UINode, onValue: (FieldValue) -> Unit) {
    val context = LocalContext.current
    val precise = node.attr("precision") == "precise"
    var found by remember { mutableStateOf<FieldValue.Location?>(null) }
    var place by rememberSaveable(node.id) { mutableStateOf("") }
    fun locate() {
        val token = CancellationTokenSource()
        LocationServices.getFusedLocationProviderClient(context)
            .getCurrentLocation(if (precise) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY, token.token)
            .addOnSuccessListener { l -> l?.let { found = FieldValue.Location(it.latitude, it.longitude, it.accuracy.toDouble()).also(onValue) } }
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r -> if (r.values.any { it }) locate() }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SecondaryButton("Use my location") {
            val perm = if (precise) Manifest.permission.ACCESS_FINE_LOCATION else Manifest.permission.ACCESS_COARSE_LOCATION
            if (granted(context, perm)) locate() else ask.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
        }
        val f = found
        if (f != null) {
            Txt("%.5f, %.5f (±%.0f m)".format(f.lat, f.lng, f.accuracy), Type.footnote.copy(color = colors.ink3))
        } else {
            TextInput(place, { place = it; onValue(FieldValue.Text(it)) }, "Or a city or address")
        }
    }
}

@Composable
private fun FileField(node: UINode, onFiles: (List<String>) -> Unit) {
    var files by rememberSaveable(node.id) { mutableStateOf(listOf<String>()) }
    val types = options(node.attr("accept")).map {
        when (it.lowercase()) {
            "pdf" -> "application/pdf"
            "image", "images", "photo", "photos" -> "image/*"
            "video", "videos" -> "video/*"
            "audio" -> "audio/*"
            else -> if (it.contains('/')) it else "*/*"
        }
    }.ifEmpty { listOf("*/*") }.toTypedArray()
    val one = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { it?.let { u -> files = listOf(u.toString()); onFiles(files) } }
    val many = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { if (it.isNotEmpty()) { files = it.map(Uri::toString); onFiles(files) } }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SecondaryButton(if (files.isEmpty()) "Choose file" else "Choose again") { if (node.flag("multiple")) many.launch(types) else one.launch(types) }
        for (f in files) Txt(Uri.parse(f).lastPathSegment ?: f, Type.footnote.copy(color = colors.ink3))
    }
}
