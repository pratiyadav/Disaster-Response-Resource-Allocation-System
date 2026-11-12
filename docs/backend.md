# Backend and database walkthrough

## What the system does

DRRAS helps a coordinator decide how many ambulances each resource base could send to each affected area in a simulated disaster. The inputs are the scenario, the locations of its bases and areas, the number of ambulances at each base, and the demand and severity of each area. The output is a set of proposed assignments and measures the coordinator can compare. Population is recorded and displayed. Demand is entered explicitly by the coordinator.

A typical demonstration goes through these steps:

1. Open the dashboard and select a sample. In **Scenario data**, show the severity-colored areas and the base markers. Each base has its own stock and each area has its own demand.
2. In **Allocations**, run the baseline. The first run requests road times from OSRM and stores one matrix row for each base and area pair. When OSRM cannot supply a pair, DRRAS saves an estimated time for that pair and labels it.
3. Run the optimizer. It reads the same matrix and the original stock. Both runs record assignments, metrics, and runtime in the database.
4. Open **Compare results** to see the two maps and the metric differences. The difference is optimized minus baseline. A smaller travel cost and a larger coverage ratio are generally desirable. One method may improve some measures while worsening others.
5. Refresh the browser and show that the results are still there. Add or remove an area or a base, then show that the dashboard requires fresh runs for the updated scenario. The previous runs remain in API history.

## Source files and ownership

| File | Responsibility |
| --- | --- |
| [app/main.py](../backend/app/main.py) | FastAPI endpoints, startup configuration, request transactions, and orchestration for a run |
| [app/models.py](../backend/app/models.py) | Input shapes, allowed severity values, coordinate ranges, and quantity validation |
| [app/repository.py](../backend/app/repository.py) | Parameterized SQL, migrations, sample loading, and queries for scenarios, matrices, and runs |
| [app/routing.py](../backend/app/routing.py) | OSRM Table request, response validation, and straight-line estimates |
| [app/allocation.py](../backend/app/allocation.py) | Baseline, OR-Tools model, plan validation, and metric formulas |
| [app/samples.json](../backend/app/samples.json) | Simulated scenarios for Hyderabad, Visakhapatnam, and New Delhi |
| [001_initial.sql](../backend/migrations/001_initial.sql) | PostGIS extension, tables, foreign keys, and database constraints |
| [api.ts](../frontend/src/api.ts) | Browser requests and API error messages |
| [App.tsx](../frontend/src/App.tsx) | Scenario editing, allocation actions, and comparison views |

## Database design

D1, D2, and D3 are the data stores named in the requirements. All three live in one PostgreSQL database.

| Store | Table | What a row represents |
| --- | --- | --- |
| D1 | `scenarios` | A named scenario, its region, sample flag, and current revision |
| D1 | `areas` | An affected location with population, severity, and ambulance demand |
| D1 | `resource_bases` | A base with a map location |
| D1 | `resources` | The number of ambulances available at one base |
| D2 | `travel_matrix` | Time in seconds, distance in meters, and fallback status for one pair at one revision |
| D3 | `runs` | One allocation execution, its method and runtime, the input snapshot, and solver settings |
| D3 | `allocations` | The positive quantity one run assigns from one base to one area |
| D3 | `metrics` | The six allocation quality measures for one run |

Locations use `geometry(Point, 4326)`. The browser sends `{ "lat": ..., "lng": ... }`. PostGIS stores a point in longitude, latitude order, so the repository calls `ST_MakePoint(lng, lat)` and reads it back with `ST_X` and `ST_Y`.

A matrix row is keyed by scenario, revision, base, and area. An allocation references a run and a matrix row for that same scenario and revision. Database checks enforce allowed severity, valid coordinate ranges, and positive or nonnegative quantities where appropriate. The backend validates each complete plan before saving, including totals per base and per area. Those totals span several rows, so they are checked together in `validate_assignments`.

Adding or removing a location increments the scenario revision. Removal marks the location inactive so historical foreign keys remain valid. A run also stores a JSON copy of the scenario inputs. That snapshot preserves the names, coordinates, quantities, and severity used by the run even if a sample is restored later. The comparison screen selects the latest saved run for each method at the current revision. Earlier revisions remain accessible through the history endpoints.

