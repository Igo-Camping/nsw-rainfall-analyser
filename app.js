import { DURATION_LABELS, calculateAep, formatDuration, formatNumber, validateIfdDataset, validateRainfallInput } from "./calcService.js";
import { LOCATIONS, loadIfdDataset } from "./dataService.js";

const state = {
  activeDataset: null,
  chart: null,
};

const elements = {
  form: document.querySelector("#aep-form"),
  locationSelect: document.querySelector("#location"),
  depthInput: document.querySelector("#rainfall-depth"),
  durationSelect: document.querySelector("#duration"),
  error: document.querySelector("#form-error"),
  emptyState: document.querySelector("#empty-state"),
  resultContent: document.querySelector("#result-content"),
  resultBand: document.querySelector("#result-band"),
  aepValue: document.querySelector("#aep-value"),
  aepEventLabel: document.querySelector("#aep-event-label"),
  ariValue: document.querySelector("#ari-value"),
  intensityValue: document.querySelector("#intensity-value"),
  depthValue: document.querySelector("#depth-value"),
  durationValue: document.querySelector("#duration-value"),
  interpretation: document.querySelector("#interpretation"),
  chartCanvas: document.querySelector("#aep-chart"),
  chartLocation: document.querySelector("#chart-location"),
  chartStatus: document.querySelector("#chart-status"),
};

async function initialiseApp() {
  populateLocations();
  elements.locationSelect.addEventListener("change", handleLocationChange);
  elements.depthInput.addEventListener("input", updateChartUserPoint);
  elements.durationSelect.addEventListener("change", updateChartUserPoint);
  elements.form.addEventListener("submit", handleSubmit);
  await loadSelectedLocation();
}

function populateLocations() {
  const options = LOCATIONS.map((location) => {
    const option = document.createElement("option");
    option.value = location.id;
    option.textContent = location.label;
    return option;
  });

  elements.locationSelect.replaceChildren(...options);
  elements.locationSelect.value = "sydney";
}

async function handleLocationChange() {
  clearError();
  setLoadingState(true);

  try {
    await loadSelectedLocation();
    resetResult();
  } catch (error) {
    showError(error.message);
  } finally {
    setLoadingState(false);
  }
}

async function loadSelectedLocation() {
  const dataset = await loadIfdDataset(elements.locationSelect.value);
  validateIfdDataset(dataset);
  state.activeDataset = dataset;
  populateDurations(dataset);
  renderAepChart(dataset);
}

function populateDurations(dataset) {
  const previousDuration = Number(elements.durationSelect.value);
  const options = dataset.duration.map((durationMinutes) => {
    const option = document.createElement("option");
    option.value = String(durationMinutes);
    option.textContent = DURATION_LABELS.get(durationMinutes) || `${durationMinutes} min`;
    return option;
  });

  elements.durationSelect.replaceChildren(...options);
  elements.durationSelect.value = dataset.duration.includes(previousDuration)
    ? String(previousDuration)
    : "60";
}

async function handleSubmit(event) {
  event.preventDefault();
  clearError();

  try {
    if (!state.activeDataset) {
      await loadSelectedLocation();
    }

    const input = readAnalysisInput();
    const validation = validateRainfallInput(input, state.activeDataset);

    if (!validation.valid) {
      showError(validation.message);
      getInputElement(validation.field)?.focus();
      return;
    }

    const result = calculateAep(input.depthMm, input.durationMinutes, state.activeDataset);
    renderResult(result);
    updateChartUserPoint();
  } catch (error) {
    showError(error.message);
  }
}

function readAnalysisInput() {
  return {
    depthMm: Number(elements.depthInput.value),
    durationMinutes: Number(elements.durationSelect.value),
  };
}

function getInputElement(field) {
  if (field === "depth") {
    return elements.depthInput;
  }

  if (field === "duration") {
    return elements.durationSelect;
  }

  return null;
}

function renderResult(result) {
  elements.emptyState.hidden = true;
  elements.resultContent.hidden = false;
  elements.aepValue.textContent = result.aepLabel;
  elements.aepEventLabel.textContent = result.ariLabel;
  elements.ariValue.textContent = result.ariDisplay;
  elements.intensityValue.textContent = `${formatNumber(result.intensity, 1)} mm/hr`;
  elements.depthValue.textContent = `${formatNumber(result.depthMm, 1)} mm`;
  elements.durationValue.textContent = result.durationLabel;
  elements.interpretation.textContent = `${result.location}: ${result.category.description} Source: ${result.source}.`;

  elements.resultBand.className = `pa-badge ${result.category.badgeClass}`;
  elements.resultBand.textContent = result.category.label;
}

