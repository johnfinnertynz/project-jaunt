const state = {
  dataset: "affordability",
  year: 2025,
  inflationAdjusted: true,
  layers: []
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

    const polygon = L.polygon(region.shape, {
      color: "rgba(255,255,255,0.86)",
      dashArray: "4 5",
      fillColor: colour,
      fillOpacity: 0.48,
      opacity: 0.95,
      weight: 1.8
    })
      .bindPopup(`
        <p class="popup-title">${region.name}</p>
        <p class="popup-meta">${currentDataset().label}, ${state.year}: <strong>${label}</strong></p>
        <p class="popup-meta">Prototype seed value. Connect source pipeline before treating as official.</p>
      `)
      .addTo(map);

    polygon.on("mouseover", () => polygon.setStyle({ fillOpacity: 0.68, weight: 3 }));
    polygon.on("mouseout", () => polygon.setStyle({ fillOpacity: 0.48, weight: 1.8 }));

    const labelIcon = L.divIcon({
      className: "",
      html: `<div class="region-label">${region.name}<br>${label}</div>`
    });

    const textMarker = L.marker(region.coords, {
      icon: labelIcon,
      interactive: false
    }).addTo(map);

    state.layers.push(polygon, textMarker);
  }
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
  document.getElementById("pipeline-note").textContent = pipelineRun
    ? `Local DB pipeline: ${pipelineRun.pipeline} (${pipelineRun.mode}, ${pipelineRun.rowCount} rows). ${pipelineRun.note}`
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
