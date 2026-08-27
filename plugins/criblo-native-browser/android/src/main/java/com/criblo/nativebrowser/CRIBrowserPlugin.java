package com.criblo.nativebrowser;

import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Message;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.PopupMenu;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "CRIBrowser")
public class CRIBrowserPlugin extends Plugin {
    private static final String PINNED_ORANGE_URL = "https://mobi-prod.orange.fr/mobi2/web/home/?codeContexte=MOBI2";
    private static final String PREFS = "criblo.browser.native";
    private static final String KEY_LAST_URL = "lastURL";
    private static final String KEY_HISTORY = "history";
    private static final String KEY_FAVORITES = "favorites";
    private static final String KEY_TABS = "tabs";
    private static final String KEY_UPDATED_AT = "updatedAt";

    private static final String AUTOFILL_COMPATIBILITY_SCRIPT = """
        (function(){
          function mark(i){
            if(!i||i.tagName!=='INPUT')return;
            var t=String(i.getAttribute('type')||'text').toLowerCase();
            var a=String(i.getAttribute('autocomplete')||'').trim().toLowerCase();
            if(a&&a!=='on')return;
            var h=[i.getAttribute('name'),i.getAttribute('id'),i.getAttribute('placeholder'),i.getAttribute('aria-label')].filter(Boolean).join(' ').toLowerCase();
            if(t==='password'){i.setAttribute('autocomplete',/new|create|confirm|nouveau|confirmer|signup|register/.test(h)?'new-password':'current-password');return;}
            if(/user|username|login|email|mail|identifiant|compte|account/.test(h)){i.setAttribute('autocomplete','username');return;}
            if(/otp|one.?time|verification|security.?code|code.?securite/.test(h)){i.setAttribute('autocomplete','one-time-code');}
          }
          var n=document.querySelectorAll('input');for(var x=0;x<n.length;x++)mark(n[x]);
        })();
        """;

    private Dialog activeDialog;
    private WebView activeWebView;
    private PluginCall activeCall;
    private EditText addressField;
    private Button backButton;
    private Button forwardButton;
    private Button favoriteButton;
    private Button tabsButton;
    private SharedPreferences prefs;
    private final ArrayList<String> tabUrls = new ArrayList<>();
    private int activeTab = 0;

