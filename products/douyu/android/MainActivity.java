package studio.douyu.beads;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/index.html";
    private static final int OPEN_FILE = 1;
    private static final int SAVE_FILE = 2;
    private static final int MAX_EXPORT_BYTES = 32 * 1024 * 1024;
    private static final Map<String, String> ASSETS = new java.util.HashMap<>();
    static {
        ASSETS.put("/index.html", "text/html");
        ASSETS.put("/style.css", "text/css");
        for (String script : new String[]{"core", "app", "mobile", "palettes", "touch"}) {
            ASSETS.put("/" + script + ".js", "application/javascript");
        }
    }

    private final ExecutorService writer = Executors.newSingleThreadExecutor();
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingExport;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.addJavascriptInterface(new LocalTools(), "DouyuAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !START.equals(request.getUrl().toString());
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String path = url.getPath();
                if ("https".equals(url.getScheme()) && HOST.equals(url.getAuthority())
                    && "GET".equals(request.getMethod()) && ASSETS.containsKey(path)) {
                    try {
                        return new WebResourceResponse(ASSETS.get(path), "UTF-8", 200, "OK",
                                java.util.Collections.singletonMap("Content-Security-Policy",
                                        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'"),
                                getAssets().open("web" + path));
                    } catch (IOException ignored) {
                        // Return a local 404 below.
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                        java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                boolean image = false;
                for (String type : params.getAcceptTypes()) {
                    if (type.startsWith("image/")) image = true;
                }
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType(image ? "image/*" : "*/*");
                try {
                    startActivityForResult(intent, OPEN_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback.onReceiveValue(null);
                    fileCallback = null;
                    notifyUser("系统文件选择器不可用");
                }
                return true;
            }
        });
        setContentView(web);
        web.loadUrl(START);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
        if (request == OPEN_FILE && fileCallback != null) {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            callback.onReceiveValue(uri == null ? null : new Uri[]{uri});
        } else if (request == SAVE_FILE) {
            byte[] bytes = pendingExport;
            pendingExport = null;
            if (uri == null) return;
            if (bytes == null) {
                notifyUser("导出已中断，请重新保存");
                return;
            }
            writer.execute(() -> {
                try (OutputStream stream = getContentResolver().openOutputStream(uri, "wt")) {
                    if (stream == null) throw new IOException("No output stream");
                    stream.write(bytes);
                    stream.flush();
                } catch (IOException | SecurityException e) {
                    runOnUiThread(() -> notifyUser("保存失败，请换一个位置重试"));
                    return;
                }
                runOnUiThread(() -> notifyUser("已保存到所选位置"));
            });
        }
    }

    private void notifyUser(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private final class LocalTools {
        @JavascriptInterface
        public void save(String name, String encoded) {
            String type;
            if (name.endsWith(".png")) type = "image/png";
            else if (name.endsWith(".csv")) type = "text/csv";
            else if (name.endsWith(".json")) type = "application/json";
            else return;
            if (encoded.length() > ((MAX_EXPORT_BYTES + 2) / 3) * 4) {
                runOnUiThread(() -> notifyUser("文件太大，无法导出"));
                return;
            }
            byte[] bytes;
            try {
                bytes = Base64.decode(encoded, Base64.NO_WRAP);
            } catch (IllegalArgumentException e) {
                runOnUiThread(() -> notifyUser("无法读取导出内容"));
                return;
            }
            runOnUiThread(() -> {
                if (pendingExport != null) {
                    notifyUser("请先完成当前保存操作");
                    return;
                }
                pendingExport = bytes;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType(type)
                        .putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(intent, SAVE_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingExport = null;
                    notifyUser("系统文件保存界面不可用");
                }
            });
        }

        @JavascriptInterface
        public void print() {
            runOnUiThread(() -> {
                PrintManager manager = (PrintManager) getSystemService(PRINT_SERVICE);
                if (manager != null) {
                    manager.print("豆屿拼豆图纸", web.createPrintDocumentAdapter("豆屿拼豆图纸"), null);
                }
            });
        }
    }

    @Override
    protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        writer.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
