package com.criblo.nativebrowser;

import android.app.Dialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Message;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CRIBrowser")
public class CRIBrowserPlugin extends Plugin {
    private Dialog activeDialog;
    private WebView activeWebView;
    private PluginCall activeCall;
    private TextView addressLabel;

    @PluginMethod
    public void open(PluginCall call) {
        String rawUrl = call.getString("url");
        if (rawUrl == null || !(rawUrl.startsWith("https://") || rawUrl.startsWith("http://"))) {
            call.reject("Adresse web invalide.");
            return;
        }
        if (activeDialog != null) {
            call.reject("Un navigateur CRI-BLO est déjà ouvert.");
            return;
        }

        getActivity().runOnUiThread(() -> openBrowser(call, rawUrl));
    }

    private void openBrowser(PluginCall call, String rawUrl) {
        activeCall = call;
        Dialog dialog = new Dialog(getActivity(), android.R.style.Theme_Material_Light_NoActionBar);
        activeDialog = dialog;

        LinearLayout root = new LinearLayout(getActivity());
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);

        LinearLayout toolbar = new LinearLayout(getActivity());
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(8, 6, 8, 6);

        Button back = makeButton("‹");
        Button forward = makeButton("›");
        Button refresh = makeButton("↻");
        Button close = makeButton("×");

        addressLabel = new TextView(getActivity());
        addressLabel.setSingleLine(true);
        addressLabel.setTextSize(12f);
        addressLabel.setGravity(Gravity.CENTER);
        addressLabel.setTextColor(Color.DKGRAY);

        toolbar.addView(back, fixedToolbarLayout());
        toolbar.addView(forward, fixedToolbarLayout());
        toolbar.addView(refresh, fixedToolbarLayout());
        toolbar.addView(addressLabel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        toolbar.addView(close, fixedToolbarLayout());

        WebView webView = new WebView(getActivity());
        activeWebView = webView;
        configureWebView(webView);

        root.addView(toolbar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(webView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        back.setOnClickListener(v -> {
            if (webView.canGoBack()) webView.goBack();
        });
        forward.setOnClickListener(v -> {
            if (webView.canGoForward()) webView.goForward();
        });
        refresh.setOnClickListener(v -> webView.reload());
        close.setOnClickListener(v -> dialog.dismiss());

        dialog.setOnKeyListener((d, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_UP) {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    dialog.dismiss();
                }
                return true;
            }
            return false;
        });

        dialog.setOnDismissListener(d -> finishBrowser());
        dialog.setContentView(root);
        dialog.show();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        }

        webView.loadUrl(rawUrl);
    }

    private Button makeButton(String text) {
        Button button = new Button(getActivity());
        button.setText(text);
        button.setTextSize(22f);
        button.setAllCaps(false);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(8, 0, 8, 0);
        return button;
    }

    private LinearLayout.LayoutParams fixedToolbarLayout() {
        return new LinearLayout.LayoutParams(56, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private void configureWebView(WebView webView) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

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
                if (scheme == null || scheme.equals("http") || scheme.equals("https") || scheme.equals("about") || scheme.equals("data") || scheme.equals("blob")) {
                    return false;
                }
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    getActivity().startActivity(intent);
                } catch (Exception ignored) {
                    // Unsupported external protocol: keep CRI-BLO running.
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                updateAddress(url);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onReceivedTitle(WebView view, String title) {
                updateAddress(view.getUrl());
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

    private void updateAddress(String rawUrl) {
        if (addressLabel == null || rawUrl == null) return;
        try {
            String host = Uri.parse(rawUrl).getHost();
            addressLabel.setText(host == null || host.isEmpty() ? "CRI-BLO" : host.replaceFirst("^www\\.", ""));
        } catch (Exception ignored) {
            addressLabel.setText("CRI-BLO");
        }
    }

    private void finishBrowser() {
        PluginCall call = activeCall;
        WebView webView = activeWebView;

        JSObject result = new JSObject();
        if (webView != null) {
            result.put("url", webView.getUrl());
            result.put("title", webView.getTitle());
            webView.stopLoading();
            webView.destroy();
        }

        activeCall = null;
        activeWebView = null;
        activeDialog = null;
        addressLabel = null;

        if (call != null) call.resolve(result);
    }
}
