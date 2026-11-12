import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from time import perf_counter
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from psycopg import Connection, OperationalError
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

from . import allocation, repository
from .models import ImportScenario, MAX_LOCATIONS_PER_KIND, Method, NewArea, NewBase, NewScenario
from .routing import build_matrix

logger = logging.getLogger(__name__)
SAMPLES = json.loads(Path(__file__).with_name("samples.json").read_text())


@asynccontextmanager
async def lifespan(app: FastAPI):
    speed = float(os.getenv("FALLBACK_SPEED_KMH", "30"))
    penalty = int(os.getenv("UNMET_PENALTY_SECONDS", "7200"))
    if not 1 <= speed <= 200 or not 1 <= penalty <= 100_000_000:
        raise RuntimeError("Check FALLBACK_SPEED_KMH (1–200) and UNMET_PENALTY_SECONDS (1–100000000).")
    app.state.speed = speed
    app.state.penalty = penalty
    app.state.osrm_url = os.getenv("OSRM_URL", "https://router.project-osrm.org")
    with ConnectionPool(
        os.environ["DATABASE_URL"], kwargs={"row_factory": dict_row}, min_size=1, max_size=8, timeout=10,
    ) as pool:
        with pool.connection() as db:
            repository.migrate(db)
            repository.seed_samples(db, SAMPLES)
        app.state.pool = pool
        yield


app = FastAPI(title="DRRAS API", version="1.0.0", docs_url="/api/docs",
              openapi_url="/api/openapi.json", lifespan=lifespan)
api = APIRouter(prefix="/api")


def connection(request: Request):
    with request.app.state.pool.connection() as db:
        yield db


Database = Annotated[Connection, Depends(connection, scope="function")]


@app.exception_handler(OperationalError)
@app.exception_handler(PoolTimeout)
async def database_unavailable(request: Request, error: Exception):
    logger.warning("Database unavailable for %s (%s)", request.url.path, type(error).__name__)
    return JSONResponse(status_code=503, content={"detail": "The database is temporarily unavailable."})


def require_scenario(db: Connection, scenario_id: str, *, write: bool = False) -> dict:
    # Lock the parent so an edit cannot change the inputs while a matrix or run is being saved.
    query = (
        "SELECT id FROM scenarios WHERE id = %s FOR UPDATE"
        if write else "SELECT id FROM scenarios WHERE id = %s FOR SHARE"
    )
    if db.execute(query, (scenario_id,)).fetchone() is None:
        raise HTTPException(404, "Scenario not found.")
    return repository.get_scenario(db, scenario_id)


@api.get("/health")
def health(db: Database):
    db.execute("SELECT 1")
    return {"status": "ok"}


@api.get("/scenarios")
def scenarios(db: Database):
    return repository.list_scenarios(db)


@api.post("/scenarios", status_code=201)
def create_scenario(body: NewScenario, db: Database):
    scenario_id = str(uuid4())
    repository.create_scenario(db, scenario_id, body.model_dump())
    return repository.get_scenario(db, scenario_id)


@api.post("/scenarios/import")
def import_scenario(body: ImportScenario, db: Database):
    scenario_id = f"legacy-{body.id}"
    if repository.create_scenario(db, scenario_id, body.model_dump()):
        for area in body.areas:
            repository.add_area(db, scenario_id, area.model_dump(), str(uuid4()))
        for base in body.bases:
            repository.add_base(db, scenario_id, base.model_dump(), str(uuid4()))
    return repository.get_scenario(db, scenario_id)


@api.post("/scenarios/restore-samples")
def restore_samples(db: Database):
    repository.seed_samples(db, SAMPLES, restore=True)
    return repository.list_scenarios(db)


@api.get("/scenarios/{scenario_id}")
def scenario(scenario_id: str, db: Database):
    return require_scenario(db, scenario_id)


@api.post("/scenarios/{scenario_id}/areas", status_code=201)
def add_area(scenario_id: str, body: NewArea, db: Database):
    current = require_scenario(db, scenario_id, write=True)
    if len(current["areas"]) >= MAX_LOCATIONS_PER_KIND:
        raise HTTPException(422, f"Each scenario supports at most {MAX_LOCATIONS_PER_KIND} areas.")
    repository.add_area(db, scenario_id, body.model_dump(), str(uuid4()))
    repository.bump_revision(db, scenario_id)
    return repository.get_scenario(db, scenario_id)


