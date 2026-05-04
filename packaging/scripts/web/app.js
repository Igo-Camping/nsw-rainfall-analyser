const state = {
  config: null,
  mapView: null,
  graphicsLayer: null,
  selectionLayer: null,
  lastAssets: [],
  lastMode: "preview",
  graphicByAssetId: new Map(),
  selectedAssetId: null,
  Graphic: null,
};

const MGA_Z56_WKID = 28356;
const MGA56_X_RANGE = [140000, 800000];
const MGA56_Y_RANGE = [5800000, 6800000];

function getPipeWeight(dia) {
  const MIN_W = 2;
  const MAX_W = 12;
  const SCALE = 0.25;
  if (!dia || isNaN(dia)) return MIN_W;
  const w = SCALE * Math.sqrt(dia);
  return Math.max(MIN_W, Math.min(MAX_W, w));
}

function isFiniteNumber(v) {
  return Number.isFinite(typeof v === "number" ? v : Number(v));
}

function inRange(v, range) {
  return v >= range[0] && v <= range[1];
}

function isPlausibleMga56(x, y) {
  return (
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    inRange(x, MGA56_X_RANGE) &&
    inRange(y, MGA56_Y_RANGE)
  );
}

function hasPipeEndpoints(asset) {
  const xs = Number(asset?.x_start);
  const ys = Number(asset?.y_start);
  const xe = Number(asset?.x_end);
  const ye = Number(asset?.y_end);
  if (!isPlausibleMga56(xs, ys) || !isPlausibleMga56(xe, ye)) return false;
  if (xs === xe && ys === ye) return false;
  return true;
}

function hasPipeMidpoint(asset) {
  const xm = Number(asset?.x_mid);
  const ym = Number(asset?.y_mid);
  return isPlausibleMga56(xm, ym);
}

function popupContent(asset) {
  const dash = "—";
  const fmtUnit = (v, unit, digits = 0) =>
    isFiniteNumber(v) ? `${Number(v).toFixed(digits)} ${unit}` : dash;
  const fmtMoney = (v) =>
    isFiniteNumber(v) ? `$${Number(v).toLocaleString()}` : dash;
  const fmtText = (v) => (v == null || v === "" ? dash : v);
  return `
    <b>Asset ID:</b> ${fmtText(asset.asset_id)}<br>
    <b>Package:</b> ${fmtText(asset.package_id)}<br>
    <b>Suburb:</b> ${fmtText(asset.suburb)}<br>
    <b>Diameter:</b> ${fmtUnit(asset.diameter_mm, "mm", 0)}<br>
    <b>Length:</b> ${fmtUnit(asset.length_m, "m", 1)}<br>
    <b>Condition:</b> ${fmtText(asset.condition)}<br>
    <b>Upstream pit:</b> ${fmtText(asset.us_node)}<br>
    <b>Downstream pit:</b> ${fmtText(asset.ds_node)}<br>
    <b>Pipe cost:</b> ${fmtMoney(asset.pipe_cost)}
  `;
}

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

  const rows = packages
    .map((pkg) => {
      const id = pkg.package_id ?? "";
      const pipesForPkg = state.lastAssets.filter(
        (a) => String(a.package_id ?? "") === String(id)
      );
      const aerialUrl = id ? googleMapsUrlForAssets(pipesForPkg) : null;
      const aerialBtn = aerialUrl
        ? `<a class="row-link" href="${aerialUrl}" target="_blank" rel="noopener" data-stop="1" title="Open in Google Maps (satellite)">🛰</a>`
        : `<span class="row-link disabled" title="No coordinates available">🛰</span>`;
      return `
        <tr class="package-row" data-package-id="${cssEscape(id)}">
          <td>${id}</td>
          <td>${pkg.suburb ?? ""}</td>
          <td>${pkg.pipe_count ?? ""}</td>
          <td>${pkg.total_length_m ?? ""}</td>
          <td>${pkg.total_cost ?? ""}</td>
          <td>${Array.isArray(pkg.diameters_mm) ? pkg.diameters_mm.join(", ") : ""}</td>
          <td class="row-actions">
            <button class="row-link" data-action="show-on-map" type="button" title="Filter map to this package">View</button>
            ${aerialBtn}
          </td>
        </tr>`;
    })
    .join("");

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
          <th>Map</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  target.querySelectorAll("tr.package-row").forEach((tr) => {
    tr.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.dataset.stop === "1") return;
      if (target instanceof HTMLAnchorElement) return;
      const id = tr.getAttribute("data-package-id");
      if (id) showPackageOnMap(id);
    });
  });
}

