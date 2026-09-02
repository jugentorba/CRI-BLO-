import Foundation
import Capacitor
import UIKit
import WebKit

private struct BrowserRecord: Codable {
    let url: String
    let title: String
    let visitedAt: TimeInterval
}

private struct BrowserBackup: Codable {
    let version: Int
    let updatedAt: TimeInterval
    let lastURL: String?
    let tabs: [String]
    let history: [BrowserRecord]
    let favorites: [BrowserRecord]
}

@objc(CRIBrowserPlugin)
public class CRIBrowserPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CRIBrowserPlugin"
    public let jsName = "CRIBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restoreState", returnType: CAPPluginReturnPromise)
    ]

    // Keep the WKWebView/controller alive while the user returns to CRI-BLO.
    // This preserves the exact page DOM, map position, tabs and login session.
    private var activeBrowser: CRIBrowserViewController?

    @objc func getState(_ call: CAPPluginCall) {
        call.resolve(["stateJson": CRIBrowserViewController.exportPersistentState()])
    }

    @objc func restoreState(_ call: CAPPluginCall) {
        guard let raw = call.getString("stateJson") else {
            call.reject("État navigateur manquant.")
            return
        }
        do {
            let applied = try CRIBrowserViewController.restorePersistentState(raw)
            call.resolve(["applied": applied])
        } catch {
            call.reject("Sauvegarde navigateur invalide.")
        }
    }

    @objc func open(_ call: CAPPluginCall) {
        let requested = call.getString("url") ?? CRIBrowserViewController.pinnedOrangeURL.absoluteString
        let resumeLast = call.getBool("resumeLast") ?? false
        let startString = resumeLast
            ? (UserDefaults.standard.string(forKey: CRIBrowserViewController.lastURLKey) ?? requested)
            : requested

        guard let url = URL(string: startString),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http" else {
            call.reject("Adresse web invalide.")
            return
        }

        let longPressCompatibility = call.getBool("longPressCompatibility") ?? true

        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("Navigateur indisponible.")
                return
            }
            guard let host = self.bridge?.viewController else {
                call.reject("Vue native indisponible.")
                return
            }

            // Re-present the same live browser after the user minimized it.
            // We deliberately do not recreate WKWebView, so GeoReseaux remains
            // on exactly the same map/page and authenticated cookies stay active.
            if let browser = self.activeBrowser {
                if browser.presentingViewController != nil || host.presentedViewController === browser {
                    call.resolve([
                        "url": browser.currentURLString,
                        "title": browser.currentPageTitle,
                        "reused": true
                    ])
                    return
                }
                browser.modalPresentationStyle = .fullScreen
                host.present(browser, animated: true) {
                    call.resolve([
                        "url": browser.currentURLString,
                        "title": browser.currentPageTitle,
                        "reused": true
                    ])
                }
                return
            }

            let browser = CRIBrowserViewController(
                startURL: url,
                longPressCompatibility: longPressCompatibility
            )
            browser.modalPresentationStyle = .fullScreen
            browser.onPermanentClose = { [weak self] _, _ in
                self?.activeBrowser = nil
            }
            self.activeBrowser = browser
            host.present(browser, animated: true) {
                call.resolve([
                    "url": browser.currentURLString,
                    "title": browser.currentPageTitle,
                    "reused": false
                ])
            }
        }
    }
}

private final class CRIBrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, UIGestureRecognizerDelegate, UITextFieldDelegate {
    static let lastURLKey = "criblo.browser.native.lastURL"
    private static let historyKey = "criblo.browser.native.history"
    private static let favoritesKey = "criblo.browser.native.favorites"
    private static let tabsKey = "criblo.browser.native.tabs"
    private static let stateUpdatedAtKey = "criblo.browser.native.updatedAt"

    // Permanent Orange work favorite. The target is the stable authenticated
    // Orange MOBI2 entry point; SiteMinder will generate a fresh login URL when
    // a session is not already present.
    static let pinnedOrangeURL = URL(string: "https://mobi-prod.orange.fr/mobi2/web/home/?codeContexte=MOBI2")!

    static func exportPersistentState() -> String {
        let defaults = UserDefaults.standard
        func records(_ key: String) -> [BrowserRecord] {
            guard let data = defaults.data(forKey: key) else { return [] }
            return (try? JSONDecoder().decode([BrowserRecord].self, from: data)) ?? []
        }
        let backup = BrowserBackup(
            version: 1,
            updatedAt: defaults.double(forKey: stateUpdatedAtKey),
            lastURL: defaults.string(forKey: lastURLKey),
            tabs: defaults.stringArray(forKey: tabsKey) ?? [],
            history: records(historyKey),
            favorites: records(favoritesKey)
        )
        guard let data = try? JSONEncoder().encode(backup) else { return "{}" }
        return String(data: data, encoding: .utf8) ?? "{}"
    }

