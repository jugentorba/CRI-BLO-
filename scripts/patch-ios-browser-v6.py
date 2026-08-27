from pathlib import Path
import re

swift_path = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
info_path = Path('scripts/patch-ios-info.mjs')
text = swift_path.read_text()

# Native frameworks used by the secure credential helper.
if 'import LocalAuthentication' not in text:
    text = text.replace('import WebKit\n', 'import WebKit\nimport LocalAuthentication\nimport Security\n', 1)

support_anchor = '@objc(CRIBrowserPlugin)\npublic class CRIBrowserPlugin'
if 'private final class BrowserCredentialStore' not in text:
    support = r'''
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(_ delegate: WKScriptMessageHandler) {
        self.delegate = delegate
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

private final class BrowserCredentialStore {
    static let shared = BrowserCredentialStore()
    private let servicePrefix = "com.criblo.browser.password."
    private let accountsPrefix = "criblo.browser.password.accounts."

    func normalizedHost(_ raw: String) -> String {
        let host = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        // Orange authentication moves between dro.orange.fr and mobi-prod.orange.fr.
        // Treat that login family as one credential scope while keeping unrelated
        // sites isolated from one another.
        if host == "dro.orange.fr" || host == "mobi-prod.orange.fr" || host.hasSuffix(".mobi-prod.orange.fr") {
            return "orange.fr"
        }
        return host
    }

    private func service(for host: String) -> String {
        servicePrefix + normalizedHost(host)
    }

    private func accountKey(for host: String) -> String {
        accountsPrefix + normalizedHost(host)
    }

    func accounts(for host: String) -> [String] {
        UserDefaults.standard.stringArray(forKey: accountKey(for: host)) ?? []
    }

    func contains(host: String, username: String) -> Bool {
        accounts(for: host).contains(username)
    }

    @discardableResult
    func save(host: String, username: String, password: String) -> Bool {
        guard !username.isEmpty, !password.isEmpty, let data = password.data(using: .utf8) else { return false }

        var accessError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            .userPresence,
            &accessError
        ) else { return false }

        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service(for: host),
            kSecAttrAccount as String: username,
        ]
        SecItemDelete(base as CFDictionary)

        var item = base
        item[kSecValueData as String] = data
        item[kSecAttrAccessControl as String] = access
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { return false }

        var known = accounts(for: host).filter { $0 != username }
        known.insert(username, at: 0)
        UserDefaults.standard.set(Array(known.prefix(8)), forKey: accountKey(for: host))
        return true
    }

    func read(host: String, username: String, reason: String, completion: @escaping (String?) -> Void) {
        let context = LAContext()
        context.localizedCancelTitle = "Annuler"
        var policyError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &policyError) else {
            completion(nil)
            return
        }

        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { [service = service(for: host)] success, _ in
            guard success else {
                DispatchQueue.main.async { completion(nil) }
                return
            }

            var query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: username,
                kSecReturnData as String: true,
                kSecMatchLimit as String: kSecMatchLimitOne,
                kSecUseAuthenticationContext as String: context,
            ]
            var result: CFTypeRef?
            let status = SecItemCopyMatching(query as CFDictionary, &result)
            let password: String?
            if status == errSecSuccess, let data = result as? Data {
                password = String(data: data, encoding: .utf8)
            } else {
                password = nil
            }
            query.removeAll()
            DispatchQueue.main.async { completion(password) }
        }
    }

    func delete(host: String, username: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service(for: host),
            kSecAttrAccount as String: username,
        ]
        SecItemDelete(query as CFDictionary)
        let remaining = accounts(for: host).filter { $0 != username }
        UserDefaults.standard.set(remaining, forKey: accountKey(for: host))
    }
}

'''
    if support_anchor not in text:
        raise SystemExit('support insertion anchor not found')
    text = text.replace(support_anchor, support + support_anchor, 1)

old_decl = 'private final class CRIBrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, UIGestureRecognizerDelegate, UITextFieldDelegate {'
new_decl = 'private final class CRIBrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, UIGestureRecognizerDelegate, UITextFieldDelegate, WKScriptMessageHandler {'
if old_decl in text:
    text = text.replace(old_decl, new_decl, 1)
elif new_decl not in text:
    raise SystemExit('view controller declaration anchor not found')