function showPackageOnMap(packageId) {
  const filter = document.getElementById("package-filter");
  if (!filter) return;
  const optionExists = Array.from(filter.options).some((o) => o.value === packageId);
  if (!optionExists) return;
  if (filter.value !== packageId) {
    filter.value = packageId;
    filter.dispatchEvent(new Event("change"));
  } else {
    drawAssets(state.lastAssets, state.lastMode).catch((err) =>
      setStatus(err.message, true)
    );
  }
  document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const [Map, MapView, GraphicsLayer, Graphic] = await Promise.all([
    window.requireAsync("esri/Map"),
    window.requireAsync("esri/views/MapView"),
    window.requireAsync("esri/layers/GraphicsLayer"),
    window.requireAsync("esri/Graphic"),
  ]);

  state.Graphic = Graphic;
  state.graphicsLayer = new GraphicsLayer();
  state.selectionLayer = new GraphicsLayer();
  const map = new Map({
    basemap: "streets-navigation-vector",
    layers: [state.graphicsLayer, state.selectionLayer],
  });

  state.mapView = new MapView({
    container: "map",
    map,
    center: [151.22, -33.75],
    zoom: 11,
  });

  state.mapView.on("click", async (event) => {
    try {
      const response = await state.mapView.hitTest(event, {
        include: state.graphicsLayer,
      });
      const hit = response.results.find(
        (r) => r.graphic && r.graphic.attributes && r.graphic.attributes.asset_id != null
      );
      if (hit) {
        const id = String(hit.graphic.attributes.asset_id);
        selectPipe(id, { source: "map", zoom: false });
      }
    } catch (error) {
      console.warn("hitTest failed:", error);
    }
  });
}

async function drawAssets(assets, mode) {
  await ensureMap();
  const Graphic = state.Graphic;

  state.lastAssets = Array.isArray(assets) ? assets : [];
  state.lastMode = mode;
  refreshPackageFilter(state.lastAssets, mode);
  setFallbackNote("");

  state.graphicsLayer.removeAll();
  state.selectionLayer.removeAll();
  state.graphicByAssetId = new Map();

  if (!assets || assets.length === 0) {
    refreshPipeList();
    refreshAerialLink();
    return;
  }

  const filterValue = document.getElementById("package-filter")?.value || "__all__";
  const visible =
    mode === "package" && filterValue !== "__all__"
      ? assets.filter((a) => String(a.package_id ?? "") === filterValue)
      : assets;

  let lineCount = 0;
  let fallbackCount = 0;
  const graphics = [];

  visible.forEach((asset) => {
    const color =
      mode === "package" ? colorForPackageId(asset.package_id) : "#bf8d2c";
    const popupTemplate = {
      title: asset.package_id
        ? `${asset.package_id} - ${asset.asset_id ?? "Pipe"}`
        : `${asset.asset_id ?? "Pipe"}`,
      content: popupContent(asset),
    };

    let graphic = null;
    if (hasPipeEndpoints(asset)) {
      const weight = getPipeWeight(Number(asset.diameter_mm));
      graphic = new Graphic({
        geometry: {
          type: "polyline",
          paths: [[
            [Number(asset.x_start), Number(asset.y_start)],
            [Number(asset.x_end), Number(asset.y_end)],
          ]],
          spatialReference: { wkid: MGA_Z56_WKID },
        },
        attributes: asset,
        popupTemplate,
        symbol: {
          type: "simple-line",
          color,
          width: weight,
          cap: "round",
          join: "round",
        },
      });
      lineCount += 1;
    } else if (hasPipeMidpoint(asset)) {
      graphic = new Graphic({
        geometry: {
          type: "point",
          x: Number(asset.x_mid),
          y: Number(asset.y_mid),
          spatialReference: { wkid: MGA_Z56_WKID },
        },
        attributes: asset,
        popupTemplate,
        symbol: {
          type: "simple-marker",
          style: mode === "package" ? "circle" : "diamond",
          color,
          size: mode === "package" ? 10 : 9,
          outline: { color: "#ffffff", width: 1.2 },
        },
      });
      fallbackCount += 1;
    } else {
      fallbackCount += 1;
    }

    if (graphic) {
      graphics.push(graphic);
      if (asset.asset_id != null) {
        state.graphicByAssetId.set(String(asset.asset_id), graphic);
      }
    }
  });

  if (fallbackCount > 0) {
    console.warn(`drawAssets: ${fallbackCount} pipe(s) lacked endpoints — fell back to point or were skipped`);
    setFallbackNote(`${fallbackCount} pipe(s) drawn as fallback markers (missing endpoints).`);
  }

  state.graphicsLayer.addMany(graphics);
  if (graphics.length > 0) {
    await state.mapView.goTo(graphics);
  } else if (visible.length > 0) {
    setFallbackNote(
      `No valid pipe geometry to draw — ${visible.length} pipe(s) had missing or invalid coordinates.`
    );
  }

  refreshPipeList();
  refreshAerialLink();

  if (state.selectedAssetId && state.graphicByAssetId.has(state.selectedAssetId)) {
    applySelectionHighlight(state.selectedAssetId);
  } else {
    state.selectedAssetId = null;
  }

  console.info(`drawAssets: drew ${lineCount} line(s), ${fallbackCount} fallback(s)`);
}

