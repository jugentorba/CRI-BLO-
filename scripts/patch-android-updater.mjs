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
import android.content.Intent;
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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "CriBloUpdater")
public class CriBloUpdaterPlugin extends Plugin {
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String requestedName = call.getString("fileName");
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
            try {
                File directory = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (directory == null) directory = activity.getFilesDir();
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IllegalStateException("Impossible de créer le dossier de mise à jour.");
                }

                File apk = new File(directory, safeFileName);
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(120000);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*");
                connection.setRequestProperty("User-Agent", "CRI-BLO-Updater");
                connection.connect();

                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    throw new IllegalStateException("Téléchargement refusé (HTTP " + status + ").");
                }

                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(apk, false)) {
                    byte[] buffer = new byte[32768];
                    int read;
                    long total = 0;
                    while ((read = input.read(buffer)) >= 0) {
                        if (read == 0) continue;
                        output.write(buffer, 0, read);
                        total += read;
                    }
                    output.flush();
                    if (total < 1024) {
                        throw new IllegalStateException("Le fichier APK téléchargé est vide ou incomplet.");
                    }
                }

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
                        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        activity.startActivity(install);

                        JSObject result = new JSObject();
                        result.put("status", "installer_opened");
                        result.put("message", "APK téléchargé. Confirmez l'installation Android.");
                        call.resolve(result);
                    } catch (Exception error) {
                        call.reject("APK téléchargé mais impossible d'ouvrir l'installateur Android.", error);
                    }
                });
            } catch (Exception error) {
                call.reject("Téléchargement de la mise à jour impossible: " + error.getMessage(), error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "criblo-updater").start();
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

import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "CriBloStorage")
public class CriBloStoragePlugin extends Plugin {
    private static final String PREFS = "criblo_storage";
    private static final String KEY_TREE_URI = "export_tree_uri";
    private final Map<String, OutputStream> openStreams = new ConcurrentHashMap<>();

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
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
            prefs().edit().putString(KEY_TREE_URI, treeUri.toString()).apply();

            response.put("status", "selected");
            response.put("name", folderName(treeUri));
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Impossible de conserver l'accès au dossier sélectionné.", error);
        }
    }

    @PluginMethod
    public void beginWrite(PluginCall call) {
        String tree = prefs().getString(KEY_TREE_URI, null);
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

        fileName = fileName.replace("/", "_").replace("\\\\", "_");

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

            OutputStream output = resolver.openOutputStream(documentUri, "wt");
            if (output == null) throw new IllegalStateException("Impossible d'ouvrir le fichier.");

            String token = UUID.randomUUID().toString();
            openStreams.put(token, output);

            JSObject response = new JSObject();
            response.put("wrote", true);
            response.put("token", token);
            response.put("folderName", folderName(treeUri));
            call.resolve(response);
        } catch (SecurityException error) {
            prefs().edit().remove(KEY_TREE_URI).apply();
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
        openStreams.clear();
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