Scenario edits and allocation runs lock their scenario row in a database transaction. This ensures two requests for the same scenario agree on which revision they are using and prevents simultaneous runs from creating competing matrices. A matrix, a run, its assignments, and metrics are committed together when a new matrix is needed. An error rolls that transaction back. The planner copies the stock into its own calculations, so a proposed assignment does not change stored inventory.

On startup, FastAPI applies the SQL files in filename order. The `schema_migrations` table records which migrations ran successfully, and a PostgreSQL advisory lock prevents two startup processes from applying the same migration simultaneously. Startup inserts missing built-in samples and keeps previously saved ones.

## API reference

All paths below start with `/api`. Swagger UI at <http://localhost:8080/api/docs> lets you inspect input schemas and call endpoints from the browser.

| Method and path | Request or result |
| --- | --- |
| `GET /health` | Confirms the API can query PostgreSQL |
| `GET /scenarios` | Lists scenarios with their active areas, bases, and revisions |
| `POST /scenarios` | Accepts `name`, `region`, and optional `description` |
| `GET /scenarios/{id}` | Returns one current scenario |
| `POST /scenarios/{id}/areas` | Accepts `name`, `location`, `population`, `severity`, and `demand` |
| `POST /scenarios/{id}/bases` | Accepts `name`, `location`, and `quantity` |
| `DELETE /scenarios/{id}/areas/{areaId}` | Removes an area from the current scenario and returns the updated scenario |
| `DELETE /scenarios/{id}/bases/{baseId}` | Removes a base from the current scenario and returns the updated scenario |
| `POST /scenarios/restore-samples` | Restores the three built-in scenarios, with custom scenarios and saved runs retained |
| `POST /scenarios/import` | Imports a custom scenario from the former browser prototype. Accepts its `id`, scenario fields, and arrays of area and base inputs. The original ID makes repeated imports return the same database scenario. |
| `GET /scenarios/{id}/matrix` | Returns the saved pair list, empty until the first run. Pass `?revision=N` to inspect a historical matrix. |
| `POST /scenarios/{id}/runs/baseline` | Runs and saves the baseline, returning assignments and metrics |
| `POST /scenarios/{id}/runs/optimized` | Runs and saves the optimizer, returning assignments and metrics |
| `GET /scenarios/{id}/runs` | Returns the current revision and its latest saved run for each method |
| `GET /scenarios/{id}/runs/history` | Lists historical runs, newest first. Supports `limit` and `offset`. |
| `GET /scenarios/{id}/runs/{runId}` | Returns one saved run with its original scenario snapshot |

The API returns HTTP 404 for unknown scenarios or locations and HTTP 422 for invalid inputs or a run without both areas and bases. Each scenario accepts up to 40 active areas and 40 active bases so a single OSRM request contains at most 80 points. Demand and stock are integers from 0 through 1,000,000. Both bounds can be found in `models.py`. Database connection failures return HTTP 503 when the API is running and can detect the failure.

Try the baseline using the Hyderabad sample:

```sh
curl -X POST http://localhost:8080/api/scenarios/musi-flood/runs/baseline
curl http://localhost:8080/api/scenarios/musi-flood/matrix
curl -X POST http://localhost:8080/api/scenarios/musi-flood/runs/optimized
curl http://localhost:8080/api/scenarios/musi-flood/runs
```

Each assignment contains `baseId`, `areaId`, `quantity`, `travelMinutes`, and `isFallback`. The run's `usesFallback` reports whether its matrix contains any estimated pair, including pairs that the plan did not use.

## Routing