property_anchor = '    private var currentTabIndex = 0\n'
if 'credentialMessageHandler' not in text:
    props = '''    private var currentTabIndex = 0\n    private lazy var credentialMessageHandler = WeakScriptMessageHandler(self)\n    private let credentialStore = BrowserCredentialStore.shared\n    private var autofillInFlight = false\n    private var lastAutofillAt: TimeInterval = 0\n'''
    if property_anchor not in text:
        raise SystemExit('property insertion anchor not found')
    text = text.replace(property_anchor, props, 1)

# Register the page -> native credential bridge before WKWebView is created.
bridge_anchor = '        configuration.defaultWebpagePreferences.preferredContentMode = .recommended\n'
if 'add(credentialMessageHandler, name: "cribloCredential")' not in text:
    bridge_block = bridge_anchor + '''        configuration.userContentController.add(credentialMessageHandler, name: "cribloCredential")\n'''
    if bridge_anchor not in text:
        raise SystemExit('configuration anchor not found')
    text = text.replace(bridge_anchor, bridge_block, 1)

# Reduce UIKit delays around map touches. This does not cancel the page's real touch stream.
scroll_anchor = '        webView.scrollView.keyboardDismissMode = .interactive\n'
if 'webView.scrollView.delaysContentTouches = false' not in text:
    if scroll_anchor not in text:
        raise SystemExit('scroll view anchor not found')
    text = text.replace(scroll_anchor, scroll_anchor + '        webView.scrollView.delaysContentTouches = false\n', 1)

# Add secure credential bridge methods before native long-press handler.
method_anchor = '    @objc private func handleNativeLongPress(_ recognizer: UILongPressGestureRecognizer) {'
if 'private func handleCredentialAutofill' not in text:
    methods = r'''    private func trustedMessageHost(_ message: WKScriptMessage) -> String? {
        let originHost = message.frameInfo.securityOrigin.host.lowercased()
        if !originHost.isEmpty { return originHost }
        return message.frameInfo.request.url?.host?.lowercased()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "cribloCredential",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String,
              let host = trustedMessageHost(message) else { return }

        let username = (body["username"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        switch action {
        case "requestUsername":
            let accounts = credentialStore.accounts(for: host)
            guard accounts.count == 1 else { return }
            fillUsername(accounts[0], in: message.frameInfo)
        case "requestAutofill":
            handleCredentialAutofill(host: host, preferredUsername: username, frame: message.frameInfo)
        case "saveCandidate":
            guard let password = body["password"] as? String, !password.isEmpty else { return }
            let nativeFilled = body["nativeFilled"] as? Bool ?? false
            if nativeFilled { return }
            offerCredentialSave(host: host, username: username, password: password)
        default:
            break
        }
    }

    private func fillUsername(_ username: String, in frame: WKFrameInfo) {
        guard !username.isEmpty else { return }
        webView.callAsyncJavaScript(
            "return window.__cribloFillUsername ? window.__cribloFillUsername(username) : false;",
            arguments: ["username": username],
            in: frame,
            in: .page,
            completionHandler: nil
        )
    }

    private func handleCredentialAutofill(host: String, preferredUsername: String, frame: WKFrameInfo) {
        guard !autofillInFlight else { return }
        let now = Date().timeIntervalSince1970
        guard now - lastAutofillAt > 1.25 else { return }

        let accounts = credentialStore.accounts(for: host)
        guard !accounts.isEmpty else { return }
        let selected: String?
        if !preferredUsername.isEmpty, accounts.contains(preferredUsername) {
            selected = preferredUsername
        } else if accounts.count == 1 {
            selected = accounts[0]
        } else {
            selected = nil
        }

        if let selected {
            unlockAndFill(host: host, username: selected, frame: frame)
            return
        }

        let controller = UIAlertController(title: "Compte enregistré", message: "Choisissez le compte à remplir.", preferredStyle: .actionSheet)
        for account in accounts.prefix(8) {
            controller.addAction(UIAlertAction(title: account, style: .default) { [weak self] _ in
                self?.unlockAndFill(host: host, username: account, frame: frame)
            })
        }
        controller.addAction(UIAlertAction(title: "Annuler", style: .cancel))
        presentActionSheet(controller, source: moreButton)
    }

    private func unlockAndFill(host: String, username: String, frame: WKFrameInfo) {
        autofillInFlight = true
        lastAutofillAt = Date().timeIntervalSince1970
        let display = credentialStore.normalizedHost(host)
        credentialStore.read(host: host, username: username, reason: "Remplir le mot de passe pour \(display) avec Face ID") { [weak self] password in
            guard let self else { return }
            self.autofillInFlight = false
            guard let password else { return }
            self.webView.callAsyncJavaScript(
                "return window.__cribloFillCredential ? window.__cribloFillCredential(credential) : false;",
                arguments: ["credential": ["username": username, "password": password]],
                in: frame,
                in: .page,
                completionHandler: nil
            )
        }
    }

    private func offerCredentialSave(host: String, username: String, password: String) {
        guard !username.isEmpty, !password.isEmpty else { return }
        let exists = credentialStore.contains(host: host, username: username)
        let title = exists ? "Mettre à jour le mot de passe ?" : "Enregistrer le mot de passe ?"
        let message = "CRI-BLO peut le conserver uniquement dans le trousseau sécurisé de cet iPhone. Face ID sera demandé pour le remplir ensuite."
        let controller = UIAlertController(title: title, message: message, preferredStyle: .alert)
        controller.addAction(UIAlertAction(title: exists ? "Mettre à jour" : "Enregistrer", style: .default) { [weak self] _ in
            _ = self?.credentialStore.save(host: host, username: username, password: password)
        })
        controller.addAction(UIAlertAction(title: "Pas maintenant", style: .cancel))
        present(controller, animated: true)
    }

'''
    if method_anchor not in text:
        raise SystemExit('method insertion anchor not found')
    text = text.replace(method_anchor, methods + method_anchor, 1)

