/* Stormgrid v0 — validation.
   The Run button must stay disabled until a real data integration
   is wired in. v0 always reports notReady with a clear reason. */

export function validateRunReadiness(state) {
  if (!state) {
    return { ready: false, reasons: ['Stormgrid state not initialised.'] };
  }
  if (!state.integrationReady) {
    return {
      ready: false,
      reasons: [
        'Live data integration is not connected (v0 shell).',
        'Stormgauge AEP/IFD/station/radar/export logic remains untouched.',
      ],
    };
  }
  return { ready: false, reasons: ['Run gating not yet implemented.'] };
}

export function isRunEnabled(state) {
  return validateRunReadiness(state).ready === true;
}
