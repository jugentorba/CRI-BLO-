# GeoReseaux iOS long-press bridge

Real-device diagnostics show that the native `UILongPressGestureRecognizer` reaches `.began` on time (haptic feedback is immediate), while `WKWebView.evaluateJavaScript(...)` may be delivered only after the touch has ended. The JavaScript bridge therefore must not depend on native-to-JS delivery time to establish the hold state.

Current strategy:

1. A genuine trusted GeoReseaux `touchstart` starts a 600 ms in-page timer.
2. The timer arms the long-press request while preserving the real target, coordinates and trusted touch source.
3. Missing Android-style press-start state may be prepared before release.
4. The genuine iOS `touchend`/mouse compatibility tail is allowed to run.
5. After the genuine `click` finishes, one `contextmenu` is emitted last at the original hold coordinates.
6. A delayed native bridge callback is suppressed so it cannot overwrite or duplicate the request. Native remains responsible for haptic feedback and as a backup arm signal.

The regression test must verify a short tap does not arm, a long hold does not emit contextmenu before release, contextmenu is last after the trusted click, and a delayed native callback cannot duplicate the event.