function getCurrentPackageId() {
  const filter = document.getElementById("package-filter");
  if (!filter || state.lastMode !== "package") return null;
  const v = filter.value;
  return v && v !== "__all__" ? v : null;
}

function getVisibleAssets() {
  const pkgId = getCurrentPackageId();
  if (!pkgId) return state.lastAssets;
  return state.lastAssets.filter((a) => String(a.package_id ?? "") === pkgId);
}

function applySelectionHighlight(assetId) {
  if (!state.selectionLayer || !state.Graphic) return;
  state.selectionLayer.removeAll();
  const graphic = state.graphicByAssetId.get(String(assetId));
  if (!graphic) return;
  const baseWidth = graphic.symbol?.width ?? 6;
  const symbol =
    graphic.geometry.type === "polyline"
      ? {
          type: "simple-line",
          color: [255, 215, 0, 0.95],
          width: Math.max(baseWidth + 4, 6),
          cap: "round",
          join: "round",
        }
      : {
          type: "simple-marker",
          style: "circle",
          color: [255, 215, 0, 0.6],
          size: (graphic.symbol?.size ?? 10) + 6,
          outline: { color: [255, 215, 0, 0.95], width: 2 },
        };
  state.selectionLayer.add(
    new state.Graphic({
      geometry: graphic.geometry,
      symbol,
    })
  );
}

function selectPipe(assetId, opts = {}) {
  const id = assetId == null ? null : String(assetId);
  state.selectedAssetId = id;

  if (!id) {
    state.selectionLayer?.removeAll();
    syncPipeListSelection(null);
    return;
  }

  applySelectionHighlight(id);
  syncPipeListSelection(id);

  if (opts.source !== "table") {
    scrollPipeRowIntoView(id);
  }

  if (opts.zoom !== false) {
    const graphic = state.graphicByAssetId.get(id);
    if (graphic && state.mapView) {
      const target =
        graphic.geometry.type === "polyline"
          ? { target: graphic.geometry, zoom: Math.max(state.mapView.zoom, 17) }
          : { target: graphic.geometry, zoom: 18 };
      state.mapView.goTo(target, { duration: 350 }).catch(() => {});
    }
  }
}

function syncPipeListSelection(assetId) {
  document.querySelectorAll("#pipe-list tbody tr.selected").forEach((tr) => {
    tr.classList.remove("selected");
  });
  if (!assetId) return;
  const row = document.querySelector(
    `#pipe-list tbody tr[data-asset-id="${cssEscape(assetId)}"]`
  );
  if (row) row.classList.add("selected");
}

