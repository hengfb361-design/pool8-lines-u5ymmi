package com.example.eightball

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private val assets: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }


    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        web.setBackgroundColor(Color.parseColor("#0B0F14"))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.loadWithOverviewMode = true
        web.settings.useWideViewPort = true
        web.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                Log.d("AppForgeWeb", msg.message() + " (" + msg.sourceId() + ":" + msg.lineNumber() + ")")
                return true
            }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assets.shouldInterceptRequest(request.url)
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showLoadError(error.errorCode.toString() + " " + error.description, request.url.toString())
            }

            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                if (request.isForMainFrame) showLoadError("HTTP " + response.statusCode, request.url.toString())
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return false
            }
        }
        web.loadUrl(START_URL)
    }

    /* A failed load used to leave the page on its own loading screen forever.
       Show what went wrong instead of a blank WebView. */
    private fun showLoadError(detail: String, url: String) {
        Log.e("AppForge", "load failed: " + detail + " " + url)
        val page = "<!doctype html><meta name=viewport content=\"width=device-width,initial-scale=1\">" +
            "<body style=\"background:#0B0F14;color:#E6EDF3;font-family:sans-serif;padding:24px;line-height:1.5\">" +
            "<h3 style=\"margin:0 0 12px\">ផ្ទុកមិនបាន</h3>" +
            "<p style=\"color:#FF7B72;margin:0 0 8px\">" + detail.replace("<", "&lt;") + "</p>" +
            "<p style=\"color:#8B949E;font-size:13px;word-break:break-all\">" + url + "</p>" +
            "<p style=\"color:#8B949E;font-size:13px\">ពិនិត្យអ៊ីនធឺណិត ឬឯកសារ index.html ក្នុង assets/www</p></body>"
        web.loadDataWithBaseURL(null, page, "text/html", "utf-8", null)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else finish()
    }

    companion object {
        const val START_URL = "https://appassets.androidplatform.net/assets/www/index.html"
        const val APP_HOST = "appassets.androidplatform.net"
    }
}
