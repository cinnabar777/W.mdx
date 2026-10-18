package com.wmdx.markdownapp

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.wmdx.markdownapp.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupWebView()
    }

    private fun setupWebView() {
        binding.webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
        }

        binding.webView.addJavascriptInterface(WebAppInterface(), "AndroidHost")

        binding.webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Page loaded successfully
            }
        }

        binding.webView.loadUrl("file:///android_asset/www/index.html")
    }

    inner class WebAppInterface {
        @JavascriptInterface
        fun onDocumentChanged(content: String) {
            // Handle content change in native code
        }

        @JavascriptInterface
        fun openExternalUrl(url: String) {
            runOnUiThread {
                Toast.makeText(this@MainActivity, "Opening: $url", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
