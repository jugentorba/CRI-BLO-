from pathlib import Path
import re

swift_path = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
swift = swift_path.read_text()

swift = swift.replace(
    '    private weak var activeBrowser: CRIBrowserViewController?\n',
    '    // Keep the WKWebView/controller alive while the user returns to CRI-BLO.\n'
    '    // This preserves the exact page DOM, map position, tabs and login session.\n'
    '    private var activeBrowser: CRIBrowserViewController?\n'
)

open_pattern = re.compile(r'    @objc func open\(_ call: CAPPluginCall\) \{.*?\n    \}\n\}\n\nprivate final class CRIBrowserViewController', re.S)
new_open = r'''    @objc func open(_ call: CAPPluginCall) {
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

private final class CRIBrowserViewController'''
swift, count = open_pattern.subn(new_open, swift, count=1)
if count != 1:
    raise SystemExit('Could not replace CRIBrowserPlugin.open')

swift = swift.replace(
    '    var onClose: ((URL?, String?) -> Void)?\n',
    '    var onPermanentClose: ((URL?, String?) -> Void)?\n\n'
    '    var currentURLString: String { webView?.url?.absoluteString ?? startURL.absoluteString }\n'
    '    var currentPageTitle: String { webView?.title ?? "" }\n'
)

swift = swift.replace(
    '    private lazy var refreshButton = makeToolbarButton("arrow.clockwise", action: #selector(refreshPage))\n'
    '    private lazy var favoriteButton = makeToolbarButton("star", action: #selector(showBookmarks))\n',
    '    private lazy var refreshButton = makeToolbarButton("arrow.clockwise", action: #selector(refreshPage))\n'
    '    private lazy var minimizeButton = makeToolbarButton("chevron.down.circle", action: #selector(minimizeBrowser))\n'
    '    private lazy var favoriteButton = makeToolbarButton("star", action: #selector(showBookmarks))\n'
)

swift = swift.replace(
    '                source: Self.autofillCompatibilityScript,\n                injectionTime: .atDocumentEnd,\n',
    '                source: Self.autofillCompatibilityScript,\n                injectionTime: .atDocumentStart,\n'
)

needle = '''        if longPressCompatibility {
            configuration.userContentController.addUserScript(
                WKUserScript(
                    source: Self.longPressBridgeScript,
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: false
                )
            )
        }
'''
replacement = '''        if longPressCompatibility {
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
'''
if needle not in swift:
    raise SystemExit('Could not locate long-press user script registration')
swift = swift.replace(needle, replacement, 1)

swift = swift.replace(
    '        let controls = UIStackView(arrangedSubviews: [backButton, forwardButton, refreshButton, favoriteButton, tabsButton, moreButton])\n',
    '        minimizeButton.accessibilityLabel = "Retour à CRI-BLO"\n'
    '        minimizeButton.accessibilityHint = "Masque le navigateur sans fermer la page"\n'
    '        let controls = UIStackView(arrangedSubviews: [backButton, forwardButton, refreshButton, minimizeButton, favoriteButton, tabsButton, moreButton])\n'
)

old_disappear = '''    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || presentingViewController == nil {
            finishOnce()
        }
    }
'''
new_disappear = '''    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // A dismissal can be a Safari-style minimize back to CRI-BLO. Persist
        // metadata, but intentionally keep this controller and WKWebView alive.
        persistSessionSnapshot()
    }
'''
if old_disappear not in swift:
    raise SystemExit('Could not locate viewDidDisappear')
swift = swift.replace(old_disappear, new_disappear, 1)

swift = swift.replace(
    '''    @objc private func refreshPage() {
        webView.reload()
    }
''',
    '''    @objc private func refreshPage() {
        webView.reload()
    }

    @objc private func minimizeBrowser() {
        persistSessionSnapshot()
        dismiss(animated: true)
    }
''',
    1
)

old_more = '''    @objc private func showMore() {
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
'''
new_more = '''    @objc private func showMore() {
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
'''
if old_more not in swift:
    raise SystemExit('Could not locate showMore')
swift = swift.replace(old_more, new_more, 1)

