from pathlib import Path
import re

swift_path = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
info_path = Path('scripts/patch-ios-info.mjs')
text = swift_path.read_text()

# Native secure storage / biometric frameworks.
if 'import LocalAuthentication' not in text:
    text = text.replace('import WebKit\n', 'import WebKit\nimport LocalAuthentication\nimport Security\n', 1)

# Weak message-handler proxy avoids WKUserContentController retaining the browser controller.
plugin_anchor = '@objc(CRIBrowserPlugin)\npublic class CRIBrowserPlugin'
if 'private final class CRIBrowserWeakScriptHandler' not in text:
    support = r'''
private final class CRIBrowserWeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

private final class CRIBrowserCredentialStore {
    static let shared = CRIBrowserCredentialStore()

    private let servicePrefix = "com.criblo.browser.password."
    private let accountListPrefix = "criblo.browser.password.accounts."

    func canonicalHost(_ rawHost: String) -> String {
        let host = rawHost.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        // GeoReseaux authentication moves between Orange subdomains. Keep that
        // whole Orange-owned login flow in one credential scope.
        if host == "orange.fr" || host.hasSuffix(".orange.fr") { return "orange.fr" }
        return host
    }

    private func service(for host: String) -> String {
        servicePrefix + canonicalHost(host)
    }

    private func accountListKey(for host: String) -> String {
        accountListPrefix + canonicalHost(host)
    }

    func accounts(for host: String) -> [String] {
        UserDefaults.standard.stringArray(forKey: accountListKey(for: host)) ?? []
    }

    func contains(host: String, username: String) -> Bool {
        accounts(for: host).contains(username)
    }

    @discardableResult
    func save(host: String, username: String, password: String) -> Bool {
        guard !username.isEmpty,
              !password.isEmpty,
              let data = password.data(using: .utf8) else { return false }

        var accessError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            .userPresence,
            &accessError
        ) else { return false }

        let identity: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service(for: host),
            kSecAttrAccount as String: username,
        ]
        SecItemDelete(identity as CFDictionary)

        var item = identity
        item[kSecValueData as String] = data
        item[kSecAttrAccessControl as String] = access
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else { return false }

        var known = accounts(for: host).filter { $0 != username }
        known.insert(username, at: 0)
        UserDefaults.standard.set(Array(known.prefix(8)), forKey: accountListKey(for: host))
        return true
    }

    func read(host: String, username: String, reason: String, completion: @escaping (String?) -> Void) {
        let context = LAContext()
        context.localizedCancelTitle = "Annuler"
        var authError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authError) else {
            DispatchQueue.main.async { completion(nil) }
            return
        }

        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { [serviceName = service(for: host)] success, _ in
            guard success else {
                DispatchQueue.main.async { completion(nil) }
                return
            }

            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceName,
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
            DispatchQueue.main.async { completion(password) }
        }
    }
}

'''
    if plugin_anchor not in text:
        raise SystemExit('plugin class anchor missing')
    text = text.replace(plugin_anchor, support + plugin_anchor, 1)

# Browser receives origin-scoped requests from the injected login script.
old_decl = 'private final class CRIBrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, UIGestureRecognizerDelegate, UITextFieldDelegate {'
new_decl = 'private final class CRIBrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, UIGestureRecognizerDelegate, UITextFieldDelegate, WKScriptMessageHandler {'
if old_decl in text:
    text = text.replace(old_decl, new_decl, 1)
elif new_decl not in text:
    raise SystemExit('browser controller declaration missing')

property_anchor = '    private var currentTabIndex = 0\n'
if 'credentialScriptHandler' not in text:
    properties = '''    private var currentTabIndex = 0\n    private lazy var credentialScriptHandler = CRIBrowserWeakScriptHandler(delegate: self)\n    private let credentialStore = CRIBrowserCredentialStore.shared\n    private var pendingUsernames: [String: String] = [:]\n    private var credentialUnlockInFlight = false\n    private var lastCredentialUnlockAt: TimeInterval = 0\n'''
    if property_anchor not in text:
        raise SystemExit('browser property anchor missing')
    text = text.replace(property_anchor, properties, 1)

