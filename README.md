# DRRAS frontend

This repository contains the design documents for the Disaster Response Resource Allocation System and a React frontend prototype. The dashboard lets a coordinator inspect simulated scenarios on a map, add areas and resource bases, preview two allocation plans, and compare their metrics.

For how each implemented part works, start with the [implementation documentation](docs/README.md). The original requirements PDFs are in `Document/`.

**Current boundary:** the frontend is a demo. Scenario edits are stored in this browser's `localStorage`. Travel times use a synthetic straight-line estimate, and the alternative preview is not an OR-Tools solution. No FastAPI backend, PostgreSQL database, OSRM routing call, or operational dispatch connection is included. The UI labels these limits.

## Run locally

Requirements: Node.js 22 or newer and npm.

```sh
cd frontend
npm ci
npm run dev
```

Open the local URL printed by Vite. OpenStreetMap tiles require an internet connection; area and base lists remain available if tiles fail.

## Run with Docker

Requirements: Docker with the Compose plugin.

```sh
docker compose up --build -d
```

Open <http://localhost:8080>. The production build is served by Nginx, including SPA route fallback and a `/healthz` endpoint. Stop it with `docker compose down`.

The Compose file runs the frontend only. A backend service and PostGIS container should be added when their implementation and API contract exist.

## Build check

```sh
cd frontend
npm run build
```

## Project layout

- `Document/`: requirements, feasibility, use cases, data flow, analysis classes, and user stories.
- `docs/`: implementation architecture, frontend behavior, Docker setup, and change log. Update these guides as the project grows.
- `AGENT.MD`: project intent, planned architecture, constraints, and unresolved document conflicts.
- `frontend/src/App.tsx`: dashboard views, scenario forms, preview controls, and comparison.
- `frontend/src/ScenarioMap.tsx`: interactive Leaflet map.
- `frontend/src/data.ts`: simulated sample scenarios.
- `frontend/src/demo.ts`: illustrative browser-only assignment previews and metrics.
- `compose.yaml` and `frontend/Dockerfile`: frontend container setup.
