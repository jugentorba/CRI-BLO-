package com.criblo.nativebrowser;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
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
import java.util.List;

/**
 * Android Storage Access Framework bridge used only for CRI-BLO exports.
 *
 * The WebView File System Access API does not expose showDirectoryPicker on
 * Android. This plugin therefore lets the technician choose any writable
 * folder exposed by Android's system document picker, persists that access,
 * and writes exports back to that exact folder on future launches.
 */
@CapacitorPlugin(name = "CRIExport")
public class CRIExportPlugin extends Plugin {
    private static final String PREFS = "criblo.export.native";
    private static final String KEY_TREE_URI = "treeUri";
    private static final String KEY_FOLDER_NAME = "folderName";

    private OutputStream activeOutput;
    private String activeFolderName;

    @PluginMethod
    public void pickDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
            Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );

        String saved = prefs().getString(KEY_TREE_URI, null);
        if (saved != null) {
            try {
                intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(saved));
            } catch (Exception ignored) {
                // Some document providers reject an initial URI. The picker can
                // still open normally without it.
            }
        }

        startActivityForResult(call, intent, "pickDirectoryResult");
    }

    @ActivityCallback
    private void pickDirectoryResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        Uri treeUri = data.getData();
        int requestedFlags = data.getFlags() &
            (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

        if ((requestedFlags & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) == 0) {
            call.reject("Le dossier choisi n'autorise pas l'écriture.");
            return;
        }

        try {
            getContext().getContentResolver().takePersistableUriPermission(treeUri, requestedFlags);
            String name = folderDisplayName(treeUri);
            prefs().edit()
                .putString(KEY_TREE_URI, treeUri.toString())
                .putString(KEY_FOLDER_NAME, name)
                .apply();

            JSObject response = new JSObject();
            response.put("cancelled", false);
            response.put("name", name);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Impossible de conserver l'accès à ce dossier.", error);
        }
    }

    @PluginMethod
    public void getDirectory(PluginCall call) {
        Uri treeUri = writableTreeUri();
        JSObject response = new JSObject();
        response.put("selected", treeUri != null);
        if (treeUri != null) {
            response.put("name", prefs().getString(KEY_FOLDER_NAME, folderDisplayName(treeUri)));
        }
        call.resolve(response);
    }

    /**
     * Opens/truncates the requested file. The binary payload itself is then
     * sent in small chunks with appendChunk so large ZIP/XLSX exports do not
     * have to cross the Capacitor bridge as one huge Base64 JSON string.
     */
    @PluginMethod
    public synchronized void beginFile(PluginCall call) {
        closeActiveOutput();

        String fileName = safeFileName(call.getString("fileName"));
        String mimeType = call.getString("mimeType");
        if (fileName == null) {
            call.reject("Nom de fichier invalide.");
            return;
        }
        if (mimeType == null || mimeType.isBlank()) mimeType = "application/octet-stream";

        Uri treeUri = writableTreeUri();
        if (treeUri == null) {
            call.reject("Aucun dossier d'export Android sélectionné.");
            return;
        }

        try {
            Uri documentUri = findChild(treeUri, fileName);
            if (documentUri == null) {
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(
                    treeUri,
                    DocumentsContract.getTreeDocumentId(treeUri)
                );
                documentUri = DocumentsContract.createDocument(
                    getContext().getContentResolver(),
                    parent,
                    mimeType,
                    fileName
                );
            }
            if (documentUri == null) throw new IllegalStateException("createDocument returned null");

            OutputStream output = getContext().getContentResolver().openOutputStream(documentUri, "wt");
            if (output == null) throw new IllegalStateException("openOutputStream returned null");
            activeOutput = output;
            activeFolderName = prefs().getString(KEY_FOLDER_NAME, folderDisplayName(treeUri));

            JSObject response = new JSObject();
            response.put("ready", true);
            response.put("folderName", activeFolderName);
            call.resolve(response);
        } catch (Exception firstError) {
            // A few providers cannot truncate an existing document with "wt".
            // Re-create it once before giving up.
            try {
                Uri existing = findChild(treeUri, fileName);
                if (existing != null) {
                    DocumentsContract.deleteDocument(getContext().getContentResolver(), existing);
                }
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(
                    treeUri,
                    DocumentsContract.getTreeDocumentId(treeUri)
                );
                Uri documentUri = DocumentsContract.createDocument(
                    getContext().getContentResolver(),
                    parent,
                    mimeType,
                    fileName
                );
                if (documentUri == null) throw firstError;
                OutputStream output = getContext().getContentResolver().openOutputStream(documentUri, "w");
                if (output == null) throw firstError;
                activeOutput = output;
                activeFolderName = prefs().getString(KEY_FOLDER_NAME, folderDisplayName(treeUri));

                JSObject response = new JSObject();
                response.put("ready", true);
                response.put("folderName", activeFolderName);
                call.resolve(response);
            } catch (Exception retryError) {
                closeActiveOutput();
                call.reject("Impossible d'écrire dans le dossier CRI BLO sélectionné.", retryError);
            }
        }
    }

    @PluginMethod
    public synchronized void appendChunk(PluginCall call) {
        if (activeOutput == null) {
            call.reject("Aucun export Android en cours.");
            return;
        }
        String dataBase64 = call.getString("dataBase64");
        if (dataBase64 == null) {
            call.reject("Données d'export manquantes.");
            return;
        }
        try {
            byte[] bytes = Base64.decode(dataBase64, Base64.DEFAULT);
            activeOutput.write(bytes);
            JSObject response = new JSObject();
            response.put("written", bytes.length);
            call.resolve(response);
        } catch (Exception error) {
            closeActiveOutput();
            call.reject("Écriture de l'export interrompue.", error);
        }
    }

    @PluginMethod
    public synchronized void finishFile(PluginCall call) {
        if (activeOutput == null) {
            call.reject("Aucun export Android en cours.");
            return;
        }
        String folderName = activeFolderName;
        try {
            activeOutput.flush();
            activeOutput.close();
            activeOutput = null;
            activeFolderName = null;
            JSObject response = new JSObject();
            response.put("wrote", true);
            response.put("folderName", folderName);
            call.resolve(response);
        } catch (Exception error) {
            closeActiveOutput();
            call.reject("Impossible de terminer l'export Android.", error);
        }
    }

    @PluginMethod
    public synchronized void abortFile(PluginCall call) {
        closeActiveOutput();
        call.resolve();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, 0);
    }

    private Uri writableTreeUri() {
        String raw = prefs().getString(KEY_TREE_URI, null);
        if (raw == null || raw.isBlank()) return null;
        Uri wanted;
        try {
            wanted = Uri.parse(raw);
        } catch (Exception error) {
            return null;
        }

        List<UriPermission> permissions = getContext().getContentResolver().getPersistedUriPermissions();
        for (UriPermission permission : permissions) {
            if (wanted.equals(permission.getUri()) && permission.isWritePermission()) return wanted;
        }
        return null;
    }

    private String folderDisplayName(Uri treeUri) {
        try {
            ContentResolver resolver = getContext().getContentResolver();
            Uri documentUri = DocumentsContract.buildDocumentUriUsingTree(
                treeUri,
                DocumentsContract.getTreeDocumentId(treeUri)
            );
            try (Cursor cursor = resolver.query(
                documentUri,
                new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME },
                null,
                null,
                null
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    String value = cursor.getString(0);
                    if (value != null && !value.isBlank()) return value;
                }
            }
        } catch (Exception ignored) {}

        String id;
        try {
            id = DocumentsContract.getTreeDocumentId(treeUri);
        } catch (Exception error) {
            id = treeUri.getLastPathSegment();
        }
        if (id == null || id.isBlank()) return "Dossier sélectionné";
        int colon = id.lastIndexOf(':');
        String value = colon >= 0 && colon + 1 < id.length() ? id.substring(colon + 1) : id;
        int slash = value.lastIndexOf('/');
        if (slash >= 0 && slash + 1 < value.length()) value = value.substring(slash + 1);
        return value.isBlank() ? "Dossier sélectionné" : value;
    }

    private Uri findChild(Uri treeUri, String fileName) {
        ContentResolver resolver = getContext().getContentResolver();
        String parentId = DocumentsContract.getTreeDocumentId(treeUri);
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentId);
        try (Cursor cursor = resolver.query(
            children,
            new String[] {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME
            },
            null,
            null,
            null
        )) {
            if (cursor == null) return null;
            while (cursor.moveToNext()) {
                String id = cursor.getString(0);
                String name = cursor.getString(1);
                if (fileName.equals(name)) {
                    return DocumentsContract.buildDocumentUriUsingTree(treeUri, id);
                }
            }
        } catch (Exception ignored) {}
        return null;
    }

    private static String safeFileName(String raw) {
        if (raw == null) return null;
        String name = raw.trim().replace('/', '_').replace('\\', '_');
        if (name.isBlank() || name.equals(".") || name.equals("..")) return null;
        return name;
    }

    private synchronized void closeActiveOutput() {
        if (activeOutput != null) {
            try { activeOutput.close(); } catch (Exception ignored) {}
        }
        activeOutput = null;
        activeFolderName = null;
    }

    @Override
    protected void handleOnDestroy() {
        closeActiveOutput();
        super.handleOnDestroy();
    }
}
