const api = globalThis.browser || globalThis.chrome;

const requestStarts = new Map();
const tabDiagnostics = new Map();
const CDN_RULE_ID_START = 20000;
const CDN_RULE_STORAGE_KEY = "twitchDiagnosticsAvoidedCdns";

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

function callExtensionApi(fn, ...args) {
  return new Promise((resolve, reject) => {
    try {
      if (globalThis.browser) {
        Promise.resolve(fn(...args)).then(resolve).catch(reject);
        return;
      }

      fn(...args, (result) => {
        const error = api.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function ruleIdForHost(host) {
  let hash = 0;
  for (let i = 0; i < host.length; i += 1) {
    hash = ((hash << 5) - hash + host.charCodeAt(i)) | 0;
  }

  return CDN_RULE_ID_START + Math.abs(hash % 10000);
}

function sanitizeHost(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
}

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

async function readAvoidedCdns() {
  const result = await callExtensionApi(api.storage.local.get.bind(api.storage.local), CDN_RULE_STORAGE_KEY);
  return result?.[CDN_RULE_STORAGE_KEY] || {};
}

async function writeAvoidedCdns(avoidedCdns) {
  await callExtensionApi(api.storage.local.set.bind(api.storage.local), {
    [CDN_RULE_STORAGE_KEY]: avoidedCdns
  });
}

async function applyAvoidedCdnRule(host, minutes = 5) {
  const cleanHost = sanitizeHost(host);

  if (!cleanHost || !isVideoDeliveryHost(cleanHost)) {
    throw new Error("Only Twitch video delivery CDN hosts can be avoided. Static asset CDNs are ignored.");
  }

  if (!api.declarativeNetRequest?.updateDynamicRules) {
    throw new Error("This browser does not expose dynamic request blocking to the extension.");
  }

  const ruleId = ruleIdForHost(cleanHost);
  const expiresAt = Date.now() + Math.max(1, minutes) * 60 * 1000;
  const rule = {
    id: ruleId,
    priority: 1,
    action: {
      type: "block"
    },
    condition: {
      urlFilter: `||${cleanHost}^`,
      resourceTypes: [
        "xmlhttprequest",
        "media",
        "other"
      ]
    }
  };

  await callExtensionApi(api.declarativeNetRequest.updateDynamicRules.bind(api.declarativeNetRequest), {
    removeRuleIds: [ruleId],
    addRules: [rule]
  });

  const avoidedCdns = await readAvoidedCdns();
  avoidedCdns[cleanHost] = {
    ruleId,
    host: cleanHost,
    expiresAt,
    createdAt: Date.now()
  };
  await writeAvoidedCdns(avoidedCdns);

  if (api.alarms?.create) {
    api.alarms.create(`clear-cdn-${ruleId}`, {
      when: expiresAt + 500
    });
  }

  return avoidedCdns[cleanHost];
}

async function clearAvoidedCdn(host = null) {
  if (!api.declarativeNetRequest?.updateDynamicRules) return {};

  const avoidedCdns = await readAvoidedCdns();
  const hosts = host ? [sanitizeHost(host)] : Object.keys(avoidedCdns);
  const ruleIds = hosts
    .map((item) => avoidedCdns[item]?.ruleId)
    .filter((item) => Number.isInteger(item));

  if (ruleIds.length) {
    await callExtensionApi(api.declarativeNetRequest.updateDynamicRules.bind(api.declarativeNetRequest), {
      removeRuleIds: ruleIds
    });
  }

  for (const item of hosts) {
    delete avoidedCdns[item];
  }

  await writeAvoidedCdns(avoidedCdns);
  return avoidedCdns;
}

async function clearExpiredAvoidedCdns() {
  const avoidedCdns = await readAvoidedCdns();
  const expiredHosts = Object.keys(avoidedCdns)
    .filter((host) => avoidedCdns[host].expiresAt <= Date.now());

  if (expiredHosts.length) {
    await clearAvoidedCdn(expiredHosts[0]);
    for (const host of expiredHosts.slice(1)) {
      await clearAvoidedCdn(host);
    }
  }
}

function rememberRequest(tabId, sample) {
  if (tabId < 0) return;
  if (!isVideoDeliveryHost(sample.host)) return;

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
    readAvoidedCdns()
      .then((avoidedCdns) => {
        sendResponse({
          ...getTabState(sender.tab?.id ?? -1),
          avoidedCdns
        });
      })
      .catch((error) => {
        sendResponse({
          ...getTabState(sender.tab?.id ?? -1),
          avoidedCdns: {},
          error: error.message
        });
      });
    return true;
  }

  if (message?.type === "TWITCH_DIAGNOSTICS_AVOID_CDN") {
    applyAvoidedCdnRule(message.host, message.minutes)
      .then((rule) => sendResponse({ ok: true, rule }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "TWITCH_DIAGNOSTICS_CLEAR_AVOIDED_CDNS") {
    clearAvoidedCdn(message.host || null)
      .then((avoidedCdns) => sendResponse({ ok: true, avoidedCdns }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

if (api.alarms?.onAlarm) {
  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name.startsWith("clear-cdn-")) {
      clearExpiredAvoidedCdns().catch(() => {});
    }
  });
}

clearExpiredAvoidedCdns().catch(() => {});

api.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  sendTabMessage(tab.id, {
    type: "TWITCH_DIAGNOSTICS_TOGGLE_PANEL"
  });
});