# Strengthen the existing AutoFill script with a native Keychain/Face ID bridge.
auto_pattern = re.compile(r'(    private static let autofillCompatibilityScript = #"""\n)(.*?)(\n    \}\)\(\);\n    """#)', re.S)
auto_match = auto_pattern.search(text)
if not auto_match:
    raise SystemExit('autofill script not found')
auto_body = auto_match.group(2)
if '__cribloFillCredential' not in auto_body:
    extra = r'''

      var __cribloLastCredentialPost = '';
      var __cribloNativeFilled = false;

      function nativeCredentialMessage(action, payload) {
        try {
          var handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cribloCredential;
          if (!handler || !handler.postMessage) return;
          var message = payload || {};
          message.action = action;
          handler.postMessage(message);
        } catch (_) {}
      }

      function setNativeValue(input, value) {
        if (!input || typeof value !== 'string') return;
        try {
          var descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          if (descriptor && descriptor.set) descriptor.set.call(input, value);
          else input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) { try { input.value = value; } catch (_) {} }
      }

      function visibleUsernameInput() {
        var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
        for (var i = 0; i < inputs.length; i++) if (isUsernameCandidate(inputs[i])) return inputs[i];
        return null;
      }

      function currentUsername() {
        try {
          var input = visibleUsernameInput();
          if (input && input.value) return String(input.value).trim();
          return String(sessionStorage.getItem('__cribloLoginUsername') || '').trim();
        } catch (_) { return ''; }
      }

      function rememberUsername(input) {
        try {
          if (!isUsernameCandidate(input)) return;
          var value = String(input.value || '').trim();
          if (value) sessionStorage.setItem('__cribloLoginUsername', value);
        } catch (_) {}
      }

      window.__cribloFillUsername = function (username) {
        var input = visibleUsernameInput();
        if (!input || input.value || !username) return false;
        setNativeValue(input, String(username));
        rememberUsername(input);
        return true;
      };

      window.__cribloFillCredential = function (credential) {
        if (!credential) return false;
        var username = String(credential.username || '');
        var password = String(credential.password || '');
        if (username) {
          var userInput = visibleUsernameInput();
          if (userInput && !userInput.value) setNativeValue(userInput, username);
          try { sessionStorage.setItem('__cribloLoginUsername', username); } catch (_) {}
        }
        var passwords = Array.prototype.slice.call(document.querySelectorAll('input[type="password"]'));
        var filled = false;
        for (var i = 0; i < passwords.length; i++) {
          if (!visible(passwords[i])) continue;
          setNativeValue(passwords[i], password);
          filled = true;
          break;
        }
        if (filled) __cribloNativeFilled = true;
        return filled;
      };

      document.addEventListener('input', function (event) {
        rememberUsername(event && event.target);
      }, true);

      document.addEventListener('focusin', function (event) {
        try {
          var target = event && event.target;
          if (!target || target.tagName !== 'INPUT') return;
          var type = String(target.getAttribute('type') || 'text').toLowerCase();
          if (type === 'password') {
            nativeCredentialMessage('requestAutofill', { username: currentUsername() });
          } else if (isUsernameCandidate(target) && !target.value) {
            nativeCredentialMessage('requestUsername', {});
          }
        } catch (_) {}
      }, true);

      function postSaveCandidate() {
        try {
          var passwordInput = document.querySelector('input[type="password"]');
          if (!passwordInput || !passwordInput.value) return;
          var username = currentUsername();
          if (!username) return;
          var signature = username + '|' + passwordInput.value.length + '|' + String(Date.now()).slice(0, -3);
          if (__cribloLastCredentialPost === signature) return;
          __cribloLastCredentialPost = signature;
          nativeCredentialMessage('saveCandidate', {
            username: username,
            password: String(passwordInput.value),
            nativeFilled: !!__cribloNativeFilled
          });
        } catch (_) {}
      }

      document.addEventListener('submit', function () { postSaveCandidate(); }, true);
      document.addEventListener('click', function (event) {
        try {
          var target = event && event.target && event.target.closest ? event.target.closest('button,input[type="submit"]') : null;
          if (!target) return;
          if (document.querySelector('input[type="password"]')) setTimeout(postSaveCandidate, 0);
        } catch (_) {}
      }, true);
'''
    auto_body += extra
    text = text[:auto_match.start()] + auto_match.group(1) + auto_body + auto_match.group(3) + text[auto_match.end():]

