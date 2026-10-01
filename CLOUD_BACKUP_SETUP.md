# CRI BLO cloud backup setup

CRI BLO supports:

1. **Google Drive** — recommended primary cloud backup.
2. **Microsoft OneDrive** — alternative cloud backup.
3. **Local backup file** — emergency/offline fallback.

End users never enter OAuth Client IDs. OAuth configuration belongs to the CRI BLO application build. Every user signs in with their own Google or Microsoft account and backs up only their own CRI BLO data.

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
