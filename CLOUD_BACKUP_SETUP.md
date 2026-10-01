# CRI BLO cloud backup setup

CRI BLO supports three backup paths:

1. **Google Drive** — recommended primary cloud backup.
2. **Microsoft OneDrive** — alternative cloud backup.
3. **Local backup file** — emergency/offline fallback.

Cloud backups contain CRI history, photos, attachments and supported app settings.
AI API keys and OAuth access tokens are never included.

## Automatic backup behavior

- Automatic backup is enabled after a cloud account is connected.
- A backup is attempted only when CRI BLO data changed.
- Default minimum interval: **6 hours**.
- Automatic backup never opens a login popup. If the provider needs the user to sign in again, the backup stays pending until the next manual connection.
- Manual **Backup now** and **Restore** remain available in Settings.

## Google Drive — recommended

Google Drive uses the private `appDataFolder` space. The backup is not mixed with the user's normal visible Drive files.

One-time Google Cloud setup:

1. Open Google Cloud Console and create/select the CRI BLO project.
2. Enable **Google Drive API**.
3. Configure the OAuth consent screen.
4. Create an **OAuth 2.0 Client ID** of type **Web application**.
5. Add the origins used by CRI BLO:
   - `https://localhost` — Capacitor Android app
   - `https://jugentorba.github.io` — GitHub Pages PWA
6. Copy the Client ID.
7. Either:
   - set build variable `VITE_GOOGLE_CLIENT_ID`, or
   - paste the Client ID in **CRI BLO → Settings → Google Drive**.

Scopes used:

- `https://www.googleapis.com/auth/drive.appdata`
- `https://www.googleapis.com/auth/userinfo.email`

The OAuth Client ID is public application metadata; it is not a password or secret.

## Microsoft OneDrive

OneDrive stores CRI BLO files inside its application folder.

One-time Microsoft Entra/Azure setup:

1. Create an App Registration for CRI BLO.
2. Allow the account types you want to use. For a personal Microsoft account, include personal Microsoft accounts.
3. Add SPA redirect URIs:
   - `https://localhost`
   - the deployed PWA origin (currently `https://jugentorba.github.io`)
4. Use delegated Microsoft Graph permissions/scopes:
   - `Files.ReadWrite.AppFolder`
   - `User.Read`
   - `offline_access`
5. Copy the Application (client) ID.
6. Either:
   - set build variable `VITE_AZURE_CLIENT_ID`, or
   - paste the Client ID in **CRI BLO → Settings → Microsoft OneDrive**.

Some company/school Microsoft tenants can require administrator approval for applications. CRI BLO cannot bypass an organization's tenant policy. A personal Microsoft account normally avoids that organization-specific restriction.

## Android release signing — separate from cloud OAuth

OAuth Client IDs are public. The Android signing key is **not**.

Production APK updates must always use the same permanent signing key through:

`.github/workflows/build-release.yml`

Required GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_STORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Never commit the keystore or its passwords to GitHub.

The production Android package remains:

`com.criblo.app`

and every release gets a higher `versionCode`.
