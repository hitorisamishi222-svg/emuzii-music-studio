package com.asahi.vocal;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Arrays;

public final class MainActivity extends Activity {
    private static final String ROOT_URL = "https://appassets.androidplatform.net/assets/index.html";
    private static final int REQUEST_AUDIO = 2101;
    private static final int REQUEST_INPUT = 2102;
    private static final int REQUEST_EXPORT = 2103;
    private static final long MAX_EXPORT_SIZE = 250L * 1024 * 1024;

    private WebView webView;
    private PermissionRequest pendingAudio;
    private ValueCallback<Uri[]> pendingInput;
    private final Object exportLock = new Object();
    private String exportSession;
    private String exportFilename;
    private String exportMime;
    private File exportWritingFile;
    private FileOutputStream exportStream;
    private long exportBytes;
    private File exportPendingFile;
    private String exportPendingFilename;
    private String exportPendingMime;
    private boolean exportCopyInProgress;

    private static boolean trusted(Uri uri) {
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost());
    }

    private void notifyUser(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // All application pages are packaged assets. Never load user-supplied URLs in this WebView.
                return !ROOT_URL.equals(request.getUrl().toString());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (!trusted(request.getOrigin())
                            || !Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                            || request.getResources().length != 1) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                    } else {
                        if (pendingAudio != null) {
                            request.deny();
                            return;
                        }
                        pendingAudio = request;
                        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_AUDIO);
                    }
                });
            }
            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingAudio == request) pendingAudio = null;
            }
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             WebChromeClient.FileChooserParams params) {
                if (pendingInput != null) {
                    pendingInput.onReceiveValue(null);
                }
                pendingInput = callback;
                try {
                    startActivityForResult(params.createIntent(), REQUEST_INPUT);
                    return true;
                } catch (Exception error) {
                    pendingInput = null;
                    callback.onReceiveValue(null);
                    notifyUser("ファイル選択を開けませんでした");
                    return true;
                }
            }
        });
        webView.addJavascriptInterface(new ExportBridge(), "ASAHIAndroid");
        setContentView(webView);
        webView.loadUrl(ROOT_URL);
    }

    @Override
    public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request != REQUEST_AUDIO || pendingAudio == null) return;
        PermissionRequest webRequest = pendingAudio;
        pendingAudio = null;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            webRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            webRequest.deny();
            notifyUser("マイク録音には音声の権限が必要です");
        }
    }

    private void discardPendingExport() {
        synchronized (exportLock) {
            if (exportCopyInProgress) return;
            if (exportPendingFile != null) exportPendingFile.delete();
            exportPendingFile = null;
            exportPendingFilename = null;
            exportPendingMime = null;
        }
    }

    private void launchExportPicker() {
        final String mime;
        final String filename;
        synchronized (exportLock) {
            if (exportPendingFile == null || exportCopyInProgress) return;
            mime = exportPendingMime;
            filename = exportPendingFilename;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.setType(mime == null ? "application/octet-stream" : mime);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        try {
            startActivityForResult(intent, REQUEST_EXPORT);
        } catch (Exception error) {
            offerExportRetry("保存先の選択を開けませんでした。");
        }
    }

    private void offerExportRetry(String reason) {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) return;
            new AlertDialog.Builder(MainActivity.this)
                    .setTitle("ファイル保存が未完了です")
                    .setMessage(reason + " 一時ファイルを保持しています。保存先を選び直すか、今回の書き出しを中止してください。")
                    .setPositiveButton("保存先を選び直す", (dialog, which) -> launchExportPicker())
                    .setNegativeButton("書き出しを中止", (dialog, which) -> discardPendingExport())
                    .setCancelable(false)
                    .show();
        });
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == REQUEST_INPUT) {
            if (pendingInput != null) {
                pendingInput.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
                pendingInput = null;
            }
            return;
        }
        if (request != REQUEST_EXPORT) return;
        final Uri destination = result == RESULT_OK && data != null ? data.getData() : null;
        final File file;
        synchronized (exportLock) {
            if (exportCopyInProgress) return;
            file = exportPendingFile;
            if (file == null) return;
            if (destination == null) {
                discardPendingExport();
                notifyUser("ファイル書き出しを中止しました");
                return;
            }
            exportCopyInProgress = true;
        }
        new Thread(() -> {
            boolean copiedSuccessfully = false;
            try {
                long written = 0;
                final long expectedBytes = file.length();
                try (InputStream input = new FileInputStream(file);
                     OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
                    if (output == null) throw new IOException("保存先が開けません");
                    byte[] buffer = new byte[32768];
                    int length;
                    while ((length = input.read(buffer)) != -1) {
                        output.write(buffer, 0, length);
                        written += length;
                    }
                    output.flush();
                }
                if (written != expectedBytes) throw new IOException("保存データのサイズが一致しません");
                copiedSuccessfully = true;
            } catch (Exception error) {
                offerExportRetry("保存先へのコピーに失敗しました: " + error.getMessage());
            } finally {
                synchronized (exportLock) {
                    exportCopyInProgress = false;
                    if (copiedSuccessfully) {
                        exportPendingFile = null;
                        exportPendingFilename = null;
                        exportPendingMime = null;
                    }
                }
                if (copiedSuccessfully) {
                    file.delete();
                    notifyUser("録音ファイルを保存しました");
                }
            }
        }, "asahi-export-copy").start();
    }

    private static String safeFileName(String raw) {
        if (raw == null || raw.trim().isEmpty()) return "ASAHI-recording.bin";
        String s = raw.replaceAll("[\\\\/\\r\\n\\t:*?\"<>|]", "_");
        return s.length() > 110 ? s.substring(s.length() - 110) : s;
    }

    private void cleanupWriting() {
        try {
            if (exportStream != null) exportStream.close();
        } catch (Exception ignored) {}
        exportStream = null;
        if (exportWritingFile != null) exportWritingFile.delete();
        exportWritingFile = null;
        exportSession = null;
        exportBytes = 0;
    }

    private final class ExportBridge {
        @JavascriptInterface
        public boolean startDownload(String session, String filename, String mime) {
            synchronized (exportLock) {
                if (session == null || session.isEmpty() || exportStream != null
                        || exportPendingFile != null || exportCopyInProgress) return false;
                try {
                    exportWritingFile = File.createTempFile("asahi-vocal-", ".part", getCacheDir());
                    exportStream = new FileOutputStream(exportWritingFile);
                    exportSession = session;
                    exportFilename = safeFileName(filename);
                    exportMime = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
                    exportBytes = 0;
                    return true;
                } catch (Exception error) {
                    cleanupWriting();
                    return false;
                }
            }
        }

        @JavascriptInterface
        public boolean appendChunk(String session, String encodedChunk) {
            synchronized (exportLock) {
                if (!session.equals(exportSession) || exportStream == null) return false;
                try {
                    byte[] bytes = Base64.decode(encodedChunk, Base64.DEFAULT);
                    if (bytes.length > 32768 || exportBytes + bytes.length > MAX_EXPORT_SIZE) {
                        cleanupWriting();
                        return false;
                    }
                    exportStream.write(bytes);
                    exportBytes += bytes.length;
                    return true;
                } catch (Exception error) {
                    cleanupWriting();
                    return false;
                }
            }
        }

        @JavascriptInterface
        public boolean finishDownload(String session) {
            synchronized (exportLock) {
                if (!session.equals(exportSession) || exportStream == null) return false;
                try {
                    exportStream.flush();
                    exportStream.close();
                    exportStream = null;
                    exportPendingFile = exportWritingFile;
                    exportPendingFilename = exportFilename;
                    exportPendingMime = exportMime;
                    exportWritingFile = null;
                    exportSession = null;
                    exportBytes = 0;
                } catch (Exception error) {
                    cleanupWriting();
                    return false;
                }
            }
            runOnUiThread(MainActivity.this::launchExportPicker);
            return true;
        }

        @JavascriptInterface
        public void cancelDownload(String session) {
            synchronized (exportLock) {
                if (session != null && session.equals(exportSession)) cleanupWriting();
            }
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.evaluateJavascript("window.dispatchEvent(new Event('pagehide'))", null);
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (pendingInput != null) {
            pendingInput.onReceiveValue(null);
            pendingInput = null;
        }
        if (pendingAudio != null) {
            pendingAudio.deny();
            pendingAudio = null;
        }
        synchronized (exportLock) {
            cleanupWriting();
            if (!exportCopyInProgress && exportPendingFile != null) exportPendingFile.delete();
            if (!exportCopyInProgress) exportPendingFile = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("ASAHIAndroid");
            webView.destroy();
        }
        super.onDestroy();
    }
}
