import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appPackage = "com.criblo.app";
const javaDir = path.join(root, "android", "app", "src", "main", "java", ...appPackage.split("."));
const manifestPath = path.join(root, "android", "app", "src", "main", "AndroidManifest.xml");
const xmlDir = path.join(root, "android", "app", "src", "main", "res", "xml");

if (!fs.existsSync(manifestPath)) {
  throw new Error("Android project missing. Run cap add/sync android before patch-android-updater.mjs.");
}

fs.mkdirSync(javaDir, { recursive: true });
fs.mkdirSync(xmlDir, { recursive: true });

const mainActivity = `package ${appPackage};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CriBloUpdaterPlugin.class);
        registerPlugin(CriBloStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
fs.writeFileSync(path.join(javaDir, "MainActivity.java"), mainActivity);

const plugin = `package ${appPackage};

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

@CapacitorPlugin(name = "CriBloUpdater")
public class CriBloUpdaterPlugin extends Plugin {
    private static final int MAX_REDIRECTS = 8;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String requestedName = call.getString("fileName");
        Long expectedSizeValue = call.getLong("expectedSize");
        long expectedSize = expectedSizeValue == null ? 0L : expectedSizeValue.longValue();

        if (url == null || !url.startsWith("https://")) {
            call.reject("URL de mise à jour invalide.");
            return;
        }

