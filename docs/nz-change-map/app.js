const state = {
  dataset: "affordability",
  year: 2025,
  inflationAdjusted: true,
  layers: [],
  pointLayers: []
};

const map = L.map("map", {
  zoomControl: false,
  attributionControl: false
}).setView([-41.2, 172.8], 5);

L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 18
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);
L.control.attribution({ position: "bottomleft", prefix: false })
  .addAttribution("Imagery &copy; Esri, Maxar, Earthstar Geographics and contributors")
  .addTo(map);

const tabs = document.getElementById("dataset-tabs");
const yearSlider = document.getElementById("year-slider");
const inflationToggle = document.getElementById("inflation-toggle");
const inflationControl = document.getElementById("inflation-control");
const radioPlayer = document.getElementById("radio-player");
const radioPlayerTitle = document.getElementById("radio-player-title");
const radioPlayerMeta = document.getElementById("radio-player-meta");

const RADIO_STATIONS = {
  "rnz-national": {
    name: "RNZ National",
    stream: "https://stream-ice.radionz.co.nz/national.mp3",
    coords: [-41.2865, 174.7762],
    zoom: 5,
    marker: "Wellington studio and nationwide AM/FM network",
    meta: "Nationwide AM/FM network. Studio and newsroom base: Wellington. Published stream: RNZ National MP3."
  },
  "rnz-concert": {
    name: "RNZ Concert",
    stream: "https://stream-ice.radionz.co.nz/concert.mp3",
    coords: [-41.2865, 174.7762],
    zoom: 5,
    marker: "Wellington base and nationwide FM network",
    meta: "Nationwide FM network for classical, jazz, arts, and specialist music. Published stream: RNZ Concert MP3."
  },
  "rnz-pacific": {
    name: "RNZ International",
    stream: "https://stream-ice.radionz.co.nz/international.mp3",
    coords: [-38.886, 176.353],
    zoom: 8,
    marker: "Rangitaiki shortwave transmission area",
    meta: "Pacific shortwave service. RNZ describes its transmission site as Rangitaiki, 41 km east of Taupo."
  },
  "rnz-parliament": {
    name: "RNZ Parliament",
    stream: "https://stream-ice.radionz.co.nz/parliament.mp3",
    coords: [-41.2784, 174.7767],
    zoom: 6,
    marker: "Parliament audio source and AM Network distribution",
    meta: "Parliament audio when the House is sitting, carried through RNZ's AM Network and online stream."
  },
  "newstalk-zb": {
    name: "Newstalk ZB",
    stream: "https://playerservices.streamtheworld.com/api/livestream-redirect/NZME_41AAC.aac",
    coords: [-36.8485, 174.7633],
    zoom: 6,
    marker: "Auckland network stream context",
    meta: "Commercial talk radio network. Stream discovered through public station directories and resolved to NZME's published StreamTheWorld feed."
  },
  "radio-hauraki": {
    name: "Radio Hauraki",
    stream: "https://playerservices.streamtheworld.com/api/livestream-redirect/NZME_04AAC_SC",
    coords: [-36.8485, 174.7633],
    zoom: 6,
    marker: "Auckland network stream context",
    meta: "NZ rock station with Auckland network context. Stream resolved to NZME's public StreamTheWorld feed."
  },
  "coast": {
    name: "Coast",
    stream: "https://playerservices.streamtheworld.com/api/livestream-redirect/NZME_07AAC.aac",
    coords: [-36.8485, 174.7633],
    zoom: 6,
    marker: "Auckland network stream context",
    meta: "Classic hits network. Stream resolved to NZME's public StreamTheWorld feed."
  },
  "the-hits": {
    name: "The Hits",
    stream: "https://playerservices.streamtheworld.com/api/livestream-redirect/NZME_71AAC.aac",
    coords: [-36.8485, 174.7633],
    zoom: 6,
    marker: "Auckland network stream context",
    meta: "Music and local-show network. Stream resolved to NZME's public StreamTheWorld feed."
  },
  "mai-fm": {
    name: "Mai FM",
    stream: "https://mediaworks.streamguys1.com/mai_net_icy",
    coords: [-36.8485, 174.7633],
    zoom: 6,
    marker: "Auckland network stream context",
    meta: "Hip hop and R&B network. Stream resolved to Rova/MediaWorks' public StreamGuys feed."
  },
  "george-fm": {
    name: "George FM",
    stream: "https://mediaworks.streamguys1.com/george_net_icy",
    coords: [-36.8485, 174.7633],
    zoom: 6,
    marker: "Auckland network stream context",
    meta: "Dance and electronic music network. Stream resolved to Rova/MediaWorks' public StreamGuys feed."
  },
  "the-breeze": {
    name: "The Breeze Auckland",
    stream: "https://mediaworks.streamguys1.com/breeze-akl-high_icy",
    coords: [-36.8485, 174.7633],
    zoom: 6,
    marker: "Auckland FM stream context",
    meta: "Easy-listening Auckland stream. Resolved to Rova/MediaWorks' public StreamGuys feed."
  },
  "the-rock": {
    name: "The Rock",
    stream: "https://mediaworks.streamguys1.com/rock_net_icy",
    coords: [-36.8485, 174.7633],
    zoom: 6,
    marker: "Auckland network stream context",
    meta: "Rock network. Stream resolved to Rova/MediaWorks' public StreamGuys feed."
  },
  "magic": {
    name: "Magic",
    stream: "https://mediaworks.streamguys1.com/magic_net_icy",
    coords: [-36.8485, 174.7633],
    zoom: 6,
    marker: "Auckland network stream context",
    meta: "Classic music network. Stream resolved to Rova/MediaWorks' public StreamGuys feed."
  },
  "humm-fm": {
    name: "Humm FM",
    stream: "https://mediaworks.streamguys1.com/humm_net_icy",
    coords: [-36.8485, 174.7633],
    zoom: 6,
    marker: "Auckland network stream context",
    meta: "South Asian music and community radio stream. Stream resolved to Rova/MediaWorks' public StreamGuys feed."
  },
  "rhema": {
    name: "Rhema",
    stream: "https://rhema-radio.streamguys1.com/rhema.mp3",
    coords: [-36.8485, 174.7633],
    zoom: 6,
    marker: "Auckland network stream context",
    meta: "Christian radio network. Stream resolved to Rhema's public MP3 feed."
  }
};

