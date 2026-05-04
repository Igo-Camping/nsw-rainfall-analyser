const appState = {
  config: null,
  lastGenerateResponse: null,
  mapView: null,
  graphicsLayer: null,
  sizeGroups: [[], [], [], []],
  tableSort: {},
};

function buildAppUrl(path) {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return new URL(cleanPath, window.location.href).toString();
}

function setStatus(message, isError = false) {
  const el = document.getElementById("status");
  el.textContent = message;
  el.style.color = isError ? "#a33f1f" : "";
}

function setLoading(isLoading, title = "Working...", message = "Preparing package data.") {
  const overlay = document.getElementById("loading-overlay");
  const titleEl = document.getElementById("loading-title");
  const messageEl = document.getElementById("loading-message");
  const previewButton = document.getElementById("preview-button");
  const generateButton = document.getElementById("generate-button");
  const downloadButton = document.getElementById("download-zip");

  titleEl.textContent = title;
  messageEl.textContent = message;
  overlay.classList.toggle("hidden", !isLoading);
  overlay.style.display = isLoading ? "grid" : "none";
  previewButton.disabled = isLoading;
  generateButton.disabled = isLoading;
  downloadButton.disabled = isLoading;
}

function requireAsync(moduleName) {
  return new Promise((resolve, reject) => window.require([moduleName], resolve, reject));
}

async function ensureMap() {
  if (appState.mapView) return;

  const [Map, MapView, GraphicsLayer] = await Promise.all([
    requireAsync("esri/Map"),
    requireAsync("esri/views/MapView"),
    requireAsync("esri/layers/GraphicsLayer"),
  ]);

  appState.graphicsLayer = new GraphicsLayer();
  const map = new Map({
    basemap: "streets-navigation-vector",
    layers: [appState.graphicsLayer],
  });

  appState.mapView = new MapView({
    container: "map",
    map,
    center: [151.22, -33.75],
    zoom: 11,
  });
}

function updateConditionalFields() {
  const costMode = document.getElementById("cost-mode").value;
  const packagingMode = document.getElementById("packaging-mode").value;
  document.getElementById("contractor-field").classList.toggle("hidden", costMode !== "contractor");
  document.getElementById("max-package-value-field").classList.toggle("hidden", packagingMode !== "Max package value");
  document.getElementById("pipes-per-package-field").classList.toggle("hidden", packagingMode !== "Pipes per package");
  document.getElementById("topup-field").classList.toggle("hidden", packagingMode !== "Max package value");
}

function populateSelect(id, values, formatter = (value) => value) {
  const select = document.getElementById(id);
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = formatter(value);
    select.appendChild(option);
  });
}

function renderSizeGroup(groupIndex) {
  const container = document.getElementById(`size-group-${groupIndex + 1}-pills`);
  const values = appState.sizeGroups[groupIndex];
  container.innerHTML = "";
  if (!values.length) {
    container.textContent = "No pipe sizes selected.";
    return;
  }

  values.forEach((value) => {
    const pill = document.createElement("span");
    pill.className = "size-pill";
    pill.innerHTML = `${value} mm <button type="button" data-group="${groupIndex}" data-value="${value}" aria-label="Remove ${value} mm">x</button>`;
    container.appendChild(pill);
  });
}

function renderAllSizeGroups() {
  for (let i = 0; i < 4; i += 1) {
    renderSizeGroup(i);
  }
}

function addSizeToGroup(groupIndex) {
  const select = document.getElementById(`size-group-${groupIndex + 1}-select`);
  const value = Number(select.value);
  if (!Number.isFinite(value)) {
    return;
  }

  if (!appState.sizeGroups[groupIndex].includes(value)) {
    appState.sizeGroups[groupIndex].push(value);
    appState.sizeGroups[groupIndex].sort((a, b) => a - b);
  }
  renderSizeGroup(groupIndex);
}

function removeSizeFromGroup(groupIndex, value) {
  appState.sizeGroups[groupIndex] = appState.sizeGroups[groupIndex].filter((item) => item !== value);
  renderSizeGroup(groupIndex);
}

function renderChips(values) {
  const container = document.getElementById("summary-chips");
  container.innerHTML = "";
  values.forEach((value) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = value;
    container.appendChild(chip);
  });
}

function compareTableValues(left, right) {
  const leftBlank = left === null || left === undefined || left === "";
  const rightBlank = right === null || right === undefined || right === "";
  if (leftBlank && rightBlank) return 0;
  if (leftBlank) return 1;
  if (rightBlank) return -1;

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const leftIsNumber = Number.isFinite(leftNumber) && `${left}`.trim() !== "";
  const rightIsNumber = Number.isFinite(rightNumber) && `${right}`.trim() !== "";
  if (leftIsNumber && rightIsNumber) {
    return leftNumber - rightNumber;
  }

  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

function getSortedRows(containerId, rows, columns) {
  const currentSort = appState.tableSort[containerId];
  if (!currentSort) {
    return rows;
  }

  const column = columns.find((item) => item.key === currentSort.key);
  if (!column) {
    return rows;
  }

  const direction = currentSort.direction === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const primary = compareTableValues(left[column.key], right[column.key]) * direction;
    if (primary !== 0) {
      return primary;
    }
    return compareTableValues(left[columns[0].key], right[columns[0].key]);
  });
}

