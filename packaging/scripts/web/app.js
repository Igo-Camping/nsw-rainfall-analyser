const state = {
  config: null,
  mapView: null,
  graphicsLayer: null,
};

function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.style.color = isError ? "#a43f1f" : "";
}

function updateMethodFields() {
  const method = document.getElementById("package-method").value;
  document.getElementById("value-field").classList.toggle("hidden", method !== "value");
  document.getElementById("count-field").classList.toggle("hidden", method !== "count");
}

function renderChips(items) {
  const container = document.getElementById("summary-chips");
  container.innerHTML = "";
  items.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item;
    container.appendChild(chip);
  });
}

function renderTable(packages) {
  const target = document.getElementById("results-table");
  if (!packages || packages.length === 0) {
    target.className = "table-wrap empty-state";
    target.textContent = "No package rows returned.";
    return;
  }

  const rows = packages.map((pkg) => `
    <tr>
      <td>${pkg.package_id ?? ""}</td>
      <td>${pkg.suburb ?? ""}</td>
      <td>${pkg.pipe_count ?? ""}</td>
      <td>${pkg.total_length_m ?? ""}</td>
      <td>${pkg.total_cost ?? ""}</td>
      <td>${Array.isArray(pkg.diameters_mm) ? pkg.diameters_mm.join(", ") : ""}</td>
    </tr>
  `).join("");

  target.className = "table-wrap";
  target.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Package</th>
          <th>Suburb</th>
          <th>Pipes</th>
          <th>Length (m)</th>
          <th>Total Cost ($)</th>
          <th>Diameters (mm)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function colorForPackageId(packageId) {
  const palette = ["#1d6b43", "#bf8d2c", "#2c7fb8", "#d95f0e", "#7a4ea1", "#4d6c2f"];
  if (!packageId) {
    return palette[0];
  }
  let hash = 0;
  for (let i = 0; i < packageId.length; i += 1) {
    hash = ((hash << 5) - hash) + packageId.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

async function ensureMap() {
  if (state.mapView) {
    return;
  }

  const [Map, MapView, GraphicsLayer] = await Promise.all([
    window.requireAsync("esri/Map"),
    window.requireAsync("esri/views/MapView"),
    window.requireAsync("esri/layers/GraphicsLayer"),
  ]);

  state.graphicsLayer = new GraphicsLayer();
  const map = new Map({
    basemap: "streets-navigation-vector",
    layers: [state.graphicsLayer],
  });

  state.mapView = new MapView({
    container: "map",
    map,
    center: [151.22, -33.75],
    zoom: 11,
  });
}

async function drawAssets(assets, mode) {
  await ensureMap();
  const [Graphic] = await Promise.all([
    window.requireAsync("esri/Graphic"),
  ]);

  state.graphicsLayer.removeAll();

  if (!assets || assets.length === 0) {
    return;
  }

  const graphics = assets
    .filter((asset) => Number.isFinite(Number(asset.XMid)) && Number.isFinite(Number(asset.YMid)))
    .map((asset) => {
      const color = mode === "package" ? colorForPackageId(asset.package_id) : "#bf8d2c";
      return new Graphic({
        geometry: {
          type: "point",
          x: Number(asset.XMid),
          y: Number(asset.YMid),
          spatialReference: { wkid: 28356 },
        },
        attributes: asset,
        popupTemplate: {
          title: asset.package_id ? `${asset.package_id} - ${asset.Asset ?? "Pipe"}` : `${asset.Asset ?? "Pipe"}`,
          content: `
            <b>Suburb:</b> ${asset["Asset Suburb"] ?? asset.suburb ?? ""}<br>
            <b>Diameter:</b> ${asset["SWP_Pipe Diameter_mm"] ?? ""}<br>
            <b>Length:</b> ${asset["Spatial Length_m"] ?? ""}<br>
            <b>Condition:</b> ${asset["SW_Condition"] ?? ""}<br>
            <b>Pipe cost:</b> ${asset.pipe_cost ?? ""}
          `,
        },
        symbol: {
          type: "simple-marker",
          style: mode === "package" ? "circle" : "diamond",
          color,
          size: mode === "package" ? 10 : 9,
          outline: {
            color: "#ffffff",
            width: 1.2,
          },
        },
      });
    });

  state.graphicsLayer.addMany(graphics);
  await state.mapView.goTo(graphics);
}

async function apiRequest(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response.json();
}

async function loadHealth() {
  const response = await fetch("/health");
  const data = await response.json();
  document.getElementById("asset-count").textContent = data.assets_loaded?.toLocaleString?.() ?? data.assets_loaded ?? "-";
  document.getElementById("coord-status").textContent = data.has_coordinates ? "Available" : "Missing";
  document.getElementById("health-status").textContent = data.ok ? "Online" : "Offline";
}

async function loadConfig() {
  const response = await fetch("/packaging/config");
  const data = await response.json();
  state.config = data;

  const reliningMode = document.getElementById("relining-mode");
  reliningMode.innerHTML = "";
  (data.relining_modes || []).forEach((mode) => {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = mode;
    reliningMode.appendChild(option);
  });

  setStatus(`Loaded ${data.asset_count.toLocaleString()} assets from ${data.assets_path}`);
}

function collectPayload() {
  return {
    relining_mode: document.getElementById("relining-mode").value,
    package_method: document.getElementById("package-method").value,
    max_package_value: Number(document.getElementById("max-package-value").value || 500000),
    pipes_per_package: Number(document.getElementById("pipes-per-package").value || 25),
    group_by_suburb: document.getElementById("group-by-suburb").checked,
  };
}

async function handlePreview() {
  setStatus("Loading relining, reconstruction, and amplification previews...");
  const payload = { relining_mode: document.getElementById("relining-mode").value };
  const data = await apiRequest("/packaging/split-streams", payload);
  const relining = data.streams?.find((stream) => stream.name === "Relining Preview");
  renderChips([
    `Relining pipes: ${relining?.pipe_count ?? 0}`,
    `Reconstruction pipes: ${data.streams?.[2]?.pipe_count ?? 0}`,
    `Amplification pipes: ${data.streams?.[3]?.pipe_count ?? 0}`,
  ]);
  renderTable([]);
  await drawAssets(data.map_assets?.relining || [], "preview");
  setStatus("Preview loaded on the map.");
}

async function handleGenerate() {
  setStatus("Generating relining packages...");
  const data = await apiRequest("/packaging/generate-relining-packages", collectPayload());
  renderChips([
    `Packages: ${data.package_count ?? 0}`,
    `Costed pipes: ${data.costed_pipe_count ?? 0}`,
    `Total length: ${data.total_length_m ?? 0} m`,
    `Total cost: $${Number(data.total_cost ?? 0).toLocaleString()}`,
  ]);
  renderTable(data.packages || []);
  await drawAssets(data.map_assets || [], "package");
  setStatus("Relining packages generated and drawn on the map.");
}

function bootstrapEsriLoader() {
  window.requireAsync = (moduleName) => new Promise((resolve, reject) => {
    window.require([moduleName], resolve, reject);
  });
}

async function init() {
  bootstrapEsriLoader();
  updateMethodFields();
  document.getElementById("package-method").addEventListener("change", updateMethodFields);
  document.getElementById("preview-button").addEventListener("click", () => handlePreview().catch((error) => setStatus(error.message, true)));
  document.getElementById("generate-button").addEventListener("click", () => handleGenerate().catch((error) => setStatus(error.message, true)));

  try {
    await Promise.all([loadHealth(), loadConfig(), ensureMap()]);
    setStatus("Configuration loaded. Preview the streams or generate packages.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

init();