const RADIO_BROWSER_ENDPOINTS = [
  "https://de1.api.radio-browser.info/json/stations/bycountrycodeexact/NZ?hidebroken=true&order=votes&reverse=true&limit=80",
  "https://nl1.api.radio-browser.info/json/stations/bycountrycodeexact/NZ?hidebroken=true&order=votes&reverse=true&limit=80",
  "https://at1.api.radio-browser.info/json/stations/bycountrycodeexact/NZ?hidebroken=true&order=votes&reverse=true&limit=80"
];

const RADIO_LOCATION_FALLBACKS = {
  auckland: [-36.8485, 174.7633],
  wellington: [-41.2865, 174.7762],
  christchurch: [-43.5321, 172.6362],
  dunedin: [-45.8788, 170.5028],
  hamilton: [-37.787, 175.2793],
  tauranga: [-37.6878, 176.1651],
  rotorua: [-38.1368, 176.2497],
  nelson: [-41.2706, 173.284],
  "palmerston north": [-40.3523, 175.6082],
  southland: [-46.4132, 168.3538],
  invercargill: [-46.4132, 168.3538],
  taranaki: [-39.0556, 174.0752],
  "kapiti coast": [-40.916, 175.006],
  waikato: [-37.787, 175.2793],
  "central plateau": [-39.281, 175.57],
  "ngati porou": [-37.965, 178.31],
  "ngāti porou": [-37.965, 178.31]
};

