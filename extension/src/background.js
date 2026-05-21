const api = globalThis.browser || globalThis.chrome;

const requestStarts = new Map();
const tabDiagnostics = new Map();
const REDIRECT_RULE_ID = 18000;
const CDN_RULE_ID_START = 20000;
const CLIENT_RULE_ID = 19000;
const CDN_RULE_STORAGE_KEY = "twitchDiagnosticsAvoidedCdns";
const CLIENT_PROFILE_STORAGE_KEY = "twitchDiagnosticsClientProfile";
const CDN_REDIRECT_STORAGE_KEY = "twitchDiagnosticsCdnRedirect";

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

function classifyDelivery(url, resourceType = "") {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "unknown";
  }

  const path = parsed.pathname.toLowerCase();
  const query = parsed.search.toLowerCase();
  const full = `${path}${query}`;

  if (path.endsWith(".m3u8")) return "playlist";
  if (full.includes("ad") || full.includes("stitched") || full.includes("ssai")) return "ad media";
  if (path.endsWith(".ts") || path.endsWith(".m4s") || path.includes("/segment/")) return "video segment";
  if (path.includes("/hls/")) return "hls media";
  if (path.includes("/vod/")) return "vod media";
  if (resourceType === "media") return "media";
  return "video delivery";
}

function getHeaderValue(headers = [], name) {
  const header = headers.find((item) => item.name?.toLowerCase() === name.toLowerCase());
  return header?.value || null;
}

function getContentLength(headers = []) {
  const value = getHeaderValue(headers, "content-length");
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

async function readAvoidedCdns() {
  const result = await callExtensionApi(api.storage.local.get.bind(api.storage.local), CDN_RULE_STORAGE_KEY);
  return result?.[CDN_RULE_STORAGE_KEY] || {};
}

async function readCdnRedirect() {
  const result = await callExtensionApi(api.storage.local.get.bind(api.storage.local), CDN_REDIRECT_STORAGE_KEY);
  return result?.[CDN_REDIRECT_STORAGE_KEY] || null;
}

async function writeAvoidedCdns(avoidedCdns) {
  await callExtensionApi(api.storage.local.set.bind(api.storage.local), {
    [CDN_RULE_STORAGE_KEY]: avoidedCdns
  });
}

async function writeCdnRedirect(redirect) {
  await callExtensionApi(api.storage.local.set.bind(api.storage.local), {
    [CDN_REDIRECT_STORAGE_KEY]: redirect
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

async function setCdnRedirect(fromHost, toHost) {
  const cleanFromHost = sanitizeHost(fromHost);
  const cleanToHost = sanitizeHost(toHost);

  if (!cleanFromHost || !cleanToHost || cleanFromHost === cleanToHost) {
    throw new Error("Redirect requires two different Twitch video CDN hosts.");
  }

  if (!isVideoDeliveryHost(cleanFromHost) || !isVideoDeliveryHost(cleanToHost)) {
    throw new Error("Redirect only supports Twitch video delivery CDN hosts.");
  }

  if (!api.declarativeNetRequest?.updateDynamicRules) {
    throw new Error("This browser does not expose dynamic request redirect rules to the extension.");
  }

  await callExtensionApi(api.declarativeNetRequest.updateDynamicRules.bind(api.declarativeNetRequest), {
    removeRuleIds: [REDIRECT_RULE_ID],
    addRules: [{
      id: REDIRECT_RULE_ID,
      priority: 3,
      action: {
        type: "redirect",
        redirect: {
          transform: {
            host: cleanToHost
          }
        }
      },
      condition: {
        urlFilter: `||${cleanFromHost}^`,
        resourceTypes: [
          "xmlhttprequest",
          "media",
          "other"
        ]
      }
    }]
  });

  const redirect = {
    fromHost: cleanFromHost,
    toHost: cleanToHost,
    createdAt: Date.now()
  };
  await writeCdnRedirect(redirect);

  return redirect;
}

async function clearCdnRedirect() {
  if (api.declarativeNetRequest?.updateDynamicRules) {
    await callExtensionApi(api.declarativeNetRequest.updateDynamicRules.bind(api.declarativeNetRequest), {
      removeRuleIds: [REDIRECT_RULE_ID]
    });
  }

  await writeCdnRedirect(null);
  return null;
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

async function setClientProfile(profile = "default") {
  if (!api.declarativeNetRequest?.updateDynamicRules) {
    throw new Error("This browser does not expose dynamic request rules to the extension.");
  }

  const cleanProfile = profile === "chrome-windows" ? "chrome-windows" : "default";
  const update = {
    removeRuleIds: [CLIENT_RULE_ID]
  };

  if (cleanProfile === "chrome-windows") {
    update.addRules = [{
      id: CLIENT_RULE_ID,
      priority: 2,
      action: {
        type: "modifyHeaders",
        requestHeaders: [{
          header: "user-agent",
          operation: "set",
          value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
        }]
      },
      condition: {
        urlFilter: "||usher.ttvnw.net^",
        resourceTypes: [
          "xmlhttprequest",
          "other"
        ]
      }
    }];
  }

  await callExtensionApi(api.declarativeNetRequest.updateDynamicRules.bind(api.declarativeNetRequest), update);
  await callExtensionApi(api.storage.local.set.bind(api.storage.local), {
    [CLIENT_PROFILE_STORAGE_KEY]: cleanProfile
  });

  return { profile: cleanProfile };
}

function rememberRequest(tabId, sample) {
  if (tabId < 0) return;
  if (!isVideoDeliveryHost(sample.host)) return;

  const state = getTabState(tabId);
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
  const deliveryType = sample.deliveryType || classifyDelivery(sample.url, sample.type);

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
  sample.deliveryType = deliveryType;

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
      bytes: getContentLength(details.responseHeaders || []),
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

async function handleRuntimeMessage(message, sender) {
  if (message?.type === "TWITCH_DIAGNOSTICS_GET_NETWORK") {
    try {
      const avoidedCdns = await readAvoidedCdns();
      const cdnRedirect = await readCdnRedirect();
      return {
        ...getTabState(sender.tab?.id ?? -1),
        avoidedCdns,
        cdnRedirect
      };
    } catch (error) {
      return {
        ...getTabState(sender.tab?.id ?? -1),
        avoidedCdns: {},
        cdnRedirect: null,
        error: error.message
      };
    }
  }

  if (message?.type === "TWITCH_DIAGNOSTICS_AVOID_CDN") {
    try {
      const rule = await applyAvoidedCdnRule(message.host, message.minutes);
      return { ok: true, rule };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  if (message?.type === "TWITCH_DIAGNOSTICS_CLEAR_AVOIDED_CDNS") {
    try {
      const avoidedCdns = await clearAvoidedCdn(message.host || null);
      return { ok: true, avoidedCdns };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  if (message?.type === "TWITCH_DIAGNOSTICS_SET_CLIENT_PROFILE") {
    try {
      return {
        ok: true,
        ...(await setClientProfile(message.profile))
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  if (message?.type === "TWITCH_DIAGNOSTICS_SET_CDN_REDIRECT") {
    try {
      return {
        ok: true,
        redirect: await setCdnRedirect(message.fromHost, message.toHost)
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  if (message?.type === "TWITCH_DIAGNOSTICS_CLEAR_CDN_REDIRECT") {
    try {
      return {
        ok: true,
        redirect: await clearCdnRedirect()
      };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  return null;
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const responsePromise = handleRuntimeMessage(message, sender);

  if (globalThis.browser) {
    return responsePromise;
  }

  responsePromise.then((response) => {
    if (response !== null) sendResponse(response);
  });
  return true;
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
