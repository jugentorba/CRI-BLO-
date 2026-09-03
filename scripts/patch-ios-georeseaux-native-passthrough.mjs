import { existsSync, readFileSync, writeFileSync } from "node:fs";

const swiftPaths = [
  new URL(
    "../plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift",
    import.meta.url,
  ),
  new URL(
    "../node_modules/@criblo/native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift",
    import.meta.url,
  ),
];

const userAgentAnchor =
  '    private static let androidGeoUserAgent = "Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"\n';
const bridgeInjection = `                    source: Self.longPressBridgeScript,`;
const recognizerAnchor = `        if longPressCompatibility {\n            // WKWebView owns several internal long-press recognizers.`;
const longPressScriptAnchor = `    private static let longPressBridgeScript = #\"\"\"`;

const passthroughScript = String.raw`    private static let geoReseauxNativePassthroughDiagnosticsScript = #"""
    (function () {
      try {
        if (window.__cribloNativePassthroughDiagInstalled) return;
        var host = String(location.hostname || '').toLowerCase();
        var isTarget = host === 'sigreseaux.orange.fr'
          || host === 'mobi-prod.orange.fr'
          || host.indexOf('georeseaux') >= 0
          || host.indexOf('geo-reseaux') >= 0;
        if (!isTarget) return;
        window.__cribloNativePassthroughDiagInstalled = true;

        var rows = [];
        var pressStartedAt = 0;
        var sequence = 0;
        var maxRows = 100;
        var types = [
          'touchstart', 'touchmove', 'touchend', 'touchcancel',
          'pointerdown', 'pointermove', 'pointerup', 'pointercancel',
          'mousedown', 'mouseup', 'click', 'contextmenu'
        ];

        function targetLabel(target) {
          try {
            if (!target) return 'none';
            var tag = String(target.tagName || target.nodeName || 'node').toLowerCase();
            var id = target.id ? '#' + String(target.id) : '';
            var className = target.className && (target.className.baseVal || target.className);
            var classes = className ? '.' + String(className).trim().replace(/\\s+/g, '.') : '';
            return (tag + id + classes).slice(0, 120);
          } catch (_) { return 'unknown'; }
        }

        function touchPoint(event) {
          try {
            var list = event.changedTouches && event.changedTouches.length
              ? event.changedTouches
              : event.touches;
            return list && list.length ? list[0] : null;
          } catch (_) { return null; }
        }

        function number(value, fallback) {
          var parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : fallback;
        }

        function record(event) {
          try {
            var now = performance && performance.now ? performance.now() : Date.now();
            if (!pressStartedAt && /^(touchstart|pointerdown|mousedown)$/.test(event.type)) pressStartedAt = now;
            var point = touchPoint(event);
            var clientX = point ? point.clientX : event.clientX;
            var clientY = point ? point.clientY : event.clientY;
            var pageX = point ? point.pageX : event.pageX;
            var pageY = point ? point.pageY : event.pageY;
            var screenX = point ? point.screenX : event.screenX;
            var screenY = point ? point.screenY : event.screenY;
            var pressure = event.pressure;
            if (pressure == null && point) pressure = point.force;
            var row = {
              seq: ++sequence,
              type: String(event.type || ''),
              elapsed: pressStartedAt ? Math.max(0, Math.round(now - pressStartedAt)) : 0,
              trusted: event.isTrusted === true,
              defaultPrevented: event.defaultPrevented === true,
              cancelable: event.cancelable === true,
              target: targetLabel(event.target),
              clientX: number(clientX, -1),
              clientY: number(clientY, -1),
              pageX: number(pageX, -1),
              pageY: number(pageY, -1),
              screenX: number(screenX, -1),
              screenY: number(screenY, -1),
              pressure: number(pressure, -1),
              button: number(event.button, -1),
              buttons: number(event.buttons, -1),
              pointerId: number(event.pointerId, -1),
              pointerType: String(event.pointerType || (point ? 'touch' : '')),
              isPrimary: event.isPrimary == null ? '' : String(event.isPrimary),
              touches: event.touches ? event.touches.length : -1,
              changedTouches: event.changedTouches ? event.changedTouches.length : -1
            };
            rows.push(row);
            while (rows.length > maxRows) rows.shift();
            setTimeout(function () {
              try { row.defaultPrevented = event.defaultPrevented === true; } catch (_) {}
            }, 0);
            if (/^(touchend|touchcancel|pointercancel)$/.test(event.type)) {
              setTimeout(function () { pressStartedAt = 0; }, 0);
            }
          } catch (_) {}
        }

        for (var i = 0; i < types.length; i++) {
          document.addEventListener(types[i], record, { capture: true, passive: true });
        }

        window.__cribloGeoDiagnosticsText = function () {
          var lines = [
            'Mode: native-passthrough (no synthetic pointer/mouse/contextmenu)',
            'URL: ' + String(location.href || '').slice(0, 180),
            'Android mode (JS/HTTP): ' + String(!!window.__cribloGeoReseauxAndroidCompat) + '/' + String(!!window.__cribloGeoHTTPAndroid),
            'Events captured: ' + rows.length
          ];
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            lines.push(
              r.seq + ' +' + r.elapsed + 'ms ' + r.type
              + ' trusted=' + r.trusted
              + ' defaultPrevented=' + r.defaultPrevented
              + ' cancelable=' + r.cancelable
              + ' target=' + r.target
              + ' xy=' + Math.round(r.clientX) + ',' + Math.round(r.clientY)
              + ' page=' + Math.round(r.pageX) + ',' + Math.round(r.pageY)
              + ' screen=' + Math.round(r.screenX) + ',' + Math.round(r.screenY)
              + ' pressure=' + r.pressure
              + ' button=' + r.button
              + ' buttons=' + r.buttons
              + ' pointerId=' + r.pointerId
              + ' pointerType=' + r.pointerType
              + ' isPrimary=' + r.isPrimary
              + ' touches=' + r.touches
              + ' changed=' + r.changedTouches
            );
          }
          return lines.join('\\n');
        };
      } catch (_) {}
    })();
    """#

`;

