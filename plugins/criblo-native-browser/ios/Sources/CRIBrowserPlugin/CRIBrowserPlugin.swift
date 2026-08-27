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

    private weak var activeBrowser: CRIBrowserViewController?

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
            guard self.activeBrowser == nil else {
                call.reject("Un navigateur CRI-BLO est déjà ouvert.")
                return
            }
            guard let host = self.bridge?.viewController else {
                call.reject("Vue native indisponible.")
                return
            }

            let browser = CRIBrowserViewController(
                startURL: url,
                longPressCompatibility: longPressCompatibility
            )
            browser.modalPresentationStyle = .fullScreen
            browser.onClose = { [weak self] finalURL, title in
                self?.activeBrowser = nil
                call.resolve([
                    "url": finalURL?.absoluteString ?? startString,
                    "title": title ?? ""
                ])
            }
            self.activeBrowser = browser
            host.present(browser, animated: true)
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
    var onClose: ((URL?, String?) -> Void)?

    private var webView: WKWebView!
    private let chrome = UIVisualEffectView(effect: UIBlurEffect(style: .systemChromeMaterial))
    private let addressField = UITextField()
    private var completed = false
    private var tabURLs: [String] = []
    private var currentTabIndex = 0

    private lazy var backButton = makeToolbarButton("chevron.backward", action: #selector(goBack))
    private lazy var forwardButton = makeToolbarButton("chevron.forward", action: #selector(goForward))
    private lazy var refreshButton = makeToolbarButton("arrow.clockwise", action: #selector(refreshPage))
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
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: false
            )
        )

        if longPressCompatibility {
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
        webView.translatesAutoresizingMaskIntoConstraints = false

        // Orange/SiteMinder can reject the stripped WKWebView user agent after
        // authentication even though the same account works in Safari. Present a
        // normal mobile Safari identity while retaining WKWebView cookie/session
        // persistence in the app's default website data store.
        let os = UIDevice.current.systemVersion.replacingOccurrences(of: ".", with: "_")
        let major = UIDevice.current.systemVersion.split(separator: ".").first.map(String.init) ?? "18"
        webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS \(os) like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/\(major).0 Mobile/15E148 Safari/604.1"

        if longPressCompatibility {
            let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleNativeLongPress(_:)))
            longPress.minimumPressDuration = 0.48
            longPress.cancelsTouchesInView = false
            longPress.delegate = self
            webView.addGestureRecognizer(longPress)
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

        let controls = UIStackView(arrangedSubviews: [backButton, forwardButton, refreshButton, favoriteButton, tabsButton, moreButton])
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
        if isBeingDismissed || presentingViewController == nil {
            finishOnce()
        }
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
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
        controller.addAction(UIAlertAction(title: "Historique", style: .default) { [weak self] _ in
            self?.showHistory()
        })
        controller.addAction(UIAlertAction(title: "Partager", style: .default) { [weak self] _ in
            self?.shareCurrentPage()
        })
        controller.addAction(UIAlertAction(title: "Ouvrir dans Safari", style: .default) { [weak self] _ in
            guard let url = self?.webView.url else { return }
            UIApplication.shared.open(url)
        })
        controller.addAction(UIAlertAction(title: "Fermer le navigateur", style: .destructive) { [weak self] _ in
            self?.dismiss(animated: true) { self?.finishOnce() }
        })
        controller.addAction(UIAlertAction(title: "Annuler", style: .cancel))
        presentActionSheet(controller, source: moreButton)
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

    private func finishOnce() {
        guard !completed else { return }
        completed = true
        if let url = webView?.url, url.scheme?.hasPrefix("http") == true {
            UserDefaults.standard.set(url.absoluteString, forKey: Self.lastURLKey)
        }
        persistTabs()
        onClose?(webView?.url ?? startURL, webView?.title)
        onClose = nil
    }

    @objc private func handleNativeLongPress(_ recognizer: UILongPressGestureRecognizer) {
        guard recognizer.state == .began,
              webView.bounds.width > 0,
              webView.bounds.height > 0 else { return }

        let location = recognizer.location(in: webView)
        let rx = max(0, min(1, location.x / webView.bounds.width))
        let ry = max(0, min(1, location.y / webView.bounds.height))

        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let script = "window.__cribloDispatchLongPress && window.__cribloDispatchLongPress(\(rx), \(ry));"
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        updateChrome()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
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

        if scheme == "http" || scheme == "https" || scheme == "about" || scheme == "blob" || scheme == "data" {
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

    @available(iOS 13.0, *)
    func webView(
        _ webView: WKWebView,
        contextMenuConfigurationForElement elementInfo: WKContextMenuElementInfo,
        completionHandler: @escaping (UIContextMenuConfiguration?) -> Void
    ) {
        completionHandler(nil)
    }

    private static let newTabHTML = #"""
    <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f5f7;color:#111;margin:0;padding:32px 20px;text-align:center}
    .card{display:block;margin:32px auto 0;max-width:320px;padding:18px;border-radius:18px;background:#fff;color:#111;text-decoration:none;box-shadow:0 4px 20px rgba(0,0,0,.08)}
    .o{width:48px;height:48px;margin:auto;background:#ff7900;color:#fff;border-radius:12px;display:grid;place-items:center;font-weight:800}
    </style></head><body><h2>CRI-BLO Browser</h2><p>Favoris</p><a class="card" href="https://mobi-prod.orange.fr/mobi2/web/home/?codeContexte=MOBI2"><div class="o">O</div><strong>Orange GeoReseaux</strong></a></body></html>
    """#

    private static let autofillCompatibilityScript = #"""
    (function () {
      if (window.__cribloAutofillInstalled) return;
      window.__cribloAutofillInstalled = true;
      function mark(input) {
        if (!input || input.nodeType !== 1 || input.tagName !== 'INPUT') return;
        var type = String(input.getAttribute('type') || 'text').toLowerCase();
        var current = String(input.getAttribute('autocomplete') || '').trim().toLowerCase();
        if (current && current !== 'on') return;
        var hint = [input.getAttribute('name'),input.getAttribute('id'),input.getAttribute('placeholder'),input.getAttribute('aria-label')].filter(Boolean).join(' ').toLowerCase();
        if (type === 'password') { input.setAttribute('autocomplete', /new|create|confirm|nouveau|confirmer|signup|register/.test(hint) ? 'new-password' : 'current-password'); return; }
        if (/user|username|login|email|mail|identifiant|compte|account/.test(hint)) { input.setAttribute('autocomplete', 'username'); return; }
        if (/otp|one.?time|verification|vérification|security.?code|code.?securite|code.?sécurité/.test(hint)) input.setAttribute('autocomplete', 'one-time-code');
      }
      function scan(root) {
        try { if (root && root.matches && root.matches('input')) mark(root); var nodes = root && root.querySelectorAll ? root.querySelectorAll('input') : []; for (var i=0;i<nodes.length;i++) mark(nodes[i]); } catch (_) {}
      }
      scan(document);
      try { new MutationObserver(function(changes){ for(var i=0;i<changes.length;i++){var added=changes[i].addedNodes||[];for(var j=0;j<added.length;j++)scan(added[j]);}}).observe(document.documentElement||document,{childList:true,subtree:true}); } catch (_) {}
    })();
    """#

    private static let longPressBridgeScript = #"""
    (function () {
      if (window.__cribloLongPressInstalled) return;
      window.__cribloLongPressInstalled = true;

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

      function mouse(target, type, x, y, button, buttons) {
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
            view: window
          });
          return !target.dispatchEvent(event) || event.defaultPrevented;
        } catch (_) {
          try {
            var legacy = document.createEvent('MouseEvents');
            legacy.initMouseEvent(type, true, true, window, 1, x, y, x, y,
              false, false, false, false, button, null);
            return !target.dispatchEvent(legacy) || legacy.defaultPrevented;
          } catch (_) {
            return false;
          }
        }
      }

      function contextMenu(target, x, y) {
        try {
          var event;
          if (typeof PointerEvent === 'function') {
            event = new PointerEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y,
              button: 2,
              buttons: 2,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
              width: 1,
              height: 1,
              pressure: 0.5,
              view: window
            });
          } else {
            event = new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              composed: true,
              clientX: x,
              clientY: y,
              screenX: x,
              screenY: y,
              button: 2,
              buttons: 2,
              view: window
            });
          }
          return !target.dispatchEvent(event) || event.defaultPrevented;
        } catch (_) {
          return mouse(target, 'contextmenu', x, y, 2, 2);
        }
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
            button: 2,
            buttons: 2,
            which: 3
          });
          jq(target).trigger(event);
          return !!(event.isDefaultPrevented && event.isDefaultPrevented());
        } catch (_) {
          return false;
        }
      }

      function customLongPress(target, x, y) {
        try {
          target.dispatchEvent(new CustomEvent('longpress', {
            bubbles: true,
            cancelable: true,
            composed: true,
            detail: { clientX: x, clientY: y, source: 'criblo-ios' }
          }));
        } catch (_) {}
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

      function dispatchToTarget(target, x, y) {
        if (!target || !target.dispatchEvent) return false;

        var tag = String(target.tagName || '').toUpperCase();
        if (tag === 'IFRAME' || tag === 'FRAME') {
          return forwardIntoFrame(target, x, y);
        }

        var link = target.closest && target.closest('a[href]');
        if (link && tag !== 'CANVAS' && tag !== 'SVG' && tag !== 'PATH') return false;

        pointer(target, 'pointerdown', x, y, 2, 2);
        mouse(target, 'mousedown', x, y, 2, 2);

        var handled = contextMenu(target, x, y);
        if (!handled) handled = jqueryContextMenu(target, x, y);
        if (!handled) customLongPress(target, x, y);

        pointer(target, 'pointerup', x, y, 2, 0);
        mouse(target, 'mouseup', x, y, 2, 0);
        mouse(target, 'auxclick', x, y, 2, 0);
        return handled;
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

        customLongPress(candidates[0], x, y);
        return true;
      }

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
    })();
    """#
}
