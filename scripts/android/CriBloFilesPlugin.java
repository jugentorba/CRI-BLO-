package com.criblo.app;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "CriBloFiles")
public class CriBloFilesPlugin extends Plugin {
    private static class Copy {
        final File file;
        final String mimeType;
        final FileOutputStream output;
        Copy(File file, String mimeType) throws Exception {
            this.file = file;
            this.mimeType = mimeType;
            this.output = new FileOutputStream(file, false);
        }
    }
    private final Map<String, Copy> copies = new ConcurrentHashMap<>();

    @PluginMethod
    public void beginOpen(PluginCall call) {
        try {
            File root = new File(getContext().getCacheDir(), "attachments");
            // Old viewer copies are disposable; the original remains in IndexedDB.
            File[] oldCopies = root.listFiles();
            if (oldCopies != null) for (File directory : oldCopies) {
                if (directory.lastModified() < System.currentTimeMillis() - 86400000L) {
                    File[] files = directory.listFiles();
                    if (files != null) for (File file : files) file.delete();
                    directory.delete();
                }
            }
            String token = UUID.randomUUID().toString();
            File directory = new File(root, token);
            if (!directory.mkdirs()) throw new IllegalStateException("Dossier temporaire inaccessible.");
            String name = call.getString("fileName", "document").replaceAll("[^\\p{L}\\p{N}._ -]", "_");
            if (name.isEmpty() || name.equals(".") || name.equals("..")) name = "document";
            Copy copy = new Copy(new File(directory, name), call.getString("mimeType", "application/octet-stream"));
            copies.put(token, copy);
            JSObject response = new JSObject();
            response.put("token", token);
            call.resolve(response);
        } catch (Exception error) {
            call.reject("Impossible de préparer l'ouverture du fichier.", error);
        }
    }

    @PluginMethod
    public void writeChunk(PluginCall call) {
        String token = call.getString("token");
        Copy copy = token == null ? null : copies.get(token);
        String data = call.getString("base64");
        if (copy == null || data == null) { call.reject("Copie du fichier introuvable."); return; }
        try {
            copy.output.write(Base64.decode(data, Base64.DEFAULT));
            call.resolve();
        } catch (Exception error) { call.reject("Copie du fichier impossible.", error); }
    }

    @PluginMethod
    public void finishOpen(PluginCall call) {
        String token = call.getString("token");
        Copy copy = token == null ? null : copies.get(token);
        if (copy == null) { call.reject("Copie du fichier introuvable."); return; }
        try {
            copy.output.flush();
            copy.output.getFD().sync();
            copy.output.close();
            Uri uri = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".criblo.updater.fileprovider", copy.file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, copy.mimeType);
            intent.setClipData(ClipData.newRawUri(copy.file.getName(), uri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try {
                    // Do not preflight with resolveActivity: package visibility can hide a valid viewer.
                    getActivity().startActivity(intent);
                    copies.remove(token);
                    call.resolve();
                } catch (ActivityNotFoundException error) {
                    discard(token);
                    call.reject("Aucune application installée ne peut ouvrir ce type de fichier. Le fichier reste conservé dans CRI BLO.", error);
                } catch (Exception error) {
                    discard(token);
                    call.reject("Android n'a pas pu ouvrir ce fichier.", error);
                }
            });
        } catch (Exception error) { discard(token); call.reject("Impossible de lire le fichier joint.", error); }
    }

    @PluginMethod
    public void abortOpen(PluginCall call) {
        discard(call.getString("token"));
        call.resolve();
    }

    private void discard(String token) {
        Copy copy = token == null ? null : copies.remove(token);
        if (copy == null) return;
        try { copy.output.close(); } catch (Exception ignored) { }
        copy.file.delete();
        copy.file.getParentFile().delete();
    }

    @Override
    protected void handleOnDestroy() {
        for (String token : copies.keySet()) discard(token);
        super.handleOnDestroy();
    }
}
