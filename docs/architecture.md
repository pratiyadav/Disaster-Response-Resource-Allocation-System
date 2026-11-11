# Architecture and current system boundary

## Status

DRRAS is intended to become a browser-based decision-support system for a human coordinator. At present, **only the frontend prototype exists**. It renders simulated scenarios, edits scenario data in browser storage, produces illustrative allocation previews in the browser, and compares those previews. There is no API, persistent database, OSRM call, or OR-Tools solver yet. See [frontend.md](frontend.md) for the current behavior.

## Current component flow

```text
Built-in simulated scenarios (frontend/src/data.ts)
                    |
                    v
React application (frontend/src/App.tsx) <--> browser localStorage
       |                       |
       |                       +--> preview calculations (frontend/src/demo.ts)
       |                                      |
       |                                      +--> assignments and metrics in React state
       v
Leaflet map (frontend/src/ScenarioMap.tsx) --> OpenStreetMap tiles over the internet
```

`frontend/src/types.ts` defines the Scenario, Area, ResourceBase, Assignment, Metrics, and AllocationRun shapes shared by these parts. The UI and sample data use one resource type: ambulances. `frontend/src/styles.css` controls the responsive layout. Vite builds static files; Docker serves them with Nginx.

## Data lifecycle now

1. On load, the app reads the `drras-scenarios-v1` key from browser `localStorage`, or uses the three sample scenarios from `data.ts` if none are stored. The samples cover simulated cases in Hyderabad, Visakhapatnam, and Delhi.
2. The coordinator selects a scenario and can create a new scenario or add/remove its affected areas and resource bases. Changes to the scenario list are saved back to `localStorage` in that browser.
3. Editing an area or base clears the current scenario's preview runs in React state. This keeps the two methods from being compared against different inputs.
4. Running a preview calls `createPreviewRun` in `demo.ts`. The resulting run is held in React state under its scenario ID and method. Runs are recreated for built-in samples on page load; preview runs themselves are **not persisted**.
5. The allocation and comparison screens read the current runs. Map tiles are requested directly by Leaflet; the map displays a notice if a tile request fails, and area/base lists remain available.

## Intended backend architecture

The SRS in `Document/DRRAS_SRS.pdf` calls for a React/Leaflet frontend, a Python/FastAPI REST API, PostgreSQL with PostGIS, OSRM routing, and OR-Tools or PuLP optimization. In that design, the backend manages D1 scenario data, D2 travel-time matrix, and D3 allocation results. Baseline and optimized methods must use the same scenario and matrix and must not feed into each other. The browser's `demo.ts` is a temporary preview boundary, not the implementation of that backend design.

When the backend is built, define and document its API contract, replace browser-local scenario and run operations with API calls, and keep the presentation components separate from server decisions. The Compose file currently contains only the frontend service; add backend and database services when those implementations exist.

## Source of truth

The PDFs under `Document/` describe requirements. [`../AGENT.MD`](../AGENT.MD) lists document conflicts and open decisions, including severity weighting, exact metric definitions, and scenario/matrix revision handling. Resolve those before presenting preview figures as operational or scientific evaluation results.