function scrollPipeRowIntoView(assetId) {
  const row = document.querySelector(
    `#pipe-list tbody tr[data-asset-id="${cssEscape(assetId)}"]`
  );
  if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function cssEscape(s) {
  return String(s).replace(/(["\\])/g, "\\$1");
}

function refreshPipeList() {
  const row = document.getElementById("pipe-list-row");
  const target = document.getElementById("pipe-list");
  const title = document.getElementById("pipe-list-title");
  if (!row || !target) return;

  const pkgId = getCurrentPackageId();
  if (!pkgId) {
    row.classList.add("hidden");
    target.innerHTML = "";
    return;
  }

  const pipes = getVisibleAssets();
  if (!pipes.length) {
    row.classList.add("hidden");
    target.innerHTML = "";
    return;
  }

  if (title) title.textContent = `Pipes in package ${pkgId}`;
  const rows = pipes
    .map((p) => {
      const dia = isFiniteNumber(p.diameter_mm) ? Number(p.diameter_mm).toFixed(0) : "—";
      const len = isFiniteNumber(p.length_m) ? Number(p.length_m).toFixed(1) : "—";
      const cost = isFiniteNumber(p.pipe_cost) ? `$${Number(p.pipe_cost).toLocaleString()}` : "—";
      const id = p.asset_id == null ? "" : String(p.asset_id);
      return `<tr data-asset-id="${cssEscape(id)}">
        <td>${id || "—"}</td>
        <td>${p.suburb ?? "—"}</td>
        <td>${dia}</td>
        <td>${len}</td>
        <td>${cost}</td>
        <td>${p.us_node ?? "—"} → ${p.ds_node ?? "—"}</td>
      </tr>`;
    })
    .join("");

  target.innerHTML = `
    <table class="pipe-table">
      <thead>
        <tr>
          <th>Asset</th><th>Suburb</th><th>Dia (mm)</th><th>Len (m)</th><th>Cost</th><th>US → DS pit</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  target.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => {
      const id = tr.getAttribute("data-asset-id");
      if (id) selectPipe(id, { source: "table", zoom: true });
    });
  });

  row.classList.remove("hidden");
  syncPipeListSelection(state.selectedAssetId);
}

function wgsBoundsForAssets(assets) {
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  let count = 0;
  (assets || []).forEach((a) => {
    if (isFiniteNumber(a.lat) && isFiniteNumber(a.lon)) {
      const lat = Number(a.lat);
      const lon = Number(a.lon);
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      count += 1;
    }
  });
  if (count === 0) return null;
  return {
    minLat, maxLat, minLon, maxLon,
    centerLat: (minLat + maxLat) / 2,
    centerLon: (minLon + maxLon) / 2,
    count,
  };
}

function zoomLevelForBounds(bounds) {
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 1e-5);
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 1e-5);
  const span = Math.max(latSpan, lonSpan);
  const zoom = Math.round(Math.log2(360 / span));
  return Math.max(10, Math.min(20, zoom));
}

function googleMapsUrlForAssets(assets) {
  const bounds = wgsBoundsForAssets(assets);
  if (!bounds) return null;
  const zoom = zoomLevelForBounds(bounds);
  const params = new URLSearchParams({
    api: "1",
    map_action: "map",
    center: `${bounds.centerLat.toFixed(6)},${bounds.centerLon.toFixed(6)}`,
    zoom: String(zoom),
    basemap: "satellite",
  });
  return `https://www.google.com/maps/?${params.toString()}`;
}

function refreshAerialLink() {
  const link = document.getElementById("aerial-link");
  if (!link) return;
  const pkgId = getCurrentPackageId();
  if (!pkgId) {
    link.classList.add("hidden");
    link.removeAttribute("href");
    return;
  }
  const url = googleMapsUrlForAssets(getVisibleAssets());
  if (!url) {
    link.classList.add("hidden");
    link.removeAttribute("href");
    return;
  }
  link.href = url;
  link.textContent = `Open ${pkgId} in Google Maps (aerial)`;
  link.classList.remove("hidden");
}

function refreshPackageFilter(assets, mode) {
  const row = document.getElementById("map-filter-row");
  const select = document.getElementById("package-filter");
  if (!row || !select) return;

  if (mode !== "package") {
    row.classList.add("hidden");
    select.innerHTML = "";
    return;
  }

  const ids = Array.from(
    new Set(
      (assets || [])
        .map((a) => (a.package_id == null ? "" : String(a.package_id)))
        .filter((s) => s)
    )
  ).sort();

  if (ids.length === 0) {
    row.classList.add("hidden");
    select.innerHTML = "";
    return;
  }

  const previous = select.value;
  const opts = ['<option value="__all__">All packages</option>']
    .concat(ids.map((id) => `<option value="${id}">${id}</option>`))
    .join("");
  select.innerHTML = opts;
  if (previous && (previous === "__all__" || ids.includes(previous))) {
    select.value = previous;
  }
  row.classList.remove("hidden");
}

function setFallbackNote(text) {
  const note = document.getElementById("fallback-note");
  if (note) note.textContent = text || "";
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
  state.selectedAssetId = null;
  await drawAssets(data.map_assets?.relining || [], "preview");
  renderTable([]);
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
  state.selectedAssetId = null;
  await drawAssets(data.map_assets || [], "package");
  renderTable(data.packages || []);
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

  const packageFilter = document.getElementById("package-filter");
  if (packageFilter) {
    packageFilter.addEventListener("change", () => {
      drawAssets(state.lastAssets, state.lastMode).catch((error) =>
        setStatus(error.message, true)
      );
    });
  }

  try {
    await Promise.all([loadHealth(), loadConfig(), ensureMap()]);
    setStatus("Configuration loaded. Preview the streams or generate packages.");
  } catch (error) {
    setStatus(error.message, true);
  }
}

init();
