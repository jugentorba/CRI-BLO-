# CRI BLO Android release signing

Production updates must always use the same permanent Android signing key.

GitHub Actions workflow: `.github/workflows/build-release.yml`

The permanent alias is fixed to:

`criblo`

The keystore uses the same strong password for both the store and key, so only two GitHub Actions secrets are required:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEY_PASSWORD`

Never commit the `.jks` / `.keystore`, its Base64 contents, or its password to this repository.

A helper script is included:

`scripts/create-release-keystore.sh`

It creates the permanent keystore, the Base64 value for GitHub, the password value, and a certificate report containing SHA-1/SHA-256 fingerprints.

The production package is permanently:

`com.criblo.app`

The release workflow assigns an increasing `versionCode` automatically, verifies the APK signature, and publishes the signing certificate fingerprint and SHA-256 checksum next to the APK.

Important: the first APK installed with this permanent release key becomes the baseline. Every later production update must use this exact same key. Debug APKs are test-only and are not valid production updates.

Before every production update, CRI BLO also provides local and cloud backup/restore protection.
