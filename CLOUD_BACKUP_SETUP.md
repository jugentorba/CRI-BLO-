# CRI BLO cloud backup setup

CRI BLO supports:

1. **Cloud folder (Android)** — recommended. Uses Android's system Storage Access Framework, so the user can choose a folder exposed by Google Drive, OneDrive, Dropbox, USB or local storage without CRI BLO needing OAuth credentials.
2. **Google Drive API** — optional direct app-data backup when the CRI BLO Google OAuth application is configured.
3. **Microsoft OneDrive API** — optional direct AppFolder backup when the CRI BLO Microsoft application is configured.
4. **Local backup file** — emergency/offline fallback.

End users never enter OAuth Client IDs. OAuth configuration belongs to the CRI BLO application build. Every user signs in with their own Google or Microsoft account and backs up only their own CRI BLO data.

## Cloud folder — recommended on Android

No application API key or OAuth client is required.

1. In **Settings → Synchronisation multi-appareils**, choose **Dossier cloud Android**.
2. Tap **Choisir le dossier cloud**.
3. Android opens its system document-provider picker.
4. Choose a folder exposed by an installed provider (for example Google Drive, OneDrive, Dropbox), USB storage, or local storage.
5. CRI BLO keeps the persistable folder permission and writes `CRI-BLO-cloud-backup.json` there.
6. On another Android device, select the same cloud folder and use **Restaurer du cloud**.

The snapshot includes CRI history, photos, attachments and other local CRI BLO data. API keys remain device-local and are deliberately excluded from cloud snapshots.

## Automatic backup behavior

- Automatic backup is enabled after a cloud account is connected.
- A backup is attempted only when CRI BLO data changed.
- Default minimum interval: **6 hours**.
- Automatic backup never opens an authentication prompt.
- If the provider needs the user to sign in again, the backup remains pending until the user reconnects.
- Manual **Backup now** and **Restore** remain available.

## Google Drive — recommended

Google Drive uses the private `appDataFolder` area. Each user's backup stays in that user's own Google Drive account and is hidden from normal Drive files.

### One-time application setup

1. Create/select the CRI BLO project in Google Cloud.
2. Enable the **Google Drive API**.
3. Configure the OAuth consent screen for an external/public audience.
4. Create a **Web application OAuth client**.
5. Put that Web Client ID in the GitHub repository variable:
   - `GOOGLE_WEB_CLIENT_ID`
6. Create an **Android OAuth client** in the same Google Cloud project:
   - package name: `com.criblo.app`
   - SHA-1: fingerprint of the permanent CRI BLO release signing certificate.
7. For the PWA, add the deployed web origin to the Web OAuth client as required by Google.

The app requests these scopes:

- `https://www.googleapis.com/auth/drive.appdata`
- `https://www.googleapis.com/auth/userinfo.email`

The OAuth Client ID is public application metadata. It is not a password. The Android OAuth client ID itself is not embedded or entered by the user; Google matches the installed app using package name + signing certificate SHA-1.

## Microsoft OneDrive

OneDrive configuration also belongs to the CRI BLO application, not to individual users.

One-time setup:

1. Create a Microsoft Entra/Azure App Registration for CRI BLO.
2. Allow the account types you want to support, including personal Microsoft accounts if desired.
3. Add the required redirect URI(s) for the deployed CRI BLO app/PWA.
4. Grant delegated Microsoft Graph permissions:
   - `Files.ReadWrite.AppFolder`
   - `User.Read`
   - `offline_access`
5. Put the Application (client) ID in the GitHub repository variable:
   - `AZURE_CLIENT_ID`

Users then only tap **Connect my OneDrive** and choose their own Microsoft account.

## Android release signing

Android release signing is separate from Google account sign-in.

Production APK updates must always use the same permanent signing key through:

`.github/workflows/build-release.yml`

Required GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEY_PASSWORD`

The key alias is fixed to `criblo`, and the same strong password is used for the PKCS12 store and private key.

Never commit the keystore or its passwords to the repository.

The production Android package stays permanently:

`com.criblo.app`

Every future release gets a higher `versionCode`.

The SHA-1 fingerprint from this same permanent signing certificate must be registered in the Google Cloud Android OAuth client.
