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