config_anchor = '        configuration.defaultWebpagePreferences.preferredContentMode = .recommended\n'
if 'add(credentialScriptHandler, name: "cribloCredential")' not in text:
    if config_anchor not in text:
        raise SystemExit('WKWebView configuration anchor missing')
    text = text.replace(
        config_anchor,
        config_anchor + '        configuration.userContentController.add(credentialScriptHandler, name: "cribloCredential")\n',
        1,
    )

# Add native script-message methods immediately before native long-press method.
method_anchor = '    @objc private func handleNativeLongPress(_ recognizer: UILongPressGestureRecognizer) {'
if 'private func unlockAndFillCredential' not in text:
    methods = r'''    private func trustedCredentialHost(from message: WKScriptMessage) -> String? {
        let originHost = message.frameInfo.securityOrigin.host.lowercased()
        if !originHost.isEmpty { return originHost }
        return message.frameInfo.request.url?.host?.lowercased()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "cribloCredential",
              let body = message.body as? [String: Any],
              let action = body["action"] as? String,
              let host = trustedCredentialHost(from: message) else { return }

        let scope = credentialStore.canonicalHost(host)
        let suppliedUsername = (body["username"] as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        switch action {
        case "rememberUsername":
            if !suppliedUsername.isEmpty { pendingUsernames[scope] = suppliedUsername }

        case "requestUsername":
            let accounts = credentialStore.accounts(for: host)
            guard accounts.count == 1 else { return }
            fillUsername(accounts[0], in: message.frameInfo)

        case "requestAutofill":
            let preferred = !suppliedUsername.isEmpty ? suppliedUsername : (pendingUsernames[scope] ?? "")
            handleCredentialAutofill(host: host, preferredUsername: preferred, frame: message.frameInfo)

        case "saveCandidate":
            guard let password = body["password"] as? String, !password.isEmpty else { return }
            let username = !suppliedUsername.isEmpty ? suppliedUsername : (pendingUsernames[scope] ?? "")
            let wasNativeFill = body["nativeFilled"] as? Bool ?? false
            guard !wasNativeFill, !username.isEmpty else { return }
            pendingUsernames[scope] = username
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
            in: .page
        ) { _ in }
    }

    private func handleCredentialAutofill(host: String, preferredUsername: String, frame: WKFrameInfo) {
        guard !credentialUnlockInFlight else { return }
        let now = Date().timeIntervalSince1970
        guard now - lastCredentialUnlockAt > 1.2 else { return }

        let accounts = credentialStore.accounts(for: host)
        guard !accounts.isEmpty else { return }

        if !preferredUsername.isEmpty, accounts.contains(preferredUsername) {
            unlockAndFillCredential(host: host, username: preferredUsername, frame: frame)
            return
        }
        if accounts.count == 1, let only = accounts.first {
            unlockAndFillCredential(host: host, username: only, frame: frame)
            return
        }

        let controller = UIAlertController(
            title: "Compte enregistré",
            message: "Choisissez le compte à remplir.",
            preferredStyle: .actionSheet
        )
        for account in accounts.prefix(8) {
            controller.addAction(UIAlertAction(title: account, style: .default) { [weak self] _ in
                self?.unlockAndFillCredential(host: host, username: account, frame: frame)
            })
        }
        controller.addAction(UIAlertAction(title: "Annuler", style: .cancel))
        presentActionSheet(controller, source: moreButton)
    }

    private func unlockAndFillCredential(host: String, username: String, frame: WKFrameInfo) {
        credentialUnlockInFlight = true
        lastCredentialUnlockAt = Date().timeIntervalSince1970
        let displayHost = credentialStore.canonicalHost(host)

        credentialStore.read(
            host: host,
            username: username,
            reason: "Remplir le mot de passe pour \(displayHost)"
        ) { [weak self] password in
            guard let self else { return }
            self.credentialUnlockInFlight = false
            guard let password else { return }

            self.webView.callAsyncJavaScript(
                "return window.__cribloFillCredential ? window.__cribloFillCredential(credential) : false;",
                arguments: [
                    "credential": [
                        "username": username,
                        "password": password,
                    ]
                ],
                in: frame,
                in: .page
            ) { _ in }
        }
    }

    private func offerCredentialSave(host: String, username: String, password: String) {
        guard presentedViewController == nil else { return }
        let exists = credentialStore.contains(host: host, username: username)
        let displayHost = credentialStore.canonicalHost(host)
        let controller = UIAlertController(
            title: exists ? "Mettre à jour ce mot de passe ?" : "Enregistrer ce mot de passe ?",
            message: "\(displayHost) — CRI-BLO le conservera uniquement dans le trousseau sécurisé de cet iPhone. Face ID sera demandé pour le remplir ensuite.",
            preferredStyle: .alert
        )
        controller.addAction(UIAlertAction(title: exists ? "Mettre à jour" : "Enregistrer", style: .default) { [weak self] _ in
            _ = self?.credentialStore.save(host: host, username: username, password: password)
        })
        controller.addAction(UIAlertAction(title: "Pas maintenant", style: .cancel))
        present(controller, animated: true)
    }

'''
    if method_anchor not in text:
        raise SystemExit('native long press method anchor missing')
    text = text.replace(method_anchor, methods + method_anchor, 1)

