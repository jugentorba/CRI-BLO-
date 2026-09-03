from pathlib import Path

path = Path('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift')
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    text = text.replace(old, new, 1)


replace_once(
    """      var __cribloOriginalBind = Function.prototype.bind;
      var __cribloPatchedBind = null;
      var __cribloBindHookTimer = null;
""",
    """      var __cribloOriginalBind = Function.prototype.bind;
      var __cribloPatchedBind = null;
      var __cribloBindHookTimer = null;
      var __cribloOpenLayersDomIntercepts = 0;
""",
    'bind state',
)

replace_once(
    """              if (looksLikeOpenLayersMap(thisArg) && this === thisArg.handleBrowserEvent) {
                registerMapInstance(thisArg, 'OpenLayers-bound');
                restoreOpenLayersBindHook();
              }
            } catch (_) {}
            return bound;
""",
    """              if (looksLikeOpenLayersMap(thisArg) && this === thisArg.handleBrowserEvent) {
                registerMapInstance(thisArg, 'OpenLayers-bound');
                var semanticBound = function () { return bound.apply(null, arguments); };
                try { Object.defineProperty(semanticBound, '__cribloOpenLayersBrowserHandler', { value: true }); }
                catch (_) { semanticBound.__cribloOpenLayersBrowserHandler = true; }
                restoreOpenLayersBindHook();
                return semanticBound;
              }
            } catch (_) {}
            return bound;
""",
    'OpenLayers bind wrapper',
)

replace_once(
    """        var wrapper = function (event) {
          var name = String(event && event.type || '').toLowerCase();
          if (shouldHoldCompatibilityMouseTail(event, name)) return;
          if (name === 'mousedown') {
""",
    """        var wrapper = function (event) {
          var name = String(event && event.type || '').toLowerCase();
          if (shouldHoldCompatibilityMouseTail(event, name)) return;
          // Do not make WKWebView pretend a JavaScript-created contextmenu is
          // native browser input for OpenLayers. Preserve every application DOM
          // listener, but deliver the map event once through Map.handleBrowserEvent
          // after DOM propagation completes.
          if (name === 'contextmenu' && listener && listener.__cribloOpenLayersBrowserHandler
              && __cribloSyntheticContextEvents.has(event)) {
            __cribloOpenLayersDomIntercepts++;
            return;
          }
          if (name === 'mousedown') {
""",
    'listener semantic interception',
)

replace_once(
    """        var before = visiblePopupState();
        var callsBefore = __cribloGeoDiag.wrappedContextCalls;
        var source = request.sourceEvent || request.releaseEvent || request.tailEvent || null;
""",
    """        var before = visiblePopupState();
        var callsBefore = __cribloGeoDiag.wrappedContextCalls;
        var openLayersBefore = __cribloOpenLayersDomIntercepts;
        var source = request.sourceEvent || request.releaseEvent || request.tailEvent || null;
""",
    'trusted completion intercept snapshot',
)

replace_once(
    """        var dispatched = contextMenu(target, x, y, source);
        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;
        if (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented) {
          dispatched = invokeMapEngine(target, x, y, source) || dispatched;
        }
""",
    """        var dispatched = contextMenu(target, x, y, source);
        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;
        var openLayersIntercepted = __cribloOpenLayersDomIntercepts > openLayersBefore;
        if (openLayersIntercepted || (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented)) {
          dispatched = invokeMapEngine(target, x, y, source) || dispatched;
        }
""",
    'trusted semantic dispatch',
)

replace_once(
    """        var before = visiblePopupState();
        var callsBefore = __cribloGeoDiag.wrappedContextCalls;
        var dispatched = contextMenu(target, x, y, null);
        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;
        if (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented) {
          dispatched = invokeMapEngine(target, x, y, null) || dispatched;
        }
""",
    """        var before = visiblePopupState();
        var callsBefore = __cribloGeoDiag.wrappedContextCalls;
        var openLayersBefore = __cribloOpenLayersDomIntercepts;
        var dispatched = contextMenu(target, x, y, null);
        var delta = __cribloGeoDiag.wrappedContextCalls - callsBefore;
        var openLayersIntercepted = __cribloOpenLayersDomIntercepts > openLayersBefore;
        if (openLayersIntercepted || (delta === 0 && !__cribloGeoDiag.syntheticContextPrevented)) {
          dispatched = invokeMapEngine(target, x, y, null) || dispatched;
        }
""",
    'native fallback semantic dispatch',
)

path.write_text(text)
print('Applied semantic OpenLayers long-press adapter')
