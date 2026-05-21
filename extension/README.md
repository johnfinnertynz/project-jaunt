# Twitch Diagnostics Console

Twitch Diagnostics Console is a local WebExtension for Chrome, Edge, and Firefox. It injects a draggable diagnostics console into Twitch pages and captures playback/network signals useful for troubleshooting stream issues.

## Features

- buffer-ahead timer from the active Twitch video element
- connected CDN host detection from media requests and performance entries
- CDN request duration, last status, request count, and failure tracking
- manual CDN probe timing
- temporary CDN avoid rules to force Twitch to renegotiate a different edge
- old-vs-new CDN comparison after forcing a reconnect
- manual segment URL or CDN host input for exact failover targeting
- live latency estimate when Twitch exposes seekable live ranges
- dropped-frame count and dropped-frame percentage
- recent throughput estimate from browser resource timing
- copy or download a JSON diagnostics report
- toggle with the extension icon or `Alt+Shift+D`

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

## Forcing A New CDN

Twitch controls CDN selection internally, so the extension cannot directly choose a specific edge server. The reliable workaround is:

1. Let playback run until the console detects the active CDN.
2. Click **Renegotiate CDN**.
3. The extension snapshots the old CDN's request count, average response time, latest response time, and failures.
4. The extension clears temporary CDN blocks and reloads Twitch so the player asks for a fresh playlist.
5. The **CDN Switch Comparison** section shows old-vs-new CDN stats, including average and latest response-time deltas.

If Twitch reconnects to the same slow host, click **Try Chrome Client**, then use **Renegotiate CDN** again. This experimentally changes the client signature sent to Twitch playlist allocation requests. It may not affect CDN choice because Twitch usually allocates CDN edges from IP/POP/DNS and internal capacity signals.

Use **Clear Avoids** to remove all temporary CDN blocks. Hard blocking a video CDN can produce Twitch Error #2000 if Twitch reuses a playlist that still points at the blocked host, so the hard-block button is best treated as an advanced test.

You can also paste a full Twitch segment URL, for example a `.ts` request from the browser network panel, into the manual CDN field and click **Hard Block Entered CDN**. Static asset hosts such as `static-cdn.jtvnw.net` are intentionally not blocked because they serve site assets rather than the video stream.

## Notes

Browser timing APIs and Twitch internals vary by browser, stream type, and privacy settings. The console reports the strongest available signals, but some fields may show `n/a` until playback starts or until media segment requests are observed.
