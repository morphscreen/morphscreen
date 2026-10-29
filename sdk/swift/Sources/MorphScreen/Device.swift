// The device pack, natively: MapKit (places geocoded on the device), the
// camera and photo library, VisionKit's live scanner, a one-time location
// button, and the file importer. Nothing runs until the user taps.

import CoreLocation
import MapKit
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers
#if os(iOS)
import CoreLocationUI
import Vision
import VisionKit
#endif

struct Place: Identifiable {
    let id: Int
    let name: String
    let address: String
    var coordinate: CLLocationCoordinate2D?
}

struct MapBlock: View {
    let node: UINode
    @State private var places: [Place] = []
    @State private var position: MapCameraPosition = .automatic

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let t = node.attr("title") { Text(t).font(.subheadline.weight(.semibold)) }
            let pinned = places.filter { $0.coordinate != nil }
            if !pinned.isEmpty {
                Map(position: $position) {
                    ForEach(pinned) { p in Marker("\(p.id + 1). \(p.name)", coordinate: p.coordinate!) }
                    if node.flag("route"), pinned.count > 1 {
                        MapPolyline(coordinates: pinned.compactMap(\.coordinate)).stroke(Theme.series[0], style: StrokeStyle(lineWidth: 3, dash: [6, 4]))
                    }
                }
                .frame(height: 260)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
            }
            VStack(alignment: .leading, spacing: 6) {
                ForEach(places) { p in
                    Button { open(p) } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("\(p.id + 1). \(p.name)").fontWeight(.medium)
                            if !p.address.isEmpty { Text(p.address).font(.footnote).foregroundColor(Theme.ink3) }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .task(id: node.closed) { await load() }
    }

    private func load() async {
        guard case let .table(columns, rows) = node.data else { return }
        let head = columns.map { $0.lowercased() }
        func col(_ f: (String) -> Bool) -> Int? { head.indices.first { $0 > 0 && f(head[$0]) } }
        let lat = col { $0.hasPrefix("lat") }, lng = col { $0.hasPrefix("lng") || $0.hasPrefix("lon") }
        let addr = col { $0.contains("address") || $0.contains("location") || $0.contains("where") }
        var out: [Place] = rows.enumerated().map { i, r in
            var p = Place(id: i, name: r.first ?? "", address: addr.flatMap { $0 < r.count ? r[$0] : nil } ?? "")
            if let la = lat, let lo = lng, la < r.count, lo < r.count, let a = Double(r[la]), let b = Double(r[lo]), abs(a) <= 90, abs(b) <= 180 {
                p.coordinate = CLLocationCoordinate2D(latitude: a, longitude: b)
            }
            return p
        }
        show(out)
        // Places with only an address are found on the device.
        for i in out.indices where out[i].coordinate == nil {
            let query = [out[i].name, out[i].address].filter { !$0.isEmpty }.joined(separator: ", ")
            if let found = try? await CLGeocoder().geocodeAddressString(query).first?.location?.coordinate {
                out[i].coordinate = found
                show(out)
            }
        }
    }

    /// One pin gets a neighbourhood around it, not a single building.
    private func show(_ list: [Place]) {
        places = list
        let pins = list.compactMap(\.coordinate)
        position = pins.count == 1 ? .region(MKCoordinateRegion(center: pins[0], latitudinalMeters: 3000, longitudinalMeters: 3000)) : .automatic
    }

    private func open(_ p: Place) {
        let item: MKMapItem
        if let c = p.coordinate {
            item = MKMapItem(placemark: MKPlacemark(coordinate: c))
        } else {
            return
        }
        item.name = p.name
        item.openInMaps()
    }
}

struct DeviceField: View {
    let node: UINode
    @Environment(FormState.self) private var form: FormState?
    @State private var photos: [PhotosPickerItem] = []
    @State private var picked: [Data] = []
    @State private var code = ""
    @State private var place = ""
    @State private var located: CLLocation?
    @State private var importing = false
    @State private var files: [URL] = []
    @State private var scanning = false
    @State private var camera = false
    @State private var locator = Locator()

    private var key: String { fieldName(node) }

    var body: some View {
        let label = node.attr("label") ?? ""
        Labeled(label: label, hint: node.attr("hint"), required: node.flag("required")) {
            switch node.type {
            case "Camera": cameraField
            case "Scan": scanField
            case "Location": locationField
            default: fileField
            }
        }
    }

    // A photo from the library, or the camera where there is one.
    private var cameraField: some View {
        VStack(alignment: .leading, spacing: Tokens.s2) {
            HStack(spacing: Tokens.s2) {
                #if os(iOS)
                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button("Take photo") { camera = true }.buttonStyle(Secondary())
                }
                #endif
                PhotosPicker(selection: $photos, maxSelectionCount: node.flag("multiple") ? 10 : 1, matching: .images) {
                    Text("Choose photo").modifier(SecondaryLabel())
                }
                .buttonStyle(.plain)
            }
            if !picked.isEmpty { Text("\(picked.count) photo\(picked.count == 1 ? "" : "s") added").font(.footnote).foregroundColor(Theme.ink3) }
        }
        .onChange(of: photos) {
            Task {
                var out: [Data] = []
                for p in photos { if let d = try? await p.loadTransferable(type: Data.self) { out.append(d) } }
                picked = out
                form?.values[key] = .photos(out)
            }
        }
        #if os(iOS)
        .sheet(isPresented: $camera) {
            CameraPicker { data in
                picked.append(data)
                form?.values[key] = .photos(picked)
            }
        }
        #endif
    }