@api.post("/scenarios/{scenario_id}/bases", status_code=201)
def add_base(scenario_id: str, body: NewBase, db: Database):
    current = require_scenario(db, scenario_id, write=True)
    if len(current["bases"]) >= MAX_LOCATIONS_PER_KIND:
        raise HTTPException(422, f"Each scenario supports at most {MAX_LOCATIONS_PER_KIND} bases.")
    repository.add_base(db, scenario_id, body.model_dump(), str(uuid4()))
    repository.bump_revision(db, scenario_id)
    return repository.get_scenario(db, scenario_id)


@api.delete("/scenarios/{scenario_id}/{kind}/{location_id}")
def remove_location(scenario_id: str, kind: Literal["areas", "bases"], location_id: str, db: Database):
    require_scenario(db, scenario_id, write=True)
    if not repository.remove_location(db, scenario_id, location_id, kind):
        raise HTTPException(404, "Location not found in this scenario.")
    repository.bump_revision(db, scenario_id)
    return repository.get_scenario(db, scenario_id)


@api.get("/scenarios/{scenario_id}/matrix")
def travel_matrix(scenario_id: str, db: Database, revision: Annotated[int | None, Query(ge=1)] = None):
    current = require_scenario(db, scenario_id)
    revision = revision or current["revision"]
    matrix = repository.load_matrix(db, scenario_id, revision)
    return {"revision": revision, "pairs": [
        {"baseId": base, "areaId": area, "seconds": travel.seconds,
         "distanceMeters": travel.distance_meters, "isFallback": travel.is_fallback}
        for (base, area), travel in matrix.items()
    ]}


@api.get("/scenarios/{scenario_id}/runs")
def runs(scenario_id: str, db: Database):
    current = require_scenario(db, scenario_id)
    revision = current["revision"]
    return {"revision": revision, "runs": repository.current_runs(db, scenario_id, revision)}


@api.get("/scenarios/{scenario_id}/runs/history")
def run_history(scenario_id: str, db: Database, limit: Annotated[int, Query(ge=1, le=100)] = 20,
                offset: Annotated[int, Query(ge=0)] = 0):
    require_scenario(db, scenario_id)
    return repository.history(db, scenario_id, limit, offset)


@api.get("/scenarios/{scenario_id}/runs/{run_id}")
def run_detail(scenario_id: str, run_id: str, db: Database):
    result = repository.get_run(db, scenario_id, run_id)
    if result is None:
        raise HTTPException(404, "Allocation run not found.")
    return result


@api.post("/scenarios/{scenario_id}/runs/{method}", status_code=201)
def run_allocation(scenario_id: str, method: Method, request: Request, db: Database):
    current = require_scenario(db, scenario_id, write=True)
    if not current["areas"] or not current["bases"]:
        raise HTTPException(422, "Add at least one affected area and one resource base first.")
    matrix = repository.load_matrix(db, scenario_id, current["revision"])
    if not matrix:
        matrix = build_matrix(current, request.app.state.osrm_url, request.app.state.speed)
        repository.save_matrix(db, current, matrix)
    elif len(matrix) != len(current["areas"]) * len(current["bases"]):
        raise HTTPException(409, "The saved travel-time matrix is incomplete.")

    penalty = request.app.state.penalty
    started = perf_counter()
    try:
        assignments = (
            allocation.baseline(current, matrix) if method == "baseline"
            else allocation.optimized(current, matrix, penalty)
        )
        runtime = (perf_counter() - started) * 1000
        allocation.validate_assignments(current, matrix, assignments)
    except allocation.AllocationError as error:
        raise HTTPException(422, str(error)) from error
    settings = {"unmetPenaltySeconds": penalty} if method == "optimized" else {}
    return repository.save_run(db, current, method, runtime, assignments,
                               allocation.metrics(current, matrix, assignments), settings)


app.include_router(api)
