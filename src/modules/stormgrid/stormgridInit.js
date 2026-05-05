/* Stormgrid bridge — safe stub.
   Stormgrid is its own repo + domain now (Igo-Camping/stormgrid →
   stormgrid.pluviometrics.com.au). The SPA tab redirects there.
   This file stays as the import target of index.html so the SPA's
   module script does not fail. No imports, no side effects on init. */

const STORMGRID_URL = 'https://stormgrid.pluviometrics.com.au/';

export function init() {
  // no-op
}

export function show() {
  // redirect to standalone Stormgrid site
  window.location.href = STORMGRID_URL;
}

export function hide() {
  // no-op
}

export default {
  init,
  show,
  hide,
};
