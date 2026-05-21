# Twitch Diagnostics Console

Twitch Diagnostics Console is a browser add-on for advanced Twitch playback logging and troubleshooting.

It does not attempt to modify Twitch playback, change CDNs, proxy traffic, or bypass Twitch behavior. It observes playback and network signals so users can understand and report buffering or routing problems.

## Features

- buffer-ahead and live-edge gap tracking
- connected video CDN host detection
- CDN request count, response time, status, byte count, and delivery type
- dropped-frame statistics
- recent throughput estimate
- rolling graphs with hover readouts
- event log
- copy or download a JSON diagnostics report
- automatic reset when switching Twitch streams
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

## Privacy

The add-on stores diagnostics locally in memory while the Twitch tab is open. It does not send diagnostics anywhere. JSON exports are created only when the user clicks copy or download.

## Notes

Browser timing APIs and Twitch internals vary by browser, stream type, and privacy settings. Some fields may show `n/a` until playback starts or until media segment requests are observed.
