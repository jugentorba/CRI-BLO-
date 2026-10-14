package com.criblo.app;

import static org.junit.Assert.*;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.pm.ApplicationInfo;
import android.content.pm.ActivityInfo;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.lang.reflect.Method;
import java.lang.reflect.Field;
import java.util.Map;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class NativeFileFlowsTest {
    public static class Host extends AppCompatActivity {
        Intent opened;
        boolean missingViewer;
        boolean focused = true;
        @Override public void onCreate(Bundle state) {
            setTheme(androidx.appcompat.R.style.Theme_AppCompat);
            super.onCreate(state);
        }
        @Override public boolean hasWindowFocus() { return focused; }
        @Override public void startActivity(Intent intent) {
            if (missingViewer) throw new ActivityNotFoundException();
            opened = intent;
        }
    }
    static class Call extends PluginCall {
        JSObject response;
        String error;
        boolean resolved;
        Call(JSObject data) { super(null, "test", "test", "test", data); }
        @Override public void resolve(JSObject data) { response = data; resolved = true; }
        @Override public void resolve() { resolved = true; }
        @Override public void reject(String message, String code, Exception ex, JSObject data) { error = message; if (ex != null) ex.printStackTrace(); }
    }
    static class Files extends CriBloFilesPlugin {
        final Host host;
        Files(Host host) { this.host = host; }
        @Override public Context getContext() { return host; }
        @Override public AppCompatActivity getActivity() { return host; }
    }
    static class Updater extends CriBloUpdaterPlugin {
        Intent requested;
        String callback;
        @Override public void startActivityForResult(PluginCall call, Intent intent, String name) {
            requested = intent; callback = name;
        }
    }
    @Before public void resetFileProviderCacheBetweenSandboxDirectories() throws Exception {
        // Robolectric gives each test a new cacheDir; FileProvider retains its static
        // authority-to-root mapping across tests, so a prior test's path is stale.
        // Clear only the JVM test cache, never application files or user history.
        Field field = FileProvider.class.getDeclaredField("sCache");
        field.setAccessible(true);
        Object value = field.get(null);
        if (!(value instanceof Map)) throw new IllegalStateException("FileProvider cache unavailable");
        Map<?, ?> strategies = (Map<?, ?>) value;
        synchronized (strategies) { strategies.clear(); }
    }
    private Host host() { return Robolectric.buildActivity(Host.class).setup().get(); }
    private Call copy(Files files) {
        Call begin = new Call(new JSObject().put("fileName", "test.pdf").put("mimeType", "application/pdf"));
        files.beginOpen(begin);
        assertNull(begin.error);
        String token = begin.response.getString("token");
        Call write = new Call(new JSObject().put("token", token).put("base64", Base64.encodeToString("%PDF-binary-test".getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP)));
        files.writeChunk(write); assertNull(write.error);
        return new Call(new JSObject().put("token", token));
    }
    @Test public void attachmentUriContainsCompleteBytesAndReadGrant() throws Exception {
        Host host = host(); Files files = new Files(host); Call finish = copy(files);
        files.finishOpen(finish);
        Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
        assertNull(finish.error); assertTrue(finish.resolved);
        assertEquals(Intent.ACTION_VIEW, host.opened.getAction());
        assertEquals("application/pdf", host.opened.getType());
        assertEquals("content", host.opened.getData().getScheme());
        assertTrue((host.opened.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0);
        try (InputStream input = host.getContentResolver().openInputStream(host.opened.getData())) {
            assertEquals("%PDF-binary-test", new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
    }
    @Test public void missingViewerReturnsAnErrorNotSuccess() {
        Host host = host(); host.missingViewer = true; Files files = new Files(host); Call finish = copy(files);
        files.finishOpen(finish); Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
        assertFalse("Unexpected success; error=" + finish.error, finish.resolved);
        assertNotNull("No error returned", finish.error);
        assertTrue("Unexpected error: " + finish.error, finish.error.contains("Aucune application"));
    }
    private void launch(Updater updater, Host host, Call call) throws Exception {
        Method method = CriBloUpdaterPlugin.class.getDeclaredMethod("openSystemPackageInstaller", PluginCall.class, Activity.class, Uri.class);
        method.setAccessible(true);
        method.invoke(updater, call, host, Uri.parse("content://com.criblo.app.criblo.updater.fileprovider/updates/test.apk"));
    }
    @Test public void invisibleInstallerStillUsesDedicatedInstallActionAndWaitsForResult() throws Exception {
        Updater updater = new Updater(); Call call = new Call(new JSObject()); launch(updater, host(), call);
        assertEquals(Intent.ACTION_INSTALL_PACKAGE, updater.requested.getAction());
        assertTrue(updater.requested.getBooleanExtra(Intent.EXTRA_RETURN_RESULT, false));
        assertTrue((updater.requested.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION) != 0);
        assertEquals("installationFinished", updater.callback);
        assertFalse(call.resolved);
    }
    @Test public void explicitSystemInstallerWinsOverThirdPartyHandler() throws Exception {
        Host host = host(); Updater updater = new Updater();
        Intent filter = new Intent(Intent.ACTION_INSTALL_PACKAGE).setData(Uri.parse("content://com.criblo.app.criblo.updater.fileprovider/updates/test.apk"));
        ResolveInfo info = new ResolveInfo(); info.activityInfo = new ActivityInfo();
        info.activityInfo.packageName = "android.installer"; info.activityInfo.name = "android.installer.InstallActivity";
        info.activityInfo.exported = true; info.activityInfo.applicationInfo = new ApplicationInfo();
        info.activityInfo.applicationInfo.flags = ApplicationInfo.FLAG_SYSTEM;
        Shadows.shadowOf(host.getPackageManager()).addResolveInfoForIntent(filter, info);
        launch(updater, host, new Call(new JSObject()));
        assertNotNull(updater.requested.getComponent());
        assertEquals("android.installer", updater.requested.getComponent().getPackageName());
    }
    @Test public void cancellationIsNotReportedAsInstalled() throws Exception {
        Updater updater = new Updater(); Call call = new Call(new JSObject());
        Method method = CriBloUpdaterPlugin.class.getDeclaredMethod("installationFinished", PluginCall.class, ActivityResult.class);
        method.setAccessible(true); method.invoke(updater, call, new ActivityResult(Activity.RESULT_CANCELED, null));
        assertEquals("cancelled", call.response.getString("status"));
    }
}