# Capture the full gesture family instead of contextmenu-only listeners.
text = text.replace(
    '/^(contextmenu|longpress|long-press|hold|press)$/.test(name)',
    '/^(contextmenu|longpress|long-press|hold|press|pointerdown|pointerup|touchstart|touchend|mousedown|mouseup)$/.test(name)',
)

# Replace the event facade with a proxy over the genuine trusted iPhone touch.
# Directly called page handlers then retain Event semantics/isTrusted while seeing
# the right event type and coordinates.
context_pattern = re.compile(r'      function compatibleContextEvent\(target, currentTarget, x, y, sourceEvent\) \{.*?\n      \}\n\n      function callCapturedListener', re.S)
context_replacement = r'''      function compatibleEvent(type, target, currentTarget, x, y, sourceEvent) {
        var synthetic;
        try {
          synthetic = new MouseEvent(type === 'contextmenu' ? 'contextmenu' : type, {
            bubbles: true, cancelable: true, composed: true,
            clientX: x, clientY: y, screenX: x, screenY: y,
            button: type === 'contextmenu' ? 2 : 0,
            buttons: type === 'contextmenu' ? 2 : 1,
            view: window
          });
        } catch (_) { synthetic = {}; }

        // Prefer the genuine WebKit touchstart as the proxy target. isTrusted and
        // Event internal behavior then come from a real user gesture even though
        // we call GeoReseaux's callback directly.
        var raw = sourceEvent || synthetic;
        var prevented = false;
        var stopped = false;
        var immediate = false;
        var path = [];
        var n = target;
        while (n) { path.push(n); n = n.parentNode; }
        if (path.indexOf(document) < 0) path.push(document);
        path.push(window);
        var touch = null;
        try { touch = sourceEvent && sourceEvent.touches && sourceEvent.touches[0]; } catch (_) {}
        var touchPoint = {
          identifier: touch && touch.identifier != null ? touch.identifier : 1,
          target: target,
          clientX: x, clientY: y, pageX: x + (window.scrollX || 0), pageY: y + (window.scrollY || 0),
          screenX: x, screenY: y, radiusX: 4, radiusY: 4, rotationAngle: 0, force: 0.5
        };
        var overrides = {
          type: type, target: target, srcElement: target, currentTarget: currentTarget,
          eventPhase: currentTarget === target ? 2 : 3,
          button: type === 'contextmenu' ? 2 : 0,
          buttons: type === 'contextmenu' ? 2 : (type.indexOf('up') >= 0 || type === 'touchend' ? 0 : 1),
          which: type === 'contextmenu' ? 3 : 1,
          clientX: x, clientY: y, pageX: x + (window.scrollX || 0), pageY: y + (window.scrollY || 0),
          screenX: x, screenY: y, pointerId: 1, pointerType: 'touch', isPrimary: true,
          touches: type === 'touchend' ? [] : [touchPoint],
          targetTouches: type === 'touchend' ? [] : [touchPoint],
          changedTouches: [touchPoint],
          originalEvent: sourceEvent || synthetic,
          nativeEvent: sourceEvent || synthetic,
          srcEvent: sourceEvent || synthetic,
          preventDefault: function () { prevented = true; try { sourceEvent && sourceEvent.preventDefault && sourceEvent.preventDefault(); } catch (_) {} },
          stopPropagation: function () { stopped = true; },
          stopImmediatePropagation: function () { stopped = true; immediate = true; },
          composedPath: function () { return path.slice(); }
        };
        try {
          return new Proxy(raw, {
            getPrototypeOf: function () {
              try { return type === 'contextmenu' && window.MouseEvent ? MouseEvent.prototype : Object.getPrototypeOf(raw); }
              catch (_) { return Object.getPrototypeOf(raw); }
            },
            get: function (obj, prop) {
              if (prop === '__cribloPrevented') return prevented;
              if (prop === '__cribloStopped') return stopped;
              if (prop === '__cribloImmediate') return immediate;
              if (prop === 'defaultPrevented') return prevented;
              if (prop === 'isTrusted' && sourceEvent) return sourceEvent.isTrusted;
              if (Object.prototype.hasOwnProperty.call(overrides, prop)) return overrides[prop];
              var value;
              try { value = Reflect.get(obj, prop, obj); } catch (_) { value = obj[prop]; }
              return typeof value === 'function' ? value.bind(obj) : value;
            }
          });
        } catch (_) {
          return synthetic;
        }
      }

      function compatibleContextEvent(target, currentTarget, x, y, sourceEvent) {
        return compatibleEvent('contextmenu', target, currentTarget, x, y, sourceEvent);
      }

      function callCapturedListener'''
