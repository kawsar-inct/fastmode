# Fast Mode

Fast Mode is a static, browser-based network diagnostics website. It includes an internet speed test, DNS-over-HTTPS benchmark, public IP and approximate network details, local test history, CSV/JSON export, and responsive educational content.

Live site: https://www.fastmode.top

## Included features

- Download and upload speed measurement with warm-up handling, parallel streams and a light mode for capped data use
- Repeated latency samples, jitter, loaded latency, and estimated packet loss
- DNS-over-HTTPS comparisons for public resolver endpoints, with approximate results labeled when a browser blocks readable responses
- Public IP, ISP and approximate location lookup
- Private browser-only history for up to 25 tests with a trend chart and CSV/JSON downloads
- Persistent Mbps/MB/s and dark/light preferences
- Responsive layout, keyboard skip link, visible focus styles, reduced-motion support and page metadata

## Run locally

This is a static site with no build step. Serve the `fastmode-main` folder from a local web server or upload its contents to a static host. Network diagnostics require a secure context (HTTPS, or localhost in development) and may be limited by browser CORS rules, extensions, DNS provider availability, or network policy.

## Production deployment notes

- Configure the production host to serve `index.html` at `/` and keep the supporting HTML, CSS, JavaScript, image, manifest, sitemap and robots files at their listed paths.
- Keep the canonical domain consistent with the actual redirect/canonical policy. The current metadata uses `https://fastmode.top/`.
- Layout utilities are served from the included `local-utilities.css`, so the page does not need Tailwind’s browser compiler. Font Awesome remains an external CDN dependency for icons; self-host or pin it if your deployment requires all assets to be local, and update the privacy notice when dependencies change.
- Verify all test and lookup endpoints from the production origin. Browser CORS or provider changes can make a provider unavailable; endpoint behavior is not controlled by this static site.
- Review the privacy policy and terms against the actual hosting, advertising, affiliate and legal requirements before launch. No contact address is included because none was configured in this project.
- After changing pages, update `sitemap.xml` last-modified dates and submit the sitemap in Google Search Console. Structured data and metadata do not guarantee indexing or ranking.

## Configure test endpoints

Set `window.FASTMODE_CONFIG` before `app.js` loads to override test services. For example:

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

The endpoints need appropriate CORS headers. `Timing-Allow-Origin` can expose more precise resource timing where supported. Keep the server configuration and user-facing privacy information in sync with any endpoint changes.

## Data and privacy

The site does not have an account or results backend. Browser local storage keeps up to 25 test records and the selected display unit and theme on the current device. The browser contacts third-party speed-test, IP lookup, DNS, and CDN services as described in `privacy.html`.
