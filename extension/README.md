# Twitch Diagnostics Console

Twitch Diagnostics Console is a local WebExtension for Chrome, Edge, and Firefox. It injects a draggable diagnostics console into Twitch pages and captures playback/network signals useful for troubleshooting stream issues.

## Features

- buffer-ahead timer from the active Twitch video element
- connected CDN host detection from media requests and performance entries
- CDN request duration, last status, request count, and failure tracking
- manual CDN probe timing
- Firefox-only playlist response rewriting that maps a slow observed HLS host to another observed HLS host
- old-vs-new CDN comparison after forcing a reconnect
- manual segment URL or CDN host input for exact failover targeting
- live latency estimate when Twitch exposes seekable live ranges
- dropped-frame count and dropped-frame percentage
- recent throughput estimate from browser resource timing
- copy or download a JSON diagnostics report
- toggle with the extension icon or `Alt+Shift+D`
- optional rolling graphs for buffer, CDN response time, throughput, and dropped frames

## Install In Chrome Or Edge

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `extension`.
5. Open a Twitch stream and click the extension icon.

## Install In Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select `extension/manifest.json`.
4. Open a Twitch stream and click the extension icon.

Temporary Firefox add-ons are removed when the browser restarts. For permanent install, package and sign the extension through Mozilla Add-ons.

## Rewriting A Playlist CDN

Twitch controls CDN selection internally, so the extension cannot directly choose a specific edge server. The strongest browser-only Firefox workaround is playlist rewriting:

1. Let playback run until the console detects the active CDN.
2. Wait until the CDN table shows a second video delivery host.
3. Click **Rewrite Playlist CDN**.
3. The extension snapshots the old CDN's request count, average response time, latest response time, and failures.
4. Firefox intercepts Twitch `.m3u8` playlist responses and rewrites URLs from the slow host to the alternate observed host.
5. Twitch reloads and the **CDN Switch Comparison** section shows old-vs-new CDN stats, including average and latest response-time deltas.

Use **Clear Rewrite** to remove the playlist rewrite. This works only in Firefox because it depends on Mozilla's response filtering API. It may still fail if Twitch's segment tokens are bound to the original host.

## Notes

Browser timing APIs and Twitch internals vary by browser, stream type, and privacy settings. The console reports the strongest available signals, but some fields may show `n/a` until playback starts or until media segment requests are observed.