old_finish = '''    private func finishOnce() {
        guard !completed else { return }
        completed = true
        if let url = webView?.url, url.scheme?.hasPrefix("http") == true {
            UserDefaults.standard.set(url.absoluteString, forKey: Self.lastURLKey)
        }
        persistTabs()
        onClose?(webView?.url ?? startURL, webView?.title)
        onClose = nil
    }
'''
new_finish = '''    private func persistSessionSnapshot() {
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
'''
if old_finish not in swift:
    raise SystemExit('Could not locate finishOnce')
swift = swift.replace(old_finish, new_finish, 1)

# Replace AutoFill compatibility with document-start, multi-page login pairing.
autofill = r'''    private static let autofillCompatibilityScript = #"""
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
    """#'''
pattern = re.compile(r'    private static let autofillCompatibilityScript = #"""\n.*?\n    """#\n\n    private static let longPressBridgeScript', re.S)
swift, count = pattern.subn(autofill + '\n\n    private static let longPressBridgeScript', swift, count=1)
if count != 1:
    raise SystemExit('Could not replace autofillCompatibilityScript')

# Insert Android-style JS feature signals for GeoReseaux after the new-tab HTML.
platform_script = r'''
    private static let geoReseauxPlatformCompatibilityScript = #"""
    (function () {
      try {
        var host = String(location.hostname || '').toLowerCase();
        var isTarget = host === 'mobi-prod.orange.fr' || host.indexOf('georeseaux') >= 0 || host.indexOf('geo-reseaux') >= 0;
        if (!isTarget) return;
        var androidUA = 'Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36';
        try { Object.defineProperty(navigator, 'userAgent', { configurable: true, get: function(){ return androidUA; } }); } catch (_) {}
        try { Object.defineProperty(navigator, 'platform', { configurable: true, get: function(){ return 'Linux armv8l'; } }); } catch (_) {}
        try { Object.defineProperty(navigator, 'vendor', { configurable: true, get: function(){ return 'Google Inc.'; } }); } catch (_) {}
        try { Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: function(){ return 5; } }); } catch (_) {}
        window.__cribloGeoReseauxAndroidCompat = true;
      } catch (_) {}
    })();
    """#
'''
marker = '    private static let autofillCompatibilityScript = #"""\n'
if marker not in swift:
    raise SystemExit('Could not locate autofill marker for platform script')
swift = swift.replace(marker, platform_script + '\n' + marker, 1)

# Add a touch/pointer long-hold fallback to the existing bridge. The actual
# physical iOS touch still reaches WKWebView; this fallback is only used after
# the native long-press recognizer fires and the ordinary contextmenu path was
# not consumed.
insert_before = '''      function dispatchAt(x, y) {
        clearSelection();
'''
touch_fallback = r'''      function scheduleAndroidTouchFallback(target, x, y) {
        if (!target || !target.dispatchEvent) return;
        var pointerId = 47;
        try {
          if (typeof PointerEvent === 'function') {
            target.dispatchEvent(new PointerEvent('pointerdown', {
              bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,
              screenX:x,screenY:y,button:0,buttons:1,pointerId:pointerId,
              pointerType:'touch',isPrimary:true,width:9,height:9,pressure:0.5
            }));
          }
        } catch (_) {}

        var syntheticTouch = null;
        try {
          if (typeof Touch === 'function' && typeof TouchEvent === 'function') {
            syntheticTouch = new Touch({
              identifier:pointerId,target:target,clientX:x,clientY:y,
              screenX:x,screenY:y,pageX:x+(window.scrollX||0),pageY:y+(window.scrollY||0),
              radiusX:4,radiusY:4,rotationAngle:0,force:0.5
            });
            target.dispatchEvent(new TouchEvent('touchstart', {
              bubbles:true,cancelable:true,composed:true,
              touches:[syntheticTouch],targetTouches:[syntheticTouch],changedTouches:[syntheticTouch]
            }));
          }
        } catch (_) {}

        setTimeout(function () {
          // Give GeoReseaux's own Android long-hold timer time to run before
          // ending the synthetic touch. Also deliver semantic fallbacks.
          contextMenu(target, x, y);
          jqueryContextMenu(target, x, y);
          customLongPress(target, x, y);
          try {
            if (syntheticTouch && typeof TouchEvent === 'function') {
              target.dispatchEvent(new TouchEvent('touchend', {
                bubbles:true,cancelable:true,composed:true,
                touches:[],targetTouches:[],changedTouches:[syntheticTouch]
              }));
            }
          } catch (_) {}
          try {
            if (typeof PointerEvent === 'function') {
              target.dispatchEvent(new PointerEvent('pointerup', {
                bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,
                screenX:x,screenY:y,button:0,buttons:0,pointerId:pointerId,
                pointerType:'touch',isPrimary:true,width:9,height:9,pressure:0
              }));
            }
          } catch (_) {}
        }, 560);
      }

      function dispatchAt(x, y) {
        clearSelection();
'''
if insert_before not in swift:
    raise SystemExit('Could not locate dispatchAt')