# Extend, rather than replace, the existing standards-based AutoFill hints.
script_start = text.find('    private static let autofillCompatibilityScript = #"""')
script_end = text.find('\n    """#', script_start)
if script_start < 0 or script_end < 0:
    raise SystemExit('autofill script boundaries missing')
if '__cribloFillCredential' not in text[script_start:script_end]:
    close_marker = '    })();'
    close_pos = text.rfind(close_marker, script_start, script_end)
    if close_pos < 0:
        raise SystemExit('autofill script close marker missing')

    js = r'''

      var __cribloNativeFilledCredential = false;
      var __cribloLastSaveSignature = '';

      function nativeCredentialMessage(action, payload) {
        try {
          var handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.cribloCredential;
          if (!handler || !handler.postMessage) return;
          var body = payload || {};
          body.action = action;
          handler.postMessage(body);
        } catch (_) {}
      }

      function setFrameworkCompatibleValue(input, value) {
        if (!input || typeof value !== 'string') return;
        try {
          var descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          if (descriptor && descriptor.set) descriptor.set.call(input, value);
          else input.value = value;
        } catch (_) {
          try { input.value = value; } catch (_) {}
        }
        try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
        try { input.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
      }

      function visibleUsernameField() {
        var inputs = [];
        try { inputs = Array.prototype.slice.call(document.querySelectorAll('input')); } catch (_) {}
        for (var i = 0; i < inputs.length; i++) {
          if (isUsernameCandidate(inputs[i])) return inputs[i];
        }
        return null;
      }

      function currentLoginUsername() {
        try {
          var field = visibleUsernameField();
          if (field && field.value) return String(field.value).trim();
          return String(sessionStorage.getItem('__cribloLoginUsername') || '').trim();
        } catch (_) { return ''; }
      }

      function rememberLoginUsername(input) {
        try {
          if (!isUsernameCandidate(input)) return;
          var value = String(input.value || '').trim();
          if (!value) return;
          sessionStorage.setItem('__cribloLoginUsername', value);
          nativeCredentialMessage('rememberUsername', { username: value });
        } catch (_) {}
      }

      window.__cribloFillUsername = function (username) {
        try {
          var field = visibleUsernameField();
          if (!field || field.value || !username) return false;
          setFrameworkCompatibleValue(field, String(username));
          rememberLoginUsername(field);
          return true;
        } catch (_) { return false; }
      };

      window.__cribloFillCredential = function (credential) {
        try {
          if (!credential) return false;
          var username = String(credential.username || '');
          var password = String(credential.password || '');
          if (!password) return false;

          if (username) {
            try { sessionStorage.setItem('__cribloLoginUsername', username); } catch (_) {}
            var usernameField = visibleUsernameField();
            if (usernameField && !usernameField.value) setFrameworkCompatibleValue(usernameField, username);
          }

          var passwordFields = Array.prototype.slice.call(document.querySelectorAll('input[type="password"]'));
          for (var i = 0; i < passwordFields.length; i++) {
            if (!visible(passwordFields[i])) continue;
            setFrameworkCompatibleValue(passwordFields[i], password);
            __cribloNativeFilledCredential = true;
            try { passwordFields[i].dispatchEvent(new Event('blur', { bubbles: true })); } catch (_) {}
            return true;
          }
          return false;
        } catch (_) { return false; }
      };

      document.addEventListener('input', function (event) {
        rememberLoginUsername(event && event.target);
      }, true);

      document.addEventListener('focusin', function (event) {
        try {
          var target = event && event.target;
          if (!target || target.tagName !== 'INPUT') return;
          var type = String(target.getAttribute('type') || 'text').toLowerCase();
          if (type === 'password') {
            nativeCredentialMessage('requestAutofill', { username: currentLoginUsername() });
          } else if (isUsernameCandidate(target) && !target.value) {
            nativeCredentialMessage('requestUsername', {});
          }
        } catch (_) {}
      }, true);

      function postCredentialSaveCandidate() {
        try {
          if (__cribloNativeFilledCredential) return;
          var passwordFields = Array.prototype.slice.call(document.querySelectorAll('input[type="password"]'));
          var password = '';
          for (var i = 0; i < passwordFields.length; i++) {
            if (passwordFields[i] && passwordFields[i].value) {
              password = String(passwordFields[i].value);
              break;
            }
          }
          var username = currentLoginUsername();
          if (!username || !password) return;
          var signature = username + '|' + password.length + '|' + password.slice(0, 1) + '|' + password.slice(-1);
          if (__cribloLastSaveSignature === signature) return;
          __cribloLastSaveSignature = signature;
          nativeCredentialMessage('saveCandidate', {
            username: username,
            password: password,
            nativeFilled: false
          });
        } catch (_) {}
      }

      document.addEventListener('submit', function () {
        postCredentialSaveCandidate();
      }, true);

      document.addEventListener('keydown', function (event) {
        try {
          if (event && event.key === 'Enter' && document.querySelector('input[type="password"]')) {
            postCredentialSaveCandidate();
          }
        } catch (_) {}
      }, true);

      document.addEventListener('click', function (event) {
        try {
          var target = event && event.target && event.target.closest
            ? event.target.closest('button,[role="button"],input[type="submit"]')
            : null;
          if (target && document.querySelector('input[type="password"]')) postCredentialSaveCandidate();
        } catch (_) {}
      }, true);

      window.addEventListener('pagehide', function () {
        postCredentialSaveCandidate();
      }, true);
'''
    text = text[:close_pos] + js + '\n' + text[close_pos:]

swift_path.write_text(text)

# Generated iOS Info.plist needs a Face ID usage description.
info = info_path.read_text()
if 'NSFaceIDUsageDescription' not in info:
    anchor = 'const entries = [\n'
    if anchor not in info:
        raise SystemExit('Info.plist patch entries anchor missing')
    info = info.replace(
        anchor,
        anchor + '  [\n    "NSFaceIDUsageDescription",\n    "CRI BLO utilise Face ID pour déverrouiller les mots de passe que vous choisissez d’enregistrer dans son navigateur.",\n  ],\n',
        1,
    )
    info_path.write_text(info)

print('Secure Face ID browser autofill patch applied')
