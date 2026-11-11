# Frontend behavior

## Ownership and entry point

The frontend is a React 19 + TypeScript + Vite app in `frontend/`. `src/main.tsx` mounts `App.tsx` and imports Leaflet and application styles. `App.tsx` owns navigation, scenario editing, browser state, preview actions, result tables, and comparison. `ScenarioMap.tsx` owns the Leaflet instance and map layers. Domain types are in `types.ts`, sample scenarios in `data.ts`, and browser-only preview calculations in `demo.ts`.

Install and run it with `cd frontend`, `npm ci`, then `npm run dev`. `npm run build` runs TypeScript checking and creates `frontend/dist/`.

## Screens

| Screen | Current behavior |
| --- | --- |
| Overview | Shows area/base counts, supply, demand, baseline preview coverage, map, severity-ordered areas, and preview actions. |
| Scenario data | Creates a scenario; adds or removes areas and bases; shows coordinates, severity, stock, and map markers. |
| Allocations | Runs or reruns a baseline or alternative browser preview; shows assignments, routes, metrics, and measured browser preview runtime. |
| Compare results | Requires both previews for the selected scenario; shows two maps and metric values, differences, and better directions. |

The scenario selector in the page header switches the active scenario. The layout has a sidebar on desktop and a menu on small screens.

## Scenario inputs and storage

Each scenario has an ID, name, region, description, areas, bases, and a `sample` flag. An area has coordinates, population, severity (`Critical`, `High`, `Medium`, or `Low`), and demand. A base has coordinates and the available ambulance quantity. Forms require names, nonnegative whole-number quantities, and coordinates within latitude `-90..90` and longitude `-180..180`.

Scenario edits are saved under `drras-scenarios-v1` in the current browser's `localStorage`. There is no cross-browser synchronization or database persistence. The **Restore built-in samples** action replaces the sample scenarios while keeping custom scenarios. Any area/base edit removes both previews for that scenario, so a new comparison needs fresh runs.

## Map behavior

`ScenarioMap.tsx` creates a Leaflet map with OpenStreetMap tiles. Areas appear as severity-colored circles, bases as `✚` markers, and positive assignments as dashed base-to-area lines. Popups show the name and relevant quantity. The map fits the current scenario's coordinates; when no locations exist it centers on India. A tile request error displays a notice. The scenario page and overview still show the location lists when tiles are unavailable.

Tiles require internet access. OSRM routing is **not** called by the frontend. The dashed assignment lines connect coordinates directly and are not road routes.

## Preview calculations

`demo.ts` exists to make the UI usable while the backend is absent. It first computes great-circle distance between a base and an area, then estimates minutes as `6 + distance_km × 3.4`, rounded to one decimal. This is an invented preview formula, not a road-time or emergency-time model.

- **Baseline preview:** sort areas Critical to Low; for each, take units from the nearest base with remaining stock, moving to the next-nearest until demand is met or stock runs out.
- **Alternative preview:** sort all base/area pairs by estimated travel time and assign available units to the shortest pairs first. It is a nearest-pair heuristic, **not** the specified constrained optimizer or an OR-Tools result. The internal method key is `optimized` so the intended API shape can be retained later; the UI calls it an alternative preview.
- Both previews start from the same scenario stock and use the same synthetic travel function. Neither changes stored base quantities or reads the other method's assignments.

The current metrics are calculated from assigned units: average response time is total estimated unit-minutes divided by units sent; maximum response time is the largest assigned pair time; coverage is units sent divided by total demand; unmet demand is total demand minus units sent; utilization is units sent divided by total stock; total travel cost is the sum of estimated minutes times units sent. Browser preview runtime is measured with `performance.now()`. A zero-demand or zero-stock denominator produces `0` in the demo. These formulas are **demo definitions**; the SRS leaves some evaluation details open, especially unserved areas and severity weighting.

## Known limits and next integration step

No login, server persistence, database validation, routing service, solver, or dispatch workflow is present. Preview runs disappear on reload, while scenario edits remain in this browser. The backend should own validation and calculation once introduced. Before wiring it in, define request/response types for scenarios, runs, assignments, travel-matrix provenance, errors, and comparison; then move `App.tsx` state operations behind an API client.