text, count = context_pattern.subn(context_replacement, text, count=1)
if count != 1:
    raise SystemExit('compatible event replacement failed')

# Replace contextmenu-only direct calling with all captured semantic hold handlers.
invoke_pattern = re.compile(r'      function invokeCapturedContextMenu\(target, x, y, sourceEvent\) \{.*?\n      \}\n\n      function clamp01', re.S)
invoke_replacement = r'''      function invokeCapturedHandlers(target, x, y, sourceEvent) {
        if (!target) return false;
        var path = [];
        var node = target;
        while (node) { path.push(node); node = node.parentNode; }
        if (path.indexOf(document) < 0) path.push(document);
        path.push(window);
        __cribloGeoDiag.capturedListeners = listenerCountOnPath(target);

        var semanticTypes = ['contextmenu', 'longpress', 'long-press', 'hold', 'press'];
        var invoked = false;
        for (var t = 0; t < semanticTypes.length; t++) {
          var eventType = semanticTypes[t];
          // Capture phase.
          for (var p = path.length - 1; p >= 0; p--) {
            var current = path[p];
            var entries = __cribloCapturedListeners.get(current) || [];
            for (var i = 0; i < entries.length; i++) {
              if (entries[i].type !== eventType) continue;
              var event = compatibleEvent(eventType, target, current, x, y, sourceEvent);
              if (callCapturedListener(entries[i], current, event)) { invoked = true; __cribloGeoDiag.capturedCalls++; }
              if (event.__cribloImmediate || event.__cribloStopped) break;
            }
          }
          // Bubble phase.
          for (var b = 0; b < path.length; b++) {
            var bubbleCurrent = path[b];
            var bubbleEntries = __cribloCapturedListeners.get(bubbleCurrent) || [];
            for (var j = 0; j < bubbleEntries.length; j++) {
              if (bubbleEntries[j].type !== eventType) continue;
              var bubbleEvent = compatibleEvent(eventType, target, bubbleCurrent, x, y, sourceEvent);
              if (callCapturedListener(bubbleEntries[j], bubbleCurrent, bubbleEvent)) { invoked = true; __cribloGeoDiag.capturedCalls++; }
              if (bubbleEvent.__cribloImmediate || bubbleEvent.__cribloStopped) break;
            }
          }
        }

        // Property handlers can live on a parent/container rather than the SVG/canvas child.
        for (var k = 0; k < path.length; k++) {
          try {
            var propertyTarget = path[k];
            if (propertyTarget && typeof propertyTarget.oncontextmenu === 'function') {
              propertyTarget.oncontextmenu(compatibleContextEvent(target, propertyTarget, x, y, sourceEvent));
              __cribloGeoDiag.capturedCalls++; invoked = true;
            }
          } catch (_) {}
        }
        return invoked;
      }

      function clamp01'''
