# DRRAS project guide

## Current state

DRRAS has a React/Leaflet dashboard, a FastAPI backend, a PostgreSQL/PostGIS database, OSRM matrix routing with a flagged straight-line fallback, a severity-first baseline, and an OR-Tools optimizer. The dashboard compares saved runs on the same scenario revision. Docker Compose runs the three services locally.

Start at [docs/README.md](docs/README.md) for the implementation and [docs/backend.md](docs/backend.md) for the full backend and database walkthrough. The PDFs in `Document/` remain the original coursework requirements. Update the relevant guide and `docs/changes.md` when a meaningful part changes.

## Purpose

The Disaster Response Resource Allocation System (DRRAS) is a browser-based **decision-support prototype** for a human emergency coordinator. The coordinator enters or loads a simulated disaster scenario with affected areas, their demand and severity, and resource bases with available stock. The system proposes how many units to send from each base to each area. It runs a simple severity-first, nearest-available-base baseline and a constrained optimizer on the **same scenario and travel-time matrix**, stores both runs, and compares them with the same metrics. The coordinator makes the final decision; this is not connected to real emergency services.

The project's central evaluation question is whether joint optimization improves allocation quality over the baseline, and at what computation cost. Results must be reproducible on 2-3 sample scenarios and clearly labeled as simulated suggestions.

## Source documents and precedence

- `Document/DRRAS_SRS.pdf`: primary source for scope, required behavior, data model, technology choices, constraints, and metrics.
- `Document/Disaster_Response_Use_Case_Report Final.pdf`: coordinator and OSRM interactions, normal and exception flows.
- `Document/Data Flow Diagram.pdf`: system boundary, six processes, and D1/D2/D3 flows. See the discrepancies below before using its Level 2 optimized figure.
- `Document/DRRAS_Analysis_Classes_CRC_Cards.pdf`: candidate domain objects and responsibilities; these are analysis concepts, not a mandated code class hierarchy.
- `Document/User Stories.pdf`: three-sprint delivery order and acceptance criteria.
- `Document/Feasibility Report.pdf`: feasibility and alternative technologies considered. Where it offers alternatives, use the narrower SRS choices.

If documents disagree, use the SRS as the implementation baseline, record the discrepancy, and resolve behavior that affects evaluation before coding it.

## Scope

**MVP:** one resource type (ambulances); scenario/area/base entry or sample loading; severity-colored map; travel-time matrix; baseline run; optimized run; persistent run results; side-by-side map and metrics comparison. Input severity is Low, Medium, High, or Critical. A coordinator is the only human user. OSRM is the external routing actor.

**Out of scope:** machine learning, live emergency-service integration, real-time vehicle tracking, mobile app, accounts or authentication, multiple simultaneous resource types, live traffic or weather, blocked roads, and multi-stage deployment.

## Architecture and data flow

```text
Coordinator -> React dashboard + Leaflet map -> FastAPI REST API
                                            |-> D1: scenario data
                                            |     scenarios, areas, resource_bases, resources
                                            |-> travel-time service -> OSRM (external)
                                            |                       -> D2: travel_matrix
                                            |-> baseline allocator  --+
                                            |-> optimized allocator -+-> shared metrics -> D3: runs, allocations, metrics
                                            |-> comparison service <-+               |
Coordinator <- map, assignments, metrics, comparison <-------------+

PostgreSQL + PostGIS holds D1, D2, and D3.
```

1. **Manage scenario data (process 1.0):** validate and persist a scenario, areas, bases, and their resource stock in D1.
2. **View map (2.0):** read D1 and show areas by severity and bases as markers before a run. Provide a usable list when map tiles fail.
3. **Calculate travel time (3.0):** for every base-area pair, request road time and distance from OSRM and persist the matrix in D2. On OSRM failure, use a clearly flagged straight-line fallback and notify the coordinator. Both allocators must consume the same persisted matrix.
4. **Baseline allocation (4.0):** process areas from Critical to Low; for each area, draw as much as needed from the nearest base with remaining stock, then the next-nearest, until demand is met or stock is exhausted. Compute metrics and store a `baseline` run in D3.
5. **Optimized allocation (5.0):** choose all base-to-area integer quantities jointly; minimize a configurable weighted combination of total travel cost and unmet demand, subject to base capacity, area demand, and nonnegative assignment constraints. Validate the solver result, compute the same metrics, and store an `optimized` run in D3. Failed or invalid solutions must not be recorded as successful allocations.
6. **Compare results (6.0):** read completed baseline and optimized runs for the same scenario from D3; show assignments, two maps, common metrics, per-metric differences, the better direction, and runtime. State which run is missing when a comparison cannot be made.

The baseline and optimizer must never use each other's output as input. An allocation run plans against scenario stock; it must not silently reduce the stored stock and thereby change the other method's input. Keep every run and its allocations/metrics under its scenario.