const DATASET_EXPLAINERS = {
  affordability: "Higher values mean the region's typical housing or land price is taking a larger multiple of income. With inflation adjustment on, older values are expressed in 2025 terms so the time comparison is fairer.",
  population: "This shows how tightly people are distributed across the region's land area. Dense regions usually need stronger transport, housing, water, and social infrastructure planning.",
  fibre: "This tracks the spread of fibre-capable fixed broadband. A rising value means more premises should be able to connect to modern high-capacity internet.",
  cellTowers: "This is an index of mobile site density and coverage pressure. It helps highlight where mobile infrastructure has been concentrated over time.",
  work: "This compares where work is concentrating relative to where people live. Higher values point to job hubs and commuting pressure.",
  farmland: "This estimates the share of land used for pasture, crops, and other productive rural cover. Falling values can indicate urban edge pressure, forestry conversion, or land-use change.",
  forestry: "This tracks regional forest cover, including indigenous forest, planted production forest, and land converted into woodlots or plantation blocks. It is designed to combine MPI forestry tables with LCDB satellite land-cover snapshots.",
  climatePressure: "This composite is designed to combine coastal exposure, flood, heat, drought, and severe-weather risk indicators into a regional pressure score.",
  politics: "This index is a simplified view of regional party-vote position over time. Lower values lean centre-left in this prototype; higher values lean centre-right."
};

function yearIndex() {
  return YEARS.indexOf(Number(state.year));
}

function currentDataset() {
  return DATASETS[state.dataset];
}

function rawValue(regionId) {
  const values = currentDataset().values[regionId] || [];
  return values[yearIndex()] ?? 0;
}

function adjustedValue(regionId) {
  const value = rawValue(regionId);
  if (state.dataset !== "affordability" || !state.inflationAdjusted) return value;
  const cpiRealTermsFactor = {
    2000: 1.76,
    2005: 1.49,
    2010: 1.29,
    2015: 1.16,
    2020: 1.08,
    2025: 1
  }[state.year] || 1;
  return value / cpiRealTermsFactor;
}

function datasetValues() {
  return REGIONS.map((region) => adjustedValue(region.id));
}

function colourFor(value, min, max) {
  const dataset = currentDataset();
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  const score = dataset.invertGood ? 1 - ratio : ratio;
  const hue = 142 - score * 138;
  return `hsl(${hue}, 82%, 48%)`;
}

function formatValue(value) {
  const dataset = currentDataset();
  if (dataset.unit.includes("%")) return `${Math.round(value)}%`;
  if (dataset.unit.includes("people")) return `${Math.round(value)} people/km2`;
  if (dataset.unit.includes("price")) return `${value.toFixed(1)}x`;
  return `${Math.round(value)} ${dataset.unit}`;
}

