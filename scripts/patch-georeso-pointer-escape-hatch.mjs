import fs from 'node:fs';

const path = 'plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(label, from, to) {
  const i = source.indexOf(from);
  if (i < 0) throw new Error(label + ': source block not found');
  if (source.indexOf(from, i + from.length) >= 0) throw new Error(label + ': source block not unique');
  source = source.slice(0, i) + to + source.slice(i + from.length);
}

replaceOnce(
  'fallback timer state',
  `      var __cribloHeldPointerDown = null;\n      var __cribloHeldPointerUp = null;\n      var __cribloObservedPhysicalPointers = new WeakSet();`,
  `      var __cribloHeldPointerDown = null;\n      var __cribloHeldPointerUp = null;\n      var __cribloHeldPointerDownFallback = null;\n      var __cribloHeldPointerUpFallback = null;\n      var __cribloObservedPhysicalPointers = new WeakSet();`,
);

replaceOnce(
  'clear fallback when replaying',
  `        var source = isDown ? __cribloHeldPointerDown : __cribloHeldPointerUp;\n        if (!source) return false;\n        if (isDown) __cribloHeldPointerDown = null; else __cribloHeldPointerUp = null;`,
  `        var source = isDown ? __cribloHeldPointerDown : __cribloHeldPointerUp;\n        if (!source) return false;\n        var fallback = isDown ? __cribloHeldPointerDownFallback : __cribloHeldPointerUpFallback;\n        if (fallback) { try { clearTimeout(fallback); } catch (_) {} }\n        if (isDown) {\n          __cribloHeldPointerDown = null;\n          __cribloHeldPointerDownFallback = null;\n        } else {\n          __cribloHeldPointerUp = null;\n          __cribloHeldPointerUpFallback = null;\n        }`,
);

replaceOnce(
  'schedule standalone pointer fallback',
  `          if (window.__cribloGeoReseauxAndroidCompat && mapLikeTarget(event.target)) {\n            if (isDown) __cribloHeldPointerDown = event; else __cribloHeldPointerUp = event;\n            // Suppress propagation only. Never preventDefault: WebKit must still\n            // generate the genuine TouchEvent and its normal default behavior.\n            event.stopImmediatePropagation();\n            return;\n          }`,
  `          if (window.__cribloGeoReseauxAndroidCompat && mapLikeTarget(event.target)) {\n            if (isDown) {\n              __cribloHeldPointerDown = event;\n              if (__cribloHeldPointerDownFallback) clearTimeout(__cribloHeldPointerDownFallback);\n              __cribloHeldPointerDownFallback = setTimeout(function () {\n                // Pointer Events can exist without a matching TouchEvent. Never\n                // swallow such input permanently; replay unchanged after a short\n                // window if no touchstart consumed the held pointer.\n                if (__cribloHeldPointerDown === event) dispatchHeldAndroidPointer('down');\n              }, 55);\n            } else {\n              __cribloHeldPointerUp = event;\n              if (__cribloHeldPointerUpFallback) clearTimeout(__cribloHeldPointerUpFallback);\n              __cribloHeldPointerUpFallback = setTimeout(function () {\n                if (__cribloHeldPointerUp === event) dispatchHeldAndroidPointer('up');\n              }, 55);\n            }\n            // Suppress propagation only. Never preventDefault: WebKit must still\n            // generate the genuine TouchEvent and its normal default behavior.\n            event.stopImmediatePropagation();\n            return;\n          }`,
);

fs.writeFileSync(path, source);
console.log('Added GeoReseaux standalone-pointer escape hatch');