text, count = invoke_pattern.subn(invoke_replacement, text, count=1)
if count != 1:
    raise SystemExit('captured handler replacement failed')

# Record map objects when common engines create them, then prefer those exact
# instances over shallow global object guessing.
map_anchor = '      function invokeMapEngine(target, x, y, sourceEvent) {\n        var values = safeObjectValues(window, 2);'
if '__cribloMapInstances' not in text:
    map_registry = r'''      var __cribloMapInstances = [];
      function rememberMapInstance(map) {
        if (map && __cribloMapInstances.indexOf(map) < 0) __cribloMapInstances.push(map);
        if (__cribloMapInstances.length > 16) __cribloMapInstances.shift();
      }

      function wrapMapConstructors() {
        try {
          if (window.L && typeof window.L.map === 'function' && !window.L.map.__cribloWrapped) {
            var originalLeafletMap = window.L.map;
            var wrappedLeafletMap = function () {
              var map = originalLeafletMap.apply(this, arguments);
              rememberMapInstance(map); return map;
            };
            Object.keys(originalLeafletMap).forEach(function (key) { try { wrappedLeafletMap[key] = originalLeafletMap[key]; } catch (_) {} });
            wrappedLeafletMap.__cribloWrapped = true;
            window.L.map = wrappedLeafletMap;
          }
        } catch (_) {}
        try {
          if (window.ol && typeof window.ol.Map === 'function' && !window.ol.Map.__cribloWrapped) {
            var OriginalOlMap = window.ol.Map;
            var WrappedOlMap = new Proxy(OriginalOlMap, {
              construct: function (target, args, newTarget) {
                var map = Reflect.construct(target, args, newTarget); rememberMapInstance(map); return map;
              }
            });
            WrappedOlMap.__cribloWrapped = true; window.ol.Map = WrappedOlMap;
          }
        } catch (_) {}
        ['mapboxgl', 'maplibregl'].forEach(function (name) {
          try {
            var lib = window[name];
            if (!lib || typeof lib.Map !== 'function' || lib.Map.__cribloWrapped) return;
            var OriginalMap = lib.Map;
            var WrappedMap = new Proxy(OriginalMap, {
              construct: function (target, args, newTarget) {
                var map = Reflect.construct(target, args, newTarget); rememberMapInstance(map); return map;
              }
            });
            WrappedMap.__cribloWrapped = true; lib.Map = WrappedMap;
          } catch (_) {}
        });
      }
      wrapMapConstructors();
      var __cribloMapWrapTimer = setInterval(wrapMapConstructors, 25);
      setTimeout(function () { clearInterval(__cribloMapWrapTimer); }, 15000);

      function invokeMapEngine(target, x, y, sourceEvent) {
        var values = __cribloMapInstances.concat(safeObjectValues(window, 3));'''
    if map_anchor not in text:
        raise SystemExit('map engine anchor not found')
    text = text.replace(map_anchor, map_registry, 1)

