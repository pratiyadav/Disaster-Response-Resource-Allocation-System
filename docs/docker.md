# Docker and local development

```sh
docker compose up --build --wait -d
docker compose ps
docker compose logs backend
docker compose down
```

Compose starts PostgreSQL/PostGIS, then the FastAPI API, then the React dashboard served by Nginx. Startup waits for PostgreSQL to accept connections and for the API to run its migrations and health check. The database uses a named volume called `database-data` within the Compose project. `docker compose down` keeps that volume. Compose uses the official PostGIS x86-64 image, so Apple Silicon runs the database with Docker Desktop emulation. [PostGIS image documentation](https://github.com/postgis/docker-postgis)

| Service | Address |
| --- | --- |
| Dashboard and proxied API | <http://localhost:8080> |
| Direct API | <http://localhost:8000/api/health> |
| Interactive API docs | <http://localhost:8080/api/docs> |
| PostgreSQL | `database:5432` on the internal Compose network |

Nginx sends `/api/` to the backend. Other paths serve the static frontend with SPA fallback. The API and frontend ports are bound to loopback. The supplied credentials are for this local demo.

Set an environment variable on the Compose command to change a default:

| Setting | Default | Effect |
| --- | --- | --- |
| `FRONTEND_PORT` | `8080` | Dashboard port on the host |
| `API_PORT` | `8000` | Direct API port on the host |
| `OSRM_URL` | `https://router.project-osrm.org` | Base URL of the OSRM server. Set it to an empty string to use the fallback for new matrices. |
| `FALLBACK_SPEED_KMH` | `30` | Speed used to convert great-circle distance to time. Allowed range is 1–200. |
| `UNMET_PENALTY_SECONDS` | `7200` | Optimizer cost for each unmet unit. Allowed range is 1–100,000,000. |

For example, `OSRM_URL='' docker compose up --build --wait -d` starts the stack with straight-line routing for new matrices. Existing scenario revisions reuse their stored matrices.

## Frontend hot reload

Start the database and API first, then run the Vite development server:

```sh
docker compose up --build --wait -d backend
cd frontend
npm ci
npm run dev
```

Open the URL printed by Vite. It proxies `/api` to port 8000. If you changed the API port, start Vite with a matching target, for example `DRRAS_API_TARGET=http://127.0.0.1:9000 npm run dev`.

For Python-only development outside Compose, install `backend/requirements.txt` in a Python 3.13 virtual environment, set `DATABASE_URL` to a PostgreSQL database with PostGIS installed, and run `uvicorn app.main:app --reload` from `backend/`. The database role needs permission to create the schema and enable PostGIS if the extension is absent.

## Inspect and back up the database

```sh
docker compose exec database psql -U drras -d drras
```

In `psql`, run `\dt` to list tables and `\d travel_matrix` to inspect one. Try:

```sql
SELECT postgis_version();
SELECT name, region, revision FROM scenarios;
SELECT scenario_id, revision, method, runtime_ms FROM runs ORDER BY created_at DESC;
```

To export a backup, run `docker compose exec -T database pg_dump -U drras -d drras > drras-backup.sql` from the repository root. Save that file somewhere you can find later.
