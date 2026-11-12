# Frontend behavior

The React and TypeScript app runs in the browser. `main.tsx` mounts `App.tsx`, which owns navigation, forms, the selected scenario, and current run results. `ScenarioMap.tsx` owns Leaflet and `api.ts` sends requests to FastAPI through the same origin. The database is the source of truth for scenarios and runs.

- **Overview** shows demand, supply, current baseline coverage, and the selected scenario's map.
- **Scenario data** creates scenarios and adds or removes areas and bases. The map uses severity colors for areas and a separate marker for each base. A list remains usable if OpenStreetMap tiles fail to load.
- **Travel matrix** lists the saved travel times and distances for the selected scenario revision. Filter by affected area and estimate source to distinguish OSRM road estimates from straight-line fallback estimates. Run either allocation method first to generate the matrix.
- **Allocations** runs either method and shows the saved assignments, travel estimates, metrics, and runtime. The area coverage table shows how many ambulances each area needed and received, including areas that received zero.
- **Compare results** shows the latest baseline and optimized runs for the scenario's current revision. The difference is optimized minus baseline. The map's dashed lines connect assigned bases and areas.
- **Run history** lists saved runs across scenario revisions, newest first. Open a run to see its original map, assignments, area coverage, and metrics.

After an input changes, the API returns the new revision. The frontend loads runs for that revision, keeping older results out of the current comparison. Run history retrieves each run with the scenario snapshot saved when the run completed, so locations removed later still appear in the original plan. Loading and request errors appear in the dashboard.

If the earlier prototype saved custom scenarios on the dashboard's current browser origin, **Import custom browser scenarios** appears in **Scenario data**. Import copies the scenarios, areas, and bases into the database. The browser retains the original data. Repeating the import uses the original scenario IDs to find the same database records. The old prototype's browser previews were temporary, so the backend generates new runs.

See the [backend walkthrough](backend.md) for the API, schema, solver, and metric formulas.
