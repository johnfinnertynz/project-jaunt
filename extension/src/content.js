(() => {
  const api = globalThis.browser || globalThis.chrome;
  const state = {
    visible: true,
    compact: false,
    network: {
      cdnHosts: {},
      recentRequests: [],
      avoidedCdns: {}
    },
    perfSeen: new Set(),
    perfSamples: [],
    probeSamples: [],
    logs: [],
    pendingSwitch: null,
    switchHistory: [],
    graphsVisible: false,
    metricHistory: [],
    streamKey: ""
  };

  const SELECTORS = {
    root: "twitch-diagnostics-console"
  };

  const PENDING_SWITCH_KEY = "twitchDiagnosticsPendingSwitch";
  const SWITCH_HISTORY_KEY = "twitchDiagnosticsSwitchHistory";

  function fmtMs(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
    return `${Math.round(value)} ms`;
  }

  function fmtSeconds(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
    if (value < 0) return "0.0 s";
    return `${value.toFixed(1)} s`;
  }

  function fmtBitrate(bytesPerSecond) {
    if (!bytesPerSecond || !Number.isFinite(bytesPerSecond)) return "n/a";
    const mbps = (bytesPerSecond * 8) / 1_000_000;
    return `${mbps.toFixed(2)} Mbps`;
  }

  function safeUrlHost(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  function parseCdnHost(input) {
    const value = String(input || "").trim();
    if (!value) return "";

    if (/^https?:\/\//i.test(value)) {
      return safeUrlHost(value).toLowerCase();
    }

    const withoutMethod = value.replace(/^(GET|POST|HEAD|OPTIONS)\s+/i, "").trim();
    if (/^https?:\/\//i.test(withoutMethod)) {
      return safeUrlHost(withoutMethod).toLowerCase();
    }

    const firstToken = withoutMethod.split(/\s+/)[0].replace(/^\/\//, "");
    return firstToken.split("/")[0].split("?")[0].toLowerCase();
  }

  function getCdnEdgeDetails(urlOrHost) {
    const input = String(urlOrHost || "");
    const host = parseCdnHost(input);
    const labels = host.split(".");
    const isStaticAssetCdn = host === "static-cdn.jtvnw.net" || host.startsWith("static-cdn.");
    const provider = host.includes("cloudfront") ? "CloudFront" :
      host.includes("fastly") ? "Fastly" :
      host.includes("akamaized") ? "Akamai" :
      host.includes("ttvnw") ? "Twitch" :
      "unknown";
    const regionMatch = input.match(/([a-z]{2}-[a-z]+-\d+)/i);

    return {
      host: host || "n/a",
      edgeId: labels.length > 4 ? labels[0] : "n/a",
      provider,
      role: isStaticAssetCdn ? "static assets" : "video delivery candidate",
      region: regionMatch?.[1] || "n/a",
      hostFamily: labels.length > 1 ? labels.slice(1).join(".") : "n/a"
    };
  }

  function isVideoDeliveryHost(host) {
    return Boolean(host) &&
      host !== "static-cdn.jtvnw.net" &&
      !host.startsWith("static-cdn.") &&
      (
        host.includes("hls.ttvnw.net") ||
        host.includes("cloudfront.hls.ttvnw.net") ||
        host.includes("twitchcdn.net") ||
        host.includes("akamaized.net") ||
        host.includes("fastly.net")
      );
  }

  function isMediaPerformanceEntry(entry) {
    const name = entry.name || "";
    const host = parseCdnHost(name);

    return isVideoDeliveryHost(host) &&
      (
        name.includes(".m3u8") ||
        name.includes(".ts") ||
        name.includes(".m4s") ||
        name.includes("/hls/") ||
        name.includes("/vod/")
      );
  }

  function addLog(message) {
    const now = new Date();
    state.logs.unshift(`[${now.toLocaleTimeString()}] ${message}`);
    state.logs = state.logs.slice(0, 80);
  }

  function getStreamKey() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const parts = path.split("/").filter(Boolean);

    if (parts[0] === "videos" && parts[1]) return `vod:${parts[1]}`;
    if (parts[0] === "directory") return `directory:${location.pathname}`;
    if (parts[0]) return `channel:${parts[0].toLowerCase()}`;
    return "home";
  }

  function clearSessionDiagnostics(reason, options = {}) {
    state.network = {
      ...state.network,
      cdnHosts: {},
      recentRequests: []
    };
    state.perfSeen = new Set();
    state.perfSamples = [];
    state.probeSamples = [];
    state.metricHistory = [];
    if (!options.preserveSwitchTracking) {
      state.pendingSwitch = null;
      state.switchHistory = [];
      saveSwitchState();
    }

    const input = document.querySelector("#twitch-diagnostics-console [data-cdn-input]");
    if (input) input.value = "";

    addLog(reason);
  }

  function detectStreamChange() {
    const nextKey = getStreamKey();
    if (!state.streamKey) {
      state.streamKey = nextKey;
      return;
    }

    if (state.streamKey === nextKey) return;

    const previousKey = state.streamKey;
    state.streamKey = nextKey;
    clearSessionDiagnostics(`Stream changed from ${previousKey} to ${nextKey}; cleared CDN diagnostics.`);
    render();
  }

  function loadSwitchState() {
    try {
      state.pendingSwitch = JSON.parse(sessionStorage.getItem(PENDING_SWITCH_KEY) || "null");
      state.switchHistory = JSON.parse(sessionStorage.getItem(SWITCH_HISTORY_KEY) || "[]").slice(0, 10);
    } catch {
      state.pendingSwitch = null;
      state.switchHistory = [];
    }
  }

  function saveSwitchState() {
    sessionStorage.setItem(PENDING_SWITCH_KEY, JSON.stringify(state.pendingSwitch));
    sessionStorage.setItem(SWITCH_HISTORY_KEY, JSON.stringify(state.switchHistory.slice(0, 10)));
  }

  function getVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    return videos.find((video) => video.readyState > 0) || videos[0] || null;
  }

  function getBufferedAhead(video) {
    if (!video || !video.buffered?.length) return null;

    for (let i = 0; i < video.buffered.length; i += 1) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);
      if (video.currentTime >= start && video.currentTime <= end) {
        return end - video.currentTime;
      }
    }

    return 0;
  }

  function getLiveLatency(video) {
    if (!video || !video.seekable?.length) return null;

    const currentTime = video.currentTime;
    if (!Number.isFinite(currentTime)) return null;

    let liveEdge = null;
    let activeRangeStart = null;

    for (let i = 0; i < video.seekable.length; i += 1) {
      const start = video.seekable.start(i);
      const end = video.seekable.end(i);

      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

      if (currentTime >= start && currentTime <= end) {
        activeRangeStart = start;
        liveEdge = end;
        break;
      }

      liveEdge = end;
      activeRangeStart = start;
    }

    if (!Number.isFinite(liveEdge)) {
      const bufferAhead = getBufferedAhead(video);
      return bufferAhead !== null ? Math.max(0, bufferAhead) : null;
    }

    const latency = liveEdge - currentTime;
    const activeWindow = activeRangeStart !== null ? liveEdge - activeRangeStart : null;

    if (!Number.isFinite(latency) || latency < 0) {
      const bufferAhead = getBufferedAhead(video);
      return bufferAhead !== null ? Math.max(0, bufferAhead) : null;
    }

    // Twitch sometimes exposes absolute media timelines. Those produce huge
    // offsets that are not meaningful user-facing live latency values. In that
    // case, show the buffered distance to the current media edge instead.
    if (latency > 300) {
      const bufferAhead = getBufferedAhead(video);
      return bufferAhead !== null ? Math.max(0, bufferAhead) : null;
    }
    if (activeWindow !== null && activeWindow > 0 && latency > activeWindow + 5) return null;

    return latency;
  }

  function getVideoQuality(video) {
    if (!video?.getVideoPlaybackQuality) return null;

    try {
      return video.getVideoPlaybackQuality();
    } catch {
      return null;
    }
  }

  function capturePerformanceEntries() {
    const entries = performance.getEntriesByType("resource").filter(isMediaPerformanceEntry);

    for (const entry of entries) {
      if (state.perfSeen.has(entry.name)) continue;

      state.perfSeen.add(entry.name);
      state.perfSamples.unshift({
        host: safeUrlHost(entry.name),
        url: entry.name,
        durationMs: Math.round(entry.duration || 0),
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
        startTime: Math.round(entry.startTime || 0),
        seenAt: Date.now()
      });
    }

    state.perfSamples = state.perfSamples.slice(0, 120);
  }

  function getDominantCdn() {
    const hosts = getVideoCdnHosts();
    const hostRows = Object.entries(hosts)
      .map(([host, stats]) => ({
        host,
        count: stats.count || 0,
        avgMs: stats.count ? stats.totalMs / stats.count : null,
        lastMs: stats.lastMs,
        lastStatus: stats.lastStatus,
        lastSeen: stats.lastSeen
      }))
      .sort((a, b) => b.count - a.count);

    if (hostRows[0]) return hostRows[0];

    const perfHost = state.perfSamples.find((sample) => isVideoDeliveryHost(sample.host))?.host;
    return perfHost ? { host: perfHost, count: 0, avgMs: null } : null;
  }

  function getVideoCdnHosts() {
    return Object.fromEntries(
      Object.entries(state.network.cdnHosts || {})
        .filter(([host]) => isVideoDeliveryHost(host))
    );
  }

  function getVideoRecentRequests() {
    return (state.network.recentRequests || [])
      .filter((request) => isVideoDeliveryHost(request.host || parseCdnHost(request.url)));
  }

  function getPrimaryDeliveryType(stats) {
    const entries = Object.entries(stats.deliveryTypes || {});
    if (!entries.length) return stats.lastDeliveryType || "unknown";

    return entries
      .sort(([, a], [, b]) => b - a)[0][0];
  }

  function summarizeHostStats(host, stats = null) {
    const source = stats || state.network.cdnHosts?.[host] || {};
    const count = source.count || 0;

    return {
      host: host || "n/a",
      count,
      failures: source.failures || 0,
      avgMs: count ? source.totalMs / count : null,
      lastMs: source.lastMs ?? null,
      lastStatus: source.lastStatus ?? null,
      lastSeen: source.lastSeen ?? null
    };
  }

  function updateSwitchTracking(diagnostics) {
    const pending = state.pendingSwitch;
    const currentHost = diagnostics.cdn.dominant?.host;

    if (!pending) return false;

    if (Date.now() - pending.startedAt > 10 * 60 * 1000) {
      state.pendingSwitch = null;
      addLog("CDN switch tracking expired before a new CDN was detected.");
      saveSwitchState();
      return true;
    }

    if (!currentHost || currentHost === pending.old.host) return false;

    const nextStats = summarizeHostStats(currentHost);
    const avgDelta = pending.old.avgMs !== null && nextStats.avgMs !== null
      ? nextStats.avgMs - pending.old.avgMs
      : null;
    const lastDelta = pending.old.lastMs !== null && nextStats.lastMs !== null
      ? nextStats.lastMs - pending.old.lastMs
      : null;

    state.switchHistory.unshift({
      old: pending.old,
      new: nextStats,
      avgDelta,
      lastDelta,
      switchedAt: Date.now()
    });
    state.switchHistory = state.switchHistory.slice(0, 10);
    state.pendingSwitch = null;
    addLog(`CDN switched from ${pending.old.host} to ${nextStats.host}.`);
    saveSwitchState();
    return true;
  }

  function getResponsivenessSummary() {
    const dominant = getDominantCdn();
    const samples = [
      ...Object.values(getVideoCdnHosts())
        .filter((stats) => stats.lastMs !== null && stats.lastMs !== undefined)
        .map((stats) => stats.lastMs),
      ...state.probeSamples.map((sample) => sample.durationMs)
    ].filter((value) => Number.isFinite(value));

    if (!samples.length) return { label: "n/a", status: "warn", dominant };

    const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const status = avg < 250 && p95 < 650 ? "good" : avg < 600 && p95 < 1200 ? "warn" : "bad";

    return {
      label: `${Math.round(avg)} ms avg / ${Math.round(p95)} ms p95`,
      status,
      dominant
    };
  }

  function getBandwidthEstimate() {
    const now = Date.now();
    const recentNetwork = getVideoRecentRequests().filter((sample) => now - sample.endedAt < 30000);
    const networkBytes = recentNetwork.reduce((sum, sample) => sum + (sample.bytes || 0), 0);

    if (networkBytes > 0) return networkBytes / 30;

    const recent = state.perfSamples.filter((sample) => now - sample.seenAt < 30000 && isVideoDeliveryHost(sample.host));
    const totalBytes = recent.reduce((sum, sample) => sum + (sample.transferSize || sample.encodedBodySize || sample.decodedBodySize || 0), 0);

    return totalBytes > 0 ? totalBytes / 30 : null;
  }

  function getLatestResponseMs() {
    const latest = getVideoRecentRequests()
      .find((sample) => Number.isFinite(sample.durationMs));

    return latest?.durationMs ?? null;
  }

  function addMetricSample(diagnostics) {
    const latestTotalFrames = diagnostics.playback.totalVideoFrames;
    const latestDroppedFrames = diagnostics.playback.droppedVideoFrames;
    const previous = state.metricHistory[state.metricHistory.length - 1];
    let droppedDelta = null;

    if (
      previous &&
      Number.isFinite(latestTotalFrames) &&
      Number.isFinite(latestDroppedFrames) &&
      Number.isFinite(previous.totalFrames) &&
      Number.isFinite(previous.droppedFrames)
    ) {
      const frameDelta = latestTotalFrames - previous.totalFrames;
      const dropFrameDelta = latestDroppedFrames - previous.droppedFrames;
      droppedDelta = frameDelta > 0 ? (dropFrameDelta / frameDelta) * 100 : 0;
    }

    state.metricHistory.push({
      t: Date.now(),
      buffer: diagnostics.playback.bufferAhead,
      latency: diagnostics.playback.liveLatency,
      responseMs: getLatestResponseMs(),
      throughputMbps: diagnostics.performance.estimatedRecentThroughput
        ? (diagnostics.performance.estimatedRecentThroughput * 8) / 1_000_000
        : null,
      droppedPct: droppedDelta,
      totalFrames: latestTotalFrames,
      droppedFrames: latestDroppedFrames
    });

    state.metricHistory = state.metricHistory.slice(-90);
  }

  function getDiagnostics() {
    capturePerformanceEntries();

    const video = getVideo();
    const quality = getVideoQuality(video);
    const responsiveness = getResponsivenessSummary();
    const dropped = quality ? quality.droppedVideoFrames : null;
    const total = quality ? quality.totalVideoFrames : null;
    const droppedPct = total ? ((dropped / total) * 100).toFixed(2) : null;

    const recentVideoRequests = getVideoRecentRequests();
    const recentUrl = recentVideoRequests[0]?.url ||
      state.perfSamples.find((sample) => isVideoDeliveryHost(sample.host))?.url ||
      responsiveness.dominant?.host;

    return {
      page: {
        url: location.href,
        title: document.title,
        capturedAt: new Date().toISOString()
      },
      playback: {
        foundVideo: Boolean(video),
        paused: video ? video.paused : null,
        readyState: video ? video.readyState : null,
        networkState: video ? video.networkState : null,
        currentTime: video ? video.currentTime : null,
        duration: video ? video.duration : null,
        playbackRate: video ? video.playbackRate : null,
        bufferAhead: getBufferedAhead(video),
        liveLatency: getLiveLatency(video),
        droppedVideoFrames: dropped,
        totalVideoFrames: total,
        droppedFramePercent: droppedPct
      },
      network: state.network,
      performance: {
        recentMediaEntries: state.perfSamples.slice(0, 40),
        estimatedRecentThroughput: getBandwidthEstimate()
      },
      cdn: {
        dominant: responsiveness.dominant,
        responsiveness: responsiveness.label,
        edge: getCdnEdgeDetails(recentUrl || responsiveness.dominant?.host),
        status: responsiveness.status,
        probes: state.probeSamples.slice(0, 20),
        avoidedCdns: state.network.avoidedCdns || {},
        pendingSwitch: state.pendingSwitch,
        switchHistory: state.switchHistory.slice(0, 10)
      },
      logs: state.logs.slice(0, 40)
    };
  }

  function statusClass(diagnostics) {
    if (!diagnostics.playback.foundVideo) return "tdc-status-warn";
    if (diagnostics.playback.bufferAhead !== null && diagnostics.playback.bufferAhead < 2) return "tdc-status-bad";
    if (diagnostics.cdn.status === "bad") return "tdc-status-bad";
    if (diagnostics.playback.bufferAhead !== null && diagnostics.playback.bufferAhead < 6) return "tdc-status-warn";
    if (diagnostics.cdn.status === "warn") return "tdc-status-warn";
    return "tdc-status-good";
  }

  function createPanel() {
    if (document.getElementById(SELECTORS.root)) return;

    const root = document.createElement("section");
    root.id = SELECTORS.root;
    root.innerHTML = `
      <div class="tdc-header" data-drag-handle>
        <span class="tdc-status" data-status></span>
        <div class="tdc-title">Twitch Diagnostics</div>
        <button class="tdc-icon-button" type="button" data-compact title="Compact view">-</button>
        <button class="tdc-icon-button" type="button" data-close title="Hide console">x</button>
      </div>
      <div class="tdc-body">
        <div class="tdc-grid">
          <div class="tdc-card">
            <div class="tdc-label">Buffer Ahead</div>
            <div class="tdc-value" data-buffer>n/a</div>
          </div>
          <div class="tdc-card">
            <div class="tdc-label">CDN Responsiveness</div>
            <div class="tdc-value" data-responsiveness>n/a</div>
          </div>
          <div class="tdc-card tdc-card-wide">
            <div class="tdc-label">Connected CDN</div>
            <div class="tdc-value" data-cdn>n/a</div>
          </div>
          <div class="tdc-card tdc-card-wide">
            <div class="tdc-label">Current Edge</div>
            <div class="tdc-value" data-cdn-edge>n/a</div>
          </div>
          <div class="tdc-card">
            <div class="tdc-label">Live Latency</div>
            <div class="tdc-value" data-latency>n/a</div>
          </div>
          <div class="tdc-card">
            <div class="tdc-label">Dropped Frames</div>
            <div class="tdc-value" data-drops>n/a</div>
          </div>
          <div class="tdc-card">
            <div class="tdc-label">Recent Throughput</div>
            <div class="tdc-value" data-throughput>n/a</div>
          </div>
          <div class="tdc-card">
            <div class="tdc-label">Playback State</div>
            <div class="tdc-value" data-playback>n/a</div>
          </div>
        </div>
        <div class="tdc-tools">
          <button class="tdc-button" type="button" data-probe>Probe CDN</button>
          <button class="tdc-button tdc-danger" type="button" data-avoid-cdn>Renegotiate CDN</button>
          <button class="tdc-button" type="button" data-client-chrome>Try Chrome Client</button>
          <button class="tdc-button" type="button" data-client-reset>Reset Client</button>
          <button class="tdc-button" type="button" data-toggle-graphs>Show Graphs</button>
          <button class="tdc-button" type="button" data-clear-avoids>Clear Avoids</button>
          <button class="tdc-button" type="button" data-copy>Copy JSON</button>
          <button class="tdc-button" type="button" data-export>Download JSON</button>
          <button class="tdc-button" type="button" data-clear>Clear</button>
        </div>
        <div class="tdc-manual">
          <input class="tdc-input" type="text" data-cdn-input placeholder="Paste Twitch segment URL or CDN host">
          <button class="tdc-button tdc-danger" type="button" data-avoid-entered-cdn>Hard Block Entered CDN</button>
        </div>
        <div class="tdc-card">
          <div class="tdc-label">Avoided CDNs</div>
          <div class="tdc-value" data-avoided-cdns>none</div>
        </div>
        <div class="tdc-card" style="margin-top: 8px;">
          <div class="tdc-label">CDN Switch Comparison</div>
          <div class="tdc-switch" data-switch-summary>Run Avoid CDN + Reload to compare old vs new CDN stats.</div>
          <table class="tdc-table">
            <thead>
              <tr>
                <th>CDN</th>
                <th>Avg</th>
                <th>Last</th>
                <th>Req</th>
                <th>Fail</th>
              </tr>
            </thead>
            <tbody data-switch-table>
              <tr><td colspan="5" class="tdc-muted">No switch captured yet.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="tdc-card tdc-graphs tdc-hidden-section" data-graphs>
          <div class="tdc-label">Rolling Graphs</div>
          <div class="tdc-chart-grid">
            <div>
              <div class="tdc-chart-title">Buffer ahead</div>
              <svg class="tdc-chart" data-chart-buffer viewBox="0 0 220 72" preserveAspectRatio="none"></svg>
            </div>
            <div>
              <div class="tdc-chart-title">CDN response</div>
              <svg class="tdc-chart" data-chart-response viewBox="0 0 220 72" preserveAspectRatio="none"></svg>
            </div>
            <div>
              <div class="tdc-chart-title">Throughput</div>
              <svg class="tdc-chart" data-chart-throughput viewBox="0 0 220 72" preserveAspectRatio="none"></svg>
            </div>
            <div>
              <div class="tdc-chart-title">Dropped frames</div>
              <svg class="tdc-chart" data-chart-drops viewBox="0 0 220 72" preserveAspectRatio="none"></svg>
            </div>
          </div>
        </div>
        <div class="tdc-optional">
          <div class="tdc-card">
            <div class="tdc-label">CDN Requests</div>
            <table class="tdc-table">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Serving</th>
                  <th>Count</th>
                  <th>Last</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody data-cdn-table></tbody>
            </table>
          </div>
          <div class="tdc-card" style="margin-top: 8px;">
            <div class="tdc-label">Event Log</div>
            <div class="tdc-log" data-log></div>
          </div>
        </div>
      </div>
    `;

    document.documentElement.appendChild(root);
    bindPanel(root);
    addLog("Diagnostics console loaded. Toggle with Alt+Shift+D.");
  }

  function bindPanel(root) {
    root.querySelector("[data-close]").addEventListener("click", () => {
      state.visible = false;
      render();
    });

    root.querySelector("[data-compact]").addEventListener("click", () => {
      state.compact = !state.compact;
      render();
    });

    root.querySelector("[data-clear]").addEventListener("click", () => {
      state.network = { ...state.network, cdnHosts: {}, recentRequests: [] };
      state.perfSamples = [];
      state.perfSeen = new Set();
      state.probeSamples = [];
      state.logs = [];
      addLog("Diagnostics history cleared.");
      render();
    });

    root.querySelector("[data-copy]").addEventListener("click", async () => {
      const payload = JSON.stringify(getDiagnostics(), null, 2);
      await navigator.clipboard.writeText(payload);
      addLog("Diagnostics JSON copied to clipboard.");
      render();
    });

    root.querySelector("[data-export]").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(getDiagnostics(), null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `twitch-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      link.click();
      URL.revokeObjectURL(url);
      addLog("Diagnostics JSON downloaded.");
      render();
    });

    root.querySelector("[data-probe]").addEventListener("click", async () => {
      await probeCdn();
      render();
    });

    root.querySelector("[data-avoid-cdn]").addEventListener("click", async () => {
      await renegotiateCdn();
    });

    root.querySelector("[data-avoid-entered-cdn]").addEventListener("click", async () => {
      const input = root.querySelector("[data-cdn-input]");
      await avoidSpecificCdn(input?.value || "");
    });

    root.querySelector("[data-clear-avoids]").addEventListener("click", async () => {
      await clearAvoidedCdns();
      render();
    });

    root.querySelector("[data-client-chrome]").addEventListener("click", async () => {
      await setClientProfile("chrome-windows");
    });

    root.querySelector("[data-client-reset]").addEventListener("click", async () => {
      await setClientProfile("default");
    });

    root.querySelector("[data-toggle-graphs]").addEventListener("click", () => {
      state.graphsVisible = !state.graphsVisible;
      render();
    });

    makeDraggable(root);
  }

  function makeDraggable(root) {
    const handle = root.querySelector("[data-drag-handle]");
    let start = null;

    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = root.getBoundingClientRect();
      start = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top
      };
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", (event) => {
      if (!start || event.pointerId !== start.pointerId) return;
      const left = Math.max(0, Math.min(window.innerWidth - root.offsetWidth, start.left + event.clientX - start.x));
      const top = Math.max(0, Math.min(window.innerHeight - 48, start.top + event.clientY - start.y));

      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
    });

    handle.addEventListener("pointerup", () => {
      start = null;
    });
  }

  async function probeCdn() {
    const diagnostics = getDiagnostics();
    const candidate = getVideoRecentRequests()[0]?.url ||
      diagnostics.performance.recentMediaEntries[0]?.url;

    if (!candidate) {
      addLog("No CDN URL available to probe yet. Start playback and try again.");
      return;
    }

    const startedAt = performance.now();
    try {
      await fetch(candidate, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        credentials: "omit"
      });
      const durationMs = Math.round(performance.now() - startedAt);
      state.probeSamples.unshift({
        host: safeUrlHost(candidate),
        durationMs,
        ok: true,
        testedAt: Date.now()
      });
      addLog(`CDN probe completed in ${durationMs} ms for ${safeUrlHost(candidate)}.`);
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      state.probeSamples.unshift({
        host: safeUrlHost(candidate),
        durationMs,
        ok: false,
        error: error.message,
        testedAt: Date.now()
      });
      addLog(`CDN probe failed after ${durationMs} ms: ${error.message}`);
    }

    state.probeSamples = state.probeSamples.slice(0, 30);
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        if (globalThis.browser?.runtime?.sendMessage) {
          api.runtime.sendMessage(message).then(resolve).catch(reject);
          return;
        }

        api.runtime.sendMessage(message, (response) => {
          const error = api.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function avoidCurrentCdn() {
    const diagnostics = getDiagnostics();
    const host = diagnostics.cdn.dominant?.host || parseCdnHost(getVideoRecentRequests()[0]?.url);

    await avoidSpecificCdn(host);
  }

  async function renegotiateCdn() {
    const diagnostics = getDiagnostics();
    const host = diagnostics.cdn.dominant?.host || parseCdnHost(getVideoRecentRequests()[0]?.url);

    if (host) {
      state.pendingSwitch = {
        old: summarizeHostStats(host),
        oldEdge: getCdnEdgeDetails(host),
        startedAt: Date.now(),
        url: location.href
      };
      saveSwitchState();
    }

    await clearAvoidedCdns();
    clearSessionDiagnostics("Forcing clean Twitch player negotiation without blocking the current CDN.", {
      preserveSwitchTracking: Boolean(host)
    });
    addLog("Reloading Twitch. If the same CDN returns, try Chrome Client, then Renegotiate CDN again.");
    window.setTimeout(() => location.reload(), 500);
  }

  async function setClientProfile(profile) {
    const response = await sendRuntimeMessage({
      type: "TWITCH_DIAGNOSTICS_SET_CLIENT_PROFILE",
      profile
    });

    if (!response?.ok) {
      addLog(`Could not set client profile: ${response?.error || "unknown error"}`);
      render();
      return;
    }

    addLog(response.profile === "chrome-windows"
      ? "Applied experimental Chrome-like client profile to Twitch playlist requests. Reloading."
      : "Reset Twitch playlist client profile. Reloading.");
    window.setTimeout(() => location.reload(), 500);
  }

  async function avoidSpecificCdn(input) {
    const host = parseCdnHost(input);

    if (!host) {
      addLog("No CDN host found. Start playback or paste a Twitch segment URL from the network panel.");
      render();
      return;
    }

    if (!isVideoDeliveryHost(host)) {
      addLog(`${host} looks like a static asset CDN, not a Twitch video segment CDN. Not blocking it.`);
      render();
      return;
    }

    const edge = getCdnEdgeDetails(input || host);
    addLog(`Avoiding ${host} for 5 minutes and reloading Twitch.`);
    state.pendingSwitch = {
      old: summarizeHostStats(host),
      oldEdge: edge,
      startedAt: Date.now(),
      url: location.href
    };
    saveSwitchState();

    const response = await sendRuntimeMessage({
      type: "TWITCH_DIAGNOSTICS_AVOID_CDN",
      host,
      minutes: 5
    });

    if (!response?.ok) {
      addLog(`Could not avoid CDN: ${response?.error || "unknown error"}`);
      render();
      return;
    }

    state.network.avoidedCdns = {
      ...(state.network.avoidedCdns || {}),
      [host]: response.rule
    };
    render();
    window.setTimeout(() => location.reload(), 700);
  }

  async function clearAvoidedCdns() {
    const response = await sendRuntimeMessage({
      type: "TWITCH_DIAGNOSTICS_CLEAR_AVOIDED_CDNS"
    });

    if (!response?.ok) {
      addLog(`Could not clear CDN avoids: ${response?.error || "unknown error"}`);
      return;
    }

    state.network.avoidedCdns = response.avoidedCdns || {};
    addLog("Cleared avoided CDN rules.");
  }

  function setText(root, selector, value) {
    const node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function renderCdnTable(root, diagnostics) {
    const table = root.querySelector("[data-cdn-table]");
    if (!table) return;

    const rows = Object.entries(getVideoCdnHosts())
      .sort(([, a], [, b]) => (b.count || 0) - (a.count || 0))
      .slice(0, 8)
      .map(([host, stats]) => `
        <tr>
          <td>${host}</td>
          <td>${getPrimaryDeliveryType(stats)}</td>
          <td>${stats.count || 0}</td>
          <td>${fmtMs(stats.lastMs)}</td>
          <td>${stats.lastStatus || stats.error || "n/a"}</td>
        </tr>
      `)
      .join("");

    table.innerHTML = rows || `<tr><td colspan="5" class="tdc-muted">Waiting for Twitch media requests...</td></tr>`;
  }

  function fmtDelta(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
    const rounded = Math.round(value);
    if (rounded === 0) return "0 ms";
    return `${rounded > 0 ? "+" : ""}${rounded} ms`;
  }

  function renderSwitchComparison(root, diagnostics) {
    const summary = root.querySelector("[data-switch-summary]");
    const table = root.querySelector("[data-switch-table]");
    if (!summary || !table) return;

    const latest = diagnostics.cdn.switchHistory[0];

    if (!latest && diagnostics.cdn.pendingSwitch) {
      const old = diagnostics.cdn.pendingSwitch.old;
      summary.textContent = `Waiting for a new CDN after avoiding ${old.host}. Old CDN avg ${fmtMs(old.avgMs)}, last ${fmtMs(old.lastMs)}, ${old.count} requests, ${old.failures} failures.`;
      table.innerHTML = `
        <tr>
          <td>old: ${old.host}</td>
          <td>${fmtMs(old.avgMs)}</td>
          <td>${fmtMs(old.lastMs)}</td>
          <td>${old.count}</td>
          <td>${old.failures}</td>
        </tr>
        <tr><td colspan="5" class="tdc-muted">Reloading or waiting for Twitch to negotiate another CDN...</td></tr>
      `;
      return;
    }

    if (!latest) {
      summary.textContent = "Run Avoid CDN + Reload to compare old vs new CDN stats.";
      table.innerHTML = `<tr><td colspan="5" class="tdc-muted">No switch captured yet.</td></tr>`;
      return;
    }

    const avgWord = latest.avgDelta !== null && latest.avgDelta < 0 ? "faster" : "slower";
    const lastWord = latest.lastDelta !== null && latest.lastDelta < 0 ? "faster" : "slower";
    summary.textContent = `Switched ${latest.old.host} -> ${latest.new.host}. Avg changed ${fmtDelta(latest.avgDelta)} (${avgWord}); latest response changed ${fmtDelta(latest.lastDelta)} (${lastWord}).`;
    table.innerHTML = `
      <tr>
        <td>old: ${latest.old.host}</td>
        <td>${fmtMs(latest.old.avgMs)}</td>
        <td>${fmtMs(latest.old.lastMs)}</td>
        <td>${latest.old.count}</td>
        <td>${latest.old.failures}</td>
      </tr>
      <tr>
        <td>new: ${latest.new.host}</td>
        <td>${fmtMs(latest.new.avgMs)}</td>
        <td>${fmtMs(latest.new.lastMs)}</td>
        <td>${latest.new.count}</td>
        <td>${latest.new.failures}</td>
      </tr>
    `;
  }

  function chartPath(samples, key, maxHint = null) {
    const values = samples
      .map((sample) => sample[key])
      .filter((value) => Number.isFinite(value));

    if (!values.length) return "";

    const max = Math.max(maxHint || 0, ...values, 1);
    const min = 0;
    const width = 220;
    const height = 72;
    const lastSamples = samples.slice(-60);

    return lastSamples
      .map((sample, index) => {
        const raw = Number.isFinite(sample[key]) ? sample[key] : null;
        const x = lastSamples.length === 1 ? width : (index / (lastSamples.length - 1)) * width;
        const y = raw === null ? height : height - ((raw - min) / (max - min)) * (height - 8) - 4;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${Math.max(4, Math.min(height - 4, y)).toFixed(1)}`;
      })
      .join(" ");
  }

  function renderChart(svg, samples, key, color, maxHint = null) {
    if (!svg) return;

    const path = chartPath(samples, key, maxHint);
    if (!path) {
      svg.innerHTML = `<text x="110" y="39" text-anchor="middle" class="tdc-chart-empty">waiting</text>`;
      return;
    }

    svg.innerHTML = `
      <line x1="0" y1="68" x2="220" y2="68" class="tdc-chart-axis"></line>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.4" vector-effect="non-scaling-stroke"></path>
    `;
  }

  function renderGraphs(root) {
    const graphs = root.querySelector("[data-graphs]");
    const toggle = root.querySelector("[data-toggle-graphs]");
    if (!graphs || !toggle) return;

    graphs.classList.toggle("tdc-hidden-section", !state.graphsVisible);
    toggle.textContent = state.graphsVisible ? "Hide Graphs" : "Show Graphs";

    if (!state.graphsVisible) return;

    renderChart(root.querySelector("[data-chart-buffer]"), state.metricHistory, "buffer", "#22c55e", 30);
    renderChart(root.querySelector("[data-chart-response]"), state.metricHistory, "responseMs", "#60a5fa", 1000);
    renderChart(root.querySelector("[data-chart-throughput]"), state.metricHistory, "throughputMbps", "#f59e0b", 8);
    renderChart(root.querySelector("[data-chart-drops]"), state.metricHistory, "droppedPct", "#ef4444", 10);
  }

  function render() {
    const root = document.getElementById(SELECTORS.root);
    if (!root) return;

    let diagnostics = getDiagnostics();
    if (updateSwitchTracking(diagnostics)) {
      diagnostics = getDiagnostics();
    }
    addMetricSample(diagnostics);
    const cdnHost = diagnostics.cdn.dominant?.host || "n/a";
    const playbackState = diagnostics.playback.foundVideo
      ? `${diagnostics.playback.paused ? "paused" : "playing"} / ready ${diagnostics.playback.readyState}`
      : "no video";

    root.classList.toggle("tdc-hidden", !state.visible);
    root.classList.toggle("tdc-compact", state.compact);

    const status = root.querySelector("[data-status]");
    status.className = `tdc-status ${statusClass(diagnostics)}`;

    setText(root, "[data-buffer]", fmtSeconds(diagnostics.playback.bufferAhead));
    setText(root, "[data-responsiveness]", diagnostics.cdn.responsiveness);
    setText(root, "[data-cdn]", cdnHost);
    setText(root, "[data-cdn-edge]", formatEdgeDetails(diagnostics.cdn.edge));
    setText(root, "[data-avoided-cdns]", formatAvoidedCdns(diagnostics.cdn.avoidedCdns));
    setText(root, "[data-latency]", fmtSeconds(diagnostics.playback.liveLatency));
    setText(root, "[data-drops]", diagnostics.playback.totalVideoFrames ? `${diagnostics.playback.droppedVideoFrames} / ${diagnostics.playback.droppedFramePercent}%` : "n/a");
    setText(root, "[data-throughput]", fmtBitrate(diagnostics.performance.estimatedRecentThroughput));
    setText(root, "[data-playback]", playbackState);
    setText(root, "[data-log]", state.logs.join("\n"));
    renderCdnTable(root, diagnostics);
    renderSwitchComparison(root, diagnostics);
    renderGraphs(root);
  }

  function togglePanel() {
    state.visible = !state.visible;
    render();
  }

  function formatAvoidedCdns(avoidedCdns) {
    const entries = Object.values(avoidedCdns || {});
    if (!entries.length) return "none";

    return entries
      .map((entry) => {
        const remainingMs = Math.max(0, entry.expiresAt - Date.now());
        const remainingMin = Math.ceil(remainingMs / 60000);
        return `${entry.host} (${remainingMin}m)`;
      })
      .join(", ");
  }

  function formatEdgeDetails(edge) {
    if (!edge?.host || edge.host === "n/a") return "n/a";
    return `${edge.provider} / ${edge.role} / edge ${edge.edgeId} / region ${edge.region}`;
  }

  function connectBackground() {
    try {
      if (globalThis.browser?.runtime?.sendMessage) {
        api.runtime.sendMessage({ type: "TWITCH_DIAGNOSTICS_GET_NETWORK" })
          .then((response) => {
      if (response) {
        state.network = {
          ...response,
          avoidedCdns: response.avoidedCdns || {}
        };
        render();
      }
          })
          .catch(() => {});
      } else {
        api.runtime.sendMessage({ type: "TWITCH_DIAGNOSTICS_GET_NETWORK" }, (response) => {
            if (response) {
              state.network = {
                ...response,
                avoidedCdns: response.avoidedCdns || {}
              };
              render();
            }
        });
      }
    } catch {
      // The overlay still works from page performance data if background messaging is unavailable.
    }

    api.runtime.onMessage.addListener((message) => {
      if (message?.type === "TWITCH_DIAGNOSTICS_TOGGLE_PANEL") {
        togglePanel();
      }

      if (message?.type === "TWITCH_DIAGNOSTICS_NETWORK_SAMPLE") {
        state.network = {
          ...state.network,
          ...message.payload,
          avoidedCdns: state.network.avoidedCdns || {}
        };
        render();
      }
    });
  }

  function installStreamChangeWatcher() {
    state.streamKey = getStreamKey();

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      window.setTimeout(detectStreamChange, 0);
      return result;
    };

    history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      window.setTimeout(detectStreamChange, 0);
      return result;
    };

    window.addEventListener("popstate", () => {
      window.setTimeout(detectStreamChange, 0);
    });

    window.setInterval(detectStreamChange, 1500);
  }

  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      state.visible = !state.visible;
      render();
    }
  });

  loadSwitchState();
  createPanel();
  connectBackground();
  installStreamChangeWatcher();
  window.setInterval(render, 1000);
})();