function patchSwift(swiftPath) {
  if (!existsSync(swiftPath)) return "missing";

  let swift = readFileSync(swiftPath, "utf8");
  if (swift.includes("geoReseauxNativePassthroughDiagnosticsScript")) return "already";

  if (!swift.includes(userAgentAnchor)) throw new Error("androidGeoUserAgent anchor not found");
  swift = swift.replace(
    userAgentAnchor,
    `${userAgentAnchor}\n    // Keep the legacy synthetic bridge available as a rollback, but default\n    // to real WKWebView event delivery for GeoReseaux on iOS. Synthetic DOM\n    // pointer events cannot reproduce WebKit's trusted pointer lifecycle.\n    private static let useLegacySyntheticGeoLongPressBridge = false\n`,
  );

  if (!swift.includes(bridgeInjection)) throw new Error("longPressBridgeScript injection anchor not found");
  swift = swift.replace(
    bridgeInjection,
    `                    source: Self.useLegacySyntheticGeoLongPressBridge\n                        ? Self.longPressBridgeScript\n                        : Self.geoReseauxNativePassthroughDiagnosticsScript,`,
  );

  if (!swift.includes(recognizerAnchor)) throw new Error("native long-press recognizer anchor not found");
  swift = swift.replace(
    recognizerAnchor,
    `        if longPressCompatibility && Self.useLegacySyntheticGeoLongPressBridge {\n            // WKWebView owns several internal long-press recognizers.`,
  );

  if (!swift.includes(longPressScriptAnchor)) throw new Error("longPressBridgeScript definition anchor not found");
  swift = swift.replace(longPressScriptAnchor, passthroughScript + longPressScriptAnchor);
  writeFileSync(swiftPath, swift);
  return "patched";
}

let available = 0;
let patched = 0;
for (const swiftPath of swiftPaths) {
  const result = patchSwift(swiftPath);
  if (result !== "missing") available += 1;
  if (result === "patched") patched += 1;
  console.log(`${result}: ${swiftPath.pathname}`);
}

if (available === 0) throw new Error("No CRI-BLO iOS browser plugin source was found");
console.log(`iOS GeoReseaux native passthrough ready (${patched} source copies patched)`);
