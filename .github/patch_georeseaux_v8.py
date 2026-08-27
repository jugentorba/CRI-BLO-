from pathlib import Path
import re

path = Path("plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift")
text = path.read_text(encoding="utf-8")

# 1) Keep the real iPhone/Safari identity at the HTTP layer. The Android HTTP
# UA experiment did not unlock the GeoReseaux popup and it also changes the
# Orange login page away from the Safari path where Apple Password AutoFill is
# known to work best. Android-style JS compatibility remains scoped to the GIS.
ua_start_marker = "        // Orange/SiteMinder can reject the stripped WKWebView user agent after\n"
ua_end_marker = "        if longPressCompatibility {\n            let longPress = UILongPressGestureRecognizer"
if text.count(ua_start_marker) != 1:
    raise SystemExit(f"Expected one iOS UA start marker, found {text.count(ua_start_marker)}")
if text.count(ua_end_marker) != 1:
    raise SystemExit(f"Expected one long-press recognizer marker, found {text.count(ua_end_marker)}")
ua_start = text.index(ua_start_marker)
ua_end = text.index(ua_end_marker, ua_start)
ua_replacement = '''        // Keep the actual iPhone/Safari identity for Orange authentication so
        // WebKit and the login page stay on the same path as Safari Password
        // AutoFill. GeoReseaux Android compatibility is injected only inside
        // the GIS page; it no longer changes the Orange login HTTP identity.
        let os = UIDevice.current.systemVersion.replacingOccurrences(of: ".", with: "_")
        let major = UIDevice.current.systemVersion.split(separator: ".").first.map(String.init) ?? "18"
        webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS \\(os) like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/\\(major).0 Mobile/15E148 Safari/604.1"

'''
text = text[:ua_start] + ua_replacement + text[ua_end:]

# 2) Do not spoof Android on the Orange credential page. Only the authenticated
# GIS entry/page gets Android JS platform signals.
old_target = "var isTarget = host === 'orange.fr' || host.slice(-10) === '.orange.fr' || host.indexOf('georeseaux') >= 0 || host.indexOf('geo-reseaux') >= 0;"
new_target = "var isTarget = host === 'sigreseaux.orange.fr' || host === 'mobi-prod.orange.fr' || host.indexOf('georeseaux') >= 0 || host.indexOf('geo-reseaux') >= 0;"
if text.count(old_target) != 1:
    raise SystemExit(f"Expected one platform target expression, found {text.count(old_target)}")
text = text.replace(old_target, new_target, 1)

# 3) The real diagnostic showed a CANVAS target and that GeoReseaux context
# handlers are reached. Android Chrome emits a touch-origin PointerEvent for a
# long-press contextmenu, not the desktop/right-click MouseEvent facade v7 used.
# Build the handler facade with Android-touch semantics and real canvas-relative
# offset coordinates.
sem_pattern = re.compile(
    r"      function compatibleSemanticEvent\(type, target, currentTarget, x, y, sourceEvent\) \{\n"
    r".*?\n"
    r"        var prevented = false;",
    re.S,
)
sem_replacement = '''      function compatibleSemanticEvent(type, target, currentTarget, x, y, sourceEvent) {
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

        var prevented = false;'''
text, count = sem_pattern.subn(sem_replacement, text, count=1)
if count != 1:
    raise SystemExit(f"Expected one compatibleSemanticEvent function, replaced {count}")

old_overrides = '''          button: type === 'contextmenu' ? 2 : 0,
          buttons: type === 'contextmenu' ? 2 : 1,
          which: type === 'contextmenu' ? 3 : 1,
          clientX: x,
          clientY: y,
          pageX: x + (window.scrollX || 0),
          pageY: y + (window.scrollY || 0),
          screenX: x,
          screenY: y,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          isTrusted: !!(sourceEvent && sourceEvent.isTrusted),'''
new_overrides = '''          button: 0,
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
          isTrusted: !!(sourceEvent && sourceEvent.isTrusted),'''
if text.count(old_overrides) != 1:
    raise SystemExit(f"Expected one semantic override block, found {text.count(old_overrides)}")
text = text.replace(old_overrides, new_overrides, 1)

# 4) Record which event properties GeoReseaux actually reads. This is local
# diagnostic metadata only; it never reads credentials or page contents.
old_diag_tail = "        lastResult: 'not-run'\n      };"
new_diag_tail = "        lastResult: 'not-run',\n        eventProperties: {}\n      };"
if text.count(old_diag_tail) != 1:
    raise SystemExit(f"Expected one diagnostic object tail, found {text.count(old_diag_tail)}")
text = text.replace(old_diag_tail, new_diag_tail, 1)

old_proxy_get = '''            get: function (obj, prop) {
              if (prop === '__cribloPrevented') return prevented;'''
new_proxy_get = '''            get: function (obj, prop) {
              try {
                if (isContext && typeof prop === 'string' && prop.indexOf('__criblo') !== 0) {
                  __cribloGeoDiag.eventProperties[prop] = (__cribloGeoDiag.eventProperties[prop] || 0) + 1;
                }
              } catch (_) {}
              if (prop === '__cribloPrevented') return prevented;'''
if text.count(old_proxy_get) != 1:
    raise SystemExit(f"Expected one proxy getter, found {text.count(old_proxy_get)}")
text = text.replace(old_proxy_get, new_proxy_get, 1)

old_diag_line = "          'Last result: ' + __cribloGeoDiag.lastResult,\n          'Global hints: ' + (engineHints.join(', ') || 'none'),"
new_diag_line = "          'Last result: ' + __cribloGeoDiag.lastResult,\n          'Event properties read: ' + (Object.keys(__cribloGeoDiag.eventProperties).sort().join(', ') || 'none'),\n          'Global hints: ' + (engineHints.join(', ') || 'none'),"
if text.count(old_diag_line) != 1:
    raise SystemExit(f"Expected one diagnostic result block, found {text.count(old_diag_line)}")
text = text.replace(old_diag_line, new_diag_line, 1)

path.write_text(text, encoding="utf-8")
print("Applied GeoReseaux v8 Android-touch PointerEvent + Safari-login AutoFill compatibility patch.")