    @PluginMethod
    public void getState(PluginCall call) {
        SharedPreferences storage = getActivity().getSharedPreferences(PREFS, 0);
        try {
            JSONObject state = new JSONObject();
            state.put("version", 1);
            state.put("updatedAt", storage.getLong(KEY_UPDATED_AT, 0));
            String last = storage.getString(KEY_LAST_URL, null);
            if (last != null) state.put("lastURL", last);
            state.put("tabs", new JSONArray(storage.getString(KEY_TABS, "[]")));
            state.put("history", exportRecords(storage.getString(KEY_HISTORY, "[]")));
            state.put("favorites", exportRecords(storage.getString(KEY_FAVORITES, "[]")));
            JSObject result = new JSObject();
            result.put("stateJson", state.toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Impossible de lire l'état navigateur.");
        }
    }

    @PluginMethod
    public void restoreState(PluginCall call) {
        String raw = call.getString("stateJson");
        if (raw == null) { call.reject("État navigateur manquant."); return; }
        SharedPreferences storage = getActivity().getSharedPreferences(PREFS, 0);
        try {
            JSONObject state = new JSONObject(raw);
            if (state.optInt("version", 0) != 1) throw new IllegalArgumentException("version");
            long remoteUpdatedAt = state.optLong("updatedAt", 0);
            long localUpdatedAt = storage.getLong(KEY_UPDATED_AT, 0);
            JSObject result = new JSObject();
            if (remoteUpdatedAt <= localUpdatedAt) {
                result.put("applied", false);
                call.resolve(result);
                return;
            }

            JSONArray tabs = state.optJSONArray("tabs");
            JSONArray validTabs = new JSONArray();
            if (tabs != null) {
                for (int i = 0; i < tabs.length(); i++) {
                    String value = tabs.optString(i);
                    if (value.equals("about:blank") || value.startsWith("http://") || value.startsWith("https://")) validTabs.put(value);
                }
            }
            if (validTabs.length() == 0) validTabs.put(PINNED_ORANGE_URL);

            SharedPreferences.Editor editor = storage.edit();
            editor.putString(KEY_TABS, validTabs.toString());
            String last = state.optString("lastURL", "");
            if (last.startsWith("http://") || last.startsWith("https://")) editor.putString(KEY_LAST_URL, last);
            editor.putString(KEY_HISTORY, importRecords(state.optJSONArray("history")).toString());
            editor.putString(KEY_FAVORITES, importRecords(state.optJSONArray("favorites")).toString());
            editor.putLong(KEY_UPDATED_AT, remoteUpdatedAt);
            editor.apply();
            result.put("applied", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Sauvegarde navigateur invalide.");
        }
    }

    private static JSONArray exportRecords(String raw) {
        JSONArray result = new JSONArray();
        try {
            JSONArray local = new JSONArray(raw);
            for (int i = 0; i < local.length(); i++) {
                JSONObject source = local.optJSONObject(i);
                if (source == null) continue;
                JSONObject item = new JSONObject();
                item.put("url", source.optString("url"));
                item.put("title", source.optString("title"));
                item.put("visitedAt", source.optLong("time", 0));
                result.put(item);
            }
        } catch (Exception ignored) {}
        return result;
    }

    private static JSONArray importRecords(JSONArray cloud) {
        JSONArray result = new JSONArray();
        if (cloud == null) return result;
        for (int i = 0; i < Math.min(100, cloud.length()); i++) {
            JSONObject source = cloud.optJSONObject(i);
            if (source == null) continue;
            try {
                JSONObject item = new JSONObject();
                item.put("url", source.optString("url"));
                item.put("title", source.optString("title"));
                item.put("time", (long) source.optDouble("visitedAt", 0));
                result.put(item);
            } catch (Exception ignored) {}
        }
        return result;
    }

    private void touchState() {
        SharedPreferences storage = prefs != null ? prefs : getActivity().getSharedPreferences(PREFS, 0);
        storage.edit().putLong(KEY_UPDATED_AT, System.currentTimeMillis()).apply();
    }

    @PluginMethod
    public void open(PluginCall call) {
        prefs = getActivity().getSharedPreferences(PREFS, 0);
        String requested = call.getString("url");
        if (requested == null) requested = PINNED_ORANGE_URL;
        Boolean resumeValue = call.getBoolean("resumeLast");
        boolean resumeLast = resumeValue != null && resumeValue;
        String rawUrl = resumeLast ? prefs.getString(KEY_LAST_URL, requested) : requested;
        if (rawUrl == null || !(rawUrl.startsWith("https://") || rawUrl.startsWith("http://"))) {
            call.reject("Adresse web invalide.");
            return;
        }
        if (activeDialog != null) {
            call.reject("Un navigateur CRI-BLO est déjà ouvert.");
            return;
        }
        String startUrl = rawUrl;
        getActivity().runOnUiThread(() -> openBrowser(call, startUrl));
    }

    private void openBrowser(PluginCall call, String rawUrl) {
        activeCall = call;
        Dialog dialog = new Dialog(getActivity(), android.R.style.Theme_Material_Light_NoActionBar);
        activeDialog = dialog;

        LinearLayout root = new LinearLayout(getActivity());
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        root.setFitsSystemWindows(true);

        WebView webView = new WebView(getActivity());
        activeWebView = webView;
        configureWebView(webView);
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout chrome = new LinearLayout(getActivity());
        chrome.setOrientation(LinearLayout.VERTICAL);
        chrome.setPadding(12, 8, 12, 8);
        chrome.setBackgroundColor(Color.rgb(247, 247, 249));

        addressField = new EditText(getActivity());
        addressField.setSingleLine(true);
        addressField.setHint("Search or enter address");
        addressField.setTextSize(14f);
        addressField.setPadding(22, 0, 22, 0);
        addressField.setBackgroundColor(Color.WHITE);
        addressField.setImeOptions(EditorInfo.IME_ACTION_GO);
        addressField.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        chrome.addView(addressField, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 48));

        LinearLayout controls = new LinearLayout(getActivity());
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER);
        backButton = makeButton("‹");
        forwardButton = makeButton("›");
        Button refresh = makeButton("↻");
        favoriteButton = makeButton("☆");
        tabsButton = makeButton("▣");
        Button more = makeButton("•••");
        controls.addView(backButton, weightedButtonLayout());
        controls.addView(forwardButton, weightedButtonLayout());
        controls.addView(refresh, weightedButtonLayout());
        controls.addView(favoriteButton, weightedButtonLayout());
        controls.addView(tabsButton, weightedButtonLayout());
        controls.addView(more, weightedButtonLayout());
        chrome.addView(controls, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 52));
        root.addView(chrome, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        backButton.setOnClickListener(v -> { if (webView.canGoBack()) webView.goBack(); });
        forwardButton.setOnClickListener(v -> { if (webView.canGoForward()) webView.goForward(); });
        refresh.setOnClickListener(v -> webView.reload());
        favoriteButton.setOnClickListener(this::showBookmarks);
        tabsButton.setOnClickListener(v -> showTabs());
        more.setOnClickListener(this::showMore);

        addressField.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO || (event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                loadAddress(v.getText().toString());
                v.clearFocus();
                return true;
            }
            return false;
        });
        addressField.setOnFocusChangeListener((v, focused) -> {
            if (focused && activeWebView != null && activeWebView.getUrl() != null) {
                addressField.setText(activeWebView.getUrl());
                addressField.selectAll();
            } else if (!focused) {
                updateChrome();
            }
        });

        loadTabs(rawUrl);

        dialog.setOnKeyListener((d, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                if (webView.canGoBack()) webView.goBack(); else dialog.dismiss();
                return true;
            }
            return false;
        });

        dialog.setOnDismissListener(d -> finishBrowser());
        dialog.setContentView(root);
        dialog.show();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
            dialog.getWindow().setStatusBarColor(Color.WHITE);
            dialog.getWindow().setNavigationBarColor(Color.rgb(247, 247, 249));
        }

        updateChrome();
        loadUrl(rawUrl);
    }

    private Button makeButton(String text) {
        Button button = new Button(getActivity());
        button.setText(text);
        button.setTextSize(22f);
        button.setAllCaps(false);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(4, 0, 4, 0);
        button.setBackgroundColor(Color.TRANSPARENT);
        return button;
    }

    private LinearLayout.LayoutParams weightedButtonLayout() {
        return new LinearLayout.LayoutParams(0, 52, 1f);
    }

    private void configureWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSaveFormData(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        // Remove the explicit WebView markers so Orange/SiteMinder receives the
        // same Chrome-class mobile identity it accepts in a normal browser.
        String ua = settings.getUserAgentString();
        if (ua != null) {
            settings.setUserAgentString(ua.replace("; wv", "").replace(" Version/4.0", ""));
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setLongClickable(true);
        webView.setHapticFeedbackEnabled(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if (scheme == null || scheme.equals("http") || scheme.equals("https") || scheme.equals("about") || scheme.equals("data") || scheme.equals("blob")) return false;
                try { getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                updateChrome();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                updateChrome();
                recordHistory(url, view.getTitle());
                view.evaluateJavascript(AUTOFILL_COMPATIBILITY_SCRIPT, null);
                CookieManager.getInstance().flush();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onReceivedTitle(WebView view, String title) {
                updateChrome();
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView child = new WebView(getActivity());
                child.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageStarted(WebView ignoredView, String url, android.graphics.Bitmap favicon) {
                        view.loadUrl(url);
                        ignoredView.stopLoading();
                        ignoredView.destroy();
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(child);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }

    private void loadAddress(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return;
        if (!value.matches("(?i)^https?://.*")) {
            if (value.contains(".") && !value.contains(" ")) value = "https://" + value;
            else value = "https://www.google.com/search?q=" + URLEncoder.encode(value, StandardCharsets.UTF_8);
        }
        loadUrl(value);
    }

    private void loadUrl(String rawUrl) {
        if (activeWebView == null || rawUrl == null) return;
        activeWebView.loadUrl(rawUrl, java.util.Map.of("Accept-Language", "fr-FR,fr;q=0.9,en;q=0.8"));
    }

    private void loadTabs(String startUrl) {
        tabUrls.clear();
        try {
            JSONArray stored = new JSONArray(prefs.getString(KEY_TABS, "[]"));
            for (int i = 0; i < stored.length(); i++) {
                String value = stored.optString(i);
                if (value.startsWith("http://") || value.startsWith("https://") || value.equals("about:blank")) tabUrls.add(value);
            }
        } catch (Exception ignored) {}
        if (tabUrls.isEmpty()) tabUrls.add(startUrl);
        int index = tabUrls.indexOf(startUrl);
        if (index < 0) { tabUrls.add(startUrl); index = tabUrls.size() - 1; }
        activeTab = index;
        persistTabs();
    }

    private void persistTabs() {
        JSONArray arr = new JSONArray();
        for (String url : tabUrls) arr.put(url);
        prefs.edit().putString(KEY_TABS, arr.toString()).apply();
        touchState();
    }

    private void showTabs() {
        String[] labels = new String[tabUrls.size()];
        for (int i = 0; i < tabUrls.size(); i++) labels[i] = (i == activeTab ? "✓ " : "") + displayHost(tabUrls.get(i));
        new AlertDialog.Builder(getActivity())
            .setTitle("Tabs (" + tabUrls.size() + ")")
            .setItems(labels, (dialog, which) -> switchTab(which))
            .setPositiveButton("New tab", (dialog, which) -> newTab())
            .setNeutralButton("Close current", (dialog, which) -> closeCurrentTab())
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void switchTab(int index) {
        if (index < 0 || index >= tabUrls.size()) return;
        activeTab = index;
        String url = tabUrls.get(index);
        if (url.equals("about:blank")) activeWebView.loadDataWithBaseURL(PINNED_ORANGE_URL, newTabHtml(), "text/html", "UTF-8", null);
        else loadUrl(url);
        persistTabs();
    }

    private void newTab() {
        tabUrls.add("about:blank");
        activeTab = tabUrls.size() - 1;
        persistTabs();
        activeWebView.loadDataWithBaseURL(PINNED_ORANGE_URL, newTabHtml(), "text/html", "UTF-8", null);
        addressField.setText("");
        addressField.requestFocus();
    }

    private void closeCurrentTab() {
        if (tabUrls.size() <= 1) {
            tabUrls.clear();
            tabUrls.add("about:blank");
            activeTab = 0;
        } else {
            tabUrls.remove(activeTab);
            activeTab = Math.min(activeTab, tabUrls.size() - 1);
        }
        persistTabs();
        switchTab(activeTab);
    }

    private void showBookmarks(View anchor) {
        PopupMenu menu = new PopupMenu(getActivity(), anchor);
        menu.getMenu().add(0, 1, 0, "Orange GeoReseaux");
        String current = activeWebView == null ? null : activeWebView.getUrl();
        List<Record> favorites = loadRecords(KEY_FAVORITES);
        boolean exists = current != null && favorites.stream().anyMatch(r -> r.url.equals(current));
        if (current != null && current.startsWith("http")) menu.getMenu().add(0, 2, 1, exists ? "Remove current favorite" : "Add current page to favorites");
        int id = 100;
        for (Record record : favorites.subList(0, Math.min(12, favorites.size()))) menu.getMenu().add(0, id++, id, "★ " + record.title);
        menu.setOnMenuItemClickListener(item -> {
            if (item.getItemId() == 1) { loadUrl(PINNED_ORANGE_URL); return true; }
            if (item.getItemId() == 2) { toggleFavorite(current); return true; }
            int index = item.getItemId() - 100;
            if (index >= 0 && index < favorites.size()) { loadUrl(favorites.get(index).url); return true; }
            return false;
        });
        menu.show();
    }

    private void toggleFavorite(String url) {
        if (url == null) return;
        List<Record> favorites = loadRecords(KEY_FAVORITES);
        int found = -1;
        for (int i = 0; i < favorites.size(); i++) if (favorites.get(i).url.equals(url)) { found = i; break; }
        if (found >= 0) favorites.remove(found);
        else favorites.add(0, new Record(url, activeWebView.getTitle() == null ? displayHost(url) : activeWebView.getTitle(), System.currentTimeMillis()));
        saveRecords(KEY_FAVORITES, favorites);
        updateChrome();
    }

    private void showMore(View anchor) {
        PopupMenu menu = new PopupMenu(getActivity(), anchor);
        menu.getMenu().add(0, 1, 0, "History");
        menu.getMenu().add(0, 2, 1, "Share");
        menu.getMenu().add(0, 3, 2, "Open in browser");
        menu.getMenu().add(0, 4, 3, "Close CRI-BLO Browser");
        menu.setOnMenuItemClickListener(item -> {
            if (item.getItemId() == 1) { showHistory(); return true; }
            if (item.getItemId() == 2) { shareCurrentPage(); return true; }
            if (item.getItemId() == 3) { openExternal(); return true; }
            if (item.getItemId() == 4) { if (activeDialog != null) activeDialog.dismiss(); return true; }
            return false;
        });
        menu.show();
    }

    private void showHistory() {
        List<Record> history = loadRecords(KEY_HISTORY);
        String[] labels = new String[Math.min(15, history.size())];
        for (int i = 0; i < labels.length; i++) labels[i] = history.get(i).title;
        new AlertDialog.Builder(getActivity())
            .setTitle("History")
            .setItems(labels, (dialog, which) -> loadUrl(history.get(which).url))
            .setNeutralButton(history.isEmpty() ? "" : "Clear history", (dialog, which) -> { prefs.edit().remove(KEY_HISTORY).apply(); touchState(); })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void shareCurrentPage() {
        if (activeWebView == null || activeWebView.getUrl() == null) return;
        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("text/plain");
        share.putExtra(Intent.EXTRA_TEXT, activeWebView.getUrl());
        getActivity().startActivity(Intent.createChooser(share, "Share"));
    }

    private void openExternal() {
        try {
            if (activeWebView != null && activeWebView.getUrl() != null) getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(activeWebView.getUrl())));
        } catch (Exception ignored) {}
    }

    private void recordHistory(String url, String title) {
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
        List<Record> history = loadRecords(KEY_HISTORY);
        history.removeIf(record -> record.url.equals(url));
        history.add(0, new Record(url, title == null || title.isBlank() ? displayHost(url) : title, System.currentTimeMillis()));
        if (history.size() > 100) history = new ArrayList<>(history.subList(0, 100));
        saveRecords(KEY_HISTORY, history);
        prefs.edit().putString(KEY_LAST_URL, url).apply();
        if (activeTab >= 0 && activeTab < tabUrls.size()) {
            tabUrls.set(activeTab, url);
            persistTabs();
        }
    }

    private List<Record> loadRecords(String key) {
        ArrayList<Record> records = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(prefs.getString(key, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o != null) records.add(new Record(o.optString("url"), o.optString("title"), o.optLong("time")));
            }
        } catch (Exception ignored) {}
        return records;
    }

    private void saveRecords(String key, List<Record> records) {
        JSONArray arr = new JSONArray();
        for (Record record : records) {
            JSONObject o = new JSONObject();
            try { o.put("url", record.url); o.put("title", record.title); o.put("time", record.time); arr.put(o); } catch (Exception ignored) {}
        }
        prefs.edit().putString(key, arr.toString()).apply();
        touchState();
    }

    private String displayHost(String rawUrl) {
        if (rawUrl == null || rawUrl.equals("about:blank")) return "New tab";
        try {
            String host = Uri.parse(rawUrl).getHost();
            return host == null || host.isEmpty() ? rawUrl : host.replaceFirst("^www\\.", "");
        } catch (Exception ignored) { return rawUrl; }
    }

    private void updateChrome() {
        if (activeWebView == null) return;
        if (backButton != null) backButton.setEnabled(activeWebView.canGoBack());
        if (forwardButton != null) forwardButton.setEnabled(activeWebView.canGoForward());
        if (tabsButton != null) tabsButton.setContentDescription("Tabs, " + tabUrls.size());
        String current = activeWebView.getUrl();
        if (addressField != null && !addressField.hasFocus()) addressField.setText(displayHost(current));
        if (favoriteButton != null) {
            boolean favorite = current != null && loadRecords(KEY_FAVORITES).stream().anyMatch(r -> r.url.equals(current));
            favoriteButton.setText(favorite ? "★" : "☆");
        }
    }

    private String newTabHtml() {
        return "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{font-family:sans-serif;background:#f5f5f7;text-align:center;padding:32px 20px}.c{display:block;margin:32px auto;padding:20px;max-width:320px;background:#fff;border-radius:18px;color:#111;text-decoration:none}.o{font-size:28px;color:#ff7900}</style></head><body><h2>CRI-BLO Browser</h2><a class='c' href='" + PINNED_ORANGE_URL + "'><div class='o'>■</div><b>Orange GeoReseaux</b></a></body></html>";
    }

    private void finishBrowser() {
        PluginCall call = activeCall;
        WebView webView = activeWebView;
        JSObject result = new JSObject();
        if (webView != null) {
            result.put("url", webView.getUrl());
            result.put("title", webView.getTitle());
            if (webView.getUrl() != null && webView.getUrl().startsWith("http")) prefs.edit().putString(KEY_LAST_URL, webView.getUrl()).apply();
            CookieManager.getInstance().flush();
            webView.stopLoading();
            webView.destroy();
        }
        persistTabs();
        activeCall = null;
        activeWebView = null;
        activeDialog = null;
        addressField = null;
        backButton = null;
        forwardButton = null;
        favoriteButton = null;
        tabsButton = null;
        if (call != null) call.resolve(result);
    }

    private static final class Record {
        final String url;
        final String title;
        final long time;
        Record(String url, String title, long time) { this.url = url; this.title = title == null || title.isBlank() ? url : title; this.time = time; }
    }
}
