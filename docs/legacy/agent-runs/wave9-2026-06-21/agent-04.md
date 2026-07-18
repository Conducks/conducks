# Agent 04 — DF5 Governance Dashboard (Wave 9)

## Task
Add governance visibility to the mirror web UI: new `/api/governance` endpoint and a Governance tab in the sidebar.

## Files Modified

### `src/interfaces/web/mirror-server.ts`
- Added `import { registry } from '@/registry/index.js'`
- Added `GET /api/governance` endpoint that calls:
  - `registry.audit.audit()` — returns `{ violations, stats }` (sync)
  - `registry.audit.advise()` — returns `Advice[]` recommendations (async)
  - Response: `{ violations, recommendations, stats, timestamp }`

### `src/resources/mirror/index.html`
- Added `dock-governance` button to rail nav (shield SVG icon, placed between Trace and the rail spacer)
- Added `slate-governance` panel with `id="governance-panel"` body div

### `src/resources/mirror/ui.js`
- Extended dock navigation click handler to call `loadGovernance()` when `dock-governance` is activated
- Added `loadGovernance()` async function (DOM-only, no innerHTML with dynamic data):
  - Fetches `/api/governance`
  - Renders Violations section: severity badge + message per violation
  - Renders Recommendations section: priority badge + message per recommendation (capped at 20)
  - Renders Stats footer: audit stats in metric pills grid
  - Error state handled with safe text node

## Outcome
- `npx tsc --noEmit` — clean, no errors
- XSS fix from wave 1 preserved: all dynamic content uses `textContent` / `createElement`
- Governance state is loaded on-demand (when tab is clicked), not on page load
