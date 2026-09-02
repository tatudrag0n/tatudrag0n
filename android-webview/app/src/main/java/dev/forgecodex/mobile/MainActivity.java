package dev.forgecodex.mobile;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String HOME = "https://forgecodex.mct-official.com/";
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(Color.rgb(11, 12, 15));
        w.setNavigationBarColor(Color.rgb(11, 12, 15));

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(11, 12, 15));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " ForgeCodexAndroid/1.1");

        web.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void openExternal(String url) {
                runOnUiThread(() -> {
                    try {
                        Uri uri = Uri.parse(url);
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {}
                });
            }
        }, "ForgeCodexAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            private boolean handleUrl(Uri u) {
                String host = u.getHost();
                if (host != null && host.equals("forgecodex.mct-official.com")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                    return true;
                } catch (Exception ignored) {
                    return false;
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient());

        if (savedInstanceState == null) web.loadUrl(HOME);
        else web.restoreState(savedInstanceState);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (web != null) web.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
