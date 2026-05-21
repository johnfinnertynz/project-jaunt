(() => {
  const api = globalThis.browser || globalThis.chrome;
  const state = {
    visible: true,
    compact: false,
    graphsVisible: false,
    network: {
      cdnHosts: {},
      recentRequests: []
    },
    perfSeen: new Set(),
    perfSamples: [],
    metricHistory: [],
    logs: [],
    streamKey: ""
  };

  const ROOT_ID = "twitch-diagnostics-console";

  function fmtMs(value) {
    return Number.isFinite(value) ? `${Math.round(value)} ms` : "n/a";
  }

  function fmtSeconds(value) {
    return Number.isFinite(value) ? `${Math.max(0, value).toFixed(1)} s` : "n/a";
  }

  function fmtBitrate(bytesPerSecond) {
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "n/a";
    return `${((bytesPerSecond * 8) / 1_000_000).toFixed(2)} Mbps`;
  }

  function safeHost(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  function isVideoDeliveryHost(host) {
    return Boolean(host) &&
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

  function addLog(message) {
    state.logs.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
    state.logs = state.logs.slice(0, 120);
  }

  function getVideo() {
    const videos = Array.from(document.querySelectorAll("video"));
    return videos.find((video) => video.readyState > 0) || videos[0] || null;
  }

  function getBufferedAhead(video) {
    if (!video?.buffered?.length || !Number.isFinite(video.currentTime)) return null;

    for (let i = 0; i < video.buffered.length; i += 1) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);
      if (video.currentTime >= start && video.currentTime <= end) {
        return end - video.currentTime;
      }
    }

    return 0;
  }

  function getLiveEdgeGap(video) {
    if (!video) return null;
    const bufferAhead = getBufferedAhead(video);
    if (Number.isFinite(bufferAhead)) return bufferAhead;
    if (!video.seekable?.length || !Number.isFinite(video.currentTime)) return null;

    const end = video.seekable.end(video.seekable.length - 1);
    const gap = end - video.currentTime;
    return Number.isFinite(gap) && gap >= 0 && gap < 300 ? gap : null;
  }

  function getPlaybackQuality(video) {
    try {
      return video?.getVideoPlaybackQuality?.() || null;
    } catch {
      return null;
    }
  }

  function isMediaPerformanceEntry(entry) {
    const url = entry.name || "";
    const host = safeHost(url);
    return isVideoDeliveryHost(host) &&
      (url.includes(".m3u8") || url.includes(".ts") || url.includes(".m4s") || url.includes("/hls/") || url.includes("/vod/"));
  }

  function capturePerformanceEntries() {
    for (const entry of performance.getEntriesByType("resource").filter(isMediaPerformanceEntry)) {
      if (state.perfSeen.has(entry.name)) continue;

      state.perfSeen.add(entry.name);
      state.perfSamples.unshift({
        host: safeHost(entry.name),
        url: entry.name,
        durationMs: Math.round(entry.duration || 0),
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
        seenAt: Date.now()
      });
    }

    state.perfSamples = state.perfSamples.slice(0, 120);
  }

  function getVideoCdnHosts() {
    return Object.fromEntries(
      Object.entries(state.network.cdnHosts || {})
        .filter(([host]) => isVideoDeliveryHost(host))
    );
  }

  function getVideoRequests() {
    return (state.network.recentRequests || [])
      .filter((request) => isVideoDeliveryHost(request.host || safeHost(request.url)));
  }

  function getDominantCdn() {
    const rows = Object.entries(getVideoCdnHosts())
      .map(([host, stats]) => ({
        host,
        count: stats.count || 0,
        avgMs: stats.count ? stats.totalMs / stats.count : null,
        lastMs: stats.lastMs,
        lastStatus: stats.lastStatus
      }))
      .sort((a, b) => b.count - a.count);

    if (rows[0]) return rows[0];

    const perfHost = state.perfSamples.find((sample) => isVideoDeliveryHost(sample.host))?.host;
    return perfHost ? { host: perfHost, count: 0, avgMs: null, lastMs: null } : null;
  }

  function getResponsiveness() {
    const samples = Object.values(getVideoCdnHosts())
      .map((stats) => stats.lastMs)
      .filter(Number.isFinite);

    if (!samples.length) return "n/a";
    const avg = samples.reduce((sum, item) => sum + item, 0) / samples.length;
    const sorted = [...samples].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    return `${Math.round(avg)} ms avg / ${Math.round(p95)} ms p95`;
  }

  function getThroughput() {
    const now = Date.now();
    const networkBytes = getVideoRequests()
      .filter((request) => now - request.endedAt < 30000)
      .reduce((sum, request) => sum + (request.bytes || 0), 0);

    if (networkBytes > 0) return networkBytes / 30;

    const perfBytes = state.perfSamples
      .filter((sample) => now - sample.seenAt < 30000)
      .reduce((sum, sample) => sum + (sample.transferSize || sample.encodedBodySize || sample.decodedBodySize || 0), 0);

    return perfBytes > 0 ? perfBytes / 30 : null;
  }

  function getPrimaryDeliveryType(stats) {
    return Object.entries(stats.deliveryTypes || {})
      .sort(([, a], [, b]) => b - a)[0]?.[0] || stats.lastDeliveryType || "unknown";
  }

  function getDiagnostics() {
    capturePerformanceEntries();

    const video = getVideo();
    const quality = getPlaybackQuality(video);
    const dominant = getDominantCdn();
    const dropped = quality?.droppedVideoFrames ?? null;
    const total = quality?.totalVideoFrames ?? null;

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
        bufferAhead: getBufferedAhead(video),
        liveEdgeGap: getLiveEdgeGap(video),
        droppedVideoFrames: dropped,
        totalVideoFrames: total,
        droppedFramePercent: total ? ((dropped / total) * 100).toFixed(2) : null
      },
      cdn: {
        dominant,
        responsiveness: getResponsiveness(),
        hosts: getVideoCdnHosts(),
        recentRequests: getVideoRequests().slice(0, 80)
      },
      performance: {
        estimatedRecentThroughput: getThroughput(),
        recentMediaEntries: state.perfSamples.slice(0, 40)
      },
      logs: state.logs.slice(0, 80)
    };
  }

  function statusClass(diagnostics) {
    if (!diagnostics.playback.foundVideo) return "tdc-status-warn";
    if (Number.isFinite(diagnostics.playback.bufferAhead) && diagnostics.playback.bufferAhead < 2) return "tdc-status-bad";
    if (Number.isFinite(diagnostics.playback.bufferAhead) && diagnostics.playback.bufferAhead < 6) return "tdc-status-warn";
    return "tdc-status-good";
  }

  function getStreamKey() {
    const parts = location.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts[0] === "videos" && parts[1]) return `vod:${parts[1]}`;
    if (parts[0]) return `channel:${parts[0].toLowerCase()}`;
    return "home";
  }

  function clearSession(reason = "Diagnostics cleared.") {
    state.network = { cdnHosts: {}, recentRequests: [] };
    state.perfSeen = new Set();
    state.perfSamples = [];
    state.metricHistory = [];
    state.logs = [];
    addLog(reason);
  }

  function detectStreamChange() {
    const next = getStreamKey();
    if (!state.streamKey) {
      state.streamKey = next;
      return;
    }

    if (state.streamKey !== next) {
      const previous = state.streamKey;
      state.streamKey = next;
      clearSession(`Stream changed from ${previous} to ${next}; reset diagnostics.`);
      render();
    }
  }

  function createPanel() {
    if (document.getElementById(ROOT_ID)) return;

    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="tdc-header" data-drag-handle>
        <span class="tdc-status" data-status></span>
        <div class="tdc-title">Twitch Diagnostics</div>
        <button class="tdc-icon-button" type="button" data-compact title="Compact view">-</button>
        <button class="tdc-icon-button" type="button" data-close title="Hide console">x</button>
      </div>
      <div class="tdc-body">
        <div class="tdc-grid">
          <div class="tdc-card"><div class="tdc-label">Buffer Ahead</div><div class="tdc-value" data-buffer>n/a</div></div>
          <div class="tdc-card"><div class="tdc-label">CDN Responsiveness</div><div class="tdc-value" data-responsiveness>n/a</div></div>
          <div class="tdc-card tdc-card-wide"><div class="tdc-label">Connected CDN</div><div class="tdc-value" data-cdn>n/a</div></div>
          <div class="tdc-card"><div class="tdc-label">Live Edge Gap</div><div class="tdc-value" data-latency>n/a</div></div>
          <div class="tdc-card"><div class="tdc-label">Dropped Frames</div><div class="tdc-value" data-drops>n/a</div></div>
          <div class="tdc-card"><div class="tdc-label">Recent Throughput</div><div class="tdc-value" data-throughput>n/a</div></div>
          <div class="tdc-card"><div class="tdc-label">Playback State</div><div class="tdc-value" data-playback>n/a</div></div>
        </div>
        <div class="tdc-tools">
          <button class="tdc-button" type="button" data-toggle-graphs>Show Graphs</button>
          <button class="tdc-button" type="button" data-copy>Copy JSON</button>
          <button class="tdc-button" type="button" data-export>Download JSON</button>
          <button class="tdc-button" type="button" data-clear>Clear</button>
        </div>
        <div class="tdc-card tdc-graphs tdc-hidden-section" data-graphs>
          <div class="tdc-label">Rolling Graphs</div>
          <div class="tdc-chart-grid">
            <div><div class="tdc-chart-title">Buffer ahead</div><svg class="tdc-chart" data-chart-buffer viewBox="0 0 220 72" preserveAspectRatio="none"></svg><div class="tdc-chart-readout" data-readout-buffer>hover for value</div></div>
            <div><div class="tdc-chart-title">CDN response</div><svg class="tdc-chart" data-chart-response viewBox="0 0 220 72" preserveAspectRatio="none"></svg><div class="tdc-chart-readout" data-readout-response>hover for value</div></div>
            <div><div class="tdc-chart-title">Throughput</div><svg class="tdc-chart" data-chart-throughput viewBox="0 0 220 72" preserveAspectRatio="none"></svg><div class="tdc-chart-readout" data-readout-throughput>hover for value</div></div>
            <div><div class="tdc-chart-title">Dropped frames</div><svg class="tdc-chart" data-chart-drops viewBox="0 0 220 72" preserveAspectRatio="none"></svg><div class="tdc-chart-readout" data-readout-drops>hover for value</div></div>
          </div>
        </div>
        <div class="tdc-optional">
          <div class="tdc-card">
            <div class="tdc-label">CDN Requests</div>
            <table class="tdc-table">
              <thead><tr><th>Host</th><th>Serving</th><th>Count</th><th>Last</th><th>Status</th></tr></thead>
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
      clearSession();
      render();
    });
    root.querySelector("[data-toggle-graphs]").addEventListener("click", () => {
      state.graphsVisible = !state.graphsVisible;
      render();
    });
    root.querySelector("[data-copy]").addEventListener("click", async () => {
      await navigator.clipboard.writeText(JSON.stringify(getDiagnostics(), null, 2));
      addLog("Diagnostics JSON copied to clipboard.");
      render();
    });
    root.querySelector("[data-export]").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(getDiagnostics(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `twitch-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      link.click();
      URL.revokeObjectURL(url);
      addLog("Diagnostics JSON downloaded.");
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
      start = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!start || event.pointerId !== start.pointerId) return;
      root.style.left = `${Math.max(0, Math.min(window.innerWidth - root.offsetWidth, start.left + event.clientX - start.x))}px`;
      root.style.top = `${Math.max(0, Math.min(window.innerHeight - 48, start.top + event.clientY - start.y))}px`;
      root.style.right = "auto";
      root.style.bottom = "auto";
    });
    handle.addEventListener("pointerup", () => {
      start = null;
    });
  }

  function addMetricSample(diagnostics) {
    const previous = state.metricHistory[state.metricHistory.length - 1];
    let droppedPct = null;

    if (previous && Number.isFinite(diagnostics.playback.totalVideoFrames) && Number.isFinite(diagnostics.playback.droppedVideoFrames)) {
      const frameDelta = diagnostics.playback.totalVideoFrames - previous.totalFrames;
      const dropDelta = diagnostics.playback.droppedVideoFrames - previous.droppedFrames;
      droppedPct = frameDelta > 0 ? (dropDelta / frameDelta) * 100 : 0;
    }

    state.metricHistory.push({
      t: Date.now(),
      buffer: diagnostics.playback.bufferAhead,
      responseMs: diagnostics.cdn.dominant?.lastMs ?? null,
      throughputMbps: diagnostics.performance.estimatedRecentThroughput ? (diagnostics.performance.estimatedRecentThroughput * 8) / 1_000_000 : null,
      droppedPct,
      totalFrames: diagnostics.playback.totalVideoFrames,
      droppedFrames: diagnostics.playback.droppedVideoFrames
    });
    state.metricHistory = state.metricHistory.slice(-90);
  }

  function chartPath(samples, key, maxHint = null) {
    const values = samples.map((sample) => sample[key]).filter(Number.isFinite);
    if (!values.length) return "";

    const max = Math.max(maxHint || 0, ...values, 1);
    const width = 220;
    const height = 72;
    const last = samples.slice(-60);

    return last.map((sample, index) => {
      const raw = Number.isFinite(sample[key]) ? sample[key] : null;
      const x = last.length === 1 ? width : (index / (last.length - 1)) * width;
      const y = raw === null ? height : height - (raw / max) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${Math.max(4, Math.min(height - 4, y)).toFixed(1)}`;
    }).join(" ");
  }

  function renderChart(svg, samples, key, color, maxHint = null) {
    if (!svg) return;
    const path = chartPath(samples, key, maxHint);
    svg.replaceChildren();

    if (!path) {
      const empty = document.createElementNS("http://www.w3.org/2000/svg", "text");
      empty.setAttribute("x", "110");
      empty.setAttribute("y", "39");
      empty.setAttribute("text-anchor", "middle");
      empty.setAttribute("class", "tdc-chart-empty");
      empty.textContent = "waiting";
      svg.appendChild(empty);
      return;
    }

    const axis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    axis.setAttribute("x1", "0");
    axis.setAttribute("y1", "68");
    axis.setAttribute("x2", "220");
    axis.setAttribute("y2", "68");
    axis.setAttribute("class", "tdc-chart-axis");

    const trend = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trend.setAttribute("d", path);
    trend.setAttribute("fill", "none");
    trend.setAttribute("stroke", color);
    trend.setAttribute("stroke-width", "2.4");
    trend.setAttribute("vector-effect", "non-scaling-stroke");

    svg.append(axis, trend);
  }

  function formatChartValue(value, unit) {
    if (!Number.isFinite(value)) return "n/a";
    if (unit === "Mbps") return `${value.toFixed(2)} Mbps`;
    if (unit === "%") return `${value.toFixed(2)}%`;
    if (unit === "ms") return `${Math.round(value)} ms`;
    if (unit === "s") return `${value.toFixed(1)} s`;
    return `${value}`;
  }

  function bindChartHover(svg, readout, key, unit) {
    if (!svg || !readout || svg.dataset.hoverBound === "true") return;
    svg.dataset.hoverBound = "true";
    svg.addEventListener("mousemove", (event) => {
      const samples = state.metricHistory.slice(-60);
      if (!samples.length) return;
      const rect = svg.getBoundingClientRect();
      const index = Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * (samples.length - 1));
      const sample = samples[index];
      readout.textContent = `${formatChartValue(sample[key], unit)} at ${Math.round((Date.now() - sample.t) / 1000)}s ago`;
    });
    svg.addEventListener("mouseleave", () => {
      readout.textContent = "hover for value";
    });
  }

  function renderGraphs(root) {
    const graphs = root.querySelector("[data-graphs]");
    const toggle = root.querySelector("[data-toggle-graphs]");
    if (!graphs || !toggle) return;

    graphs.classList.toggle("tdc-hidden-section", !state.graphsVisible);
    toggle.textContent = state.graphsVisible ? "Hide Graphs" : "Show Graphs";
    if (!state.graphsVisible) return;

    const buffer = root.querySelector("[data-chart-buffer]");
    const response = root.querySelector("[data-chart-response]");
    const throughput = root.querySelector("[data-chart-throughput]");
    const drops = root.querySelector("[data-chart-drops]");
    renderChart(buffer, state.metricHistory, "buffer", "#22c55e", 30);
    renderChart(response, state.metricHistory, "responseMs", "#60a5fa", 1000);
    renderChart(throughput, state.metricHistory, "throughputMbps", "#f59e0b", 8);
    renderChart(drops, state.metricHistory, "droppedPct", "#ef4444", 10);
    bindChartHover(buffer, root.querySelector("[data-readout-buffer]"), "buffer", "s");
    bindChartHover(response, root.querySelector("[data-readout-response]"), "responseMs", "ms");
    bindChartHover(throughput, root.querySelector("[data-readout-throughput]"), "throughputMbps", "Mbps");
    bindChartHover(drops, root.querySelector("[data-readout-drops]"), "droppedPct", "%");
  }

  function renderCdnTable(root, diagnostics) {
    const table = root.querySelector("[data-cdn-table]");
    if (!table) return;

    table.replaceChildren();

    const entries = Object.entries(diagnostics.cdn.hosts)
      .sort(([, a], [, b]) => (b.count || 0) - (a.count || 0))
      .slice(0, 10);

    if (!entries.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.className = "tdc-muted";
      cell.textContent = "Waiting for Twitch video CDN requests...";
      row.appendChild(cell);
      table.appendChild(row);
      return;
    }

    for (const [host, stats] of entries) {
      const row = document.createElement("tr");
      for (const value of [
        host,
        getPrimaryDeliveryType(stats),
        String(stats.count || 0),
        fmtMs(stats.lastMs),
        String(stats.lastStatus || stats.error || "n/a")
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      }
      table.appendChild(row);
    }
  }

  function setText(root, selector, value) {
    const node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function render() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;

    const diagnostics = getDiagnostics();
    addMetricSample(diagnostics);

    root.classList.toggle("tdc-hidden", !state.visible);
    root.classList.toggle("tdc-compact", state.compact);
    root.querySelector("[data-status]").className = `tdc-status ${statusClass(diagnostics)}`;

    setText(root, "[data-buffer]", fmtSeconds(diagnostics.playback.bufferAhead));
    setText(root, "[data-responsiveness]", diagnostics.cdn.responsiveness);
    setText(root, "[data-cdn]", diagnostics.cdn.dominant?.host || "n/a");
    setText(root, "[data-latency]", fmtSeconds(diagnostics.playback.liveEdgeGap));
    setText(root, "[data-drops]", diagnostics.playback.totalVideoFrames ? `${diagnostics.playback.droppedVideoFrames} / ${diagnostics.playback.droppedFramePercent}%` : "n/a");
    setText(root, "[data-throughput]", fmtBitrate(diagnostics.performance.estimatedRecentThroughput));
    setText(root, "[data-playback]", diagnostics.playback.foundVideo ? `${diagnostics.playback.paused ? "paused" : "playing"} / ready ${diagnostics.playback.readyState}` : "no video");
    setText(root, "[data-log]", state.logs.join("\n"));
    renderCdnTable(root, diagnostics);
    renderGraphs(root);
  }

  function connectBackground() {
    try {
      if (globalThis.browser?.runtime?.sendMessage) {
        api.runtime.sendMessage({ type: "TWITCH_DIAGNOSTICS_GET_NETWORK" }).then((response) => {
          if (response) {
            state.network = response;
            render();
          }
        }).catch(() => {});
      } else {
        api.runtime.sendMessage({ type: "TWITCH_DIAGNOSTICS_GET_NETWORK" }, (response) => {
          if (response) {
            state.network = response;
            render();
          }
        });
      }
    } catch {
      // Page-level performance data still works without background samples.
    }

    api.runtime.onMessage.addListener((message) => {
      if (message?.type === "TWITCH_DIAGNOSTICS_TOGGLE_PANEL") {
        state.visible = !state.visible;
        render();
      }

      if (message?.type === "TWITCH_DIAGNOSTICS_NETWORK_SAMPLE") {
        state.network = {
          ...state.network,
          ...message.payload
        };
        render();
      }
    });
  }

  function installStreamWatcher() {
    state.streamKey = getStreamKey();
    const push = history.pushState;
    const replace = history.replaceState;
    history.pushState = function pushState(...args) {
      const result = push.apply(this, args);
      window.setTimeout(detectStreamChange, 0);
      return result;
    };
    history.replaceState = function replaceState(...args) {
      const result = replace.apply(this, args);
      window.setTimeout(detectStreamChange, 0);
      return result;
    };
    window.addEventListener("popstate", () => window.setTimeout(detectStreamChange, 0));
    window.setInterval(detectStreamChange, 1500);
  }

  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "d") {
      event.preventDefault();
      state.visible = !state.visible;
      render();
    }
  });

  createPanel();
  connectBackground();
  installStreamWatcher();
  window.setInterval(render, 1000);
})();
