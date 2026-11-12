# Architecture and data flow

The browser dashboard uses React and Leaflet. It sends JSON over HTTP to FastAPI through Nginx in Docker, or through Vite during frontend development. FastAPI uses Psycopg to query PostgreSQL/PostGIS. The backend calls OSRM for road travel estimates and uses OR-Tools for the optimized allocation.

1. **Scenario data (D1).** The API validates and persists areas, bases, and ambulance stock. Leaflet reads their coordinates from the scenario response and requests background tiles from OpenStreetMap.
2. **Travel-time matrix (D2).** The first allocation at a scenario revision loads pairwise road times from OSRM, fills gaps with flagged estimates, and saves the matrix. Both methods use those same rows.
3. **Allocation results (D3).** A run evaluates the current revision independently. It saves the input snapshot, method, assignments, metrics, and runtime. The dashboard reads the latest run for each method at the current revision and computes the display differences.

The three stores share one database. Scenario revisions keep changed inputs and older results distinguishable. The PostGIS points are the persisted coordinates. The Leaflet assignment links visualize endpoints, and the matrix stores travel durations and distances.

See the [backend walkthrough](backend.md) for table relationships, transaction boundaries, and implementation details. The [SRS](../Document/DRRAS_SRS.pdf) defines the coursework requirements.