function renderAepChart(dataset) {
  const ChartConstructor = globalThis.Chart;

  elements.chartLocation.textContent = dataset.location || "Selected station";

  if (!ChartConstructor) {
    elements.chartStatus.textContent = "Chart.js could not be loaded.";
    return;
  }

  const config = createChartConfig(dataset, getUserPoint());

  if (state.chart) {
    state.chart.destroy();
  }

  state.chart = new ChartConstructor(elements.chartCanvas, config);
  elements.chartStatus.textContent = "AEP curves loaded. Enter rainfall depth to plot the event point.";
}

function createChartConfig(dataset, userPoint) {
  const curveColours = ["#82d8ca", "#56c7b5", "#3eb6a4", "#b6a36b", "#d76f52"];
  const labels = dataset.duration.map(formatDuration);
  const curveDatasets = dataset.aep_levels.map((aepLevel, aepIndex) => ({
    label: `${aepLevel} AEP`,
    data: dataset.values.map((row) => row[aepIndex]),
    borderColor: curveColours[aepIndex % curveColours.length],
    backgroundColor: curveColours[aepIndex % curveColours.length],
    borderWidth: 2,
    pointRadius: 3,
    pointHoverRadius: 5,
    tension: 0,
  }));

  return {
    type: "line",
    data: {
      labels,
      datasets: [
        ...curveDatasets,
        {
          type: "scatter",
          label: "Input event",
          data: userPoint ? [{ x: formatDuration(userPoint.durationMinutes), y: userPoint.depthMm }] : [],
          borderColor: "#f0b09e",
          backgroundColor: "#f0b09e",
          borderWidth: 2,
          pointRadius: 7,
          pointHoverRadius: 9,
          pointStyle: "rectRot",
          showLine: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: "nearest",
      },
      plugins: {
        legend: {
          labels: {
            color: "#d9e3e2",
            boxHeight: 10,
            boxWidth: 18,
            font: {
              family: "'IBM Plex Mono', 'Cascadia Mono', Consolas, monospace",
              size: 11,
            },
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              const label = context.dataset.label || "Value";
              const value = formatNumber(context.parsed.y, 1);
              return `${label}: ${value} mm`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Duration",
            color: "#a8b8ba",
          },
          grid: {
            color: "rgba(200, 210, 212, 0.12)",
          },
          ticks: {
            color: "#a8b8ba",
            maxRotation: 0,
            autoSkip: true,
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Rainfall depth (mm)",
            color: "#a8b8ba",
          },
          grid: {
            color: "rgba(200, 210, 212, 0.12)",
          },
          ticks: {
            color: "#a8b8ba",
          },
        },
      },
    },
  };
}

function updateChartUserPoint() {
  if (!state.activeDataset || !state.chart) {
    return;
  }

  const userPointDataset = state.chart.data.datasets[state.chart.data.datasets.length - 1];
  const userPoint = getUserPoint();
  userPointDataset.data = userPoint
    ? [{ x: formatDuration(userPoint.durationMinutes), y: userPoint.depthMm }]
    : [];
  state.chart.update();

  elements.chartStatus.textContent = userPoint
    ? `Input event plotted at ${formatNumber(userPoint.depthMm, 1)} mm over ${formatDuration(userPoint.durationMinutes)}.`
    : "AEP curves loaded. Enter rainfall depth to plot the event point.";
}

function getUserPoint() {
  if (!state.activeDataset) {
    return null;
  }

  const input = readAnalysisInput();
  const validation = validateRainfallInput(input, state.activeDataset);

  if (!validation.valid) {
    return null;
  }

  return input;
}

function resetResult() {
  elements.emptyState.hidden = false;
  elements.resultContent.hidden = true;
  elements.resultBand.className = "pa-badge pa-badge--live";
  elements.resultBand.textContent = "Ready";
  elements.aepValue.textContent = "--";
  elements.aepEventLabel.textContent = "";
  updateChartUserPoint();
}

function setLoadingState(isLoading) {
  elements.locationSelect.disabled = isLoading;
  elements.durationSelect.disabled = isLoading;
  elements.depthInput.disabled = isLoading;
  elements.form.querySelector("button[type='submit']").disabled = isLoading;
  elements.resultBand.textContent = isLoading ? "Loading" : "Ready";
}

function showError(message) {
  elements.error.textContent = message;
}

function clearError() {
  elements.error.textContent = "";
}

initialiseApp().catch((error) => {
  showError(error.message);
});