The routing service sends base coordinates as sources and area coordinates as destinations in one request. The result is directional, from a base to an area. The backend rounds durations to whole seconds and stores distances in meters. An unavailable endpoint, unusable response, or missing pair uses the Haversine great-circle distance. The fallback time is distance divided by a constant speed, 30 km/h by default. That value is a project modeling assumption. The dashed map lines connect the assigned endpoints. Road travel times and distances come from the matrix. [OSRM Table API](https://project-osrm.org/docs/v5.24.0/api/#table-service)

Once saved, the matrix is reused for the life of that scenario revision, including fallback pairs. This lets a comparison use identical inputs even if OSRM becomes available between runs. An input change creates a fresh revision and the next allocation creates its new matrix.

## How the two allocation methods work

**Baseline.** Visit the areas in severity order: Critical, High, Medium, Low. For each area, sort the bases by travel time and send as many units as possible from each base until the area is served or all stock is used. For equal severity or travel times, sort by the corresponding record ID so a repeated run gets the same ordering. This method is easy to explain and prioritizes severe areas. An early decision can use stock that would have reduced travel elsewhere.

**Optimizer.** OR-Tools solves a minimum-cost flow problem. A source represents the total number of units demanded. Source-to-base arcs have capacities equal to base stock. Base-to-area arcs have a per-unit cost equal to the travel time in seconds. Each area must receive flow equal to its demand. A direct arc from the source to each area represents unmet demand and costs 7,200 per missing unit by default. Flow through that direct arc becomes unmet demand in the metrics. Only base-to-area flow becomes an ambulance assignment. The solver returns whole units and the backend validates the resulting plan independently. [OR-Tools minimum-cost flow](https://developers.google.com/optimization/flow/mincostflow)

The objective, in seconds, is:

```text
sum(assigned units × travel seconds) + unmet units × penalty seconds
```

The penalty gives a cost to leaving demand uncovered. For example, with two areas demanding one ambulance each and one ambulance available, the baseline sends it to the Critical area even if it is farther away. If both routes cost less than the penalty, the optimizer may serve the closer area because the same number of units remains unmet either way. The SRS objective leaves unmet demand unweighted, so the implementation applies one penalty to all severity levels. A policy change to severity-weighted unmet demand belongs in the cost of the direct source-to-area arcs.

## Metrics

| Metric | Calculation |
| --- | --- |
| Average response time | Total unit-minutes divided by number of assigned ambulances |
| Maximum response time | Longest travel time among the assignments that send units |
| Demand coverage | Number of assigned units divided by total demand |
| Unmet demand | Total demand minus assigned units |
| Resource utilization | Number of assigned units divided by total stock |
| Total travel cost | Sum of travel minutes times assigned units, reported in unit-minutes |
| Allocation runtime | Elapsed milliseconds to build and solve the method. Routing and database work are excluded. |

The implementation uses zero for an empty denominator or an empty maximum. Response time only describes served demand, so read it alongside coverage and unmet demand.

## Sample evaluation

The first local run with the default OSRM setting returned road estimates for all 12 pairs in each scenario. These results are from the saved sample runs on November 11, 2026. Travel times can change when the routing server updates its map data.

| Scenario | Baseline coverage | Baseline travel cost | Optimized travel cost |
| --- | --- | --- | --- |
| Coastal Cyclone | 91.7% | 260.82 unit-minutes | 186.28 unit-minutes |
| Musi River Flooding | 92.3% | 170.40 unit-minutes | 131.40 unit-minutes |
| Urban Earthquake | 92.3% | 189.05 unit-minutes | 178.12 unit-minutes |

These numbers compare total travel. For a demonstration, open the two assignment maps and check which areas receive the available stock. The severity-first baseline and the optimizer can leave different areas underserved.

An isolated Compose run also verified the fallback on all three scenarios, including the pair count, stock and demand constraints, and shared travel estimates. A separate scenario confirmed input validation, an empty allocation for zero demand, and access to the old run after its area was removed. The saved results were still present after restarting PostgreSQL and FastAPI.

## Making changes later

- To change accepted inputs, update the Pydantic model, the frontend form, and any related SQL check. Add a new numbered SQL migration for a schema change so it also reaches existing databases.
- To change default sample values, edit `samples.json` and use **Restore built-in samples**. It replaces their current inputs and increments their revision.
- To change the fallback speed or optimizer penalty, set `FALLBACK_SPEED_KMH` or `UNMET_PENALTY_SECONDS` before starting Compose. See the [settings and restart commands](docker.md). Existing matrices retain their saved times. Optimized runs record the penalty they used.
- To change the algorithms, work in `allocation.py`. Afterward, run both methods on all three samples. Check that each matrix has one row per pair, every assignment stays within stock and demand, and comparison reads two runs for the same revision.
- To inspect the schema or saved runs directly, use the commands in the [Docker guide](docker.md).

The original requirements live in the [SRS](../Document/DRRAS_SRS.pdf). The [change log](changes.md) records what was implemented and checked.
