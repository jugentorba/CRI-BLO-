import Foundation
import Capacitor
import UIKit
import WebKit

@objc(CRIBrowserPlugin)
public class CRIBrowserPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CRIBrowserPlugin"
    public let jsName = "CRIBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    private weak var activeBrowser: CRIBrowserViewController?

    @objc func open(_ call: CAPPluginCall) {
        guard let rawURL = call.getString("url"),
              let url = URL(string: rawURL),
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
                    "url": finalURL?.absoluteString ?? rawURL,
                    "title": title ?? ""
                ])
            }
            self.activeBrowser = browser
            host.present(browser, animated: true)
        }
    }
}

private final class CRIBrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, UIGestureRecognizerDelegate {
    let startURL: URL
    let longPressCompatibility: Bool
    var onClose: ((URL?, String?) -> Void)?

    private var webView: WKWebView!
    private let toolbar = UIToolbar()
    private let addressLabel = UILabel()
    private var completed = false

    private lazy var backItem = UIBarButtonItem(
        image: UIImage(systemName: "chevron.backward"),
        style: .plain,
        target: self,
        action: #selector(goBack)
    )
    private lazy var forwardItem = UIBarButtonItem(
        image: UIImage(systemName: "chevron.forward"),
        style: .plain,
        target: self,
        action: #selector(goForward)
    )
    private lazy var refreshItem = UIBarButtonItem(
        image: UIImage(systemName: "arrow.clockwise"),
        style: .plain,
        target: self,
        action: #selector(refreshPage)
    )
    private lazy var closeItem = UIBarButtonItem(
        image: UIImage(systemName: "xmark"),
        style: .plain,
        target: self,
        action: #selector(closeBrowser)
    )

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
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences.preferredContentMode = .recommended

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

        if longPressCompatibility {
            let longPress = UILongPressGestureRecognizer(target: self, action: #selector(handleNativeLongPress(_:)))
            longPress.minimumPressDuration = 0.55
            longPress.cancelsTouchesInView = false
            longPress.delegate = self
            webView.addGestureRecognizer(longPress)
        }

        addressLabel.font = .systemFont(ofSize: 12, weight: .semibold)
        addressLabel.textColor = .label
        addressLabel.textAlignment = .center
        addressLabel.lineBreakMode = .byTruncatingMiddle
        addressLabel.frame = CGRect(x: 0, y: 0, width: 180, height: 32)

        toolbar.translatesAutoresizingMaskIntoConstraints = false
        let leftSpace = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        let rightSpace = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        toolbar.items = [
            backItem,
            forwardItem,
            refreshItem,
            leftSpace,
            UIBarButtonItem(customView: addressLabel),
            rightSpace,
            closeItem
        ]

        view.addSubview(toolbar)
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            toolbar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            toolbar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            toolbar.heightAnchor.constraint(equalToConstant: 44),
            webView.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        updateToolbar()
        webView.load(URLRequest(url: startURL))
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
        if webView.canGoBack {
            webView.goBack()
        }
    }

    @objc private func goForward() {
        if webView.canGoForward {
            webView.goForward()
        }
    }

    @objc private func refreshPage() {
        webView.reload()
    }

    @objc private func closeBrowser() {
        dismiss(animated: true) { [weak self] in
            self?.finishOnce()
        }
    }

    private func finishOnce() {
        guard !completed else { return }
        completed = true
        onClose?(webView?.url ?? startURL, webView?.title)
        onClose = nil
    }

    private func updateToolbar() {
        guard isViewLoaded else { return }
        backItem.isEnabled = webView?.canGoBack ?? false
        forwardItem.isEnabled = webView?.canGoForward ?? false
        if let host = webView?.url?.host, !host.isEmpty {
            addressLabel.text = host.replacingOccurrences(of: "www.", with: "")
        } else {
            addressLabel.text = "CRI-BLO"
        }
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
        updateToolbar()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        updateToolbar()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        updateToolbar()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        updateToolbar()
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
        // Keep the page in control of long-press behaviour instead of showing
        // Safari's preview/context menu over interactive field maps.
        completionHandler(nil)
    }

    private static let longPressBridgeScript = #"""
    (function () {
      if (window.__cribloLongPressInstalled) return;
      window.__cribloLongPressInstalled = true;

      function clamp01(value) {
        value = Number(value || 0);
        return Math.max(0, Math.min(1, value));
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

      function dispatchAt(x, y) {
        var target = document.elementFromPoint(x, y);
        if (!target) return false;

        // GeoReseaux and similar enterprise mapping pages can host their map in
        // a same-origin or cross-origin iframe. postMessage is allowed across
        // origins and this bridge is injected into every WKWebView frame, so
        // forward normalized coordinates recursively until the map frame gets it.
        if (target.tagName === 'IFRAME' || target.tagName === 'FRAME') {
          return forwardIntoFrame(target, x, y);
        }

        // Normal link navigation remains a normal tap. This compatibility path
        // exists for map/canvas interactions that iOS WebKit may otherwise eat.
        var link = target.closest && target.closest('a[href]');
        if (link) return false;

        var init = {
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
        };

        try {
          target.dispatchEvent(new MouseEvent('contextmenu', init));
        } catch (_) {
          try {
            var evt = document.createEvent('MouseEvents');
            evt.initMouseEvent('contextmenu', true, true, window, 1, x, y, x, y, false, false, false, false, 2, null);
            target.dispatchEvent(evt);
          } catch (_) {}
        }

        try {
          target.dispatchEvent(new CustomEvent('longpress', {
            bubbles: true,
            cancelable: true,
            composed: true,
            detail: { clientX: x, clientY: y, source: 'criblo-ios' }
          }));
        } catch (_) {}

        return true;
      }

      window.addEventListener('message', function (event) {
        var data = event && event.data;
        if (!data || data.__cribloLongPress !== true) return;
        var x = window.innerWidth * clamp01(data.rx);
        var y = window.innerHeight * clamp01(data.ry);
        dispatchAt(x, y);
      }, false);

      window.__cribloDispatchLongPress = function (rx, ry) {
        var x = window.innerWidth * clamp01(rx);
        var y = window.innerHeight * clamp01(ry);
        return dispatchAt(x, y);
      };
    })();
    """#
}
