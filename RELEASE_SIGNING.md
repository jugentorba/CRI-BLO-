# CRI BLO Android release signing

Production updates must always use the same Android signing key.

GitHub Actions workflow: `.github/workflows/build-release.yml`

Required repository Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_STORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Never commit the .jks/.keystore or its passwords to this repository.

The production package is permanently `com.criblo.app`.
The release workflow assigns an increasing `versionCode` automatically.

Important: the first APK installed with this permanent release key becomes the baseline.
Every later production update must come from the same workflow/key. Debug APKs are for testing only and are not valid production updates.

Before every production update, CRI BLO also provides:
Paramètres -> Sauvegarde locale -> Exporter.