## Data model from the SRS

| Store | Tables | Main relationships |
| --- | --- | --- |
| D1 Scenario Data | `scenarios`, `areas`, `resource_bases`, `resources` | Scenario has many areas and bases; base has resource stock. Locations use PostGIS spatial types. |
| D2 Travel Time Matrix | `travel_matrix` | One travel-time/distance row per base-area pair, including `is_fallback`. |
| D3 Allocation Results | `runs`, `allocations`, `metrics` | Scenario has many runs; run has many assignments and one metrics row. `runs.method` distinguishes baseline and optimized results. |

Core domain concepts in the CRC cards are Scenario, Area, ResourceBase, Resource, MapView, TravelTimeMatrix, BaselineAllocator, OptimizedAllocator, AllocationRun, Allocation, Metrics, and Comparison. They can become database models, services, or UI components as appropriate; avoid forcing every analysis concept into a persistent table.

Validate coordinates, nonnegative population/demand/stock/assignments, allowed severity, base capacity, and area demand. Use parameterized database access and keep database credentials outside source and frontend assets.

## Technology stack

The SRS defines the core stack. The project uses React, TypeScript, Vite, Leaflet, Python/FastAPI, PostgreSQL/PostGIS, OSRM, and OR-Tools. Docker Compose runs the database, API, and Nginx frontend.

| Layer | Implementation | Why it fits |
| --- | --- | --- |
| Frontend | React with TypeScript and Leaflet | Browser dashboard, forms, severity map, result and comparison views. TypeScript is an implementation choice; the SRS names React and Leaflet. |
| API and application services | Python with FastAPI | REST/JSON boundary for scenario, travel-time, allocation, and comparison processes. |
| Optimization | Google OR-Tools, using integer decision variables | Free Python solver suitable for indivisible resource units and explicit capacity/demand constraints. The SRS also permits PuLP. |
| Database | PostgreSQL with PostGIS | Persistent scenarios, spatial locations, matrix, runs, and metrics. |
| Routing and map data | OSRM over OpenStreetMap; Leaflet with OpenStreetMap tiles | Road travel times from an external routing service and browser map display. |
| Routing fallback | Straight-line geodesic distance with a documented time estimate | Keeps a run possible when OSRM fails; the conversion assumption and accuracy must be disclosed. |

### Source layout

- `frontend/src/App.tsx` owns the dashboard views and `frontend/src/api.ts` calls the API.
- `frontend/src/ScenarioMap.tsx` owns Leaflet map rendering.
- `backend/app/main.py` defines API endpoints and coordinates database transactions.
- `backend/app/repository.py` contains parameterized database queries and migration logic.
- `backend/app/routing.py` builds a matrix and records fallback provenance.
- `backend/app/allocation.py` implements both methods and their shared metrics.
- `backend/migrations/` defines and evolves the PostgreSQL schema.

## Evaluation and implementation order

1. **Sprint 1:** schema and backend scenario management; scenario/area/base forms; map with severity colors and base markers.
2. **Sprint 2:** persisted matrix and OSRM fallback; severity-first baseline; assignments and common metrics.
3. **Sprint 3:** optimizer, solution validation, side-by-side comparison; run both methods on 2-3 sample scenarios and record results.

For both methods, report average and maximum response time, coverage ratio, unmet demand, resource utilization, and total travel cost. Show computation or solver runtime alongside allocation quality. Verify at least capacity/demand constraints, matrix completeness, independent runs, persistent result retrieval, and comparison on identical inputs.

## Document conflicts and implementation decisions

- The `Data Flow Diagram.pdf` Level 2 **Optimized** figure repeats the baseline chain and labels. Use SRS process 5.1-5.5 (build model, solve, validate, calculate metrics, store) as the intended optimizer flow.
- The use-case report includes `DR-007 Test Scenarios`, while the SRS calls sample-scenario runs project testing rather than a user-facing use case. Build sample data and evaluation; do not add a separate product feature solely from DR-007.
- A CRC card says a resource base reduces stock when resources are sent, but the SRS requires independent baseline and optimized runs on identical stock. Treat runs as plans against unchanged scenario stock unless a future operational deployment feature is explicitly specified.
- The SRS narrative suggests the optimizer can favor more severe areas, but its stated objective contains only travel cost and **unweighted** unmet demand. The optimizer uses the unweighted SRS objective, with a configurable penalty per unmet unit. The baseline gives priority to severity.
- Average response time is weighted by assigned units. Maximum response time considers the used pairs. The fallback divides the great-circle distance by a configurable speed. The walkthrough documents the formulas.
- Changes to inputs create a new scenario revision. Current comparison uses runs for that revision, and historical matrices, runs, and input snapshots remain readable through the API.
