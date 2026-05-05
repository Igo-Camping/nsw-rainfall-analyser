/* Stormgrid bridge — safe stub.
   The old Stormgrid SPA tab now redirects to the standalone shell at
   /stormgrid/. Kept as the import target of index.html so the SPA's
   module script does not fail. No imports, no side effects on init. */

export function init() {
  // no-op
}

export function show() {
  // redirect to new standalone page
  window.location.href = '/stormgrid/';
}

export function hide() {
  // no-op
}

export default {
  init,
  show,
  hide,
};