    private var scanField: some View {
        HStack(spacing: Tokens.s2) {
            TextField("Type the code", text: $code).textFieldStyle(.plain).modifier(FieldStyle())
            #if os(iOS)
            if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                Button("Scan") { scanning = true }.buttonStyle(Secondary())
            }
            #endif
        }
        .onChange(of: code) { form?.values[key] = .text(code) }
        #if os(iOS)
        .sheet(isPresented: $scanning) {
            Scanner(kind: node.attr("kind") ?? "any") { value in
                code = value
                scanning = false
            }
        }
        #endif
    }

    private var locationField: some View {
        VStack(alignment: .leading, spacing: Tokens.s2) {
            #if os(iOS)
            LocationButton(.shareCurrentLocation) { locator.request(precise: node.attr("precision") == "precise") }
                .labelStyle(.titleAndIcon)
                .symbolVariant(.fill)
                .foregroundColor(Theme.surface)
                .tint(Theme.ink)
                .clipShape(RoundedRectangle(cornerRadius: Theme.radius))
            #else
            Button("Use my location") { locator.request(precise: node.attr("precision") == "precise") }.buttonStyle(Secondary())
            #endif
            if let loc = locator.location {
                Text(String(format: "%.5f, %.5f (±%.0f m)", loc.coordinate.latitude, loc.coordinate.longitude, loc.horizontalAccuracy))
                    .font(.footnote).monospacedDigit().foregroundColor(Theme.ink3)
            } else {
                TextField("Or a city or address", text: $place).textFieldStyle(.plain).modifier(FieldStyle())
            }
        }
        .onChange(of: locator.location) {
            if let l = locator.location { form?.values[key] = .location(lat: l.coordinate.latitude, lng: l.coordinate.longitude, accuracy: l.horizontalAccuracy) }
        }
        .onChange(of: place) { if locator.location == nil { form?.values[key] = .text(place) } }
    }

    private var fileField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button(files.isEmpty ? "Choose file" : "Choose again") { importing = true }.buttonStyle(Secondary())
            ForEach(files, id: \.self) { Text($0.lastPathComponent).font(.footnote).foregroundColor(Theme.ink3) }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: acceptTypes, allowsMultipleSelection: node.flag("multiple")) { result in
            if case let .success(urls) = result {
                files = urls
                form?.values[key] = .files(urls)
            }
        }
    }

    private var acceptTypes: [UTType] {
        let list = options(node.attr("accept"))
        let types = list.compactMap { t -> UTType? in
            switch t.lowercased() {
            case "pdf": return .pdf
            case "image", "images", "photo", "photos": return .image
            case "video", "videos": return .movie
            case "audio": return .audio
            default: return t.hasPrefix(".") ? UTType(filenameExtension: String(t.dropFirst())) : UTType(mimeType: t)
            }
        }
        return types.isEmpty ? [.item] : types
    }
}

/// One-time location, asked for when the user taps.
@Observable
final class Locator: NSObject, CLLocationManagerDelegate {
    var location: CLLocation?
    @ObservationIgnored private let manager = CLLocationManager()

    func request(precise: Bool) {
        manager.delegate = self
        manager.desiredAccuracy = precise ? kCLLocationAccuracyBest : kCLLocationAccuracyKilometer
        #if os(iOS)
        manager.requestWhenInUseAuthorization()
        #endif
        manager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) { location = locations.last }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}

struct Secondary: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.modifier(SecondaryLabel()).opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct SecondaryLabel: ViewModifier {
    func body(content: Content) -> some View {
        content.font(.footnote.weight(.semibold)).foregroundColor(Theme.ink)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 10).padding(.vertical, 6).frame(minHeight: 30)
            .overlay(RoundedRectangle(cornerRadius: Theme.radius).stroke(Theme.line2))
    }
}

#if os(iOS)
/// The system camera.
struct CameraPicker: UIViewControllerRepresentable {
    let done: (Data) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .camera
        p.delegate = context.coordinator
        return p
    }

    func updateUIViewController(_ c: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: done) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let done: (Data) -> Void
        init(done: @escaping (Data) -> Void) { self.done = done }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage, let d = img.jpegData(compressionQuality: 0.85) { done(d) }
            picker.dismiss(animated: true)
        }
    }
}

/// VisionKit's live scanner: barcodes, QR codes, or both.
struct Scanner: UIViewControllerRepresentable {
    let kind: String
    let found: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let symbologies: [VNBarcodeSymbology] = kind == "qr" ? [.qr] : kind == "barcode" ? [.ean13, .ean8, .upce, .code128, .code39, .itf14] : []
        let s = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: symbologies)], isHighlightingEnabled: true)
        s.delegate = context.coordinator
        try? s.startScanning()
        return s
    }

    func updateUIViewController(_ c: DataScannerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(found: found) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let found: (String) -> Void
        init(found: @escaping (String) -> Void) { self.found = found }
        func dataScanner(_ s: DataScannerViewController, didAdd items: [RecognizedItem], allItems: [RecognizedItem]) {
            for case let .barcode(b) in items { if let v = b.payloadStringValue { s.stopScanning(); found(v); return } }
        }
    }
}
#endif
