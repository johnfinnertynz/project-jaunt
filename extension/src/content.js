(() => {
  const api = globalThis.browser || globalThis.chrome;
  const state = {
    visible: true,
    compact: false,
    network: {
      cdnHosts: {},
      recentRequests: []
    },
    perfSeen: new Set(),
    perfSamples: [],
    probeSamples: [],
    logs: []
  };

  const SELECTORS = {
    root: "twitch-diagnostics-console"
  };

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

  function isMediaPerformanceEntry(entry) {
    const name = entry.name || "";
    return name.includes(".m3u8") ||
      name.includes(".ts") ||
      name.includes(".m4s") ||
      name.includes("ttvnw.net") ||
      name.includes("jtvnw.net") ||
      name.includes("twitchcdn.net");
  }

  function addLog(message) {
    const now = new Date();
    state.logs.unshift(`[${now.toLocaleTimeString()}] ${message}`);
    state.logs = state.logs.slice(0, 80);
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

    const liveEdge = video.seekable.end(video.seekable.length - 1);
    return Math.max(0, liveEdge - video.currentTime);
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
        startTime: Math.round(entry.startTime || 0),
        seenAt: Date.now()
      });
    }

    state.perfSamples = state.perfSamples.slice(0, 120);
  }

  function getDominantCdn() {
    const hosts = state.network.cdnHosts || {};
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

    const perfHost = state.perfSamples.find((sample) => sample.host)?.host;
    return perfHost ? { host: perfHost, count: 0, avgMs: null } : null;
  }

  function getResponsivenessSummary() {
    const dominant = getDominantCdn();
    const samples = [
      ...Object.values(state.network.cdnHosts || {})
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
    const recent = state.perfSamples.filter((sample) => now - sample.seenAt < 30000);
    const totalBytes = recent.reduce((sum, sample) => sum + (sample.transferSize || sample.encodedBodySize || 0), 0);

    return totalBytes / 30;
  }

  function getDiagnostics() {
    capturePerformanceEntries();

    const video = getVideo();
    const quality = getVideoQuality(video);
    const responsiveness = getResponsivenessSummary();
    const dropped = quality ? quality.droppedVideoFrames : null;
    const total = quality ? quality.totalVideoFrames : null;
    const droppedPct = total ? ((dropped / total) * 100).toFixed(2) : null;

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
        status: responsiveness.status,
        probes: state.probeSamples.slice(0, 20)
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
          <button class="tdc-button" type="button" data-copy>Copy JSON</button>
          <button class="tdc-button" type="button" data-export>Download JSON</button>
          <button class="tdc-button" type="button" data-clear>Clear</button>
        </div>
        <div class="tdc-optional">
          <div class="tdc-card">
            <div class="tdc-label">CDN Requests</div>
            <table class="tdc-table">
              <thead>
                <tr>
                  <th>Host</th>
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
      state.network = { cdnHosts: {}, recentRequests: [] };
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
    const candidate = diagnostics.network.recentRequests[0]?.url ||
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

  function setText(root, selector, value) {
    const node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function renderCdnTable(root, diagnostics) {
    const table = root.querySelector("[data-cdn-table]");
    if (!table) return;

    const rows = Object.entries(diagnostics.network.cdnHosts || {})
      .sort(([, a], [, b]) => (b.count || 0) - (a.count || 0))
      .slice(0, 8)
      .map(([host, stats]) => `
        <tr>
          <td>${host}</td>
          <td>${stats.count || 0}</td>
          <td>${fmtMs(stats.lastMs)}</td>
          <td>${stats.lastStatus || stats.error || "n/a"}</td>
        </tr>
      `)
      .join("");

    table.innerHTML = rows || `<tr><td colspan="4" class="tdc-muted">Waiting for Twitch media requests...</td></tr>`;
  }

  function render() {
    const root = document.getElementById(SELECTORS.root);
    if (!root) return;

    const diagnostics = getDiagnostics();
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
    setText(root, "[data-latency]", fmtSeconds(diagnostics.playback.liveLatency));
    setText(root, "[data-drops]", diagnostics.playback.totalVideoFrames ? `${diagnostics.playback.droppedVideoFrames} / ${diagnostics.playback.droppedFramePercent}%` : "n/a");
    setText(root, "[data-throughput]", fmtBitrate(diagnostics.performance.estimatedRecentThroughput));
    setText(root, "[data-playback]", playbackState);
    setText(root, "[data-log]", state.logs.join("\n"));
    renderCdnTable(root, diagnostics);
  }

  function togglePanel() {
    state.visible = !state.visible;
    render();
  }

  function connectBackground() {
    try {
      if (globalThis.browser?.runtime?.sendMessage) {
        api.runtime.sendMessage({ type: "TWITCH_DIAGNOSTICS_GET_NETWORK" })
          .then((response) => {
            if (response) {
              state.network = response;
              render();
            }
          })
          .catch(() => {});
      } else {
        api.runtime.sendMessage({ type: "TWITCH_DIAGNOSTICS_GET_NETWORK" }, (response) => {
          if (response) {
            state.network = response;
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
        state.network = message.payload;
        render();
      }
    });
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
  window.setInterval(render, 1000);
})();
