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

const pathsXml = `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path name="updates" path="Download/" />
    <files-path name="internal_updates" path="." />
</paths>
`;
fs.writeFileSync(path.join(xmlDir, "criblo_updater_paths.xml"), pathsXml);

let manifest = fs.readFileSync(manifestPath, "utf8");
if (!manifest.includes("android.permission.REQUEST_INSTALL_PACKAGES")) {
  manifest = manifest.replace(
    "<application",
    '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n\n    <application',
  );
}

if (!manifest.includes(".criblo.updater.fileprovider")) {
  const provider = `
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\\${applicationId}.criblo.updater.fileprovider"
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
