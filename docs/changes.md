# Implementation change log

Keep a short entry here when a meaningful part of the application is added or changed. Link to the guide that explains its behavior. This is a project work log, not a copy of the requirements PDFs.

## 2026-11-11 — Project analysis and guide

- Reviewed the six project PDFs, recorded the goal, intended stack, data stores, workflows, and source conflicts in [`../AGENT.MD`](../AGENT.MD).
- The original PDFs are now grouped under `Document/`.

## 2026-11-11 — Frontend prototype

- Added React/TypeScript/Vite dashboard with scenario forms, Leaflet map, browser-local sample data, illustrative allocation previews, metrics, and comparison. See [frontend.md](frontend.md).
- Added a production build served by Nginx and a frontend-only Compose service. See [docker.md](docker.md).
- Verified `npm run build`, the desktop and mobile layouts, and the flow from creating a scenario through adding an area and base to comparing two previews. Docker execution was unavailable.

## 2026-11-11 — Documentation structure

- Added this `docs/` folder with an index, architecture, frontend, and Docker guides so later implementation work has a clear place to record behavior and verification.

## 2026-11-11 — Persistent backend and allocation

- Added FastAPI, PostgreSQL/PostGIS, startup migrations, and the eight application tables for scenarios, travel times, and results. The dashboard saves inputs to the API and can import custom scenarios from the former browser prototype.
- Added OSRM matrix routing, a straight-line fallback, the severity-first baseline, and OR-Tools minimum-cost flow. Both methods share one matrix per scenario revision and persist their assignments, metrics, and runtime. Scenario edits retain historical runs and their input snapshots.
- Updated Docker Compose and the Nginx and Vite proxies. Documented the schema, endpoints, formulas, design decisions, demo steps, and maintenance in the [backend walkthrough](backend.md).
- Verified the TypeScript production build, Compose startup, live OSRM and forced fallback on all three samples, concurrent runs, validation, legacy import, and saved results after restarting the database and API. Opened the saved comparison in the browser.

## 2026-11-12 — Run history and routing review

- Added dashboard views for saved allocation runs and the current revision's travel matrix. Run history opens each run with its original scenario snapshot. The matrix can be filtered by affected area and estimate source.
- Added an area coverage breakdown to current and historical allocation results. See [frontend.md](frontend.md).
