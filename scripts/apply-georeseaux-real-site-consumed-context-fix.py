from pathlib import Path

PATH = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
text = PATH.read_text()

old_release = """        if (openLayersIntercepted || (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented)) {
          dispatched = invokeMapEngine(target, x, y, source) || dispatched;
        }
        __cribloGeoDiag.directTrustedHandlerFires += delta;
"""
new_release = """        if (openLayersIntercepted || (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented)) {
          dispatched = invokeMapEngine(target, x, y, source) || dispatched;
        } else if (__cribloMapRegistry.length) {
          // A real GeoReseaux contextmenu handler may preventDefault() without
          // opening the map popup. Give application DOM rendering one frame to
          // settle; if no popup appeared, deliver the recovered OpenLayers Map
          // semantic event instead of treating preventDefault() as success.
          setTimeout(function () {
            if (!popupChanged(before) && invokeMapEngine(target, x, y, source)) {
              __cribloGeoDiag.lastResult = 'trusted-webkit-tail-openlayers-recovered';
            }
          }, 32);
        }
        __cribloGeoDiag.directTrustedHandlerFires += delta;
"""

old_fallback = """        if (openLayersIntercepted || (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented)) {
          dispatched = invokeMapEngine(target, x, y, null) || dispatched;
        }
        __cribloGeoDiag.directTrustedHandlerFires += delta;
"""
new_fallback = """        if (openLayersIntercepted || (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented)) {
          dispatched = invokeMapEngine(target, x, y, null) || dispatched;
        } else if (__cribloMapRegistry.length) {
          setTimeout(function () {
            if (!popupChanged(before) && invokeMapEngine(target, x, y, null)) {
              __cribloGeoDiag.lastResult = 'touchstart-timeout-openlayers-recovered';
            }
          }, 32);
        }
        __cribloGeoDiag.directTrustedHandlerFires += delta;
"""

if old_release not in text:
    raise SystemExit('release completion fallback block not found')
if old_fallback not in text:
    raise SystemExit('native timeout fallback block not found')

text = text.replace(old_release, new_release, 1)
text = text.replace(old_fallback, new_fallback, 1)
PATH.write_text(text)
print('applied real-site consumed-context OpenLayers fallback fix')
