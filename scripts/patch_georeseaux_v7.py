from pathlib import Path

p = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
s = p.read_text()

old_ua = '''        let os = UIDevice.current.systemVersion.replacingOccurrences(of: ".", with: "_")
        let major = UIDevice.current.systemVersion.split(separator: ".").first.map(String.init) ?? "18"
        webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS \\(os) like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/\\(major).0 Mobile/15E148 Safari/604.1"
'''
new_ua = '''        let os = UIDevice.current.systemVersion.replacingOccurrences(of: ".", with: "_")
        let major = UIDevice.current.systemVersion.split(separator: ".").first.map(String.init) ?? "18"
        if longPressCompatibility {
            // GeoReseaux works in Android Chrome/WebView but not iOS Safari.
            // Send the same Chrome-class Android identity at the HTTP layer so
            // any server-side Orange feature gating also selects the Android map
            // implementation. Previous builds changed navigator.userAgent only
            // after the page was already delivered, which was too late for that.
            webView.customUserAgent = "Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"
        } else {
            webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS \\(os) like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/\\(major).0 Mobile/15E148 Safari/604.1"
        }
'''
if old_ua not in s:
    raise SystemExit('UA block not found')
s = s.replace(old_ua, new_ua, 1)

scroll = '        webView.scrollView.keyboardDismissMode = .interactive\n'
if 'webView.scrollView.delaysContentTouches = false' not in s:
    if scroll not in s:
        raise SystemExit('scroll anchor not found')
    s = s.replace(scroll, scroll + '        webView.scrollView.delaysContentTouches = false\n        webView.allowsLinkPreview = false\n', 1)

old_target = "        var isTarget = host === 'mobi-prod.orange.fr' || host.indexOf('georeseaux') >= 0 || host.indexOf('geo-reseaux') >= 0;"
new_target = "        var isTarget = host === 'orange.fr' || host.slice(-10) === '.orange.fr' || host.indexOf('georeseaux') >= 0 || host.indexOf('geo-reseaux') >= 0;"
if old_target not in s:
    raise SystemExit('platform host target not found')
s = s.replace(old_target, new_target, 1)

old_touch = "        try { Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: function(){ return 5; } }); } catch (_) {}\n        window.__cribloGeoReseauxAndroidCompat = true;"
new_touch = """        try { Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: function(){ return 5; } }); } catch (_) {}
        try { Object.defineProperty(navigator, 'appVersion', { configurable: true, get: function(){ return androidUA.replace(/^Mozilla\\//, ''); } }); } catch (_) {}
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
        window.__cribloGeoReseauxAndroidCompat = true;"""
if old_touch not in s:
    raise SystemExit('navigator compatibility anchor not found')
s = s.replace(old_touch, new_touch, 1)

hook_anchor = '''      installMapHooks();
      var __cribloHookTicks = 0;
'''
if "__cribloScriptLoadHook" not in s:
    hook_new = '''      installMapHooks();
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
'''
    if hook_anchor not in s:
        raise SystemExit('map hook anchor not found')
    s = s.replace(hook_anchor, hook_new, 1)

p.write_text(s)
