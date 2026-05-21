const api = globalThis.browser || globalThis.chrome;

const requestStarts = new Map();
const tabDiagnostics = new Map();

const CDN_HOST_HINTS = [
  "ttvnw.net",
  "jtvnw.net",
  "twitchcdn.net",
  "cloudfront.net",
  "akamaized.net",
  "fastly.net"
];

function isKnownCdnHost(host) {
  return CDN_HOST_HINTS.some((hint) => host.includes(hint));
}

function isVideoDeliveryHost(host) {
  return isKnownCdnHost(host) &&
    host !== "static-cdn.jtvnw.net" &&
    !host.startsWith("static-cdn.") &&
    (
      host.includes("hls.ttvnw.net") ||
      host.includes("cloudfront.hls.ttvnw.net") ||
      host.includes("video") ||
      host.includes("vod") ||
      host.includes("twitchcdn.net") ||
      host.includes("akamaized.net") ||
      host.includes("fastly.net")
    );
}

function isTwitchMediaUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    return isVideoDeliveryHost(host) ||
      path.endsWith(".m3u8") ||
      path.endsWith(".ts") ||
      path.endsWith(".m4s") ||
      path.includes("/hls/") ||
      path.includes("/vod/");
  } catch {
    return false;
  }
}

function classifyDelivery(url, resourceType = "") {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const full = `${path}${parsed.search.toLowerCase()}`;

    if (path.endsWith(".m3u8")) return "playlist";
    if (full.includes("ad") || full.includes("stitched") || full.includes("ssai")) return "ad media";
    if (path.endsWith(".ts") || path.endsWith(".m4s") || path.includes("/segment/")) return "video segment";
    if (path.includes("/hls/")) return "hls media";
    if (path.includes("/vod/")) return "vod media";
    if (resourceType === "media") return "media";
  } catch {
    // Fall through to the generic label.
  }

  return "video delivery";
}

function getHeaderValue(headers = [], name) {
  const header = headers.find((item) => item.name?.toLowerCase() === name.toLowerCase());
  return header?.value || null;
}

function getContentLength(headers = []) {
  const parsed = Number.parseInt(getHeaderValue(headers, "content-length") || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getTabState(tabId) {
  if (!tabDiagnostics.has(tabId)) {
    tabDiagnostics.set(tabId, {
      cdnHosts: {},
      recentRequests: [],
      lastUpdated: Date.now()
    });
  }

  return tabDiagnostics.get(tabId);
}

function sendTabMessage(tabId, message) {
  try {
    const result = api.tabs.sendMessage(tabId, message);
    if (result?.catch) result.catch(() => {});
  } catch {
    // The content script may not be present in this tab.
  }
}

function rememberRequest(tabId, sample) {
  if (tabId < 0 || !isVideoDeliveryHost(sample.host)) return;

  const state = getTabState(tabId);
  const deliveryType = sample.deliveryType || classifyDelivery(sample.url, sample.type);
  const hostState = state.cdnHosts[sample.host] || {
    count: 0,
    failures: 0,
    totalMs: 0,
    totalBytes: 0,
    deliveryTypes: {},
    lastStatus: null,
    lastUrl: null,
    lastBytes: 0,
    lastDeliveryType: null,
    lastMs: null,
    lastSeen: null
  };

  hostState.count += 1;
  hostState.failures += sample.ok ? 0 : 1;
  hostState.totalMs += sample.durationMs;
  hostState.totalBytes += sample.bytes || 0;
  hostState.deliveryTypes[deliveryType] = (hostState.deliveryTypes[deliveryType] || 0) + 1;
  hostState.lastStatus = sample.statusCode || null;
  hostState.lastUrl = sample.url;
  hostState.lastBytes = sample.bytes || 0;
  hostState.lastDeliveryType = deliveryType;
  hostState.lastMs = sample.durationMs;
  hostState.lastSeen = sample.endedAt;

  state.cdnHosts[sample.host] = hostState;
  state.recentRequests.unshift({
    ...sample,
    deliveryType
  });
  state.recentRequests = state.recentRequests.slice(0, 120);
  state.lastUpdated = Date.now();

  sendTabMessage(tabId, {
    type: "TWITCH_DIAGNOSTICS_NETWORK_SAMPLE",
    payload: {
      cdnHosts: state.cdnHosts,
      recentRequests: state.recentRequests,
      lastUpdated: state.lastUpdated
    }
  });
}

api.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!isTwitchMediaUrl(details.url)) return;

    requestStarts.set(details.requestId, {
      startedAt: details.timeStamp
    });
  },
  {
    urls: [
      "*://*.twitch.tv/*",
      "*://usher.ttvnw.net/*",
      "*://*.ttvnw.net/*",
      "*://*.jtvnw.net/*",
      "*://*.twitchcdn.net/*"
    ]
  }
);

api.webRequest.onCompleted.addListener(
  (details) => {
    const start = requestStarts.get(details.requestId);
    requestStarts.delete(details.requestId);
    if (!start || !isTwitchMediaUrl(details.url)) return;

    const parsed = new URL(details.url);
    rememberRequest(details.tabId, {
      url: details.url,
      host: parsed.hostname,
      method: details.method,
      type: details.type,
      statusCode: details.statusCode,
      ok: details.statusCode >= 200 && details.statusCode < 400,
      bytes: getContentLength(details.responseHeaders || []),
      durationMs: Math.max(0, Math.round(details.timeStamp - start.startedAt)),
      endedAt: Date.now()
    });
  },
  {
    urls: [
      "*://*.twitch.tv/*",
      "*://usher.ttvnw.net/*",
      "*://*.ttvnw.net/*",
      "*://*.jtvnw.net/*",
      "*://*.twitchcdn.net/*"
    ]
  },
  ["responseHeaders"]
);

api.webRequest.onErrorOccurred.addListener(
  (details) => {
    const start = requestStarts.get(details.requestId);
    requestStarts.delete(details.requestId);
    if (!start || !isTwitchMediaUrl(details.url)) return;

    const parsed = new URL(details.url);
    rememberRequest(details.tabId, {
      url: details.url,
      host: parsed.hostname,
      method: details.method,
      type: details.type,
      statusCode: null,
      error: details.error,
      ok: false,
      bytes: 0,
      durationMs: Math.max(0, Math.round(details.timeStamp - start.startedAt)),
      endedAt: Date.now()
    });
  },
  {
    urls: [
      "*://*.twitch.tv/*",
      "*://usher.ttvnw.net/*",
      "*://*.ttvnw.net/*",
      "*://*.jtvnw.net/*",
      "*://*.twitchcdn.net/*"
    ]
  }
);

api.tabs.onRemoved.addListener((tabId) => {
  tabDiagnostics.delete(tabId);
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TWITCH_DIAGNOSTICS_GET_NETWORK") {
    sendResponse(getTabState(sender.tab?.id ?? -1));
    return true;
  }

  return false;
});

api.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  sendTabMessage(tab.id, {
    type: "TWITCH_DIAGNOSTICS_TOGGLE_PANEL"
  });
});
