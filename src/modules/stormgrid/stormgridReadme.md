# Stormgrid v0 — Shell

Isolated smart-default workflow scaffold. **No real analysis. No fake rainfall data. Run is disabled.**

## Scope of v0

- Editable assumption cards (Area, Rainfall event, Rainfall source, Gauges, Durations, IFD/AEP, Outputs).
- Each card carries: value, reason, confidence, status (`default` | `manually-changed`), and an Edit affordance.
- Run button is disabled until a real data integration is wired (`state.integrationReady === true`).
- Pure DOM render; no network calls; no imports from Stormgauge logic.

## Files

| File | Purpose |
|---|---|
| `stormgridState.js`        | State container, card keys, status/confidence enums |
| `stormgridDefaults.js`     | Smart-default factory — returns null values, never invents data |
| `stormgridReviewModel.js`  | Pure transform: state + defaults → card view-models |
| `stormgridValidation.js`   | Run-readiness gate — always returns `ready: false` in v0 |
| `stormgridUi.js`           | DOM mount with `mountStormgridShell(hostEl)` |
| `stormgridReadme.md`       | This file |

## Mount

```js
import { mountStormgridShell } from './src/modules/stormgrid/stormgridUi.js';
const handle = mountStormgridShell(document.getElementById('stormgrid-host'));
// handle.state, handle.rerender(), handle.destroy()
```

The shell is **not** mounted in `index.html`. Wire-up will land in a follow-up branch
once a staging route is agreed.

## Hands-off list (do NOT touch from this module)

- `src/modules/exports/*` — Stormgauge export logic
- `src/modules/map/*` — Stormgauge map init/layers
- `src/modules/radar/*` — BOM/RainViewer radar
- `src/modules/stations/*` — gauge loader/markers
- `src/modules/ui/*` — Stormgauge controls/theme
- `index.html` AEP/IFD/station/radar/export wiring
- All logo assets — reuse only, never recreate

## Branch

- Feature branch: `feature/stormgrid-v0-shell`
- Branched from: `hotfix/nbc-relining-map-linework` (production)
- Staging only — not deployed to nbc.pluviometrics.com.au or root site until reviewed.
