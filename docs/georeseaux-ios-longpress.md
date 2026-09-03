# GeoReseaux iOS long-press bridge

## Real-device finding

Real-device diagnostics showed that the native `UILongPressGestureRecognizer` reaches `.began` on time (haptic feedback is immediate), while `WKWebView.evaluateJavaScript(...)` can be delivered only after the finger is released. The JavaScript bridge therefore does not depend on native-to-JavaScript callback timing to establish the hold state.

## Current strategy

1. A genuine trusted GeoReseaux `touchstart` starts a 600 ms in-page timer.
2. The timer arms the hold while preserving the real target, coordinates and trusted touch source.
3. CRI-BLO presents the measured Android-compatible press/release lifecycle to application DOM listeners.
4. After the genuine iOS release/click tail completes, exactly one `contextmenu` is delivered at the original hold coordinates.
5. If the page contains an OpenLayers map, CRI-BLO recovers `Map.handleBrowserEvent.bind(map)` at document start.
6. CRI-BLO does not rely on WKWebView treating a JavaScript-created `contextmenu` as native browser input for OpenLayers. The synthetic event still reaches application DOM listeners, while the OpenLayers map receives one semantic/direct `contextmenu` through the recovered map handler.
7. A delayed native callback is suppressed so it cannot duplicate or overwrite the already armed trusted-JavaScript hold. Native remains responsible for haptic feedback and as a backup arm signal.

## Automated verification

The regression suite checks:

- short taps do not become holds;
- the long hold does not fire `contextmenu` before release;
- Android-compatible event ordering is preserved;
- the delayed native callback cannot duplicate the action;
- application DOM `contextmenu` listeners still fire exactly once;
- hidden/local OpenLayers map instances are recovered and receive one semantic/direct map event;
- the integration fixture opens a popup on OpenLayers 6.15.1, 7.2.2 and 10.6.1;
- GeoReseaux JavaScript/HTTP Android user-agent parity remains consistent.

The unsigned iPhone Release build is compiled separately on a macOS GitHub Actions runner.

## Still requires physical-device verification

CI does not reproduce the complete production environment. Final validation must be performed on a real iPhone using the exact built IPA while logged into the real Orange GeoReseaux page. That test is the only way to confirm actual iOS/WKWebView finger gesture behavior, the current production GeoReseaux bundle, authenticated redirects/cookies, and the real popup/tool action together.

If the physical-device hold still fails, open **More → Diagnostic GeoReseaux** immediately after the failed hold and capture the full diagnostic text before changing the code again.