    static func restorePersistentState(_ raw: String) throws -> Bool {
        guard let data = raw.data(using: .utf8) else { throw NSError(domain: "CRIBrowser", code: 1) }
        let backup = try JSONDecoder().decode(BrowserBackup.self, from: data)
        guard backup.version == 1 else { throw NSError(domain: "CRIBrowser", code: 2) }
        let defaults = UserDefaults.standard
        let localUpdatedAt = defaults.double(forKey: stateUpdatedAtKey)
        guard backup.updatedAt > localUpdatedAt else { return false }

        let validTabs = backup.tabs.filter { value in
            if value == "about:blank" { return true }
            guard let url = URL(string: value), let scheme = url.scheme?.lowercased() else { return false }
            return scheme == "http" || scheme == "https"
        }
        defaults.set(validTabs.isEmpty ? [pinnedOrangeURL.absoluteString] : validTabs, forKey: tabsKey)

        if let last = backup.lastURL,
           let url = URL(string: last),
           let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https" {
            defaults.set(last, forKey: lastURLKey)
        }
        if let historyData = try? JSONEncoder().encode(Array(backup.history.prefix(100))) {
            defaults.set(historyData, forKey: historyKey)
        }
        if let favoriteData = try? JSONEncoder().encode(Array(backup.favorites.prefix(100))) {
            defaults.set(favoriteData, forKey: favoritesKey)
        }
        defaults.set(backup.updatedAt, forKey: stateUpdatedAtKey)
        return true
    }

    private static func touchPersistentState() {
        defaultsSetUpdatedAt(Date().timeIntervalSince1970 * 1000)
    }

    private static func defaultsSetUpdatedAt(_ value: TimeInterval) {
        UserDefaults.standard.set(value, forKey: stateUpdatedAtKey)
    }

    let startURL: URL
    let longPressCompatibility: Bool
    var onPermanentClose: ((URL?, String?) -> Void)?

    var currentURLString: String { webView?.url?.absoluteString ?? startURL.absoluteString }
    var currentPageTitle: String { webView?.title ?? "" }

    private var webView: WKWebView!
    private let chrome = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterial))
    private let addressField = UITextField()
    private var completed = false
    private var tabURLs: [String] = []
    private var currentTabIndex = 0
    private var usesAndroidGeoUserAgent = false
    private var geoLongPressRecognizer: UILongPressGestureRecognizer?
    private var prioritizedLongPressRecognizers = Set<ObjectIdentifier>()
    private var nativeLongPressTouchesReceived = 0
    private var nativeLongPressShouldBeginCount = 0
    private var nativeLongPressBeganCount = 0
    private var nativeLongPressChangedCount = 0
    private var nativeLongPressEndedCount = 0
    private var nativeLongPressCancelledCount = 0
    private var nativeLongPressFailedCount = 0
    private var nativeLongPressPriorityLinks = 0
    private var nativeCompetingLongPressClasses: [String] = []
    private var nativeLongPressLastTransition = "none"
    private var nativeLongPressLastPoint = "none"

    private static let androidGeoUserAgent = "Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"

    private static var safariUserAgent: String {
        let os = UIDevice.current.systemVersion.replacingOccurrences(of: ".", with: "_")
        let major = UIDevice.current.systemVersion.split(separator: ".").first.map(String.init) ?? "18"
        return "Mozilla/5.0 (iPhone; CPU iPhone OS \(os) like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/\(major).0 Mobile/15E148 Safari/604.1"
    }

    private lazy var backButton = makeToolbarButton("chevron.backward", action: #selector(goBack))
    private lazy var forwardButton = makeToolbarButton("chevron.forward", action: #selector(goForward))
    private lazy var refreshButton = makeToolbarButton("arrow.clockwise", action: #selector(refreshPage))
    private lazy var minimizeButton = makeToolbarButton("chevron.down.circle", action: #selector(minimizeBrowser))
    private lazy var favoriteButton = makeToolbarButton("star", action: #selector(showBookmarks))
    private lazy var tabsButton = makeToolbarButton("square.on.square", action: #selector(showTabs))
    private lazy var moreButton = makeToolbarButton("ellipsis.circle", action: #selector(showMore))

    init(startURL: URL, longPressCompatibility: Bool) {
        self.startURL = startURL
        self.longPressCompatibility = longPressCompatibility
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences.preferredContentMode = .recommended

        // WKWebView participates in iOS Password AutoFill. This script only adds
        // standards-based autocomplete hints where a login page omitted them;
        // CRI-BLO never reads, exports or stores the credential itself.
        configuration.userContentController.addUserScript(
            WKUserScript(
                source: Self.autofillCompatibilityScript,
                injectionTime: .atDocumentStart,
                forMainFrameOnly: false
            )
        )

        if longPressCompatibility {
            // GeoReseaux has historically exposed its map hold tools on Android
            // but not iOS Safari. Keep the HTTP user-agent Safari-compatible for
            // Orange auth, while presenting Android-style feature signals only
            // to GeoReseaux/MOBI page JavaScript at document start.
            configuration.userContentController.addUserScript(
                WKUserScript(
                    source: Self.geoReseauxPlatformCompatibilityScript,
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: false
                )
            )
            configuration.userContentController.addUserScript(
                WKUserScript(
                    source: Self.longPressBridgeScript,
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: false
                )
            )
        }

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.delaysContentTouches = false
        webView.allowsLinkPreview = false
        webView.translatesAutoresizingMaskIntoConstraints = false

        // Keep the actual iPhone/Safari identity for Orange authentication so
        // WebKit and the login page stay on the same path as Safari Password
        // AutoFill. GeoReseaux Android compatibility is injected only inside
        // the GIS page; it no longer changes the Orange login HTTP identity.
        webView.customUserAgent = Self.safariUserAgent

        if longPressCompatibility {
            // WKWebView owns several internal long-press recognizers. Chromium's
            // iOS WebView integration gives its app recognizer priority over the
            // system context-menu recognizer; do the same here so GeoReseaux's
            // 600 ms hold cannot be stolen before CRI-BLO sees it.
            let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleNativeLongPress(_:)))
            longPress.minimumPressDuration = 0.60
            // A real finger moves a few points even during an intentional hold.
            // Keep map pans responsive while avoiding false failures from jitter.
            longPress.allowableMovement = 28
            longPress.numberOfTouchesRequired = 1
            longPress.numberOfTapsRequired = 0
            longPress.cancelsTouchesInView = false
            longPress.delaysTouchesBegan = false
            longPress.delaysTouchesEnded = false
            longPress.delegate = self
            geoLongPressRecognizer = longPress
            webView.addGestureRecognizer(longPress)
            prioritizeGeoLongPressRecognizer()
            DispatchQueue.main.async { [weak self] in
                self?.prioritizeGeoLongPressRecognizer()
            }
        }

        view.addSubview(webView)
        view.addSubview(chrome)
        configureBottomChrome()

        let stack = chrome.contentView.subviews.first!
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: chrome.topAnchor),

            chrome.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            chrome.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            chrome.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            chrome.topAnchor.constraint(equalTo: stack.topAnchor, constant: -8)
        ])

        loadTabs()
        updateChrome()
        loadURL(startURL)
    }

    private func configureBottomChrome() {
        chrome.translatesAutoresizingMaskIntoConstraints = false

        addressField.delegate = self
        addressField.translatesAutoresizingMaskIntoConstraints = false
        addressField.backgroundColor = UIColor.secondarySystemBackground.withAlphaComponent(0.96)
        addressField.textColor = .label
        addressField.tintColor = .systemOrange
        addressField.font = .systemFont(ofSize: 14, weight: .medium)
        addressField.placeholder = "Rechercher ou saisir une adresse"
        addressField.autocapitalizationType = .none
        addressField.autocorrectionType = .no
        addressField.spellCheckingType = .no
        addressField.keyboardType = .URL
        addressField.returnKeyType = .go
        addressField.clearButtonMode = .whileEditing
        addressField.layer.cornerRadius = 16
        addressField.layer.masksToBounds = true
        addressField.setContentHuggingPriority(.defaultLow, for: .horizontal)
        addressField.heightAnchor.constraint(equalToConstant: 38).isActive = true

        let leftSpacer = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 1))
        addressField.leftView = leftSpacer
        addressField.leftViewMode = .always

        minimizeButton.accessibilityLabel = "Retour à CRI-BLO"
        minimizeButton.accessibilityHint = "Masque le navigateur sans fermer la page"
        let controls = UIStackView(arrangedSubviews: [backButton, forwardButton, refreshButton, minimizeButton, favoriteButton, tabsButton, moreButton])
        controls.axis = .horizontal
        controls.distribution = .fillEqually
        controls.alignment = .center
        controls.spacing = 2
        controls.heightAnchor.constraint(equalToConstant: 40).isActive = true

        let stack = UIStackView(arrangedSubviews: [addressField, controls])
        stack.axis = .vertical
        stack.spacing = 5
        stack.translatesAutoresizingMaskIntoConstraints = false
        chrome.contentView.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: chrome.contentView.leadingAnchor, constant: 10),
            stack.trailingAnchor.constraint(equalTo: chrome.contentView.trailingAnchor, constant: -10),
            stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -5)
        ])
    }

    private func makeToolbarButton(_ symbol: String, action: Selector) -> UIButton {
        let button = UIButton(type: .system)
        button.tintColor = .label
        button.setImage(UIImage(systemName: symbol), for: .normal)
        button.addTarget(self, action: action, for: .touchUpInside)
        button.heightAnchor.constraint(equalToConstant: 40).isActive = true
        return button
    }

    private func loadTabs() {
        let stored = UserDefaults.standard.stringArray(forKey: Self.tabsKey) ?? []
        tabURLs = stored.filter { value in
            guard let url = URL(string: value), let scheme = url.scheme?.lowercased() else { return false }
            return scheme == "https" || scheme == "http" || value == "about:blank"
        }
        if tabURLs.isEmpty { tabURLs = [startURL.absoluteString] }
        if let index = tabURLs.firstIndex(of: startURL.absoluteString) {
            currentTabIndex = index
        } else {
            tabURLs.append(startURL.absoluteString)
            currentTabIndex = tabURLs.count - 1
        }
        persistTabs()
    }

    private func persistTabs() {
        UserDefaults.standard.set(tabURLs, forKey: Self.tabsKey)
        Self.touchPersistentState()
    }

    private func loadURL(_ url: URL) {
        if url.absoluteString == "about:blank" {
            webView.loadHTMLString(Self.newTabHTML, baseURL: Self.pinnedOrangeURL)
            return
        }
        var request = URLRequest(url: url)
        request.setValue("fr-FR,fr;q=0.9,en;q=0.8", forHTTPHeaderField: "Accept-Language")
        webView.load(request)
    }

    private func requiresAndroidGeoUserAgent(_ url: URL) -> Bool {
        guard longPressCompatibility else { return false }
        let host = (url.host ?? "").lowercased()
        return host == "sigreseaux.orange.fr"
            || host.contains("georeseaux")
            || host.contains("geo-reseaux")
    }

    private func reload(_ request: URLRequest, withAndroidGeoUserAgent enabled: Bool) {
        usesAndroidGeoUserAgent = enabled
        webView.customUserAgent = enabled ? Self.androidGeoUserAgent : Self.safariUserAgent
        var updated = request
        updated.setValue("fr-FR,fr;q=0.9,en;q=0.8", forHTTPHeaderField: "Accept-Language")
        DispatchQueue.main.async { [weak self] in
            self?.webView.load(updated)
        }
    }

    private func loadAddress(_ raw: String) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let resolved: String
        if trimmed.lowercased().hasPrefix("http://") || trimmed.lowercased().hasPrefix("https://") {
            resolved = trimmed
        } else if trimmed.contains(".") && !trimmed.contains(" ") {
            resolved = "https://\(trimmed)"
        } else {
            resolved = "https://www.google.com/search?q=\(trimmed.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? trimmed)"
        }
        guard let url = URL(string: resolved) else { return }
        loadURL(url)
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        textField.resignFirstResponder()
        loadAddress(textField.text ?? "")
        return true
    }

    func textFieldDidBeginEditing(_ textField: UITextField) {
        textField.text = webView.url?.absoluteString ?? ""
        DispatchQueue.main.async { textField.selectAll(nil) }
    }

    func textFieldDidEndEditing(_ textField: UITextField) {
        updateChrome()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // A dismissal can be a Safari-style minimize back to CRI-BLO. Persist
        // metadata, but intentionally keep this controller and WKWebView alive.
        persistSessionSnapshot()
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        if gestureRecognizer === geoLongPressRecognizer {
            nativeLongPressTouchesReceived += 1
            let point = touch.location(in: webView)
            nativeLongPressLastPoint = "\(Int(point.x.rounded())),\(Int(point.y.rounded()))"
            nativeLongPressLastTransition = "touch-received"
        }
        return true
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        if gestureRecognizer === geoLongPressRecognizer {
            nativeLongPressShouldBeginCount += 1
            nativeLongPressLastTransition = "should-begin"
        }
        return true
    }

    private func allGestureRecognizers(in root: UIView) -> [UIGestureRecognizer] {
        var result = root.gestureRecognizers ?? []
        for child in root.subviews {
            result.append(contentsOf: allGestureRecognizers(in: child))
        }
        return result
    }

    private func prioritizeGeoLongPressRecognizer() {
        guard let ours = geoLongPressRecognizer, webView != nil else { return }
        var classes = Set(nativeCompetingLongPressClasses)
        for recognizer in allGestureRecognizers(in: webView) {
            guard recognizer !== ours, recognizer is UILongPressGestureRecognizer else { continue }
            classes.insert(NSStringFromClass(type(of: recognizer)))
            let identifier = ObjectIdentifier(recognizer)
            if prioritizedLongPressRecognizers.insert(identifier).inserted {
                // The competing WK recognizer must wait until CRI-BLO's hold
                // either recognizes or fails. This mirrors Chromium's iOS
                // context-menu recognizer ordering without calling private API.
                recognizer.require(toFail: ours)
                nativeLongPressPriorityLinks += 1
            }
        }
        nativeCompetingLongPressClasses = Array(classes).sorted()
    }

    private func gestureStateName(_ state: UIGestureRecognizer.State) -> String {
        switch state {
        case .possible: return "possible"
        case .began: return "began"
        case .changed: return "changed"
        case .ended: return "ended"
        case .cancelled: return "cancelled"
        case .failed: return "failed"
        @unknown default: return "unknown"
        }
    }

    private func nativeGeoDiagnosticText() -> String {
        let state = geoLongPressRecognizer.map { gestureStateName($0.state) } ?? "missing"
        let competitors = nativeCompetingLongPressClasses.isEmpty
            ? "none"
            : nativeCompetingLongPressClasses.joined(separator: ", ")
        return [
            "Native UIKit touches received: \(nativeLongPressTouchesReceived)",
            "Native UIKit shouldBegin: \(nativeLongPressShouldBeginCount)",
            "Native UIKit callbacks: began=\(nativeLongPressBeganCount) changed=\(nativeLongPressChangedCount) ended=\(nativeLongPressEndedCount) cancelled=\(nativeLongPressCancelledCount) failed=\(nativeLongPressFailedCount)",
            "Native UIKit last transition: \(nativeLongPressLastTransition)",
            "Native UIKit last point: \(nativeLongPressLastPoint)",
            "Native UIKit recognizer state: \(state)",
            "Native competing long-press recognizers: \(nativeCompetingLongPressClasses.count)",
            "Native long-press classes: \(competitors)",
            "Native priority links: \(nativeLongPressPriorityLinks)",
            "Native config: 0.60s / 28pt / simultaneous"
        ].joined(separator: "\n")
    }

    @objc private func goBack() {
        if webView.canGoBack { webView.goBack() }
    }

    @objc private func goForward() {
        if webView.canGoForward { webView.goForward() }
    }

    @objc private func refreshPage() {
        webView.reload()
    }

    @objc private func minimizeBrowser() {
        persistSessionSnapshot()
        dismiss(animated: true)
    }

    @objc private func showBookmarks() {
        let controller = UIAlertController(title: "Favoris", message: nil, preferredStyle: .actionSheet)
        controller.addAction(UIAlertAction(title: "Orange GeoReseaux", style: .default) { [weak self] _ in
            self?.loadURL(Self.pinnedOrangeURL)
        })

        if let current = webView.url, current.scheme?.hasPrefix("http") == true {
            let favorite = loadRecords(key: Self.favoritesKey).contains { $0.url == current.absoluteString }
            controller.addAction(UIAlertAction(title: favorite ? "Retirer ce favori" : "Ajouter cette page aux favoris", style: .default) { [weak self] _ in
                self?.toggleFavorite(current)
            })
        }

        for record in loadRecords(key: Self.favoritesKey).prefix(12) {
            controller.addAction(UIAlertAction(title: "★ \(record.title)", style: .default) { [weak self] _ in
                guard let url = URL(string: record.url) else { return }
                self?.loadURL(url)
            })
        }
        controller.addAction(UIAlertAction(title: "Annuler", style: .cancel))
        presentActionSheet(controller, source: favoriteButton)
    }

    @objc private func showTabs() {
        let controller = UIAlertController(title: "Onglets (\(tabURLs.count))", message: nil, preferredStyle: .actionSheet)
        for (index, raw) in tabURLs.enumerated() {
            let title = displayHost(raw)
            controller.addAction(UIAlertAction(title: index == currentTabIndex ? "✓ \(title)" : title, style: .default) { [weak self] _ in
                self?.switchToTab(index)
            })
        }
        controller.addAction(UIAlertAction(title: "Nouvel onglet", style: .default) { [weak self] _ in
            self?.newTab()
        })
        controller.addAction(UIAlertAction(title: "Fermer l'onglet actuel", style: .destructive) { [weak self] _ in
            self?.closeCurrentTab()
        })
        controller.addAction(UIAlertAction(title: "Annuler", style: .cancel))
        presentActionSheet(controller, source: tabsButton)
    }

    @objc private func showMore() {
        let controller = UIAlertController(title: "CRI-BLO Browser", message: nil, preferredStyle: .actionSheet)
        controller.addAction(UIAlertAction(title: "Retour à CRI-BLO — garder le navigateur ouvert", style: .default) { [weak self] _ in
            self?.minimizeBrowser()
        })
        controller.addAction(UIAlertAction(title: "Historique", style: .default) { [weak self] _ in
            self?.showHistory()
        })
        controller.addAction(UIAlertAction(title: "Partager", style: .default) { [weak self] _ in
            self?.shareCurrentPage()
        })
        controller.addAction(UIAlertAction(title: "Diagnostic GeoReseaux", style: .default) { [weak self] _ in
            self?.showGeoDiagnostics()
        })
        controller.addAction(UIAlertAction(title: "Ouvrir dans Safari", style: .default) { [weak self] _ in
            guard let url = self?.webView.url else { return }
            UIApplication.shared.open(url)
        })
        controller.addAction(UIAlertAction(title: "Fermer complètement le navigateur", style: .destructive) { [weak self] _ in
            self?.closePermanently()
        })
        controller.addAction(UIAlertAction(title: "Annuler", style: .cancel))
        presentActionSheet(controller, source: moreButton)
    }

    private func showGeoDiagnostics() {
        let script = "window.__cribloGeoDiagnosticsText ? window.__cribloGeoDiagnosticsText() : 'Diagnostic GeoReseaux indisponible sur cette page.'"
        webView.evaluateJavaScript(script) { [weak self] result, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                let jsMessage = (result as? String) ?? "Aucune information de diagnostic disponible."
                self.prioritizeGeoLongPressRecognizer()
                let message = jsMessage + "\n\n" + self.nativeGeoDiagnosticText()
                let controller = UIAlertController(title: "Diagnostic GeoReseaux", message: message, preferredStyle: .alert)
                controller.addAction(UIAlertAction(title: "OK", style: .default))
                self.present(controller, animated: true)
            }
        }
    }

    private func showHistory() {
        let history = loadRecords(key: Self.historyKey)
        let controller = UIAlertController(title: "Historique", message: history.isEmpty ? "Aucune page enregistrée." : nil, preferredStyle: .actionSheet)
        for record in history.prefix(15) {
            controller.addAction(UIAlertAction(title: record.title, style: .default) { [weak self] _ in
                guard let url = URL(string: record.url) else { return }
                self?.loadURL(url)
            })
        }
        if !history.isEmpty {
            controller.addAction(UIAlertAction(title: "Effacer l'historique", style: .destructive) { _ in
                UserDefaults.standard.removeObject(forKey: Self.historyKey)
                Self.touchPersistentState()
            })
        }
        controller.addAction(UIAlertAction(title: "Annuler", style: .cancel))
        presentActionSheet(controller, source: moreButton)
    }

    private func shareCurrentPage() {
        guard let url = webView.url else { return }
        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let popover = controller.popoverPresentationController {
            popover.sourceView = moreButton
            popover.sourceRect = moreButton.bounds
        }
        present(controller, animated: true)
    }

    private func presentActionSheet(_ controller: UIAlertController, source: UIView) {
        if let popover = controller.popoverPresentationController {
            popover.sourceView = source
            popover.sourceRect = source.bounds
        }
        present(controller, animated: true)
    }

    private func switchToTab(_ index: Int) {
        guard tabURLs.indices.contains(index) else { return }
        currentTabIndex = index
        guard let url = URL(string: tabURLs[index]) else { return }
        loadURL(url)
        persistTabs()
    }

    private func newTab() {
        tabURLs.append("about:blank")
        currentTabIndex = tabURLs.count - 1
        persistTabs()
        webView.loadHTMLString(Self.newTabHTML, baseURL: Self.pinnedOrangeURL)
        addressField.text = ""
        addressField.becomeFirstResponder()
        updateChrome()
    }

    private func closeCurrentTab() {
        if tabURLs.count <= 1 {
            tabURLs = ["about:blank"]
            currentTabIndex = 0
            webView.loadHTMLString(Self.newTabHTML, baseURL: Self.pinnedOrangeURL)
        } else {
            tabURLs.remove(at: currentTabIndex)
            currentTabIndex = min(currentTabIndex, tabURLs.count - 1)
            if let url = URL(string: tabURLs[currentTabIndex]) { loadURL(url) }
        }
        persistTabs()
        updateChrome()
    }

    private func toggleFavorite(_ url: URL) {
        var favorites = loadRecords(key: Self.favoritesKey)
        if let index = favorites.firstIndex(where: { $0.url == url.absoluteString }) {
            favorites.remove(at: index)
        } else {
            let title = webView.title?.trimmingCharacters(in: .whitespacesAndNewlines)
            let record = BrowserRecord(url: url.absoluteString, title: (title?.isEmpty == false ? title! : displayHost(url.absoluteString)), visitedAt: Date().timeIntervalSince1970)
            favorites.insert(record, at: 0)
        }
        saveRecords(favorites, key: Self.favoritesKey)
        updateChrome()
    }

    private func recordHistory() {
        guard let url = webView.url,
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { return }
        let raw = url.absoluteString
        let title = webView.title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let record = BrowserRecord(url: raw, title: (title?.isEmpty == false ? title! : displayHost(raw)), visitedAt: Date().timeIntervalSince1970)
        var history = loadRecords(key: Self.historyKey).filter { $0.url != raw }
        history.insert(record, at: 0)
        saveRecords(Array(history.prefix(100)), key: Self.historyKey)
        UserDefaults.standard.set(raw, forKey: Self.lastURLKey)

        if tabURLs.indices.contains(currentTabIndex) {
            tabURLs[currentTabIndex] = raw
            persistTabs()
        }
    }

    private func loadRecords(key: String) -> [BrowserRecord] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([BrowserRecord].self, from: data)) ?? []
    }

    private func saveRecords(_ records: [BrowserRecord], key: String) {
        guard let data = try? JSONEncoder().encode(records) else { return }
        UserDefaults.standard.set(data, forKey: key)
        Self.touchPersistentState()
    }

    private func updateChrome() {
        guard isViewLoaded else { return }
        backButton.isEnabled = webView?.canGoBack ?? false
        forwardButton.isEnabled = webView?.canGoForward ?? false
        tabsButton.accessibilityLabel = "Onglets, \(tabURLs.count)"

        if !addressField.isFirstResponder {
            addressField.text = webView?.url.map { displayHost($0.absoluteString) } ?? ""
        }
        let current = webView?.url?.absoluteString ?? ""
        let isFavorite = loadRecords(key: Self.favoritesKey).contains { $0.url == current }
        favoriteButton.setImage(UIImage(systemName: isFavorite ? "star.fill" : "star"), for: .normal)
        favoriteButton.tintColor = isFavorite ? .systemOrange : .label
    }

    private func displayHost(_ raw: String) -> String {
        if raw == "about:blank" { return "Nouvel onglet" }
        guard let url = URL(string: raw) else { return raw }
        return url.host?.replacingOccurrences(of: "www.", with: "") ?? raw
    }

    private func persistSessionSnapshot() {
        if let url = webView?.url, url.scheme?.hasPrefix("http") == true {
            UserDefaults.standard.set(url.absoluteString, forKey: Self.lastURLKey)
            Self.touchPersistentState()
        }
        persistTabs()
    }

    private func closePermanently() {
        finishOnce()
        dismiss(animated: true)
    }

    private func finishOnce() {
        guard !completed else { return }
        completed = true
        persistSessionSnapshot()
        onPermanentClose?(webView?.url ?? startURL, webView?.title)
        onPermanentClose = nil
    }

    @objc private func handleNativeLongPress(_ recognizer: UILongPressGestureRecognizer) {
        switch recognizer.state {
        case .began:
            nativeLongPressBeganCount += 1
            nativeLongPressLastTransition = "began"
        case .changed:
            nativeLongPressChangedCount += 1
            nativeLongPressLastTransition = "changed"
        case .ended:
            nativeLongPressEndedCount += 1
            nativeLongPressLastTransition = "ended"
        case .cancelled:
            nativeLongPressCancelledCount += 1
            nativeLongPressLastTransition = "cancelled"
        case .failed:
            nativeLongPressFailedCount += 1
            nativeLongPressLastTransition = "failed"
        default:
            break
        }

        guard recognizer.state == .began,
              webView.bounds.width > 0,
              webView.bounds.height > 0 else { return }

        let location = recognizer.location(in: webView)
        nativeLongPressLastPoint = "\(Int(location.x.rounded())),\(Int(location.y.rounded()))"
        let rx = max(0, min(1, location.x / webView.bounds.width))
        let ry = max(0, min(1, location.y / webView.bounds.height))

        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        // Native provides immediate haptic feedback and a backup arm signal.
        // The page-side trusted touchstart timer is the primary 600 ms arm path;
        // this avoids WKWebView evaluateJavaScript delivery latency.
        let script = "window.__cribloNativeWrappedContextLongPress && window.__cribloNativeWrappedContextLongPress(\(rx), \(ry));"
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        updateChrome()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let networkMode = usesAndroidGeoUserAgent ? "true" : "false"
        webView.evaluateJavaScript("window.__cribloGeoHTTPAndroid = \(networkMode);", completionHandler: nil)
        prioritizeGeoLongPressRecognizer()
        DispatchQueue.main.async { [weak self] in self?.prioritizeGeoLongPressRecognizer() }
        recordHistory()
        updateChrome()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        updateChrome()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        updateChrome()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased() else {
            decisionHandler(.allow)
            return
        }

        if scheme == "http" || scheme == "https" {
            // Keep the Orange authentication pages on a genuine Safari identity,
            // then reload only the authenticated GeoReseaux application with an
            // Android HTTP identity. The Android working trace and the iOS v14
            // diagnostic show the same trusted gesture reaching the canvas; the
            // remaining difference is the server-selected map implementation.
            let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
            let wantsAndroid = requiresAndroidGeoUserAgent(url)
            if isMainFrame && wantsAndroid != usesAndroidGeoUserAgent {
                reload(navigationAction.request, withAndroidGeoUserAgent: wantsAndroid)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
            return
        }

        if scheme == "about" || scheme == "blob" || scheme == "data" {
            decisionHandler(.allow)
            return
        }

        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }


    private static let newTabHTML = #"""
    <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f5f7;color:#111;margin:0;padding:32px 20px;text-align:center}
    .card{display:block;margin:32px auto 0;max-width:320px;padding:18px;border-radius:18px;background:#fff;color:#111;text-decoration:none;box-shadow:0 4px 20px rgba(0,0,0,.08)}
    .o{width:48px;height:48px;margin:auto;background:#ff7900;color:#fff;border-radius:12px;display:grid;place-items:center;font-weight:800}
    </style></head><body><h2>CRI-BLO Browser</h2><p>Favoris</p><a class="card" href="https://mobi-prod.orange.fr/mobi2/web/home/?codeContexte=MOBI2"><div class="o">O</div><strong>Orange GeoReseaux</strong></a></body></html>
    """#


    private static let geoReseauxPlatformCompatibilityScript = #"""
    (function () {
      try {
        var host = String(location.hostname || '').toLowerCase();
        var isTarget = host === 'sigreseaux.orange.fr' || host === 'mobi-prod.orange.fr' || host.indexOf('georeseaux') >= 0 || host.indexOf('geo-reseaux') >= 0;
        if (!isTarget) return;
        var androidUA = 'Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';
        try { Object.defineProperty(navigator, 'userAgent', { configurable: true, get: function(){ return androidUA; } }); } catch (_) {}
        try { Object.defineProperty(navigator, 'platform', { configurable: true, get: function(){ return 'Linux armv8l'; } }); } catch (_) {}
        try { Object.defineProperty(navigator, 'vendor', { configurable: true, get: function(){ return 'Google Inc.'; } }); } catch (_) {}
        try { Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: function(){ return 5; } }); } catch (_) {}
        try { Object.defineProperty(navigator, 'appVersion', { configurable: true, get: function(){ return androidUA.replace(/^Mozilla\//, ''); } }); } catch (_) {}
        try {
          if (!navigator.userAgentData) {
            Object.defineProperty(navigator, 'userAgentData', { configurable: true, get: function(){ return {
              mobile: true,
              platform: 'Android',
              brands: [{ brand: 'Chromium', version: '139' }, { brand: 'Google Chrome', version: '139' }],
              getHighEntropyValues: function(){ return Promise.resolve({ platform: 'Android', platformVersion: '16', mobile: true, model: 'Pixel 9 Pro' }); }
            }; }});
          }
        } catch (_) {}
        try { if (!window.chrome) window.chrome = { runtime: {} }; } catch (_) {}
        window.__cribloGeoReseauxAndroidCompat = true;
      } catch (_) {}
    })();
    """#

    private static let autofillCompatibilityScript = #"""
    (function () {
      if (window.__cribloAutofillInstalled) return;
      window.__cribloAutofillInstalled = true;

      function textHint(input) {
        return [
          input && input.getAttribute && input.getAttribute('name'),
          input && input.getAttribute && input.getAttribute('id'),
          input && input.getAttribute && input.getAttribute('placeholder'),
          input && input.getAttribute && input.getAttribute('aria-label'),
          input && input.getAttribute && input.getAttribute('title')
        ].filter(Boolean).join(' ').toLowerCase();
      }

      function visible(input) {
        try {
          var r = input.getBoundingClientRect();
          var s = window.getComputedStyle(input);
          return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
        } catch (_) { return true; }
      }

      function isUsernameCandidate(input) {
        if (!input || input.tagName !== 'INPUT') return false;
        var type = String(input.getAttribute('type') || 'text').toLowerCase();
        if (!/^(text|email|tel|url|search)$/.test(type)) return false;
        var hint = textHint(input);
        if (/otp|one.?time|verification|vérification|security.?code|code.?securite|code.?sécurité/.test(hint)) return false;
        return visible(input);
      }

      function mark(input, forcedKind) {
        if (!input || input.nodeType !== 1 || input.tagName !== 'INPUT') return;
        var type = String(input.getAttribute('type') || 'text').toLowerCase();
        var hint = textHint(input);
        var current = String(input.getAttribute('autocomplete') || '').trim().toLowerCase();

        if (forcedKind === 'username') {
          input.setAttribute('autocomplete', 'username');
          input.setAttribute('autocapitalize', 'none');
          input.setAttribute('spellcheck', 'false');
          return;
        }

        if (type === 'password') {
          // Respect an explicit sign-up/change-password field, but override
          // autocomplete=off on ordinary login forms so iOS can show the saved
          // credential directly in the QuickType bar.
          var isNew = current === 'new-password' || /new|create|confirm|nouveau|confirmer|signup|register|change.?password|modifier/.test(hint);
          input.setAttribute('autocomplete', isNew ? 'new-password' : 'current-password');
          return;
        }

        if (/otp|one.?time|verification|vérification|security.?code|code.?securite|code.?sécurité/.test(hint)) {
          input.setAttribute('autocomplete', 'one-time-code');
          return;
        }

        if (/user|username|login|email|e-mail|mail|identifiant|compte|account/.test(hint)) {
          mark(input, 'username');
        }
      }

      function pairLoginFields(root) {
        try {
          var scope = root && root.querySelectorAll ? root : document;
          var forms = [];
          if (scope.tagName === 'FORM') forms.push(scope);
          var nested = scope.querySelectorAll ? scope.querySelectorAll('form') : [];
          for (var f = 0; f < nested.length; f++) forms.push(nested[f]);
          if (!forms.length) forms = [document];

          for (var fi = 0; fi < forms.length; fi++) {
            var form = forms[fi];
            try { form.setAttribute && form.setAttribute('autocomplete', 'on'); } catch (_) {}
            var inputs = form.querySelectorAll ? Array.prototype.slice.call(form.querySelectorAll('input')) : [];
            for (var i = 0; i < inputs.length; i++) mark(inputs[i]);
            for (var p = 0; p < inputs.length; p++) {
              if (String(inputs[p].getAttribute('type') || '').toLowerCase() !== 'password') continue;
              mark(inputs[p]);
              // Apple specifically supports multipage username/password flows
              // when each page is explicitly tagged. Mark the nearest preceding
              // identifier field even when Orange did not label it clearly.
              for (var u = p - 1; u >= 0; u--) {
                if (isUsernameCandidate(inputs[u])) { mark(inputs[u], 'username'); break; }
              }
            }
          }
        } catch (_) {}
      }

      function scan(root) {
        try {
          if (root && root.matches && root.matches('input')) mark(root);
          var nodes = root && root.querySelectorAll ? root.querySelectorAll('input') : [];
          for (var i = 0; i < nodes.length; i++) mark(nodes[i]);
          pairLoginFields(root || document);
        } catch (_) {}
      }

      scan(document);
      document.addEventListener('focusin', function (event) {
        var target = event && event.target;
        if (!target || target.tagName !== 'INPUT') return;
        scan(target.form || document);
      }, true);

      try {
        new MutationObserver(function (changes) {
          for (var i = 0; i < changes.length; i++) {
            var added = changes[i].addedNodes || [];
            for (var j = 0; j < added.length; j++) scan(added[j]);
          }
        }).observe(document, { childList: true, subtree: true });
      } catch (_) {}
    })();
    """#

    private static let longPressBridgeScript = #"""
    (function () {
      if (window.__cribloLongPressInstalled) return;
      window.__cribloLongPressInstalled = true;


      // WebKit always exposes a JavaScript-created event as isTrusted=false.
      // Keep the browser's real event propagation instead of calling page
      // handlers one by one: contextmenu listeners are registered through a
      // transparent wrapper which presents only CRI-BLO's marked synthetic
      // hold event through the genuine touch's trusted facade. The underlying
      // PointerEvent still owns propagation, currentTarget, defaultPrevented,
      // once/signal handling and listener order.
      var __cribloCapturedListeners = new WeakMap();
      var __cribloListenerWrappers = new WeakMap();
      var __cribloSyntheticContextEvents = new WeakSet();
      var __cribloSyntheticContextFacades = new WeakMap();
      var __cribloSyntheticContextSources = new WeakMap();
      var __cribloOriginalAddEventListener = EventTarget.prototype.addEventListener;
      var __cribloOriginalRemoveEventListener = EventTarget.prototype.removeEventListener;

      // GeoReseaux is bundled, so the OpenLayers Map constructor is not exposed
      // as window.ol.Map. OpenLayers binds Map.handleBrowserEvent to the real Map
      // instance while constructing the viewport. Capture that one bind at
      // document-start, register the hidden Map, then restore bind immediately.
      var __cribloOriginalBind = Function.prototype.bind;
      var __cribloPatchedBind = null;
      var __cribloBindHookTimer = null;

      function looksLikeOpenLayersMap(value) {
        try {
          return !!value
            && typeof value.getViewport === 'function'
            && typeof value.getView === 'function'
            && typeof value.getCoordinateFromPixel === 'function'
            && typeof value.handleBrowserEvent === 'function';
        } catch (_) { return false; }
      }

      function restoreOpenLayersBindHook() {
        try {
          if (__cribloPatchedBind && Function.prototype.bind === __cribloPatchedBind) {
            Function.prototype.bind = __cribloOriginalBind;
          }
          if (__cribloBindHookTimer) clearTimeout(__cribloBindHookTimer);
        } catch (_) {}
        __cribloBindHookTimer = null;
      }

      function installOpenLayersBindHook() {
        try {
          if (__cribloPatchedBind) return;
          __cribloPatchedBind = function () {
            var bound = __cribloOriginalBind.apply(this, arguments);
            try {
              var thisArg = arguments.length ? arguments[0] : null;
              if (looksLikeOpenLayersMap(thisArg) && this === thisArg.handleBrowserEvent) {
                registerMapInstance(thisArg, 'OpenLayers-bound');
                restoreOpenLayersBindHook();
              }
            } catch (_) {}
            return bound;
          };
          Function.prototype.bind = __cribloPatchedBind;
          __cribloBindHookTimer = setTimeout(restoreOpenLayersBindHook, 30000);
        } catch (_) {}
      }

      installOpenLayersBindHook();

      function captureOption(options) {
        try {
          if (options === true) return true;
          return !!(options && typeof options === 'object' && options.capture === true);
        } catch (_) { return false; }
      }

      function syntheticContextFacade(event) {
        if (!event || !__cribloSyntheticContextEvents.has(event)) return event;
        var cached = __cribloSyntheticContextFacades.get(event);
        if (cached) return cached;
        // Bind each synthetic context event to the genuine iOS touch that
        // caused this hold. This survives touchend, which is important because
        // the measured Android event arrives only after the release/click tail.
        var source = __cribloSyntheticContextSources.get(event) || window.__cribloLastTrustedTouchStart || null;
        var sourceIsTrusted = !!(source && source.isTrusted);
        try {
          cached = new Proxy(event, {
            get: function (raw, prop, receiver) {
              try {
                if (typeof prop === 'string' && prop.indexOf('__criblo') !== 0) {
                  __cribloGeoDiag.eventProperties[prop] = (__cribloGeoDiag.eventProperties[prop] || 0) + 1;
                }
              } catch (_) {}
              if (prop === 'isTrusted') return sourceIsTrusted;
              if (prop === 'sourceCapabilities') return { firesTouchEvents: true };
              if (prop === 'which' && /^(mousedown|mouseup|click|contextmenu)$/.test(String(raw.type || ''))) return 1;
              if ((prop === 'originalEvent' || prop === 'nativeEvent' || prop === 'srcEvent') && sourceIsTrusted) return receiver;
              var value;
              try { value = Reflect.get(raw, prop, raw); } catch (_) { value = raw[prop]; }
              return typeof value === 'function' ? value.bind(raw) : value;
            }
          });
        } catch (_) {
          cached = event;
        }
        __cribloSyntheticContextFacades.set(event, cached);
        return cached;
      }

      function wrappedContextListener(target, listener, options) {
        var targetMap = __cribloListenerWrappers.get(target);
        if (!targetMap) {
          targetMap = new WeakMap();
          __cribloListenerWrappers.set(target, targetMap);
        }
        var entries = targetMap.get(listener);
        if (!entries) {
          entries = [];
          targetMap.set(listener, entries);
        }
        var capture = captureOption(options);
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].capture === capture) return entries[i].wrapper;
        }
        var wrapper = function (event) {
          var presented = syntheticContextFacade(event);
          if (presented !== event) {
            if (String(event.type || '').toLowerCase() === 'contextmenu') __cribloGeoDiag.wrappedContextCalls++;
            else __cribloGeoDiag.wrappedLifecycleCalls++;
          }
          if (typeof listener === 'function') return listener.call(this, presented);
          if (listener && typeof listener.handleEvent === 'function') return listener.handleEvent(presented);
        };
        entries.push({ capture: capture, wrapper: wrapper });
        return wrapper;
      }

      function existingContextWrapper(target, listener, options) {
        var targetMap = __cribloListenerWrappers.get(target);
        var entries = targetMap && targetMap.get(listener);
        var capture = captureOption(options);
        if (!entries) return null;
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].capture === capture) return entries[i].wrapper;
        }
        return null;
      }

      try {
        EventTarget.prototype.addEventListener = function (type, listener, options) {
          try {
            var name = String(type || '').toLowerCase();
            if (listener && /^(contextmenu|longpress|long-press|hold|press)$/.test(name)) {
              var list = __cribloCapturedListeners.get(this);
              if (!list) { list = []; __cribloCapturedListeners.set(this, list); }
              if (!list.some(function (entry) { return entry.type === name && entry.listener === listener; })) {
                list.push({ type: name, listener: listener, options: options });
              }
            }
            if (listener && /^(contextmenu|mousedown|mouseup|click|pointerdown|pointerup)$/.test(name)) {
              return __cribloOriginalAddEventListener.call(this, type, wrappedContextListener(this, listener, options), options);
            }
          } catch (_) {}
          return __cribloOriginalAddEventListener.apply(this, arguments);
        };
        EventTarget.prototype.removeEventListener = function (type, listener, options) {
          try {
            if (listener && /^(contextmenu|mousedown|mouseup|click|pointerdown|pointerup)$/.test(String(type || '').toLowerCase())) {
              var wrapper = existingContextWrapper(this, listener, options);
              if (wrapper) return __cribloOriginalRemoveEventListener.call(this, type, wrapper, options);
            }
          } catch (_) {}
          return __cribloOriginalRemoveEventListener.apply(this, arguments);
        };
      } catch (_) {}

      var __cribloGeoDiag = {
        capturedCalls: 0,
        semanticCalls: 0,
        capturedListeners: 0,
        engine: 'none',
        engineCalls: 0,
        mapDirectCalls: 0,
        mapFeatureHits: 0,
        mapRecovery: 'none',
        registry: [],
        lastTarget: '',
        lastResult: 'not-run',
        eventProperties: {},
        syntheticPointerDowns: 0,
        syntheticMouseDowns: 0,
        syntheticPointerUps: 0,
        syntheticMouseUps: 0,
        syntheticClicks: 0,
        releaseCompletions: 0,
        androidSequence: [],
        contextDispatches: 0,
        trustedContextmenus: 0,
        trustedContextPrevented: false,
        syntheticContextmenus: 0,
        syntheticContextPrevented: false,
        wrappedContextCalls: 0,
        wrappedLifecycleCalls: 0,
        nativeRecognizerFires: 0,
        nativeWaitsForTouchStart: 0,
        jsHoldArms: 0,
        nativeLateSuppressed: 0,
        touchToNativeMs: -1,
        nativeToTouchMs: -1,
        contextAfterTouchMs: -1,
        coordinateDelta: 'none',
        directTrustedHandlerFires: 0,
        directSourceTrusted: false,
        directTarget: 'none'
      };

      function traceAndroidEvent(name, trusted) {
        try {
          __cribloGeoDiag.androidSequence.push(String(name) + (trusted ? '*' : ''));
          while (__cribloGeoDiag.androidSequence.length > 16) __cribloGeoDiag.androidSequence.shift();
        } catch (_) {}
      }

      // Register actual map instances at construction time. Frameworks often
      // hide the map inside closures, so a later scan of window cannot find it.
      // The CRI-BLO bridge runs at document start, which lets us wrap the common
      // map constructors before GeoReseaux creates its map.
      var __cribloMapRegistry = [];
      function registerMapInstance(map, engine) {
        try {
          if (!map || __cribloMapRegistry.some(function (entry) { return entry.map === map; })) return map;
          __cribloMapRegistry.push({ map: map, engine: engine });
          __cribloGeoDiag.registry = __cribloMapRegistry.map(function (entry) { return entry.engine; });
          __cribloGeoDiag.mapRecovery = String(engine || 'unknown');
        } catch (_) {}
        return map;
      }

      function wrapConstructor(owner, key, engine) {
        try {
          if (!owner || !owner[key] || owner[key].__cribloWrapped) return;
          var Original = owner[key];
          if (typeof Original !== 'function') return;
          var Wrapped;
          if (typeof Proxy === 'function' && typeof Reflect === 'object' && Reflect.construct) {
            Wrapped = new Proxy(Original, {
              construct: function (target, args, newTarget) {
                return registerMapInstance(Reflect.construct(target, args, newTarget), engine);
              },
              apply: function (target, thisArg, args) {
                return registerMapInstance(Reflect.apply(target, thisArg, args), engine);
              }
            });
          } else {
            Wrapped = function () {
              var args = Array.prototype.slice.call(arguments);
              var Bound = Function.prototype.bind.apply(Original, [null].concat(args));
              return registerMapInstance(new Bound(), engine);
            };
            try { Wrapped.prototype = Original.prototype; } catch (_) {}
          }
          try { Object.defineProperty(Wrapped, '__cribloWrapped', { value: true }); } catch (_) { Wrapped.__cribloWrapped = true; }
          owner[key] = Wrapped;
        } catch (_) {}
      }

      function wrapLeafletFactory() {
        try {
          if (!window.L || typeof window.L.map !== 'function' || window.L.map.__cribloWrapped) return;
          var original = window.L.map;
          var wrapped = function () { return registerMapInstance(original.apply(this, arguments), 'Leaflet'); };
          try { Object.defineProperty(wrapped, '__cribloWrapped', { value: true }); } catch (_) { wrapped.__cribloWrapped = true; }
          window.L.map = wrapped;
        } catch (_) {}
      }

      function installMapHooks() {
        try { wrapLeafletFactory(); } catch (_) {}
        try { if (window.ol) wrapConstructor(window.ol, 'Map', 'OpenLayers'); } catch (_) {}
        try { if (window.mapboxgl) wrapConstructor(window.mapboxgl, 'Map', 'Mapbox'); } catch (_) {}
        try { if (window.maplibregl) wrapConstructor(window.maplibregl, 'Map', 'MapLibre'); } catch (_) {}
      }
      installMapHooks();
      // External map libraries execute before the next parser script. A capture
      // listener on SCRIPT load lets CRI-BLO wrap their constructors immediately
      // after the library defines them and before the following app bundle can
      // construct a map hidden inside a closure.
      var __cribloScriptLoadHook = function (event) {
        try {
          var target = event && event.target;
          if (target && String(target.tagName || '').toUpperCase() === 'SCRIPT') installMapHooks();
        } catch (_) {}
      };
      document.addEventListener('load', __cribloScriptLoadHook, true);
      var __cribloHookTicks = 0;
      var __cribloHookTimer = setInterval(function () {
        installMapHooks();
        __cribloHookTicks++;
        if (__cribloHookTicks > 400) clearInterval(__cribloHookTimer);
      }, 50);

      function listenerCountOnPath(target) {
        var count = 0;
        var node = target;
        var seen = [];
        while (node) {
          seen.push(node);
          var list = __cribloCapturedListeners.get(node) || [];
          count += list.length;
          node = node.parentNode;
        }
        try {
          var dl = __cribloCapturedListeners.get(document) || [];
          if (seen.indexOf(document) < 0) count += dl.length;
          var wl = __cribloCapturedListeners.get(window) || [];
          count += wl.length;
        } catch (_) {}
        return count;
      }

      function listenerUsesCapture(options) {
        try {
          if (options === true) return true;
          return !!(options && typeof options === 'object' && options.capture === true);
        } catch (_) { return false; }
      }

      function compatibleSemanticEvent(type, target, currentTarget, x, y, sourceEvent) {
        var isContext = type === 'contextmenu';
        var sourceTouch = null;
        try { sourceTouch = sourceEvent && sourceEvent.touches && sourceEvent.touches[0]; } catch (_) {}
        var pointerId = sourceTouch && sourceTouch.identifier != null ? sourceTouch.identifier : 1;
        var targetRect = null;
        try { targetRect = target && target.getBoundingClientRect && target.getBoundingClientRect(); } catch (_) {}
        var offsetX = targetRect ? x - targetRect.left : x;
        var offsetY = targetRect ? y - targetRect.top : y;

        var raw;
        try {
          // Chrome/Android exposes long-touch contextmenu as PointerEvent with
          // pointerType=touch and no mouse button held. GeoReseaux runs on a
          // canvas, so matching this shape matters for its hit-test path.
          if (isContext && typeof PointerEvent === 'function') {
            raw = new PointerEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y,
              button: 0,
              buttons: 0,
              pointerId: pointerId,
              pointerType: 'touch',
              isPrimary: true,
              width: 9,
              height: 9,
              pressure: 0,
              view: window
            });
          } else {
            raw = new MouseEvent(isContext ? 'contextmenu' : 'mousemove', {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y,
              button: 0,
              buttons: isContext ? 0 : 1,
              view: window
            });
          }
        } catch (_) { raw = {}; }

        var prevented = false;
        var stopped = false;
        var immediate = false;
        var touch = null;
        try { touch = sourceEvent && sourceEvent.touches && sourceEvent.touches[0]; } catch (_) {}
        var touchPoint = {
          identifier: touch && touch.identifier != null ? touch.identifier : 1,
          target: target,
          clientX: x,
          clientY: y,
          pageX: x + (window.scrollX || 0),
          pageY: y + (window.scrollY || 0),
          screenX: x,
          screenY: y,
          radiusX: 4,
          radiusY: 4,
          rotationAngle: 0,
          force: 0.5
        };
        var composed = [];
        var n = target;
        while (n) { composed.push(n); n = n.parentNode; }
        if (composed.indexOf(document) < 0) composed.push(document);
        composed.push(window);

        var overrides = {
          type: type,
          target: target,
          srcElement: target,
          currentTarget: currentTarget,
          eventPhase: currentTarget === target ? 2 : 3,
          button: 0,
          buttons: isContext ? 0 : 1,
          which: 1,
          clientX: x,
          clientY: y,
          x: x,
          y: y,
          pageX: x + (window.scrollX || 0),
          pageY: y + (window.scrollY || 0),
          screenX: x,
          screenY: y,
          offsetX: offsetX,
          offsetY: offsetY,
          layerX: offsetX,
          layerY: offsetY,
          pointerId: pointerId,
          pointerType: 'touch',
          isPrimary: true,
          width: 9,
          height: 9,
          pressure: isContext ? 0 : 0.5,
          detail: isContext ? 0 : 1,
          sourceCapabilities: { firesTouchEvents: true },
          isTrusted: !!(sourceEvent && sourceEvent.isTrusted),
          touches: isContext ? undefined : [touchPoint],
          targetTouches: isContext ? undefined : [touchPoint],
          changedTouches: isContext ? undefined : [touchPoint],
          originalEvent: sourceEvent || raw,
          nativeEvent: sourceEvent || raw,
          srcEvent: sourceEvent || raw,
          preventDefault: function () {
            prevented = true;
            try { sourceEvent && sourceEvent.preventDefault && sourceEvent.preventDefault(); } catch (_) {}
          },
          stopPropagation: function () { stopped = true; },
          stopImmediatePropagation: function () { stopped = true; immediate = true; },
          composedPath: function () { return composed.slice(); }
        };
        try {
          return new Proxy(raw, {
            get: function (obj, prop) {
              try {
                if (isContext && typeof prop === 'string' && prop.indexOf('__criblo') !== 0) {
                  __cribloGeoDiag.eventProperties[prop] = (__cribloGeoDiag.eventProperties[prop] || 0) + 1;
                }
              } catch (_) {}
              if (prop === '__cribloPrevented') return prevented;
              if (prop === '__cribloStopped') return stopped;
              if (prop === '__cribloImmediate') return immediate;
              if (prop === 'defaultPrevented') return prevented;
              if (Object.prototype.hasOwnProperty.call(overrides, prop)) return overrides[prop];
              var value;
              try { value = Reflect.get(obj, prop, obj); } catch (_) { value = obj[prop]; }
              return typeof value === 'function' ? value.bind(obj) : value;
            }
          });
        } catch (_) {
          return raw;
        }
      }

      function compatibleContextEvent(target, currentTarget, x, y, sourceEvent) {
        return compatibleSemanticEvent('contextmenu', target, currentTarget, x, y, sourceEvent);
      }

      function callCapturedListener(entry, currentTarget, event) {
        try {
          if (typeof entry.listener === 'function') entry.listener.call(currentTarget, event);
          else if (entry.listener && typeof entry.listener.handleEvent === 'function') entry.listener.handleEvent(event);
          return true;
        } catch (_) { return false; }
      }

      function invokeCapturedSemanticHandlers(target, x, y, sourceEvent) {
        if (!target) return false;
        var path = [];
        var node = target;
        while (node) { path.push(node); node = node.parentNode; }
        if (path.indexOf(document) < 0) path.push(document);
        path.push(window);
        __cribloGeoDiag.capturedListeners = listenerCountOnPath(target);

        var semanticTypes = ['contextmenu'];
        var invoked = false;

        for (var t = 0; t < semanticTypes.length; t++) {
          var eventType = semanticTypes[t];

          // Capture phase: only listeners that were actually registered with capture=true.
          for (var p = path.length - 1; p >= 0; p--) {
            var current = path[p];
            var captureEntries = __cribloCapturedListeners.get(current) || [];
            for (var i = 0; i < captureEntries.length; i++) {
              var captureEntry = captureEntries[i];
              if (captureEntry.type !== eventType || !listenerUsesCapture(captureEntry.options)) continue;
              var captureEvent = compatibleSemanticEvent(eventType, target, current, x, y, sourceEvent);
              if (callCapturedListener(captureEntry, current, captureEvent)) {
                invoked = true;
                __cribloGeoDiag.capturedCalls++;
              }
              if (captureEvent.__cribloImmediate) break;
              if (captureEvent.__cribloStopped) break;
            }
          }

          // Bubble phase: only capture=false listeners, exactly once.
          for (var b = 0; b < path.length; b++) {
            var bubbleCurrent = path[b];
            var bubbleEntries = __cribloCapturedListeners.get(bubbleCurrent) || [];
            for (var j = 0; j < bubbleEntries.length; j++) {
              var bubbleEntry = bubbleEntries[j];
              if (bubbleEntry.type !== eventType || listenerUsesCapture(bubbleEntry.options)) continue;
              var bubbleEvent = compatibleSemanticEvent(eventType, target, bubbleCurrent, x, y, sourceEvent);
              if (callCapturedListener(bubbleEntry, bubbleCurrent, bubbleEvent)) {
                invoked = true;
                __cribloGeoDiag.capturedCalls++;
              }
              if (bubbleEvent.__cribloImmediate) break;
              if (bubbleEvent.__cribloStopped) break;
            }
          }
        }

        // Property handlers are not visible through addEventListener interception.
        // Call each oncontextmenu property at most once along the real target path.
        for (var k = 0; k < path.length; k++) {
          try {
            var propertyTarget = path[k];
            if (propertyTarget && typeof propertyTarget.oncontextmenu === 'function') {
              propertyTarget.oncontextmenu(compatibleSemanticEvent('contextmenu', target, propertyTarget, x, y, sourceEvent));
              invoked = true;
              __cribloGeoDiag.capturedCalls++;
            }
          } catch (_) {}
        }
        return invoked;
      }

      function clamp01(value) {
        value = Number(value || 0);
        return Math.max(0, Math.min(1, value));
      }

      function clearSelection() {
        try {
          var selection = window.getSelection && window.getSelection();
          if (selection && selection.removeAllRanges) selection.removeAllRanges();
        } catch (_) {}
      }

      function forwardIntoFrame(frame, x, y) {
        try {
          if (!frame || !frame.contentWindow) return false;
          var rect = frame.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) return false;
          frame.contentWindow.postMessage({
            __cribloLongPress: true,
            rx: clamp01((x - rect.left) / rect.width),
            ry: clamp01((y - rect.top) / rect.height)
          }, '*');
          return true;
        } catch (_) {
          return false;
        }
      }

      function pointer(target, type, x, y, button, buttons) {
        if (typeof PointerEvent !== 'function') return false;
        try {
          var event = new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: button,
            buttons: buttons,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            width: 1,
            height: 1,
            pressure: buttons ? 0.5 : 0,
            view: window
          });
          return !target.dispatchEvent(event) || event.defaultPrevented;
        } catch (_) {
          return false;
        }
      }

      function mouse(target, type, x, y, button, buttons, sourceEvent) {
        try {
          var event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: button,
            buttons: buttons,
            detail: 1,
            view: window
          });
          if (sourceEvent) {
            __cribloSyntheticContextEvents.add(event);
            __cribloSyntheticContextSources.set(event, sourceEvent);
          }
          return !target.dispatchEvent(event) || event.defaultPrevented;
        } catch (_) {
          try {
            var legacy = document.createEvent('MouseEvents');
            legacy.initMouseEvent(type, true, true, window, 1, x, y, x, y,
              false, false, false, false, button, null);
            if (sourceEvent) {
              __cribloSyntheticContextEvents.add(legacy);
              __cribloSyntheticContextSources.set(legacy, sourceEvent);
            }
            return !target.dispatchEvent(legacy) || legacy.defaultPrevented;
          } catch (_) {
            return false;
          }
        }
      }

      function contextMenu(target, x, y, sourceEvent) {
        // Exact working Android trace supplied from the CRI-BLO Android WebView:
        // contextmenu is the LAST event and reports button=0/buttons=0.
        try {
          if (typeof PointerEvent === 'function') {
            var event = new PointerEvent('contextmenu', {
              bubbles: true, cancelable: true, composed: true,
              clientX: x, clientY: y, screenX: x, screenY: y,
              button: 0, buttons: 0, pointerId: 1, pointerType: 'touch',
              isPrimary: true, width: 9, height: 9, pressure: 0, view: window
            });
            __cribloSyntheticContextEvents.add(event);
            if (sourceEvent) __cribloSyntheticContextSources.set(event, sourceEvent);
            __cribloGeoDiag.contextDispatches++;
            traceAndroidEvent('contextmenu', !!(sourceEvent && sourceEvent.isTrusted));
            target.dispatchEvent(event);
            __cribloGeoDiag.syntheticContextPrevented = !!event.defaultPrevented;
            return true;
          }
        } catch (_) {}
        try {
          var fallback = new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, composed: true,
            clientX: x, clientY: y, screenX: x, screenY: y,
            button: 0, buttons: 0, view: window
          });
          __cribloSyntheticContextEvents.add(fallback);
          if (sourceEvent) __cribloSyntheticContextSources.set(fallback, sourceEvent);
          __cribloGeoDiag.contextDispatches++;
          traceAndroidEvent('contextmenu', !!(sourceEvent && sourceEvent.isTrusted));
          target.dispatchEvent(fallback);
          __cribloGeoDiag.syntheticContextPrevented = !!fallback.defaultPrevented;
          return true;
        } catch (_) { return false; }
      }

      function jqueryContextMenu(target, x, y) {
        try {
          var jq = window.jQuery;
          if (!jq || !jq.Event) return false;
          var event = jq.Event('contextmenu', {
            clientX: x,
            clientY: y,
            pageX: x + (window.scrollX || 0),
            pageY: y + (window.scrollY || 0),
            button: 0,
            buttons: 0,
            which: 1
          });
          jq(target).trigger(event);
          return !!(event.isDefaultPrevented && event.isDefaultPrevented());
        } catch (_) {
          return false;
        }
      }

      function customLongPress(target, x, y) {
        ['longpress', 'long-press', 'hold', 'press'].forEach(function (name) {
          try {
            target.dispatchEvent(new CustomEvent(name, {
              bubbles: true,
              cancelable: true,
              composed: true,
              detail: { clientX: x, clientY: y, x: x, y: y, source: 'criblo-ios' }
            }));
          } catch (_) {}
        });
      }

      function candidateElements(x, y) {
        try {
          if (document.elementsFromPoint) {
            var stack = document.elementsFromPoint(x, y) || [];
            var unique = [];
            for (var i = 0; i < stack.length; i++) {
              var el = stack[i];
              if (!el || unique.indexOf(el) >= 0) continue;
              unique.push(el);
              if (unique.length >= 8) break;
            }
            if (unique.length) return unique;
          }
        } catch (_) {}
        var single = document.elementFromPoint(x, y);
        return single ? [single] : [];
      }


      function viewportPoint(element, x, y) {
        try {
          var rect = element && element.getBoundingClientRect && element.getBoundingClientRect();
          if (!rect) return [x, y];
          return [x - rect.left, y - rect.top];
        } catch (_) { return [x, y]; }
      }

      function safeObjectValues(root, maxDepth) {
        var found = [];
        var queue = [{ value: root, depth: 0 }];
        var seen = [];
        while (queue.length && found.length < 500) {
          var item = queue.shift();
          var value = item.value;
          if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
          if (seen.indexOf(value) >= 0) continue;
          seen.push(value); found.push(value);
          if (item.depth >= maxDepth) continue;
          var names = [];
          try { names = Object.getOwnPropertyNames(value).slice(0, 80); } catch (_) {}
          for (var i = 0; i < names.length; i++) {
            try {
              var descriptor = Object.getOwnPropertyDescriptor(value, names[i]);
              if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
              var child = descriptor.value;
              if (!child || child === window || child === document || child === value) continue;
              if (typeof child === 'object' || typeof child === 'function') queue.push({ value: child, depth: item.depth + 1 });
            } catch (_) {}
          }
        }
        return found;
      }

      function invokeMapEngine(target, x, y, sourceEvent) {
        installMapHooks();
        var values = [];
        for (var r = 0; r < __cribloMapRegistry.length; r++) values.push(__cribloMapRegistry[r].map);
        var scanned = safeObjectValues(window, 3);
        for (var s = 0; s < scanned.length; s++) {
          if (values.indexOf(scanned[s]) < 0) values.push(scanned[s]);
        }
        for (var i = 0; i < values.length; i++) {
          var map = values[i];
          try {
            // OpenLayers Map. Call the real OpenLayers browser-event entry
            // point instead of dispatching another synthetic DOM contextmenu.
            // This lets OpenLayers create its own MapBrowserEvent, pixel and
            // coordinate exactly as its viewport contextmenu listener does.
            if (map && typeof map.getViewport === 'function' && typeof map.getCoordinateFromPixel === 'function') {
              var viewport = map.getViewport();
              if (!viewport || !(viewport === target || (viewport.contains && viewport.contains(target)))) continue;
              var pixel = viewportPoint(viewport, x, y);
              var original = compatibleContextEvent(target, viewport, x, y, sourceEvent);
              try {
                var hit = null;
                if (typeof map.forEachFeatureAtPixel === 'function') {
                  hit = map.forEachFeatureAtPixel(pixel, function (feature) { return feature || true; });
                } else if (typeof map.getFeaturesAtPixel === 'function') {
                  var hits = map.getFeaturesAtPixel(pixel);
                  hit = hits && hits.length ? hits[0] : null;
                }
                if (hit) __cribloGeoDiag.mapFeatureHits++;
              } catch (_) {}

              if (typeof map.handleBrowserEvent === 'function') {
                map.handleBrowserEvent(original, 'contextmenu');
              } else if (typeof map.dispatchEvent === 'function') {
                var coordinate = map.getCoordinateFromPixel(pixel);
                map.dispatchEvent({ type: 'contextmenu', map: map, pixel: pixel, coordinate: coordinate, dragging: false, originalEvent: original });
              } else {
                continue;
              }
              __cribloGeoDiag.engine = 'OpenLayers';
              __cribloGeoDiag.engineCalls++;
              __cribloGeoDiag.mapDirectCalls++;
              return true;
            }

            // Leaflet Map
            if (map && map._container && typeof map.containerPointToLatLng === 'function' && typeof map.fire === 'function') {
              var container = map._container;
              if (!(container === target || (container.contains && container.contains(target)))) continue;
              var cp = viewportPoint(container, x, y);
              var latlng = map.containerPointToLatLng(cp);
              var lp = typeof map.containerPointToLayerPoint === 'function' ? map.containerPointToLayerPoint(cp) : cp;
              var le = compatibleContextEvent(target, container, x, y, sourceEvent);
              map.fire('contextmenu', { latlng: latlng, containerPoint: cp, layerPoint: lp, originalEvent: le });
              try { map.fire('longpress', { latlng: latlng, containerPoint: cp, layerPoint: lp, originalEvent: le }); } catch (_) {}
              try { map.fire('hold', { latlng: latlng, containerPoint: cp, layerPoint: lp, originalEvent: le }); } catch (_) {}
              __cribloGeoDiag.engine = 'Leaflet'; __cribloGeoDiag.engineCalls++; return true;
            }

            // Mapbox GL / MapLibre GL
            if (map && typeof map.getCanvas === 'function' && typeof map.unproject === 'function' && typeof map.fire === 'function') {
              var canvas = map.getCanvas();
              if (!canvas || !(canvas === target || (canvas.contains && canvas.contains(target)) || (canvas.parentElement && canvas.parentElement.contains && canvas.parentElement.contains(target)))) continue;
              var mp = viewportPoint(canvas, x, y);
              var lngLat = map.unproject(mp);
              var me = compatibleContextEvent(target, canvas, x, y, sourceEvent);
              map.fire('contextmenu', { point: { x: mp[0], y: mp[1] }, lngLat: lngLat, originalEvent: me });
              try { map.fire('longpress', { point: { x: mp[0], y: mp[1] }, lngLat: lngLat, originalEvent: me }); } catch (_) {}
              __cribloGeoDiag.engine = 'Mapbox/MapLibre'; __cribloGeoDiag.engineCalls++; return true;
            }

            // ArcGIS JS MapView / SceneView
            if (map && map.container && typeof map.toMap === 'function' && typeof map.emit === 'function') {
              var ac = map.container;
              if (!(ac === target || (ac.contains && ac.contains(target)))) continue;
              var ap = viewportPoint(ac, x, y);
              var mapPoint = map.toMap({ x: ap[0], y: ap[1] });
              map.emit('hold', { x: ap[0], y: ap[1], mapPoint: mapPoint, button: 2, native: sourceEvent });
              try { map.emit('contextmenu', { x: ap[0], y: ap[1], mapPoint: mapPoint, button: 2, native: sourceEvent }); } catch (_) {}
              __cribloGeoDiag.engine = 'ArcGIS'; __cribloGeoDiag.engineCalls++; return true;
            }
          } catch (_) {}
        }
        return false;
      }

      function dispatchToTarget(target, x, y) {
        if (!target || !target.dispatchEvent) return false;

        var tag = String(target.tagName || '').toUpperCase();
        if (tag === 'IFRAME' || tag === 'FRAME') {
          return forwardIntoFrame(target, x, y);
        }

        var link = target.closest && target.closest('a[href]');
        if (link && tag !== 'CANVAS' && tag !== 'SVG' && tag !== 'PATH') return false;

        // The physical iOS touch already supplied pointerdown/touchstart.
        // Do not inject a right-mouse sequence: Android supplies only the
        // long-touch contextmenu before the real finger is released.
        var handled = contextMenu(target, x, y);
        if (!handled) handled = jqueryContextMenu(target, x, y);
        return handled;
      }

      function scheduleAndroidTouchFallback(target, x, y) {
        if (!target || !target.dispatchEvent) return;
        var pointerId = 47;
        var syntheticTouch = null;
        var touchStartEvent = null;

        // Replay the measured Android order, not the older assumption:
        // touchstart -> pointerdown -> mousedown -> touchend -> pointerup ->
        // mouseup -> click -> contextmenu.
        try {
          if (typeof Touch === 'function' && typeof TouchEvent === 'function') {
            syntheticTouch = new Touch({
              identifier:pointerId,target:target,clientX:x,clientY:y,
              screenX:x,screenY:y,pageX:x+(window.scrollX||0),pageY:y+(window.scrollY||0),
              radiusX:4,radiusY:4,rotationAngle:0,force:0.5
            });
            touchStartEvent = new TouchEvent('touchstart', {
              bubbles:true,cancelable:true,composed:true,
              touches:[syntheticTouch],targetTouches:[syntheticTouch],changedTouches:[syntheticTouch]
            });
            target.dispatchEvent(touchStartEvent);
            traceAndroidEvent('touchstart', false);
          }
        } catch (_) {}

        try {
          if (typeof PointerEvent === 'function') {
            target.dispatchEvent(new PointerEvent('pointerdown', {
              bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,
              screenX:x,screenY:y,button:0,buttons:1,pointerId:pointerId,
              pointerType:'touch',isPrimary:true,width:9,height:9,pressure:1
            }));
            __cribloGeoDiag.syntheticPointerDowns++;
            traceAndroidEvent('pointerdown', false);
          }
        } catch (_) {}
        mouse(target, 'mousedown', x, y, 0, 1);
        __cribloGeoDiag.syntheticMouseDowns++;
        traceAndroidEvent('mousedown', false);

        setTimeout(function () {
          try {
            if (syntheticTouch && typeof TouchEvent === 'function') {
              target.dispatchEvent(new TouchEvent('touchend', {
                bubbles:true,cancelable:true,composed:true,
                touches:[],targetTouches:[],changedTouches:[syntheticTouch]
              }));
              traceAndroidEvent('touchend', false);
            }
          } catch (_) {}
          try {
            if (typeof PointerEvent === 'function') {
              target.dispatchEvent(new PointerEvent('pointerup', {
                bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,
                screenX:x,screenY:y,button:0,buttons:0,pointerId:pointerId,
                pointerType:'touch',isPrimary:true,width:9,height:9,pressure:0
              }));
              __cribloGeoDiag.syntheticPointerUps++;
              traceAndroidEvent('pointerup', false);
            }
          } catch (_) {}
          mouse(target, 'mouseup', x, y, 0, 0);
          __cribloGeoDiag.syntheticMouseUps++;
          traceAndroidEvent('mouseup', false);
          mouse(target, 'click', x, y, 0, 0);
          __cribloGeoDiag.syntheticClicks++;
          traceAndroidEvent('click', false);
          contextMenu(target, x, y, touchStartEvent);
        }, 20);
      }

      function dispatchAt(x, y) {
        clearSelection();
        var candidates = candidateElements(x, y);
        if (!candidates.length) return false;

        for (var i = 0; i < candidates.length; i++) {
          var target = candidates[i];
          var tag = String(target.tagName || '').toUpperCase();
          if (tag === 'IFRAME' || tag === 'FRAME') {
            if (forwardIntoFrame(target, x, y)) return true;
            continue;
          }
          if (dispatchToTarget(target, x, y)) return true;
        }

        // If no right-click/contextmenu listener consumed the event, emulate
        // the Android touch hold itself. This is intentionally last so normal
        // map context-menu implementations remain the fast path.
        scheduleAndroidTouchFallback(candidates[0], x, y);
        customLongPress(candidates[0], x, y);
        return true;
      }

      var realTouchTimer = null;
      var realTouchTarget = null;
      var realTouchX = 0;
      var realTouchY = 0;
      var realTouchIdentifier = null;
      var realTouchFired = false;
      var lastRealTouchLongPressAt = 0;
      var lastRealTouchStartAt = 0;
      var lastRealPointerDownAt = 0;
      var lastRealPointerDownTarget = null;
      var lastRealMouseDownAt = 0;
      var lastRealMouseDownTarget = null;
      var lastRealPointerUpAt = 0;
      var lastRealPointerUpTarget = null;
      var lastRealMouseUpAt = 0;
      var lastRealMouseUpTarget = null;
      var lastRealClickAt = 0;
      var lastRealClickTarget = null;
      var pendingNativeLongPress = null;
      var nativeLongPressSequence = 0;
      var compatSyntheticMouseDownTarget = null;
      var compatSyntheticMouseDownX = 0;
      var compatSyntheticMouseDownY = 0;
      var compatSyntheticMouseDownAt = 0;
      var compatPressMoved = false;

      function clearRealTouchTimer() {
        if (realTouchTimer) {
          clearTimeout(realTouchTimer);
          realTouchTimer = null;
        }
      }

      function mapLikeTarget(target) {
        if (!target || target.nodeType !== 1) return false;
        var tag = String(target.tagName || '').toUpperCase();
        if (/^(CANVAS|SVG|PATH|CIRCLE|RECT|LINE|POLYLINE|POLYGON|USE)$/.test(tag)) return true;
        var node = target;
        for (var i = 0; node && i < 8; i++, node = node.parentElement) {
          var signature = String((node.id || '') + ' ' + (node.className && (node.className.baseVal || node.className) || '')).toLowerCase();
          if (/leaflet|ol-|openlayers|mapbox|maplibre|esri|map|carte|geo|viewer|canvas/.test(signature)) return true;
        }
        return false;
      }

      function touchByIdentifier(event) {
        var touches = (event && event.touches) || [];
        for (var i = 0; i < touches.length; i++) {
          if (realTouchIdentifier === null || touches[i].identifier === realTouchIdentifier) return touches[i];
        }
        return null;
      }

      function visiblePopupState() {
        var selectors = [
          '[role="dialog"]', '[role="menu"]', '[role="tooltip"]',
          '.popup', '.popover', '.modal', '.contextmenu', '.context-menu',
          '.leaflet-popup', '.mapboxgl-popup', '.maplibregl-popup', '.esri-popup',
          '[class*="popup"]', '[class*="popover"]', '[class*="contextmenu"]',
          '[class*="context-menu"]', '[class*="dialog"]', '[class*="modal"]'
        ].join(',');
        var out = [];
        try {
          var nodes = document.querySelectorAll(selectors);
          for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var rect = node.getBoundingClientRect();
            var style = getComputedStyle(node);
            if (rect.width > 20 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0) {
              out.push({
                node: node,
                text: String(node.textContent || '').slice(0, 400),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              });
            }
          }
        } catch (_) {}
        return out;
      }

      function popupChanged(before) {
        var after = visiblePopupState();
        for (var i = 0; i < after.length; i++) {
          var now = after[i];
          var previous = null;
          for (var j = 0; j < before.length; j++) {
            if (before[j].node === now.node) { previous = before[j]; break; }
          }
          if (!previous) return true;
          if (previous.text !== now.text || previous.width !== now.width || previous.height !== now.height) return true;
        }
        return false;
      }

      function ensureAndroidPressStart(target, x, y, touchStartedAt, sourceEvent) {
        if (!target || !target.dispatchEvent) return;
        // WKWebView supplies a real touch pointerdown, usually just BEFORE
        // touchstart. Treat that as the Android pointerdown instead of creating
        // a duplicate. What iOS does not supply on a long touch is Chrome's
        // compatibility mousedown, so create that immediately after touchstart.
        var pointerNearTouchStart = lastRealPointerDownTarget === target
          && lastRealPointerDownAt > 0
          && Math.abs(lastRealPointerDownAt - touchStartedAt) < 160;
        if (!pointerNearTouchStart) {
          try {
            if (typeof PointerEvent === 'function') {
              var pd = new PointerEvent('pointerdown', {
                bubbles:true,cancelable:true,composed:true,
                clientX:x,clientY:y,screenX:x,screenY:y,
                button:0,buttons:1,pointerId:realTouchIdentifier == null ? 1 : realTouchIdentifier,
                pointerType:'touch',isPrimary:true,width:9,height:9,pressure:1,view:window
              });
              if (sourceEvent) {
                __cribloSyntheticContextEvents.add(pd);
                __cribloSyntheticContextSources.set(pd, sourceEvent);
              }
              target.dispatchEvent(pd);
              __cribloGeoDiag.syntheticPointerDowns++;
              traceAndroidEvent('pointerdown', false);
            }
          } catch (_) {}
        }
        var mouseNearTouchStart = lastRealMouseDownTarget === target
          && lastRealMouseDownAt > 0
          && Math.abs(lastRealMouseDownAt - touchStartedAt) < 160;
        if (!mouseNearTouchStart && compatSyntheticMouseDownTarget !== target) {
          mouse(target, 'mousedown', x, y, 0, 1, sourceEvent);
          __cribloGeoDiag.syntheticMouseDowns++;
          traceAndroidEvent('mousedown', false);
          compatSyntheticMouseDownTarget = target;
          compatSyntheticMouseDownX = x;
          compatSyntheticMouseDownY = y;
          compatSyntheticMouseDownAt = Date.now();
          compatPressMoved = false;
        }
      }

      function finishAndroidCompatibilityMouse(request, includeClick) {
        if (!request || !request.target) return;
        var target = request.target;
        var x = request.x == null ? compatSyntheticMouseDownX : request.x;
        var y = request.y == null ? compatSyntheticMouseDownY : request.y;
        var releaseAt = request.releasedAt || Date.now();
        var source = request.releaseEvent || request.sourceEvent || null;
        var hadPress = compatSyntheticMouseDownTarget === target
          || (lastRealMouseDownTarget === target && lastRealMouseDownAt >= (request.touchStartedAt || 0) - 160);
        if (!hadPress) return;

        var hasRealMouseUp = lastRealMouseUpTarget === target && lastRealMouseUpAt >= releaseAt - 20;
        if (!hasRealMouseUp) {
          mouse(target, 'mouseup', x, y, 0, 0, source);
          __cribloGeoDiag.syntheticMouseUps++;
          traceAndroidEvent('mouseup', false);
        }

        var hasRealClick = lastRealClickTarget === target && lastRealClickAt >= releaseAt - 20;
        if (includeClick && !compatPressMoved && !hasRealClick) {
          mouse(target, 'click', x, y, 0, 0, source);
          __cribloGeoDiag.syntheticClicks++;
          traceAndroidEvent('click', false);
        }

        compatSyntheticMouseDownTarget = null;
        compatSyntheticMouseDownAt = 0;
        compatPressMoved = false;
      }

      function completeAndroidLongPress(request, reason) {
        if (!request || pendingNativeLongPress !== request || !request.armed) return false;
        pendingNativeLongPress = null;
        // Keep the exact physical long-press target/coordinates. The delayed
        // trusted click is only a readiness signal; its target/coordinates may
        // differ in WKWebView and must never move the GeoReseaux hit-test point.
        var target = request.target;
        var x = request.x;
        var y = request.y;
        if (!target || !target.dispatchEvent) {
          __cribloGeoDiag.lastResult = 'trusted-tail-no-target';
          return false;
        }

        // The live iPhone trace showed that the page's genuine trusted click is
        // delivered after touchend. Waiting for that click is essential because
        // GeoReseaux can update its canvas hit/selection state during the real
        // click before its contextmenu handler runs.
        var before = visiblePopupState();
        var callsBefore = __cribloGeoDiag.wrappedContextCalls;
        var source = request.sourceEvent || request.releaseEvent || request.tailEvent || null;
        // iOS long-presses do not emit Chrome's mouseup/click compatibility
        // tail. Rebuild only the missing tail, then contextmenu is last.
        finishAndroidCompatibilityMouse(request, true);
        // Android delivers contextmenu through the viewport DOM first. That is
        // important because GeoReseaux may attach Angular/DOM listeners alongside
        // OpenLayers' own viewport listener. Calling Map.handleBrowserEvent() first
        // bypasses those application listeners and is not equivalent to Android.
        // Dispatch the DOM event first with the trusted touch facade. The recovered
        // Map is now only a fallback when no wrapped DOM handler consumed the event.
        var dispatched = contextMenu(target, x, y, source);
        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;
        if (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented) {
          dispatched = invokeMapEngine(target, x, y, source) || dispatched;
        }
        __cribloGeoDiag.directTrustedHandlerFires += delta;
        __cribloGeoDiag.releaseCompletions++;
        __cribloGeoDiag.contextAfterTouchMs = request.touchStartedAt
          ? Math.max(0, Date.now() - request.touchStartedAt)
          : -1;
        __cribloGeoDiag.lastResult = dispatched
          ? 'trusted-webkit-tail-contextmenu-' + String(reason || 'fallback')
          : 'trusted-webkit-tail-contextmenu-error';
        setTimeout(function () {
          if (popupChanged(before)) __cribloGeoDiag.lastResult = 'trusted-webkit-tail-popup';
          else if (dispatched) __cribloGeoDiag.lastResult = 'trusted-webkit-tail-no-popup';
        }, 220);
        return dispatched;
      }

      function dispatchNativeLongPressRequest(request) {
        if (!request || pendingNativeLongPress !== request) return false;

        var estimatedX = window.innerWidth * request.rx;
        var estimatedY = window.innerHeight * request.ry;
        var touchAge = lastRealTouchStartAt ? Date.now() - lastRealTouchStartAt : Number.POSITIVE_INFINITY;
        var hasFreshTouch = !!(realTouchTarget && touchAge >= 0 && touchAge < 1500);
        if (!hasFreshTouch) return false;

        request.target = realTouchTarget;
        request.x = realTouchX;
        request.y = realTouchY;
        request.pointerId = realTouchIdentifier;
        request.touchStartedAt = lastRealTouchStartAt;
        request.sourceEvent = window.__cribloLastTrustedTouchStart || null;
        request.armed = true;

        // The native recognizer can reach WKWebView JavaScript late. Its only
        // job here is to ARM the hold while the trusted touch is alive. The
        // actual contextmenu is deliberately deferred until the genuine iOS
        // release/click tail, which is the measured Android ordering.
        clearRealTouchTimer();
        realTouchFired = true;
        lastRealTouchLongPressAt = Date.now();
        __cribloGeoDiag.directSourceTrusted = !!(request.sourceEvent && request.sourceEvent.isTrusted);
        __cribloGeoDiag.contextAfterTouchMs = -1;
        __cribloGeoDiag.coordinateDelta = String(Math.round(estimatedX - request.x)) + ',' + String(Math.round(estimatedY - request.y));
        __cribloGeoDiag.directTarget = String((request.target.tagName || '') + '#' + (request.target.id || '') + '.' + (request.target.className && (request.target.className.baseVal || request.target.className) || '')).slice(0, 180);
        __cribloGeoDiag.lastTarget = __cribloGeoDiag.directTarget;
        __cribloGeoDiag.capturedListeners = listenerCountOnPath(request.target);
        __cribloGeoDiag.lastResult = 'native-hold-armed-waiting-release';
        return true;
      }

      function fallbackNativeLongPressRequest(request) {
        if (!request || pendingNativeLongPress !== request || request.armed) return;
        pendingNativeLongPress = null;
        var x = window.innerWidth * request.rx;
        var y = window.innerHeight * request.ry;
        var candidates = candidateElements(x, y);
        var target = candidates.length ? candidates[0] : null;
        if (!target) {
          __cribloGeoDiag.lastResult = 'touchstart-timeout-no-target';
          return;
        }
        __cribloGeoDiag.directSourceTrusted = false;
        __cribloGeoDiag.coordinateDelta = 'estimated';
        __cribloGeoDiag.directTarget = String((target.tagName || '') + '#' + (target.id || '') + '.' + (target.className && (target.className.baseVal || target.className) || '')).slice(0, 180);
        __cribloGeoDiag.lastTarget = __cribloGeoDiag.directTarget;
        __cribloGeoDiag.capturedListeners = listenerCountOnPath(target);
        // If WKWebView delays DOM touchstart beyond the native recognizer,
        // do not fabricate a second touch/pointer/mouse lifecycle. The native
        // point is already in CSS-point coordinates for this full-screen
        // WKWebView, so emit the same single hold contextmenu directly.
        __cribloGeoDiag.lastResult = 'touchstart-timeout-contextmenu-at-hold';
        var before = visiblePopupState();
        var callsBefore = __cribloGeoDiag.wrappedContextCalls;
        var dispatched = contextMenu(target, x, y, null);
        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;
        if (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented) {
          dispatched = invokeMapEngine(target, x, y, null) || dispatched;
        }
        __cribloGeoDiag.directTrustedHandlerFires += delta;
        setTimeout(function () {
          if (popupChanged(before)) __cribloGeoDiag.lastResult = 'touchstart-timeout-popup';
          else if (dispatched) __cribloGeoDiag.lastResult = 'touchstart-timeout-no-popup';
        }, 220);
      }

      function fireRealTouchLongPress() {
        realTouchTimer = null;
        if (!realTouchTarget || realTouchFired) return;

        var sourceEvent = window.__cribloLastTrustedTouchStart || null;
        var request = {
          id: ++nativeLongPressSequence,
          rx: window.innerWidth ? clamp01(realTouchX / window.innerWidth) : 0,
          ry: window.innerHeight ? clamp01(realTouchY / window.innerHeight) : 0,
          requestedAt: Date.now(),
          target: realTouchTarget,
          x: realTouchX,
          y: realTouchY,
          pointerId: realTouchIdentifier,
          touchStartedAt: lastRealTouchStartAt,
          sourceEvent: sourceEvent,
          armed: true,
          origin: 'trusted-js-touch-timer'
        };

        // This timer runs inside the page from the genuine trusted touchstart,
        // so it is not delayed by native evaluateJavaScript IPC. At 600 ms we
        // ARM the long press only. touchend + the real WebKit click complete it
        // and contextmenu is emitted last, exactly like the Android trace.
        pendingNativeLongPress = request;
        realTouchFired = true;
        lastRealTouchLongPressAt = Date.now();
        __cribloGeoDiag.jsHoldArms++;
        __cribloGeoDiag.directSourceTrusted = !!(sourceEvent && sourceEvent.isTrusted);
        __cribloGeoDiag.coordinateDelta = 'trusted-touch';
        __cribloGeoDiag.directTarget = String((request.target.tagName || '') + '#' + (request.target.id || '') + '.' + (request.target.className && (request.target.className.baseVal || request.target.className) || '')).slice(0, 180);
        __cribloGeoDiag.lastTarget = __cribloGeoDiag.directTarget;
        __cribloGeoDiag.capturedListeners = listenerCountOnPath(request.target);
        __cribloGeoDiag.lastResult = 'js-hold-armed-waiting-release';

        clearSelection();
        var styleNode = request.target;
        for (var si = 0; styleNode && si < 7; si++, styleNode = styleNode.parentElement) {
          try {
            styleNode.style.webkitUserSelect = 'none';
            styleNode.style.webkitTouchCallout = 'none';
            styleNode.style.userSelect = 'none';
          } catch (_) {}
        }
      }

      __cribloOriginalAddEventListener.call(document, 'pointerdown', function (event) {
        try {
          if (!event || !event.isTrusted || String(event.pointerType || '') !== 'touch') return;
          lastRealPointerDownAt = Date.now();
          lastRealPointerDownTarget = event.target || null;
          traceAndroidEvent('pointerdown', true);
        } catch (_) {}
      }, true);

      __cribloOriginalAddEventListener.call(document, 'mousedown', function (event) {
        try {
          if (!event || !event.isTrusted) return;
          lastRealMouseDownAt = Date.now();
          lastRealMouseDownTarget = event.target || null;
          traceAndroidEvent('mousedown', true);
        } catch (_) {}
      }, true);

      __cribloOriginalAddEventListener.call(document, 'pointerup', function (event) {
        try {
          if (!event || !event.isTrusted || String(event.pointerType || '') !== 'touch') return;
          lastRealPointerUpAt = Date.now();
          lastRealPointerUpTarget = event.target || null;
          traceAndroidEvent('pointerup', true);
        } catch (_) {}
      }, true);

      __cribloOriginalAddEventListener.call(document, 'mouseup', function (event) {
        try {
          if (!event || !event.isTrusted) return;
          lastRealMouseUpAt = Date.now();
          lastRealMouseUpTarget = event.target || null;
          traceAndroidEvent('mouseup', true);
        } catch (_) {}
      }, true);

      __cribloOriginalAddEventListener.call(document, 'click', function (event) {
        try {
          if (!event || !event.isTrusted) return;
          lastRealClickAt = Date.now();
          lastRealClickTarget = event.target || null;
          traceAndroidEvent('click', true);

          var request = pendingNativeLongPress;
          if (request && request.armed && request.releasedAt && !request.tailCompletionScheduled) {
            request.tailCompletionScheduled = true;
            request.tailEvent = event;
            // We are in capture phase. Run in the next task so GeoReseaux's own
            // trusted click handlers finish first, then contextmenu is truly last.
            setTimeout(function () {
              completeAndroidLongPress(request, 'trusted-click');
            }, 0);
          }
        } catch (_) {}
      }, true);

      // Bypass the page-listener wrapper for CRI-BLO's own observer. This keeps
      // diagnostics honest: a marked synthetic event is not counted as a real
      // WebKit trusted contextmenu merely because page listeners see its facade.
      __cribloOriginalAddEventListener.call(document, 'contextmenu', function (event) {
        try {
          if (__cribloSyntheticContextEvents.has(event)) {
            __cribloGeoDiag.syntheticContextmenus++;
            return;
          }
          if (!event || !event.isTrusted) return;
          __cribloGeoDiag.trustedContextmenus++;
          __cribloGeoDiag.lastResult = 'trusted-contextmenu';
          clearRealTouchTimer();
          setTimeout(function () {
            try { __cribloGeoDiag.trustedContextPrevented = !!event.defaultPrevented; } catch (_) {}
          }, 0);
        } catch (_) {}
      }, true);

      document.addEventListener('touchstart', function (event) {
        try {
          if (!event || !event.touches || event.touches.length !== 1) return;
          var touch = event.touches[0];
          var target = event.target;
          if (!mapLikeTarget(target)) return;
          var touchStartNow = Date.now();
          traceAndroidEvent('touchstart', !!event.isTrusted);

          clearRealTouchTimer();
          realTouchTarget = target;
          lastRealTouchStartAt = touchStartNow;
          // Keep a reference to the genuine WebKit touchstart event. We never
          // mutate it; the marked context event facade uses only its trust bit.
          window.__cribloLastTrustedTouchStart = event;

          // The measured Android WebView does the opposite of our previous
          // assumption: touchstart is observed first, then pointerdown/mousedown.
          // Save coordinates first; missing press events are filled only after
          // this real touchstart has completed propagation.

          realTouchX = touch.clientX;
          realTouchY = touch.clientY;
          realTouchIdentifier = touch.identifier;
          realTouchFired = false;
          realTouchTimer = null;
          if (event.isTrusted) {
            // Android Chrome creates its compatibility mouse press near the
            // beginning of the touch, not 600 ms later. Run after this genuine
            // touchstart finishes propagation so page touch handlers stay first.
            var pressTarget = target;
            var pressX = realTouchX;
            var pressY = realTouchY;
            var pressStartedAt = touchStartNow;
            var pressSource = event;
            setTimeout(function () {
              if (realTouchTarget === pressTarget && lastRealTouchStartAt === pressStartedAt) {
                ensureAndroidPressStart(pressTarget, pressX, pressY, pressStartedAt, pressSource);
              }
            }, 0);
            realTouchTimer = setTimeout(function () {
              fireRealTouchLongPress();
            }, 600);
          }

          // WKWebView can hold DOM touch delivery until the simultaneous native
          // recognizer has already begun. If that happened, let this touchstart
          // finish normal propagation, establish the Android press state, and arm
          // the hold. contextmenu remains deferred until the physical release.
          var pending = pendingNativeLongPress;
          if (pending && touchStartNow >= pending.requestedAt && touchStartNow - pending.requestedAt < 500) {
            __cribloGeoDiag.nativeToTouchMs = Math.max(0, touchStartNow - pending.requestedAt);
            __cribloGeoDiag.lastResult = 'touchstart-received-after-native';
            setTimeout(function () {
              dispatchNativeLongPressRequest(pending);
            }, 0);
          } else {
            __cribloGeoDiag.lastResult = 'touchstart-ready-before-native';
          }
        } catch (_) {}
      }, { capture: true, passive: true });

      document.addEventListener('touchmove', function (event) {
        try {
          if (!realTouchTarget) return;
          var touch = touchByIdentifier(event);
          if (!touch) { clearRealTouchTimer(); return; }
          var dx = touch.clientX - realTouchX;
          var dy = touch.clientY - realTouchY;
          if ((dx * dx + dy * dy) > 784) {
            compatPressMoved = true;
            clearRealTouchTimer();
          }
        } catch (_) { clearRealTouchTimer(); }
      }, { capture: true, passive: true });

      document.addEventListener('touchcancel', function (event) {
        clearRealTouchTimer();
        if (compatSyntheticMouseDownTarget) {
          finishAndroidCompatibilityMouse({
            target: compatSyntheticMouseDownTarget,
            x: compatSyntheticMouseDownX,
            y: compatSyntheticMouseDownY,
            releaseEvent: event || null,
            releasedAt: Date.now(),
            touchStartedAt: lastRealTouchStartAt
          }, false);
        }
        pendingNativeLongPress = null;
        realTouchTarget = null;
        realTouchIdentifier = null;
        lastRealTouchStartAt = 0;
        window.__cribloLastTrustedTouchStart = null;
      }, true);

      document.addEventListener('touchend', function (event) {
        try {
          traceAndroidEvent('touchend', !!(event && event.isTrusted));
          var request = pendingNativeLongPress;
          var target = realTouchTarget || (event && event.target) || null;
          var sourceEvent = window.__cribloLastTrustedTouchStart || event || null;
          var releaseAt = Date.now();

          if (request && request.armed && target) {
            request.target = request.target || target;
            request.x = request.x == null ? realTouchX : request.x;
            request.y = request.y == null ? realTouchY : request.y;
            request.pointerId = request.pointerId == null ? realTouchIdentifier : request.pointerId;
            request.sourceEvent = request.sourceEvent || sourceEvent;
            request.releaseEvent = event || null;
            request.releasedAt = releaseAt;
            __cribloGeoDiag.contextAfterTouchMs = lastRealTouchStartAt ? Math.max(0, releaseAt - lastRealTouchStartAt) : -1;
            __cribloGeoDiag.lastResult = 'trusted-webkit-tail-touchend-waiting-click';
            // The real iPhone trace shows no WebKit mouseup/click for a hold.
            // Finish the Android compatibility mouse tail in the next task, after
            // GeoReseaux's genuine touchend handlers have completed. If WebKit
            // did produce a real click, the capture listener wins and this is a no-op.
            setTimeout(function () {
              if (pendingNativeLongPress === request && request.armed && !request.tailCompletionScheduled) {
                request.tailCompletionScheduled = true;
                completeAndroidLongPress(request, 'android-compat-tail');
              }
            }, 0);
          } else if (compatSyntheticMouseDownTarget) {
            var tapCleanup = {
              target: compatSyntheticMouseDownTarget,
              x: compatSyntheticMouseDownX,
              y: compatSyntheticMouseDownY,
              releaseEvent: event || null,
              releasedAt: releaseAt,
              touchStartedAt: lastRealTouchStartAt
            };
            setTimeout(function () { finishAndroidCompatibilityMouse(tapCleanup, false); }, 80);
          }
        } catch (_) {}

        clearRealTouchTimer();
        realTouchTarget = null;
        realTouchIdentifier = null;
        realTouchFired = false;
        lastRealTouchStartAt = 0;
        window.__cribloLastTrustedTouchStart = null;
      }, { capture: true, passive: false });

      window.addEventListener('message', function (event) {
        var data = event && event.data;
        if (!data || data.__cribloLongPress !== true) return;
        dispatchAt(
          window.innerWidth * clamp01(data.rx),
          window.innerHeight * clamp01(data.ry)
        );
      }, false);

      window.__cribloDispatchLongPress = function (rx, ry) {
        return dispatchAt(
          window.innerWidth * clamp01(rx),
          window.innerHeight * clamp01(ry)
        );
      };

      window.__cribloNativeFallbackLongPress = function (rx, ry) {
        if (Date.now() - lastRealTouchLongPressAt < 1200) return true;
        return window.__cribloDispatchLongPress(rx, ry);
      };

      window.__cribloRecordNativeRecognizer = function () {
        try {
          __cribloGeoDiag.nativeRecognizerFires++;
          __cribloGeoDiag.lastResult = 'native-recognizer-fired';
        } catch (_) {}
        return true;
      };

      window.__cribloNativeWrappedContextLongPress = function (rx, ry) {
        try {
          __cribloGeoDiag.nativeRecognizerFires++;
          var now = Date.now();
          // On real iPhone WKWebView the native callback can be delivered only
          // after touchend or even around the compatibility click. Never let a
          // late native callback overwrite the request already armed by the
          // trusted in-page 600 ms timer.
          if ((pendingNativeLongPress && pendingNativeLongPress.armed)
              || (lastRealTouchLongPressAt && now - lastRealTouchLongPressAt < 1800)) {
            __cribloGeoDiag.nativeLateSuppressed++;
            __cribloGeoDiag.lastResult = 'native-late-suppressed-js-hold';
            return true;
          }
          var request = {
            id: ++nativeLongPressSequence,
            rx: clamp01(rx),
            ry: clamp01(ry),
            requestedAt: now
          };
          pendingNativeLongPress = request;

          var touchAge = lastRealTouchStartAt ? now - lastRealTouchStartAt : Number.POSITIVE_INFINITY;
          if (realTouchTarget && touchAge >= 0 && touchAge < 1200) {
            __cribloGeoDiag.touchToNativeMs = Math.max(0, Math.round(touchAge));
            __cribloGeoDiag.lastResult = 'native-received-after-touchstart';
            // Arm after the current stack. The actual contextmenu is held
            // until the genuine touchend and release/click tail complete.
            setTimeout(function () {
              dispatchNativeLongPressRequest(request);
            }, 0);
          } else {
            __cribloGeoDiag.nativeWaitsForTouchStart++;
            __cribloGeoDiag.lastResult = 'native-waiting-for-touchstart';
            // Give delayed WKWebView touchstart a short chance to bind the
            // genuine target/coordinates. If it still has not arrived, use the
            // native hold point directly. Do not wait for finger release and do
            // not fabricate pointer/mouse events.
            setTimeout(function () {
              fallbackNativeLongPressRequest(request);
            }, 90);
          }
          return true;
        } catch (_) {
          __cribloGeoDiag.lastResult = 'ordered-context-error';
          return false;
        }
      };

      window.__cribloGeoDiagnosticsText = function () {
        var engineHints = [];
        try { if (window.L) engineHints.push('L'); } catch (_) {}
        try { if (window.ol) engineHints.push('ol'); } catch (_) {}
        try { if (window.mapboxgl) engineHints.push('mapboxgl'); } catch (_) {}
        try { if (window.maplibregl) engineHints.push('maplibregl'); } catch (_) {}
        return [
          'URL: ' + String(location.href || '').slice(0, 180),
          'Target: ' + (__cribloGeoDiag.lastTarget || 'none'),
          'Context handlers: ' + __cribloGeoDiag.capturedListeners + ' / calls: ' + __cribloGeoDiag.wrappedContextCalls,
          'Hold handlers called: ' + __cribloGeoDiag.semanticCalls,
          'Engine: ' + __cribloGeoDiag.engine + ' / instances: ' + __cribloMapRegistry.length + ' / calls: ' + __cribloGeoDiag.engineCalls,
          'OpenLayers direct: ' + __cribloGeoDiag.mapDirectCalls + ' / feature hits: ' + __cribloGeoDiag.mapFeatureHits + ' / recovery: ' + __cribloGeoDiag.mapRecovery,
          'Last result: ' + __cribloGeoDiag.lastResult,
          'Native recognizer fires: ' + __cribloGeoDiag.nativeRecognizerFires,
          'Native waits for touchstart: ' + __cribloGeoDiag.nativeWaitsForTouchStart,
          'JS trusted hold arms: ' + __cribloGeoDiag.jsHoldArms,
          'Late native bridge suppressed: ' + __cribloGeoDiag.nativeLateSuppressed,
          'Touch -> native: ' + __cribloGeoDiag.touchToNativeMs + ' ms',
          'Native -> touch: ' + __cribloGeoDiag.nativeToTouchMs + ' ms',
          'Context after touch: ' + __cribloGeoDiag.contextAfterTouchMs + ' ms',
          'Native/touch coordinate delta: ' + __cribloGeoDiag.coordinateDelta,
          'Context events: ' + __cribloGeoDiag.contextDispatches + ' / observed: ' + __cribloGeoDiag.syntheticContextmenus,
          'Synthetic context prevented: ' + String(!!__cribloGeoDiag.syntheticContextPrevented),
          'Synthetic press/release: pd=' + __cribloGeoDiag.syntheticPointerDowns + ' md=' + __cribloGeoDiag.syntheticMouseDowns + ' pu=' + __cribloGeoDiag.syntheticPointerUps + ' mu=' + __cribloGeoDiag.syntheticMouseUps + ' click=' + __cribloGeoDiag.syntheticClicks,
          'Release completions: ' + __cribloGeoDiag.releaseCompletions,
          'Android-order trace (*=trusted source): ' + (__cribloGeoDiag.androidSequence.join(' > ') || 'none'),
          'Real WebKit contextmenus: ' + __cribloGeoDiag.trustedContextmenus,
          'Trusted-facade handler calls: ' + __cribloGeoDiag.directTrustedHandlerFires,
          'Lifecycle facade calls: ' + __cribloGeoDiag.wrappedLifecycleCalls,
          'Trusted touch source: ' + String(!!__cribloGeoDiag.directSourceTrusted),
          'Event properties read: ' + (Object.keys(__cribloGeoDiag.eventProperties).sort().join(', ') || 'none'),
          'Android mode (JS/HTTP): ' + String(!!window.__cribloGeoReseauxAndroidCompat) + '/' + String(!!window.__cribloGeoHTTPAndroid),
          'Global hints: ' + (engineHints.join(', ') || 'none')
        ].join('\n');
      };
    })();
    """#
}
