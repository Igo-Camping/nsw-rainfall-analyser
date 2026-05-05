/* Stormgrid v0 — validation.
   Run is enabled only when:
     1. State exists
     2. integrationReady (static rainfall JSON loaded)
     3. A catchment is selected
     4. The static dataset contains stats for that catchment */

export function validateRunReadiness(state) {
  if (!state) {
    return { ready: false, reasons: ['Stormgrid state not initialised.'] };
  }
  const reasons = [];
  if (!state.integrationReady) {
    reasons.push(state.rainfallError
      ? `Static rainfall not loaded (${state.rainfallError}).`
      : 'Static rainfall not loaded yet.');
  }
  if (!state.selectedCatchmentId) {
    reasons.push('No catchment selected — click a catchment on the map.');
  }
  if (state.integrationReady && state.selectedCatchmentId) {
    const data = state.rainfallData;
    const c = data && data.catchments && data.catchments[state.selectedCatchmentId];
    if (!c) {
      reasons.push(`No precomputed data for catchment ${state.selectedCatchmentId}.`);
    } else if (!c.stats || !c.stats.mean || !c.stats.mean.length) {
      reasons.push(`Empty stats series for ${state.selectedCatchmentId}.`);
    }
  }
  if (reasons.length === 0) {
    return { ready: true, reasons: [] };
  }
  return { ready: false, reasons };
}

export function isRunEnabled(state) {
  return validateRunReadiness(state).ready === true;
}
