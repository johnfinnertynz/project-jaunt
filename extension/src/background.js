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

function isTwitchMediaUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    return CDN_HOST_HINTS.some((hint) => host.includes(hint)) ||
      path.endsWith(".m3u8") ||
      path.endsWith(".ts") ||
      path.endsWith(".m4s") ||
      path.includes("/hls/") ||
      path.includes("/vod/");
  } catch {
    return false;
  }
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
    // The content script is not always present on every Twitch/GitHub/browser tab.
  }
}

function rememberRequest(tabId, sample) {
  if (tabId < 0) return;

  const state = getTabState(tabId);
  const hostState = state.cdnHosts[sample.host] || {
    count: 0,
    failures: 0,
    totalMs: 0,
    lastStatus: null,
    lastUrl: null,
    lastMs: null,
    lastSeen: null
  };

  hostState.count += 1;
  hostState.failures += sample.ok ? 0 : 1;
  hostState.totalMs += sample.durationMs;
  hostState.lastStatus = sample.statusCode || null;
  hostState.lastUrl = sample.url;
  hostState.lastMs = sample.durationMs;
  hostState.lastSeen = sample.endedAt;

  state.cdnHosts[sample.host] = hostState;
  state.recentRequests.unshift(sample);
  state.recentRequests = state.recentRequests.slice(0, 80);
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
      tabId: details.tabId,
      url: details.url,
      startedAt: details.timeStamp
    });
  },
  {
    urls: [
      "*://*.twitch.tv/*",
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
      durationMs: Math.max(0, Math.round(details.timeStamp - start.startedAt)),
      endedAt: Date.now()
    });
  },
  {
    urls: [
      "*://*.twitch.tv/*",
      "*://*.ttvnw.net/*",
      "*://*.jtvnw.net/*",
      "*://*.twitchcdn.net/*"
    ]
  }
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
      durationMs: Math.max(0, Math.round(details.timeStamp - start.startedAt)),
      endedAt: Date.now()
    });
  },
  {
    urls: [
      "*://*.twitch.tv/*",
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
