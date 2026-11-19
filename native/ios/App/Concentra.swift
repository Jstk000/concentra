import SwiftUI
import WebKit
import DeviceActivity
import FamilyControls
import ManagedSettings

@main
struct ConcentraApp: App {
    var body: some Scene { WindowGroup { StudyView() } }
}

@MainActor
final class Focus: ObservableObject {
    @Published var selecting = false
    @Published var notice: String?
    @Published var selection: FamilyActivitySelection
    private var cleanup: Timer?
    init() {
        selection = (UserDefaults.standard.data(forKey: "apps").flatMap {
            try? JSONDecoder().decode(FamilyActivitySelection.self, from: $0)
        }) ?? FamilyActivitySelection()
        refresh()
    }
    func refresh() {
        cleanup?.invalidate()
        FocusStore.clearIfExpired()
        let delay = Double(FocusStore.deadline - FocusStore.now) / 1000
        if delay > 0 {
            cleanup = Timer.scheduledTimer(withTimeInterval: delay + 0.1, repeats: false) { _ in
                Task { @MainActor in FocusStore.clearIfExpired() }
            }
        }
    }
    func choose() async {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            selecting = true
        } catch {
            notice = "Para elegir apps, permite a Concentra usar Tiempo en pantalla en Configuración."
        }
    }
    func saveSelection() {
        do { UserDefaults.standard.set(try JSONEncoder().encode(selection), forKey: "apps") }
        catch { notice = "No se pudo guardar la selección." }
    }
    func command(_ command: String) -> String {
        FocusStore.clearIfExpired()
        if command == "status" { return String(FocusStore.deadline) }
        guard FocusStore.deadline <= FocusStore.now else { return "Ya tienes un bloque protegido en este iPhone." }
        if command == "choose" { Task { await choose() }; return "OK" }
        guard command.hasPrefix("start:"), let minutes = Int(command.dropFirst(6)), (15...180).contains(minutes) else {
            return "Para bloquear apps en iPhone, elige entre 15 y 180 minutos."
        }
        guard AuthorizationCenter.shared.authorizationStatus == .approved,
              !selection.applicationTokens.isEmpty || !selection.categoryTokens.isEmpty || !selection.webDomainTokens.isEmpty else {
            return "Primero abre Bloqueo y avisos, concede el permiso y elige tus apps."
        }
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: FocusStore.group) != nil else {
            return "La firma de esta versión no permite guardar el bloqueo compartido."
        }
        let start = Date(timeIntervalSince1970: floor(Date().timeIntervalSince1970))
        let finish = start.addingTimeInterval(TimeInterval(minutes * 60))
        let deadline = Int64(finish.timeIntervalSince1970 * 1000)
        let calendar = Calendar.current
        let parts: Set<Calendar.Component> = [.year,.month,.day,.hour,.minute,.second]
        let schedule = DeviceActivitySchedule(intervalStart: calendar.dateComponents(parts, from: start),
            intervalEnd: calendar.dateComponents(parts, from: finish), repeats: false)
        let center = DeviceActivityCenter()
        center.stopMonitoring(center.activities)
        do { try center.startMonitoring(DeviceActivityName(String(deadline)), during: schedule) }
        catch { return "Tiempo en pantalla no pudo programar este bloque. Revisa el permiso y la duración." }
        FocusStore.shared.set(NSNumber(value: deadline), forKey: FocusStore.deadlineKey)
        let store = FocusStore.settings
        store.shield.applications = selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
        store.shield.webDomains = selection.webDomainTokens
        refresh()
        return String(deadline)
    }
}

struct StudyView: View {
    @StateObject private var focus = Focus()
    @Environment(\.scenePhase) private var phase
    var body: some View {
        StudyWeb(focus: focus)
            .familyActivityPicker(isPresented: $focus.selecting, selection: $focus.selection)
            .onChange(of: focus.selection) { _ in focus.saveSelection() }
            .onChange(of: phase) { state in if state == .active { focus.refresh() } }
            .alert("Concentra", isPresented: Binding(get: { focus.notice != nil }, set: { if !$0 { focus.notice = nil } })) {
                Button("Entendido") { focus.notice = nil }
            } message: { Text(focus.notice ?? "") }
    }
}

struct StudyWeb: UIViewRepresentable {
    let focus: Focus
    static let home = URL(string: "https://jstk000.github.io/concentra/")!
    func makeCoordinator() -> Coordinator { Coordinator(focus) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.applicationNameForUserAgent = "ConcentraNative/1"
        let web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = context.coordinator
        web.navigationDelegate = context.coordinator
        web.load(URLRequest(url: Self.home))
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {}
    @MainActor final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
        let focus: Focus
        init(_ focus: Focus) { self.focus = focus }
        func trusted(_ url: URL?) -> Bool {
            guard let url else { return false }
            return url.scheme == "https" && url.host == "jstk000.github.io" && (url.port == nil || url.port == 443)
                && ["/concentra", "/concentra/", "/concentra/index.html"].contains(url.path)
        }
        func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
            guard prompt == "concentra-device-v1", frame.isMainFrame, trusted(frame.request.url), trusted(webView.url) else {
                completionHandler(nil); return
            }
            completionHandler(focus.command(defaultText ?? ""))
        }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if action.targetFrame?.isMainFrame == false || trusted(action.request.url) { decisionHandler(.allow); return }
            decisionHandler(.cancel)
            if action.navigationType == .linkActivated, let url = action.request.url, url.scheme == "https" {
                UIApplication.shared.open(url)
            }
        }
        func webView(_ web: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            let alert = UIAlertController(title: "No se pudo cargar Concentra", message: "Revisa la conexión y vuelve a intentar.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Reintentar", style: .default) { _ in web.load(URLRequest(url: StudyWeb.home)) })
            web.window?.rootViewController?.present(alert, animated: true)
        }
    }
}
