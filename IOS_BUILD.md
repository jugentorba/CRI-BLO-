# Build iOS (CRI BLO)

## Depuis Xcode (installation sur l'iPhone)

1. `npm install && npm run build && npx cap sync ios`
2. Ouvrir `ios/App/App.xcodeproj` dans Xcode.
3. Xcode → Settings → Accounts : ajouter l'Apple ID (équipe `G6XG9572FX`).
4. Target **App** → Signing & Capabilities : Team = l'équipe, « Automatically manage signing ».
5. Brancher l'iPhone, choisir l'appareil, **Run**.

## Générer un fichier .ipa

Xcode exige un compte Apple connecté pour créer le profil de provisionnement
de `com.criblo.app`. Sans compte, la compilation s'arrête sur :

```
error: No Accounts: Add a new account in Accounts settings.
error: No profiles for 'com.criblo.app' were found
```

Une fois le compte ajouté :

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/App.xcarchive \
  archive -allowProvisioningUpdates DEVELOPMENT_TEAM=G6XG9572FX

xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/ipa \
  -allowProvisioningUpdates
```

`ExportOptions.plist` : `method` = `ad-hoc` (appareils enregistrés) ou
`app-store-connect` (TestFlight). Le certificat installé est un
**Apple Distribution**, adapté à ces deux méthodes.