        Activity activity = getActivity();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.getPackageManager().canRequestPackageInstalls()) {
            activity.runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName())
                    );
                    activity.startActivity(intent);
                    JSObject result = new JSObject();
                    result.put("status", "permission_required");
                    result.put("message", "Autorisez CRI BLO à installer la mise à jour puis réessayez.");
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject("Impossible d'ouvrir l'autorisation d'installation.", error);
                }
            });
            return;
        }

        String fileName = requestedName == null ? "CRI-BLO.apk" : requestedName;
        fileName = fileName.replaceAll("[^A-Za-z0-9._-]", "_");
        if (!fileName.toLowerCase().endsWith(".apk")) fileName = fileName + ".apk";
        final String safeFileName = fileName;

        new Thread(() -> {
            HttpURLConnection connection = null;
            File apk = null;
            try {
                File directory = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (directory == null) directory = activity.getFilesDir();
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IllegalStateException("Impossible de créer le dossier de mise à jour.");
                }

                apk = new File(directory, safeFileName);
                if (apk.exists() && !apk.delete()) {
                    throw new IllegalStateException("Impossible de remplacer l'ancien fichier de mise à jour.");
                }

                connection = openDownload(url);
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    throw new IllegalStateException("Téléchargement refusé (HTTP " + status + ").");
                }

                String contentType = connection.getContentType();
                if (contentType != null) {
                    String lower = contentType.toLowerCase();
                    if (lower.contains("text/html") || lower.contains("application/json") || lower.contains("text/plain")) {
                        throw new IllegalStateException("GitHub n'a pas renvoyé un fichier APK (Content-Type " + contentType + ").");
                    }
                }

                long responseLength = connection.getContentLengthLong();
                if (expectedSize > 0 && responseLength > 0 && responseLength != expectedSize) {
                    throw new IllegalStateException(
                        "Taille APK inattendue avant téléchargement (" + responseLength + " au lieu de " + expectedSize + " octets)."
                    );
                }

                long total = 0;
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(apk, false)) {
                    byte[] buffer = new byte[32768];
                    int read;
                    while ((read = input.read(buffer)) >= 0) {
                        if (read == 0) continue;
                        output.write(buffer, 0, read);
                        total += read;
                    }
                    output.flush();
                    output.getFD().sync();
                }

                if (total < 1024) {
                    throw new IllegalStateException("Le fichier APK téléchargé est vide ou incomplet.");
                }
                if (expectedSize > 0 && total != expectedSize) {
                    throw new IllegalStateException(
                        "Téléchargement APK incomplet (" + total + " au lieu de " + expectedSize + " octets)."
                    );
                }
                if (apk.length() != total) {
                    throw new IllegalStateException("Le fichier APK écrit sur le téléphone est incomplet.");
                }

                validateZipHeader(apk);
                validatePackageAndSigner(activity, apk);

                File finalApk = apk;
                activity.runOnUiThread(() -> {
                    try {
                        Uri uri = FileProvider.getUriForFile(
                            activity,
                            activity.getPackageName() + ".criblo.updater.fileprovider",
                            finalApk
                        );
                        Intent install = new Intent(Intent.ACTION_VIEW);
                        install.setDataAndType(uri, "application/vnd.android.package-archive");
                        install.setClipData(ClipData.newRawUri("CRI-BLO.apk", uri));
                        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        activity.startActivity(install);

                        JSObject result = new JSObject();
                        result.put("status", "installer_opened");
                        result.put("message", "APK vérifié. Confirmez l'installation Android.");
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("APK vérifié mais impossible d'ouvrir l'installateur Android.", error);
                    }
                });
            } catch (Exception error) {
                if (apk != null && apk.exists()) {
                    // Ne jamais laisser un fichier partiel être réutilisé au prochain essai.
                    //noinspection ResultOfMethodCallIgnored
                    apk.delete();
                }
                call.reject("Téléchargement de la mise à jour impossible: " + error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "criblo-updater").start();
    }

    private HttpURLConnection openDownload(String startUrl) throws Exception {
        String current = startUrl;
        for (int redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
            URL parsed = new URL(current);
            if (!"https".equalsIgnoreCase(parsed.getProtocol())) {
                throw new IllegalStateException("Redirection de mise à jour non sécurisée.");
            }

            HttpURLConnection connection = (HttpURLConnection) parsed.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(120000);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*");
            connection.setRequestProperty("User-Agent", "CRI-BLO-Updater");
            connection.connect();

            int status = connection.getResponseCode();
            if (status == HttpURLConnection.HTTP_MOVED_PERM ||
                status == HttpURLConnection.HTTP_MOVED_TEMP ||
                status == HttpURLConnection.HTTP_SEE_OTHER ||
                status == 307 ||
                status == 308) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.trim().isEmpty()) {
                    throw new IllegalStateException("Redirection GitHub sans destination.");
                }
                current = new URL(parsed, location).toString();
                continue;
            }
            return connection;
        }
        throw new IllegalStateException("Trop de redirections pendant le téléchargement de l'APK.");
    }

    private void validateZipHeader(File apk) throws Exception {
        byte[] header = new byte[4];
        try (FileInputStream input = new FileInputStream(apk)) {
            if (input.read(header) != 4) {
                throw new IllegalStateException("APK vide ou illisible.");
            }
        }
        boolean zip =
            (header[0] & 0xff) == 0x50 &&
            (header[1] & 0xff) == 0x4b &&
            (header[2] & 0xff) == 0x03 &&
            (header[3] & 0xff) == 0x04;
        if (!zip) {
            throw new IllegalStateException("Le fichier téléchargé n'est pas un APK valide (en-tête ZIP absent).");
        }
    }

    private void validatePackageAndSigner(Activity activity, File apk) throws Exception {
        PackageManager manager = activity.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;

        PackageInfo candidate = manager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (candidate == null) {
            throw new IllegalStateException("Android ne reconnaît pas le fichier téléchargé comme un APK.");
        }
        if (!activity.getPackageName().equals(candidate.packageName)) {
            throw new IllegalStateException("L'APK téléchargé n'appartient pas à CRI BLO.");
        }

        PackageInfo installed = manager.getPackageInfo(activity.getPackageName(), flags);
        Signature[] candidateSigners = getSigners(candidate);
        Signature[] installedSigners = getSigners(installed);
        if (candidateSigners.length == 0 || installedSigners.length == 0) {
            throw new IllegalStateException("Signature APK introuvable.");
        }

        boolean sameSigner = false;
        for (Signature next : candidateSigners) {
            for (Signature current : installedSigners) {
                if (MessageDigest.isEqual(next.toByteArray(), current.toByteArray())) {
                    sameSigner = true;
                    break;
                }
            }
            if (sameSigner) break;
        }
        if (!sameSigner) {
            throw new IllegalStateException("La signature de la mise à jour ne correspond pas à l'application installée.");
        }
    }

    @SuppressWarnings("deprecation")
    private Signature[] getSigners(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
            return info.signingInfo.getApkContentsSigners();
        }
        return info.signatures == null ? new Signature[0] : info.signatures;
    }
}
`;
fs.writeFileSync(path.join(javaDir, "CriBloUpdaterPlugin.java"), plugin);

const storagePlugin = `package ${appPackage};

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "CriBloStorage")
public class CriBloStoragePlugin extends Plugin {
    private static final String PREFS = "criblo_storage";
    private static final String KEY_EXPORT_TREE_URI = "export_tree_uri";
    private static final String KEY_CLOUD_TREE_URI = "cloud_tree_uri";
    private static final int READ_CHUNK_BYTES = 256 * 1024;

    private final Map<String, OutputStream> openStreams = new ConcurrentHashMap<>();
    private final Map<String, InputStream> openInputs = new ConcurrentHashMap<>();

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String keyForScope(PluginCall call) {
        String scope = call.getString("scope", "export");
        return "cloud".equals(scope) ? KEY_CLOUD_TREE_URI : KEY_EXPORT_TREE_URI;
    }

