/*!
 * Fast Mode - speed test, DNS benchmark and network info
 * Vanilla JS, no dependencies.
 *
 * Endpoints can be overridden (e.g. to self-host) by defining
 * window.FASTMODE_CONFIG = { ... } before this script loads.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Configuration
   * ------------------------------------------------------------------ */
  var DEFAULTS = {
    // Cloudflare's public speed-test endpoints (CORS enabled, global anycast).
    latencyUrl: 'https://speed.cloudflare.com/__down?bytes=0',
    traceUrl: 'https://speed.cloudflare.com/cdn-cgi/trace',
    downloadUrls: [
      'https://speed.cloudflare.com/__down?bytes=25000000',
      'https://cachefly.cachefly.net/10mb.test' // fallback
    ],
    uploadUrl: 'https://speed.cloudflare.com/__up',
    uploadChunkBytes: 2000000,
    gaugeMaxMbps: 1000,
    profiles: {
      standard: { latencySamples: 12, dlMs: 8000, ulMs: 8000, warmupMs: 1500, dlMaxBytes: 300e6, ulMaxBytes: 100e6, dlStreams: 6, ulStreams: 4 },
      light:    { latencySamples: 8,  dlMs: 5000, ulMs: 5000, warmupMs: 1000, dlMaxBytes: 40e6,  ulMaxBytes: 20e6,  dlStreams: 4, ulStreams: 3 }
    },
    ipApis: [
      { url: 'https://ipapi.co/json/', parse: function (d) {
          if (!d || d.error || !d.ip) return null;
          return { ip: d.ip, isp: d.org, loc: place(d.city, d.country_code) };
      } },
      { url: 'https://ipwho.is/', parse: function (d) {
          if (!d || d.success === false || !d.ip) return null;
          return { ip: d.ip, isp: d.connection && (d.connection.isp || d.connection.org), loc: place(d.city, d.country_code) };
      } },
      { url: 'https://api.db-ip.com/v2/free/self', parse: function (d) {
          if (!d || d.errorCode || !d.ipAddress) return null;
          return { ip: d.ipAddress, isp: null, loc: place(d.city, d.countryCode) };
      } },
      { url: 'https://api.ipify.org?format=json', parse: function (d) {
          if (!d || !d.ip) return null;
          return { ip: d.ip, isp: null, loc: null };
      } }
    ],
    // DNS-over-HTTPS (RFC 8484) endpoints. 'ip' values are the providers' public resolver IPs.
    dnsProviders: [
      { name: 'Cloudflare',    url: 'https://cloudflare-dns.com/dns-query',               ip: '1.1.1.1',         ip_alt: '1.0.0.1',         color: '#10b981' },
      { name: 'Google',        url: 'https://dns.google/dns-query',                       ip: '8.8.8.8',         ip_alt: '8.8.4.4',         color: '#3b82f6' },
      { name: 'Quad9',         url: 'https://dns.quad9.net/dns-query',                    ip: '9.9.9.9',         ip_alt: '149.112.112.112', color: '#a855f7' },
      { name: 'OpenDNS',       url: 'https://doh.opendns.com/dns-query',                  ip: '208.67.222.222',  ip_alt: '208.67.220.220',  color: '#f59e0b' },
      { name: 'AdGuard',       url: 'https://dns.adguard-dns.com/dns-query',              ip: '94.140.14.14',    ip_alt: '94.140.15.15',    color: '#06b6d4' },
      { name: 'CleanBrowsing', url: 'https://doh.cleanbrowsing.org/doh/family-filter/',   ip: '185.228.168.168', ip_alt: '185.228.169.168', color: '#6366f1' },
      { name: 'AliDNS',        url: 'https://dns.alidns.com/dns-query',                   ip: '223.5.5.5',       ip_alt: '223.6.6.6',       color: '#f43f5e' }
    ],
    dnsCachedQueries: 5,
    dnsUncachedQueries: 2,
    dnsTimeoutMs: 4000
  };

  var CFG = Object.assign({}, DEFAULTS, window.FASTMODE_CONFIG || {});

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rand() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function withParam(url, k, v) { return url + (url.indexOf('?') === -1 ? '?' : '&') + k + '=' + v; }
  function place(city, cc) {
    var parts = [city, cc].filter(function (x) { return x && x !== 'undefined' && x !== 'null'; });
    return parts.length ? parts.join(', ') : null;
  }

  function median(arr) {
    if (!arr.length) return NaN;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // Jitter = mean absolute difference between consecutive latency samples (RFC 3550 style).
  function jitter(arr) {
    if (arr.length < 2) return 0;
    var sum = 0;
    for (var i = 1; i < arr.length; i++) sum += Math.abs(arr[i] - arr[i - 1]);
    return sum / (arr.length - 1);
  }

  function formatSpeed(mbps) {
    if (!isFinite(mbps) || mbps < 0) mbps = 0;
    if (mbps >= 1000) return { value: (mbps / 1000).toFixed(2), unit: 'Gbps' };
    if (mbps >= 100) return { value: mbps.toFixed(0), unit: 'Mbps' };
    if (mbps >= 1) return { value: mbps.toFixed(1), unit: 'Mbps' };
    return { value: mbps.toFixed(2), unit: 'Mbps' };
  }
  function speedLabel(mbps) { var f = formatSpeed(mbps); return f.value + ' ' + f.unit; }

  function formatBytes(b) {
    if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
    if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB';
    return Math.round(b / 1e3) + ' KB';
  }

  function showToast(msg) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('opacity-0');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { t.classList.add('opacity-0'); }, 2200);
  }

  async function handleCopy(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------------ *
   * Throughput meter
   *
   * Records cumulative bytes over time. The final speed ignores the
   * warm-up period (TCP/TLS handshakes and slow start) so it reflects
   * sustained throughput rather than the ramp-up.
   * ------------------------------------------------------------------ */
  function Meter() {
    this.t0 = performance.now();
    this.bytes = 0;
    this.t = [0];
    this.b = [0];
  }
  Meter.prototype.now = function () { return performance.now() - this.t0; };
  Meter.prototype.add = function (n) {
    if (!n) return;
    var t = this.now();
    this.bytes += n;
    var last = this.t.length - 1;
    if (last > 0 && t - this.t[last] < 25) { // coalesce bursts to keep the arrays small
      this.t[last] = t;
      this.b[last] = this.bytes;
    } else {
      this.t.push(t);
      this.b.push(this.bytes);
    }
  };
  Meter.prototype.bytesAt = function (t) {
    var T = this.t, B = this.b, n = T.length;
    if (t <= T[0]) return B[0];
    if (t >= T[n - 1]) return B[n - 1];
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (T[mid] <= t) lo = mid; else hi = mid;
    }
    var f = (t - T[lo]) / (T[hi] - T[lo]);
    return B[lo] + f * (B[hi] - B[lo]);
  };
  Meter.prototype.rate = function (fromMs, toMs) { // Mbps
    var dt = (toMs - fromMs) / 1000;
    if (dt <= 0) return 0;
    return (this.bytesAt(toMs) - this.bytesAt(fromMs)) * 8 / dt / 1e6;
  };
  Meter.prototype.live = function (windowMs) {
    var now = this.now();
    return this.rate(Math.max(0, now - windowMs), now);
  };
  Meter.prototype.final = function (warmupMs) {
    var end = this.t[this.t.length - 1];
    var from = warmupMs;
    if (end - from < 1000) from = 0; // too little data to trim the warm-up
    return this.rate(from, end);
  };

  /* ------------------------------------------------------------------ *
   * UI state
   * ------------------------------------------------------------------ */
  var currentRun = null;

  function setStatus(text, kind) {
    var s = $('test-status');
    if (!s) return;
    s.textContent = text;
    s.className = 'mb-4 text-sm font-mono h-6 ' +
      (kind === 'ok' ? 'text-emerald-400' : kind === 'error' ? 'text-red-400' : 'text-blue-400');
  }

  function updateGauge(mbps) {
    var g = $('gauge-progress');
    if (!g) return;
    // Log scale so both 5 Mbps and 900 Mbps connections move the needle visibly.
    var pct = Math.min(1, Math.log10(1 + Math.max(0, mbps)) / Math.log10(1 + CFG.gaugeMaxMbps));
    g.style.strokeDashoffset = String(283 - 283 * pct);
  }

  function showLive(mbps) {
    var f = formatSpeed(mbps);
    $('current-speed').textContent = f.value;
    $('speed-unit').textContent = f.unit;
    updateGauge(mbps);
  }

  function resetUI() {
    $('current-speed').textContent = '0.0';
    $('speed-unit').textContent = 'Mbps';
    $('ping-val').textContent = '- ms';
    $('jitter-val').textContent = '- ms';
    $('down-val').textContent = '-';
    $('up-val').textContent = '-';
    $('data-used').textContent = '';
    updateGauge(0);
    setStatus('Ready to test', 'info');
  }

  /* ------------------------------------------------------------------ *
   * Latency
   * ------------------------------------------------------------------ */
  // Returns { wall, rt }: wall-clock time, and the browser's request->first-byte
  // time (rt is null when the server does not expose Resource Timing).
  async function timedFetch(url, signal) {
    var u = withParam(url, 'r', rand());
    var t0 = performance.now();
    var res = await fetch(u, { cache: 'no-store', signal: signal });
    await res.arrayBuffer();
    var wall = performance.now() - t0;
    var rt = null;
    for (var attempt = 0; attempt < 2 && rt === null; attempt++) {
      try {
        var e = performance.getEntriesByName(u).pop();
        if (e && e.requestStart > 0 && e.responseStart >= e.requestStart) rt = Math.max(0.1, e.responseStart - e.requestStart);
      } catch (_) { /* ignore */ }
      if (rt === null && attempt === 0) await sleep(0); // entry can land a tick late
    }
    return { wall: wall, rt: rt };
  }

  async function measureLatency(profile, run) {
    var ac = new AbortController();
    run.aborters.push(ac);
    await timedFetch(CFG.latencyUrl, ac.signal); // warm-up: opens the connection, result discarded
    var raw = [];
    function pick() { // use one timing source for ALL samples so they stay comparable
      var useRt = raw.length && raw.every(function (x) { return x.rt !== null; });
      return raw.map(function (x) { return useRt ? x.rt : x.wall; });
    }
    for (var i = 0; i < profile.latencySamples; i++) {
      if (run.aborted) break;
      raw.push(await timedFetch(CFG.latencyUrl, ac.signal));
      $('ping-val').textContent = Math.round(median(pick())) + ' ms';
      await sleep(60);
    }
    var samples = pick();
    return { ping: median(samples), jitter: jitter(samples), samples: samples };
  }

  /* ------------------------------------------------------------------ *
   * Download (parallel streams, time-boxed, warm-up discarded)
   * ------------------------------------------------------------------ */
  async function downloadWorker(url, signal, meter, state) {
    try {
      while (!state.stop) {
        var res = await fetch(withParam(url, 'r', rand()), { cache: 'no-store', signal: signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        if (!res.body) { meter.add((await res.arrayBuffer()).byteLength); continue; }
        var reader = res.body.getReader();
        for (;;) {
          var chunk = await reader.read();
          if (chunk.done) break;
          meter.add(chunk.value.byteLength);
          if (state.stop) { reader.cancel().catch(function () {}); return; }
        }
      }
    } catch (e) {
      if (!state.stop) state.error = e;
    }
  }

  async function timeBox(meter, durationMs, maxBytes, run, workersDone, onTick) {
    var finished = false;
    workersDone.then(function () { finished = true; });
    for (;;) {
      await sleep(100);
      var el = meter.now();
      onTick(meter.live(1000));
      if (run.aborted || finished || el >= durationMs || meter.bytes >= maxBytes) break;
    }
  }

  async function runDownload(profile, run) {
    var lastError = null;
    for (var u = 0; u < CFG.downloadUrls.length; u++) {
      var url = CFG.downloadUrls[u];
      var meter = new Meter();
      var ac = new AbortController();
      run.aborters.push(ac);
      var state = { stop: false, error: null };
      var workers = [];
      for (var i = 0; i < profile.dlStreams; i++) workers.push(downloadWorker(url, ac.signal, meter, state));
      var done = Promise.all(workers);
      await timeBox(meter, profile.dlMs, profile.dlMaxBytes, run, done, showLive);
      state.stop = true;
      ac.abort();
      await done;
      if (run.aborted) return { aborted: true, bytes: meter.bytes };
      if (meter.bytes > 0) return { mbps: meter.final(profile.warmupMs), bytes: meter.bytes, url: url };
      lastError = state.error;
    }
    throw lastError || new Error('Download endpoints unreachable');
  }

  /* ------------------------------------------------------------------ *
   * Upload
   * Primary: XMLHttpRequest with upload progress events (real byte counts).
   * Fallback: fetch() POSTs counted per completed chunk (works even when the
   * server blocks CORS preflight, at coarser granularity).
   * ------------------------------------------------------------------ */
  function makePayload(bytes) {
    var buf = new Uint8Array(bytes);
    for (var o = 0; o < bytes; o += 65536) crypto.getRandomValues(buf.subarray(o, Math.min(o + 65536, bytes)));
    return new Blob([buf]);
  }

  function uploadWorkerXhr(url, blob, meter, state) {
    return new Promise(function (resolve) {
      function next() {
        if (state.stop) return resolve();
        var xhr = new XMLHttpRequest();
        var last = 0;
        state.xhrs.push(xhr);
        xhr.upload.onprogress = function (e) { meter.add(e.loaded - last); last = e.loaded; };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) { meter.add(blob.size - last); next(); }
          else { state.error = new Error('HTTP ' + xhr.status); resolve(); }
        };
        xhr.onerror = function () { if (!state.stop) state.error = new Error('Network error'); resolve(); };
        xhr.onabort = function () { resolve(); };
        xhr.open('POST', withParam(url, 'r', rand()));
        xhr.send(blob);
      }
      next();
    });
  }

  async function uploadWorkerFetch(url, blob, signal, meter, state) {
    try {
      while (!state.stop) {
        await fetch(withParam(url, 'r', rand()), { method: 'POST', body: blob, mode: 'no-cors', cache: 'no-store', signal: signal });
        meter.add(blob.size);
      }
    } catch (e) {
      if (!state.stop) state.error = e;
    }
  }

  async function runUpload(profile, run) {
    var blob = makePayload(CFG.uploadChunkBytes);
    var modes = ['xhr', 'fetch'];
    var lastError = null;
    for (var m = 0; m < modes.length; m++) {
      var meter = new Meter();
      var ac = new AbortController();
      run.aborters.push(ac);
      var state = { stop: false, error: null, xhrs: [] };
      var workers = [];
      var n = profile.ulStreams;
      for (var i = 0; i < n; i++) {
        workers.push(modes[m] === 'xhr'
          ? uploadWorkerXhr(CFG.uploadUrl, blob, meter, state)
          : uploadWorkerFetch(CFG.uploadUrl, blob, ac.signal, meter, state));
      }
      var done = Promise.all(workers);
      await timeBox(meter, profile.ulMs, profile.ulMaxBytes, run, done, showLive);
      state.stop = true;
      state.xhrs.forEach(function (x) { try { x.abort(); } catch (_) {} });
      ac.abort();
      await done;
      if (run.aborted) return { aborted: true, bytes: meter.bytes };
      if (meter.bytes > 0) return { mbps: meter.final(profile.warmupMs), bytes: meter.bytes, mode: modes[m] };
      lastError = state.error;
    }
    throw lastError || new Error('Upload endpoint unreachable');
  }

  /* ------------------------------------------------------------------ *
   * Test orchestration
   * ------------------------------------------------------------------ */
  async function fetchServerInfo() {
    try {
      var ac = new AbortController();
      var t = setTimeout(function () { ac.abort(); }, 3000);
      var res = await fetch(CFG.traceUrl, { cache: 'no-store', signal: ac.signal });
      clearTimeout(t);
      var txt = await res.text();
      var m = /colo=([A-Z0-9]+)/.exec(txt);
      return m ? 'Cloudflare (' + m[1] + ')' : null;
    } catch (_) { return null; }
  }

  async function startRealTest() {
    if (currentRun) { // button doubles as STOP
      currentRun.aborted = true;
      currentRun.aborters.forEach(function (a) { try { a.abort(); } catch (_) {} });
      return;
    }
    if (navigator.onLine === false) {
      setStatus('You appear to be offline', 'error');
      return;
    }

    var run = { aborted: false, aborters: [] };
    currentRun = run;
    var profile = CFG.profiles[$('light-mode') && $('light-mode').checked ? 'light' : 'standard'];
    var btn = $('start-btn');
    var shareBtn = $('share-btn');
    var results = { ping: null, jitter: null, down: null, up: null, bytes: 0 };
    var errors = [];

    btn.textContent = 'STOP';
    shareBtn.classList.add('hidden');
    resetUI();
    $('test-server').textContent = '';
    fetchServerInfo().then(function (s) { if (s && currentRun === run) $('test-server').textContent = 'Test server: ' + s; });

    try {
      // 1. Latency + jitter
      setStatus('Measuring latency…', 'info');
      try {
        var lat = await measureLatency(profile, run);
        if (lat.samples.length) {
          results.ping = lat.ping;
          results.jitter = lat.jitter;
          $('ping-val').textContent = Math.round(lat.ping) + ' ms';
          $('jitter-val').textContent = (lat.jitter < 10 ? lat.jitter.toFixed(1) : Math.round(lat.jitter)) + ' ms';
        }
      } catch (e) {
        if (!run.aborted) { errors.push('latency'); $('ping-val').textContent = 'Failed'; $('jitter-val').textContent = 'Failed'; }
      }

      // 2. Download
      if (!run.aborted) {
        setStatus('Testing download speed…', 'info');
        showLive(0);
        try {
          var d = await runDownload(profile, run);
          results.bytes += d.bytes;
          if (!d.aborted) {
            results.down = d.mbps;
            $('down-val').textContent = speedLabel(d.mbps);
            showLive(d.mbps);
          }
        } catch (e) {
          if (!run.aborted) { errors.push('download'); $('down-val').textContent = 'Failed'; }
        }
      }

      // 3. Upload
      if (!run.aborted) {
        setStatus('Testing upload speed…', 'info');
        showLive(0);
        await sleep(400);
        try {
          var u = await runUpload(profile, run);
          results.bytes += u.bytes;
          if (!u.aborted) {
            results.up = u.mbps;
            $('up-val').textContent = speedLabel(u.mbps);
            showLive(u.mbps);
          }
        } catch (e) {
          if (!run.aborted) { errors.push('upload'); $('up-val').textContent = 'Failed'; }
        }
      }

      if (results.bytes) $('data-used').textContent = 'Data used: ' + formatBytes(results.bytes);

      if (run.aborted) {
        setStatus('Test stopped', 'error');
      } else if (errors.length === 3) {
        setStatus('Could not reach the test servers. Check your connection, VPN or ad-blocker.', 'error');
      } else if (errors.length) {
        setStatus('Finished with errors (' + errors.join(', ') + ' failed)', 'error');
      } else {
        setStatus('Test complete', 'ok');
      }
      if (!run.aborted && (results.down !== null || results.up !== null)) shareBtn.classList.remove('hidden');
    } finally {
      currentRun = null;
      btn.textContent = 'RETEST';
    }
  }

  async function copyResults() {
    var text = [
      '🚀 My Internet Speed Test Result:',
      '',
      '⬇️ Download: ' + $('down-val').textContent,
      '⬆️ Upload: ' + $('up-val').textContent,
      '📡 Ping: ' + $('ping-val').textContent + ' (jitter ' + $('jitter-val').textContent + ')',
      '',
      'Tested on Fast Mode - ' + location.origin
    ].join('\n');
    var ok = await handleCopy(text);
    showToast(ok ? 'Results copied to clipboard' : 'Could not copy automatically');
  }

  /* ------------------------------------------------------------------ *
   * IP / ISP / location
   * ------------------------------------------------------------------ */
  async function fetchIPInfo() {
    var ipEl = $('user-ip'), ispEl = $('user-isp'), locEl = $('user-location');
    var best = null;
    for (var i = 0; i < CFG.ipApis.length; i++) {
      var api = CFG.ipApis[i];
      var ac = new AbortController();
      var timer = setTimeout(function () { ac.abort(); }, 4500);
      try {
        var res = await fetch(api.url, { signal: ac.signal, cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var parsed = api.parse(await res.json());
        if (!parsed) throw new Error('Unusable response');
        // Merge: keep the first IP but fill any missing fields from later providers.
        best = best || { ip: parsed.ip, isp: null, loc: null };
        best.isp = best.isp || parsed.isp;
        best.loc = best.loc || parsed.loc;
        if (best.isp && best.loc) { clearTimeout(timer); break; }
      } catch (e) {
        /* try next provider */
      }
      clearTimeout(timer);
    }
    if (best) {
      ipEl.textContent = best.ip;
      ispEl.textContent = best.isp || 'Not available';
      locEl.textContent = best.loc || 'Not available';
    } else {
      ipEl.textContent = 'Unavailable';
      ispEl.textContent = 'Not available';
      locEl.textContent = 'Not available';
    }
  }

  async function copyIP() {
    var ip = $('user-ip').textContent;
    if (!ip || ip === 'Detecting...' || ip === 'Unavailable') return;
    var ok = await handleCopy(ip);
    showToast(ok ? 'IP copied to clipboard' : 'Could not copy automatically');
  }

  async function copyText(text, btnId) {
    var ok = await handleCopy(text);
    var btn = $(btnId);
    if (!btn) return;
    if (ok) {
      btn.innerHTML = '<i class="fas fa-check text-emerald-400"></i>';
      setTimeout(function () { btn.innerHTML = '<i class="far fa-copy"></i>'; }, 1800);
    } else {
      showToast('Could not copy automatically');
    }
  }

  /* ------------------------------------------------------------------ *
   * DNS benchmark (DNS-over-HTTPS, RFC 8484 wire format)
   *
   * Every provider is queried the same way: one warm-up query (opens the
   * HTTPS connection, discarded), then several timed queries on the warm
   * connection. "Cached" = a name the resolver already has. "Uncached" =
   * a random name that forces a real lookup.
   * ------------------------------------------------------------------ */
  function buildDnsQuery(name, qtype) {
    var labels = name.replace(/\.$/, '').split('.');
    var len = 12 + 1 + 4;
    labels.forEach(function (l) { len += l.length + 1; });
    var buf = new Uint8Array(len);
    var dv = new DataView(buf.buffer);
    dv.setUint16(0, 0);        // ID 0 as recommended by RFC 8484
    dv.setUint16(2, 0x0100);   // recursion desired
    dv.setUint16(4, 1);        // one question
    var o = 12;
    labels.forEach(function (l) {
      buf[o++] = l.length;
      for (var i = 0; i < l.length; i++) buf[o++] = l.charCodeAt(i);
    });
    buf[o++] = 0;
    dv.setUint16(o, qtype || 1);   // A
    dv.setUint16(o + 2, 1);        // IN
    return buf;
  }

  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function dohUrl(base, name) {
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'dns=' + b64url(buildDnsQuery(name, 1));
  }

  async function dohQuery(base, name, expectAnswer) {
    var ac = new AbortController();
    var timer = setTimeout(function () { ac.abort(); }, CFG.dnsTimeoutMs);
    var u = dohUrl(base, name);
    try {
      var t0 = performance.now();
      var res = await fetch(u, { headers: { accept: 'application/dns-message' }, cache: 'no-store', mode: 'cors', signal: ac.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var buf = new Uint8Array(await res.arrayBuffer());
      var ms = performance.now() - t0;
      if (buf.length < 12) throw new Error('Malformed DNS response');
      var rcode = buf[3] & 15;
      var answers = (buf[6] << 8) | buf[7];
      if (rcode !== 0 && rcode !== 3) throw new Error('DNS error ' + rcode); // NOERROR / NXDOMAIN are valid replies
      if (expectAnswer && answers === 0) throw new Error('Empty answer');
      try {
        var e = performance.getEntriesByName(u).pop();
        if (e && e.requestStart > 0 && e.responseStart >= e.requestStart) {
          var rt = e.responseStart - e.requestStart;
          if (rt > 0 && rt <= ms + 1) ms = rt;
        }
      } catch (_) { /* ignore */ }
      return ms;
    } finally {
      clearTimeout(timer);
    }
  }

  async function benchProvider(p) {
    var out = { cached: null, uncached: null, approx: false, error: null };
    try {
      await dohQuery(p.url, 'example.com', true); // warm-up
      var c = [];
      for (var i = 0; i < CFG.dnsCachedQueries; i++) c.push(await dohQuery(p.url, 'example.com', true));
      out.cached = median(c);
      var un = [];
      for (var j = 0; j < CFG.dnsUncachedQueries; j++) {
        try { un.push(await dohQuery(p.url, 'fm-' + rand() + '.example.com', false)); } catch (_) { /* skip */ }
      }
      if (un.length) out.uncached = median(un);
    } catch (e) {
      // Usually CORS. Fall back to timing an opaque request: still a round trip
      // to the provider, but not verified as a valid DNS answer, so it is not ranked.
      try {
        var ac = new AbortController();
        var timer = setTimeout(function () { ac.abort(); }, CFG.dnsTimeoutMs);
        var url = dohUrl(p.url, 'example.com');
        await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ac.signal }); // warm-up
        var s = [];
        for (var k = 0; k < 3; k++) {
          var t0 = performance.now();
          await fetch(url + '&r=' + rand(), { mode: 'no-cors', cache: 'no-store', signal: ac.signal });
          s.push(performance.now() - t0);
        }
        clearTimeout(timer);
        out.cached = median(s);
        out.approx = true;
      } catch (_) {
        out.error = 'Unreachable';
      }
    }
    return out;
  }

  function cardId(p) { return 'dns-' + p.name.replace(/\s+/g, ''); }

  function initDNSCards() {
    var container = $('dns-results');
    if (!container) return;
    container.innerHTML = '';
    CFG.dnsProviders.forEach(function (p) {
      var card = document.createElement('div');
      card.id = cardId(p);
      card.className = 'glass-card p-6 rounded-xl border-l-4 transition-all duration-300 flex flex-col';
      card.style.borderLeftColor = p.color;
      card.innerHTML =
        '<div class="flex justify-between items-start mb-2">' +
          '<h3 class="font-bold text-lg">' + p.name + '</h3>' +
          '<span class="dns-badge hidden text-[10px] font-bold uppercase tracking-wide bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">Fastest</span>' +
        '</div>' +
        '<div class="space-y-2 mb-4">' +
          ['ip', 'ip_alt'].map(function (key, idx) {
            var id = 'btn-' + cardId(p) + '-' + (idx + 1);
            return '<div class="flex items-center justify-between bg-slate-800/50 rounded px-3 py-1.5 hover:bg-slate-800 transition">' +
              '<span class="text-xs font-mono text-slate-300">' + p[key] + '</span>' +
              '<button id="' + id + '" type="button" data-copy="' + p[key] + '" class="text-slate-500 hover:text-blue-400 transition" title="Copy ' + (idx ? 'secondary' : 'primary') + ' IP" aria-label="Copy ' + p[key] + '">' +
              '<i class="far fa-copy"></i></button></div>';
          }).join('') +
        '</div>' +
        '<div class="dns-main text-2xl font-mono text-slate-500 mt-auto">-- ms</div>' +
        '<div class="dns-sub text-xs font-mono text-slate-500 h-4"></div>';
      container.appendChild(card);
    });
    container.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-copy]');
      if (b) copyText(b.getAttribute('data-copy'), b.id);
    });
  }

  async function runDNSTest() {
    var btn = $('dns-btn');
    var summary = $('dns-summary');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Benchmarking...';
    summary.textContent = '';

    CFG.dnsProviders.forEach(function (p) {
      var card = $(cardId(p));
      card.style.order = '0';
      card.querySelector('.dns-badge').classList.add('hidden');
      var main = card.querySelector('.dns-main');
      main.textContent = '...';
      main.className = 'dns-main text-2xl font-mono text-slate-500 mt-auto';
      card.querySelector('.dns-sub').textContent = '';
      card.removeAttribute('title');
    });

    var results = await Promise.all(CFG.dnsProviders.map(async function (p, i) {
      await sleep(i * 80); // light stagger so handshakes do not all collide
      var r = await benchProvider(p);
      var card = $(cardId(p));
      var main = card.querySelector('.dns-main');
      var sub = card.querySelector('.dns-sub');
      if (r.error) {
        main.textContent = r.error;
        main.className = 'dns-main text-2xl font-mono text-rose-500 mt-auto';
      } else if (r.approx) {
        main.textContent = '≈ ' + Math.round(r.cached) + ' ms';
        main.className = 'dns-main text-2xl font-mono text-slate-300 mt-auto';
        sub.textContent = 'approx. (CORS-restricted)';
        card.title = 'This provider blocks cross-origin DNS answers, so only the HTTPS round trip was timed. Not included in the ranking.';
      } else {
        main.textContent = Math.round(r.cached) + ' ms';
        main.style.color = p.color;
        sub.textContent = r.uncached !== null ? 'uncached: ' + Math.round(r.uncached) + ' ms' : 'uncached: n/a';
      }
      return { p: p, r: r };
    }));

    var ranked = results.filter(function (x) { return !x.r.error && !x.r.approx; })
      .sort(function (a, b) { return a.r.cached - b.r.cached; });
    var rest = results.filter(function (x) { return ranked.indexOf(x) === -1; });
    ranked.concat(rest).forEach(function (x, i) { $(cardId(x.p)).style.order = String(i); });

    if (ranked.length) {
      $(cardId(ranked[0].p)).querySelector('.dns-badge').classList.remove('hidden');
      summary.textContent = 'Fastest right now: ' + ranked[0].p.name + ' (' + Math.round(ranked[0].r.cached) + ' ms cached).';
    } else {
      summary.textContent = 'No provider could be measured. Your network, VPN or browser may be blocking DNS-over-HTTPS.';
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sync-alt mr-2"></i> Run DNS Test';
  }

  /* ------------------------------------------------------------------ *
   * Page wiring
   * ------------------------------------------------------------------ */
  function initMobileMenu() {
    var btn = $('menu-btn'), panel = $('mobile-menu');
    if (!btn || !panel) return;
    btn.addEventListener('click', function () {
      var open = panel.classList.toggle('hidden') === false;
      btn.setAttribute('aria-expanded', String(open));
    });
    panel.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { panel.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); }
    });
  }

  function init() {
    initDNSCards();
    initMobileMenu();
    $('start-btn').addEventListener('click', startRealTest);
    $('share-btn').addEventListener('click', copyResults);
    $('copy-ip-btn').addEventListener('click', copyIP);
    $('dns-btn').addEventListener('click', runDNSTest);
    fetchIPInfo();
  }

  // Backwards-compatible globals (inline handlers, tests).
  window.startRealTest = startRealTest;
  window.runDNSTest = runDNSTest;
  window.copyIP = copyIP;
  window.copyResults = copyResults;
  window.copyText = copyText;
  window.FastMode = { Meter: Meter, median: median, jitter: jitter, formatSpeed: formatSpeed, buildDnsQuery: buildDnsQuery, b64url: b64url, config: CFG };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