# Adaptive popup detection. A handler invocation is NOT success by itself: v5
# stopped too early. v6 continues through direct handlers -> map API -> DOM ->
# Android-style touch until a real popup/menu/dialog appears.
fire_pattern = re.compile(r'      function fireRealTouchLongPress\(\) \{.*?\n      \}\n\n      document.addEventListener\(\'touchstart\'', re.S)
fire_replacement = r'''      function popupCandidates() {
        var selectors = [
          '[role="dialog"]', '[role="menu"]', '[role="tooltip"]',
          '.modal', '.popup', '.popover', '.context-menu', '.contextmenu',
          '.leaflet-popup', '.mapboxgl-popup', '.maplibregl-popup', '.esri-popup',
          '[class*="popup"]', '[class*="popover"]', '[class*="context-menu"]',
          '[class*="dialog"]', '[class*="modal"]'
        ].join(',');
        var result = [];
        try {
          var nodes = document.querySelectorAll(selectors);
          for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var rect = node.getBoundingClientRect();
            var style = getComputedStyle(node);
            if (rect.width > 20 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0) {
              result.push({ node: node, text: String(node.textContent || '').slice(0, 300), width: Math.round(rect.width), height: Math.round(rect.height) });
            }
          }
        } catch (_) {}
        return result;
      }

      function popupChanged(before) {
        var after = popupCandidates();
        for (var i = 0; i < after.length; i++) {
          var current = after[i];
          var old = null;
          for (var j = 0; j < before.length; j++) if (before[j].node === current.node) { old = before[j]; break; }
          if (!old) return true;
          if (old.text !== current.text || old.width !== current.width || old.height !== current.height) return true;
        }
        return false;
      }

      function fireRealTouchLongPress() {
        realTouchTimer = null;
        if (!realTouchTarget) return;
        realTouchFired = true;
        lastRealTouchLongPressAt = Date.now();
        clearSelection();

        // Prevent the iOS text callout/selection gesture from stealing this map hold.
        var styleNode = realTouchTarget;
        for (var s = 0; styleNode && s < 6; s++, styleNode = styleNode.parentElement) {
          try { styleNode.style.webkitUserSelect = 'none'; styleNode.style.webkitTouchCallout = 'none'; styleNode.style.userSelect = 'none'; } catch (_) {}
        }

        var signature = String((realTouchTarget.tagName || '') + '#' + (realTouchTarget.id || '') + '.' + (realTouchTarget.className && (realTouchTarget.className.baseVal || realTouchTarget.className) || ''));
        __cribloGeoDiag.lastTarget = signature.slice(0, 180);
        __cribloGeoDiag.lastResult = 'trying';

        var baseline = popupCandidates();
        var source = window.__cribloLastTrustedTouchStart || null;

        // Stage 1: call the application's own context/hold/press callbacks using
        // a proxy over the genuine trusted iPhone touch event.
        invokeCapturedHandlers(realTouchTarget, realTouchX, realTouchY, source);

        setTimeout(function () {
          if (popupChanged(baseline)) { __cribloGeoDiag.lastResult = 'captured-handler-popup'; return; }

          // Stage 2: call the discovered map engine API directly.
          invokeMapEngine(realTouchTarget, realTouchX, realTouchY, source);
          setTimeout(function () {
            if (popupChanged(baseline)) { __cribloGeoDiag.lastResult = 'map-engine-popup'; return; }

            // Stage 3: DOM/contextmenu fallback, then parent containers.
            dispatchToTarget(realTouchTarget, realTouchX, realTouchY);
            var parent = realTouchTarget.parentElement;
            for (var i = 0; parent && i < 6; i++, parent = parent.parentElement) dispatchToTarget(parent, realTouchX, realTouchY);

            setTimeout(function () {
              if (popupChanged(baseline)) { __cribloGeoDiag.lastResult = 'dom-popup'; return; }

              // Stage 4: hold a synthetic Android touch long enough for libraries
              // that implement their own Android timer instead of contextmenu.
              scheduleAndroidTouchFallback(realTouchTarget, realTouchX, realTouchY);
              __cribloGeoDiag.lastResult = 'android-touch-fallback';
            }, 140);
          }, 120);
        }, 100);
      }

      document.addEventListener('touchstart' '''
text, count = fire_pattern.subn(fire_replacement, text, count=1)
if count != 1:
    raise SystemExit('adaptive fire replacement failed')

# The replacement above includes the start of the touchstart call without its
# original comma; normalize it back to valid JavaScript.
text = text.replace("document.addEventListener('touchstart' , function", "document.addEventListener('touchstart', function")
text = text.replace("document.addEventListener('touchstart'  , function", "document.addEventListener('touchstart', function")

# Diagnostics now expose whether a real popup was detected and how many maps were captured.
diag_anchor = "          'Engine calls: ' + __cribloGeoDiag.engineCalls,\n"
if "Registered map instances" not in text:
    text = text.replace(diag_anchor, diag_anchor + "          'Registered map instances: ' + __cribloMapInstances.length,\n          'Last result: ' + __cribloGeoDiag.lastResult,\n", 1)

swift_path.write_text(text)

# Add Face ID privacy usage description to generated iOS projects.
info = info_path.read_text()
if 'NSFaceIDUsageDescription' not in info:
    needle = 'const entries = [\n'
    face = '''const entries = [\n  [\n    "NSFaceIDUsageDescription",\n    "CRI BLO utilise Face ID uniquement pour déverrouiller les mots de passe que vous avez choisi d’enregistrer dans le navigateur CRI-BLO.",\n  ],\n'''
    if needle not in info:
        raise SystemExit('Info.plist patch anchor not found')
    info = info.replace(needle, face, 1)
    info_path.write_text(info)

print('Applied CRI-BLO iOS browser v6 patch')
