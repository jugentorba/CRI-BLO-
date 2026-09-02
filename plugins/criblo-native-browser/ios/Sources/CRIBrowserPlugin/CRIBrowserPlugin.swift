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

        // Start with Safari for generic/authentication hosts. The navigation
        // delegate switches the main frame to Android before MOBI/GeoReseaux
        // application hosts load, keeping HTTP and JavaScript platform signals
        // consistent while leaving external Orange identity pages untouched.
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
            || host == "mobi-prod.orange.fr"
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
            // Match Android's network identity on the MOBI/GeoReseaux application
            // hosts, including the stable mobi-prod entry point. Authentication
            // redirects on other Orange/identity hosts keep the genuine Safari UA,
            // then the app switches back to Android before MOBI/GeoReseaux loads.
            // This keeps the HTTP and document-start JavaScript identities aligned
            // instead of asking Orange for an iPhone bundle and then spoofing Android.
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

      // WebKit physically sends touch pointerdown before touchstart (and
      // pointerup before touchend), while the measured working Android WebView
      // exposes the reverse order to GeoReseaux. Intercept the genuine pointer
      // event once at the top of the DOM path, preserve it as the trusted source,
      // then replay the pointer semantics immediately after the matching genuine
      // TouchEvent. We do not preventDefault(), so WebKit's native touch/default
      // processing remains intact.
      var __cribloHeldPointerDown = null;
      var __cribloHeldPointerUp = null;
      var __cribloObservedPhysicalPointers = new WeakSet();

      function runAfterCurrentEvent(callback) {
        try {
          if (typeof queueMicrotask === 'function') { queueMicrotask(callback); return; }
          if (typeof Promise === 'function') { Promise.resolve().then(callback); return; }
        } catch (_) {}
        setTimeout(callback, 0);
      }

      function dispatchHeldAndroidPointer(kind) {
        var isDown = kind === 'down';
        var source = isDown ? __cribloHeldPointerDown : __cribloHeldPointerUp;
        if (!source) return false;
        if (isDown) __cribloHeldPointerDown = null; else __cribloHeldPointerUp = null;
        var target = source.target;
        if (!target || !target.dispatchEvent) return false;
        try {
          var event = new PointerEvent(isDown ? 'pointerdown' : 'pointerup', {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: Number(source.clientX || 0),
            clientY: Number(source.clientY || 0),
            screenX: Number(source.screenX || source.clientX || 0),
            screenY: Number(source.screenY || source.clientY || 0),
            button: Number(source.button == null ? 0 : source.button),
            buttons: isDown ? Number(source.buttons || 1) : 0,
            pointerId: Number(source.pointerId || 1),
            pointerType: 'touch',
            isPrimary: source.isPrimary !== false,
            width: Number(source.width || 9),
            height: Number(source.height || 9),
            pressure: isDown ? Number(source.pressure || 0.5) : 0,
            view: window
          });
          __cribloSyntheticContextEvents.add(event);
          __cribloSyntheticContextSources.set(event, source);
          traceAndroidEvent(isDown ? 'pointerdown' : 'pointerup', true);
          target.dispatchEvent(event);
          return true;
        } catch (_) {
          return false;
        }
      }

      function capturePhysicalTouchPointer(event, kind) {
        try {
          if (!event || __cribloSyntheticContextEvents.has(event)) return;
          if (__cribloObservedPhysicalPointers.has(event)) return;
          __cribloObservedPhysicalPointers.add(event);
          if (!event.isTrusted || String(event.pointerType || '') !== 'touch') return;

          var isDown = kind === 'down';
          if (isDown) {
            lastRealPointerDownAt = Date.now();
            lastRealPointerDownTarget = event.target || null;
          } else {
            lastRealPointerUpAt = Date.now();
            lastRealPointerUpTarget = event.target || null;
          }

          if (window.__cribloGeoReseauxAndroidCompat && mapLikeTarget(event.target)) {
            if (isDown) __cribloHeldPointerDown = event; else __cribloHeldPointerUp = event;
            // Stop only propagation of this pointer event. Do NOT preventDefault:
            // the genuine WebKit touch stream must continue normally.
            event.stopImmediatePropagation();
            return;
          }
          traceAndroidEvent(isDown ? 'pointerdown' : 'pointerup', true);
        } catch (_) {}
      }

      // Install on window first so no later GeoReseaux/OpenLayers capture listener
      // can observe WebKit's premature pointer event. Register on document too for
      // test/embedded DOM environments that do not model a full Window path.
      __cribloOriginalAddEventListener.call(window, 'pointerdown', function (event) { capturePhysicalTouchPointer(event, 'down'); }, true);
      __cribloOriginalAddEventListener.call(window, 'pointerup', function (event) { capturePhysicalTouchPointer(event, 'up'); }, true);
      __cribloOriginalAddEventListener.call(document, 'mousedown', function (event) {
        try {
          if (!event || !event.isTrusted) return;
          lastRealMouseDownAt = Date.now();
          lastRealMouseDownTarget = event.target || null;
          traceAndroidEvent('mousedown', true);
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
          if (event.isTrusted) {
            // After touchstart propagation, replay the held genuine pointerdown
            // before compatibility mouse/default work runs.
            runAfterCurrentEvent(function () { dispatchHeldAndroidPointer('down'); });
          }

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
          if (event && event.isTrusted) {
            // After touchend propagation, replay the held genuine pointerup.
            runAfterCurrentEvent(function () { dispatchHeldAndroidPointer('up'); });
          }
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
