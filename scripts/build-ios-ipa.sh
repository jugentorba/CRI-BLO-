#!/usr/bin/env bash
# Construit un IPA signé de CRI BLO.
# Prérequis : Xcode connecté à l'Apple ID de l'équipe (Xcode → Settings → Accounts).
set -euo pipefail
cd "$(dirname "$0")/.."

TEAM="${IOS_TEAM:-G6XG9572FX}"
METHOD="${IOS_METHOD:-ad-hoc}"   # ad-hoc (appareils enregistrés) | app-store-connect
OUT="build/ipa"
ARCHIVE="build/App.xcarchive"

npm run build
npx cap sync ios

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  archive -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM"

mkdir -p build "$OUT"
cat > build/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>$METHOD</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
  <key>stripSwiftSymbols</key><true/>
  <key>compileBitcode</key><false/>
</dict></plist>
PLIST

xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist build/ExportOptions.plist -exportPath "$OUT" \
  -allowProvisioningUpdates

echo "IPA :"; ls -lh "$OUT"
