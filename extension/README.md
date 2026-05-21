# Twitch Diagnostics Console

Twitch Diagnostics Console is a local WebExtension for Chrome, Edge, and Firefox. It injects a draggable diagnostics console into Twitch pages and captures playback/network signals useful for troubleshooting stream issues.

## Features

- buffer-ahead timer from the active Twitch video element
- connected CDN host detection from media requests and performance entries
- CDN request duration, last status, request count, and failure tracking
- manual CDN probe timing
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

## Notes

Browser timing APIs and Twitch internals vary by browser, stream type, and privacy settings. The console reports the strongest available signals, but some fields may show `n/a` until playback starts or until media segment requests are observed.
