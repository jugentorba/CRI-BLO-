import fs from 'node:fs';

// This durable gate also provides a normal push trigger after validated bot source updates.
const swift = fs.readFileSync('plugins/criblo-native-browser/ios/Sources/CRIBrowserPlugin/CRIBrowserPlugin.swift', 'utf8');

const nativeMatch = swift.match(/private func requiresAndroidGeoUserAgent\(_ url: URL\) -> Bool \{([\s\S]*?)\n    \}/);
if (!nativeMatch) throw new Error('requiresAndroidGeoUserAgent not found');
const nativeRule = nativeMatch[1];
for (const host of ['sigreseaux.orange.fr', 'mobi-prod.orange.fr']) {
  const needle = 'host == \"' + host + '\"';
  if (!nativeRule.includes(needle)) throw new Error('native HTTP Android UA does not include ' + host);
}

const platformMatch = swift.match(/private static let geoReseauxPlatformCompatibilityScript = #\"\"\"([\s\S]*?)\"\"\"#/);
if (!platformMatch) throw new Error('platform compatibility script not found');
for (const host of ['sigreseaux.orange.fr', 'mobi-prod.orange.fr']) {
  const needle = "host === '" + host + "'";
  if (!platformMatch[1].includes(needle)) throw new Error('JS Android identity does not include ' + host);
}

const pinned = swift.match(/pinnedOrangeURL = URL\(string: \"([^\"]+)\"\)/);
if (!pinned) throw new Error('pinned Orange URL not found');
const pinnedHost = new URL(pinned[1]).hostname;
if (pinnedHost !== 'mobi-prod.orange.fr') throw new Error('unexpected pinned host: ' + pinnedHost);
if (!nativeRule.includes('host == \"' + pinnedHost + '\"')) throw new Error('pinned Orange entry point is not Android at HTTP layer');
if (!platformMatch[1].includes("host === '" + pinnedHost + "'")) throw new Error('pinned Orange entry point is not Android at JS layer');

const androidUA = swift.match(/private static let androidGeoUserAgent = \"([^\"]+)\"/);
if (!androidUA || !/Android/.test(androidUA[1]) || !/Chrome\//.test(androidUA[1])) throw new Error('Android network UA missing/invalid');

console.log('GeoReseaux iOS HTTP/JS Android identity parity test passed for ' + pinnedHost);