function currentPipelineRun() {
  const runs = typeof PIPELINE_RUNS === "undefined" ? [] : PIPELINE_RUNS;
  return runs.find((run) => run.pipeline === currentDataset().pipeline);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function regionRank(regionId, values) {
  const ranked = REGIONS
    .map((region, index) => ({ id: region.id, value: values[index] }))
    .sort((left, right) => right.value - left.value);
  return ranked.findIndex((region) => region.id === regionId) + 1;
}

function formatDelta(delta) {
  const dataset = currentDataset();
  const sign = delta > 0 ? "+" : "";
  if (dataset.unit.includes("%")) return `${sign}${Math.round(delta)} percentage points`;
  if (dataset.unit.includes("people")) return `${sign}${Math.round(delta)} people/km2`;
  if (dataset.unit.includes("price")) return `${sign}${delta.toFixed(1)}x`;
  return `${sign}${Math.round(delta)} ${dataset.unit}`;
}

function popupContent(region, label, values) {
  const dataset = currentDataset();
  const value = adjustedValue(region.id);
  const firstValue = state.dataset === "affordability" && state.inflationAdjusted
    ? rawValue(region.id) / 1.76
    : (dataset.values[region.id] || [value])[0];
  const nationalMean = values.reduce((sum, item) => sum + item, 0) / values.length;
  const rank = regionRank(region.id, values);
  const areaLine = region.landAreaSqKm
    ? `<li><span>Land area</span><strong>${Math.round(region.landAreaSqKm).toLocaleString()} km2</strong></li>`
    : "";

  return `
    <div class="region-popup">
      <p class="popup-title">${escapeHtml(region.name)}</p>
      <p class="popup-meta">${escapeHtml(dataset.label)}, ${state.year}: <strong>${escapeHtml(label)}</strong></p>
      <ul class="popup-list">
        <li><span>National average</span><strong>${escapeHtml(formatValue(nationalMean))}</strong></li>
        <li><span>Regional rank</span><strong>${rank} of ${REGIONS.length} by value</strong></li>
        <li><span>Change since ${YEARS[0]}</span><strong>${escapeHtml(formatDelta(value - firstValue))}</strong></li>
        ${areaLine}
      </ul>
      <p class="popup-explainer">${escapeHtml(DATASET_EXPLAINERS[state.dataset] || dataset.summary)}</p>
      <p class="popup-status">Prototype seed value from the local SQLite pipeline. Treat it as directional until the live source parser is connected.</p>
    </div>
  `;
}

function pointPopupContent(point) {
  return `
    <div class="point-popup">
      <p class="popup-title">${escapeHtml(point.name)}</p>
      <ul class="popup-list">
        <li><span>Type</span><strong>${escapeHtml(point.kind)}</strong></li>
        <li><span>Source mode</span><strong>${escapeHtml(point.status)}</strong></li>
        <li><span>Pipeline</span><strong>${escapeHtml(point.operator)}</strong></li>
      </ul>
      <p class="popup-explainer">${escapeHtml(point.notes)}</p>
      <p class="popup-status">Cell-site pins are seeded from public-location context. The production layer should replace these with RSM Register of Radio Frequencies licence locations.</p>
    </div>
  `;
}

function renderTabs() {
  tabs.replaceChildren();
  for (const [id, dataset] of Object.entries(DATASETS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dataset-tab";
    button.textContent = dataset.shortLabel;
    button.setAttribute("aria-selected", String(id === state.dataset));
    button.addEventListener("click", () => {
      state.dataset = id;
      render();
    });
    tabs.appendChild(button);
  }
}

function renderPointFeatures() {
  for (const layer of state.pointLayers) layer.remove();
  state.pointLayers = [];

  const points = (typeof POINT_FEATURES === "undefined" ? {} : POINT_FEATURES)[state.dataset] || [];
  for (const point of points) {
    const icon = L.divIcon({
      className: "tower-pin-marker",
      html: '<span class="tower-pin"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
      popupAnchor: [0, -11]
    });
    const marker = L.marker(point.coords, { icon })
      .bindPopup(pointPopupContent(point), { maxWidth: 340 })
      .addTo(map);

    marker.on("click", () => marker.openPopup());
    state.pointLayers.push(marker);
  }
}

function renderRegions() {
  for (const layer of state.layers) layer.remove();
  state.layers = [];

  const values = datasetValues();
  const min = Math.min(...values);
  const max = Math.max(...values);

  for (const region of REGIONS) {
    const value = adjustedValue(region.id);
    const colour = colourFor(value, min, max);
    const label = formatValue(value);

    const polygon = L.geoJSON(region.geometry, {
      style: {
        color: "rgba(255,255,255,0.94)",
        fillColor: colour,
        fillOpacity: 0.36,
        opacity: 0.98,
        weight: 1.35
      }
    })
      .bindPopup(popupContent(region, label, values), { maxWidth: 360 })
      .addTo(map);

    polygon.on("mouseover", () => polygon.setStyle({ fillOpacity: 0.56, weight: 2.8 }));
    polygon.on("mouseout", () => polygon.setStyle({ fillOpacity: 0.36, weight: 1.35 }));

    const labelIcon = L.divIcon({
      className: "region-label-marker",
      html: `<div class="region-label">${region.name}<br>${label}</div>`,
      iconSize: [128, 38],
      iconAnchor: [64, 19]
    });

    const textMarker = L.marker(region.coords, {
      icon: labelIcon,
      interactive: false
    }).addTo(map);

    state.layers.push(polygon, textMarker);
  }

  renderPointFeatures();
}

function renderInspector() {
  const dataset = currentDataset();
  const values = datasetValues();
  document.getElementById("dataset-title").textContent = dataset.label;
  document.getElementById("dataset-summary").textContent = dataset.summary;
  document.getElementById("metric-label").textContent = dataset.metricLabel;
  document.getElementById("metric-value").textContent = `${state.year}`;
  document.getElementById("legend-low").textContent = dataset.lowLabel;
  document.getElementById("legend-high").textContent = dataset.highLabel;
  document.getElementById("source-link").textContent = dataset.source;
  document.getElementById("source-link").href = dataset.sourceUrl;
  const pipelineRun = currentPipelineRun();
  const pointCount = ((typeof POINT_FEATURES === "undefined" ? {} : POINT_FEATURES)[state.dataset] || []).length;
  document.getElementById("pipeline-note").textContent = pipelineRun
    ? `Local DB pipeline: ${pipelineRun.pipeline} (${pipelineRun.mode}, ${pipelineRun.rowCount} rows${pointCount ? `, ${pointCount} pins` : ""}). ${pipelineRun.note}`
    : "Local DB pipeline metadata unavailable.";
  inflationControl.hidden = !dataset.inflationAdjustable;
  document.documentElement.style.setProperty("--good", dataset.invertGood ? "#ef4444" : "#22c55e");
  document.documentElement.style.setProperty("--hot", dataset.invertGood ? "#22c55e" : "#ef4444");

  const nationalMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  document.getElementById("metric-value").textContent = `${state.year} - NZ avg ${formatValue(nationalMean)}`;
}

function render() {
  renderTabs();
  renderInspector();
  renderRegions();
  yearSlider.value = state.year;
  inflationToggle.checked = state.inflationAdjusted;
}

function stationSlug(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function stationCoords(station) {
  const lat = Number(station.geo_lat);
  const lon = Number(station.geo_long);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];

  const stateText = String(station.state || station.name || "").toLowerCase();
  for (const [key, coords] of Object.entries(RADIO_LOCATION_FALLBACKS)) {
    if (stateText.includes(key)) return coords;
  }
  return null;
}

function usableStation(station) {
  const stream = station.url_resolved || station.url;
  if (!stream || !stream.startsWith("https://")) return false;
  if (!station.name || station.name.length > 70) return false;
  return Boolean(stationCoords(station));
}

function normaliseLiveStation(station) {
  const coords = stationCoords(station);
  const state = station.state ? `, ${station.state}` : "";
  return {
    name: station.name.replace(/\s+/g, " ").trim(),
    stream: station.url_resolved || station.url,
    coords,
    zoom: 7,
    marker: `Live directory${state}`,
    meta: `Live station from Radio Browser metadata${state}. Votes: ${station.votes || 0}. Stream URL resolved at page load.`
  };
}

async function fetchLiveRadioStations() {
  for (const endpoint of RADIO_BROWSER_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) continue;
      return await response.json();
    } catch {
      // Try the next public mirror.
    }
  }
  return [];
}