swift = swift.replace(insert_before, touch_fallback, 1)

old_tail = '''        customLongPress(candidates[0], x, y);
        return true;
      }
'''
new_tail = '''        // If no right-click/contextmenu listener consumed the event, emulate
        // the Android touch hold itself. This is intentionally last so normal
        // map context-menu implementations remain the fast path.
        scheduleAndroidTouchFallback(candidates[0], x, y);
        customLongPress(candidates[0], x, y);
        return true;
      }
'''
if old_tail not in swift:
    raise SystemExit('Could not locate dispatchAt fallback tail')
swift = swift.replace(old_tail, new_tail, 1)

swift_path.write_text(swift)

# Native navigator route: browser open() is now presentation-only on iOS, so
# the React route should describe a live/minimized session instead of "closed".
nav_path = Path('src/routes/navigateur.tsx')
nav = nav_path.read_text()
nav_pattern = re.compile(r'function NativeNavigator\(\) \{.*?\n\}\n\nfunction WebNavigator', re.S)
new_nav = r'''function NativeNavigator() {
  const mountedRef = useRef(true);
  const [opening, setOpening] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    try {
      localStorage.removeItem("criblo.browser.passwords");
    } catch {
      // ignore obsolete plaintext vault
    }
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const launch = useCallback(async () => {
    if (nativeLaunchInFlight) return;
    nativeLaunchInFlight = true;
    setOpening(true);
    setError(null);
    try {
      await syncNativeBrowserBeforeOpen().catch(() => "disabled" as const);
      const result = await openNativeCriBrowser(PINNED_ORANGE_URL, {
        longPressCompatibility: true,
        resumeLast: true,
      });
      if (result.url) {
        try {
          localStorage.setItem("criblo.browser.lastUrl", result.url);
        } catch {
          // native browser has its own persistent last-url store
        }
      }
      await backupNativeBrowserToCloud().catch(() => false);
      if (mountedRef.current) setSessionReady(true);
    } catch (cause) {
      if (mountedRef.current) {
        setError(cause instanceof Error ? cause.message : "Impossible d'ouvrir CRI-BLO Browser.");
      }
    } finally {
      nativeLaunchInFlight = false;
      if (mountedRef.current) setOpening(false);
    }
  }, []);

  useEffect(() => {
    void launch();
  }, [launch]);

  return (
    <AppShell title="Navigateur" subtitle="CRI-BLO Browser">
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-5 text-center">
        {opening ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <Globe className="h-7 w-7 text-primary" />}
        <div>
          <p className="text-sm font-bold text-foreground">
            {opening ? "Ouverture du navigateur…" : sessionReady ? "Navigateur en arrière-plan" : "CRI-BLO Browser"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sur iPhone, utilisez le bouton ↓ du navigateur pour revenir à CRI-BLO sans fermer la page. En le reprenant, la même page, la carte, les onglets et la session restent ouverts.
          </p>
        </div>
        {error ? <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">{error}</p> : null}
        {!opening ? (
          <button
            type="button"
            onClick={() => void launch()}
            className="rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground"
          >
            {sessionReady ? "Reprendre le navigateur" : "Ouvrir le navigateur"}
          </button>
        ) : null}
      </div>
    </AppShell>
  );
}

function WebNavigator'''
nav, count = nav_pattern.subn(new_nav, nav, count=1)
if count != 1:
    raise SystemExit('Could not replace NativeNavigator')
nav_path.write_text(nav)