function renderTable(containerId, rows, columns, emptyText) {
  const target = document.getElementById(containerId);
  if (!rows || rows.length === 0) {
    target.textContent = emptyText;
    return;
  }

  const currentSort = appState.tableSort[containerId];
  const sortedRows = getSortedRows(containerId, rows, columns);
  const head = columns.map((col) => {
    const isActive = currentSort && currentSort.key === col.key;
    const marker = isActive ? (currentSort.direction === "asc" ? " ▲" : " ▼") : "";
    return `<th><button type="button" class="sort-button${isActive ? " active" : ""}" data-table="${containerId}" data-key="${col.key}">${col.label}${marker}</button></th>`;
  }).join("");
  const body = sortedRows.map((row) => {
    const cells = columns.map((col) => `<td>${row[col.key] ?? ""}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  target.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function packageTableColumns() {
  return [
    { key: "package_priority_rank", label: "Priority Rank" },
    { key: "package_priority_score", label: "Priority Score" },
    { key: "package_id", label: "Package" },
    { key: "suburb", label: "Suburb" },
    { key: "pipe_count", label: "Pipes" },
    { key: "total_length_m", label: "Length (m)" },
    { key: "total_cost", label: "Cost ($)" },
  ];
}

function payloadFromForm() {
  return {
    relining_mode: document.getElementById("relining-mode").value,
    cost_mode: document.getElementById("cost-mode").value,
    contractor: document.getElementById("contractor").value || null,
    packaging_mode: document.getElementById("packaging-mode").value,
    grouping_method: document.getElementById("grouping-method").value,
    max_package_value: Number(document.getElementById("max-package-value").value || 50000),
    pipes_per_package: Number(document.getElementById("pipes-per-package").value || 10),
    size_groups: appState.sizeGroups.filter((group) => group.length > 0),
    traffic_control: document.getElementById("traffic-control").checked,
    project_initiation: document.getElementById("project-initiation").checked,
    topup_mode: document.getElementById("topup-mode").value,
  };
}

async function apiGet(path) {
  const response = await fetch(buildAppUrl(path));
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function apiPost(path, payload) {
  const response = await fetch(buildAppUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json();
}

function featureColor(packageId) {
  const palette = ["#1f6c45", "#c28f33", "#2c7fb8", "#d95f0e", "#7a4ea1", "#567d2f"];
  if (!packageId) return palette[0];
  let hash = 0;
  for (let i = 0; i < packageId.length; i += 1) {
    hash = ((hash << 5) - hash) + packageId.charCodeAt(i);
    hash |= 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

async function drawAssets(assets, mode) {
  await ensureMap();
  const [Graphic] = await Promise.all([requireAsync("esri/Graphic")]);
  appState.graphicsLayer.removeAll();

  const graphics = (assets || [])
    .filter((asset) => Number.isFinite(Number(asset.XMid)) && Number.isFinite(Number(asset.YMid)))
    .map((asset) => new Graphic({
      geometry: {
        type: "point",
        x: Number(asset.XMid),
        y: Number(asset.YMid),
        spatialReference: { wkid: 28356 },
      },
      attributes: asset,
      popupTemplate: {
        title: asset.package_id ? `${asset.package_id} - ${asset.Asset || "Pipe"}` : (asset.Asset || "Pipe"),
        content: `
          <b>Suburb:</b> ${asset["Asset Suburb"] || ""}<br>
          <b>Diameter:</b> ${asset["SWP_Pipe Diameter_mm"] || ""}<br>
          <b>Length:</b> ${asset["Spatial Length_m"] || ""}<br>
          <b>Condition:</b> ${asset["SW_Condition"] || ""}<br>
          <b>Pipe cost:</b> ${asset.pipe_cost || ""}
        `,
      },
      symbol: {
        type: "simple-marker",
        style: mode === "preview" ? "diamond" : "circle",
        color: mode === "preview" ? "#c28f33" : featureColor(asset.package_id),
        size: mode === "preview" ? 9 : 10,
        outline: {
          color: "#ffffff",
          width: 1.2,
        },
      },
    }));

  if (graphics.length === 0) {
    return;
  }

  appState.graphicsLayer.addMany(graphics);
  await appState.mapView.goTo(graphics);
}

async function loadBootstrap() {
  const [health, config, contractors] = await Promise.all([
    apiGet("/health"),
    apiGet("/packaging/config"),
    apiGet("/packaging/contractors"),
    ensureMap(),
  ]);

  appState.config = config;

  populateSelect("relining-mode", config.relining_modes);
  populateSelect("cost-mode", config.cost_modes);
  populateSelect("packaging-mode", config.packaging_modes);
  populateSelect("grouping-method", config.grouping_methods);
  populateSelect("topup-mode", config.topup_modes);
  populateSelect("contractor", ["", ...(contractors.contractors || [])], (value) => value || "Select contractor");

  const diameters = config.available_relining_diameters || [];
  ["size-group-1-select", "size-group-2-select", "size-group-3-select", "size-group-4-select"].forEach((id) => {
    populateSelect(id, diameters, (value) => `${value} mm`);
  });
  renderAllSizeGroups();

  updateConditionalFields();
  const coordText = health.has_coordinates ? "coordinates available" : "coordinates missing";
  setStatus(`Configuration loaded with ${Number(health.assets_loaded || 0).toLocaleString()} assets and ${coordText}.`);
}

async function handlePreview() {
  const reliningMode = document.getElementById("relining-mode").value;
  setStatus("Loading stream preview...");
  setLoading(true, "Previewing streams", "Checking the relining and reconstruction candidates on the server.");
  try {
    const data = await apiPost("/packaging/split-streams", { relining_mode: reliningMode });

    renderChips([
      `Relining: ${data.streams?.[0]?.pipe_count ?? 0} pipes`,
      `Reconstruction: ${data.streams?.[2]?.pipe_count ?? 0} pipes`,
    ]);

    renderTable(
      "stream-table",
      (data.streams || []).filter((stream) => stream.name !== "Amplification"),
      [
        { key: "name", label: "Stream" },
        { key: "pipe_count", label: "Pipes" },
        { key: "total_length_m", label: "Length (m)" },
      ],
      "No stream preview loaded yet.",
    );

    renderTable("results-table", [], [], "No package results yet.");
    appState.lastGenerateResponse = null;
    await drawAssets(data.map_assets?.relining || [], "preview");
    setStatus("Preview loaded.");
  } finally {
    setLoading(false);
  }
}

async function handleGenerate() {
  setStatus("Generating relining packages in Python...");
  setLoading(true, "Generating packages", "Grouping pipes, applying costs, and ranking the package outputs.");
  try {
    const data = await apiPost("/packaging/generate-relining-packages", payloadFromForm());
    appState.lastGenerateResponse = data;

    renderChips([
      `Packages: ${data.package_count ?? 0}`,
      `Costed pipes: ${data.costed_pipe_count ?? 0}`,
      `Uncosted pipes: ${data.uncosted_pipe_count ?? 0}`,
      `Total cost: $${Number(data.total_cost || 0).toLocaleString()}`,
    ]);

    renderTable(
      "results-table",
      data.packages || [],
      packageTableColumns(),
      "No package results yet.",
    );

    await drawAssets(data.map_assets || [], "package");
    setStatus("Packages generated.");
  } finally {
    setLoading(false);
  }
}

async function downloadZip() {
  if (!appState.lastGenerateResponse) {
    setStatus("Generate packages before downloading outputs.", true);
    return;
  }

  setLoading(true, "Preparing download", "Building the package ZIP and Excel summaries.");
  try {
    const response = await fetch("/packaging/export-relining-packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFromForm()),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Export failed: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "relining_packages.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("Package ZIP downloaded.");
  } finally {
    setLoading(false);
  }
}

async function init() {
  document.getElementById("cost-mode").addEventListener("change", updateConditionalFields);
  document.getElementById("packaging-mode").addEventListener("change", updateConditionalFields);
  document.getElementById("preview-button").addEventListener("click", () => handlePreview().catch((error) => setStatus(error.message, true)));
  document.getElementById("generate-button").addEventListener("click", () => handleGenerate().catch((error) => setStatus(error.message, true)));
  document.getElementById("download-zip").addEventListener("click", () => downloadZip().catch((error) => setStatus(error.message, true)));
  document.querySelectorAll(".size-add").forEach((button) => {
    button.addEventListener("click", () => addSizeToGroup(Number(button.dataset.group)));
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.matches(".size-pill button")) {
      removeSizeFromGroup(Number(target.dataset.group), Number(target.dataset.value));
      return;
    }
    if (target.matches(".sort-button")) {
      const tableId = target.dataset.table;
      const key = target.dataset.key;
      const currentSort = appState.tableSort[tableId];
      const nextDirection = currentSort && currentSort.key === key && currentSort.direction === "asc" ? "desc" : "asc";
      appState.tableSort[tableId] = { key, direction: nextDirection };

      if (tableId === "results-table" && appState.lastGenerateResponse) {
        renderTable(
          "results-table",
          appState.lastGenerateResponse.packages || [],
          packageTableColumns(),
          "No package results yet.",
        );
        return;
      }

      if (tableId === "stream-table") {
        const streamTable = document.getElementById("stream-table");
        if (streamTable.dataset.rows && streamTable.dataset.columns) {
          renderTable(
            "stream-table",
            JSON.parse(streamTable.dataset.rows),
            JSON.parse(streamTable.dataset.columns),
            "No stream preview loaded yet.",
          );
        }
      }
    }
  });

  try {
    await loadBootstrap();
  } catch (error) {
    setStatus(error.message, true);
  }
}

init();