    private String storedTree(PluginCall call) {
        return prefs().getString(keyForScope(call), null);
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
            Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    private void folderPicked(PluginCall call, ActivityResult result) {
        JSObject response = new JSObject();
        if (call == null || result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            response.put("status", "cancelled");
            if (call != null) call.resolve(response);
            return;
        }

        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            response.put("status", "cancelled");
            call.resolve(response);
            return;
        }

        try {
            int takeFlags = result.getData().getFlags() &
                (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            if (takeFlags != 0) {
                getContext().getContentResolver().takePersistableUriPermission(treeUri, takeFlags);
            }
            prefs().edit().putString(keyForScope(call), treeUri.toString()).apply();

            response.put("status", "selected");
            response.put("name", folderName(treeUri));
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Impossible de conserver l'accès au dossier sélectionné.", error);
        }
    }

    @PluginMethod
    public void beginWrite(PluginCall call) {
        String tree = storedTree(call);
        if (tree == null || tree.isEmpty()) {
            JSObject response = new JSObject();
            response.put("wrote", false);
            call.resolve(response);
            return;
        }

        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("Nom de fichier manquant.");
            return;
        }

        fileName = safeFileName(fileName);

        try {
            Uri treeUri = Uri.parse(tree);
            ContentResolver resolver = getContext().getContentResolver();
            Uri documentUri = findChild(resolver, treeUri, fileName);
            if (documentUri == null) {
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(
                    treeUri,
                    DocumentsContract.getTreeDocumentId(treeUri)
                );
                documentUri = DocumentsContract.createDocument(resolver, parent, mimeType, fileName);
            }
            if (documentUri == null) throw new IllegalStateException("Impossible de créer le fichier.");

            OutputStream output = resolver.openOutputStream(documentUri, "w");
            if (output == null) throw new IllegalStateException("Impossible d'ouvrir le fichier.");

            String token = UUID.randomUUID().toString();
            openStreams.put(token, output);

            JSObject response = new JSObject();
            response.put("wrote", true);
            response.put("token", token);
            response.put("folderName", folderName(treeUri));
            call.resolve(response);
        } catch (SecurityException error) {
            prefs().edit().remove(keyForScope(call)).apply();
            JSObject response = new JSObject();
            response.put("wrote", false);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Impossible de préparer l'export dans le dossier choisi.", error);
        }
    }

    @PluginMethod
    public void writeChunk(PluginCall call) {
        String token = call.getString("token");
        String base64 = call.getString("base64");
        if (token == null || base64 == null) {
            call.reject("Bloc d'export invalide.");
            return;
        }

        OutputStream output = openStreams.get(token);
        if (output == null) {
            call.reject("Session d'export introuvable.");
            return;
        }

        try {
            output.write(Base64.decode(base64, Base64.DEFAULT));
            call.resolve();
        } catch (Exception error) {
            call.reject("Écriture du fichier impossible.", error);
        }
    }

    @PluginMethod
    public void finishWrite(PluginCall call) {
        String token = call.getString("token");
        OutputStream output = token == null ? null : openStreams.remove(token);
        if (output == null) {
            call.reject("Session d'export introuvable.");
            return;
        }
        try {
            output.flush();
            output.close();
            call.resolve();
        } catch (Exception error) {
            call.reject("Impossible de finaliser le fichier exporté.", error);
        }
    }