function setupRadio() {
  const radioMapElement = document.getElementById("radio-map");
  if (!radioMapElement) return;
  const radioGrid = document.getElementById("radio-grid");
  const liveStatus = document.getElementById("radio-live-status");

  const radioMap = L.map("radio-map", {
    zoomControl: true,
    attributionControl: false,
    scrollWheelZoom: false
  }).setView([-40.7, 173.4], 5);

  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 18
  }).addTo(radioMap);

  const markers = {};

  const selectStation = (stationId, shouldPlay = true) => {
    const station = RADIO_STATIONS[stationId];
    if (!station) return;
    document.querySelectorAll(".radio-card").forEach((card) => {
      card.setAttribute("aria-selected", String(card.dataset.station === stationId));
    });
    radioPlayerTitle.textContent = station.name;
    radioPlayerMeta.textContent = station.meta;
    if (radioPlayer.src !== station.stream) {
      radioPlayer.src = station.stream;
    }
    radioMap.setView(station.coords, station.zoom);
    markers[stationId]?.openPopup();
    if (shouldPlay) {
      radioPlayer.play().catch(() => {
        radioPlayerMeta.textContent = `${station.meta} Press play to start the stream.`;
      });
    }
  };

  const renderRadioStations = (selectedStation = "rnz-national") => {
    Object.values(markers).forEach((marker) => marker.remove());
    Object.keys(markers).forEach((id) => delete markers[id]);

    for (const [id, station] of Object.entries(RADIO_STATIONS)) {
      markers[id] = L.circleMarker(station.coords, {
        radius: station.marker.startsWith("Live") ? 6 : 8,
        color: "#ffffff",
        fillColor: station.marker.startsWith("Live") ? "#22c55e" : "#38bdf8",
        fillOpacity: 0.9,
        weight: 2
      })
        .bindPopup(`<strong>${escapeHtml(station.name)}</strong><br>${escapeHtml(station.marker)}`)
        .addTo(radioMap);
    }

    if (radioGrid) {
      radioGrid.replaceChildren();
      for (const [id, station] of Object.entries(RADIO_STATIONS)) {
        const card = document.createElement("button");
        card.className = "radio-card";
        card.type = "button";
        card.dataset.station = id;
        card.innerHTML = `
          <span>${escapeHtml(station.marker)}</span>
          <h3>${escapeHtml(station.name)}</h3>
          <p>${escapeHtml(station.meta)}</p>
        `;
        card.addEventListener("click", () => selectStation(id));
        radioGrid.appendChild(card);
      }
    }

    selectStation(selectedStation, false);
  };

  renderRadioStations();

  fetchLiveRadioStations().then((stations) => {
    const existingStreams = new Set(Object.values(RADIO_STATIONS).map((station) => station.stream));
    let added = 0;
    for (const station of stations) {
      if (!usableStation(station)) continue;
      const liveStation = normaliseLiveStation(station);
      if (existingStreams.has(liveStation.stream)) continue;
      const id = `live-${stationSlug(liveStation.name)}`;
      if (!id || RADIO_STATIONS[id]) continue;
      RADIO_STATIONS[id] = liveStation;
      existingStreams.add(liveStation.stream);
      added += 1;
      if (added >= 24) break;
    }

    liveStatus.textContent = added
      ? `Live parser connected: added ${added} Radio Browser stations.`
      : "Live parser connected: no additional compatible stations found.";
    const selected = document.querySelector('.radio-card[aria-selected="true"]')?.dataset.station || "rnz-national";
    renderRadioStations(selected);
  }).catch(() => {
    liveStatus.textContent = "Live parser unavailable, using curated fallback stations.";
  });
}

yearSlider.min = YEARS[0];
yearSlider.max = YEARS[YEARS.length - 1];
yearSlider.step = 5;
document.getElementById("year-min").textContent = YEARS[0];
document.getElementById("year-max").textContent = YEARS[YEARS.length - 1];

yearSlider.addEventListener("input", () => {
  const sliderYear = Number(yearSlider.value);
  state.year = YEARS.reduce((nearest, year) => (
    Math.abs(year - sliderYear) < Math.abs(nearest - sliderYear) ? year : nearest
  ), YEARS[0]);
  render();
});

inflationToggle.addEventListener("change", () => {
  state.inflationAdjusted = inflationToggle.checked;
  render();
});

render();
setupRadio();
