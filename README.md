# Fast Mode – Free Internet Speed Test, DNS Benchmark & Network Diagnostics Tool

Fast Mode is a free, modern, and lightweight **Internet Speed Test** and **DNS Benchmark** web application that helps users analyze their network performance directly from their browser. Built with **HTML5**, **CSS3**, and **Vanilla JavaScript**, it accurately measures **download speed**, **upload speed**, **ping (latency)**, **jitter**, and compares the performance of popular **DNS servers** using secure **DNS-over-HTTPS (DoH)** technology.

Unlike traditional speed test websites, Fast Mode runs entirely in the browser with a clean, responsive interface and requires no extensions or software installation.

🌐 **Live Website:** https://www.fastmode.top

---

## 🚀 Features

### ⚡ Internet Speed Test

Measure your internet connection in real time with accurate performance metrics.

* Download test: parallel streams, time-boxed, warm-up discarded
* Upload test: parallel streams with real upload progress
* Ping: median of repeated requests on a warm connection
* Jitter: mean change between consecutive ping samples
* Light mode for metered connections; data used is shown after each test
* Real-time Progress Indicators
* Mobile & Desktop Compatible

---

### 🌍 DNS Benchmark Tool

Compare the response times of leading public DNS providers to find the fastest DNS server for your internet connection.

Supported DNS providers include:

* Cloudflare DNS (1.1.1.1)
* Google Public DNS (8.8.8.8)
* Quad9 DNS
* OpenDNS
* AdGuard DNS
* CleanBrowsing DNS
* AliDNS

Measurements use real **DNS-over-HTTPS (DoH, RFC 8484)** queries: one warm-up query, then several timed queries on the warm connection, reported as the median for both a cached and an uncached name. Providers that block cross-origin answers are shown as approximate and are not ranked.

---

### 🌐 Network Information

Automatically detect your current network information, including:

* Public IP Address
* Internet Service Provider (ISP)
* Approximate Location
* Connection Details

---

### 📚 Internet Learning Center

Fast Mode also includes educational resources covering:

* What is Internet Speed?
* What is Ping?
* What is Jitter?
* DNS Explained
* Mbps vs MB/s
* How to Improve Wi-Fi Speed
* Best DNS Servers for Gaming
* Network Troubleshooting Tips

---

## ⚙️ Configuration

Test endpoints (Cloudflare speed-test servers by default) can be overridden, for example to use your own servers, by defining `window.FASTMODE_CONFIG` before `app.js` loads:

```html
<script>
  window.FASTMODE_CONFIG = {
    latencyUrl: 'https://your-server/__down?bytes=0',
    downloadUrls: ['https://your-server/__down?bytes=25000000'],
    uploadUrl: 'https://your-server/__up'
  };
</script>
<script src="app.js" defer></script>
```

Your server needs CORS enabled (`Access-Control-Allow-Origin`, and `Timing-Allow-Origin` for the most precise ping).

---

## ✨ Why Fast Mode?

* Completely Free
* No Registration Required
* No Software Installation
* Lightweight & Fast
* Modern Responsive UI
* Privacy Friendly
* Cross-Platform
* SEO Optimized
* Mobile Friendly

---

## 🛠 Technology Stack

* HTML5
* CSS3
* Vanilla JavaScript (ES6+)
* Fetch API
* DNS-over-HTTPS (DoH)
* REST APIs

---

## 🔍 Keywords

Internet Speed Test, Speed Test, Online Speed Test, WiFi Speed Test, Broadband Speed Test, Upload Speed Test, Download Speed Test, Ping Test, Latency Test, Jitter Test, DNS Benchmark, DNS Speed Test, DNS Checker, Public DNS, Cloudflare DNS, Google DNS, Network Diagnostics, Network Analyzer, Internet Performance Test, Network Speed Monitor, DNS-over-HTTPS, DoH, ISP Checker, IP Address Lookup, JavaScript Speed Test, HTML5 Speed Test, Web Speed Test, Fast Internet Test.

---

## 🌟 Live Demo

Visit the live application:

**https://www.fastmode.top**

---

## ⭐ Contributing

Contributions, feature requests, and bug reports are welcome. Feel free to fork the project, open an issue, or submit a pull request.

---

## 📄 License

This project is licensed under the MIT License.

---

If you find Fast Mode useful, please consider giving this repository a ⭐ on GitHub. Your support helps improve the project and makes it easier for others to discover.
