export const DURATION_LABELS = new Map([
  [5, "5 min"],
  [10, "10 min"],
  [15, "15 min"],
  [30, "30 min"],
  [60, "1 hr"],
  [120, "2 hr"],
  [180, "3 hr"],
  [360, "6 hr"],
  [720, "12 hr"],
  [1440, "24 hr"],
]);

export const EXPECTED_UNITS = {
  rainfall_depth: "mm",
  duration: "minutes",
  aep: "percent",
};

export const ENGINEERING_LIMITS = {
  minDepthMm: 0.1,
  maxDepthMm: 5000,
};

export function validateIfdDataset(dataset) {
  validateDatasetUnits(dataset);

  if (!Array.isArray(dataset.duration) || !Array.isArray(dataset.aep_levels)) {
    throw new Error("IFD dataset must include duration and aep_levels arrays.");
  }

  if (!Array.isArray(dataset.values) || dataset.values.length !== dataset.duration.length) {
    throw new Error("IFD values matrix must include one row per duration.");
  }

  const aepValues = dataset.aep_levels.map(parseAepPercent);
  assertStrictlyDescending(aepValues, "AEP levels must run from frequent to rare.");
  assertStrictlyAscending(dataset.duration, "Durations must be sorted in ascending minutes.");

  dataset.values.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== dataset.aep_levels.length) {
      throw new Error(`IFD values row ${rowIndex} must include one value per AEP level.`);
    }

    row.forEach((depth, columnIndex) => {
      if (!Number.isFinite(depth) || depth <= 0) {
        throw new Error(`IFD depth at row ${rowIndex}, column ${columnIndex} must be a positive millimetre value.`);
      }
    });

    assertStrictlyAscending(row, `IFD depths for ${formatDuration(dataset.duration[rowIndex])} must increase as AEP becomes rarer.`);
  });
}

export function validateRainfallInput(input, dataset) {
  if (!Number.isFinite(input.depthMm)) {
    return {
      valid: false,
      message: "Enter rainfall depth in millimetres.",
      field: "depth",
    };
  }

  if (input.depthMm < ENGINEERING_LIMITS.minDepthMm) {
    return {
      valid: false,
      message: `Rainfall depth must be at least ${ENGINEERING_LIMITS.minDepthMm} mm.`,
      field: "depth",
    };
  }

  if (input.depthMm > ENGINEERING_LIMITS.maxDepthMm) {
    return {
      valid: false,
      message: `Rainfall depth exceeds the engineering sanity limit of ${formatNumber(ENGINEERING_LIMITS.maxDepthMm, 0)} mm.`,
      field: "depth",
    };
  }

  if (!Number.isFinite(input.durationMinutes) || !dataset.duration.includes(input.durationMinutes)) {
    return {
      valid: false,
      message: "Select a supported rainfall duration for the active location.",
      field: "duration",
    };
  }

  return { valid: true };
}

export function calculateAep(depthMm, durationMinutes, dataset) {
  const interpolation = interpolateAepFromDepth(depthMm, durationMinutes, dataset);
  const intensity = depthMm / (durationMinutes / 60);
  const durationLabel = formatDuration(durationMinutes);
  const category = classifyAep(interpolation);

  return {
    ...interpolation,
    category,
    depthMm,
    durationLabel,
    durationMinutes,
    intensity,
    location: dataset.location,
    source: dataset.source,
  };
}

export function interpolateAepFromDepth(depthMm, durationMinutes, dataset) {
  const durationIndex = dataset.duration.indexOf(durationMinutes);

  if (durationIndex === -1) {
    return createOutOfRangeResult("duration-out-of-range", null, null, null);
  }

  const depthRow = dataset.values[durationIndex];
  const aepLevels = dataset.aep_levels.map(parseAepPercent);
  const shallowestDepth = depthRow[0];
  const rarestDepth = depthRow[depthRow.length - 1];

  if (depthMm < shallowestDepth) {
    return createOutOfRangeResult("below-range", ">", aepLevels[0], {
      lowerAep: null,
      upperAep: dataset.aep_levels[0],
      lowerDepth: null,
      upperDepth: shallowestDepth,
    });
  }

  if (depthMm > rarestDepth) {
    const rarestAep = aepLevels[aepLevels.length - 1];

    return createOutOfRangeResult("above-range", "<", rarestAep, {
      lowerAep: dataset.aep_levels[dataset.aep_levels.length - 1],
      upperAep: null,
      lowerDepth: rarestDepth,
      upperDepth: null,
    });
  }

  for (let index = 0; index < depthRow.length - 1; index += 1) {
    const lowerDepth = depthRow[index];
    const upperDepth = depthRow[index + 1];

    if (depthMm >= lowerDepth && depthMm <= upperDepth) {
      const lowerAep = aepLevels[index];
      const upperAep = aepLevels[index + 1];
      const fraction = (depthMm - lowerDepth) / (upperDepth - lowerDepth);
      const aepPercent = lowerAep + fraction * (upperAep - lowerAep);
      const ariYears = aepPercentToAriYears(aepPercent);

      return {
        status: "interpolated",
        aepPercent,
        ariYears,
        aepLabel: formatAepResult(aepPercent),
        ariLabel: formatAriEvent(ariYears),
        ariDisplay: formatAriDisplay(ariYears),
        bracket: {
          lowerAep: dataset.aep_levels[index],
          upperAep: dataset.aep_levels[index + 1],
          lowerDepth,
          upperDepth,
        },
      };
    }
  }

  const exactAep = aepLevels[aepLevels.length - 1];
  const exactAri = aepPercentToAriYears(exactAep);

  return {
    status: "interpolated",
    aepPercent: exactAep,
    ariYears: exactAri,
    aepLabel: formatAepResult(exactAep),
    ariLabel: formatAriEvent(exactAri),
    ariDisplay: formatAriDisplay(exactAri),
    bracket: {
      lowerAep: dataset.aep_levels[dataset.aep_levels.length - 1],
      upperAep: dataset.aep_levels[dataset.aep_levels.length - 1],
      lowerDepth: rarestDepth,
      upperDepth: rarestDepth,
    },
  };
}