    @PluginMethod
    public void abortWrite(PluginCall call) {
        String token = call.getString("token");
        OutputStream output = token == null ? null : openStreams.remove(token);
        if (output != null) {
            try {
                output.close();
            } catch (Exception ignored) {
                // best effort
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void beginRead(PluginCall call) {
        String tree = storedTree(call);
        if (tree == null || tree.isEmpty()) {
            JSObject response = new JSObject();
            response.put("found", false);
            call.resolve(response);
            return;
        }

        String fileName = call.getString("fileName");
        if (fileName == null || fileName.trim().isEmpty()) {
            call.reject("Nom de sauvegarde manquant.");
            return;
        }

        try {
            Uri treeUri = Uri.parse(tree);
            ContentResolver resolver = getContext().getContentResolver();
            Uri documentUri = findChild(resolver, treeUri, safeFileName(fileName));
            if (documentUri == null) {
                JSObject response = new JSObject();
                response.put("found", false);
                response.put("folderName", folderName(treeUri));
                call.resolve(response);
                return;
            }

            InputStream input = resolver.openInputStream(documentUri);
            if (input == null) throw new IllegalStateException("Impossible d'ouvrir la sauvegarde cloud.");

            String token = UUID.randomUUID().toString();
            openInputs.put(token, input);

            JSObject response = new JSObject();
            response.put("found", true);
            response.put("token", token);
            response.put("folderName", folderName(treeUri));
            call.resolve(response);
        } catch (SecurityException error) {
            prefs().edit().remove(keyForScope(call)).apply();
            JSObject response = new JSObject();
            response.put("found", false);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Impossible de lire la sauvegarde dans le dossier choisi.", error);
        }
    }

    @PluginMethod
    public void readChunk(PluginCall call) {
        String token = call.getString("token");
        if (token == null) {
            call.reject("Session de restauration invalide.");
            return;
        }

        InputStream input = openInputs.get(token);
        if (input == null) {
            JSObject response = new JSObject();
            response.put("base64", "");
            response.put("done", true);
            call.resolve(response);
            return;
        }

        try {
            byte[] buffer = new byte[READ_CHUNK_BYTES];
            int read = input.read(buffer);
            JSObject response = new JSObject();
            if (read < 0) {
                openInputs.remove(token);
                input.close();
                response.put("base64", "");
                response.put("done", true);
            } else {
                response.put("base64", Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP));
                response.put("done", false);
            }
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Lecture de la sauvegarde cloud impossible.", error);
        }
    }

    @PluginMethod
    public void finishRead(PluginCall call) {
        String token = call.getString("token");
        InputStream input = token == null ? null : openInputs.remove(token);
        if (input != null) {
            try {
                input.close();
            } catch (Exception ignored) {
                // best effort
            }
        }
        call.resolve();
    }

    private String safeFileName(String value) {
        return value.replace("/", "_").replace("\\", "_");
    }

    private Uri findChild(ContentResolver resolver, Uri treeUri, String fileName) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(
            treeUri,
            DocumentsContract.getTreeDocumentId(treeUri)
        );
        String[] projection = new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID,
            DocumentsContract.Document.COLUMN_DISPLAY_NAME
        };

        try (Cursor cursor = resolver.query(children, projection, null, null, null)) {
            if (cursor == null) return null;
            int idIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID);
            int nameIndex = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME);
            while (cursor.moveToNext()) {
                if (nameIndex >= 0 && fileName.equals(cursor.getString(nameIndex))) {
                    String id = cursor.getString(idIndex);
                    return DocumentsContract.buildDocumentUriUsingTree(treeUri, id);
                }
            }
        }
        return null;
    }

    private String folderName(Uri treeUri) {
        try {
            String documentId = Uri.decode(DocumentsContract.getTreeDocumentId(treeUri));
            int colon = documentId.indexOf(':');
            String folderPath = colon >= 0 ? documentId.substring(colon + 1) : documentId;
            while (folderPath.endsWith("/")) folderPath = folderPath.substring(0, folderPath.length() - 1);
            int slash = folderPath.lastIndexOf('/');
            String name = slash >= 0 ? folderPath.substring(slash + 1) : folderPath;
            return name == null || name.isEmpty() ? "Dossier CRI BLO" : name;
        } catch (Exception ignored) {
            return "Dossier CRI BLO";
        }
    }

    @Override
    protected void handleOnDestroy() {
        for (OutputStream output : openStreams.values()) {
            try {
                output.close();
            } catch (Exception ignored) {
                // best effort
            }
        }
        for (InputStream input : openInputs.values()) {
            try {
                input.close();
            } catch (Exception ignored) {
                // best effort
            }
        }
        openStreams.clear();
        openInputs.clear();
        super.handleOnDestroy();
    }
}
`;
fs.writeFileSync(path.join(javaDir, "CriBloStoragePlugin.java"), storagePlugin);

const pathsXml = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path name="updates" path="Download/" />
    <files-path name="internal_updates" path="." />
</paths>
`;
fs.writeFileSync(path.join(xmlDir, "criblo_updater_paths.xml"), pathsXml);

let manifest = fs.readFileSync(manifestPath, "utf8");
const requiredPermissions = [
  "android.permission.CAMERA",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.RECORD_AUDIO",
  "android.permission.REQUEST_INSTALL_PACKAGES",
];
const missingPermissions = requiredPermissions.filter((permission) => !manifest.includes(permission));
if (missingPermissions.length) {
  const lines = missingPermissions
    .map((permission) => `    <uses-permission android:name="${permission}" />`)
    .join("\n");
  manifest = manifest.replace("<application", `${lines}\n\n    <application`);
}

if (!manifest.includes("android:usesCleartextTraffic=")) {
  manifest = manifest.replace("<application", '<application android:usesCleartextTraffic="true"');
}

if (!manifest.includes(".criblo.updater.fileprovider")) {
  const provider = `
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.criblo.updater.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/criblo_updater_paths" />
        </provider>
`;
  manifest = manifest.replace("</application>", provider + "    </application>");
}

fs.writeFileSync(manifestPath, manifest);
console.log("CRI BLO Android updater bridge installed.");
