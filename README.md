# Disaster Response Resource Allocation System

DRRAS is a decision-support prototype for a coordinator planning ambulance allocations in simulated disasters. The dashboard maps affected areas and resource bases, runs a severity-first baseline and a constrained optimizer, and compares their saved results. The coordinator reviews the proposed assignments.

## Start the application

Install Docker with Compose, then run from the repository root:

```sh
docker compose up --build --wait -d
```

- Dashboard at <http://localhost:8080>
- Interactive API documentation at <http://localhost:8080/api/docs>
- Database readiness at <http://localhost:8080/api/health>

Select one of the three simulated scenarios. Run **Baseline** and **Optimized**, then open **Compare results**. The matrix is created on the first run. The dashboard flags straight-line estimates when road data is unavailable. OpenStreetMap tiles require internet access.

Open **Travel matrix** to inspect routing estimates, **Allocations** to see unmet ambulance demand by area, and **Run history** to revisit plans from earlier scenario revisions.

Stop the stack with `docker compose down`. The named database volume keeps scenarios and results across restarts.

## Project guide

- [Backend and database walkthrough](docs/backend.md) explains the workflow, schema, API, solver, and how to modify the implementation.
- [Frontend behavior](docs/frontend.md) describes the dashboard and its API integration.
- [Docker and local development](docs/docker.md) covers ports, settings, startup, and logs.
- [Change log](docs/changes.md) records the implementation and its verification.
- [Original requirements](Document/DRRAS_SRS.pdf) describe the intended coursework scope.

Run `npm ci` and `npm run build` in `frontend/` to check the frontend. To work with hot reload while using the Compose backend, follow the [local development steps](docs/docker.md#frontend-hot-reload).