export function aepPercentToAriYears(aepPercent) {
  if (!Number.isFinite(aepPercent) || aepPercent <= 0 || aepPercent > 100) {
    throw new Error("AEP must be a percentage greater than 0 and no more than 100.");
  }

  return 100 / aepPercent;
}

export function ariYearsToAepPercent(ariYears) {
  if (!Number.isFinite(ariYears) || ariYears <= 0) {
    throw new Error("ARI must be greater than 0 years.");
  }

  return 100 / ariYears;
}

export function parseAepPercent(label) {
  const value = Number(String(label).replace("%", ""));

  if (!Number.isFinite(value) || value <= 0 || value > 100) {
    throw new Error(`Invalid AEP level: ${label}`);
  }

  return value;
}

export function formatAepResult(aepPercent, comparator = "") {
  return `${comparator}${formatAep(aepPercent)}% AEP`;
}

export function formatAriEvent(ariYears, comparator = "") {
  return `(${formatAriComparator(comparator)}1 in ${formatAriYears(ariYears)} year event)`;
}

export function formatAriDisplay(ariYears, comparator = "") {
  return `${comparator}1 in ${formatAriYears(ariYears)} yr`;
}

export function formatAep(value) {
  if (value < 1) {
    return formatNumber(value, 2);
  }

  if (value < 10) {
    return formatNumber(value, 1);
  }

  return formatNumber(value, 0);
}

export function formatAriYears(value) {
  if (value < 10) {
    return formatNumber(value, 1);
  }

  return formatNumber(value, 0);
}

export function formatDuration(durationMinutes) {
  return DURATION_LABELS.get(durationMinutes) || `${durationMinutes} min`;
}

export function formatNumber(value, digits) {
  return new Intl.NumberFormat("en-AU", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function validateDatasetUnits(dataset) {
  const units = dataset.units || {};

  Object.entries(EXPECTED_UNITS).forEach(([key, expectedUnit]) => {
    if (units[key] !== expectedUnit) {
      throw new Error(`IFD dataset unit mismatch: expected ${key} in ${expectedUnit}.`);
    }
  });
}

function assertStrictlyAscending(values, message) {
  for (let index = 1; index < values.length; index += 1) {
    if (!(values[index] > values[index - 1])) {
      throw new Error(message);
    }
  }
}

function assertStrictlyDescending(values, message) {
  for (let index = 1; index < values.length; index += 1) {
    if (!(values[index] < values[index - 1])) {
      throw new Error(message);
    }
  }
}

function createOutOfRangeResult(status, aepComparator, aepPercent, bracket) {
  if (status === "duration-out-of-range") {
    return {
      status,
      aepPercent: null,
      ariYears: null,
      aepLabel: "n/a",
      ariLabel: "",
      ariDisplay: "n/a",
      bracket,
    };
  }

  const ariYears = aepPercentToAriYears(aepPercent);
  const ariComparator = aepComparator === ">" ? "<" : ">";

  return {
    status,
    aepPercent,
    ariYears,
    aepLabel: formatAepResult(aepPercent, aepComparator),
    ariLabel: formatAriEvent(ariYears, ariComparator),
    ariDisplay: formatAriDisplay(ariYears, ariComparator),
    bracket,
  };
}

function classifyAep(result) {
  if (result.status === "below-range") {
    return {
      label: "Frequent",
      badgeClass: "pa-badge--live",
      description: "The rainfall depth is below the smallest available IFD depth, so the result is bounded as more frequent than the 50% AEP curve.",
    };
  }

  if (result.status === "above-range") {
    return {
      label: "Beyond IFD",
      badgeClass: "pa-badge--severe",
      description: "The rainfall depth is above the largest available IFD depth, so the result is bounded as rarer than the 1% AEP curve. No extrapolation has been applied.",
    };
  }

  if (result.aepPercent >= 20) {
    return {
      label: "Frequent",
      badgeClass: "pa-badge--live",
      description: buildInterpolatedDescription(result, "frequent"),
    };
  }

  if (result.aepPercent >= 5) {
    return {
      label: "Moderate",
      badgeClass: "pa-badge--warning",
      description: buildInterpolatedDescription(result, "moderate"),
    };
  }

  if (result.aepPercent >= 1) {
    return {
      label: "Rare",
      badgeClass: "pa-badge--warning",
      description: buildInterpolatedDescription(result, "rare"),
    };
  }

  return {
    label: "Extreme",
    badgeClass: "pa-badge--severe",
    description: buildInterpolatedDescription(result, "extreme"),
  };
}

function buildInterpolatedDescription(result, category) {
  const bracket = result.bracket;
  return `Linear interpolation places this ${category} event between the ${bracket.lowerAep} and ${bracket.upperAep} IFD curves.`;
}

function formatAriComparator(comparator) {
  if (comparator === "<") {
    return "less than ";
  }

  if (comparator === ">") {
    return "greater than ";
  }

  return "";
}
