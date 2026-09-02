import fs from 'node:fs';

const swiftPath = 'plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift';
const packagePath = 'package.json';
const testPath = 'scripts/test-ios-georeseaux-ua-parity.mjs';

function replaceOnce(text, label, from, to) {
  const i = text.indexOf(from);
  if (i < 0) throw new Error(`${label}: source block not found`);
  if (text.indexOf(from, i + from.length) >= 0) throw new Error(`${label}: source block not unique`);
  return text.slice(0, i) + to + text.slice(i + from.length);
}

let swift = fs.readFileSync(swiftPath, 'utf8');

swift = replaceOnce(
  swift,
  'native Android UA host parity',
  `        return host == "sigreseaux.orange.fr"\n            || host.contains("georeseaux")\n            || host.contains("geo-reseaux")`,
  `        return host == "sigreseaux.orange.fr"\n            || host == "mobi-prod.orange.fr"\n            || host.contains("georeseaux")\n            || host.contains("geo-reseaux")`,
);

swift = replaceOnce(
  swift,
  'HTTP identity comment',
  `            // Keep the Orange authentication pages on a genuine Safari identity,\n            // then reload only the authenticated GeoReseaux application with an\n            // Android HTTP identity. The Android working trace and the iOS v14\n            // diagnostic show the same trusted gesture reaching the canvas; the\n            // remaining difference is the server-selected map implementation.`,
  `            // Match Android's network identity on the MOBI/GeoReseaux application\n            // hosts, including the stable mobi-prod entry point. Authentication\n            // redirects on other Orange/identity hosts keep the genuine Safari UA,\n            // then the app switches back to Android before MOBI/GeoReseaux loads.\n            // This keeps the HTTP and document-start JavaScript identities aligned\n            // instead of asking Orange for an iPhone bundle and then spoofing Android.`,
);

swift = replaceOnce(
  swift,
  'initial identity comment',
  `        // Keep the actual iPhone/Safari identity for Orange authentication so\n        // WebKit and the login page stay on the same path as Safari Password\n        // AutoFill. GeoReseaux Android compatibility is injected only inside\n        // the GIS page; it no longer changes the Orange login HTTP identity.`,
  `        // Start with Safari for generic/authentication hosts. The navigation\n        // delegate switches the main frame to Android before MOBI/GeoReseaux\n        // application hosts load, keeping HTTP and JavaScript platform signals\n        // consistent while leaving external Orange identity pages untouched.`,
);

fs.writeFileSync(swiftPath, swift);

const test = `import fs from 'node:fs';\n\nconst swift = fs.readFileSync('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift', 'utf8');\n\nconst nativeMatch = swift.match(/private func requiresAndroidGeoUserAgent\\(_ url: URL\\) -> Bool \\{([\\s\\S]*?)\\n    \\}/);\nif (!nativeMatch) throw new Error('requiresAndroidGeoUserAgent not found');\nconst nativeRule = nativeMatch[1];\nfor (const host of ['sigreseaux.orange.fr', 'mobi-prod.orange.fr']) {\n  if (!nativeRule.includes(\\`host == "\\${host}"\\`)) throw new Error('native HTTP Android UA does not include ' + host);\n}\n\nconst platformMatch = swift.match(/private static let geoReseauxPlatformCompatibilityScript = #\"\"\"([\\s\\S]*?)\"\"\"#/);\nif (!platformMatch) throw new Error('platform compatibility script not found');\nfor (const host of ['sigreseaux.orange.fr', 'mobi-prod.orange.fr']) {\n  if (!platformMatch[1].includes(\\`host === '\\${host}'\\`)) throw new Error('JS Android identity does not include ' + host);\n}\n\nconst pinned = swift.match(/pinnedOrangeURL = URL\\(string: "([^"]+)"\\)/);\nif (!pinned) throw new Error('pinned Orange URL not found');\nconst pinnedHost = new URL(pinned[1]).hostname;\nif (pinnedHost !== 'mobi-prod.orange.fr') throw new Error('unexpected pinned host: ' + pinnedHost);\nif (!nativeRule.includes(\\`host == "\\${pinnedHost}"\\`)) throw new Error('pinned Orange entry point is not Android at HTTP layer');\nif (!platformMatch[1].includes(\\`host === '\\${pinnedHost}'\\`)) throw new Error('pinned Orange entry point is not Android at JS layer');\n\nconst androidUA = swift.match(/private static let androidGeoUserAgent = "([^"]+)"/);\nif (!androidUA || !/Android/.test(androidUA[1]) || !/Chrome\\//.test(androidUA[1])) throw new Error('Android network UA missing/invalid');\n\nconsole.log('GeoReseaux iOS HTTP/JS Android identity parity test passed for ' + pinnedHost);\n`;
fs.writeFileSync(testPath, test);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.scripts['test:ios-georeseaux-ua-parity'] = 'node scripts/test-ios-georeseaux-ua-parity.mjs';
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
